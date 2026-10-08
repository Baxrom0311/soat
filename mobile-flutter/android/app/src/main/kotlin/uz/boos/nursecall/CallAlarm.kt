package uz.boos.nursecall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * The call channel, created natively so it exists -- with its sound -- before
 * Flutter, Firebase or the nurse's first push ever touch it.
 *
 * Its sound is the one sound setting in the app. The nurse changes it where
 * Android keeps it (Settings > Apps > NurseCall > Notifications > Bemor
 * chaqiruvlari > Sound), and both the push notifications and the alarm that
 * keeps ringing while a call waits play whatever is chosen there. A second,
 * in-app picker would only be a way for the two to disagree.
 */
object CallChannel {
    /**
     * v2 because channel settings are frozen at creation: the original
     * "nursecall_calls" channel was made with the system default sound, and the
     * only way to give existing installs the new default is a new id.
     * Must match callsChannelId in lib/push/push_service.dart.
     */
    const val ID = "nursecall_calls_v2"
    private const val LEGACY_ID = "nursecall_calls"

    fun defaultSound(context: Context): Uri =
        Uri.parse(
            "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.nursecall_chime}"
        )

    private val alarmAttributes: AudioAttributes =
        AudioAttributes.Builder()
            // The alarm stream is the one Android still plays on silent and
            // vibrate, which is where a ward phone spends its shift.
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(ID) == null) {
            val channel = NotificationChannel(ID, "Bemor chaqiruvlari", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Palatadan kelgan chaqiruvlar"
                setSound(defaultSound(context), alarmAttributes)
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(channel)
        }
        manager.deleteNotificationChannel(LEGACY_ID)
    }

    /** What the nurse picked in system settings; the bundled chime until then. */
    fun sound(context: Context): Uri? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return defaultSound(context)
        val channel = context.getSystemService(NotificationManager::class.java).getNotificationChannel(ID)
            ?: return defaultSound(context)
        // null here means the nurse chose "None": respect it and only vibrate.
        return channel.sound
    }

    fun audioAttributes(): AudioAttributes = alarmAttributes
}

/**
 * Keeps ringing while a call waits, whether or not the app is on screen.
 *
 * It used to be a MediaPlayer owned by the activity, so leaving the app
 * silenced it the moment a nurse switched to anything else. A foreground
 * service outlives the activity and keeps the process -- and with it the
 * Dart feed that decides when the alarm should stop -- running.
 *
 * Started for a set of call ids. "Ovozni o'chirish" on its notification mutes
 * those ids; a call id that was not muted starts it again.
 */
class CallAlarmService : Service() {
    private var player: MediaPlayer? = null
    private var vibrating = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val ids = intent.getLongArrayExtra(EXTRA_CALL_IDS)?.toSet() ?: emptySet()
                // Forget mutes for calls that are no longer waiting.
                muted.retainAll(ids)
                val ringing = ids - muted
                if (ringing.isEmpty()) {
                    // Must still enter the foreground once: startForegroundService()
                    // was called, and Android kills an app that never does.
                    startInForeground(0)
                    stopRinging()
                } else {
                    current = ringing
                    startInForeground(ringing.size)
                    startRinging()
                }
            }
            ACTION_MUTE -> {
                muted.addAll(current)
                stopRinging()
            }
            else -> stopRinging()
        }
        return START_NOT_STICKY
    }

    private fun startInForeground(count: Int) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            manager.getNotificationChannel(SERVICE_CHANNEL_ID) == null
        ) {
            // Silent on purpose: the sound comes from the player below, and this
            // notification exists only because a foreground service needs one.
            val channel = NotificationChannel(
                SERVICE_CHANNEL_ID, "Signal", NotificationManager.IMPORTANCE_LOW
            ).apply { setSound(null, null); enableVibration(false) }
            manager.createNotificationChannel(channel)
        }

        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val mute = PendingIntent.getService(
            this, 1,
            Intent(this, CallAlarmService::class.java).setAction(ACTION_MUTE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, SERVICE_CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val notification = builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(if (count == 1) "Chaqiruv kutmoqda" else "$count ta chaqiruv kutmoqda")
            .setContentText("Qabul qilinmaguncha signal chalinadi")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(muteAction(mute))
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    @Suppress("DEPRECATION") // the Icon overload needs API 23; this one works everywhere
    private fun muteAction(intent: PendingIntent): Notification.Action =
        Notification.Action.Builder(0, "Ovozni o‘chirish", intent).build()

    private fun startRinging() {
        if (player == null) {
            val uri = CallChannel.sound(this)
            if (uri != null) {
                player = try {
                    MediaPlayer().apply {
                        setDataSource(applicationContext, uri)
                        setAudioAttributes(CallChannel.audioAttributes())
                        setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
                        isLooping = true
                        prepare()
                        start()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Tanlangan ovoz ijro etilmadi, standart ovozga o‘tildi", e)
                    fallbackPlayer()
                }
            }
        }
        if (!vibrating) {
            vibrator()?.let {
                val pattern = longArrayOf(0, 1000, 600, 1000, 600)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    it.vibrate(VibrationEffect.createWaveform(pattern, 0))
                } else {
                    @Suppress("DEPRECATION")
                    it.vibrate(pattern, 0)
                }
                vibrating = true
            }
        }
        isRinging = true
    }

    /** A sound picked in settings can be deleted later; the chime always exists. */
    private fun fallbackPlayer(): MediaPlayer? = try {
        MediaPlayer().apply {
            setDataSource(applicationContext, CallChannel.defaultSound(applicationContext))
            setAudioAttributes(CallChannel.audioAttributes())
            setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
            isLooping = true
            prepare()
            start()
        }
    } catch (e: Exception) {
        Log.e(TAG, "Signal ovozi ijro etilmadi", e)
        null
    }

    private fun stopRinging() {
        try {
            player?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
        } catch (_: Exception) {
        }
        player = null
        if (vibrating) vibrator()?.cancel()
        vibrating = false
        isRinging = false
        current = emptySet()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun vibrator(): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    override fun onDestroy() {
        player?.release()
        player = null
        if (vibrating) vibrator()?.cancel()
        isRinging = false
        super.onDestroy()
    }

    companion object {
        private const val TAG = "CallAlarmService"
        private const val ACTION_START = "uz.boos.nursecall.alarm.START"
        private const val ACTION_STOP = "uz.boos.nursecall.alarm.STOP"
        private const val ACTION_MUTE = "uz.boos.nursecall.alarm.MUTE"
        private const val EXTRA_CALL_IDS = "callIds"
        private const val SERVICE_CHANNEL_ID = "nursecall_alarm_service"
        private const val NOTIFICATION_ID = 7301

        /** Call ids the nurse muted from the notification. Survives the service. */
        private val muted = mutableSetOf<Long>()
        private var current: Set<Long> = emptySet()

        @Volatile
        var isRinging = false
            private set

        /** Returns false when Android refuses (e.g. starting from the background). */
        fun start(context: Context, callIds: List<Long>): Boolean {
            val intent = Intent(context, CallAlarmService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_CALL_IDS, callIds.toLongArray())
            return try {
                if (isRinging) {
                    // Already in the foreground: a plain start just updates it, and is
                    // allowed even while the app itself is in the background.
                    context.startService(intent)
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                true
            } catch (e: Exception) {
                // ForegroundServiceStartNotAllowedException on Android 12+ when the
                // app is in the background. The push notification still rings.
                Log.w(TAG, "Signal xizmati ishga tushmadi", e)
                false
            }
        }

        fun stop(context: Context) {
            if (!isRinging) return
            try {
                context.startService(Intent(context, CallAlarmService::class.java).setAction(ACTION_STOP))
            } catch (e: Exception) {
                Log.w(TAG, "Signal xizmati to‘xtatilmadi", e)
            }
        }
    }
}
