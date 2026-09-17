package com.tmarhguy.envelop.core

import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class DeviceProtocolTest {
@Test fun exactPublishedVectors() {
fun b(s:String)=s.chunked(2).filter{it.isNotEmpty()}.map{it.toInt(16).toByte()}.toByteArray()
val r=Regex("(?s)\\{.*?\"type\": (\\d+).*?\"route\": (\\d+).*?\"payload_hex\": \"(.*?)\".*?\"frame_hex\": \"(.*?)\".*?\\}")
val vectors = java.io.File("../../protocol/test-vectors/frames.json")
assertTrue("Shared protocol vectors missing at ${vectors.canonicalPath}", vectors.isFile)
val v=r.findAll(vectors.readText()).toList()
v.forEach{val f=DeviceFrame(DeviceFrameType.fromWire(it.groupValues[1].toInt())!!,it.groupValues[2].toInt(),b(it.groupValues[3]));assertArrayEquals(b(it.groupValues[4]),f.encode());assertEquals(listOf(f),DeviceFrameParser().feed(f.encode()))}
assertEquals(8,v.size)
}

@Test fun fragmentationNoiseAndCrcRecovery() {
  val frame = DeviceFrame(DeviceFrameType.CHAT_MESSAGE, 513, DeviceFrame.text("hello"))
  val encoded = frame.encode()
  for (split in 0..encoded.size) {
      val parser = DeviceFrameParser()
      assertEquals(listOf(frame), parser.feed(encoded.copyOfRange(0, split)) + parser.feed(encoded.copyOfRange(split, encoded.size)))
  }
  val corrupt = encoded.copyOf().also { it[it.lastIndex] = (it.last() + 1).toByte() }
  val stream = byteArrayOf(0, 1, 0x50) + corrupt + byteArrayOf(0x50, 0x47, 1, 1, 0, 0, -1, -1) + encoded + encoded
  assertEquals(listOf(frame, frame), DeviceFrameParser().feed(stream))
}

@Test fun identityAndTextValidation() {
   listOf("hello 🌍", "hello\nworld", "a".repeat(257)).forEach {
       assertThrows(IllegalArgumentException::class.java) { DeviceFrame.text(it) }
   }
   assertThrows(IllegalArgumentException::class.java) {
       DeviceFrame(DeviceFrameType.HELLO, payload = ByteArray(513))
   }
   assertEquals("TOMATO-001", DeviceFrame(DeviceFrameType.HELLO_ACK,
       payload = DeviceFrame.HELLO_ACK_TEXT.toByteArray()).verifiedDeviceId)
   assertNull(DeviceFrame(DeviceFrameType.HELLO_ACK, payload = "Tomato".toByteArray()).verifiedDeviceId)
}

@Test fun routesAreBoundedAndSessionLocal() {
   val routes = DeviceRoutes()
   val ids = List(9) { UUID.randomUUID() }
   assertEquals(1, routes.routeFor(ids[0]))
    assertEquals(1, routes.routeFor(ids[0]))
    (1..7).forEach { assertEquals(it + 1, routes.routeFor(ids[it])) }
    assertNull(routes.routeFor(ids[8]))
    routes.reset()
    assertEquals(1, routes.routeFor(ids[8]))
}

@Test fun deliveryTokensAreStableBoundedAndRetried() {
    val tracker= DeliveryTracker(maximum = 2, retryAfterMs = 10_000)
    val first = UUID.randomUUID(); val second = UUID.randomUUID()
    assertEquals(1L, tracker.tokenFor(first)); assertEquals(1L, tracker.tokenFor(first))
    assertTrue(tracker.shouldSend(first, 0)); tracker.markSent(first, 0)
    assertFalse(tracker.shouldSend(first, 9_999)); assertTrue(tracker.shouldSend(first, 10_000))
    assertEquals(2L, tracker.tokenFor(second)); assertNull(tracker.tokenFor(UUID.randomUUID()))
    assertEquals(first, tracker.acknowledge(1)); assertNull(tracker.acknowledge(1))
}

@Test fun token()=assertEquals(1L,DeviceFrame.readToken(byteArrayOf(0,0,0,1)))
}
