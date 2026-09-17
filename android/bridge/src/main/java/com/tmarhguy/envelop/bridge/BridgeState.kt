package com.tmarhguy.envelop.bridge

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class BridgeUiState(
    val connected: Boolean = false,
    val status: String = "Disconnected",
    val error: String = ""
)

object BridgeState {
    private val mutable = MutableStateFlow(BridgeUiState())
    val flow = mutable.asStateFlow()
    fun update(status: String, connected: Boolean = false, error: String = "") {
        mutable.value = BridgeUiState(connected, status, error)
    }
}
