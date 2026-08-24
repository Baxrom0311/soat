package uz.boos.nursecall

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean

private const val TOKEN_PATH = "/soat/auth_token"
private const val TAG = "WearSyncDebug"

// A bonded-but-unreachable watch (radio stuck, data-layer handshake never completes)
// can leave the underlying Play Services Task pending forever with no callback ever
// firing. Without a deadline here, the JS promise -- and any UI awaiting it -- hangs
// permanently. This bounds every sendToken() call to a resolved outcome.
private const val SEND_TIMEOUT_MS = 10000L

class WearSyncModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "WearSync"

    @ReactMethod
    fun isWatchConnected(promise: Promise) {
        Wearable.getNodeClient(reactApplicationContext).connectedNodes
            .addOnSuccessListener { nodes -> promise.resolve(nodes.isNotEmpty()) }
            .addOnFailureListener { promise.resolve(false) }
    }

    @ReactMethod
    fun sendToken(token: String, promise: Promise) {
        val resolved = AtomicBoolean(false)
        val mainHandler = Handler(Looper.getMainLooper())

        fun resolveOnce(value: Boolean) {
            if (resolved.compareAndSet(false, true)) {
                promise.resolve(value)
            }
        }

        val timeoutRunnable = Runnable {
            Log.e(TAG, "sendToken timed out after ${SEND_TIMEOUT_MS}ms, resolving false")
            resolveOnce(false)
        }
        mainHandler.postDelayed(timeoutRunnable, SEND_TIMEOUT_MS)

        val messageClient = Wearable.getMessageClient(reactApplicationContext)
        Wearable.getNodeClient(reactApplicationContext).connectedNodes
            .addOnSuccessListener { nodes ->
                Log.d(TAG, "connectedNodes: ${nodes.map { "${it.displayName}(${it.id}, nearby=${it.isNearby})" }}")
                if (nodes.isEmpty()) {
                    mainHandler.removeCallbacks(timeoutRunnable)
                    resolveOnce(false)
                    return@addOnSuccessListener
                }
                val payload = token.toByteArray(StandardCharsets.UTF_8)
                var remaining = nodes.size
                var anySucceeded = false
                nodes.forEach { node ->
                    messageClient.sendMessage(node.id, TOKEN_PATH, payload)
                        .addOnCompleteListener { task ->
                            if (task.isSuccessful) {
                                anySucceeded = true
                                Log.d(TAG, "sendMessage OK to ${node.displayName}")
                            } else {
                                Log.e(TAG, "sendMessage FAILED to ${node.displayName}", task.exception)
                            }
                            remaining -= 1
                            if (remaining == 0) {
                                mainHandler.removeCallbacks(timeoutRunnable)
                                resolveOnce(anySucceeded)
                            }
                        }
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "connectedNodes FAILED", e)
                mainHandler.removeCallbacks(timeoutRunnable)
                resolveOnce(false)
            }
    }
}
