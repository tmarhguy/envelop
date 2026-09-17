package com.tmarhguy.envelop.bridge

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.fail
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LeaseHeartbeatTest {
    @Test
    fun renewsOnFixedCadenceWithoutPerTickJobs() = runTest {
        var renewals = 0
        val heartbeat = launch {
            LeaseHeartbeat(intervalMs = 10_000) { renewals++ }.run()
        }

        runCurrent()
        advanceTimeBy(9_999)
        runCurrent()
        assertEquals(0, renewals)
        advanceTimeBy(1)
        runCurrent()
        assertEquals(1, renewals)
        advanceTimeBy(10_000)
        runCurrent()
        assertEquals(2, renewals)

        heartbeat.cancelAndJoin()
    }

    @Test
    fun renewalFailureEscapesToCancelTheSession() = runTest {
        val expected = IllegalStateException("lease lost")
        try {
            LeaseHeartbeat(intervalMs = 1) { throw expected }.run()
            fail("Heartbeat failure must escape")
        } catch (actual: IllegalStateException) {
            assertSame(expected, actual)
        }
    }

    @Test
    fun computeWorkIsLimitedToOneJobPerCycle() {
        assertEquals(1, MAX_COMPUTE_JOBS_PER_CYCLE)
    }

    @Test
    fun rejectsNonPositiveCadence() {
        try {
            LeaseHeartbeat(intervalMs = 0) {}
            fail("Expected invalid cadence")
        } catch (_: IllegalArgumentException) {
            Unit
        }
    }
}
