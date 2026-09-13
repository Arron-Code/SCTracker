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
                element.entries.sortedBy { it.key }.forEachIndexed { index, (key, value) ->
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
                require(element.isString || element.content.matches(NUMBER_OR_BOOLEAN)) {
                    "Non-finite or non-canonical primitive"
                }
                append(Json.encodeToString(JsonPrimitive.serializer(), element))
            }
        }
    }

    private val NUMBER_OR_BOOLEAN =
        Regex("""true|false|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?""")
}
