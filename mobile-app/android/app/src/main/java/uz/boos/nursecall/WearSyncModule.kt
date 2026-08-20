package uz.boos.nursecall

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets

private const val TOKEN_PATH = "/soat/auth_token"

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
        val messageClient = Wearable.getMessageClient(reactApplicationContext)
        Wearable.getNodeClient(reactApplicationContext).connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    promise.resolve(false)
                    return@addOnSuccessListener
                }
                val payload = token.toByteArray(StandardCharsets.UTF_8)
                var remaining = nodes.size
                var anySucceeded = false
                nodes.forEach { node ->
                    messageClient.sendMessage(node.id, TOKEN_PATH, payload)
                        .addOnCompleteListener { task ->
                            if (task.isSuccessful) anySucceeded = true
                            remaining -= 1
                            if (remaining == 0) promise.resolve(anySucceeded)
                        }
                }
            }
            .addOnFailureListener { promise.resolve(false) }
    }
}
