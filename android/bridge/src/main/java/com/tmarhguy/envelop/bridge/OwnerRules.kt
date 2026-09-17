package com.tmarhguy.envelop.bridge

enum class AdminAction {
    REMOVE,
    VERIFY,
    UNVERIFY,
    GRANT_BRIDGE,
    REVOKE_BRIDGE,
    FLUSH,
}

fun adminActionsFor(
    selfId: String,
    targetId: String,
    isDevice: Boolean,
    verified: Boolean,
    trustedBridgeIds: Set<String>,
): Set<AdminAction> {
    if (isDevice || targetId == selfId) return emptySet()
    return buildSet {
        add(AdminAction.REMOVE)
        add(if (verified) AdminAction.UNVERIFY else AdminAction.VERIFY)
        add(if (targetId in trustedBridgeIds) AdminAction.REVOKE_BRIDGE else AdminAction.GRANT_BRIDGE)
    }
}

fun requiresConfirmation(action: AdminAction): Boolean = when (action) {
    AdminAction.REMOVE, AdminAction.UNVERIFY, AdminAction.REVOKE_BRIDGE, AdminAction.FLUSH -> true
    AdminAction.VERIFY, AdminAction.GRANT_BRIDGE -> false
}
