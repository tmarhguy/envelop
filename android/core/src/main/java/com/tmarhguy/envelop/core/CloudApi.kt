package com.tmarhguy.envelop.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class ComputeJob(
    val id: String,
    val status: String,
    val resultText: String?,
    val error: String?,
)

sealed interface HardwareComputeResult {
    data class Physical(val result: String) : HardwareComputeResult
    data class Unavailable(val reason: String) : HardwareComputeResult
    data class Unknown(val reason: String) : HardwareComputeResult
}

class NeedsSignIn(message: String = "Sign in with the owner email and password.") :
    IllegalStateException(message)

class CloudApi(context: Context) {
    private class HttpFailure(
        val status: Int,
        val apiCode: String?,
        message: String,
    ) : IllegalStateException(message)

    private val prefs = context.getSharedPreferences("envelop", Context.MODE_PRIVATE)
    private val mutex = Mutex()
    var url: String = prefs.getString("url", "")!!; private set
    private var key: String = prefs.getString("key", "")!!
    private var token: JSONObject? = null
    private var expires = 0L
    val userId: String get() = token?.getJSONObject("user")?.getString("id") ?: ""
    val configured: Boolean get() = url.isNotBlank() && key.isNotBlank()
    val hasSession: Boolean get() = token != null
    val isAnonymousUser: Boolean
        get() = token?.optJSONObject("user")?.optBoolean("is_anonymous", true) == true

    init {
        if (!configured) {
            val appConfig = runCatching {
                val type = Class.forName("${context.packageName}.BuildConfig")
                type.getField("ENVELOP_URL").get(null) as String to
                    (type.getField("ENVELOP_KEY").get(null) as String)
            }.getOrNull()
            val baked = appConfig?.takeIf { it.first.isNotBlank() && it.second.isNotBlank() }
                ?: (BuildConfig.ENVELOP_URL to BuildConfig.ENVELOP_KEY)
            if (baked.first.isNotBlank() && baked.second.isNotBlank()) {
                runCatching { configure(baked.first, baked.second) }
            }
        }
        prefs.getString("session", null)?.let { runCatching { token = JSONObject(unseal(it)) } }
    }

    fun configure(project: String, publicKey: String) {
        val parsed = URI(project.trim())
        require(parsed.scheme == "https" && !parsed.host.isNullOrBlank() && parsed.userInfo == null &&
            parsed.query == null && parsed.fragment == null) { "Use your project's HTTPS URL." }
        require(publicKey.trim().isNotEmpty()) { "Enter the public project key." }
        val next = project.trim().trimEnd('/')
        if (next != url) { token = null; expires = 0; prefs.edit().remove("session").apply() }
        url = next; key = publicKey.trim()
        prefs.edit().putString("url", url).putString("key", key).apply()
    }

    private fun secret(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("envelop-session", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("envelop-session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun seal(text: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secret())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(text.toByteArray()), Base64.NO_WRAP)
    }
    private fun unseal(text: String): String {
        val data = Base64.decode(text, Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secret(), GCMParameterSpec(128, data.copyOfRange(0, 12)))
        return String(cipher.doFinal(data.copyOfRange(12, data.size)))
    }
    private fun save(session: JSONObject) {
        prefs.edit().putString("session", seal(session.toString())).commit()
        token = session; expires = System.currentTimeMillis() + session.getLong("expires_in") * 1000
    }
    private fun clearSession() {
        token = null
        expires = 0
        prefs.edit().remove("session").commit()
    }
    private fun http(
        path: String,
        body: JSONObject? = null,
        authenticated: Boolean = true,
        method: String? = null,
    ): String {
        val connection = URI("$url/$path").toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000; connection.readTimeout = 15_000
        connection.setRequestProperty("apikey", key)
        if (authenticated) connection.setRequestProperty("Authorization", "Bearer ${token!!.getString("access_token")}")
        try {
            if (body != null) {
                connection.requestMethod = method ?: "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            } else if (method != null) {
                connection.requestMethod = method
            }
            val code = connection.responseCode
            val result = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                val error = runCatching { JSONObject(result) }.getOrNull()
                val apiCode = error?.optString("code")?.takeIf(String::isNotEmpty)
                    ?: error?.optString("error_code")?.takeIf(String::isNotEmpty)
                val message = error?.optString("message")?.takeIf(String::isNotEmpty)
                    ?: error?.optString("msg")?.takeIf(String::isNotEmpty)
                    ?: error?.optString("error_description")?.takeIf(String::isNotEmpty)
                    ?: "Network request failed ($code)"
                throw HttpFailure(code, apiCode, message)
            }
            return result
        } finally { connection.disconnect() }
    }
    private fun ensureAuthenticatedSession() {
        require(configured) { "Configure Envelop first." }
        if (token == null) throw NeedsSignIn()
        if (expires >= System.currentTimeMillis() + 60_000) return
        try {
            save(JSONObject(http("auth/v1/token?grant_type=refresh_token",
                JSONObject().put("refresh_token", token!!.getString("refresh_token")), false)))
        } catch (error: HttpFailure) {
            if (!isDefinitivelyInvalidRefreshToken(error.status, error.apiCode, error.message)) throw error
            clearSession()
            throw NeedsSignIn("Session expired. Sign in with the owner password.")
        }
    }
    suspend fun request(path: String, body: JSONObject? = null): String = withContext(Dispatchers.IO) {
        mutex.withLock {
            ensureAuthenticatedSession()
            http(path, body)
        }
    }
    suspend fun signInWithPassword(
        email: String = OWNER_EMAIL,
        password: String = OWNER_PASSWORD,
    ): JSONObject = withContext(Dispatchers.IO) {
        mutex.withLock {
            require(configured) { "Configure Envelop first." }
            val session = JSONObject(http(
                "auth/v1/token?grant_type=password",
                JSONObject().put("email", email.trim()).put("password", password),
                false,
            ))
            save(session)
            session
        }
    }
    suspend fun beginAnonymousSetup(): JSONObject = withContext(Dispatchers.IO) {
        mutex.withLock {
            require(configured) { "Configure Envelop first." }
            clearSession()
            save(JSONObject(http("auth/v1/signup", JSONObject().put("data", JSONObject()), false)))
        }
        enter("Private owner setup", 7)
    }
    suspend fun setOwnerCredentials(
        email: String = OWNER_EMAIL,
        password: String = OWNER_PASSWORD,
    ): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            ensureAuthenticatedSession()
            http(
                "auth/v1/user",
                JSONObject().put("email", email.trim()).put("password", password),
                true,
                "PUT",
            )
            // Keep the current access token; next restore can use password if local session is cleared.
        }
    }
    suspend fun ensureOwnerPasswordBound(): Boolean {
        if (!hasSession) return false
        return runCatching {
            setOwnerCredentials()
            true
        }.getOrDefault(false)
    }
    suspend fun signOut() = withContext(Dispatchers.IO) {
        mutex.withLock { clearSession() }
    }
    suspend fun rpc(name: String, vararg args: Pair<String, Any?>): String =
        request("rest/v1/rpc/$name", JSONObject().apply { args.forEach { put(it.first, it.second ?: JSONObject.NULL) } })
    suspend fun profile(): JSONObject? = JSONArray(request("rest/v1/profiles?id=eq.$userId&select=*")).optJSONObject(0)
    suspend fun restore(): JSONObject? {
        if (token == null) return null
        return runCatching {
            request("rest/v1/profiles?limit=0")
            profile()
        }.recoverCatching { error ->
            if (error !is NeedsSignIn) throw error
            null
        }.getOrNull()
    }
    suspend fun preparePrivateOwner(): JSONObject? {
        restore()?.let { return it }
        runCatching { signInWithPassword() }
        restore()?.let { return it }
        return null
    }
    suspend fun enter(name: String, avatar: Int): JSONObject =
        JSONObject(rpc("create_profile", "p_name" to name, "p_avatar" to avatar))
    suspend fun updateProfileName(name: String): JSONObject =
        JSONObject(rpc("update_profile_name", "p_name" to name))
    suspend fun amIAdmin(): Boolean = rpc("am_i_admin").trim().toBooleanStrict()
    suspend fun adminRemoveProfile(userId: String) {
        rpc("admin_remove_profile", "p_user" to userId)
    }
    suspend fun adminFlush() {
        rpc("admin_flush")
    }
    suspend fun adminSetVerified(userId: String, verified: Boolean) {
        rpc("admin_set_verified", "p_user" to userId, "p_verified" to verified)
    }
    suspend fun trustedBridgeIds(): Set<String> {
        val raw = rpc("owner_trusted_bridge_ids")
        val array = when {
            raw.trimStart().startsWith("[") -> JSONArray(raw)
            else -> jsonObject(raw).optJSONArray("trusted_bridge_ids") ?: JSONArray()
        }
        return (0 until array.length()).mapNotNull {
            array.optString(it).takeIf(String::isNotBlank)
        }.toSet()
    }
    suspend fun setTrustedBridge(userId: String, trusted: Boolean) {
        rpc("owner_set_trusted_bridge", "p_user" to userId, "p_trusted" to trusted)
    }
    suspend fun people(query: String): List<JSONObject> {
        val clean = query.filter { it.isLetterOrDigit() || it == ' ' || it == '-' }
        val filter = if (clean.isEmpty()) "" else "&display_name=ilike.${URLEncoder.encode("*$clean*", "UTF-8")}"
        val list = JSONArray(request("rest/v1/profiles?select=*&order=is_device.desc,display_name.asc,id.asc&limit=50$filter"))
        val result = (0 until list.length()).map { list.getJSONObject(it) }.filter { it.getString("id") != userId }.toMutableList()
        if (result.none { it.optBoolean("is_device") }) {
            JSONArray(request("rest/v1/profiles?id=eq.$TOMATO&select=*")).optJSONObject(0)?.let { result.add(0, it) }
        }
        return result
    }
    suspend fun open(peer: String): String = rpc("get_or_create_dm", "p_peer" to peer).trim('"')
    suspend fun history(conversation: String): List<JSONObject> {
        val list = JSONArray(request("rest/v1/messages?conversation_id=eq.$conversation&select=*&order=created_at.desc,id.desc&limit=20"))
        return (0 until list.length()).map { list.getJSONObject(it) }.reversed()
    }
    suspend fun send(conversation: String, body: String, nonce: String) {
        rpc("send_message", "p_conversation" to conversation, "p_body" to body, "p_nonce" to nonce)
    }
    suspend fun online(): Boolean {
        val leases = JSONArray(request("rest/v1/device_bridges?device_id=eq.$TOMATO&select=expires_at"))
        return leases.length() > 0 && java.time.OffsetDateTime.parse(leases.getJSONObject(0).getString("expires_at"))
            .toInstant().isAfter(java.time.Instant.now())
    }

    suspend fun enqueueComputeJob(conversation: String, jobHex: String): ComputeJob =
        parseComputeJob(rpc("enqueue_compute_job", "p_device" to TOMATO, "p_conversation" to conversation, "p_job_hex" to jobHex))

    suspend fun computeJob(jobId: String): ComputeJob =
        parseComputeJob(rpc("my_compute_job", "p_job" to jobId))

    suspend fun cancelComputeJob(jobId: String): ComputeJob =
        parseComputeJob(rpc("cancel_compute_job", "p_job" to jobId))

    suspend fun executeDurableCompute(conversation: String, jobHex: String): HardwareComputeResult {
        val submitted = try {
            enqueueComputeJob(conversation, jobHex)
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            return HardwareComputeResult.Unknown(
                "Hardware submission could not be confirmed. No result will be invented or replayed.",
            )
        }
        val deadline = System.currentTimeMillis() + 25_000
        while (System.currentTimeMillis() < deadline) {
            delay(2_000)
            val current = try {
                computeJob(submitted.id)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                return cancelAndResolve(submitted.id)
            }
            resolveTerminal(current)?.let { return it }
        }
        return cancelAndResolve(submitted.id)
    }

    private suspend fun cancelAndResolve(jobId: String): HardwareComputeResult =
        try {
            resolveTerminal(cancelComputeJob(jobId))
                ?: HardwareComputeResult.Unknown("Hardware completion is unknown. No result will be invented or replayed.")
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            HardwareComputeResult.Unknown("Hardware cancellation could not be confirmed. No result will be invented or replayed.")
        }

    private fun resolveTerminal(job: ComputeJob): HardwareComputeResult? = when (job.status.lowercase()) {
        "completed" -> HardwareComputeResult.Physical(job.resultText ?: "Tomato completed the job.")
        "cancelled", "failed" -> HardwareComputeResult.Unavailable(
            job.error ?: job.resultText ?: "The physical hardware job ended without a result.",
        )
        else -> null
    }

    private fun parseComputeJob(raw: String): ComputeJob {
        val value = jsonObject(raw)
        return ComputeJob(
            id = value.getString("id"),
            status = value.getString("status"),
            resultText = value.optString("result_text").takeIf(String::isNotBlank),
            error = value.optString("error").takeIf(String::isNotBlank),
        )
    }

    private fun jsonObject(raw: String): JSONObject {
        val clean = raw.trim()
        if (clean.startsWith("[")) {
            return JSONArray(clean).optJSONObject(0)
                ?: throw IllegalStateException("The server returned an empty response.")
        }
        return JSONObject(clean)
    }

    companion object {
        const val TOMATO = "00000000-0000-0000-0000-000000000001"
        /** Private owner recovery login baked into the operator APK. */
        const val OWNER_EMAIL = "owner@envelop.private"
        const val OWNER_PASSWORD = "Sudoku@233"
    }
}

internal fun isDefinitivelyInvalidRefreshToken(status: Int, apiCode: String?, message: String?): Boolean {
    if (status != 400 && status != 401) return false
    val normalizedCode = apiCode?.trim()?.lowercase()
    if (normalizedCode == "refresh_token_not_found" || normalizedCode == "refresh_token_already_used") return true
    val normalizedMessage = message?.trim()?.lowercase().orEmpty()
    return normalizedMessage.contains("invalid refresh token") ||
        (normalizedMessage.contains("refresh token") &&
            (normalizedMessage.contains("not found") || normalizedMessage.contains("already used")))
}
