package com.tmarhguy.envelop

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID
import kotlin.math.abs

fun defaultAvatar(name: String): Int {
    var h = 0
    for (c in name.lowercase()) h = h * 31 + c.code
    return abs(h) % 16
}

class MainActivity: ComponentActivity() {
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  val api=CloudApi(applicationContext)
  setContent { MaterialTheme { Surface(Modifier.fillMaxSize()) { EnvelopScreen(api) } } }
 }
}
@Composable fun EnvelopScreen(api: CloudApi) {
 val scope=rememberCoroutineScope()
 var configured by remember { mutableStateOf(api.configured) }
 var profile by remember { mutableStateOf<JSONObject?>(null) }
 var name by remember { mutableStateOf("") }
 var people by remember { mutableStateOf(listOf<JSONObject>()) }
 var selected by remember { mutableStateOf<JSONObject?>(null) }; var conversation by remember { mutableStateOf<String?>(null) }
 var messages by remember { mutableStateOf(listOf<JSONObject>()) }; var query by remember { mutableStateOf("") }
 var draft by remember { mutableStateOf("") }; var error by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
 var online by remember { mutableStateOf(false) }; var pending by remember { mutableStateOf<Triple<String,String,String>?>(null) }
 LaunchedEffect(configured) { if(configured) runCatching { api.restore() }.onSuccess { profile=it }.onFailure { error=it.message ?: "Connection failed" } }
 LaunchedEffect(profile,query) { if(profile!=null) { delay(250); runCatching { api.people(query) }.onSuccess { people=it }.onFailure { error=it.message ?: "Search failed" } } }
 LaunchedEffect(profile,conversation) {
  while(profile!=null) {
   val current=conversation
   runCatching { online=api.online(); if(current!=null) { val rows=api.history(current); if(current==conversation) messages=rows } }
    .onFailure { online=false; error=it.message ?: "Connection failed" }
   delay(3000)
  }
 }
 Column(Modifier.fillMaxSize().systemBarsPadding().padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
  Text("Envelop",style=MaterialTheme.typography.headlineLarge)
  if(!configured) {
   Text("This build isn’t connected to the Envelop test network. Get a download from the Envelop site.")
  } else if(profile==null) {
   Text("Welcome. Choose your name.")
   OutlinedTextField(name,{name=it},label={Text("Your name")},singleLine=true,modifier=Modifier.fillMaxWidth())
   Button(enabled=!busy && name.trim().length in 1..32,onClick={busy=true;scope.launch{runCatching{api.enter(name.trim(),defaultAvatar(name.trim()))}.onSuccess{profile=it;error=""}.onFailure{error=it.message ?: "Sign-in failed"};busy=false}}){Text("Enter Envelop")}
  } else if(selected==null) {
   OutlinedTextField(query,{query=it},label={Text("Find people")},modifier=Modifier.fillMaxWidth())
   LazyColumn(Modifier.weight(1f)) {
    items(people,key={it.getString("id")}) { person ->
     TextButton(onClick={selected=person;messages=emptyList();conversation=null;draft="";scope.launch{runCatching{api.open(person.getString("id"))}.onSuccess{if(selected?.getString("id")==person.getString("id"))conversation=it}.onFailure{error=it.message ?: "Could not open chat"}}},modifier=Modifier.fillMaxWidth()) {
      Column(Modifier.fillMaxWidth()) {
       Text(buildAnnotatedString{
        append(person.getString("display_name"))
        if(person.optBoolean("verified")){append(" ");withStyle(SpanStyle(color=Color(0xFF1D9BF0))){append("✓")}}
       },style=MaterialTheme.typography.titleMedium)
       Text(if(person.optBoolean("is_device")) if(online) "Online" else "Offline · messages will wait" else "@${person.getString("handle")}",style=MaterialTheme.typography.bodySmall)
      }
     }
    }
   }
  } else {
   Row { TextButton(onClick={selected=null;conversation=null}){Text("‹ People")}; Text(selected!!.getString("display_name"),style=MaterialTheme.typography.titleLarge) }
   LazyColumn(Modifier.weight(1f),reverseLayout=true,verticalArrangement=Arrangement.spacedBy(8.dp)) {
    items(messages.reversed(),key={it.getString("id")}) { message ->
     val mine=message.getString("sender_id")==api.userId
     Row(Modifier.fillMaxWidth(),horizontalArrangement=if(mine) Arrangement.End else Arrangement.Start) {
      Card(colors=CardDefaults.cardColors(containerColor=if(mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)) { Text(message.getString("body"),Modifier.padding(12.dp)) }
     }
    }
   }
   if(selected!!.optBoolean("is_device") && !online) Text("Tomato is offline. Your message will wait for its bridge.",style=MaterialTheme.typography.bodySmall)
   val keyboard=LocalSoftwareKeyboardController.current
   val canSend=!busy && conversation!=null && draft.toByteArray().size in 1..256
   fun sendDraft() {
    if(!canSend) return
    val id=conversation!!;val text=draft;val peer=selected!!.getString("id")
    if(selected!!.optBoolean("is_device") && text.any{it.code !in 32..126}) { error="Tomato accepts printable ASCII only."; return }
    if(pending?.first!=id || pending?.second!=text) pending=Triple(id,text,UUID.randomUUID().toString());val nonce=pending!!.third;busy=true
    keyboard?.hide()
    scope.launch { runCatching{api.send(id,text,nonce)}.onSuccess {pending=null;if(selected?.getString("id")==peer && draft==text)draft="";error=""}.onFailure{error=it.message ?: "Send failed; tap Send to retry"};busy=false }
   }
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
    OutlinedTextField(
     value=draft,
     onValueChange={draft=it},
     label={Text("Message")},
     modifier=Modifier.weight(1f),
     maxLines=4,
     keyboardOptions=KeyboardOptions(imeAction=ImeAction.Send),
     keyboardActions=KeyboardActions(onSend={sendDraft()})
    )
    Button(enabled=canSend,onClick={sendDraft()}){Text("Send")}
   }
  }
  if(error.isNotEmpty()) Text(error,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
 }
}
