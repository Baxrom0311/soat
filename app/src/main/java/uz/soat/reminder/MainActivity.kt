package uz.soat.reminder

import android.Manifest
import android.app.Activity
import android.app.RemoteInput
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    ConnectionStatus.CONNECTED -> NurseCallTokens.ColorDark.ok
    ConnectionStatus.CONNECTING -> NurseCallTokens.ColorDark.attn
    else -> NurseCallTokens.ColorDark.borderField
}

private fun getAgeStep(createdAtIso: String): Int {
    val ms = System.currentTimeMillis() - runCatching {
        java.time.Instant.parse(createdAtIso).toEpochMilli()
    }.getOrDefault(System.currentTimeMillis())
    val s = (ms / 1000).toInt().coerceAtLeast(0)
    return when {
        s < NurseCallTokens.Call.thresholdsSec[1] -> 1
        s < NurseCallTokens.Call.thresholdsSec[2] -> 2
        else -> 3
    }
}

private fun billingText(notice: BillingNotice): String? = when {
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
            if (calls.size == 1 && status == ConnectionStatus.CONNECTED) {
                val call = calls.first()
                val step = getAgeStep(call.createdAt)
                val fill = NurseCallTokens.Call.fillsDark[step - 1]

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(fill)
                        .padding(12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = "${call.floor}-qavat",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = call.roomNumber,
                            color = Color.White,
                            fontSize = NurseCallTokens.Size.watchCallRoomNumberMax,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Chip(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(NurseCallTokens.Size.watchCallAckHeight),
                            onClick = {
                                scope.launch(Dispatchers.IO) {
                                    runCatching {
                                        ApiClient.ackCall(context, call.callId, "Palata soati")
                                    }
                                }
                            },
                            colors = ChipDefaults.chipColors(
                                backgroundColor = NurseCallTokens.Call.slabDark,
                                contentColor = fill
                            ),
                            label = {
                                Text(
                                    text = "Tasdiqlash",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = fill,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                        )
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(scrollState)
                        .padding(horizontal = 12.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "NurseCall",
                        maxLines = 1,
                        style = MaterialTheme.typography.title3,
                        color = NurseCallTokens.ColorDark.text1
                    )
                    Text(
                        text = statusText(status),
                        maxLines = 1,
                        style = MaterialTheme.typography.caption2,
                        color = statusColor(status)
                    )

                    when {
                        status == ConnectionStatus.OUTDATED -> Text(
                            text = "Ilova eskirgan. Telefondan yangilang.",
                            maxLines = 4,
                            style = MaterialTheme.typography.body2,
                            color = NurseCallTokens.ColorDark.text2
                        )
                        status == ConnectionStatus.UNAUTHORIZED -> LoginForm()
                        calls.isEmpty() -> {
                            Text(
                                text = "Faol chaqiruvlar yo'q",
                                maxLines = 2,
                                style = MaterialTheme.typography.body2,
                                color = NurseCallTokens.ColorDark.text3
                            )
                            billing?.let { notice ->
                                billingText(notice)?.let { msg ->
                                    Text(
                                        text = msg,
                                        maxLines = 3,
                                        style = MaterialTheme.typography.caption2,
                                        color = NurseCallTokens.ColorDark.attn
                                    )
                                }
                            }
                        }
                        else -> calls.forEach { call ->
                            val step = getAgeStep(call.createdAt)
                            val fill = NurseCallTokens.Call.fillsDark[step - 1]
                            Chip(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(NurseCallTokens.Size.watchCallAckHeight),
                                onClick = {
                                    scope.launch(Dispatchers.IO) {
                                        runCatching {
                                            ApiClient.ackCall(context, call.callId, "Palata soati")
                                        }
                                    }
                                },
                                colors = ChipDefaults.chipColors(
                                    backgroundColor = fill,
                                    contentColor = Color.White
                                ),
                                label = {
                                    Text(text = "Xona ${call.roomNumber}", maxLines = 1, fontWeight = FontWeight.Bold)
                                },
                                secondaryLabel = {
                                    Text(text = "${call.floor}-qavat", maxLines = 1)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

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
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val results = RemoteInput.getResultsFromIntent(result.data)
            val text = results?.getCharSequence(REMOTE_INPUT_KEY)?.toString().orEmpty()
            if (pendingField == "email") email = text
            if (pendingField == "password") password = text
        }
        pendingField = null
    }

    val launchInput = { fieldName: String, title: String, prefill: String ->
        pendingField = fieldName
        val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
        val remoteInput = RemoteInput.Builder(REMOTE_INPUT_KEY)
            .setLabel(title)
            .build()
        RemoteInputIntentHelper.putRemoteInputsExtra(intent, listOf(remoteInput))
        remoteInputLauncher.launch(intent)
    }

    fun submit() {
        if (email.isBlank() || password.isBlank()) {
            error = "Email va parol kiriting"
            return
        }
        error = null
        busy = true
        scope.launch(Dispatchers.IO) {
            val res = runCatching { ApiClient.login(context, email.trim(), password) }
            launch(Dispatchers.Main) {
                busy = false
                if (res.isFailure) {
                    error = res.exceptionOrNull()?.message ?: "Xatolik"
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Chip(
            modifier = Modifier.fillMaxWidth(),
            onClick = { launchInput("email", "Email", email) },
            colors = ChipDefaults.chipColors(backgroundColor = NurseCallTokens.ColorDark.surface),
            label = { Text(text = if (email.isBlank()) "Email" else email, maxLines = 1) }
        )
        Chip(
            modifier = Modifier.fillMaxWidth(),
            onClick = { launchInput("password", "Parol", "") },
            colors = ChipDefaults.chipColors(backgroundColor = NurseCallTokens.ColorDark.surface),
            label = { Text(text = if (password.isBlank()) "Parol" else "••••••••", maxLines = 1) }
        )
        Chip(
            modifier = Modifier.fillMaxWidth(),
            onClick = { submit() },
            enabled = !busy,
            colors = ChipDefaults.chipColors(backgroundColor = NurseCallTokens.ColorDark.accent),
            label = { Text(text = if (busy) "..." else "Kirish", maxLines = 1, color = NurseCallTokens.ColorDark.accentInk) }
        )
        error?.let {
            Text(text = it, color = NurseCallTokens.ColorDark.attn, style = MaterialTheme.typography.caption2)
        }
    }
}
