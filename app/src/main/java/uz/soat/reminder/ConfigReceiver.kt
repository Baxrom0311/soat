package uz.soat.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Provisioning uchun: nurse soati IT xodimi tomonidan bir marta sozlanadi.
 *
 * Production (https, 443):
 *   adb shell am broadcast -a uz.soat.reminder.CONFIGURE --es token "<clinic JWT>"
 * Lokal sinov (http, LAN):
 *   adb shell am broadcast -a uz.soat.reminder.CONFIGURE \
 *     --es token "<JWT>" --es server_host "192.168.1.5" --ei server_port 8000 --es scheme http
 *
 * Receiver DUMP permission bilan himoyalangan (manifest'ga qarang): adb shell
 * yuborishi mumkin, qurilmadagi boshqa ilovalar esa yo'q.
 */
class ConfigReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "uz.soat.reminder.CONFIGURE") return

        intent.getStringExtra("token")?.let { AppPrefs.setToken(context, it) }

        val host = intent.getStringExtra("server_host")
        val port = intent.getIntExtra("server_port", -1)
        if (host != null || port != -1) {
            AppPrefs.setServer(
                context,
                host ?: AppPrefs.getServerHost(context, ApiClient.defaultHost),
                if (port != -1) port else AppPrefs.getServerPort(context, ApiClient.defaultPort)
            )
        }

        // http faqat lokal sinov uchun; ko'rsatilmasa portga qarab tanlanadi.
        intent.getStringExtra("scheme")?.let { scheme ->
            if (scheme == "http" || scheme == "https") AppPrefs.setScheme(context, scheme)
        }
    }
}
