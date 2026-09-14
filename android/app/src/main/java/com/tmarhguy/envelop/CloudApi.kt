package com.tmarhguy.envelop

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.util.Base64

class CloudApi(context: Context) {
    private val prefs = context.getSharedPreferences("envelop", Context.MODE_PRIVATE)
    private val mutex = Mutex()
    var url: String = prefs.getString("url", "")!!; private set
    private var key: String = prefs.getString("key", "")!!
    private var token: JSONObject? = null
    private var expires = 0L
    val userId: String get() = token?.getJSONObject("user")?.getString("id") ?: ""
    val configured: Boolean get() = url.isNotBlank() && key.isNotBlank()
    init {
        if (!configured && BuildConfig.ENVELOP_URL.isNotBlank() && BuildConfig.ENVELOP_KEY.isNotBlank()) {
            runCatching { configure(BuildConfig.ENVELOP_URL, BuildConfig.ENVELOP_KEY) }
        }
        prefs.getString("session", null)?.let { runCatching { token = JSONObject(unseal(it)) } }
    }
    fun configure(project: String, publicKey: String) {
        val parsed = URI(project.trim())
        require(parsed.scheme == "https" && !parsed.host.isNullOrBlank() && parsed.userInfo == null && parsed.query == null && parsed.fragment == null) { "Use your project's HTTPS URL." }
        require(publicKey.trim().isNotEmpty()) { "Enter the public project key." }
        val next = project.trim().trimEnd('/')
        if (next != url) { token = null; expires = 0; prefs.edit().remove("session").apply() }
        url = next; key = publicKey.trim(); prefs.edit().putString("url",url).putString("key",key).apply()
    }
    private fun secret(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("envelop-session", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("envelop-session",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun seal(text: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,secret())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(text.toByteArray()), Base64.NO_WRAP)
    }
    private fun unseal(text: String): String {
        val data = Base64.decode(text,Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE,secret(),GCMParameterSpec(128,data.copyOfRange(0,12)))
        return String(cipher.doFinal(data.copyOfRange(12,data.size)))
    }
    private fun save(session: JSONObject) {
        prefs.edit().putString("session",seal(session.toString())).commit()
        token = session; expires = System.currentTimeMillis() + session.getLong("expires_in") * 1000
    }
    private fun http(path: String, body: JSONObject? = null, authenticated: Boolean = true): String {
        val connection = URI("$url/$path").toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 15000; connection.readTimeout = 15000
        connection.setRequestProperty("apikey",key)
        if (authenticated) connection.setRequestProperty("Authorization","Bearer ${token!!.getString("access_token")}")
        try {
            if(body != null) { connection.requestMethod="POST"; connection.doOutput=true; connection.setRequestProperty("Content-Type","application/json"); connection.outputStream.use { it.write(body.toString().toByteArray()) } }
            val code = connection.responseCode
            val result = (if(code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if(code !in 200..299) {
                val error = runCatching { JSONObject(result) }.getOrNull()
                throw IllegalStateException(error?.optString("message")?.takeIf { it.isNotEmpty() } ?: error?.optString("msg")?.takeIf { it.isNotEmpty() } ?: "Network request failed ($code)")
            }
            return result
        } finally { connection.disconnect() }
    }
    suspend fun request(path: String, body: JSONObject? = null): String = withContext(Dispatchers.IO) {
        mutex.withLock {
            require(configured) { "Configure Envelop first." }
            if(token == null) save(JSONObject(http("auth/v1/signup",JSONObject().put("data",JSONObject()),false)))
            else if(expires < System.currentTimeMillis()+60000) save(JSONObject(http("auth/v1/token?grant_type=refresh_token",JSONObject().put("refresh_token",token!!.getString("refresh_token")),false)))
            http(path,body)
        }
    }
    suspend fun rpc(name: String, vararg args: Pair<String,Any>): String = request("rest/v1/rpc/$name",JSONObject().apply { args.forEach { put(it.first,it.second) } })
    suspend fun profile(): JSONObject? = JSONArray(request("rest/v1/profiles?id=eq.$userId&select=*")).optJSONObject(0)
    suspend fun restore(): JSONObject? { if(token == null) return null; request("rest/v1/profiles?limit=0"); return profile() }
    suspend fun enter(name: String, avatar: Int): JSONObject = JSONObject(rpc("create_profile","p_name" to name,"p_avatar" to avatar))
    suspend fun people(query: String): List<JSONObject> {
        val clean = query.filter { it.isLetterOrDigit() || it == ' ' || it == '-' }
        val filter = if(clean.isEmpty()) "" else "&display_name=ilike.${URLEncoder.encode("*$clean*","UTF-8")}"
        val list = JSONArray(request("rest/v1/profiles?select=*&order=is_device.desc,display_name.asc,id.asc&limit=50$filter"))
        val result = (0 until list.length()).map { list.getJSONObject(it) }.filter { it.getString("id") != userId }.toMutableList()
        if(result.none { it.optBoolean("is_device") }) result.add(0,JSONArray(request("rest/v1/profiles?id=eq.$TOMATO&select=*")).getJSONObject(0))
        return result
    }
    suspend fun open(peer: String): String = rpc("get_or_create_dm","p_peer" to peer).trim('"')
    suspend fun history(conversation: String): List<JSONObject> {
        val list = JSONArray(request("rest/v1/messages?conversation_id=eq.$conversation&select=*&order=created_at.desc,id.desc&limit=20"))
        return (0 until list.length()).map { list.getJSONObject(it) }.reversed()
    }
    suspend fun send(conversation: String, body: String, nonce: String) { rpc("send_message","p_conversation" to conversation,"p_body" to body,"p_nonce" to nonce) }
    suspend fun online(): Boolean {
        val leases=JSONArray(request("rest/v1/device_bridges?device_id=eq.$TOMATO&select=expires_at"))
        return leases.length()>0 && java.time.OffsetDateTime.parse(leases.getJSONObject(0).getString("expires_at")).toInstant().isAfter(java.time.Instant.now())
    }
    companion object { const val TOMATO="00000000-0000-0000-0000-000000000001" }
}
