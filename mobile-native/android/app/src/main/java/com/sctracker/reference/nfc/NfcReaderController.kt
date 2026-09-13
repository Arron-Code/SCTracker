package com.sctracker.reference.nfc

import android.app.Activity
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle

class NfcReaderController(
    private val activity: Activity,
    private val onTag: (Tag) -> Unit,
) : NfcAdapter.ReaderCallback {
    private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(activity)

    fun enable() {
        adapter?.enableReaderMode(
            activity,
            this,
            NfcAdapter.FLAG_READER_NFC_A or
                NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
            Bundle(),
        )
    }

    fun disable() {
        adapter?.disableReaderMode(activity)
    }

    override fun onTagDiscovered(tag: Tag) {
        onTag(tag)
    }
}
