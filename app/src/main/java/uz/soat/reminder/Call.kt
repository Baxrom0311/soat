package uz.soat.reminder

data class Call(
    val callId: Int,
    val roomNumber: String,
    val floor: Int,
    val createdAt: String,
    val status: String
)
