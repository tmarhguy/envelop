package com.tmarhguy.envelop.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudApiTest {
    @Test
    fun invalidRefreshTokenResponsesReplaceTheSession() {
        assertTrue(isDefinitivelyInvalidRefreshToken(400, "refresh_token_not_found", "ignored"))
        assertTrue(isDefinitivelyInvalidRefreshToken(400, "refresh_token_already_used", null))
        assertTrue(isDefinitivelyInvalidRefreshToken(400, null, "Invalid Refresh Token: Refresh Token Not Found"))
        assertTrue(isDefinitivelyInvalidRefreshToken(401, null, "Refresh token was already used"))
    }

    @Test
    fun unrelatedFailuresPreserveTheSession() {
        assertFalse(isDefinitivelyInvalidRefreshToken(500, "refresh_token_not_found", "temporary failure"))
        assertFalse(isDefinitivelyInvalidRefreshToken(401, "bad_jwt", "Invalid JWT"))
        assertFalse(isDefinitivelyInvalidRefreshToken(400, null, "Anonymous signups are disabled"))
        assertFalse(isDefinitivelyInvalidRefreshToken(0, null, "Invalid Refresh Token"))
    }
}
