package dev.watchagents.wear

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class WatchAgentsMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val prefs = getSharedPreferences("hub", MODE_PRIVATE)
        val url = prefs.getString("url", null) ?: return
        val auth = prefs.getString("token", null) ?: return
        CoroutineScope(Dispatchers.IO).launch { runCatching { HubApi(this@WatchAgentsMessagingService, url, auth).updatePush(token) } }
    }
    override fun onMessageReceived(message: RemoteMessage) { super.onMessageReceived(message) }
}
