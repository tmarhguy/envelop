package com.tmarhguy.envelop.bridge

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.tmarhguy.envelop.core.CloudApi
import com.tmarhguy.envelop.core.HardwareComputeResult
import com.tmarhguy.envelop.core.TomatoCompiler
import com.tmarhguy.envelop.core.TomatoProgram
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

private data class ComputeCard(
    val id: String,
    val conversation: String,
    val prompt: String,
    val program: TomatoProgram,
    val status: String,
    val result: String = "",
    val error: String = "",
)

@Composable
fun ChatScreen(
    api: CloudApi,
    profile: JSONObject?,
    profileRevision: Int,
    isAdmin: Boolean,
    onFlush: suspend () -> Unit,
    onError: (Throwable, String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var people by remember { mutableStateOf(listOf<JSONObject>()) }
    var selected by remember { mutableStateOf<JSONObject?>(null) }
    var conversation by remember { mutableStateOf<String?>(null) }
    var messages by remember { mutableStateOf(listOf<JSONObject>()) }
    var query by remember { mutableStateOf("") }
    var draft by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var online by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<Triple<String, String, String>?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var confirmation by remember { mutableStateOf<Pair<AdminAction, JSONObject?>?>(null) }
    var trustedBridgeIds by remember { mutableStateOf(emptySet<String>()) }
    val computeCards = remember { mutableStateMapOf<String, ComputeCard>() }

    LaunchedEffect(profileRevision) {
        selected = null
        conversation = null
        messages = emptyList()
    }
    LaunchedEffect(profileRevision, query, reload) {
        if (profile != null) {
            delay(250)
            runCatching {
                val nextPeople = api.people(query)
                val trusted = if (isAdmin) api.trustedBridgeIds() else emptySet()
                nextPeople to trusted
            }.onSuccess {
                people = it.first
                trustedBridgeIds = it.second
            }
                .onFailure { error = it.message ?: "Search failed" }
        }
    }
    LaunchedEffect(profileRevision, conversation) {
        while (profile != null) {
            val current = conversation
            runCatching {
                online = api.online()
                if (current != null) api.history(current).also { if (current == conversation) messages = it }
            }.onFailure { online = false; error = it.message ?: "Connection failed" }
            delay(3_000)
        }
    }

    fun executeAdminAction(action: AdminAction, person: JSONObject?) {
        if (busy) return
        busy = true
        scope.launch {
            runCatching {
                when (action) {
                    AdminAction.REMOVE -> api.adminRemoveProfile(person!!.getString("id"))
                    AdminAction.VERIFY -> api.adminSetVerified(person!!.getString("id"), true)
                    AdminAction.UNVERIFY -> api.adminSetVerified(person!!.getString("id"), false)
                    AdminAction.GRANT_BRIDGE -> api.setTrustedBridge(person!!.getString("id"), true)
                    AdminAction.REVOKE_BRIDGE -> api.setTrustedBridge(person!!.getString("id"), false)
                    AdminAction.FLUSH -> onFlush()
                }
                if (action == AdminAction.GRANT_BRIDGE || action == AdminAction.REVOKE_BRIDGE) {
                    trustedBridgeIds = api.trustedBridgeIds()
                }
            }.onSuccess {
                error = ""
                if (action == AdminAction.FLUSH) {
                    people = emptyList()
                    selected = null
                    conversation = null
                } else {
                    reload++
                }
            }.onFailure {
                error = it.message ?: "Admin action failed"
                onError(it, "Admin action failed")
            }
            busy = false
        }
    }

    confirmation?.let { (action, person) ->
        val targetName = person?.optString("display_name").orEmpty()
        AlertDialog(
            onDismissRequest = { if (!busy) confirmation = null },
            title = {
                Text(
                    when (action) {
                        AdminAction.REMOVE -> "Remove $targetName?"
                        AdminAction.UNVERIFY -> "Unverify $targetName?"
                        AdminAction.REVOKE_BRIDGE -> "Revoke Tomato bridge?"
                        AdminAction.FLUSH -> "Flush Envelop?"
                        else -> "Confirm action"
                    },
                )
            },
            text = {
                Text(
                    when (action) {
                        AdminAction.REMOVE -> "This permanently removes the profile and its conversations."
                        AdminAction.UNVERIFY -> "This removes the profile's verified status."
                        AdminAction.REVOKE_BRIDGE -> "$targetName will no longer be able to bridge Tomato."
                        AdminAction.FLUSH -> "This permanently clears non-device profiles, chats, queues, and bridge grants."
                        else -> "Continue?"
                    },
                )
            },
            confirmButton = {
                Button(
                    enabled = !busy,
                    onClick = {
                        confirmation = null
                        executeAdminAction(action, person)
                    },
                ) { Text("Confirm") }
            },
            dismissButton = {
                TextButton(enabled = !busy, onClick = { confirmation = null }) { Text("Cancel") }
            },
        )
    }

    Column(
        Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Envelop", style = MaterialTheme.typography.titleLarge)
        if (!api.configured) {
            Text("This private build has no Envelop network configuration.")
        } else if (profile == null) {
            Text("Private owner setup is incomplete. Open the Bridge tab for details.")
        } else if (!isAdmin) {
            Text("Finish the one-time owner setup in the Bridge tab.")
        } else if (selected == null) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Signed in as ${profile.optString("display_name")}", style = MaterialTheme.typography.bodySmall)
                if (isAdmin) {
                    TextButton(
                        enabled = !busy,
                        onClick = { confirmation = AdminAction.FLUSH to null },
                    ) { Text("Flush") }
                }
            }
            OutlinedTextField(query, { query = it }, label = { Text("Find people") }, modifier = Modifier.fillMaxWidth())
            LazyColumn(Modifier.weight(1f)) {
                items(people, key = { it.getString("id") }) { person ->
                    Column(Modifier.fillMaxWidth()) {
                        TextButton(
                            onClick = {
                                selected = person; messages = emptyList(); conversation = null; draft = ""
                                scope.launch {
                                    runCatching { api.open(person.getString("id")) }
                                        .onSuccess { if (selected?.getString("id") == person.getString("id")) conversation = it }
                                        .onFailure { error = it.message ?: "Could not open chat" }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(Modifier.fillMaxWidth()) {
                                Text(buildAnnotatedString {
                                    append(person.getString("display_name"))
                                    if (person.optBoolean("verified")) {
                                        append(" ")
                                        withStyle(SpanStyle(color = Color(0xFF1D9BF0))) { append("✓") }
                                    }
                                }, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    if (person.optBoolean("is_device")) {
                                        if (online) "Online" else "Offline · messages will wait"
                                    } else "@${person.getString("handle")}",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                        if (isAdmin) {
                            val actions = adminActionsFor(
                                selfId = api.userId,
                                targetId = person.getString("id"),
                                isDevice = person.optBoolean("is_device"),
                                verified = person.optBoolean("verified"),
                                trustedBridgeIds = trustedBridgeIds,
                            )
                            if (actions.isNotEmpty()) {
                                Column(Modifier.padding(start = 8.dp, bottom = 8.dp)) {
                                    Row {
                                        if (AdminAction.REMOVE in actions) {
                                            AdminActionButton("Remove", busy) {
                                                confirmation = AdminAction.REMOVE to person
                                            }
                                        }
                                        if (AdminAction.VERIFY in actions) {
                                            AdminActionButton("Verify", busy) {
                                                executeAdminAction(AdminAction.VERIFY, person)
                                            }
                                        }
                                        if (AdminAction.UNVERIFY in actions) {
                                            AdminActionButton("Unverify", busy) {
                                                confirmation = AdminAction.UNVERIFY to person
                                            }
                                        }
                                    }
                                    Row {
                                        if (AdminAction.GRANT_BRIDGE in actions) {
                                            AdminActionButton("Grant Tomato", busy) {
                                                executeAdminAction(AdminAction.GRANT_BRIDGE, person)
                                            }
                                        }
                                        if (AdminAction.REVOKE_BRIDGE in actions) {
                                            AdminActionButton("Revoke Tomato", busy) {
                                                confirmation = AdminAction.REVOKE_BRIDGE to person
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { selected = null; conversation = null }) { Text("‹ People") }
                Text(selected!!.getString("display_name"), style = MaterialTheme.typography.titleLarge)
            }
            LazyColumn(
                Modifier.weight(1f),
                reverseLayout = true,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val localCards = computeCards.values.filter { it.conversation == conversation }.reversed()
                items(localCards, key = { "compute-${it.id}" }) { card ->
                    ComputeJobCard(card)
                }
                items(messages.reversed(), key = { it.getString("id") }) { message ->
                    val mine = message.getString("sender_id") == api.userId
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
                    ) {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = if (mine) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) { Text(message.getString("body"), Modifier.padding(12.dp)) }
                    }
                }
            }
            if (selected!!.optBoolean("is_device") && !online) {
                Text("Tomato is offline. Your message will wait for its bridge.", style = MaterialTheme.typography.bodySmall)
            }
            val keyboard = LocalSoftwareKeyboardController.current
            val canSend = !busy && conversation != null && draft.isNotEmpty() &&
                draft.length <= 2048 && draft.toByteArray().size <= 2048
            fun sendDraft() {
                if (!canSend) return
                val id = conversation!!
                val peer = selected!!.getString("id")
                val isTomato = selected!!.optBoolean("is_device")
                if (isTomato && draft.any { it.code !in 32..126 }) {
                    error = "Tomato accepts printable ASCII only."
                    return
                }
                if (isTomato) {
                    val compiled = try {
                        TomatoCompiler.compile(draft)
                    } catch (failure: IllegalArgumentException) {
                        error = failure.message ?: "Tomato could not compile this expression."
                        return
                    }
                    if (compiled != null) {
                        val original = draft
                        val cardId = UUID.randomUUID().toString()
                        val initial = ComputeCard(
                            id = cardId,
                            conversation = id,
                            prompt = original,
                            program = compiled,
                            status = if (online) "Physical Tomato · waiting for hardware" else "Physical Tomato unavailable",
                            error = if (online) "" else "No authenticated Tomato hardware lease is online.",
                        )
                        computeCards[cardId] = initial
                        while (computeCards.size > 20) computeCards.remove(computeCards.keys.first())
                        draft = ""
                        error = ""
                        keyboard?.hide()
                        if (online) {
                            scope.launch {
                                val result = api.executeDurableCompute(id, compiled.hex)
                                val current = computeCards[cardId] ?: return@launch
                                computeCards[cardId] = when (result) {
                                    is HardwareComputeResult.Physical -> current.copy(
                                        status = "Physical Tomato · hardware result",
                                        result = result.result,
                                    )
                                    is HardwareComputeResult.Unavailable -> current.copy(
                                        status = "Physical Tomato unavailable",
                                        error = result.reason,
                                    )
                                    is HardwareComputeResult.Unknown -> current.copy(
                                        status = "Physical Tomato · execution unknown",
                                        error = result.reason,
                                    )
                                }
                            }
                        }
                        return
                    }
                }
                if (draft.toByteArray().size > 256) {
                    error = "Chat messages must be at most 256 bytes."
                    return
                }
                var text = draft
                if (isTomato) {
                    val trimmed = draft.trim()
                    if (Regex("^(hi|hey|hello)\\s*,?\\s*(tomato)?\\s*[!.?]*$", RegexOption.IGNORE_CASE).matches(trimmed)) {
                        text = "Hello"
                    } else if (Regex("^(help|what can you do)[?.!]*$", RegexOption.IGNORE_CASE).matches(trimmed)) {
                        text = "/help"
                    }
                }
                val original = draft
                if (pending?.first != id || pending?.second != text) {
                    pending = Triple(id, text, UUID.randomUUID().toString())
                }
                val nonce = pending!!.third
                busy = true
                keyboard?.hide()
                scope.launch {
                    runCatching { api.send(id, text, nonce) }
                        .onSuccess {
                            pending = null
                            if (selected?.getString("id") == peer && draft == original) draft = ""
                            error = ""
                        }
                        .onFailure { error = it.message ?: "Send failed; tap Send to retry" }
                    busy = false
                }
            }
            Row(
                Modifier.fillMaxWidth().imePadding(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    draft,
                    { draft = it },
                    label = { Text("Message") },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { sendDraft() })
                )
                Button(enabled = canSend, onClick = { sendDraft() }) { Text("Send") }
            }
        }
        if (error.isNotEmpty()) {
            Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ComputeJobCard(card: ComputeCard) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Card(
            modifier = Modifier.fillMaxWidth(0.94f),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        ) {
            Column(
                Modifier.fillMaxWidth().padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(card.prompt)
                Text("Envelop understood", style = MaterialTheme.typography.labelMedium)
                card.program.understood?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                Text("Remote bytecode v1", style = MaterialTheme.typography.labelMedium)
                Text(card.program.canonical, style = MaterialTheme.typography.bodySmall)
                Text(card.program.hex, style = MaterialTheme.typography.bodySmall)
                Text(card.status, style = MaterialTheme.typography.labelLarge)
                if (card.result.isNotEmpty()) Text(card.result)
                if (card.error.isNotEmpty()) {
                    Text(card.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun AdminActionButton(label: String, busy: Boolean, onClick: () -> Unit) {
    TextButton(
        enabled = !busy,
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 8.dp),
    ) { Text(label, style = MaterialTheme.typography.labelMedium) }
}
