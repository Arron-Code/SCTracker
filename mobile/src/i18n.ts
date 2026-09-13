export const languages = ["de", "en", "am", "ti"] as const;

export type Language = (typeof languages)[number];

export type Translation = {
  languageName: string;
  languageCode: string;
  languageChooserTitle: string;
  languageChooserHint: string;
  languageSaveErrorTitle: string;
  languageSaveErrorMessage: string;
  close: string;
  brandSubtitle: string;
  offlineReady: string;
  entities: {
    washedArabica: string;
    naturalArabica: string;
    plot: string;
    batch: string;
  };
  tabs: {
    home: string;
    suppliers: string;
    capture: string;
    shipments: string;
    help: string;
  };
  dashboard: {
    activeShipment: string;
    complete: string;
    plots: string;
    suppliersReady: string;
    localDrafts: string;
    today: string;
    nextSteps: string;
    open: string;
    recapturePolygon: string;
    legalityEvidence: string;
    reviewCooperative: string;
    clarifyDifference: string;
    capturePlot: string;
  };
  suppliers: {
    eyebrow: string;
    title: string;
    description: string;
    producers: string;
    plots: string;
    statuses: {
      complete: string;
      correction: string;
      invited: string;
    };
  };
  capture: {
    eyebrow: string;
    title: string;
    description: string;
    producer: string;
    producerPlaceholder: string;
    farmName: string;
    farmPlaceholder: string;
    area: string;
    areaPlaceholder: string;
    gpsCaptured: string;
    gpsMissing: string;
    gpsInstruction: string;
    locating: string;
    captureGps: string;
    saveDraft: string;
    localData: string;
    savedDrafts: string;
    noDrafts: string;
    localOnly: string;
    alerts: {
      permissionTitle: string;
      permissionMessage: string;
      unavailableTitle: string;
      unavailableMessage: string;
      incompleteTitle: string;
      incompleteMessage: string;
      invalidAreaTitle: string;
      invalidAreaMessage: string;
      savedTitle: string;
      savedMessage: string;
      readErrorTitle: string;
      readErrorMessage: string;
      saveErrorTitle: string;
      saveErrorMessage: string;
    };
  };
  shipments: {
    eyebrow: string;
    title: string;
    description: string;
    origin: string;
    quantity: string;
    readiness: string;
    ethiopia: string;
    statuses: {
      reviewing: string;
      ready: string;
    };
  };
  help: {
    eyebrow: string;
    title: string;
    guideTitle: string;
    intro: string;
    steps: readonly string[];
    privacyTitle: string;
    privacy: string;
    prototype: string;
  };
  accessibility: {
    chooseLanguage: string;
    currentLanguage: string;
    dismissLanguageChooser: string;
    supplierCard: string;
    shipmentCard: string;
  };
};

export const translations = {
  de: {
    languageName: "Deutsch",
    languageCode: "DE",
    languageChooserTitle: "Sprache auswählen",
    languageChooserHint: "Die gewählte Sprache wird auf diesem Gerät gespeichert.",
    languageSaveErrorTitle: "Sprache nicht gespeichert",
    languageSaveErrorMessage: "Die Sprachauswahl konnte auf diesem Gerät nicht gespeichert werden.",
    close: "Schließen",
    brandSubtitle: "Kaffee-Nachweise",
    offlineReady: "Offline bereit",
    entities: {
      washedArabica: "Gewaschener Arabica",
      naturalArabica: "Natürlich aufbereiteter Arabica",
      plot: "Plot",
      batch: "Charge",
    },
    tabs: { home: "Start", suppliers: "Partner", capture: "Kaffee-Plot erfassen", shipments: "Sendungen", help: "Hilfe" },
    dashboard: {
      activeShipment: "AKTIVE KAFFEE-SENDUNG", complete: "vollständig", plots: "Plots",
      suppliersReady: "Lieferanten bereit", localDrafts: "Lokale Entwürfe", today: "HEUTE",
      nextSteps: "Nächste Schritte", open: "3 offen", recapturePolygon: "Polygon vor Ort erneut erfassen",
      legalityEvidence: "Legalitätsnachweis", reviewCooperative: "Kaffa Cooperative prüfen",
      clarifyDifference: "120 kg Differenz klären", capturePlot: "Neuen Kaffee-Plot erfassen",
    },
    suppliers: {
      eyebrow: "LIEFERANTENAUFNAHME", title: "Kaffee-Lieferanten",
      description: "Kooperativen, Exporteure und Produzenten im aktuellen Pilot.",
      producers: "Produzenten", plots: "Kaffee-Plots",
      statuses: { complete: "Vollständig", correction: "Korrektur", invited: "Eingeladen" },
    },
    capture: {
      eyebrow: "OFFLINE-KARTIERUNG", title: "Kaffee-Plot erfassen",
      description: "GPS vor Ort aufnehmen und als lokalen Entwurf speichern.",
      producer: "Produzent", producerPlaceholder: "z. B. Abebe Bekele",
      farmName: "Plot- oder Farmname", farmPlaceholder: "z. B. Keta Plot 04",
      area: "Fläche in Hektar", areaPlaceholder: "2,50", gpsCaptured: "GPS-Position erfasst",
      gpsMissing: "GPS-Position fehlt", gpsInstruction: "Position direkt am Kaffee-Plot aufnehmen",
      locating: "Position wird ermittelt ...", captureGps: "GPS erfassen", saveDraft: "Offline-Entwurf speichern",
      localData: "LOKALE DATEN", savedDrafts: "Gespeicherte Entwürfe",
      noDrafts: "Noch keine Plot-Entwürfe auf diesem Gerät.", localOnly: "nur lokal",
      alerts: {
        permissionTitle: "Standort nicht freigegeben", permissionMessage: "Die GPS-Berechtigung wird benötigt, um den Kaffee-Plot vor Ort zu erfassen.",
        unavailableTitle: "GPS nicht verfügbar", unavailableMessage: "Der aktuelle Standort konnte nicht gelesen werden. Bitte versuchen Sie es im Freien erneut.",
        incompleteTitle: "Angaben unvollständig", incompleteMessage: "Produzent, Plotname, Fläche und GPS-Position sind erforderlich.",
        invalidAreaTitle: "Fläche ungültig", invalidAreaMessage: "Bitte geben Sie eine positive Fläche in Hektar an.",
        savedTitle: "Offline gespeichert", savedMessage: "Der Plot-Entwurf bleibt auf diesem Gerät, bis eine sichere Backend-Synchronisation konfiguriert ist.",
        readErrorTitle: "Lokale Daten nicht verfügbar", readErrorMessage: "Gespeicherte Plot-Entwürfe konnten nicht gelesen werden.",
        saveErrorTitle: "Speichern fehlgeschlagen", saveErrorMessage: "Der Plot-Entwurf konnte nicht sicher auf diesem Gerät gespeichert werden.",
      },
    },
    shipments: {
      eyebrow: "LIEFERKETTE", title: "Kaffee-Sendungen",
      description: "Mengenbilanz und Bereitschaft für den Compliance-Review.",
      origin: "Herkunft", quantity: "Menge", readiness: "DDS-Bereitschaft", ethiopia: "Äthiopien",
      statuses: { reviewing: "In Prüfung", ready: "Bereit" },
    },
    help: {
      eyebrow: "FELDANLEITUNG", title: "Kaffee-Feldarbeit", guideTitle: "Kurzanleitung",
      intro: "Die mobile App ist für Lieferanten, Kooperativen und Feldteams gedacht.",
      steps: ["Lieferanten- und Produzentendaten prüfen.", "GPS am Plot erfassen und Fläche dokumentieren.", "Entwurf offline speichern.", "Vor der Synchronisation Angaben und Einwilligung kontrollieren."],
      privacyTitle: "Datenschutz",
      privacy: "Standort- und Personendaten nur mit Berechtigung erfassen. Keine Zugangsdaten in Notizen speichern.",
      prototype: "Prototyp · nur Kaffee · keine Live-EU-Einreichung",
    },
    accessibility: {
      chooseLanguage: "Sprache auswählen", currentLanguage: "Aktuelle Sprache: Deutsch",
      dismissLanguageChooser: "Sprachauswahl schließen", supplierCard: "Lieferant",
      shipmentCard: "Sendung",
    },
  },
  en: {
    languageName: "English",
    languageCode: "EN",
    languageChooserTitle: "Choose language",
    languageChooserHint: "The selected language is saved on this device.",
    languageSaveErrorTitle: "Language not saved",
    languageSaveErrorMessage: "The language choice could not be saved on this device.",
    close: "Close",
    brandSubtitle: "Coffee Evidence",
    offlineReady: "Offline ready",
    entities: {
      washedArabica: "Washed Arabica",
      naturalArabica: "Natural Arabica",
      plot: "Plot",
      batch: "Batch",
    },
    tabs: { home: "Home", suppliers: "Partners", capture: "Capture coffee plot", shipments: "Shipments", help: "Help" },
    dashboard: {
      activeShipment: "ACTIVE COFFEE SHIPMENT", complete: "complete", plots: "plots",
      suppliersReady: "Suppliers ready", localDrafts: "Local drafts", today: "TODAY",
      nextSteps: "Next steps", open: "3 open", recapturePolygon: "Recapture polygon on site",
      legalityEvidence: "Legality evidence", reviewCooperative: "Review Kaffa Cooperative",
      clarifyDifference: "Clarify 120 kg difference", capturePlot: "Capture new coffee plot",
    },
    suppliers: {
      eyebrow: "SUPPLIER INTAKE", title: "Coffee suppliers",
      description: "Cooperatives, exporters, and producers in the current pilot.",
      producers: "Producers", plots: "Coffee plots",
      statuses: { complete: "Complete", correction: "Correction", invited: "Invited" },
    },
    capture: {
      eyebrow: "OFFLINE MAPPING", title: "Capture coffee plot",
      description: "Capture GPS on site and save it as a local draft.",
      producer: "Producer", producerPlaceholder: "e.g. Abebe Bekele",
      farmName: "Plot or farm name", farmPlaceholder: "e.g. Keta Plot 04",
      area: "Area in hectares", areaPlaceholder: "2.50", gpsCaptured: "GPS position captured",
      gpsMissing: "GPS position missing", gpsInstruction: "Capture the position directly at the coffee plot",
      locating: "Locating ...", captureGps: "Capture GPS", saveDraft: "Save offline draft",
      localData: "LOCAL DATA", savedDrafts: "Saved drafts",
      noDrafts: "No plot drafts on this device yet.", localOnly: "local only",
      alerts: {
        permissionTitle: "Location not permitted", permissionMessage: "GPS permission is required to capture the coffee plot on site.",
        unavailableTitle: "GPS unavailable", unavailableMessage: "The current location could not be read. Please try again outdoors.",
        incompleteTitle: "Incomplete information", incompleteMessage: "Producer, plot name, area, and GPS position are required.",
        invalidAreaTitle: "Invalid area", invalidAreaMessage: "Please enter a positive area in hectares.",
        savedTitle: "Saved offline", savedMessage: "The plot draft stays on this device until secure backend synchronisation is configured.",
        readErrorTitle: "Local data unavailable", readErrorMessage: "Saved plot drafts could not be read.",
        saveErrorTitle: "Save failed", saveErrorMessage: "The plot draft could not be stored securely on this device.",
      },
    },
    shipments: {
      eyebrow: "CHAIN OF CUSTODY", title: "Coffee shipments",
      description: "Quantity balance and readiness for compliance review.",
      origin: "Origin", quantity: "Quantity", readiness: "DDS readiness", ethiopia: "Ethiopia",
      statuses: { reviewing: "Under review", ready: "Ready" },
    },
    help: {
      eyebrow: "FIELD GUIDE", title: "Coffee field work", guideTitle: "Quick guide",
      intro: "The mobile app is designed for suppliers, cooperatives, and field teams.",
      steps: ["Review supplier and producer data.", "Capture GPS at the plot and document the area.", "Save the draft offline.", "Review the data and consent before synchronisation."],
      privacyTitle: "Privacy",
      privacy: "Capture location and personal data only with permission. Never store credentials in notes.",
      prototype: "Prototype · coffee only · no live EU submission",
    },
    accessibility: {
      chooseLanguage: "Choose language", currentLanguage: "Current language: English",
      dismissLanguageChooser: "Close language chooser", supplierCard: "Supplier",
      shipmentCard: "Shipment",
    },
  },
  am: {
    languageName: "አማርኛ",
    languageCode: "አማ",
    languageChooserTitle: "ቋንቋ ይምረጡ",
    languageChooserHint: "የተመረጠው ቋንቋ በዚህ መሣሪያ ላይ ይቀመጣል።",
    languageSaveErrorTitle: "ቋንቋው አልተቀመጠም",
    languageSaveErrorMessage: "የቋንቋ ምርጫውን በዚህ መሣሪያ ላይ ማስቀመጥ አልተቻለም።",
    close: "ዝጋ",
    brandSubtitle: "የቡና ማስረጃ",
    offlineReady: "ከመስመር ውጭ ዝግጁ",
    entities: {
      washedArabica: "የታጠበ አረቢካ",
      naturalArabica: "በተፈጥሮ የተዘጋጀ አረቢካ",
      plot: "መሬት",
      batch: "ስብስብ",
    },
    tabs: { home: "መነሻ", suppliers: "አጋሮች", capture: "የቡና መሬት ይመዝግቡ", shipments: "ጭነቶች", help: "እገዛ" },
    dashboard: {
      activeShipment: "ንቁ የቡና ጭነት", complete: "ተጠናቋል", plots: "መሬቶች",
      suppliersReady: "ዝግጁ አቅራቢዎች", localDrafts: "የአካባቢ ረቂቆች", today: "ዛሬ",
      nextSteps: "ቀጣይ እርምጃዎች", open: "3 ክፍት", recapturePolygon: "ፖሊጎኑን በቦታው እንደገና ይመዝግቡ",
      legalityEvidence: "የሕጋዊነት ማስረጃ", reviewCooperative: "Kaffa Cooperativeን ይፈትሹ",
      clarifyDifference: "የ120 kg ልዩነትን ያጣሩ", capturePlot: "አዲስ የቡና መሬት ይመዝግቡ",
    },
    suppliers: {
      eyebrow: "የአቅራቢ ምዝገባ", title: "የቡና አቅራቢዎች",
      description: "በአሁኑ የሙከራ ፕሮግራም ውስጥ ያሉ ማህበራት፣ ላኪዎች እና አምራቾች።",
      producers: "አምራቾች", plots: "የቡና መሬቶች",
      statuses: { complete: "ተጠናቋል", correction: "ማስተካከያ", invited: "ተጋብዟል" },
    },
    capture: {
      eyebrow: "ከመስመር ውጭ ካርታ", title: "የቡና መሬት ይመዝግቡ",
      description: "GPSን በቦታው ይመዝግቡ እና እንደ አካባቢ ረቂቅ ያስቀምጡ።",
      producer: "አምራች", producerPlaceholder: "ለምሳሌ Abebe Bekele",
      farmName: "የመሬት ወይም የእርሻ ስም", farmPlaceholder: "ለምሳሌ Keta Plot 04",
      area: "ስፋት በሄክታር", areaPlaceholder: "2.50", gpsCaptured: "የGPS ቦታ ተመዝግቧል",
      gpsMissing: "የGPS ቦታ አልተመዘገበም", gpsInstruction: "ቦታውን በቡና መሬቱ ላይ ይመዝግቡ",
      locating: "ቦታ በመፈለግ ላይ ...", captureGps: "GPS ይመዝግቡ", saveDraft: "ረቂቁን ከመስመር ውጭ ያስቀምጡ",
      localData: "የአካባቢ ውሂብ", savedDrafts: "የተቀመጡ ረቂቆች",
      noDrafts: "በዚህ መሣሪያ ላይ ገና የመሬት ረቂቅ የለም።", localOnly: "በመሣሪያው ላይ ብቻ",
      alerts: {
        permissionTitle: "የቦታ ፈቃድ አልተሰጠም", permissionMessage: "የቡና መሬቱን በቦታው ለመመዝገብ የGPS ፈቃድ ያስፈልጋል።",
        unavailableTitle: "GPS አይገኝም", unavailableMessage: "የአሁኑን ቦታ ማንበብ አልተቻለም። ከቤት ውጭ እንደገና ይሞክሩ።",
        incompleteTitle: "መረጃው አልተሟላም", incompleteMessage: "አምራች፣ የመሬት ስም፣ ስፋት እና የGPS ቦታ ያስፈልጋሉ።",
        invalidAreaTitle: "ስፋቱ ትክክል አይደለም", invalidAreaMessage: "እባክዎ ከዜሮ በላይ የሆነ ስፋት በሄክታር ያስገቡ።",
        savedTitle: "ከመስመር ውጭ ተቀምጧል", savedMessage: "አስተማማኝ የጀርባ ስርዓት ማመሳሰል እስኪዋቀር ድረስ ረቂቁ በዚህ መሣሪያ ላይ ይቆያል።",
        readErrorTitle: "የአካባቢ ውሂብ አይገኝም", readErrorMessage: "የተቀመጡ የመሬት ረቂቆችን ማንበብ አልተቻለም።",
        saveErrorTitle: "ማስቀመጥ አልተሳካም", saveErrorMessage: "የመሬት ረቂቁን በዚህ መሣሪያ ላይ በአስተማማኝ ሁኔታ ማስቀመጥ አልተቻለም።",
      },
    },
    shipments: {
      eyebrow: "የአቅርቦት ሰንሰለት", title: "የቡና ጭነቶች",
      description: "የመጠን ሚዛን እና ለተገዢነት ግምገማ ዝግጁነት።",
      origin: "መነሻ", quantity: "መጠን", readiness: "የDDS ዝግጁነት", ethiopia: "ኢትዮጵያ",
      statuses: { reviewing: "በግምገማ ላይ", ready: "ዝግጁ" },
    },
    help: {
      eyebrow: "የመስክ መመሪያ", title: "የቡና የመስክ ሥራ", guideTitle: "አጭር መመሪያ",
      intro: "የሞባይል መተግበሪያው ለአቅራቢዎች፣ ለማህበራት እና ለመስክ ቡድኖች የተዘጋጀ ነው።",
      steps: ["የአቅራቢና የአምራች መረጃን ያረጋግጡ።", "በመሬቱ ላይ GPS ይመዝግቡ እና ስፋቱን ያስገቡ።", "ረቂቁን ያለ ኢንተርኔት ያስቀምጡ።", "ከማስተላለፍ በፊት መረጃውንና ፈቃዱን ያረጋግጡ።"],
      privacyTitle: "ግላዊነት",
      privacy: "የአካባቢና የግል መረጃን በፈቃድ ብቻ ይመዝግቡ። የመግቢያ ቁልፎችን በማስታወሻ ውስጥ አያስቀምጡ።",
      prototype: "ሙከራ · ቡና ብቻ · ቀጥታ የEU ማስገባት የለም",
    },
    accessibility: {
      chooseLanguage: "ቋንቋ ይምረጡ", currentLanguage: "የአሁኑ ቋንቋ፦ አማርኛ",
      dismissLanguageChooser: "የቋንቋ መምረጫውን ዝጋ", supplierCard: "አቅራቢ",
      shipmentCard: "ጭነት",
    },
  },
  ti: {
    languageName: "ትግርኛ",
    languageCode: "ትግ",
    languageChooserTitle: "ቋንቋ ምረጹ",
    languageChooserHint: "እቲ ዝተመርጸ ቋንቋ ኣብዚ መሳርሒ ይዕቀብ።",
    languageSaveErrorTitle: "ቋንቋ ኣይተዓቀበን",
    languageSaveErrorMessage: "ምርጫ ቋንቋ ኣብዚ መሳርሒ ክዕቀብ ኣይከኣለን።",
    close: "ዕጸው",
    brandSubtitle: "መርትዖ ቡን",
    offlineReady: "ካብ መስመር ወጻኢ ድሉው",
    entities: {
      washedArabica: "ዝተሓጽበ ኣረቢካ",
      naturalArabica: "ብተፈጥሮ ዝተዳለወ ኣረቢካ",
      plot: "ግራት",
      batch: "ጉጅለ",
    },
    tabs: { home: "መበገሲ", suppliers: "መሻርኽቲ", capture: "ግራት ቡን መዝግብ", shipments: "ጽዕነት", help: "ሓገዝ" },
    dashboard: {
      activeShipment: "ንጡፍ ጽዕነት ቡን", complete: "ተዛዚሙ", plots: "ግራውቲ",
      suppliersReady: "ድሉዋት ኣቕረብቲ", localDrafts: "ናይ መሳርሒ ንድፍታት", today: "ሎሚ",
      nextSteps: "ዝቕጽሉ ስጉምትታት", open: "3 ክፉት", recapturePolygon: "ነቲ ፖሊጎን ኣብ ቦታኡ ደጊምኩም መዝግቡ",
      legalityEvidence: "መርትዖ ሕጋውነት", reviewCooperative: "Kaffa Cooperative መርምሩ",
      clarifyDifference: "ፍልልይ 120 kg ኣነጽሩ", capturePlot: "ሓድሽ ግራት ቡን መዝግቡ",
    },
    suppliers: {
      eyebrow: "ምዝገባ ኣቕራቢ", title: "ኣቕረብቲ ቡን",
      description: "ኣብዚ ናይ ፈተነ መደብ ዘለዉ ማሕበራት፣ ሰደድቲን ኣፍረይትን።",
      producers: "ኣፍረይቲ", plots: "ግራውቲ ቡን",
      statuses: { complete: "ተዛዚሙ", correction: "መአረምታ", invited: "ተዓዲሙ" },
    },
    capture: {
      eyebrow: "ካብ መስመር ወጻኢ ካርታ", title: "ግራት ቡን መዝግቡ",
      description: "GPS ኣብ ቦታኡ መዝጊብኩም ከም ናይ መሳርሒ ንድፊ ዓቅቡ።",
      producer: "ኣፍራዪ", producerPlaceholder: "ንኣብነት Abebe Bekele",
      farmName: "ስም ግራት ወይ ሕርሻ", farmPlaceholder: "ንኣብነት Keta Plot 04",
      area: "ስፍሓት ብሄክታር", areaPlaceholder: "2.50", gpsCaptured: "ቦታ GPS ተመዝጊቡ",
      gpsMissing: "ቦታ GPS ኣይተመዝገበን", gpsInstruction: "ቦታኹም ኣብቲ ግራት ቡን መዝግቡ",
      locating: "ቦታ ይድለ ኣሎ ...", captureGps: "GPS መዝግብ", saveDraft: "ንድፊ ካብ መስመር ወጻኢ ዓቅብ",
      localData: "ናይ መሳርሒ ዳታ", savedDrafts: "ዝተዓቀቡ ንድፍታት",
      noDrafts: "ኣብዚ መሳርሒ ገና ንድፊ ግራት የለን።", localOnly: "ኣብ መሳርሒ ጥራይ",
      alerts: {
        permissionTitle: "ፍቓድ ቦታ ኣይተዋህበን", permissionMessage: "ነቲ ግራት ቡን ኣብ ቦታኡ ንምምዝጋብ ፍቓድ GPS የድሊ።",
        unavailableTitle: "GPS ኣይርከብን", unavailableMessage: "እዋናዊ ቦታ ክንበብ ኣይከኣለን። ኣብ ደገ ደጊምኩም ፈትኑ።",
        incompleteTitle: "ሓበሬታ ኣይተማልአን", incompleteMessage: "ኣፍራዪ፣ ስም ግራት፣ ስፍሓትን ቦታ GPSን የድልዩ።",
        invalidAreaTitle: "ስፍሓት ቅኑዕ ኣይኮነን", invalidAreaMessage: "በጃኹም ካብ ዜሮ ዝዓቢ ስፍሓት ብሄክታር ኣእትዉ።",
        savedTitle: "ካብ መስመር ወጻኢ ተዓቂቡ", savedMessage: "ውሑስ ምትእስሳር ስርዓተ-ድሕሪት ክሳብ ዝዳሎ እቲ ንድፊ ኣብዚ መሳርሒ ይጸንሕ።",
        readErrorTitle: "ናይ መሳርሒ ዳታ ኣይርከብን", readErrorMessage: "ዝተዓቀቡ ንድፍታት ግራት ክንበቡ ኣይከኣሉን።",
        saveErrorTitle: "ምዕቃብ ኣይተዓወተን", saveErrorMessage: "እቲ ንድፊ ግራት ኣብዚ መሳርሒ ብውሕስነት ክዕቀብ ኣይከኣለን።",
      },
    },
    shipments: {
      eyebrow: "ሰንሰለት ቀረብ", title: "ጽዕነት ቡን",
      description: "ሚዛን መጠንን ንግምገማ ምኽባር ሕጊ ድሉውነትን።",
      origin: "መበቆል", quantity: "መጠን", readiness: "ድሉውነት DDS", ethiopia: "ኢትዮጵያ",
      statuses: { reviewing: "ኣብ ግምገማ", ready: "ድሉው" },
    },
    help: {
      eyebrow: "መምርሒ መስክ", title: "ናይ ቡን ስራሕ መስክ", guideTitle: "ሓጺር መምርሒ",
      intro: "እዚ ሞባይል መተግበሪ ንኣቕረብቲ፣ ማሕበራትን ጉጅለታት መስክን ዝተዳለወ እዩ።",
      steps: ["ሓበሬታ ኣቕራቢን ኣፍራዪን መርምሩ።", "GPS ኣብቲ ግራት መዝጊብኩም ስፍሓቱ ሰንዱ።", "እቲ ንድፊ ካብ መስመር ወጻኢ ዓቅቡ።", "ቅድሚ ምትእስሳር ሓበሬታን ፍቓድን መርምሩ።"],
      privacyTitle: "ብሕታውነት",
      privacy: "ሓበሬታ ቦታን ውልቀ-ሰብን ብፍቓድ ጥራይ መዝግቡ። መረጋገጺ መእተዊ ኣብ መዘኻኸሪ ኣይተዓቅቡ።",
      prototype: "ፈተነ · ቡን ጥራይ · ቀጥታ ናብ EU ምቕራብ የለን",
    },
    accessibility: {
      chooseLanguage: "ቋንቋ ምረጹ", currentLanguage: "እዋናዊ ቋንቋ፦ ትግርኛ",
      dismissLanguageChooser: "መምረጺ ቋንቋ ዕጸው", supplierCard: "ኣቕራቢ",
      shipmentCard: "ጽዕነት",
    },
  },
} satisfies Record<Language, Translation>;

export function isLanguage(value: string | null): value is Language {
  return value !== null && (languages as readonly string[]).includes(value);
}
