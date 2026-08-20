package uz.soat.reminder

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
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
import androidx.compose.runtime.rememberCoroutineScope
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

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

@Composable
fun CallMonitorScreen() {
    val calls by CallState.activeCalls.collectAsState()
    val status by CallState.status.collectAsState()
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
                    status == ConnectionStatus.UNAUTHORIZED -> Text(
                        text = "Bu soat hali klinikaga bog'lanmagan. Telefonda NurseCall ilovasiga kiring — soat avtomatik ulanadi.",
                        maxLines = 4,
                        style = MaterialTheme.typography.body2
                    )
                    calls.isEmpty() -> Text(
                        text = "Faol chaqiruvlar yo'q",
                        maxLines = 2,
                        style = MaterialTheme.typography.body2
                    )
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
