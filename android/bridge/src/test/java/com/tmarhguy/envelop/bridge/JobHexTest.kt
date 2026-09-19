package com.tmarhguy.envelop.bridge

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JobHexTest {
    @Test
    fun spacedPairsMatchTheCompiler() {
        val bytes = parseJobHex("01 01 05 00 00 00 2A 30 00")
        assertArrayEquals(
            byteArrayOf(0x01, 0x01, 0x05, 0x00, 0x00, 0x00, 0x2A, 0x30, 0x00),
            bytes,
        )
    }

    @Test
    fun compactHexIsAccepted() {
        val bytes = parseJobHex("0101050000002A3000")
        assertArrayEquals(
            byteArrayOf(0x01, 0x01, 0x05, 0x00, 0x00, 0x00, 0x2A, 0x30, 0x00),
            bytes,
        )
    }

    @Test
    fun lowercaseAndNewlinesAreAccepted() {
        val bytes = parseJobHex("01\n0a\tff")
        assertArrayEquals(byteArrayOf(0x01, 0x0A, 0xFF.toByte()), bytes)
    }

    @Test
    fun oddNibblesAndJunkAreRejected() {
        assertNull(parseJobHex(""))
        assertNull(parseJobHex("1"))
        assertNull(parseJobHex("01 0"))
        assertNull(parseJobHex("01 GG"))
        assertNull(parseJobHex("01,02"))
    }

    @Test
    fun postgresJobUnavailableIsRecognized() {
        assertTrue(isJobUnavailable(IllegalStateException("job unavailable")))
        assertTrue(isJobUnavailable(IllegalStateException("ERROR: job unavailable")))
    }
}
