package uz.boos.nursecall

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * A door to the settings Android will not let an app change for itself.
 *
 * Notification channel properties -- importance, sound, whether it overrides Do Not
 * Disturb -- are fixed when the channel is created and are the user's from then on.
 * An in-app toggle for them would be a lie: it would move and change nothing. So the
 * app reports what the system actually says and offers a route to where the controls
 * really live.
 */
class MainActivity : FlutterActivity() {
    private val channel = "uz.boos.nursecall/settings"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "openChannelSettings" -> {
                        val id = call.argument<String>("channelId")
                        openNotificationSettings(id)
                        result.success(true)
                    }
                    "notificationState" -> result.success(notificationState())
                    else -> result.notImplemented()
                }
            }
    }

    /** Deep-links to the channel itself where possible; falls back to the app's
     *  notification screen on older releases and if the channel is not there yet. */
    private fun openNotificationSettings(channelId: String?) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val intent = if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            channelId != null &&
            manager.getNotificationChannel(channelId) != null
        ) {
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                .putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
        } else {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        }
        startActivity(intent)
    }

    /**
     * What the system will actually do with an alert, not what the app asked for.
     *
     * Three things can each silence a call on their own and none of them is visible
     * from inside the app without asking: notifications switched off for the app,
     * the channel muted or lowered after the fact, and -- the one that bites on a
     * ward phone -- Do Not Disturb, which silences even the alarm channel unless the
     * app has been allowed through.
     */
    private fun notificationState(): Map<String, Any> {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val state = mutableMapOf<String, Any>(
            "appEnabled" to manager.areNotificationsEnabled(),
            "channelExists" to false,
            "channelImportance" to -1,
            "dndActive" to false,
            "canBypassDnd" to true,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = manager.getNotificationChannel("nursecall_calls")
            if (ch != null) {
                state["channelExists"] = true
                state["channelImportance"] = ch.importance
                state["canBypassDnd"] = ch.canBypassDnd()
            }
            state["dndActive"] =
                manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL
        }
        return state
    }
}
