package com.tmarhguy.envelop.core

/**
 * Deterministic Tomato playground helpers ported from website/chat for Android coherence.
 * Knowledge answers are local reviewed cards; compute still goes through TomatoCompiler.
 */
object TomatoPlayground {
    data class KnowledgeAction(val label: String, val prompt: String)
    data class KnowledgeCard(
        val id: String,
        val answer: String,
        val source: String,
        val actions: List<KnowledgeAction> = emptyList(),
    )
    data class Suggestion(val label: String, val prompt: String)
    data class HelpGroup(val title: String, val options: List<Suggestion>)

    val HELP_GROUPS = listOf(
        HelpGroup(
            "Arithmetic",
            listOf(
                Suggestion("Addition", "23 + 19"),
                Suggestion("Multiply", "34 * 3"),
                Suggestion("Divide", "345 / 345"),
            ),
        ),
        HelpGroup(
            "Logic",
            listOf(
                Suggestion("XOR", "What is xor of 5 and 3?"),
                Suggestion("NOT", "not(0x0000000F)"),
                Suggestion("NAND", "nand(0xF0, 0xAA)"),
            ),
        ),
        HelpGroup(
            "Composed",
            listOf(
                Suggestion("XORAND", "xorand(0xF0, 0xAA, 0x0F)"),
                Suggestion("MASKADD", "maskadd(0xFF, 7, 9)"),
                Suggestion("ANDN", "andn(0xFF, 0x0F)"),
            ),
        ),
        HelpGroup(
            "Questions",
            listOf(
                Suggestion("Capabilities", "What can Tomato do?"),
                Suggestion("Hardware", "Is Tomato real hardware?"),
                Suggestion("Physical vs Virtual", "What is the difference between Physical and Virtual Tomato?"),
                Suggestion("Who is Tyrone?", "Who is Tyrone Marhguy?"),
            ),
        ),
    )

    val SUGGESTIONS = listOf(
        Suggestion("Help", "/help"),
        Suggestion("Hello", "Hello Tomato"),
        Suggestion("Add", "23 + 19"),
        Suggestion("Multiply", "34 * 3"),
        Suggestion("XOR", "What is xor of 5 and 3?"),
        Suggestion("XORAND", "xorand(0xF0, 0xAA, 0x0F)"),
        Suggestion("Overflow", "4294967295 + 1"),
        Suggestion("What is Tomato?", "What is Tomato?"),
    )

    private val cards = mapOf(
        "tomato" to KnowledgeCard(
            "tomato",
            "Tomato is Tyrone Marhguy’s custom 32-bit computer architecture: a complete FPGA computer, a browser ISA emulator, and an in-progress discrete build centered on a Dual-LUT ALU.",
            "https://tomato.tmarhguy.com/",
            listOf(
                KnowledgeAction("Is it real hardware?", "Is Tomato real hardware?"),
                KnowledgeAction("See its architecture", "How does Tomato work?"),
            ),
        ),
        "tyrone" to KnowledgeCard(
            "tyrone",
            "Tyrone Marhguy is a Ghanaian Computer Engineering student at Penn who builds computer systems from transistor logic through RTL, FPGA, and physical chip design. He designed Tomato and Envelop.",
            "https://tmarhguy.com/about/",
            listOf(KnowledgeAction("What has he built?", "What other projects has Tyrone built?")),
        ),
        "tyroneProjects" to KnowledgeCard(
            "tyroneProjects",
            "Past builds include Tomato, a 100 Mbps FPGA UDP/IP stack, a 22 nm SRAM macro, a Sky130 BFloat16 MAC, a NASDAQ hardware parser, an 8-bit transistor ALU, FramePort, and hardware/software tooling.",
            "https://tmarhguy.com/projects/",
        ),
        "envelop" to KnowledgeCard(
            "envelop",
            "Envelop is a messenger around Tomato. It queues messages and bounded compute jobs through a nearby verified bridge, and labels browser execution separately as Virtual Tomato.",
            "https://tmarhguy.github.io/envelop/",
            listOf(KnowledgeAction("Physical or Virtual?", "What is the difference between Physical and Virtual Tomato?")),
        ),
        "hardware" to KnowledgeCard(
            "hardware",
            "Yes. Physical Tomato is real FPGA hardware. Envelop only calls a result physical after an authenticated nearby bridge verifies ENVELOP/1 and returns the hardware outcome.",
            "https://tomato.tmarhguy.com/status.html",
        ),
        "physicalVirtual" to KnowledgeCard(
            "physicalVirtual",
            "Physical Tomato runs on the nearby computer through the bridge. Virtual Tomato runs the same ISA in the browser. Each result names which machine produced it.",
            "https://tomato.tmarhguy.com/virtual.html",
        ),
        "capability" to KnowledgeCard(
            "capability",
            "Ask Tomato bounded integer and bitwise jobs, open /help for examples, or ask deterministic questions about Tomato, Envelop, and Tyrone. Results always name Physical or local reviewed answers.",
            "https://tomato.tmarhguy.com/compute.html",
            listOf(KnowledgeAction("Try addition", "23 + 19")),
        ),
        "alu" to KnowledgeCard(
            "alu",
            "Tomato’s Dual-LUT ALU uses two three-input LUTs so one instruction can compute rich bitwise and arithmetic combinations without a black-box AI model.",
            "https://tomato.tmarhguy.com/architecture.html",
        ),
        "architecture" to KnowledgeCard(
            "architecture",
            "Tomato is a von Neumann 32-bit design with a Dual-LUT ALU, register file, memory map, and an operator OS with interactive programs.",
            "https://tomato.tmarhguy.com/architecture.html",
        ),
        "programs" to KnowledgeCard(
            "programs",
            "Tomato OS includes System Info, Sudoku, Snake, Tetris, Racer, Fibonacci, Tribonacci, ALU Studio, Compiler, Font Chart, Keypad Test, Memory Map, About Tomato, and Envelop.",
            "https://tomato.tmarhguy.com/os.html",
        ),
        "screen" to KnowledgeCard(
            "screen",
            "Tomato has its own display path on the hardware. Envelop chat does not stream the framebuffer; open the physical machine or Tomato project pages for screen details.",
            "https://tomato.tmarhguy.com/",
        ),
        "deterministic" to KnowledgeCard(
            "deterministic",
            "No. Envelop’s Tomato chat is deterministic routing and bounded compute — not an LLM or generative black box.",
            "https://tmarhguy.github.io/envelop/",
        ),
        "assistantIdentity" to KnowledgeCard(
            "assistantIdentity",
            "I’m the Envelop Tomato playground on this private bridge: local knowledge cards plus Physical Tomato compute when the lease is online.",
            "https://tmarhguy.github.io/envelop/",
        ),
        "bridge" to KnowledgeCard(
            "bridge",
            "A nearby authenticated bridge claims a short lease after ENVELOP/1 identity verification, then forwards queued messages and compute jobs to Tomato.",
            "https://tomato.tmarhguy.com/compute.html",
        ),
        "thanks" to KnowledgeCard("thanks", "You’re welcome. Try another calculation or open /help.", "local"),
        "goodbye" to KnowledgeCard("goodbye", "See you. Tomato will keep waiting jobs if the bridge stays online.", "local"),
        "clarification" to KnowledgeCard(
            "clarification",
            "Ask about Tomato’s architecture, OS programs, compute operators, or run an expression like 23 + 19. Open /help for curated experiments.",
            "local",
            listOf(KnowledgeAction("Open help", "/help"), KnowledgeAction("Try 23 + 19", "23 + 19")),
        ),
    )

    private val matchers = listOf(
        "tyroneProjects" to Regex("""\b(?:other projects?|what else)\b.*\b(?:tyrone|marhguy|built)\b|\bprojects? (?:has|did) tyrone\b""", RegexOption.IGNORE_CASE),
        "tyrone" to Regex("""\bwho (?:is|was) tyrone(?: iras)?(?: marhguy)?\b|\b(?:about|tell me about) tyrone(?: marhguy)?\b""", RegexOption.IGNORE_CASE),
        "physicalVirtual" to Regex("""\bphysical (?:or|vs|versus|and) virtual\b|\bdifference\b.*\bphysical\b.*\bvirtual\b|\bwhat (?:is|does) virtual tomato\b""", RegexOption.IGNORE_CASE),
        "hardware" to Regex("""\bis tomato (?:real|physical|hardware|a real computer|an? fpga)\b|\breal hardware\b|\bphysical hardware\b""", RegexOption.IGNORE_CASE),
        "alu" to Regex("""\b(?:what|why|how)\b.*\b(?:dual[- ]lut|alu)\b""", RegexOption.IGNORE_CASE),
        "architecture" to Regex("""\b(?:architecture|how does tomato work)\b""", RegexOption.IGNORE_CASE),
        "programs" to Regex("""\b(?:what|which|list|show)\b.*\b(?:programs?|apps?)\b""", RegexOption.IGNORE_CASE),
        "screen" to Regex("""\b(?:screen|display|framebuffer|see tomato)\b""", RegexOption.IGNORE_CASE),
        "deterministic" to Regex("""\b(?:ai|llm|chatgpt|language model|neural|generative)\b""", RegexOption.IGNORE_CASE),
        "assistantIdentity" to Regex("""\bwho are you\b|\bwhat are you\b|\bwhat is your name\b""", RegexOption.IGNORE_CASE),
        "bridge" to Regex("""\b(?:bridge lease|envelop/1|nearby bridge|how does envelop reach)\b""", RegexOption.IGNORE_CASE),
        "envelop" to Regex("""\bwhat is envelop\b|\bhow does envelop work\b""", RegexOption.IGNORE_CASE),
        "tomato" to Regex("""\bwhat is tomato\b|\btell me about tomato\b|\bwho is tomato\b""", RegexOption.IGNORE_CASE),
        "capability" to Regex("""\bwhat (?:can|does) (?:you|tomato|envelop) (?:do|run)\b|\bcapabilities\b""", RegexOption.IGNORE_CASE),
        "thanks" to Regex("""^(?:thanks|thank you|thx|cheers)[!?. ]*$""", RegexOption.IGNORE_CASE),
        "goodbye" to Regex("""^(?:bye|goodbye|see you|later|good night)[!?. ]*$""", RegexOption.IGNORE_CASE),
    )

    fun isCalculationBearing(value: String): Boolean {
        val text = value.trim()
        if (Regex("""^/(?:run|calc)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text)) return true
        if (!text.any { it.isDigit() }) return false
        if (Regex("""[+*/%&|^~]|\s-\s""").containsMatchIn(text)) return true
        if (Regex(
                """\b(?:plus|minus|times|product|and|or|xor|nand|nor|xnor|not|maskadd|xorand|andadd|oradd|xoradd|andn|orn)\s*\(""",
                RegexOption.IGNORE_CASE,
            ).containsMatchIn(text)
        ) return true
        val numbers = Regex("""-?(?:0x[\da-f]+|0b[01]+|\d+)""", RegexOption.IGNORE_CASE).findAll(text).count()
        return numbers >= 2 && Regex(
            """\b(?:plus|minus|times|product|and|or|xor|nand|nor|xnor)\b""",
            RegexOption.IGNORE_CASE,
        ).containsMatchIn(text)
    }

    fun isHelpRequest(value: String): Boolean {
        val text = value.trim().replace(Regex("""\s+"""), " ")
        if (Regex("""^/help[?.!]*$""", RegexOption.IGNORE_CASE).matches(text)) return true
        if (Regex("""^(?:help|what can you do)[?.!]*$""", RegexOption.IGNORE_CASE).matches(text)) return true
        return Regex("""^what can (?:you|u|tomato) do[?.!]*$""", RegexOption.IGNORE_CASE).matches(text)
    }

    fun conversationReply(value: String): String? {
        val text = value.trim().lowercase()
            .replace('’', '\'')
            .replace(Regex("""[.!?]+$"""), "")
            .trim()
        return when {
            Regex("""^(?:what's good|what's up|sup|how are you|how's it going|how are things)$""").matches(text) ->
                "Ready to explore. Try a calculation, ask about Tomato, or open /help."
            Regex("""^(?:ok|okay|alright|got it|makes sense|cool|nice|sure|thanks|thank you)$""").matches(text) ->
                "Whenever you're ready. Run another calculation or explore what Tomato can do."
            Regex("""^(?:confused|i'm confused|i am confused|what is happening|what's happening|what is this|what's this|i don't understand|help me)$""").matches(text) ->
                "Start with 23 + 19. Physical mode sends it to Tomato when the bridge is online. Open /help for examples."
            else -> null
        }
    }

    fun localAnswerFor(value: String): KnowledgeCard? {
        val text = value.trim().replace(Regex("""\s+"""), " ")
        if (text.isEmpty() || isCalculationBearing(text) || isHelpRequest(text)) return null
        for ((id, pattern) in matchers) {
            if (pattern.containsMatchIn(text)) return cards[id]
        }
        val asksAboutTomato = Regex("""\b(?:tomato|envelop)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) &&
            Regex("""^(?:who|what|where|when|why|how|is|are|does|do|can|tell me)\b""", RegexOption.IGNORE_CASE)
                .containsMatchIn(text)
        return if (asksAboutTomato) cards["clarification"] else null
    }

    fun selectSuggestions(started: Boolean, count: Int = 5): List<Suggestion> {
        val limit = count.coerceIn(0, SUGGESTIONS.size)
        if (limit == 0) return emptyList()
        val help = SUGGESTIONS[0]
        val hello = SUGGESTIONS[1]
        val ops = SUGGESTIONS.drop(2)
        val selected = mutableListOf(help)
        if (!started && selected.size < limit) selected += hello
        var index = 0
        while (selected.size < limit && ops.isNotEmpty()) {
            selected += ops[index % ops.size]
            index++
        }
        return selected
    }
}
