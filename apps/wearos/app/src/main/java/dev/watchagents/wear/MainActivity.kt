package dev.watchagents.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { WatchAgentsScreen() } }
}

@Composable fun WatchAgentsScreen() {
  val context = androidx.compose.ui.platform.LocalContext.current; val prefs = remember { context.getSharedPreferences("hub", 0) }
  var hubUrl by remember { mutableStateOf(prefs.getString("url", "") ?: "") }; var token by remember { mutableStateOf(prefs.getString("token", "") ?: "") }; var code by remember { mutableStateOf("") }; var runs by remember { mutableStateOf(emptyList<Run>()) }; var metrics by remember { mutableStateOf(emptyList<DailyCount>()) }; var error by remember { mutableStateOf<String?>(null) }; val scope = rememberCoroutineScope()
  fun refresh() { scope.launch { runCatching { withContext(Dispatchers.IO) { HubApi(context, hubUrl, token).let { it.runs() to it.metrics() } } }.onSuccess { (r, m) -> runs = r; metrics = m }.onFailure { error = it.message } } }
  MaterialTheme { Scaffold { if (token.isBlank()) ScalingLazyColumn { item { Text("Pair Watch Agents") }; item { OutlinedTextField(hubUrl, { hubUrl = it }, label = { Text("Hub URL") }) }; item { OutlinedTextField(code, { code = it }, label = { Text("Pairing code") }) }; item { Button({ scope.launch { runCatching { withContext(Dispatchers.IO) { HubApi(context, hubUrl, null).pair(code, "redacted") } }.onSuccess { paired -> token = paired; prefs.edit().putString("url", hubUrl).putString("token", token).apply(); FirebaseMessaging.getInstance().token.addOnSuccessListener { push -> scope.launch { withContext(Dispatchers.IO) { HubApi(context, hubUrl, token).updatePush(push) } } }; refresh() }.onFailure { error = it.message } } }) { Text("Pair") } } } else { ScalingLazyColumn { item { Text("Agent Hub") }; item { Button({ refresh() }) { Text("Refresh") } }; item { Text("Active & recent") }; items(runs.size) { index -> val run = runs[index]; Card(onClick = {}) { Column(Modifier.padding(8.dp)) { Text(run.title); Text("${run.status} · ${run.displayName}"); if (run.hitlId != null) Button({ scope.launch { withContext(Dispatchers.IO) { HubApi(context, hubUrl, token).approve(run.hitlId) }; refresh() } }) { Text("Approve") }; if (run.followUpStatus == "ready") Button({ scope.launch { withContext(Dispatchers.IO) { HubApi(context, hubUrl, token).followUp(run.id) }; refresh() } }) { Text("Run follow-up") } } } }; item { Text("Runs per day") }; items(metrics.size) { index -> Text("${metrics[index].day}: ${metrics[index].count}") } } }; error?.let { AlertDialog(onDismissRequest = { error = null }, confirmButton = { Button({ error = null }) { Text("OK") } }, title = { Text("Watch Agents") }, text = { Text(it) }) } } }
}
