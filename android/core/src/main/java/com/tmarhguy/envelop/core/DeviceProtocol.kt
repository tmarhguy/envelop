package com.tmarhguy.envelop.core

import java.io.ByteArrayOutputStream
import java.util.UUID

enum class DeviceFrameType(val wire: Int) {
HELLO(1), HELLO_ACK(2), CONTACT_RESET(3), CONTACT_UPSERT(4), OPEN_CHAT(5),
CHAT_HISTORY(6), CHAT_MESSAGE(7), SEND_MESSAGE(8), MESSAGE_ACK(9), STATUS(10),
PING(11), PONG(12), COMPUTE_JOB(32), COMPUTE_RESULT(33);
companion object { fun fromWire(value: Int) = entries.firstOrNull { it.wire == value } }
}

data class DeviceFrame(val type: DeviceFrameType, val route: Int = 0, val payload: ByteArray = byteArrayOf()) {
init {
    require(route in 0..0xffff) { "Invalid route" }
    require(payload.size <= MAX_PAYLOAD) { "Payload exceeds $MAX_PAYLOAD bytes" }
}
fun encode(): ByteArray {
        val out = ByteArray(10 + payload.size)
        out[0] = 0x50; out[1] = 0x47; out[2] = 1; out[3] = type.wire.toByte()
        out[4] = (route ushr 8).toByte(); out[5] = route.toByte()
        out[6] = (payload.size ushr 8).toByte(); out[7] = payload.size.toByte()
        payload.copyInto(out, 8)
        val crc = crc16(out.copyOfRange(0, 8 + payload.size))
        out[out.lastIndex - 1] = (crc ushr 8).toByte(); out[out.lastIndex] = crc.toByte()
        return out
    }
    val verifiedDeviceId: String?
        get() = if (type == DeviceFrameType.HELLO_ACK && route == 0 &&
            payload.contentEquals(HELLO_ACK_TEXT.toByteArray(Charsets.US_ASCII))) "TOMATO-001" else null
    companion object {
        const val MAX_PAYLOAD = 512
        const val HELLO_ACK_TEXT = "ENVELOP/1\nDEVICE=TOMATO\nID=TOMATO-001"
        fun text(value: String, max: Int = 256): ByteArray {
            val bytes = value.toByteArray(Charsets.US_ASCII)
            require(bytes.isNotEmpty() && bytes.size <= max && value.all { it.code in 32..126 }) { "Invalid printable ASCII text" }
            return bytes
        }
        fun token(value: Long) = byteArrayOf((value ushr 24).toByte(), (value ushr 16).toByte(), (value ushr 8).toByte(), value.toByte())
        fun readToken(bytes: ByteArray, offset: Int = 0): Long {
            require(bytes.size >= offset + 4)
            return (0..3).fold(0L) { value, index -> (value shl 8) or (bytes[offset + index].toLong() and 0xff) }
        }
        fun crc16(bytes: ByteArray): Int {
            var crc = 0xffff
            bytes.forEach { byte ->
                crc = crc xor ((byte.toInt() and 0xff) shl 8)
                repeat(8) { crc = if (crc and 0x8000 != 0) ((crc shl 1) xor 0x1021) and 0xffff else (crc shl 1) and 0xffff }
            }
            return crc
        }
    }
    override fun equals(other: Any?) = other is DeviceFrame && type == other.type && route == other.route && payload.contentEquals(other.payload)
    override fun hashCode() = 31 * (31 * type.hashCode() + route) + payload.contentHashCode()
}

class DeviceFrameParser {
    private val buffer = ByteArrayOutputStream()
    fun reset() = buffer.reset()
    fun feed(fragment: ByteArray): List<DeviceFrame> {
        buffer.write(fragment)
        var bytes = buffer.toByteArray()
        val frames = mutableListOf<DeviceFrame>()
        var offset = 0
        while (bytes.size - offset >= 2) {
            if (bytes[offset] != 0x50.toByte() || bytes[offset + 1] != 0x47.toByte()) { offset++; continue }
            if (bytes.size - offset < 8) break
            val length = ((bytes[offset + 6].toInt() and 0xff) shl 8) or (bytes[offset + 7].toInt() and 0xff)
            val type = DeviceFrameType.fromWire(bytes[offset + 3].toInt() and 0xff)
            if (bytes[offset + 2] != 1.toByte() || type == null || length > DeviceFrame.MAX_PAYLOAD) { offset++; continue }
            val total = length + 10
            if (bytes.size - offset < total) break
            val expected = ((bytes[offset + total - 2].toInt() and 0xff) shl 8) or (bytes[offset + total - 1].toInt() and 0xff)
            if (DeviceFrame.crc16(bytes.copyOfRange(offset, offset + total - 2)) != expected) { offset++; continue }
            val route = ((bytes[offset + 4].toInt() and 0xff) shl 8) or (bytes[offset + 5].toInt() and 0xff)
            frames += DeviceFrame(type, route, bytes.copyOfRange(offset + 8, offset + 8 + length))
            offset += total
        }
        buffer.reset()
        if (offset < bytes.size) buffer.write(bytes, offset, bytes.size - offset)
        return frames
    }
}

class DeviceRoutes(private val maximumActive: Int = 8) {
    private val byRoute = linkedMapOf<Int, UUID>()
    private val byConversation = mutableMapOf<UUID, Int>()
    private val pins = mutableMapOf<Int, Int>()
    private var next = 1
    private var resetRequested = false

    init {
        require(maximumActive in 1..0xffff) { "Invalid active route limit" }
    }

    val conversations: Map<Int, UUID>
        @Synchronized get() = byRoute.toMap()
    val activeCount: Int
        @Synchronized get() = byRoute.size
    val pinnedCount: Int
        @Synchronized get() = pins.values.sum()
    val resetReady: Boolean
        @Synchronized get() = resetRequested && pins.isEmpty()

    @Synchronized
    fun routeFor(conversation: UUID): Int? {
        byConversation[conversation]?.let { return it }
        if (byRoute.size >= maximumActive || next > 0xffff) {
            resetRequested = true
            return null
        }
        return next++.also {
            byRoute[it] = conversation
            byConversation[conversation] = it
        }
    }

    @Synchronized
    fun pin(route: Int) {
        require(byRoute.containsKey(route)) { "Unknown route" }
        pins[route] = (pins[route] ?: 0) + 1
    }

    @Synchronized
    fun release(route: Int) {
        val count = pins[route] ?: throw IllegalStateException("Route is not pinned")
        if (count == 1) pins.remove(route) else pins[route] = count - 1
    }

    @Synchronized
    fun reset(): Boolean {
        if (pins.isNotEmpty()) return false
        byRoute.clear()
        byConversation.clear()
        resetRequested = false
        next = 1
        return true
    }

    @Synchronized
    fun conversation(route: Int) = byRoute[route]
}

class DeliveryTracker(private val maximum: Int = 64, private val retryAfterMs: Long = 10_000) {
    data class Entry(val token: Long, var lastSentAt: Long = Long.MIN_VALUE)
    private val entries = linkedMapOf<UUID, Entry>()
    private var next = 1L
    @Synchronized
    fun tokenFor(message: UUID): Long? = entries[message]?.token ?: if (entries.size >= maximum || next > 0xffffffffL) null
        else next++.also { entries[message] = Entry(it) }
    @Synchronized
    fun shouldSend(message: UUID, now: Long): Boolean {
        val entry = entries[message] ?: return true
        return entry.lastSentAt == Long.MIN_VALUE || now - entry.lastSentAt >= retryAfterMs
    }
    @Synchronized
    fun markSent(message: UUID, now: Long) { entries[message]?.lastSentAt = now }
    @Synchronized
    fun acknowledge(token: Long, remove: Boolean = true): UUID? = entries.entries.firstOrNull { it.value.token == token }?.key?.also { if (remove) entries.remove(it) }
    @Synchronized
    fun clear() { entries.clear(); next = 1 }
}
