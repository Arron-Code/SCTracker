package com.sctracker.reference.ui

enum class AppLanguage(val code: String, val nativeName: String) {
    DE("de", "Deutsch"),
    EN("en", "English"),
    AM("am", "አማርኛ"),
    TI("ti", "ትግርኛ");

    companion object {
        fun fromCode(code: String?): AppLanguage = entries.firstOrNull { it.code == code } ?: EN
    }
}

data class Strings(
    val evidence: String,
    val offline: String,
    val overview: String,
    val sacks: String,
    val transfers: String,
    val exceptions: String,
    val packages: String,
    val activeBatch: String,
    val verifiedChain: String,
    val pendingTransfers: String,
    val quarantined: String,
    val genesis: String,
    val genesisHint: String,
    val createTen: String,
    val sealWorkflow: String,
    val unconfiguredChip: String,
    val offer: String,
    val accept: String,
    val reject: String,
    val exactHash: String,
    val exceptionTitle: String,
    val conflict: String,
    val quarantine: String,
    val resolveHint: String,
    val exportImport: String,
    val verifyFirst: String,
    val createPackage: String,
    val importPackage: String,
    val trust: String,
    val prototype: String,
    val chooseLanguage: String,
)

val localizedStrings = mapOf(
    AppLanguage.EN to Strings(
        "Coffee evidence", "Offline ready", "Overview", "Sacks", "Transfers", "Exceptions",
        "Packages", "Active batch", "Hash chain verified", "Pending transfers", "Quarantined",
        "Genesis issuance", "Create 1–100 deterministic sack identities before issuance.",
        "Create 10 sacks", "Seal workflow", "NFC update blocked: chip profile is unconfigured.",
        "Create offer", "Accept", "Reject", "Decision references the exact offer hash.",
        "Exceptions and review", "Conflicting event branch", "Quarantine", "Review evidence; never overwrite history.",
        "Signed export / import", "Signature and every file hash are verified before import.",
        "Create signed package", "Verify import", "Role / trust placeholders",
        "Reference only · not production security", "Choose language",
    ),
    AppLanguage.DE to Strings(
        "Kaffee-Nachweise", "Offline bereit", "Übersicht", "Säcke", "Übergaben", "Ausnahmen",
        "Pakete", "Aktive Charge", "Hash-Kette geprüft", "Offene Übergaben", "Quarantäne",
        "Genesis-Ausgabe", "Vor der Ausgabe 1–100 deterministische Sack-Identitäten anlegen.",
        "10 Säcke anlegen", "Siegel-Workflow", "NFC-Update gesperrt: Chip-Profil ist nicht konfiguriert.",
        "Angebot erstellen", "Annehmen", "Ablehnen", "Entscheidung referenziert den exakten Angebots-Hash.",
        "Ausnahmen und Prüfung", "Konfligierender Ereigniszweig", "Quarantäne", "Nachweise prüfen; Historie nie überschreiben.",
        "Signierter Export / Import", "Signatur und jeder Datei-Hash werden vor dem Import geprüft.",
        "Signiertes Paket erstellen", "Import prüfen", "Rollen-/Vertrauensplatzhalter",
        "Nur Referenz · keine Produktionssicherheit", "Sprache auswählen",
    ),
    AppLanguage.AM to Strings(
        "የቡና ማስረጃ", "ከመስመር ውጭ ዝግጁ", "አጠቃላይ", "ከረጢቶች", "ዝውውሮች", "ልዩ ሁኔታዎች",
        "ጥቅሎች", "ንቁ ስብስብ", "የሃሽ ሰንሰለት ተረጋግጧል", "በመጠባበቅ ላይ ያሉ ዝውውሮች", "ለይቶ ማቆያ",
        "የመጀመሪያ ምዝገባ", "ከመስጠት በፊት 1–100 የከረጢት መለያዎችን ይፍጠሩ።",
        "10 ከረጢቶች ይፍጠሩ", "የማኅተም ሂደት", "NFC ዝማኔ ታግዷል፦ የቺፕ መገለጫ አልተዋቀረም።",
        "የዝውውር ጥያቄ", "ተቀበል", "ውድቅ አድርግ", "ውሳኔው ትክክለኛውን የጥያቄ ሃሽ ይጠቅሳል።",
        "ልዩ ሁኔታዎች እና ግምገማ", "የሚጋጭ የክስተት ቅርንጫፍ", "ለይቶ ማቆያ", "ማስረጃ ይፈትሹ፤ ታሪክን አይደምስሱ።",
        "የተፈረመ ላክ / አስገባ", "ከማስገባት በፊት ፊርማና የፋይል ሃሽ ይረጋገጣሉ።",
        "የተፈረመ ጥቅል ፍጠር", "ማስገባትን አረጋግጥ", "የሚና / እምነት ቦታ",
        "ማጣቀሻ ብቻ · የምርት ደህንነት አይደለም", "ቋንቋ ይምረጡ",
    ),
    AppLanguage.TI to Strings(
        "መርትዖ ቡን", "ካብ መስመር ወጻኢ ድሉው", "ሓፈሻዊ", "ከረጺታት", "ምስግጋር", "ፍሉይ ኩነታት",
        "ጥቕላላት", "ንጡፍ ጉጅለ", "ሰንሰለት ሃሽ ተረጋጊጹ", "ዝጽበ ምስግጋር", "ፍሉይ መዕቀቢ",
        "መበገሲ ምዝገባ", "ቅድሚ ምሃብ 1–100 መለለዪ ከረጺት ፍጠሩ።",
        "10 ከረጺት ፍጠሩ", "መስርሕ ማሕተም", "NFC ምሕዳስ ተዓጽዩ፦ መግለጺ ቺፕ ኣይተዋቐረን።",
        "ዝውውር ኣቕርብ", "ተቐበል", "ነጽግ", "ውሳነ ነቲ ልክዕ ሃሽ የመልክት።",
        "ፍሉይ ኩነታትን ግምገማን", "ዝጋጮ ጨንፈር ፍጻመ", "ፍሉይ መዕቀቢ", "መርትዖ መርምሩ፤ ታሪኽ ኣይትደምስሱ።",
        "ዝተፈረመ ሰደድ / ኣእቱ", "ቅድሚ ምእታው ፊርማን ሃሽ ፋይልን ይረጋገጽ።",
        "ዝተፈረመ ጥቕል ፍጠር", "ምእታው ኣረጋግጽ", "ቦታ ግደ / እምነት",
        "መወከሲ ጥራይ · ናይ ምርት ውሕስነት ኣይኮነን", "ቋንቋ ምረጹ",
    ),
)
