package com.tmarhguy.envelop.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OwnerRulesTest {
    @Test
    fun devicesHaveNoHumanAdminActions() {
        assertTrue(adminActionsFor("owner", CloudIds.TOMATO, isDevice = true, verified = true, trustedBridgeIds = emptySet()).isEmpty())
    }

    @Test
    fun selfHasNoDangerousAdminActions() {
        val actions = adminActionsFor("owner", "owner", isDevice = false, verified = false, trustedBridgeIds = emptySet())
        assertTrue(actions.isEmpty())
    }

    @Test
    fun nonSelfHumanActionsMapToCurrentVerificationState() {
        val unverified = adminActionsFor("owner", "user", isDevice = false, verified = false, trustedBridgeIds = emptySet())
        assertTrue(AdminAction.REMOVE in unverified)
        assertTrue(AdminAction.VERIFY in unverified)
        assertFalse(AdminAction.UNVERIFY in unverified)
        assertTrue(AdminAction.GRANT_BRIDGE in unverified)
        assertFalse(AdminAction.REVOKE_BRIDGE in unverified)

        val verified = adminActionsFor("owner", "user", isDevice = false, verified = true, trustedBridgeIds = setOf("user"))
        assertTrue(AdminAction.UNVERIFY in verified)
        assertFalse(AdminAction.VERIFY in verified)
        assertTrue(AdminAction.REVOKE_BRIDGE in verified)
        assertFalse(AdminAction.GRANT_BRIDGE in verified)
    }

    @Test
    fun destructiveActionsRequireConfirmation() {
        assertTrue(requiresConfirmation(AdminAction.REMOVE))
        assertTrue(requiresConfirmation(AdminAction.UNVERIFY))
        assertTrue(requiresConfirmation(AdminAction.REVOKE_BRIDGE))
        assertTrue(requiresConfirmation(AdminAction.FLUSH))
        assertFalse(requiresConfirmation(AdminAction.VERIFY))
        assertFalse(requiresConfirmation(AdminAction.GRANT_BRIDGE))
    }
}

private object CloudIds {
    const val TOMATO = "00000000-0000-0000-0000-000000000001"
}
