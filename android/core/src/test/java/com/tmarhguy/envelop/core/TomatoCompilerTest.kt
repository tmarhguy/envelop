package com.tmarhguy.envelop.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.json.JSONObject
import java.io.File

class TomatoCompilerTest {
    @Test
    fun naturalLanguageMatchesWebsiteCompiler() {
        val result = TomatoCompiler.compile("What is (57 + 19) AND 0x3F?")!!
        assertEquals("(57 + 19) & 0x3F", result.understood)
        assertEquals(
            "/run\nR0=57\nR1=19\nADD R0,R0,R1\nR1=63\nAND R0,R0,R1\nRETURN R0",
            result.canonical,
        )
        assertEquals(
            "01 01 00 00 00 00 39 01 01 00 00 00 13 02 00 00 01 00 01 01 00 00 00 3F 04 00 00 01 00 30 00",
            result.hex,
        )
    }

    @Test
    fun calcFunctionMatchesWebsiteCompiler() {
        val result = TomatoCompiler.compile("/calc xor(5, 3)")!!
        assertEquals("5 ^ 3", result.understood)
        assertEquals("/run\nR0=5\nR1=3\nXOR R0,R0,R1\nRETURN R0", result.canonical)
        assertEquals("01 01 00 00 00 00 05 01 01 00 00 00 03 06 00 00 01 00 30 00", result.hex)
    }

    @Test
    fun runAliasesCompileToRemoteBytecodeV1() {
        val source = "/run\nLI R0,0b101\nLD R1,[4]\nADD R2,R0,R1\nST [5],R2\nRETURN R2"
        val result = TomatoCompiler.compile(source)!!
        assertEquals(source, result.canonical)
        assertEquals(null, result.understood)
        assertEquals("01 01 00 00 00 00 05 20 01 04 02 02 00 01 00 21 02 05 30 02", result.hex)
    }

    @Test
    fun ordinaryConversationIsNotCompute() {
        assertNull(TomatoCompiler.compile("How are you today?"))
        assertNull(TomatoCompiler.compile("Hello, Tomato!"))
    }

    @Test
    fun malformedAndBoundsFailClosed() {
        assertThrows(IllegalArgumentException::class.java) { TomatoCompiler.compile("/run\nR0=1") }
        assertThrows(IllegalArgumentException::class.java) { TomatoCompiler.compile("/run\nLOAD R0,[256]\nRETURN R0") }
        assertThrows(IllegalArgumentException::class.java) { TomatoCompiler.compile("/calc R8 + 1") }
        assertThrows(IllegalArgumentException::class.java) { TomatoCompiler.compile("/calc and(1)") }
        assertThrows(IllegalArgumentException::class.java) { TomatoCompiler.compile("1".repeat(2049)) }
        val tooMany = "/run\n" + (0 until 32).joinToString("\n") { "R0=$it" } + "\nRETURN R0"
        assertThrows(IllegalArgumentException::class.java) { TomatoCompiler.compile(tooMany) }
    }

    @Test
    fun siblingNaturalLanguageFixturesMatchCanonicalCompiler() {
        val configuredRoots = listOfNotNull(
            System.getenv("TOMATO_CHECKOUT"),
            System.getenv("TOMATO_DIR"),
        )
        val checkoutRoots = generateSequence(File(System.getProperty("user.dir")).canonicalFile) { it.parentFile }
            .map { File(it, "tomato") }
        val fixture = (configuredRoots.asSequence().map(::File) + checkoutRoots)
            .map { File(it, "tools/nl_fixtures.json") }
            .firstOrNull(File::isFile)
        assumeTrue("sibling tomato checkout absent", fixture != null)
        val data = JSONObject(fixture!!.readText())
        assertEquals(6, data.getInt("version"))

        val compute = data.getJSONArray("compute")
        for (index in 0 until compute.length()) {
            val item = compute.getJSONObject(index)
            val result = TomatoCompiler.compile(item.getString("input"))
                ?: throw AssertionError("${item.getString("input")}: expected compute, got chat")
            assertEquals(item.getString("understood"), result.understood)
            assertEquals(item.getString("canonical"), result.canonical)
        }
        val chat = data.getJSONArray("chat")
        for (index in 0 until chat.length()) {
            val input = chat.getJSONObject(index).getString("input")
            assertNull("$input: expected chat", TomatoCompiler.compile(input))
        }
        val errors = data.getJSONArray("errors")
        for (index in 0 until errors.length()) {
            val item = errors.getJSONObject(index)
            val failure = assertThrows(IllegalArgumentException::class.java) {
                TomatoCompiler.compile(item.getString("input"))
            }
            assertTrue(
                "${item.getString("input")}: expected ${item.getString("js_error")}, got ${failure.message}",
                failure.message.orEmpty().contains(item.getString("js_error")),
            )
        }
    }

    @Test
    fun completeSemanticSpanIgnoresOnlyOutsideFiller() {
        assertEquals(
            "34 - 2345",
            TomatoCompiler.compile("ohj yea, you are so good, ok what is 34 - 2345")!!.understood,
        )
        assertEquals(
            "345 + ~(((2345 & 3534) & 235))",
            TomatoCompiler.compile(
                "i can teype gibveradklaeira adkn adihe adn adraioerh 345 + nand(2345, 3534, 235)",
            )!!.understood,
        )
        assertThrows(IllegalArgumentException::class.java) {
            TomatoCompiler.compile("/calc 2 plux 3")
        }
    }
}
