package uz.soat.reminder

import kotlinx.coroutines.flow.MutableStateFlow

enum class ConnectionStatus { CONNECTING, CONNECTED, DISCONNECTED, UNAUTHORIZED, OUTDATED }

object CallState {
    val activeCalls = MutableStateFlow<List<Call>>(emptyList())
    val status = MutableStateFlow(ConnectionStatus.CONNECTING)
}
