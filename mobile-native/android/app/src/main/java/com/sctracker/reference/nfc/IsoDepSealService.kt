package com.sctracker.reference.nfc

import android.nfc.Tag
import android.nfc.tech.IsoDep

class IsoDepSealService(private val profile: ChipProfile = ChipProfile.DisabledUnconfigured) {
    fun read(tag: Tag): ChipOperationResult = withConfiguredProfile { configured ->
        withIsoDep(tag) { isoDep ->
            transceiveChecked(isoDep, configured.selectCommand, configured)
            val response = transceiveChecked(isoDep, configured.readCommand, configured)
            ChipOperationResult.Success(
                ChipRead(tag.id.toHex(), response.data, response.statusWord),
            )
        }
    }

    fun writeAndReadBack(tag: Tag, payload: ByteArray): ChipOperationResult =
        withConfiguredProfile { configured ->
            withIsoDep(tag) { isoDep ->
                transceiveChecked(isoDep, configured.selectCommand, configured)
                transceiveChecked(isoDep, configured.writeCommandFactory(payload), configured)
                val readBack = transceiveChecked(isoDep, configured.readBackCommand, configured)
                if (!readBack.data.contentEquals(payload)) {
                    return@withIsoDep ChipOperationResult.Failed("CHIP_READ_BACK_MISMATCH")
                }
                ChipOperationResult.Success(
                    ChipRead(tag.id.toHex(), readBack.data, readBack.statusWord),
                )
            }
        }

    private fun withConfiguredProfile(
        operation: (ChipProfile.Configured) -> ChipOperationResult,
    ): ChipOperationResult = when (val current = profile) {
        ChipProfile.DisabledUnconfigured -> ChipOperationResult.Blocked(
            "CHIP_PROFILE_UNCONFIGURED: configure manufacturer, model, reviewed APDUs, " +
                "key provisioning, and compatibility evidence before authentication or update",
        )
        is ChipProfile.Configured -> operation(current)
    }

    private fun withIsoDep(
        tag: Tag,
        operation: (IsoDep) -> ChipOperationResult,
    ): ChipOperationResult {
        val isoDep = IsoDep.get(tag) ?: return ChipOperationResult.Failed("Tag does not support IsoDep")
        return try {
            isoDep.connect()
            operation(isoDep)
        } catch (error: Exception) {
            ChipOperationResult.Failed(error.javaClass.simpleName)
        } finally {
            runCatching { isoDep.close() }
        }
    }

    private fun transceiveChecked(
        isoDep: IsoDep,
        command: ByteArray,
        profile: ChipProfile.Configured,
    ): ApduResponse {
        require(command.isNotEmpty()) { "Configured command must not be empty" }
        val raw = isoDep.transceive(command)
        require(raw.size >= 2) { "Malformed response" }
        val statusWord = ((raw[raw.lastIndex - 1].toInt() and 0xff) shl 8) or
            (raw[raw.lastIndex].toInt() and 0xff)
        check(statusWord in profile.successfulStatusWords) { "Chip command rejected" }
        return ApduResponse(raw.copyOf(raw.size - 2), statusWord)
    }

    private data class ApduResponse(val data: ByteArray, val statusWord: Int)

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
