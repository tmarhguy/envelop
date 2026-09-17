package com.tmarhguy.envelop.bridge

import android.app.*
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.tmarhguy.envelop.core.*
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

internal const val MAX_COMPUTE_JOBS_PER_CYCLE = 1

internal class LeaseHeartbeat(
    private val intervalMs: Long = 10_000,
    private val renew: suspend () -> Unit,
) {
    init {
        require(intervalMs > 0) { "Heartbeat interval must be positive" }
    }

    suspend fun run() {
        while (currentCoroutineContext().isActive) {
            delay(intervalMs)
            renew()
        }
    }
}

class BridgeService : Service() {
private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
private var runner: Job? = null
private var radio: BleUart? = null
private var instance: UUID? = null
private lateinit var api: CloudApi

override fun onCreate() {
super.onCreate(); api = CloudApi(applicationContext)
val channel = NotificationChannel(CHANNEL, "Tomato bridge", NotificationManager.IMPORTANCE_LOW)
getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
}
override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
when (intent?.action) {
    DISCONNECT -> stopBridge()
    else -> if (runner == null) {
        startForeground(NOTIFICATION, notification("Connecting to Tomato"))
        BridgeState.update("Connecting…", connected = true)
            runner = scope.launch { reconnectLoop() }
        }
    }
    return START_NOT_STICKY
}
override fun onDestroy() { stopBridge(); scope.cancel(); super.onDestroy() }
override fun onBind(intent: Intent?): IBinder? = null

    private suspend fun reconnectLoop() {
        var delayMs = 1_000L
        while (currentCoroutineContext().isActive) {
            try { connectOnce(); delayMs = 1_000 }
            catch (error: Throwable) {
                if (error is CancellationException) throw error
                BridgeState.update("Reconnecting…", connected = true, error = error.message ?: "Bridge failed")
            } finally {
                val old = instance
                radio?.close(); radio = null
                if (old != null) withContext(NonCancellable) { release(old) }
                instance = null
            }
            delay(delayMs); delayMs = (delayMs * 2).coerceAtMost(30_000)
        }
    }
    private suspend fun connectOnce() = coroutineScope {
        check(api.restore() != null) { "Create or restore a bridge profile first." }
        val link = BleUart(applicationContext); radio = link
        val connectionInstance = UUID.randomUUID(); instance = connectionInstance
        val parser = DeviceFrameParser()
        val helloVerified = CompletableDeferred<Unit>()
        val routes = DeviceRoutes(8)
        val deliveries = DeliveryTracker(64, 10_000)
        val deliveryRoutes = ConcurrentHashMap<UUID, Int>()
        val deliveryAcks = ConcurrentHashMap.newKeySet<UUID>()
        val outboundNonces = ConcurrentHashMap<Long, UUID>()
        val announced = mutableSetOf<Int>()
        val computeWaiters = ConcurrentHashMap<Long, CompletableDeferred<DeviceFrame>>()
        var nextToken = 1L
        BridgeState.update("Scanning for Tomato…", connected = true)
        link.start(); link.ready.await()
        BridgeState.update("Verifying Tomato…", connected = true)
        check(link.send(DeviceFrame(DeviceFrameType.HELLO).encode())) { "BLE write queue full" }
        val receiver = launch {
            for (fragment in link.incoming) {
                for (frame in parser.feed(fragment)) {
                    if (frame.type == DeviceFrameType.HELLO_ACK && frame.verifiedDeviceId != null) {
                        helloVerified.complete(Unit); continue
                    }
                    if (!helloVerified.isCompleted) continue
                    when (frame.type) {
                        DeviceFrameType.PING -> link.send(DeviceFrame(DeviceFrameType.PONG, frame.route, frame.payload).encode())
                        DeviceFrameType.MESSAGE_ACK -> if (frame.payload.size == 4) {
                            val token = DeviceFrame.readToken(frame.payload)
                            deliveries.acknowledge(token, false)?.let { message ->
                                if (deliveryAcks.add(message)) launch {
                                    runCatching { api.rpc("ack_device_message", "p_device" to CloudApi.TOMATO,
                                        "p_instance" to connectionInstance.toString(), "p_message" to message.toString()) }
                                        .onSuccess {
                                            deliveries.acknowledge(token)
                                            deliveryRoutes.remove(message)?.let(routes::release)
                                        }
                                        .also { deliveryAcks.remove(message) }
                                }
                            }
                        }
                        DeviceFrameType.SEND_MESSAGE -> if (frame.payload.size >= 5) {
                            val token = DeviceFrame.readToken(frame.payload)
                            val conversation = routes.conversation(frame.route)
                            val body = frame.payload.copyOfRange(4, frame.payload.size).toString(Charsets.US_ASCII)
                            if (conversation != null && runCatching { DeviceFrame.text(body) }.isSuccess &&
                                (outboundNonces.size < 1024 || outboundNonces.containsKey(token))) {
                                val nonce = outboundNonces.computeIfAbsent(token) { UUID.randomUUID() }
                                launch {
                                    runCatching {
                                        api.rpc("send_as_device", "p_device" to CloudApi.TOMATO,
                                            "p_instance" to connectionInstance.toString(),
                                            "p_conversation" to conversation.toString(), "p_body" to body,
                                            "p_nonce" to nonce.toString())
                                    }.onSuccess {
                                        link.send(DeviceFrame(DeviceFrameType.MESSAGE_ACK, frame.route, DeviceFrame.token(token)).encode())
                                    }
                                }
                            }
                        }
                        DeviceFrameType.COMPUTE_RESULT -> if (frame.payload.size == 9) {
                            computeWaiters.remove(DeviceFrame.readToken(frame.payload))?.complete(frame)
                        }
                        else -> Unit
                    }
                }
            }
        }
        try {
            withTimeout(5_000) { helloVerified.await() }
            BridgeState.update("Tomato verified; claiming lease…", connected = true)
            api.rpc("claim_bridge", "p_device" to CloudApi.TOMATO, "p_instance" to connectionInstance.toString())
            val heartbeat = launch {
                LeaseHeartbeat {
                    api.rpc("claim_bridge", "p_device" to CloudApi.TOMATO,
                        "p_instance" to connectionInstance.toString())
                }.run()
            }
            var resetSent = false
            try {
                while (isActive) {
                    try {
                        check(!link.disconnected.isCompleted) { "Tomato disconnected" }
                        if (!resetSent) {
                            check(link.send(DeviceFrame(DeviceFrameType.CONTACT_RESET).encode())) { "BLE write queue full" }
                            resetSent = true
                        }
                        val pending = JSONArray(api.rpc("bridge_pending", "p_device" to CloudApi.TOMATO,
                            "p_instance" to connectionInstance.toString()))
                        for (index in 0 until pending.length()) {
                            val item = pending.getJSONObject(index)
                            val message = UUID.fromString(item.getString("message_id"))
                            if (!deliveries.shouldSend(message, System.currentTimeMillis())) continue
                            val conversation = UUID.fromString(item.getString("conversation_id"))
                            val route = routes.routeFor(conversation) ?: continue
                            if (!announce(link, route, item.getString("sender_id"), announced)) continue
                            val token = deliveries.tokenFor(message) ?: continue
                            val payload = DeviceFrame.token(token) + DeviceFrame.text(item.getString("body"))
                            val previousRoute = deliveryRoutes.putIfAbsent(message, route)
                            check(previousRoute == null || previousRoute == route) { "Delivery route changed before ACK" }
                            if (previousRoute == null) routes.pin(route)
                            if (link.send(DeviceFrame(DeviceFrameType.CHAT_MESSAGE, route, payload).encode())) {
                                deliveries.markSent(message, System.currentTimeMillis())
                            } else if (previousRoute == null && deliveryRoutes.remove(message, route)) {
                                routes.release(route)
                            }
                        }
                        val jobs = JSONArray(api.rpc("bridge_compute_pending", "p_device" to CloudApi.TOMATO,
                            "p_instance" to connectionInstance.toString()))
                        for (index in 0 until minOf(MAX_COMPUTE_JOBS_PER_CYCLE, jobs.length())) {
                            val job = jobs.getJSONObject(index)
                            val conversation = UUID.fromString(job.getString("conversation_id"))
                            val route = routes.routeFor(conversation) ?: continue
                            if (!announce(link, route, job.getString("requester"), announced)) continue
                            val bytes = parseHex(job.getString("job_hex"))
                            if (bytes == null || bytes.isEmpty() || bytes.size > DeviceFrame.MAX_PAYLOAD - 4) {
                                api.rpc("bridge_finish_compute_job", "p_job" to job.getString("job_id"),
                                    "p_device" to CloudApi.TOMATO, "p_instance" to connectionInstance.toString(),
                                    "p_result_text" to null, "p_error" to "malformed job hex")
                                continue
                            }
                            if (nextToken > 0xffffffffL) continue
                            val token = nextToken++
                            routes.pin(route)
                            try {
                                api.rpc("bridge_claim_compute_job", "p_job" to job.getString("job_id"),
                                    "p_device" to CloudApi.TOMATO, "p_instance" to connectionInstance.toString())
                                val waiter = CompletableDeferred<DeviceFrame>(); computeWaiters[token] = waiter
                                if (!link.send(DeviceFrame(DeviceFrameType.COMPUTE_JOB, route, DeviceFrame.token(token) + bytes).encode())) {
                                    computeWaiters.remove(token); continue
                                }
                                val result = withTimeoutOrNull(8_000) { waiter.await() }
                                computeWaiters.remove(token)
                                if (result != null) {
                                    val value = DeviceFrame.readToken(result.payload, 5)
                                    val text = if (result.payload[4].toInt() == 0) "$value / 0x%08X".format(value)
                                        else "Tomato rejected the job (status ${result.payload[4].toInt() and 0xff})."
                                    api.rpc("bridge_finish_compute_job", "p_job" to job.getString("job_id"),
                                        "p_device" to CloudApi.TOMATO, "p_instance" to connectionInstance.toString(),
                                        "p_result_text" to text, "p_error" to null)
                                }
                            } catch (error: Exception) {
                                if (error is CancellationException) throw error
                                continue
                            } finally {
                                computeWaiters.remove(token)
                                routes.release(route)
                            }
                        }
                        if (routes.resetReady) {
                            check(link.send(DeviceFrame(DeviceFrameType.CONTACT_RESET).encode())) { "BLE write queue full" }
                            check(routes.reset()) { "Routes became busy during reset" }
                            announced.clear()
                        }
                        link.send(DeviceFrame(DeviceFrameType.STATUS, payload = byteArrayOf(2)).encode())
                        BridgeState.update("Connected and bridging", connected = true)
                    } catch (error: Throwable) {
                        if (error is CancellationException) throw error
                        link.send(DeviceFrame(DeviceFrameType.STATUS, payload = byteArrayOf(1)).encode())
                        release(connectionInstance)
                        BridgeState.update("Cloud bridge unavailable", connected = true,
                            error = error.message ?: "Cloud bridge failed")
                        throw error
                    }
                    delay(3_000)
                }
            } finally {
                heartbeat.cancel()
            }
        } catch (_: TimeoutCancellationException) {
            throw IllegalStateException("Tomato did not return the exact ENVELOP/1 identity.")
        } finally {
            receiver.cancel(); computeWaiters.values.forEach { it.cancel() }
            deliveries.clear(); deliveryRoutes.clear(); deliveryAcks.clear()
            outboundNonces.clear(); announced.clear()
        }
    }

    private suspend fun announce(link: BleUart, route: Int, sender: String, announced: MutableSet<Int>): Boolean {
        if (route in announced) return true
        val contacts = JSONArray(api.request("rest/v1/profiles?id=eq.$sender&select=*"))
        val contact = contacts.optJSONObject(0) ?: return false
        val name = contact.optString("display_name").map { if (it.code in 32..126) it else '?' }
            .joinToString("").take(32).toByteArray(Charsets.US_ASCII)
        val payload = byteArrayOf(contact.optInt("avatar_id").coerceIn(0, 255).toByte(), 1) + name
        return link.send(DeviceFrame(DeviceFrameType.CONTACT_UPSERT, route, payload).encode()).also {
            if (it) announced += route
        }
    }
    private fun parseHex(text: String): ByteArray? {
        val parts = text.trim().split(Regex("\\s+")).filter(String::isNotEmpty)
        if (parts.any { it.length != 2 }) return null
        return runCatching { parts.map { it.toInt(16).toByte() }.toByteArray() }.getOrNull()
    }
    private suspend fun release(target: UUID) {
        runCatching { api.rpc("release_bridge", "p_device" to CloudApi.TOMATO, "p_instance" to target.toString()) }
    }
    private fun stopBridge() {
        runner?.cancel(); runner = null; radio?.close(); radio = null
        BridgeState.update("Disconnected")
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }
    private fun notification(text: String): Notification {
        val pending = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("Envelop Tomato Bridge").setContentText(text).setOngoing(true).setContentIntent(pending).build()
    }
    companion object {
        const val CONNECT = "com.tmarhguy.envelop.bridge.CONNECT"
        const val DISCONNECT = "com.tmarhguy.envelop.bridge.DISCONNECT"
        private const val CHANNEL = "tomato_bridge"; private const val NOTIFICATION = 1001
    }
}
