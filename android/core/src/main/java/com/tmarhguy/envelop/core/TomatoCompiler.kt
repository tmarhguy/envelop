package com.tmarhguy.envelop.core

import java.util.Locale

data class TomatoProgram(
    val canonical: String,
    val bytes: ByteArray,
    val understood: String?,
) {
    val version: Int = 1
    val hex: String get() = bytes.joinToString(" ") { "%02X".format(it.toInt() and 0xff) }
}

object TomatoCompiler {
    private const val MAX_SOURCE = 2048
    private const val MAX_DEPTH = 32
    private val leadingShell = Regex(
        "^(?:(?:on|for|from)\\s+tomato,\\s*|(?:could you please|would you please|can you please|can tomato calc(?:ulate)?|can tomato compute|could tomato calc(?:ulate)?|how much is|how much would|what does|what is|what would|tell me(?:\\s+the)?|give me(?:\\s+the)?|show me(?:\\s+the)?|work out|figure out|(?:the\\s+)?(?:result|value|answer)\\s+(?:of|to|is)|can you|could you|would you|please (?:calculate|compute|calc|evaluate)|calculate|compute|evaluate|do you know|i (?:need|want)(?:\\s+to know)?|find(?:\\s+me)?|please|hey|hi|hello)(?:\\s+tomato)?,?\\s+)",
        RegexOption.IGNORE_CASE,
    )
    private val trailingFiller = Regex(
        "\\s+(?:(?:on|for|from)\\s+tomato|for me|thank you|thanks|please|equals?)[?.!]*\\s*$",
        RegexOption.IGNORE_CASE,
    )
    private const val OF_NAMES = "plus|minus|and|or|xor|nand|nor|xnor|not|sum|difference|add|subtract|product|times"
    private val ofAlias = mapOf(
        "plus" to "plus", "minus" to "minus", "and" to "and", "or" to "or", "xor" to "xor",
        "nand" to "nand", "nor" to "nor", "xnor" to "xnor", "not" to "not", "sum" to "plus",
        "difference" to "minus", "add" to "plus", "subtract" to "minus", "product" to "*", "times" to "*",
    )
    private val ofHead = Regex("\\b(?:the\\s+)?(?:bitwise\\s+)?($OF_NAMES)\\s+(?:of|between)\\s+", RegexOption.IGNORE_CASE)
    private val ofTerm = Regex("^(?:plus|minus|or|xor|nand|nor|xnor|sum|difference)\\b", RegexOption.IGNORE_CASE)
    private val opVocab = listOf("plus", "minus", "and", "or", "xor", "nand", "nor", "xnor", "not", "sum", "add")
    private const val FN_NAMES = "plus|minus|and|or|xor|nand|nor|xnor|not|product|times|andn|orn|maskadd|xorand|andadd|oradd|xoradd"
    private val wordOperation = Regex("\\b(?:$OF_NAMES|andn|orn|maskadd|xorand|andadd|oradd|xoradd)\\b", RegexOption.IGNORE_CASE)
    private val meaningStart = Regex(
        "\\b(?:$OF_NAMES)\\s+(?:of|between)\\b|\\b(?:$FN_NAMES)\\s*(?=\\()|-?(?:0x[\\da-f]+|0b[01]+|\\d+)|\\bR[0-9]+\\b|[~(]",
        RegexOption.IGNORE_CASE,
    )
    private val meaningEnd = Regex("-?(?:0x[\\da-f]+|0b[01]+|\\d+)|\\bR[0-9]+\\b|\\)", RegexOption.IGNORE_CASE)

    fun compile(source: String): TomatoProgram? {
        require(source.length <= MAX_SOURCE) { "Use at most 2048 characters." }
        var text = source.trim()
        var understood: String? = null
        if (!text.startsWithRun()) {
            val prepared = usefulEnvelope(stripShells(text.replace(Regex("^/calc\\s+", RegexOption.IGNORE_CASE), "")))
            var expr = expandOf(prepared)
            expr = FunctionExpander().expand(expr)
            mapOf("plus" to "+", "minus" to "-", "and" to "&", "or" to "|", "xor" to "^").forEach { (word, op) ->
                expr = expr.replace(Regex("\\b$word\\b", RegexOption.IGNORE_CASE), op)
            }
            if (!text.startsWithCalc() && !Regex("[\\d()+\\-&|^~]").containsMatchIn(expr)) return null
            if (!text.startsWithCalc() &&
                !Regex("^(?:[\\d(~+\\-^&|]|R[0-7]\\b|(?:maskadd|xorand|andadd|oradd|xoradd|andn|orn)\\s*\\()", RegexOption.IGNORE_CASE).containsMatchIn(expr) &&
                !(Regex("\\d").containsMatchIn(expr) && Regex("[+\\-&|^~]|\\bof\\b").containsMatchIn(expr))
            ) return null

            val parsed = ExpressionCompiler(expr, prepared)
            val root = parsed.parse()
            understood = parsed.showRoot(root)
            val lines = parsed.generate(root)
            text = "/run\n" + (lines + "RETURN R${parsed.resultRegister}").joinToString("\n")
        }
        return assemble(text, understood)
    }

    private fun usefulEnvelope(source: String): String {
        val starts = meaningStart.findAll(source).toList()
        val ends = meaningEnd.findAll(source).toList()
        if (starts.isEmpty() || ends.isEmpty()) return source
        val start = starts.first().range.first
        var end = ends.last().range.last + 1
        if (start == 0 && end == source.length) return source
        val semanticPrefix = Regex("\\b([A-Za-z]+)\\s+(?:of|between)\\s*$", RegexOption.IGNORE_CASE)
            .find(source.substring(0, start))
        if (semanticPrefix != null &&
            opVocab.any { editDist(semanticPrefix.groupValues[1].lowercase(Locale.ROOT), it) == 1 }
        ) return source
        var candidate = source.substring(start, end)
        val tail = source.substring(end)
        val hasSymbol = Regex("[+*\\-&|^~]").containsMatchIn(candidate)
        val dangling = Regex("^\\s*[+*\\-&|^~]").find(tail)
            ?: if (!hasSymbol) Regex("^\\s*(?:$OF_NAMES)\\b", RegexOption.IGNORE_CASE).find(tail) else null
        if (dangling != null) end += dangling.range.last + 1
        candidate = source.substring(start, end).trim()
        if (!Regex("[+*\\-&|^~]").containsMatchIn(candidate) && !wordOperation.containsMatchIn(candidate)) return source
        return candidate.ifEmpty { source }
    }

    private fun stripShells(source: String): String {
        var expression = source
            .replace(Regex("\\bwhat['’]s\\b", RegexOption.IGNORE_CASE), "what is")
            .replace(Regex("\\bwhats\\b", RegexOption.IGNORE_CASE), "what is")
        repeat(6) {
            val shorter = leadingShell.replaceFirst(expression, "")
            if (shorter == expression) return@repeat
            expression = shorter
        }
        expression = expression.replace(Regex("[?.!]+$"), "").replace(Regex("\\bbitwise\\s+", RegexOption.IGNORE_CASE), "")
        repeat(3) {
            val shorter = trailingFiller.replaceFirst(expression, "").trim()
            if (shorter == expression) return@repeat
            expression = shorter
        }
        return expression.replace(Regex("\\b(?:the|a|an)\\b", RegexOption.IGNORE_CASE), " ").replace(Regex("\\s+"), " ").trim()
    }

    private fun sepLen(source: String, index: Int): Int {
        if (index >= source.length) return 0
        if (source[index] == ',' || source[index] == '&') return 1
        val slice = source.substring(index)
        Regex("^with\\b", RegexOption.IGNORE_CASE).find(slice)?.let { return it.value.length }
        Regex("^and\\b", RegexOption.IGNORE_CASE).find(slice)?.let { return it.value.length }
        return 0
    }

    private fun isTerm(source: String, index: Int): Boolean {
        if (index >= source.length) return true
        if (source[index] == '+' || source[index] == '|' || source[index] == '^') return true
        return ofTerm.containsMatchIn(source.substring(index))
    }

    private fun parseOfArgs(source: String): Pair<List<String>, Int> {
        var index = 0
        val args = mutableListOf<String>()
        val n = source.length
        while (true) {
            while (index < n && source[index].isWhitespace()) index++
            if (index >= n || (args.isNotEmpty() && isTerm(source, index))) break
            val start = index
            var depth = 0
            while (index < n) {
                val char = source[index]
                when {
                    char == '(' -> { depth++; index++ }
                    char == ')' -> {
                        if (depth == 0) break
                        depth--; index++
                    }
                    depth == 0 && index > start && (sepLen(source, index) != 0 || isTerm(source, index)) -> break
                    else -> index++
                }
            }
            val arg = source.substring(start, index).trim()
            if (arg.isEmpty()) break
            args += arg
            while (index < n && source[index].isWhitespace()) index++
            val sep = sepLen(source, index)
            if (sep != 0) { index += sep; continue }
            break
        }
        return args to index
    }

    private fun expandOf(source: String, depth: Int = 0): String {
        if (depth > 8) return source
        val matches = ofHead.findAll(source).toList()
        if (matches.isEmpty()) return source
        val match = matches.last()
        val name = ofAlias.getValue(match.groupValues[1].lowercase(Locale.ROOT))
        val rest = source.substring(match.range.last + 1)
        val (rawArgs, consumed) = parseOfArgs(rest)
        val args = rawArgs.map { it.trim() }.filter { it.isNotEmpty() }
        val ok = (name == "not" && args.size == 1) || (name != "not" && args.size in 2..8)
        if (!ok) return source.substring(0, match.range.last + 1) + expandOf(rest, depth + 1)
        val expanded = args.map { expandOf(it, depth + 1) }
        val made = when (name) {
            "*" -> "(" + expanded.joinToString(" * ") + ")"
            "not" -> "not(${expanded[0]})"
            else -> "$name(${expanded.joinToString(", ")})"
        }
        return expandOf(source.substring(0, match.range.first) + made + rest.substring(consumed), depth + 1)
    }

    private fun editDist(left: String, right: String): Int {
        var a = left
        var b = right
        if (kotlin.math.abs(a.length - b.length) > 1) return 2
        if (a == b) return 0
        if (a.length > b.length) { val tmp = a; a = b; b = tmp }
        if (a.length == b.length) return a.indices.count { a[it] != b[it] }
        var i = 0
        var j = 0
        var distance = 0
        while (i < a.length && j < b.length) {
            if (a[i] == b[j]) { i++; j++ }
            else {
                distance++
                if (distance > 1) return distance
                j++
            }
        }
        return distance + (b.length - j)
    }

    private fun unknownHint(prepared: String, word: String): String {
        val lower = word.lowercase(Locale.ROOT)
        if (lower == "of") {
            val match = Regex("\\b(xnor|xor|nand|nor|plus|minus|difference|and|or|not|sum)\\b", RegexOption.IGNORE_CASE).find(prepared)
            val op = ofAlias[(match?.groupValues?.get(1) ?: "xor").lowercase(Locale.ROOT)] ?: "xor"
            return " Supported forms: $op of a and b, or $op(a, b)."
        }
        val hits = opVocab.filter { editDist(lower, it) == 1 }
        if (hits.size == 1) return " Closest supported operator: ${hits[0]}."
        val words = prepared.split(Regex("\\s+"))
        for (index in 1 until words.size) {
            val prefix = words.take(index).joinToString(" ")
            if (Regex("\\d").containsMatchIn(prefix)) break
            val rest = words.drop(index).joinToString(" ")
            try {
                if (compile(rest) != null) return " Recognized calculation: $rest."
            } catch (_: IllegalArgumentException) {
                continue
            }
        }
        return ""
    }

    private fun unknownWord(word: String, prepared: String): Nothing {
        val hint = unknownHint(prepared, word)
        throw IllegalArgumentException("Unknown word '$word'.${hint.ifEmpty { " Try numbers, operators like + - & | ^ ~, or /help." }}")
    }

    private fun assemble(text: String, understood: String?): TomatoProgram {
        val lines = text.drop(4).split(Regex("[;\\n]")).map(String::trim).filter(String::isNotEmpty)
        require(lines.size <= 32) { "Maximum 32 instructions." }
        val out = mutableListOf(1)
        var returned = false
        fun reg(value: String?): Int {
            require(value != null && Regex("^R[0-7]$", RegexOption.IGNORE_CASE).matches(value)) { "Use registers R0–R7." }
            return value.substring(1).toInt()
        }
        for (raw in lines) {
            var line = raw
            Regex("^(LD|LI)\\s+(R\\d+)\\s*,?\\s*(\\[(\\d+)]|(\\S+))$", RegexOption.IGNORE_CASE).matchEntire(line)?.let {
                line = if (it.groupValues[4].isNotEmpty()) "LOAD ${it.groupValues[2]},[${it.groupValues[4]}]"
                else "${it.groupValues[2]}=${it.groupValues[5]}"
            } ?: Regex("^ST\\s*\\[(\\d+)]\\s*,?\\s*(R\\d+)$", RegexOption.IGNORE_CASE).matchEntire(line)?.let {
                line = "STORE [${it.groupValues[1]}],${it.groupValues[2]}"
            } ?: Regex("^MOV\\s+(R\\d+)\\s*,?\\s*(R\\d+)$", RegexOption.IGNORE_CASE).matchEntire(line)?.let {
                line = "OR ${it.groupValues[1]},${it.groupValues[2]},${it.groupValues[2]}"
            } ?: Regex("^CLR\\s+(R\\d+)$", RegexOption.IGNORE_CASE).matchEntire(line)?.let {
                line = "${it.groupValues[1]}=0"
            }
            require(!returned) { "RETURN must be last." }
            val immediate = Regex("^(R\\d+)\\s*=\\s*(-?(?:0x[\\da-f]+|0b[01]+|\\d+))$", RegexOption.IGNORE_CASE).matchEntire(line)
            if (immediate != null) {
                val n = parseLiteral(immediate.groupValues[2])
                require(n in -2147483648L..4294967295L) { "Literal is outside 32-bit range." }
                val u = n and 0xffffffffL
                out += listOf(1, reg(immediate.groupValues[1]), (u shr 24).toInt(), ((u shr 16) and 255).toInt(), ((u shr 8) and 255).toInt(), (u and 255).toInt())
                continue
            }
            val load = Regex("^LOAD\\s+(R\\d+)\\s*,\\s*\\[(\\d+)]$", RegexOption.IGNORE_CASE).matchEntire(line)
            val store = Regex("^STORE\\s*\\[(\\d+)]\\s*,\\s*(R\\d+)$", RegexOption.IGNORE_CASE).matchEntire(line)
            if (load != null || store != null) {
                val offset = (load?.groupValues?.get(2) ?: store!!.groupValues[1]).toIntOrNull()
                require(offset != null && offset in 0..255) { "Memory offsets are 0–255." }
                out += listOf(if (load != null) 32 else 33, reg(load?.groupValues?.get(1) ?: store!!.groupValues[2]), offset)
                continue
            }
            val parts = line.replace(",", " ").split(Regex("\\s+")).filter(String::isNotEmpty).toMutableList()
            val op = parts.removeFirstOrNull()?.uppercase(Locale.ROOT) ?: ""
            val code = mapOf("ADD" to 2, "SUB" to 3, "AND" to 4, "OR" to 5, "XOR" to 6, "MASKADD" to 7,
                "XORAND" to 8, "ANDADD" to 9, "ORADD" to 10, "XORADD" to 11, "ANDN" to 12, "ORN" to 13)[op]
            if (op == "RETURN") {
                require(parts.size == 1) { "RETURN needs one register." }
                out += listOf(48, reg(parts[0]))
                returned = true
            } else if (code != null) {
                val count = if (code >= 7 && code != 12 && code != 13) 4 else 3
                require(parts.size == count) { "Wrong operand count." }
                out += code
                out += parts.map(::reg)
                if (count == 3) out += 0
            } else {
                throw IllegalArgumentException("Unsupported instruction: $op")
            }
        }
        require(returned) { "End the program with RETURN R0 (or another register)." }
        return TomatoProgram(text, out.map(Int::toByte).toByteArray(), understood)
    }

    private fun parseLiteral(raw: String): Long {
        val negative = raw.startsWith("-")
        val value = if (negative) raw.drop(1) else raw
        val parsed = when {
            value.startsWith("0x", true) -> value.drop(2).toLongOrNull(16)
            value.startsWith("0b", true) -> value.drop(2).toLongOrNull(2)
            else -> value.toLongOrNull()
        } ?: throw IllegalArgumentException("Literal is outside 32-bit range.")
        return if (negative) -parsed else parsed
    }

    private fun String.startsWithRun() = Regex("^/run\\b", RegexOption.IGNORE_CASE).containsMatchIn(this)
    private fun String.startsWithCalc() = Regex("^/calc\\b", RegexOption.IGNORE_CASE).containsMatchIn(this)

    private class FunctionExpander {
        private val names = "plus|minus|and|or|xor|nand|nor|xnor|not|andn|orn|maskadd|xorand|andadd|oradd|xoradd"
        private val head = Regex("\\b($names)\\s*\\(", RegexOption.IGNORE_CASE)
        private val tailOp = Regex("($names|[+\\-&|^~(,])\\s*$", RegexOption.IGNORE_CASE)
        private val tailValue = Regex("[0-9A-Za-z_)]\\s*$")
        private val ops = mapOf("plus" to "+", "minus" to "-", "and" to "&", "or" to "|", "xor" to "^", "nand" to "&", "nor" to "|", "xnor" to "^")

        fun expand(source: String, depth: Int = 0, afterOp: Boolean = false): String {
            require(depth <= MAX_DEPTH) { "Expression is too deeply nested." }
            val match = head.find(source) ?: return source
            val before = source.substring(0, match.range.first)
            val call = if (tailOp.containsMatchIn(before)) true else if (tailValue.containsMatchIn(before)) false else !afterOp
            if (!call) {
                val endName = match.range.first + match.groupValues[1].length
                return source.substring(0, endName) + expand(source.substring(endName), depth, true)
            }
            val name = match.groupValues[1].lowercase(Locale.ROOT)
            var cursor = match.range.last + 1
            var nesting = 1
            while (cursor < source.length && nesting > 0) {
                when (source[cursor]) { '(' -> nesting++; ')' -> nesting-- }
                cursor++
            }
            require(nesting == 0) { "Function needs two arguments or more (up to eight), like and(45, 34)." }
            val args = splitArgs(source.substring(match.range.last + 1, cursor - 1))
            val made = when {
                name == "not" -> {
                    require(args.size == 1 && args[0].isNotEmpty()) { "Function not needs exactly one argument, like not(5)." }
                    "~(${expand(args[0], depth + 1)})"
                }
                name in setOf("maskadd", "xorand", "andadd", "oradd", "xoradd", "andn", "orn") -> {
                    val need = if (name == "andn" || name == "orn") 2 else 3
                    require(args.size == need && args.none(String::isEmpty)) {
                        "Function $name needs exactly ${if (need == 2) "two" else "three"} arguments, like $name(${if (need == 2) "6, 3" else "1, 2, 3"})."
                    }
                    "$name(${args.joinToString(", ") { expand(it, depth + 1) }})"
                }
                else -> {
                    require(args.size in 2..8 && args.none(String::isEmpty)) { "Function needs two arguments or more (up to eight), like and(45, 34)." }
                    val folded = args.drop(1).fold(expand(args[0], depth + 1)) { acc, arg -> "($acc ${ops.getValue(name)} ${expand(arg, depth + 1)})" }
                    if (name in setOf("nand", "nor", "xnor")) "~($folded)" else folded
                }
            }
            return before + made + expand(source.substring(cursor), depth, true)
        }

        private fun splitArgs(source: String): List<String> {
            val result = mutableListOf<String>()
            var depth = 0
            var current = ""
            source.forEach { char ->
                when {
                    char == '(' -> { depth++; current += char }
                    char == ')' -> { depth--; current += char }
                    char == ',' && depth == 0 -> { result += current; current = "" }
                    else -> current += char
                }
            }
            result += current
            return result.map(String::trim)
        }
    }

    private sealed interface Node {
        data class Const(val value: Long, val raw: String) : Node
        data class Reg(val register: Int) : Node
        data class Not(val value: Node) : Node
        data class Binary(val op: String, val left: Node, val right: Node) : Node
        data class Multi(val op: String, val function: String, val args: List<Node>) : Node
    }

    private class ExpressionCompiler(private val expression: String, private val prepared: String) {
        private val reserved = mutableSetOf<Int>()
        private val tokens: List<String>
        private var position = 0
        private val lines = mutableListOf<String>()
        private lateinit var free: MutableList<Int>
        var resultRegister = 0
            private set
        private val precedence = mapOf("|" to 1, "^" to 2, "&" to 3, "+" to 4, "-" to 4)
        private val opNames = mapOf("+" to "ADD", "-" to "SUB", "&" to "AND", "|" to "OR", "^" to "XOR")
        private val symbols = opNames.entries.associate { it.value to it.key }
        private val tri = mapOf("maskadd" to "MASKADD", "xorand" to "XORAND", "andadd" to "ANDADD", "oradd" to "ORADD", "xoradd" to "XORADD")
        private val bin2 = mapOf("andn" to "ANDN", "orn" to "ORN")

        init {
            val words = Regex("(?<![0-9A-Za-z_])[A-Za-z_][A-Za-z0-9_]*").findAll(expression).map { it.value }
            for (word in words) {
                when {
                    Regex("^R[0-7]$", RegexOption.IGNORE_CASE).matches(word) -> reserved += word.substring(1).toInt()
                    Regex("^R[0-9]+$", RegexOption.IGNORE_CASE).matches(word) -> throw IllegalArgumentException("Use registers R0–R7.")
                    word.lowercase(Locale.ROOT) in tri.keys + bin2.keys -> Unit
                    else -> unknownWord(word, prepared)
                }
            }
            tokens = Regex("0x[\\da-f]+|0b[01]+|\\d+|[A-Za-z_][A-Za-z0-9_]*|[()+\\-&|^~,]|\\S", RegexOption.IGNORE_CASE)
                .findAll(expression).map { it.value }.toList()
            free = mutableListOf(7, 6, 5, 4, 3, 2, 1, 0).filter { it !in reserved }.toMutableList()
        }

        fun parse(): Node {
            val root = parseAst()
            if (position != tokens.size) {
                val token = tokens[position]
                if (token in setOf("*", "/", "%")) throw IllegalArgumentException("'$token' is not installed. Tomato runs + - & | ^ ~.")
                throw IllegalArgumentException("Unsupported expression. Try 23 + 19.")
            }
            return root
        }

        private fun parseAst(min: Int = 0, depth: Int = 0): Node {
            require(depth <= MAX_DEPTH) { "Expression is too deeply nested." }
            val token = tokens.getOrNull(position++)
            var node = when {
                token == "(" -> parseAst(0, depth + 1).also {
                    require(tokens.getOrNull(position++) == ")") { "Missing closing parenthesis." }
                }
                token == "~" -> Node.Not(parseAst(5, depth + 1))
                token == "-" -> {
                    val next = tokens.getOrNull(position++)
                    require(next != null && Regex("^(0x[\\da-f]+|0b[01]+|\\d+)$", RegexOption.IGNORE_CASE).matches(next)) { "Minus needs a number." }
                    Node.Const(-parseLiteral(next), "-$next")
                }
                token != null && Regex("^(0x[\\da-f]+|0b[01]+|\\d+)$", RegexOption.IGNORE_CASE).matches(token) ->
                    Node.Const(parseLiteral(token), token)
                token != null && Regex("^[A-Za-z_][A-Za-z0-9_]*$").matches(token) -> {
                    val lower = token.lowercase(Locale.ROOT)
                    when {
                        Regex("^R[0-7]$", RegexOption.IGNORE_CASE).matches(token) -> Node.Reg(token.substring(1).toInt())
                        Regex("^R\\d+$", RegexOption.IGNORE_CASE).matches(token) -> throw IllegalArgumentException("Use registers R0–R7.")
                        (lower in tri || lower in bin2) && tokens.getOrNull(position) == "(" -> {
                            position++
                            val need = if (lower in tri) 3 else 2
                            require(tokens.getOrNull(position) != ")") { "Function $lower needs exactly $need arguments." }
                            val args = mutableListOf<Node>()
                            while (true) {
                                args += parseAst(0, depth + 1)
                                if (tokens.getOrNull(position) == ",") { position++; continue }
                                break
                            }
                            require(tokens.getOrNull(position++) == ")") { "Missing closing parenthesis." }
                            require(args.size == need) { "Function $lower needs exactly $need arguments." }
                            Node.Multi(tri[lower] ?: bin2.getValue(lower), lower, args)
                        }
                        else -> unknownWord(token, prepared)
                    }
                }
                token in setOf("*", "/", "%") -> throw IllegalArgumentException("'$token' is not installed. Tomato runs + - & | ^ ~.")
                else -> throw IllegalArgumentException("Use numbers, parentheses and + - & | ^ ~.")
            }
            tokens.getOrNull(position)?.let {
                if (it in setOf("*", "/", "%")) throw IllegalArgumentException("'$it' is not installed. Tomato runs + - & | ^ ~.")
            }
            while ((precedence[tokens.getOrNull(position)] ?: -1) >= min) {
                val op = tokens[position++]
                node = Node.Binary(opNames.getValue(op), node, parseAst(precedence.getValue(op) + 1, depth + 1))
            }
            return node
        }

        private fun show(node: Node): String = when (node) {
            is Node.Const -> node.raw
            is Node.Reg -> "R${node.register}"
            is Node.Not -> {
                val shown = show(node.value)
                "~" + if (node.value is Node.Const || node.value is Node.Reg) shown else "($shown)"
            }
            is Node.Multi -> "${node.function}(${node.args.joinToString(", ") { show(it) }})"
            is Node.Binary -> "(${show(node.left)} ${symbols.getValue(node.op)} ${show(node.right)})"
        }

        fun showRoot(node: Node): String = show(node).removeSurrounding("(", ")")

        private fun alloc(): Int {
            require(free.isNotEmpty()) { "Expression needs more than eight registers." }
            return free.removeAt(free.lastIndex)
        }

        private fun copy(register: Int): Int = alloc().also { lines += "OR R$it,R$register,R$register" }

        private fun gen(node: Node, depth: Int = 0): Int {
            require(depth <= MAX_DEPTH) { "Expression is too deeply nested." }
            return when (node) {
                is Node.Const -> alloc().also { lines += "R$it=${node.value}" }
                is Node.Reg -> node.register
                is Node.Not -> {
                    var a = gen(node.value, depth + 1)
                    if (a in reserved) a = copy(a)
                    val c = alloc()
                    lines += "R$c=4294967295"
                    lines += "XOR R$a,R$a,R$c"
                    free += c
                    a
                }
                is Node.Multi -> {
                    val registers = node.args.map { gen(it, depth + 1) }
                    var a = registers[0]
                    if (a in reserved) a = copy(a)
                    lines += "${node.op} R$a,R$a," + registers.drop(1).joinToString(",") { "R$it" }
                    registers.drop(1).forEach { if (it !in reserved && it != a) free += it }
                    a
                }
                is Node.Binary -> {
                    var a = gen(node.left, depth + 1)
                    val b = gen(node.right, depth + 1)
                    if (a in reserved) a = copy(a)
                    lines += "${node.op} R$a,R$a,R$b"
                    if (b !in reserved) free += b
                    a
                }
            }
        }

        fun generate(root: Node): List<String> {
            resultRegister = gen(root)
            return lines
        }
    }
}
