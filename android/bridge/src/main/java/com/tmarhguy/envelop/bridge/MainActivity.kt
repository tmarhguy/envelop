package com.tmarhguy.envelop.bridge

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tmarhguy.envelop.core.CloudApi
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val PROVISIONING_ERROR =
    "Owner setup failed. Run the clean backend SQL and retry."

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val api = CloudApi(applicationContext)
        setContent {
            MaterialTheme {
                EnvelopApp(api)
            }
        }
    }
}

private class AppState(private val api: CloudApi) {
    var profile by mutableStateOf<JSONObject?>(null)
        private set
    var loaded by mutableStateOf(false)
        private set
    var isAdmin by mutableStateOf(false)
        private set
    var revision by mutableIntStateOf(0)
        private set
    var error by mutableStateOf("")
        private set

    suspend fun restore() {
        if (!api.configured) {
            loaded = true
            return
        }
        runCatching { api.preparePrivateOwner() }
            .onSuccess { setProfile(it) }
            .onFailure { error = it.message ?: PROVISIONING_ERROR }
        loaded = true
    }

    suspend fun flush() {
        api.adminFlush()
        setProfile(api.profile())
        error = ""
    }

    fun report(error: Throwable, fallback: String) {
        this.error = error.message ?: fallback
    }

    private suspend fun setProfile(next: JSONObject?) {
        val admin = next != null && api.amIAdmin()
        profile = next
        isAdmin = admin
        if (profile != null) error = ""
        revision++
    }
}

@Composable
private fun EnvelopApp(api: CloudApi) {
    val app = remember(api) { AppState(api) }
    var bridgeTab by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { app.restore() }

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = {
            TabRow(
                selectedTabIndex = if (bridgeTab) 0 else 1,
                modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars),
            ) {
                Tab(selected = bridgeTab, onClick = { bridgeTab = true }, text = { Text("Bridge") })
                Tab(selected = !bridgeTab, onClick = { bridgeTab = false }, text = { Text("Chat") })
            }
        },
    ) { innerPadding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding),
        ) {
            if (bridgeTab) {
                BridgeScreen(api, app)
            } else {
                ChatScreen(
                    api = api,
                    profile = app.profile,
                    profileRevision = app.revision,
                    isAdmin = app.isAdmin,
                    onFlush = { app.flush() },
                    onError = app::report,
                )
            }
        }
    }
}

@Composable
private fun BridgeScreen(api: CloudApi, app: AppState) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val state by BridgeState.flow.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val permissions = remember {
        buildList {
            if (Build.VERSION.SDK_INT >= 31) {
                add(Manifest.permission.BLUETOOTH_SCAN); add(Manifest.permission.BLUETOOTH_CONNECT)
            } else add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.toTypedArray()
    }
    fun startBridge() {
        ContextCompat.startForegroundService(context, Intent(context, BridgeService::class.java).setAction(BridgeService.CONNECT))
    }
    val requestPermissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        if (results.filterKeys { it != Manifest.permission.POST_NOTIFICATIONS }.values.all { it }) startBridge()
        else app.report(IllegalStateException("Bluetooth permission is required to connect."), "")
    }
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Envelop Tomato Bridge", style = MaterialTheme.typography.headlineMedium)
            if (!api.configured) {
                Text("This build has no Envelop network configuration.")
            } else if (!app.loaded) {
                CircularProgressIndicator()
            } else if (app.profile == null) {
                Text(PROVISIONING_ERROR, color = MaterialTheme.colorScheme.error)
            } else if (!app.isAdmin) {
                Text("Owner setup needs one dashboard command:")
                Text(
                    "select envelop_private.bootstrap_owner('${app.profile!!.getString("id")}');",
                    style = MaterialTheme.typography.bodySmall,
                )
                Button(onClick = {
                    scope.launch { app.restore() }
                }) { Text("Check setup") }
            } else {
                Text("Profile: ${app.profile!!.optString("display_name")}")
                Text(state.status, style = MaterialTheme.typography.titleMedium)
                if (!state.connected) Button(onClick = {
                    val missing = permissions.filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
                    if (missing.isEmpty()) startBridge() else requestPermissions.launch(missing.toTypedArray())
                }) { Text("Connect") }
                else Button(onClick = {
                    context.startService(Intent(context, BridgeService::class.java).setAction(BridgeService.DISCONNECT))
                }) { Text("Disconnect") }
                Text("The foreground service keeps bridging while this screen is closed.", style = MaterialTheme.typography.bodySmall)
            }
            val shownError = state.error.ifEmpty {
                if (app.profile == null) "" else app.error
            }
            if (shownError.isNotEmpty()) Text(shownError, color = MaterialTheme.colorScheme.error)
        }
    }
}
