import Foundation

enum AppLanguage: String, CaseIterable, Identifiable {
    case german = "de"
    case english = "en"
    case amharic = "am"
    case tigrinya = "ti"

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: rawValue) }

    var label: String {
        switch self {
        case .german: return "Deutsch"
        case .english: return "English"
        case .amharic: return "አማርኛ"
        case .tigrinya: return "ትግርኛ"
        }
    }
}

enum TextKey: String {
    case appTitle, workflows, batches, transfers, exceptions, package, settings
    case offlineReady, newBatch, reference, origin, sackCount, create
    case noBatches, sacks, nextAction, issue, seal, dispatch, open, markVoid, markDamaged
    case pending, accepted, rejected, offerTransfer, accept, reject, offerHash
    case noExceptions, quarantine, conflict, resolve, importPackage, exportPackage
    case packageVerified, packageNotVerified, trust, role, signing, secureEnclave, simulatorFallback
    case chipIntegration, chipDisabled, uidLookupOnly, language, error
}

enum L10n {
    static func text(_ key: TextKey, language: AppLanguage) -> String {
        translations[language]?[key] ?? translations[.english]![key]!
    }

    private static let translations: [AppLanguage: [TextKey: String]] = [
        .english: [
            .appTitle: "SCTracker Coffee Evidence", .workflows: "Workflows", .batches: "Batches",
            .transfers: "Transfers", .exceptions: "Exceptions", .package: "Packages",
            .settings: "Settings", .offlineReady: "Offline-ready on this device",
            .newBatch: "New batch genesis", .reference: "Batch reference", .origin: "Origin",
            .sackCount: "Sacks (1–100)", .create: "Create batch", .noBatches: "No batches yet",
            .sacks: "sacks", .nextAction: "Available actions", .issue: "Issue",
            .seal: "Seal", .dispatch: "Start transit", .open: "Open",
            .markVoid: "Void", .markDamaged: "Damaged", .pending: "Pending",
            .accepted: "Accepted", .rejected: "Rejected", .offerTransfer: "Offer transfer",
            .accept: "Accept", .reject: "Reject", .offerHash: "Exact offer hash",
            .noExceptions: "No unresolved exceptions", .quarantine: "Quarantined",
            .conflict: "Conflicting event chain", .resolve: "Mark reviewed",
            .importPackage: "Import and verify", .exportPackage: "Create signed export",
            .packageVerified: "Verified before import", .packageNotVerified: "No verified package",
            .trust: "Trust state", .role: "Role placeholder", .signing: "Device signing",
            .secureEnclave: "Secure Enclave P-256", .simulatorFallback: "Simulator software fallback — development only",
            .chipIntegration: "Seal chip integration", .chipDisabled: "Disabled / unconfigured",
            .uidLookupOnly: "UID is lookup only and never proof of authenticity",
            .language: "Language", .error: "Error"
        ],
        .german: [
            .appTitle: "SCTracker Kaffee-Nachweise", .workflows: "Abläufe", .batches: "Chargen",
            .transfers: "Übergaben", .exceptions: "Ausnahmen", .package: "Pakete",
            .settings: "Einstellungen", .offlineReady: "Offline auf diesem Gerät verfügbar",
            .newBatch: "Neue Chargen-Genesis", .reference: "Chargenreferenz", .origin: "Herkunft",
            .sackCount: "Säcke (1–100)", .create: "Charge anlegen", .noBatches: "Noch keine Chargen",
            .sacks: "Säcke", .nextAction: "Verfügbare Aktionen", .issue: "Ausgeben",
            .seal: "Versiegeln", .dispatch: "Transport starten", .open: "Öffnen",
            .markVoid: "Ungültig", .markDamaged: "Beschädigt", .pending: "Ausstehend",
            .accepted: "Angenommen", .rejected: "Abgelehnt", .offerTransfer: "Übergabe anbieten",
            .accept: "Annehmen", .reject: "Ablehnen", .offerHash: "Exakter Angebots-Hash",
            .noExceptions: "Keine offenen Ausnahmen", .quarantine: "In Quarantäne",
            .conflict: "Widersprüchliche Ereigniskette", .resolve: "Als geprüft markieren",
            .importPackage: "Importieren und prüfen", .exportPackage: "Signierten Export erstellen",
            .packageVerified: "Vor Import verifiziert", .packageNotVerified: "Kein verifiziertes Paket",
            .trust: "Vertrauensstatus", .role: "Rollen-Platzhalter", .signing: "Gerätesignatur",
            .secureEnclave: "Secure Enclave P-256", .simulatorFallback: "Simulator-Softwarefallback — nur Entwicklung",
            .chipIntegration: "Siegelchip-Integration", .chipDisabled: "Deaktiviert / nicht konfiguriert",
            .uidLookupOnly: "UID dient nur zur Suche und ist kein Echtheitsnachweis",
            .language: "Sprache", .error: "Fehler"
        ],
        .amharic: [
            .appTitle: "SCTracker የቡና ማስረጃ", .workflows: "የስራ ሂደቶች", .batches: "ባች",
            .transfers: "ርክክቦች", .exceptions: "ልዩ ሁኔታዎች", .package: "ጥቅሎች",
            .settings: "ቅንብሮች", .offlineReady: "በዚህ መሣሪያ ከመስመር ውጭ ዝግጁ",
            .newBatch: "አዲስ ባች መጀመሪያ", .reference: "የባች ማጣቀሻ", .origin: "መነሻ",
            .sackCount: "ከረጢቶች (1–100)", .create: "ባች ፍጠር", .noBatches: "እስካሁን ባች የለም",
            .sacks: "ከረጢቶች", .nextAction: "የሚገኙ እርምጃዎች", .issue: "አውጣ",
            .seal: "አሽግ", .dispatch: "መጓጓዣ ጀምር", .open: "ክፈት",
            .markVoid: "ውድቅ", .markDamaged: "ተጎድቷል", .pending: "በመጠባበቅ ላይ",
            .accepted: "ተቀብሏል", .rejected: "ውድቅ ተደርጓል", .offerTransfer: "ርክክብ አቅርብ",
            .accept: "ተቀበል", .reject: "ውድቅ አድርግ", .offerHash: "ትክክለኛ የአቅርቦት ሃሽ",
            .noExceptions: "ያልተፈቱ ልዩ ሁኔታዎች የሉም", .quarantine: "ተለይቷል",
            .conflict: "የሚጋጭ የክስተት ሰንሰለት", .resolve: "እንደተገመገመ ምልክት አድርግ",
            .importPackage: "አስገባና አረጋግጥ", .exportPackage: "የተፈረመ ውጪ ፍጠር",
            .packageVerified: "ከማስገባት በፊት ተረጋግጧል", .packageNotVerified: "የተረጋገጠ ጥቅል የለም",
            .trust: "የእምነት ሁኔታ", .role: "የሚና ቦታ ያዥ", .signing: "የመሣሪያ ፊርማ",
            .secureEnclave: "Secure Enclave P-256", .simulatorFallback: "የሲሙሌተር ሶፍትዌር — ለልማት ብቻ",
            .chipIntegration: "የማኅተም ቺፕ ግንኙነት", .chipDisabled: "ተሰናክሏል / አልተዋቀረም",
            .uidLookupOnly: "UID ለፍለጋ ብቻ ነው፤ የትክክለኛነት ማስረጃ አይደለም",
            .language: "ቋንቋ", .error: "ስህተት"
        ],
        .tigrinya: [
            .appTitle: "SCTracker መረጋገጺ ቡን", .workflows: "መስርሓት", .batches: "ባች",
            .transfers: "ምርኽኻባት", .exceptions: "ፍሉያት ኩነታት", .package: "ጥቕላት",
            .settings: "ቅንብራት", .offlineReady: "ኣብዚ መሳርሒ ካብ መስመር ወጻኢ ድሉው",
            .newBatch: "ሓድሽ መጀመርታ ባች", .reference: "መወከሲ ባች", .origin: "መበገሲ",
            .sackCount: "ከረጺት (1–100)", .create: "ባች ፍጠር", .noBatches: "ገና ባች የለን",
            .sacks: "ከረጺት", .nextAction: "ዝርከቡ ስጉምትታት", .issue: "ኣውጽእ",
            .seal: "ዕሸግ", .dispatch: "መጓዓዝያ ጀምር", .open: "ክፈት",
            .markVoid: "ዘይሰርሕ", .markDamaged: "ዝተጎድአ", .pending: "ኣብ ምጽባይ",
            .accepted: "ተቐቢሉ", .rejected: "ተነጺጉ", .offerTransfer: "ርኽክብ ኣቕርብ",
            .accept: "ተቐበል", .reject: "ንጸግ", .offerHash: "ልክዕ ሃሽ ዕድመ",
            .noExceptions: "ዘይተፈትሑ ፍሉያት ኩነታት የለዉን", .quarantine: "ተፈልዩ",
            .conflict: "ዝጋጮ ሰንሰለት ፍጻመ", .resolve: "ከም ዝተገምገመ ምልክት ግበር",
            .importPackage: "ኣእቱን ኣረጋግጽን", .exportPackage: "ዝተፈረመ ሰደድ ፍጠር",
            .packageVerified: "ቅድሚ ምእታው ተረጋጊጹ", .packageNotVerified: "ዝተረጋገጸ ጥቕል የለን",
            .trust: "ኩነታት እምነት", .role: "መትሓዚ ተራ", .signing: "ፊርማ መሳርሒ",
            .secureEnclave: "Secure Enclave P-256", .simulatorFallback: "ሶፍትዌር ሲሙሌተር — ንልምዓት ጥራይ",
            .chipIntegration: "ምትእስሳር ቺፕ ማሕተም", .chipDisabled: "ተሰናኺሉ / ኣይተዋቐረን",
            .uidLookupOnly: "UID ንምድላይ ጥራይ እዩ፤ መረጋገጺ ትኽክለኛነት ኣይኮነን",
            .language: "ቋንቋ", .error: "ጌጋ"
        ]
    ]
}
