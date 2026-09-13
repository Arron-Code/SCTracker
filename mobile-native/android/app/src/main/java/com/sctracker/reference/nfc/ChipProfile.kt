package com.sctracker.reference.nfc

sealed interface ChipProfile {
    val manufacturer: String?
    val model: String?
    val compatibilityReference: String?

    data object DisabledUnconfigured : ChipProfile {
        override val manufacturer: String? = null
        override val model: String? = null
        override val compatibilityReference: String? = null
    }

    data class Configured(
        override val manufacturer: String,
        override val model: String,
        override val compatibilityReference: String,
        val selectCommand: ByteArray,
        val readCommand: ByteArray,
        val writeCommandFactory: (ByteArray) -> ByteArray,
        val readBackCommand: ByteArray,
        val successfulStatusWords: Set<Int>,
    ) : ChipProfile
}

data class ChipRead(val uidLookupHex: String, val payload: ByteArray, val statusWord: Int)

sealed interface ChipOperationResult {
    data class Success(val readBack: ChipRead) : ChipOperationResult
    data class Blocked(val reason: String) : ChipOperationResult
    data class Failed(val reason: String) : ChipOperationResult
}
