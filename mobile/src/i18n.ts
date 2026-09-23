export const languages = ["de", "en", "am", "ti"] as const;
export type Language = (typeof languages)[number];

export type Translation = {
  languageName: string;
  languageCode: string;
  chooseLanguage: string;
  languageHint: string;
  close: string;
  brandSubtitle: string;
  tabs: { home: string; suppliers: string; plots: string; operations: string; help: string };
  common: {
    save: string;
    create: string;
    refresh: string;
    retry: string;
    download: string;
    share: string;
    status: string;
    name: string;
    country: string;
    region: string;
    subjectId: string;
    pending: string;
    synced: string;
    failed: string;
    conflict: string;
  };
  sync: {
    online: string;
    offline: string;
    syncing: string;
    queued: string;
    lastSync: string;
    never: string;
    syncNow: string;
    configured: string;
    notConfigured: string;
    notConfiguredDetail: string;
    success: string;
    error: string;
    conflicts: string;
    keepLocal: string;
    useServer: string;
  };
  home: { title: string; intro: string; suppliers: string; plots: string; documents: string };
  suppliers: {
    title: string;
    description: string;
    add: string;
    empty: string;
    producerCount: string;
    plotCount: string;
  };
  plots: {
    title: string;
    description: string;
    producer: string;
    farm: string;
    area: string;
    supplierId: string;
    capturePoint: string;
    pointCount: string;
    polygonJson: string;
    importGeoJson: string;
    applyGeoJson: string;
    saveDraft: string;
    empty: string;
    invalidPolygon: string;
    gpsError: string;
    permissionError: string;
  };
  geofencing: {
    title: string;
    configure: string;
    open: string;
    centerHint: string;
    radius: string;
    locationRequired: string;
    locationRequiredDetail: string;
    useLocation: string;
    locating: string;
    locationNotFound: string;
    backgroundPermissionError: string;
    plotNotFound: string;
    saved: string;
  };
  operations: {
    title: string;
    documents: string;
    pickUpload: string;
    satellite: string;
    requestSatellite: string;
    evidence: string;
    requestEvidence: string;
    dds: string;
    createDds: string;
    validateDds: string;
    submitDds: string;
    checkStatus: string;
    noItems: string;
    providerBlocked: string;
    exportPassphrase: string;
    passphraseHint: string;
    encryptionRequired: string;
    encryptedExport: string;
  };
  help: { title: string; body: string };
  alerts: { required: string; saved: string; storageError: string };
  auth: {
    signIn: string;
    signOut: string;
    accountProvided: string;
    email: string;
    password: string;
    forgotPassword: string;
    resetSent: string;
    resetPassword: string;
    resetPasswordHelp: string;
    newPassword: string;
    confirmPassword: string;
    backToSignIn: string;
    organization: string;
    organizationRequired: string;
    organizationName: string;
    organizationSlug: string;
    createOrganization: string;
    notConfigured: string;
    notConfiguredDetail: string;
  };
};

export const translations = {
  de: {
    languageName: "Deutsch", languageCode: "DE", chooseLanguage: "Sprache auswählen",
    languageHint: "Die Auswahl wird auf diesem Gerät gespeichert.", close: "Schließen",
    brandSubtitle: "Kaffee-Nachweise",
    tabs: { home: "Start", suppliers: "Partner", plots: "Plots", operations: "Vorgänge", help: "Hilfe" },
    common: {
      save: "Speichern", create: "Erstellen", refresh: "Aktualisieren", retry: "Erneut versuchen",
      download: "Herunterladen", share: "Teilen", status: "Status", name: "Name", country: "Land", region: "Region",
      subjectId: "Referenz-ID", pending: "Ausstehend", synced: "Synchronisiert", failed: "Fehlgeschlagen",
      conflict: "Konflikt",
    },
    sync: {
      online: "Online", offline: "Offline", syncing: "Synchronisierung ...", queued: "in Warteschlange",
      lastSync: "Letzte Synchronisierung", never: "Noch nie", syncNow: "Jetzt synchronisieren",
      configured: "Backend konfiguriert", notConfigured: "Backend nicht konfiguriert",
      notConfiguredDetail: "EXPO_PUBLIC_API_URL fehlt. Synchronisierung und Provider-Vorgänge sind blockiert.",
      success: "Synchronisierung abgeschlossen", error: "Synchronisierung fehlgeschlagen",
      conflicts: "Synchronisierungskonflikte", keepLocal: "Lokale Version behalten", useServer: "Serverversion verwenden",
    },
    home: {
      title: "Feldübersicht", intro: "Offline erfassen, sicher synchronisieren und Compliance-Vorgänge verfolgen.",
      suppliers: "Lieferanten", plots: "Kaffee-Plots", documents: "Dokumente",
    },
    suppliers: {
      title: "Lieferanten", description: "Lieferanten werden offline angelegt und über die Outbox synchronisiert.",
      add: "Lieferant hinzufügen", empty: "Noch keine Lieferanten.", producerCount: "Produzenten", plotCount: "Plots",
    },
    plots: {
      title: "GeoJSON-Plots", description: "Mindestens drei GPS-Punkte erfassen oder ein GeoJSON-Polygon importieren und bearbeiten.",
      producer: "Produzent", farm: "Plot- oder Farmname", area: "Fläche (ha)", supplierId: "Lieferanten-ID (optional)",
      capturePoint: "GPS-Punkt hinzufügen", pointCount: "Punkte", polygonJson: "GeoJSON Polygon",
      importGeoJson: "GeoJSON importieren", applyGeoJson: "GeoJSON übernehmen", saveDraft: "Offline-Plot speichern",
      empty: "Noch keine Plot-Entwürfe.", invalidPolygon: "Das Polygon ist ungültig. Mindestens drei unterschiedliche Positionen sind erforderlich.",
      gpsError: "Der Standort konnte nicht ermittelt werden.", permissionError: "Standortberechtigung wurde nicht erteilt.",
    },
    geofencing: {
      title: "Geofencing", configure: "Geofencing einrichten", open: "Geofencing öffnen",
      centerHint: "Grüner Marker: Mittelpunkt. Oranger Marker: Radius. Beide Marker können verschoben werden.",
      radius: "Radius (Meter)", locationRequired: "Land und Region erforderlich",
      locationRequiredDetail: "GPS- und vollständige Lieferantendaten fehlen. Geben Sie Land und Region für den Mittelpunkt ein.",
      useLocation: "Region verwenden", locating: "Region wird ermittelt ...",
      locationNotFound: "Für Land und Region konnte kein Standort ermittelt werden.",
      backgroundPermissionError: "Der Geofence wurde gespeichert, aber die Hintergrundüberwachung konnte nicht aktiviert werden. Erlauben Sie den Standortzugriff immer.",
      plotNotFound: "Der Plot wurde nicht gefunden.", saved: "Geofence gespeichert und Überwachung aktualisiert.",
    },
    operations: {
      title: "Compliance-Vorgänge", documents: "Dokumente", pickUpload: "Dokument auswählen und hochladen",
      satellite: "Satellitenanalyse", requestSatellite: "Analyse anfordern", evidence: "Evidence Pack",
      requestEvidence: "Evidence Pack anfordern", dds: "DDS-Entwurf", createDds: "DDS-Entwurf erstellen",
      validateDds: "Validieren", submitDds: "Einreichen", checkStatus: "Status abrufen",
      noItems: "Noch keine Vorgänge.", providerBlocked: "Provider-Konfiguration fehlt. Dieser Vorgang ist blockiert.",
      exportPassphrase: "Passphrase für verschlüsselten Export",
      passphraseHint: "Mindestens 12 Zeichen. Teilen Sie die Passphrase getrennt vom Exportpaket.",
      encryptionRequired: "Exportverschlüsselung erforderlich",
      encryptedExport: "Verschlüsseltes SCTracker-Paket",
    },
    help: {
      title: "Offline und Datenschutz",
      body: "GPS- und Personendaten nur mit Einwilligung erfassen. Lokale Fachdaten werden verschlüsselt gespeichert, Exporte Ende-zu-Ende verschlüsselt und Änderungen signiert verkettet. Konflikte werden nie automatisch überschrieben.",
    },
    alerts: { required: "Bitte alle erforderlichen Felder ausfüllen.", saved: "Offline gespeichert.", storageError: "Lokale Daten konnten nicht sicher gespeichert werden." },
    auth: {
      signIn: "Anmelden", signOut: "Abmelden",
      accountProvided: "Konten werden von Ihrer Organisation bereitgestellt.",
      email: "E-Mail", password: "Passwort", organization: "Aktive Organisation",
      forgotPassword: "Passwort vergessen?", resetSent: "Reset-Link wurde an Ihre E-Mail-Adresse gesendet.",
      resetPassword: "Passwort zurücksetzen", resetPasswordHelp: "Legen Sie ein neues Passwort mit mindestens 8 Zeichen fest.",
      newPassword: "Neues Passwort", confirmPassword: "Passwort bestätigen", backToSignIn: "Zurück zur Anmeldung",
      organizationRequired: "Wählen oder erstellen Sie eine Organisation, bevor Sie synchronisieren.",
      organizationName: "Organisationsname", organizationSlug: "Organisationskürzel",
      createOrganization: "Organisation erstellen", notConfigured: "Neon Auth nicht konfiguriert",
      notConfiguredDetail: "EXPO_PUBLIC_NEON_AUTH_URL fehlt. Offline-Erfassung bleibt verfügbar; Synchronisierung ist blockiert.",
    },
  },
  en: {
    languageName: "English", languageCode: "EN", chooseLanguage: "Choose language",
    languageHint: "The selection is saved on this device.", close: "Close",
    brandSubtitle: "Coffee Evidence",
    tabs: { home: "Home", suppliers: "Partners", plots: "Plots", operations: "Operations", help: "Help" },
    common: {
      save: "Save", create: "Create", refresh: "Refresh", retry: "Retry", download: "Download",
      share: "Share", status: "Status", name: "Name", country: "Country", region: "Region", subjectId: "Reference ID",
      pending: "Pending", synced: "Synced", failed: "Failed", conflict: "Conflict",
    },
    sync: {
      online: "Online", offline: "Offline", syncing: "Synchronising ...", queued: "queued",
      lastSync: "Last sync", never: "Never", syncNow: "Sync now", configured: "Backend configured",
      notConfigured: "Backend not configured",
      notConfiguredDetail: "EXPO_PUBLIC_API_URL is missing. Synchronisation and provider operations are blocked.",
      success: "Synchronisation completed", error: "Synchronisation failed", conflicts: "Sync conflicts",
      keepLocal: "Keep local version", useServer: "Use server version",
    },
    home: {
      title: "Field overview", intro: "Capture offline, synchronise safely, and track compliance operations.",
      suppliers: "Suppliers", plots: "Coffee plots", documents: "Documents",
    },
    suppliers: {
      title: "Suppliers", description: "Suppliers are created offline and synchronised through the outbox.",
      add: "Add supplier", empty: "No suppliers yet.", producerCount: "Producers", plotCount: "Plots",
    },
    plots: {
      title: "GeoJSON plots", description: "Capture at least three GPS points or import and edit a GeoJSON Polygon.",
      producer: "Producer", farm: "Plot or farm name", area: "Area (ha)", supplierId: "Supplier ID (optional)",
      capturePoint: "Add GPS point", pointCount: "Points", polygonJson: "GeoJSON Polygon",
      importGeoJson: "Import GeoJSON", applyGeoJson: "Apply GeoJSON", saveDraft: "Save offline plot",
      empty: "No plot drafts yet.", invalidPolygon: "The polygon is invalid. At least three distinct positions are required.",
      gpsError: "The current location could not be determined.", permissionError: "Location permission was not granted.",
    },
    geofencing: {
      title: "Geofencing", configure: "Configure geofencing", open: "Open geofencing",
      centerHint: "Green marker: center. Orange marker: radius. Drag either marker to adjust the circle.",
      radius: "Radius (meters)", locationRequired: "Country and region required",
      locationRequiredDetail: "GPS and complete supplier location data are unavailable. Enter a country and region for the center.",
      useLocation: "Use region", locating: "Locating region ...",
      locationNotFound: "No location could be found for the supplied country and region.",
      backgroundPermissionError: "The geofence was saved, but background monitoring could not be enabled. Allow location access at all times.",
      plotNotFound: "The plot could not be found.", saved: "Geofence saved and monitoring updated.",
    },
    operations: {
      title: "Compliance operations", documents: "Documents", pickUpload: "Pick and upload document",
      satellite: "Satellite analysis", requestSatellite: "Request analysis", evidence: "Evidence pack",
      requestEvidence: "Request evidence pack", dds: "DDS draft", createDds: "Create DDS draft",
      validateDds: "Validate", submitDds: "Submit", checkStatus: "Check status", noItems: "No operations yet.",
      providerBlocked: "Provider configuration is missing. This operation is blocked.",
      exportPassphrase: "Encrypted export passphrase",
      passphraseHint: "At least 12 characters. Share the passphrase separately from the export package.",
      encryptionRequired: "Export encryption required",
      encryptedExport: "Encrypted SCTracker package",
    },
    help: {
      title: "Offline and privacy",
      body: "Capture GPS and personal data only with consent. Local business data is encrypted, exports are end-to-end encrypted, and changes form a signed chain. Conflicts are never overwritten automatically.",
    },
    alerts: { required: "Complete all required fields.", saved: "Saved offline.", storageError: "Local data could not be stored safely." },
    auth: {
      signIn: "Sign in", signOut: "Sign out",
      accountProvided: "Accounts are provided by your organization.",
      email: "Email", password: "Password", organization: "Active organization",
      forgotPassword: "Forgot password?", resetSent: "A reset link was sent to your email address.",
      resetPassword: "Reset password", resetPasswordHelp: "Choose a new password with at least 8 characters.",
      newPassword: "New password", confirmPassword: "Confirm password", backToSignIn: "Back to sign in",
      organizationRequired: "Select or create an organization before synchronizing.",
      organizationName: "Organization name", organizationSlug: "Organization slug",
      createOrganization: "Create organization", notConfigured: "Neon Auth not configured",
      notConfiguredDetail: "EXPO_PUBLIC_NEON_AUTH_URL is missing. Offline capture remains available; synchronization is blocked.",
    },
  },
  am: {
    languageName: "አማርኛ", languageCode: "አማ", chooseLanguage: "ቋንቋ ይምረጡ",
    languageHint: "ምርጫው በዚህ መሣሪያ ላይ ይቀመጣል።", close: "ዝጋ", brandSubtitle: "የቡና ማስረጃ",
    tabs: { home: "መነሻ", suppliers: "አጋሮች", plots: "መሬቶች", operations: "ሂደቶች", help: "እገዛ" },
    common: {
      save: "አስቀምጥ", create: "ፍጠር", refresh: "አድስ", retry: "እንደገና ሞክር", download: "አውርድ",
      share: "አጋራ", status: "ሁኔታ", name: "ስም", country: "አገር", region: "ክልል", subjectId: "የማጣቀሻ መለያ",
      pending: "በመጠባበቅ ላይ", synced: "ተመሳስሏል", failed: "አልተሳካም", conflict: "ግጭት",
    },
    sync: {
      online: "መስመር ላይ", offline: "ከመስመር ውጭ", syncing: "በማመሳሰል ላይ ...", queued: "ተሰልፏል",
      lastSync: "የመጨረሻ ማመሳሰል", never: "አልተደረገም", syncNow: "አሁን አመሳስል",
      configured: "የጀርባ ስርዓት ተዋቅሯል", notConfigured: "የጀርባ ስርዓት አልተዋቀረም",
      notConfiguredDetail: "EXPO_PUBLIC_API_URL የለም። ማመሳሰልና የአቅራቢ ሂደቶች ታግደዋል።",
      success: "ማመሳሰል ተጠናቋል", error: "ማመሳሰል አልተሳካም", conflicts: "የማመሳሰል ግጭቶች",
      keepLocal: "የአካባቢውን ስሪት አቆይ", useServer: "የሰርቨር ስሪት ተጠቀም",
    },
    home: {
      title: "የመስክ አጠቃላይ እይታ", intro: "ከመስመር ውጭ መዝግብ፣ በደህንነት አመሳስል እና የተገዢነት ሂደቶችን ተከታተል።",
      suppliers: "አቅራቢዎች", plots: "የቡና መሬቶች", documents: "ሰነዶች",
    },
    suppliers: {
      title: "አቅራቢዎች", description: "አቅራቢዎች ከመስመር ውጭ ይፈጠራሉ እና በመላኪያ ወረፋ ይመሳሰላሉ።",
      add: "አቅራቢ ጨምር", empty: "ገና አቅራቢ የለም።", producerCount: "አምራቾች", plotCount: "መሬቶች",
    },
    plots: {
      title: "GeoJSON መሬቶች", description: "ቢያንስ ሶስት GPS ነጥቦችን መዝግብ ወይም GeoJSON Polygon አስገባና አርትዕ።",
      producer: "አምራች", farm: "የመሬት ወይም የእርሻ ስም", area: "ስፋት (ሄክታር)",
      supplierId: "የአቅራቢ መለያ (አማራጭ)", capturePoint: "GPS ነጥብ ጨምር", pointCount: "ነጥቦች",
      polygonJson: "GeoJSON Polygon", importGeoJson: "GeoJSON አስገባ", applyGeoJson: "GeoJSON ተግብር",
      saveDraft: "መሬቱን ከመስመር ውጭ አስቀምጥ", empty: "ገና የመሬት ረቂቅ የለም።",
      invalidPolygon: "ፖሊጎኑ ትክክል አይደለም። ቢያንስ ሶስት የተለያዩ ቦታዎች ያስፈልጋሉ።",
      gpsError: "የአሁኑን ቦታ ማወቅ አልተቻለም።", permissionError: "የቦታ ፈቃድ አልተሰጠም።",
    },
    geofencing: {
      title: "Geofencing", configure: "Geofencing አዋቅር", open: "Geofencing ክፈት",
      centerHint: "አረንጓዴው ምልክት መሃል፣ ብርቱካናማው ራዲየስ ነው። ሁለቱንም መጎተት ይቻላል።",
      radius: "ራዲየስ (ሜትር)", locationRequired: "አገርና ክልል ያስፈልጋሉ",
      locationRequiredDetail: "GPS እና ሙሉ የአቅራቢ አድራሻ የሉም። አገርና ክልል ያስገቡ።",
      useLocation: "ክልሉን ተጠቀም", locating: "ክልሉ እየተፈለገ ነው ...",
      locationNotFound: "ለተሰጠው አገርና ክልል ቦታ አልተገኘም።",
      backgroundPermissionError: "Geofence ተቀምጧል፣ ግን የጀርባ ክትትል አልነቃም። ሁልጊዜ የቦታ ፈቃድ ይስጡ።",
      plotNotFound: "መሬቱ አልተገኘም።", saved: "Geofence ተቀምጧል።",
    },
    operations: {
      title: "የተገዢነት ሂደቶች", documents: "ሰነዶች", pickUpload: "ሰነድ ምረጥና ስቀል",
      satellite: "የሳተላይት ትንተና", requestSatellite: "ትንተና ጠይቅ", evidence: "የማስረጃ ጥቅል",
      requestEvidence: "የማስረጃ ጥቅል ጠይቅ", dds: "የDDS ረቂቅ", createDds: "የDDS ረቂቅ ፍጠር",
      validateDds: "አረጋግጥ", submitDds: "አስገባ", checkStatus: "ሁኔታን አረጋግጥ",
      noItems: "ገና ሂደት የለም።", providerBlocked: "የአቅራቢ ውቅር የለም። ይህ ሂደት ታግዷል።",
      exportPassphrase: "የተመሰጠረ ወጪ የይለፍ ሐረግ",
      passphraseHint: "ቢያንስ 12 ቁምፊዎች። የይለፍ ሐረጉን ከፓኬጁ ተለይቶ ያጋሩ።",
      encryptionRequired: "የወጪ ምስጠራ ያስፈልጋል",
      encryptedExport: "የተመሰጠረ SCTracker ፓኬጅ",
    },
    help: {
      title: "ከመስመር ውጭ እና ግላዊነት",
      body: "GPS እና የግል መረጃን በፈቃድ ብቻ ይመዝግቡ። የአካባቢ ለውጦች ማመሳሰል እስኪረጋገጥ ይቆያሉ። ግጭቶች በራስ-ሰር አይተኩም።",
    },
    alerts: { required: "እባክዎ ሁሉንም አስፈላጊ መስኮች ይሙሉ።", saved: "ከመስመር ውጭ ተቀምጧል።", storageError: "የአካባቢ ውሂብ በደህንነት ሊቀመጥ አልቻለም።" },
    auth: {
      signIn: "ግባ", signOut: "ውጣ",
      accountProvided: "መለያዎች በድርጅትዎ ይሰጣሉ።",
      email: "ኢሜይል", password: "የይለፍ ቃል", organization: "ንቁ ድርጅት",
      forgotPassword: "የይለፍ ቃል ረሱ?", resetSent: "የዳግም ማስጀመሪያ ሊንክ ወደ ኢሜይልዎ ተልኳል።",
      resetPassword: "የይለፍ ቃል ዳግም ያስጀምሩ", resetPasswordHelp: "ቢያንስ 8 ቁምፊ ያለው አዲስ የይለፍ ቃል ይምረጡ።",
      newPassword: "አዲስ የይለፍ ቃል", confirmPassword: "የይለፍ ቃል ያረጋግጡ", backToSignIn: "ወደ መግቢያ ተመለስ",
      organizationRequired: "ከማመሳሰልዎ በፊት ድርጅት ይምረጡ ወይም ይፍጠሩ።",
      organizationName: "የድርጅት ስም", organizationSlug: "የድርጅት አጭር መለያ",
      createOrganization: "ድርጅት ፍጠር", notConfigured: "Neon Auth አልተዋቀረም",
      notConfiguredDetail: "EXPO_PUBLIC_NEON_AUTH_URL የለም። ከመስመር ውጭ መመዝገብ ይቀጥላል፤ ማመሳሰል ታግዷል።",
    },
  },
  ti: {
    languageName: "ትግርኛ", languageCode: "ትግ", chooseLanguage: "ቋንቋ ምረጹ",
    languageHint: "እቲ ምርጫ ኣብዚ መሳርሒ ይዕቀብ።", close: "ዕጸው", brandSubtitle: "መርትዖ ቡን",
    tabs: { home: "መበገሲ", suppliers: "መሻርኽቲ", plots: "ግራውቲ", operations: "መስርሓት", help: "ሓገዝ" },
    common: {
      save: "ዓቅብ", create: "ፍጠር", refresh: "ኣሐድስ", retry: "ደጊምካ ፈትን", download: "ኣውርድ",
      share: "ኣካፍል", status: "ኩነታት", name: "ስም", country: "ሃገር", region: "ክልል", subjectId: "መወከሲ መለለዪ",
      pending: "ይጽበ ኣሎ", synced: "ተመሳሲሉ", failed: "ኣይተዓወተን", conflict: "ግጭት",
    },
    sync: {
      online: "ኣብ መስመር", offline: "ካብ መስመር ወጻኢ", syncing: "ይመሳሰል ኣሎ ...", queued: "ተሰሪዑ",
      lastSync: "ናይ መወዳእታ ምትእስሳር", never: "ኣይተገብረን", syncNow: "ሕጂ ኣመሳስል",
      configured: "ስርዓተ-ድሕሪት ተዋቒሩ", notConfigured: "ስርዓተ-ድሕሪት ኣይተዋቐረን",
      notConfiguredDetail: "EXPO_PUBLIC_API_URL የለን። ምትእስሳርን ናይ ኣቕራቢ መስርሓትን ተዓጽዮም።",
      success: "ምትእስሳር ተዛዚሙ", error: "ምትእስሳር ኣይተዓወተን", conflicts: "ናይ ምትእስሳር ግጭታት",
      keepLocal: "ናይ መሳርሒ ስሪት ዓቅብ", useServer: "ናይ ሰርቨር ስሪት ተጠቐም",
    },
    home: {
      title: "ሓፈሻዊ እዋን መስክ", intro: "ካብ መስመር ወጻኢ መዝግቡ፣ ብውሕስነት ኣመሳስሉ፣ መስርሓት ምኽባር ሕጊ ተኸታተሉ።",
      suppliers: "ኣቕረብቲ", plots: "ግራውቲ ቡን", documents: "ሰነዳት",
    },
    suppliers: {
      title: "ኣቕረብቲ", description: "ኣቕረብቲ ካብ መስመር ወጻኢ ይፍጠሩን ብመስርዕ ልኡኽ ይመሳሰሉን።",
      add: "ኣቕራቢ ወስኽ", empty: "ገና ኣቕራቢ የለን።", producerCount: "ኣፍረይቲ", plotCount: "ግራውቲ",
    },
    plots: {
      title: "GeoJSON ግራውቲ", description: "እንተወሓደ ሰለስተ GPS ነጥቢ መዝግቡ ወይ GeoJSON Polygon ኣእትዉን ኣርሙን።",
      producer: "ኣፍራዪ", farm: "ስም ግራት ወይ ሕርሻ", area: "ስፍሓት (ሄክታር)",
      supplierId: "መለለዪ ኣቕራቢ (ኣማራጺ)", capturePoint: "ነጥቢ GPS ወስኽ", pointCount: "ነጥብታት",
      polygonJson: "GeoJSON Polygon", importGeoJson: "GeoJSON ኣእቱ", applyGeoJson: "GeoJSON ተግብር",
      saveDraft: "ግራት ካብ መስመር ወጻኢ ዓቅብ", empty: "ገና ንድፊ ግራት የለን።",
      invalidPolygon: "እቲ ፖሊጎን ቅኑዕ ኣይኮነን። እንተወሓደ ሰለስተ ዝተፈላለዩ ቦታታት የድልዩ።",
      gpsError: "እዋናዊ ቦታ ክፍለጥ ኣይከኣለን።", permissionError: "ፍቓድ ቦታ ኣይተዋህበን።",
    },
    geofencing: {
      title: "Geofencing", configure: "Geofencing ኣዋድድ", open: "Geofencing ክፈት",
      centerHint: "ቀጠልያ ምልክት ማእከል፣ ኣራንሾኒ ምልክት ራድየስ እዩ። ክልቲኦም ክስሓቡ ይኽእሉ።",
      radius: "ራድየስ (ሜትር)", locationRequired: "ሃገርን ዞባን የድሊ",
      locationRequiredDetail: "GPSን ምሉእ ሓበሬታ ኣቕራብን የለን። ሃገርን ዞባን የእትዉ።",
      useLocation: "ዞባ ተጠቐም", locating: "ዞባ ይድለ ኣሎ ...",
      locationNotFound: "ንዝተዋህበ ሃገርን ዞባን ቦታ ኣይተረኽበን።",
      backgroundPermissionError: "Geofence ተዓቂቡ፣ ግን ናይ ድሕረ ባይታ ክትትል ኣይተነቓቐሐን። ኩሉ ግዜ ፍቓድ ቦታ ሃቡ።",
      plotNotFound: "እቲ ግራት ኣይተረኽበን።", saved: "Geofence ተዓቂቡ።",
    },
    operations: {
      title: "መስርሓት ምኽባር ሕጊ", documents: "ሰነዳት", pickUpload: "ሰነድ ምረጽን ስቐልን",
      satellite: "ትንተና ሳተላይት", requestSatellite: "ትንተና ሕተት", evidence: "ጥርናፈ መርትዖ",
      requestEvidence: "ጥርናፈ መርትዖ ሕተት", dds: "ንድፊ DDS", createDds: "ንድፊ DDS ፍጠር",
      validateDds: "ኣረጋግጽ", submitDds: "ኣቕርብ", checkStatus: "ኩነታት ርአ",
      noItems: "ገና መስርሕ የለን።", providerBlocked: "ውቅር ኣቕራቢ የለን። እዚ መስርሕ ተዓጽዩ።",
      exportPassphrase: "ናይ ዝተመስጠረ ሰደድ መሕለፊ ሓረግ",
      passphraseHint: "እንተወሓደ 12 ፊደላት። መሕለፊ ሓረግ ካብቲ ፓኬጅ ፈሊኹም ኣካፍሉ።",
      encryptionRequired: "ምስጢራዊ ሰደድ የድሊ",
      encryptedExport: "ዝተመስጠረ SCTracker ፓኬጅ",
    },
    help: {
      title: "ካብ መስመር ወጻኢን ብሕታውነትን",
      body: "GPSን ውልቃዊ ሓበሬታን ብፍቓድ ጥራይ መዝግቡ። ናይ መሳርሒ ለውጥታት ምትእስሳር ክሳብ ዝረጋገጽ ይጸንሑ። ግጭታት ብራስ-ሰር ኣይትክኡን።",
    },
    alerts: { required: "በጃኹም ኩሎም ዘድልዩ ቦታታት ምልኡ።", saved: "ካብ መስመር ወጻኢ ተዓቂቡ።", storageError: "ናይ መሳርሒ ዳታ ብውሕስነት ክዕቀብ ኣይከኣለን።" },
    auth: {
      signIn: "እቶ", signOut: "ውጻእ",
      accountProvided: "መለያታት ብትካልኩም ይወሃቡ።",
      email: "ኢመይል", password: "መሕለፊ ቓል", organization: "ንጡፍ ትካል",
      forgotPassword: "መሕለፊ ቓል ረሲዕኩም?", resetSent: "መሕለፊ ቓል ንምቕያር መላግቦ ናብ ኢመይልኩም ተላኢኹ።",
      resetPassword: "መሕለፊ ቓል ቀይሩ", resetPasswordHelp: "እንተወሓደ 8 ፊደላት ዘለዎ ሓድሽ መሕለፊ ቓል ምረጹ።",
      newPassword: "ሓድሽ መሕለፊ ቓል", confirmPassword: "መሕለፊ ቓል ኣረጋግጹ", backToSignIn: "ናብ መእተዊ ተመለሱ",
      organizationRequired: "ቅድሚ ምትእስሳር ትካል ምረጹ ወይ ፍጠሩ።",
      organizationName: "ስም ትካል", organizationSlug: "ሓጺር መለለዪ ትካል",
      createOrganization: "ትካል ፍጠር", notConfigured: "Neon Auth ኣይተዋቐረን",
      notConfiguredDetail: "EXPO_PUBLIC_NEON_AUTH_URL የለን። ካብ መስመር ወጻኢ ምምዝጋብ ይቕጽል፤ ምትእስሳር ተዓጽዩ።",
    },
  },
} satisfies Record<Language, Translation>;

export function isLanguage(value: string | null): value is Language {
  return value !== null && (languages as readonly string[]).includes(value);
}
