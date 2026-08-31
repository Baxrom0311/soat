package uz.soat.reminder

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class CallMonitorService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pollJob: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val alreadyAlerted = mutableSetOf<Int>()

    companion object {
        private const val STATUS_CHANNEL = "monitor_status"
        private const val ALERT_CHANNEL = "call_alert"
        private const val STATUS_NOTIFICATION_ID = 1

        // Chaqiruv bildirishnomalari uchun ID siljitiladi: call_id == 1 bo'lsa,
        // STATUS_NOTIFICATION_ID (1) bilan to'qnashib, foreground-status
        // bildirishnomasining o'rnini bosib qo'yar edi.
        private const val ALERT_NOTIFICATION_OFFSET = 1000

        private const val POLL_INTERVAL_MS = 5000L

        // Obuna holati eng ko'pi bilan kunda bir marta o'zgaradi (days_left butun
        // kunlarda), shuning uchun uni har 5 sekundda so'rash ma'nosiz tarmoq/batareya
        // sarfi bo'lardi. 720 * 5s ≈ 1 soat: kun ichida o'zgarish ~1 soat kechikish
        // bilan ko'rinadi, oradagi vaqtda oxirgi ma'lum qiymat ko'rsatilib turadi.
        private const val BILLING_POLL_EVERY_N = 720
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(STATUS_NOTIFICATION_ID, buildStatusNotification())

        // Foreground service o'z-o'zidan CPU uyqusidan himoya qilmaydi: wake lock
        // bo'lmasa doze rejimida poll sikli to'xtab, chaqiruvlar jim qolib ketadi.
        val pm = getSystemService(PowerManager::class.java)
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "soat:call_monitor").apply {
            setReferenceCounted(false)
            acquire()
        }

        pollJob = scope.launch { pollLoop() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        // scope.cancel() (not just pollJob.cancel()) so `while (scope.isActive)` in
        // pollLoop is actually meaningful, and any future coroutine launched on `scope`
        // is guaranteed to be torn down here too.
        scope.cancel()
        wakeLock?.release()
        wakeLock = null
        super.onDestroy()
    }

    /** Tears down the foreground service + wake lock immediately instead of leaving
     * them dangling after the poll loop exits (OUTDATED, or any other early return). */
    private fun shutDown() {
        wakeLock?.release()
        wakeLock = null
        stopSelf()
    }

    private suspend fun pollLoop() {
        // Har ishga tushishda bir marta: bu build serverning minimal talabidan
        // eski bo'lsa, poll sikliga umuman kirmay bloklanadi — eski build API'ni
        // buzadigan o'zgarish bilan jim yiqilib qolmasligi uchun. Tekshirib
        // bo'lmasa (masalan tarmoq yo'q) ilova odatdagidek davom etadi.
        try {
            if (BuildConfig.VERSION_CODE < ApiClient.fetchMinWatchVersion(applicationContext)) {
                CallState.status.value = ConnectionStatus.OUTDATED
                shutDown()
                return
            }
        } catch (_: Exception) {
            // e'tiborsiz qoldiriladi — odatdagi poll sikli davom etadi
        }

        // Service qayta ishga tushganda (reboot, crash, START_STICKY restart)
        // allaqachon faol turgan chaqiruvlar uchun bildirishnoma "bo'roni"
        // bo'lmasligi uchun birinchi muvaffaqiyatli poll jim o'tkaziladi —
        // ular baribir ekran ro'yxatida ko'rinadi.
        var firstPollDone = false
        var loopCount = 0L

        while (scope.isActive) {
            // Birinchi aylanishda va keyin har ~1 soatda. fetchBillingNotice hech qachon
            // tashlamaydi, shuning uchun chaqiruv logikasidan oldin turishi xavfsiz;
            // muvaffaqiyatsiz bo'lsa oxirgi ma'lum qiymat saqlanib qoladi.
            if (loopCount % BILLING_POLL_EVERY_N == 0L) {
                ApiClient.fetchBillingNotice(applicationContext)?.let {
                    CallState.billingNotice.value = it
                }
            }
            loopCount++

            try {
                val calls = ApiClient.fetchActiveCalls(applicationContext)
                CallState.activeCalls.value = calls
                CallState.status.value = ConnectionStatus.CONNECTED

                val activeIds = calls.map { it.callId }.toSet()
                if (firstPollDone) {
                    // Mark alerted only AFTER notifyNewCall succeeds: if it throws, the
                    // call ID must stay out of alreadyAlerted so the next poll retries
                    // it, instead of the call being silently dropped for its lifetime.
                    calls.filter { it.callId !in alreadyAlerted }.forEach { call ->
                        try {
                            notifyNewCall(call)
                            alreadyAlerted.add(call.callId)
                        } catch (_: Exception) {
                        }
                    }
                    // Tasdiqlanmagan chaqiruv bo'lsa, har pollda qayta tebranadi —
                    // bitta qisqa buzz hamshira e'tiborsiz qolib ketishi mumkin.
                    if (calls.isNotEmpty()) vibrate()
                } else {
                    alreadyAlerted.addAll(activeIds)
                    firstPollDone = true
                }
                // Yopilgan chaqiruvlar ID'larini to'plamdan chiqarib turamiz,
                // aks holda to'plam cheksiz o'sib boradi.
                alreadyAlerted.retainAll(activeIds)
            } catch (e: UnauthorizedException) {
                CallState.status.value = ConnectionStatus.UNAUTHORIZED
            } catch (e: Exception) {
                CallState.status.value = ConnectionStatus.DISCONNECTED
            }
            delay(POLL_INTERVAL_MS)
        }
    }

    private fun buildStatusNotification(): android.app.Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(STATUS_CHANNEL, "Monitor holati", NotificationManager.IMPORTANCE_LOW)
            )
        }
        return NotificationCompat.Builder(this, STATUS_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("NurseCall")
            .setContentText("Kuzatilmoqda...")
            .setOngoing(true)
            .build()
    }

    private fun notifyNewCall(call: Call) {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(ALERT_CHANNEL, "Yangi chaqiruvlar", NotificationManager.IMPORTANCE_HIGH)
            )
        }

        val contentIntent = PendingIntent.getActivity(
            this,
            call.callId,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, ALERT_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Xona ${call.roomNumber} chaqirmoqda")
            .setContentText("${call.floor}-qavat")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        manager.notify(ALERT_NOTIFICATION_OFFSET + call.callId, notification)
    }

    private fun vibrate() {
        val pattern = longArrayOf(0, 500, 200, 500, 200, 500)
        val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(VibratorManager::class.java)
            vm.defaultVibrator
        } else {
            getSystemService(VIBRATOR_SERVICE) as Vibrator
        }
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
    }
}
