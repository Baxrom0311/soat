package uz.boos.nursecall

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean
import android.os.Handler
import android.os.Looper

/**
 * Carries the nurse's session from the phone to the ward watch.
 *
 * The watch can sign in on its own, but typing an email address and a password
 * on a 45mm screen is a genuinely bad minute of somebody's day, and it is a
 * minute that recurs: these are shared watches handed from one shift to the
 * next, and whoever ends up holding it is the person the history will name.
 * Sending the token over Bluetooth means the nurse signs in once, on the phone,
 * and the watch follows.
 *
 * The previous app generation did this; the Flutter rewrite dropped it, so since
 * then every watch has had to be signed in by hand -- which is also why one
 * clinic's entire call history is attributed to a single shared watch account.
 *
 * The protocol is unchanged from that generation so the watch build already in
 * the field keeps working: a message on /soat/auth_token whose body is the token,
 * or empty to sign the watch out.
 */
object WearBridge {
    private const val TOKEN_PATH = "/soat/auth_token"
    private const val TAG = "WearBridge"

    /**
     * A bonded but unreachable watch -- radio asleep, data-layer handshake never
     * completing -- can leave the underlying Play Services task pending forever
     * with no callback at all. Without a deadline the Dart future never
     * completes and whatever is awaiting it waits for the rest of the shift.
     */
    private const val SEND_TIMEOUT_MS = 10_000L

    /** Display names of the watches currently reachable over Bluetooth. */
    fun connectedWatches(context: Context, result: MethodChannel.Result) {
        Wearable.getNodeClient(context).connectedNodes
            .addOnSuccessListener { nodes -> result.success(nodes.map { it.displayName }) }
            .addOnFailureListener { e ->
                Log.w(TAG, "connectedNodes failed", e)
                // An empty list, not an error: "no watch" and "could not ask"
                // look the same to the nurse, and both mean the same thing --
                // nothing to send to right now.
                result.success(emptyList<String>())
            }
    }

    /**
     * Sends [token] to every connected watch. An empty string signs them out.
     *
     * Succeeds if *any* watch took it. A ward with two watches where one is flat
     * in a drawer should not report failure because of the one in the drawer.
     */
    fun sendToken(context: Context, token: String, result: MethodChannel.Result) {
        val settled = AtomicBoolean(false)
        val main = Handler(Looper.getMainLooper())

        fun finish(ok: Boolean) {
            if (settled.compareAndSet(false, true)) result.success(ok)
        }

        val timeout = Runnable {
            Log.w(TAG, "sendToken timed out after $SEND_TIMEOUT_MS ms")
            finish(false)
        }
        main.postDelayed(timeout, SEND_TIMEOUT_MS)

        val messages = Wearable.getMessageClient(context)
        Wearable.getNodeClient(context).connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    main.removeCallbacks(timeout)
                    finish(false)
                    return@addOnSuccessListener
                }
                val payload = token.toByteArray(StandardCharsets.UTF_8)
                var remaining = nodes.size
                var anySucceeded = false
                nodes.forEach { node ->
                    messages.sendMessage(node.id, TOKEN_PATH, payload)
                        .addOnCompleteListener { task ->
                            if (task.isSuccessful) {
                                anySucceeded = true
                            } else {
                                Log.w(TAG, "send to ${node.displayName} failed", task.exception)
                            }
                            remaining -= 1
                            if (remaining == 0) {
                                main.removeCallbacks(timeout)
                                finish(anySucceeded)
                            }
                        }
                }
            }
            .addOnFailureListener { e ->
                Log.w(TAG, "connectedNodes failed", e)
                main.removeCallbacks(timeout)
                finish(false)
            }
    }
}
