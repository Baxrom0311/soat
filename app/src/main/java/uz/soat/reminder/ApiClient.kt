package uz.soat.reminder

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class UnauthorizedException : IOException("Token yaroqsiz yoki muddati o'tgan")
class InvalidCredentialsException : IOException("Email yoki parol noto'g'ri")

/** Obuna holati haqidagi ogohlantirish. Pul/narx ma'lumoti yo'q — hamshira
 * faqat "obuna tugayapti" faktini ko'rishi kerak. */
data class BillingNotice(val warn: Boolean, val daysLeft: Int?, val blocked: Boolean)

object ApiClient {
    // Production backend (adb orqali provisioning paytida boshqasiga o'zgartirilishi mumkin,
    // masalan lokal sinov uchun LAN IP + port 8000).
    const val defaultHost = "nurcecall.boos.uz"
    const val defaultPort = 443

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private fun baseUrl(context: Context): String {
        val host = AppPrefs.getServerHost(context, defaultHost)
        val port = AppPrefs.getServerPort(context, defaultPort)
        // https istalgan portda ishlashi mumkin — scheme alohida sozlanadi
        // (provisioning'da --es scheme http faqat lokal sinov uchun).
        val scheme = AppPrefs.getScheme(context, if (port == 443) "https" else "http")
        val portSuffix = if ((scheme == "https" && port == 443) || (scheme == "http" && port == 80)) "" else ":$port"
        return "$scheme://$host$portSuffix"
    }

    private fun authHeader(context: Context): String {
        val token = AppPrefs.getToken(context) ?: throw UnauthorizedException()
        return "Bearer $token"
    }

    fun fetchActiveCalls(context: Context): List<Call> {
        val request = Request.Builder()
            .url("${baseUrl(context)}/api/v1/calls/active")
            .header("Authorization", authHeader(context))
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (response.code == 401) throw UnauthorizedException()
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            val body = response.body?.string() ?: "[]"
            val arr = JSONArray(body)
            // Skip only the malformed element, not the whole batch: one bad record
            // must never blank out every other genuinely active call in the response.
            return (0 until arr.length()).mapNotNull { i ->
                try {
                    val o = arr.getJSONObject(i)
                    Call(
                        callId = o.getInt("call_id"),
                        roomNumber = o.getString("room_number"),
                        floor = o.getInt("floor"),
                        createdAt = o.getString("created_at"),
                        status = o.getString("status")
                    )
                } catch (_: org.json.JSONException) {
                    null
                }
            }
        }
    }

    // Hech qachon exception tashlamaydi: to'lov tekshiruvining yiqilishi (tarmoq,
    // 401, buzilgan javob) chaqiruv kuzatuv siklini bezovta qilmasligi kerak —
    // ma'lumot yo'q bo'lsa null qaytariladi va ekranda shunchaki hech narsa
    // ko'rsatilmaydi.
    fun fetchBillingNotice(context: Context): BillingNotice? {
        return try {
            val request = Request.Builder()
                .url("${baseUrl(context)}/api/v1/clinic/billing-notice")
                .header("Authorization", authHeader(context))
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val o = JSONObject(body)
                BillingNotice(
                    warn = o.optBoolean("warn", false),
                    // days_left null bo'lishi mumkin — bunda kunlar soni yozilmaydi
                    daysLeft = if (o.isNull("days_left")) null else o.optInt("days_left"),
                    blocked = o.optBoolean("blocked", false)
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    // Autentifikatsiya kerak emas — token yo'q/eskirgan bo'lsa ham versiya
    // tekshiruvi ishlashi kerak.
    fun fetchMinWatchVersion(context: Context): Int {
        val request = Request.Builder()
            .url("${baseUrl(context)}/api/v1/meta/version")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            val body = response.body?.string() ?: "{}"
            return JSONObject(body).getInt("min_watch_version")
        }
    }

    // Soatning o'zidan to'g'ridan-to'g'ri kirish uchun — telefon orqali Bluetooth bilan
    // token uzatilishini kutish shart emas. Backend'dagi /auth/login har qanday
    // klient uchun bir xil ishlaydi (veb-dashboard, mobil ilova bilan bir xil yo'l).
    fun login(context: Context, email: String, password: String): String {
        val json = JSONObject().put("email", email).put("password", password).toString()
        val body = json.toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("${baseUrl(context)}/api/v1/auth/login")
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            if (response.code == 401) throw InvalidCredentialsException()
            if (response.code == 429) throw IOException("Juda ko'p urinish, birozdan keyin qayta urinib ko'ring")
            if (response.code == 403) throw IOException("Klinika obunasi to'xtatilgan")
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            val respBody = response.body?.string() ?: throw IOException("Bo'sh javob")
            return JSONObject(respBody).getString("access_token")
        }
    }

    fun ackCall(context: Context, callId: Int, acknowledgedBy: String) {
        val json = JSONObject().put("acknowledged_by", acknowledgedBy).toString()
        val body = json.toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("${baseUrl(context)}/api/v1/calls/$callId/ack")
            .header("Authorization", authHeader(context))
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            if (response.code == 401) throw UnauthorizedException()
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
        }
    }
}
