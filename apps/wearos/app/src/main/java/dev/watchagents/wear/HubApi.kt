package dev.watchagents.wear

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.time.Instant
import java.util.UUID

data class Run(val id: String, val title: String, val summary: String?, val status: String, val provider: String, val displayName: String, val hitlId: String?, val hitlLabel: String?, val followUpStatus: String?)
data class DailyCount(val day: String, val count: Int)

class DeviceIdentity(context: Context) {
    private val alias = "watch-agents-device"
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    init { if (!keyStore.containsAlias(alias)) KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply { initialize(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY).setDigests(KeyProperties.DIGEST_SHA256).build()); generateKeyPair() } }
    val publicKeyPem: String get() { val der = keyStore.getCertificate(alias).publicKey.encoded; return "-----BEGIN PUBLIC KEY-----\n${Base64.encodeToString(der, Base64.NO_WRAP)}\n-----END PUBLIC KEY-----" }
    fun sign(message: String): String { val signature = Signature.getInstance("SHA256withECDSA"); signature.initSign(keyStore.getKey(alias, null) as java.security.PrivateKey); signature.update(message.toByteArray()); return Base64.encodeToString(signature.sign(), Base64.NO_WRAP) }
}

class HubApi(private val context: Context, private val baseUrl: String, private val token: String?) {
    private val identity = DeviceIdentity(context)
    private fun request(path: String, method: String = "GET", body: JSONObject? = null, signed: Boolean = false): JSONObject {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply { requestMethod = method; setRequestProperty("content-type", "application/json"); token?.let { setRequestProperty("authorization", "Bearer $it") }; if (signed) { val nonce = UUID.randomUUID().toString(); setRequestProperty("x-watch-nonce", nonce); setRequestProperty("x-watch-signature", identity.sign("$method:$path:$nonce")) }; body?.let { doOutput = true; outputStream.use { it.write(it.toString().toByteArray()) } } }
        val content = (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream).bufferedReader().readText(); if (connection.responseCode !in 200..299) error(content); return if (content.isBlank()) JSONObject() else JSONObject(content)
    }
    fun pair(code: String, privacy: String): String = request("/v1/devices/pair", "POST", JSONObject().put("code", code).put("label", "Wear OS watch").put("platform", "wearos").put("publicKeyPem", identity.publicKeyPem).put("privacyMode", privacy)).getString("token")
    fun runs(): List<Run> { val values = request("/v1/runs?limit=20").getJSONArray("runs"); return List(values.length()) { i -> values.getJSONObject(i).let { Run(it.getString("id"), it.getString("title"), it.optString("summary", null), it.getString("status"), it.getString("provider"), it.getString("display_name"), it.optString("hitl_id", null), it.optString("hitl_label", null), it.optString("follow_up_status", null)) } } }
    fun metrics(): List<DailyCount> { val values = request("/v1/metrics/runs/daily?days=7&timezone=${java.util.TimeZone.getDefault().id}").getJSONArray("series"); return List(values.length()) { i -> values.getJSONObject(i).let { DailyCount(it.getString("day"), it.getInt("count")) } } }
    fun approve(id: String) { request("/v1/hitl/$id/approve", "POST", JSONObject(), true) }
    fun followUp(id: String) { request("/v1/runs/$id/follow-up/dispatch", "POST", JSONObject(), true) }
    fun updatePush(token: String, privacy: String = "redacted") { request("/v1/devices/current/push", "PUT", JSONObject().put("pushToken", token).put("privacyMode", privacy)) }
}
