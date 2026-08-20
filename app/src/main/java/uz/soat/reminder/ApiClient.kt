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
            return (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Call(
                    callId = o.getInt("call_id"),
                    roomNumber = o.getString("room_number"),
                    floor = o.getInt("floor"),
                    createdAt = o.getString("created_at"),
                    status = o.getString("status")
                )
            }
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
