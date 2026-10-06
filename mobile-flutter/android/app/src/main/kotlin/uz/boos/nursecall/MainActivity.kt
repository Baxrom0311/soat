package uz.boos.nursecall

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
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
    private val wearChannel = "uz.boos.nursecall/wear"
    private val alarmChannel = "uz.boos.nursecall/alarm"

    private var mediaPlayer: MediaPlayer? = null
    private var isAlarmPlaying = false

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

        // Alarm channel for continuous alarm sound and vibration until acknowledged
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, alarmChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "startAlarm" -> {
                        startContinuousAlarm()
                        result.success(true)
                    }
                    "stopAlarm" -> {
                        stopContinuousAlarm()
                        result.success(true)
                    }
                    "isAlarmPlaying" -> {
                        result.success(isAlarmPlaying)
                    }
                    else -> result.notImplemented()
                }
            }

        // Separate channel from the settings one: this talks to another device
        // over Bluetooth and can block for seconds, while the settings calls are
        // local and instant. Keeping them apart stops a sleeping watch from
        // holding up a screen that is only asking about notifications.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, wearChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "connectedWatches" -> WearBridge.connectedWatches(this, result)
                    "sendToken" -> WearBridge.sendToken(
                        this,
                        call.argument<String>("token") ?: "",
                        result,
                    )
                    else -> result.notImplemented()
                }
            }
    }

    private fun startContinuousAlarm() {
        if (isAlarmPlaying) return
        isAlarmPlaying = true

        try {
            val alarmUri: Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            mediaPlayer?.release()
            mediaPlayer = MediaPlayer().apply {
                setDataSource(applicationContext, alarmUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        try {
            val pattern = longArrayOf(0, 1000, 600, 1000, 600)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createWaveform(pattern, 0)
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(pattern, 0)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopContinuousAlarm() {
        if (!isAlarmPlaying && mediaPlayer == null) return
        isAlarmPlaying = false

        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.release()
            }
            mediaPlayer = null
        } catch (e: Exception) {
            e.printStackTrace()
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.cancel()
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                vibrator?.cancel()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        stopContinuousAlarm()
        super.onDestroy()
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
