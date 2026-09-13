package com.sctracker.reference.domain

import java.security.MessageDigest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

object CanonicalJson {
    val parser = Json {
        encodeDefaults = true
        explicitNulls = true
        ignoreUnknownKeys = false
    }

    fun encode(element: JsonElement): ByteArray = buildString {
        appendCanonical(element)
    }.toByteArray(Charsets.UTF_8)

    fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }

    fun hash(element: JsonElement): String = sha256(encode(element))

    private fun StringBuilder.appendCanonical(element: JsonElement) {
        when (element) {
            JsonNull -> append("null")
            is JsonObject -> {
                append('{')
                element.entries.sortedWith { left, right ->
                    compareUtf8(left.key, right.key)
                }.forEachIndexed { index, (key, value) ->
                    if (index > 0) append(',')
                    append(Json.encodeToString(JsonPrimitive.serializer(), JsonPrimitive(key)))
                    append(':')
                    appendCanonical(value)
                }
                append('}')
            }
            is JsonArray -> {
                append('[')
                element.forEachIndexed { index, value ->
                    if (index > 0) append(',')
                    appendCanonical(value)
                }
                append(']')
            }
            is JsonPrimitive -> {
                require(
                    element.isString ||
                        (element.content.matches(INTEGER_OR_BOOLEAN) && element.content != "-0"),
                ) {
                    "Non-finite or non-canonical primitive"
                }
                append(Json.encodeToString(JsonPrimitive.serializer(), element))
            }
        }
    }

    internal fun compareUtf8(left: String, right: String): Int {
        val leftBytes = left.toByteArray(Charsets.UTF_8)
        val rightBytes = right.toByteArray(Charsets.UTF_8)
        for (index in 0 until minOf(leftBytes.size, rightBytes.size)) {
            val comparison = (leftBytes[index].toInt() and 0xff)
                .compareTo(rightBytes[index].toInt() and 0xff)
            if (comparison != 0) return comparison
        }
        return leftBytes.size.compareTo(rightBytes.size)
    }

    private val INTEGER_OR_BOOLEAN = Regex("""true|false|-?(0|[1-9]\d*)""")
}
