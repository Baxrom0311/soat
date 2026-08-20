package uz.soat.reminder

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import java.nio.charset.StandardCharsets

private const val TOKEN_PATH = "/soat/auth_token"

// Telefon ilovasida hamshira login qilganda, JWT shu yo'l orqali soatga
// yuboriladi — soatning o'zida parol kiritish kerak bo'lmaydi. Bo'sh
// payload chiqish (logout) belgisi: token tozalanadi, keyingi poll
// UNAUTHORIZED holatiga qaytadi.
class TokenSyncService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != TOKEN_PATH) return
        val token = String(event.data, StandardCharsets.UTF_8)
        AppPrefs.setToken(applicationContext, token.ifEmpty { null })
    }
}
