package uz.soat.reminder

/**
 * Poll siklining Android'ga bog'liq bo'lmagan qarorlari — alohida, shunda
 * JVM testida tekshirsa bo'ladi.
 */
object PollPolicy {
    const val NORMAL_MS = 5_000L
    private const val MAX_FAILURE_MS = 30_000L

    /** Token yaroqsiz bo'lsa qayta urinish o'z-o'zidan tuzalmaydi: yangi token
     * telefondan kelguncha yoki hamshira qayta kirguncha kutiladi. */
    const val UNAUTHORIZED_MS = 60_000L

    /**
     * Keyingi so'rovgacha kutish.
     *
     * Avval har holatda 5 soniya edi: Wi-Fi yo'qolgan soat har 5 soniyada
     * radiosini uyg'otib batareyani yeb turar, 401 olgan soat esa serverga
     * soatiga 720 marta bir xil rad etiladigan so'rov yuborar edi. Ketma-ket
     * xatolarda 5 → 10 → 20 → 30 soniyagacha uzayadi, birinchi muvaffaqiyatda
     * yana 5 soniyaga qaytadi.
     */
    fun nextDelayMs(consecutiveFailures: Int, unauthorized: Boolean): Long {
        if (unauthorized) return UNAUTHORIZED_MS
        if (consecutiveFailures <= 0) return NORMAL_MS
        val shift = (consecutiveFailures).coerceAtMost(3)
        return (NORMAL_MS shl shift).coerceAtMost(MAX_FAILURE_MS)
    }

    /** Ekranda hali ham turgan, lekin endi faol bo'lmagan chaqiruvlar —
     * ularning bildirishnomalari bilakdan olib tashlanadi. */
    fun closedCalls(notified: Set<Int>, active: Set<Int>): Set<Int> = notified - active
}
