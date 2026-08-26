package uz.soat.reminder

import android.Manifest
import android.app.RemoteInput
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.input.RemoteInputIntentHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private const val REMOTE_INPUT_KEY = "nc_login_input"

class MainActivity : ComponentActivity() {

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        ContextCompat.startForegroundService(this, Intent(this, CallMonitorService::class.java))

        setContent {
            CallMonitorScreen()
        }
    }
}

private fun statusText(status: ConnectionStatus): String = when (status) {
    ConnectionStatus.CONNECTING -> "Ulanmoqda..."
    ConnectionStatus.CONNECTED -> "Ulandi"
    ConnectionStatus.DISCONNECTED -> "Ulanish yo'q"
    ConnectionStatus.UNAUTHORIZED -> "Token sozlanmagan"
    ConnectionStatus.OUTDATED -> "Yangilanish kerak"
}

private fun statusColor(status: ConnectionStatus): Color = when (status) {
    ConnectionStatus.CONNECTED -> Color(0xFF4CAF50)
    ConnectionStatus.CONNECTING -> Color(0xFFFFC107)
    else -> Color(0xFFF44336)
}

/** null qaytsa — ko'rsatishga arzigulik hech narsa yo'q. */
private fun billingText(notice: BillingNotice): String? = when {
    // Boshqaruv to'xtatilgan bo'lsa ham chaqiruvlar ishlashda davom etadi
    // (backend'da ogohlantirish yo'li ataylab bloklanmaydi) — hamshira behuda
    // xavotir olmasligi uchun buni aytib qo'yamiz.
    notice.blocked -> "Obuna muddati tugadi — boshqaruv to'xtatilgan. Chaqiruvlar ishlayapti."
    !notice.warn -> null
    notice.daysLeft == null -> "Obuna muddati tugayapti"
    notice.daysLeft <= 0 -> "Obuna muddati tugadi"
    else -> "Obuna ${notice.daysLeft} kundan keyin tugaydi"
}

@Composable
fun CallMonitorScreen() {
    val calls by CallState.activeCalls.collectAsState()
    val status by CallState.status.collectAsState()
    val billing by CallState.billingNotice.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    MaterialTheme {
        Scaffold(timeText = { TimeText() }) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(horizontal = 18.dp, vertical = 30.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "Chaqiruv monitor",
                    maxLines = 1,
                    style = MaterialTheme.typography.title3
                )
                Text(
                    text = statusText(status),
                    maxLines = 1,
                    style = MaterialTheme.typography.caption2,
                    color = statusColor(status)
                )

                when {
                    status == ConnectionStatus.OUTDATED -> Text(
                        text = "Bu soat ilovasi eskirgan. Telefondagi NurseCall ilovasi orqali yangi versiyani o'rnating.",
                        maxLines = 4,
                        style = MaterialTheme.typography.body2
                    )
                    status == ConnectionStatus.UNAUTHORIZED -> LoginForm()
                    calls.isEmpty() -> {
                        Text(
                            text = "Faol chaqiruvlar yo'q",
                            maxLines = 2,
                            style = MaterialTheme.typography.body2
                        )
                        // Obuna ogohlantirishi faqat shu shoxda — chaqiruv bo'lsa ekran
                        // butunlay chaqiruvga tegishli bo'lishi kerak.
                        billing?.let { notice ->
                            billingText(notice)?.let { msg ->
                                Text(
                                    text = msg,
                                    maxLines = 3,
                                    style = MaterialTheme.typography.caption2,
                                    color = Color(0xFFFFB300)
                                )
                            }
                        }
                    }
                    else -> calls.forEach { call ->
                        Chip(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                scope.launch(Dispatchers.IO) {
                                    // Xato jim yutilmasin: hamshira "bosdim" deb o'ylab
                                    // ketib qolsa, chaqiruv ochiq qolgan bo'lar edi.
                                    val result = runCatching {
                                        ApiClient.ackCall(context, call.callId, "Palata soati")
                                    }
                                    if (result.isFailure) {
                                        launch(Dispatchers.Main) {
                                            android.widget.Toast.makeText(
                                                context,
                                                "Tasdiqlab bo'lmadi — qayta urinib ko'ring",
                                                android.widget.Toast.LENGTH_SHORT
                                            ).show()
                                        }
                                    }
                                }
                            },
                            colors = ChipDefaults.chipColors(backgroundColor = Color(0xFFD32F2F)),
                            label = {
                                Text(text = "Xona ${call.roomNumber}", maxLines = 1)
                            },
                            secondaryLabel = {
                                Text(text = "${call.floor}-qavat, tasdiqlash uchun bosing", maxLines = 1)
                            }
                        )
                    }
                }
            }
        }
    }
}

// Soatning o'zidan to'g'ridan-to'g'ri kirish — Bluetooth orqali telefondan token
// kelishini kutish shart emas (bu ilgari yagona yo'l edi, va ba'zi qurilmalarda
// Google Play Services'ning "Failed to deliver message" degan hal qilib bo'lmaydigan
// bug'i tufayli umuman ishlamay qolardi). Wear OS'da ekranga o'rnatilgan klaviatura
// yo'q — matn kiritish tizimning o'z RemoteInput ekrani (klaviatura/ovoz/qo'lyozma
// tanlovi bilan) orqali amalga oshiriladi, bu shu platformadagi standart yondashuv.
@Composable
private fun LoginForm() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var pendingField by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val remoteInputLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        val text = data?.let { RemoteInput.getResultsFromIntent(it) }
            ?.getCharSequence(REMOTE_INPUT_KEY)?.toString()
        if (text != null) {
            when (pendingField) {
                "email" -> email = text.trim()
                "password" -> password = text
            }
        }
        pendingField = null
    }

    fun launchInput(field: String, label: String) {
        error = null
        pendingField = field
        val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
        RemoteInputIntentHelper.putRemoteInputsExtra(
            intent, listOf(RemoteInput.Builder(REMOTE_INPUT_KEY).setLabel(label).build())
        )
        remoteInputLauncher.launch(intent)
    }

    fun submit() {
        if (email.isBlank() || password.isBlank()) {
            error = "Email va parolni kiriting"
            return
        }
        error = null
        busy = true
        scope.launch(Dispatchers.IO) {
            try {
                val token = ApiClient.login(context, email.trim(), password)
                AppPrefs.setToken(context, token)
                // Bildirishnoma shart emas — CallMonitorService'ning keyingi poll
                // sikli (5s ichida) tokenni o'zi qayta o'qib, avtomatik ulanadi.
            } catch (e: Exception) {
                launch(Dispatchers.Main) {
                    error = e.message ?: "Kirishda xato yuz berdi"
                }
            } finally {
                launch(Dispatchers.Main) { busy = false }
            }
        }
    }

    Text(text = "Hisobingizga kiring", maxLines = 2, style = MaterialTheme.typography.body2)

    Chip(
        modifier = Modifier.fillMaxWidth(),
        onClick = { launchInput("email", "Email") },
        label = { Text(text = email.ifEmpty { "Email kiriting" }, maxLines = 1) }
    )
    Chip(
        modifier = Modifier.fillMaxWidth(),
        onClick = { launchInput("password", "Parol") },
        label = {
            Text(
                text = if (password.isEmpty()) "Parol kiriting" else "•".repeat(password.length.coerceAtMost(12)),
                maxLines = 1
            )
        }
    )
    Chip(
        modifier = Modifier.fillMaxWidth(),
        onClick = { submit() },
        colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF1D5FE0)),
        label = { Text(text = if (busy) "Kirilmoqda..." else "Kirish", maxLines = 1) }
    )
    error?.let {
        Text(text = it, maxLines = 3, style = MaterialTheme.typography.caption2, color = Color(0xFFF44336))
    }
}
