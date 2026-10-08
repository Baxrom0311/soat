package uz.soat.reminder

import org.junit.Assert.assertEquals
import org.junit.Test

class PollPolicyTest {

    @Test
    fun `muvaffaqiyatli pollda 5 soniya`() {
        assertEquals(5_000L, PollPolicy.nextDelayMs(0, unauthorized = false))
    }

    @Test
    fun `ketma-ket xatolarda kutish uzayadi va 30 soniyada to'xtaydi`() {
        val delays = (1..6).map { PollPolicy.nextDelayMs(it, unauthorized = false) }
        assertEquals(listOf(10_000L, 20_000L, 30_000L, 30_000L, 30_000L, 30_000L), delays)
    }

    @Test
    fun `401 da bir daqiqa kutiladi`() {
        assertEquals(60_000L, PollPolicy.nextDelayMs(0, unauthorized = true))
        assertEquals(60_000L, PollPolicy.nextDelayMs(5, unauthorized = true))
    }

    @Test
    fun `qabul qilingan chaqiruvlar bildirishnomasi olib tashlanadi`() {
        assertEquals(setOf(2, 3), PollPolicy.closedCalls(setOf(1, 2, 3), setOf(1, 4)))
        assertEquals(emptySet<Int>(), PollPolicy.closedCalls(emptySet(), setOf(1)))
    }
}
