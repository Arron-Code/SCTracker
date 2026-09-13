package com.sctracker.reference.data

import com.sctracker.reference.domain.AppendResult
import com.sctracker.reference.domain.DomainException
import com.sctracker.reference.domain.ErrorCode
import com.sctracker.reference.domain.Event
import com.sctracker.reference.domain.EventChain
import com.sctracker.reference.domain.VerificationResult
import java.io.File
import kotlinx.serialization.decodeFromString

class AppendOnlyFileEventStore(private val file: File) {
    init {
        file.parentFile?.mkdirs()
        if (!file.exists()) file.createNewFile()
    }

    @Synchronized
    fun loadVerified(): List<Event> {
        val events = file.useLines { lines ->
            lines.filter(String::isNotBlank)
                .map { EventChain.run { CanonicalParser.decode(it) } }
                .toList()
        }
        when (val result = EventChain.verify(events)) {
            is VerificationResult.Valid -> return events
            is VerificationResult.Invalid ->
                throw DomainException(result.code, "persistent event log failed at ${result.eventIndex}")
        }
    }

    @Synchronized
    fun append(event: Event): AppendResult {
        val events = loadVerified()
        events.firstOrNull { it.eventId == event.eventId }?.let { existing ->
            if (existing == event) return AppendResult.AlreadyPresent(existing)
            throw DomainException(ErrorCode.EVENT_ID_COLLISION, "event ID collision in local log")
        }
        val expectedSequence = (events.lastOrNull()?.sequence ?: 0) + 1
        if (event.sequence != expectedSequence) {
            throw DomainException(ErrorCode.EVENT_SEQUENCE_INVALID, "event does not extend local log")
        }
        val verified = EventChain.verify(events + event)
        if (verified is VerificationResult.Invalid) {
            throw DomainException(verified.code, "event refused before persistent append")
        }
        file.appendText(EventChain.serializedLine(event) + "\n", Charsets.UTF_8)
        return AppendResult.Appended(event)
    }

    private object CanonicalParser {
        fun decode(line: String): Event = com.sctracker.reference.domain.CanonicalJson.parser.decodeFromString(line)
    }
}
