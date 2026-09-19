package com.tmarhguy.envelop.bridge

internal fun parseJobHex(text: String): ByteArray? {
    val compact = text.filterNot(Char::isWhitespace)
    if (compact.isEmpty() || compact.length % 2 != 0) return null
    if (compact.any { it !in '0'..'9' && it !in 'a'..'f' && it !in 'A'..'F' }) return null
    return runCatching { compact.chunked(2).map { it.toInt(16).toByte() }.toByteArray() }.getOrNull()
}

internal fun isJobUnavailable(error: Throwable): Boolean =
    error.message.orEmpty().contains("job unavailable", ignoreCase = true)
