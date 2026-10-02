package uz.soat.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Base64

/**
 * Soat ilovasining birinchi testlari.
 *
 * Shu faylgacha butun soat ilovasida bitta ham test yo'q edi — audit shuni
 * ko'rsatdi. Boshlash uchun eng to'g'ri joy shu: token o'qish soatning
 * autentifikatsiyasiga tegadigan yagona mantiq, va u Bluetooth orqali
 * telefondan kelgan, ya'ni to'liq ishonib bo'lmaydigan kiritmani o'qiydi.
 */
class WatchTokenTest {

    private fun jwt(payload: String): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val head = enc.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
        val body = enc.encodeToString(payload.toByteArray())
        // Imzo o'rniga istalgan narsa: bu yerda u hech qachon tekshirilmaydi.
        return "$head.$body.imzo-tekshirilmaydi"
    }

    @Test
    fun `hamshiraning ismini o'qiydi`() {
        val token = jwt("""{"sub":"7","clinic_id":4,"role":"nurse","name":"Nigora Saidova"}""")
        assertEquals("Nigora Saidova", WatchToken.nameOf(token))
        assertEquals("nurse", WatchToken.roleOf(token))
    }

    @Test
    fun `ism yo'q bo'lsa null qaytaradi`() {
        assertNull(WatchToken.nameOf(jwt("""{"sub":"7","role":"nurse"}""")))
    }

    @Test
    fun `bo'sh ism null hisoblanadi`() {
        // Bo'sh satr ekranda bo'sh joy bo'lib ko'rinadi, ya'ni "ism yo'q" dan
        // farq qilmaydi — lekin kod uchun farq qiladi, shuning uchun bu yerda
        // tenglashtiriladi.
        assertNull(WatchToken.nameOf(jwt("""{"name":"","role":"nurse"}""")))
    }

    @Test
    fun `tokensiz holat qulamaydi`() {
        assertNull(WatchToken.nameOf(null))
        assertNull(WatchToken.nameOf(""))
        assertNull(WatchToken.nameOf("   "))
    }

    @Test
    fun `buzuq token istisno tashlamaydi`() {
        // Telefon Bluetooth orqali yuboradi: yarim yetib kelgan yoki umuman
        // boshqa narsa tushishi mumkin. Soat bunda ism ko'rsatmasligi kerak,
        // qulashi emas.
        assertNull(WatchToken.nameOf("bu-jwt-emas"))
        assertNull(WatchToken.nameOf("a.b"))
        assertNull(WatchToken.nameOf("a.!!!bu-base64-emas!!!.c"))
        assertNull(WatchToken.nameOf("..."))
    }

    @Test
    fun `payload JSON bo'lmasa ham qulamaydi`() {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val broken = "${enc.encodeToString("{}".toByteArray())}." +
            "${enc.encodeToString("bu JSON emas".toByteArray())}.imzo"
        assertNull(WatchToken.nameOf(broken))
    }

    @Test
    fun `URL-safe alifbo talab qiladigan ism o'qiladi`() {
        // JWT URL-safe base64 bilan yoziladi: '+' o'rniga '-', '/' o'rniga '_'.
        // Farq faqat ba'zi baytlarda ko'rinadi, shuning uchun bu testni oddiy
        // lotin ismi bilan yozsa — hech narsa tekshirmaydi. Birinchi versiyam
        // aynan shunday edi va oddiy dekoderga almashtirilganda ham o'tardi.
        //
        // "G'aniyeva" dagi ʻ (U+2018) shu payload ichida aynan o'sha baytni
        // beradi. Ya'ni bu xato o'zbekcha ismlarda yuz berardi: soat Nigora
        // deb ko'rsatardi-yu, Zulayxo deb ko'rsatolmasdi.
        //
        // Qaysi ism URL-safe belgisini beradi — bu payloadning aniq
        // uzunligiga bog'liq, chunki base64 uch baytdan kodlaydi. Shuning
        // uchun pastdagi tekshiruv PAYLOAD qismiga qaraydi: imzo yoki
        // sarlavhadagi tasodifiy '-' bu testni yolg'ondan yashil qilib
        // qo'yishi mumkin edi, va birinchi versiyamda aynan shunday bo'ldi.
        val name = "Zulayxo G\u2018aniyeva"
        val token = jwt("""{"sub":"7","role":"nurse","name":"$name"}""")
        val payloadSegment = token.split(".")[1]
        assert(payloadSegment.contains("-") || payloadSegment.contains("_")) {
            "test payloadi URL-safe alifboni ishlatmayapti — bu test hech narsa tekshirmaydi"
        }
        assertEquals(name, WatchToken.nameOf(token))
    }

    @Test
    fun `to'ldiruvchisiz yozilgan token o'qiladi`() {
        val token = jwt("""{"name":"Dilnoza"}""")
        assert(!token.contains("=")) { "test tokeni to'ldiruvchi bilan yozilibdi" }
        assertEquals("Dilnoza", WatchToken.nameOf(token))
    }

    @Test
    fun `ismdagi bo'sh joy va tinish belgilari saqlanadi`() {
        val token = jwt("""{"name":"Gulnoz A. Qodirova"}""")
        assertEquals("Gulnoz A. Qodirova", WatchToken.nameOf(token))
    }

    @Test
    fun `boshqa da'vo ichidagi name ni ism deb olmaydi`() {
        // "clinic_name" ichida ham "name" bor. Oddiy indexOf shunga ilashib
        // ketishi mumkin edi; klinika nomini hamshira nomi deb ko'rsatish esa
        // soatda kim turganini butunlay noto'g'ri aytish bo'lardi.
        val token = jwt("""{"clinic_name":"Profmedmax","name":"Asila"}""")
        assertEquals("Asila", WatchToken.nameOf(token))
    }
}
