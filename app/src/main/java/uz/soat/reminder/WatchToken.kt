package uz.soat.reminder

import java.util.Base64

/**
 * Soatga kelgan JWT ichidan ekranda ko'rsatiladigan ma'lumotni o'qiydi.
 *
 * Imzo bu yerda TEKSHIRILMAYDI va tekshirilishi ham shart emas: soat hech
 * qachon tokenga qarab o'zi qaror qabul qilmaydi. Har bir so'rovni server
 * tokenni tekshirib javob beradi; bu yerdagi yagona ish — "bu soat hozir
 * kimniki" degan savolga ekranda javob yozish.
 *
 * Androidning `Context` idan va `android.util.Base64` dan atayin ajratilgan:
 * shunday qilinganda oddiy JVM testida sinash mumkin, va soatning
 * autentifikatsiyasiga tegadigan yagona mantiq test ostida qoladi.
 */
object WatchToken {

    /**
     * JWT ning o'rta qismidagi `name` da'vosi, yoki topilmasa null.
     *
     * Har qanday buzuq kiritma uchun null qaytaradi — istisno tashlamaydi.
     * Bu muhim: token telefondan Bluetooth orqali ham keladi, ya'ni bu yerga
     * yarim yetib kelgan yoki umuman boshqa narsa tushishi mumkin, va o'shanda
     * soat qulashi emas, shunchaki ism ko'rsatmasligi kerak.
     */
    fun nameOf(token: String?): String? = claim(token, "name")

    /** Xuddi shunday, `role` uchun. */
    fun roleOf(token: String?): String? = claim(token, "role")

    private fun claim(token: String?, key: String): String? {
        val payload = payloadOf(token) ?: return null
        // Qo'lda o'qiladi, JSON kutubxonasiz: soatda bu yagona ishlatiladigan
        // joy, va tokenning ichidagi qiymatlar oddiy satrlar.
        val needle = "\"$key\""
        val at = payload.indexOf(needle)
        if (at < 0) return null
        val colon = payload.indexOf(':', at + needle.length)
        if (colon < 0) return null
        val open = payload.indexOf('"', colon + 1)
        if (open < 0) return null
        val close = payload.indexOf('"', open + 1)
        if (close < 0) return null
        return payload.substring(open + 1, close).ifEmpty { null }
    }

    private fun payloadOf(token: String?): String? {
        if (token.isNullOrBlank()) return null
        val parts = token.split(".")
        if (parts.size < 2) return null
        return try {
            // URL-safe, to'ldiruvchisiz: JWT shunday yoziladi.
            String(Base64.getUrlDecoder().decode(parts[1]), Charsets.UTF_8)
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}
