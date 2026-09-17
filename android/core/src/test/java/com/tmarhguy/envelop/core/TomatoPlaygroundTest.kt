package com.tmarhguy.envelop.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TomatoPlaygroundTest {
    @Test
    fun recognizesKnowledgeAndHelp() {
        assertNotNull(TomatoPlayground.localAnswerFor("What is Tomato?"))
        assertNotNull(TomatoPlayground.localAnswerFor("Who is Tyrone Marhguy?"))
        assertTrue(TomatoPlayground.isHelpRequest("/help"))
        assertTrue(TomatoPlayground.isHelpRequest("what can you do"))
        assertNull(TomatoPlayground.localAnswerFor("23 + 19"))
        assertTrue(TomatoPlayground.isCalculationBearing("23 + 19"))
        assertFalse(TomatoPlayground.isCalculationBearing("What is Tomato?"))
    }

    @Test
    fun conversationAndSuggestions() {
        assertNotNull(TomatoPlayground.conversationReply("what's up"))
        val suggestions = TomatoPlayground.selectSuggestions(started = false, count = 5)
        assertEquals(5, suggestions.size)
        assertEquals("Help", suggestions.first().label)
    }
}
