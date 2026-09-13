# መምርሒ ተጠቃሚ SCTracker Native Apps

## ትግርኛ · መወከሲ ትግበራ

ስሪት 0.1 — መስከረም 2026

> ኣገዳሲ፦ ናይ iOSን Androidን መተግበሪታት ዝሰርሑ መወከሲ ትግበራታት እዮም፤ ናይ ምርት ስርዓት፣ ምስክር ውሕስነት፣ ሕጋዊ ምኽሪ ወይ ኣውቶማቲክ EUDR ውሳነ ኣይኮኑን።

## 1. ዕላማን ደረት ውሕስነትን

SCTracker መሳርሒ ካብ መስመር ወጻኢ ከሎ መረጋገጺ ባች ቡን፣ ከረጺት፣ ማሕተም፣ ርኽክብ፣ ቦታ፣ መወከሲ ሚድያን ምርግጋጽ ጥቕልን ይምዝግብ። ፍጻመታት ከይተደምሰሱ ይውሰኹን ብሃሽ ይተኣሳሰሩን።

እቲ መወከሲ ናይ ከባቢ ፊርማ፣ ሕጊ ዑደት ህይወት፣ ውሳነ ርኽክብ፣ ፍሉይ ምዕቃብን ዝተረጋገጸ ልውውጥ ጥቕልን የርኢ። ንምርት ድሕረ-ስርዓት መንነት/ፍቓድ፣ ናይ ውድብ እምነት/ስረዛ፣ ውሑስ ምዝገባ/ምምላስ፣ ምስጢር፣ ክትትል፣ ግላውነትን ናጻ ግምገማ ውሕስነትን የድሊ። ሃሽ ወይ ፊርማ መሳርሒ ሓበሬታ ሓቂ ወይ ተጠቃሚ ፍቓድ ከምዘለዎ ኣየረጋግጽን።

## 2. ምትካልን ምድላውን

### Android

1. Android 8.0/API 26 ወይ ልዕሊኡ ምስ screen lock ተጠቐሙ፤ ብውድብ ዝተፈቕደ ዝተፈረመ build ጥራይ ተኸሉ።
2. ንልምዓት `mobile-native\android` ብAndroid Studio፣ JDK 17ን Android SDK 35ን ክፈቱ ወይ `.\gradlew.bat assembleDebug` ኣካይዱ።
3. ዘድሊ ናይ camera፣ location፣ fileን NFCን ፍቓድ ጥራይ ሃቡ። እዚ መወከሲ ሞዴል ሚድያ/GPS ኣለዎ፣ ኩሉ መስርሕ ምቕራጽ ግን ኣይወድአን።
4. ኣብ header “offline ready”ን ቀዋሚ ምልክት ቋንቋን ከምዘሎ ኣረጋግጹ።

### iOS

1. iOS 17 ወይ ልዕሊኡ ምስ passcode ተጠቐሙ፤ ዝተፈቕደ ዝተፈረመ build ጥራይ ተኸሉ።
2. ንልምዓት `mobile-native\ios\SCTrackerNative.xcodeproj` ኣብ Xcode 16 ወይ ልዕሊኡ ክፈቱ፣ `SCTrackerNative` scheme ምረጹ።
3. NFC ኣብ ናይ ሓቂ iPhone ቅኑዕ App IDን NFC Tag Reading entitlementን የድሊ። Simulator ንልምዓት ጥራይ ናይ software መፍትሕ ይጥቀም።
4. ምልክት ዓለም ኣብ ኩሉ header ገጽ ከምዘሎ ኣረጋግጹ።

ሓበሬታ simulator፣ መፍትሕ ልምዓት፣ debug build ወይ ኣብነታዊ ተጠቃሚ ንመዝገብ ምርት ኣይትጠቐሙ።

## 3. ምዝገባ መሳርሒን ጥቕል እምነትን

ኣብ app ዘለዉ ተጠቀምቲ፣ ተራታትን ኩነታት እምነትን መትሓዚ ቦታ እዮም። ኣብ ምርት ኣመሓዳሪ መሳርሒ ይምዝግብ፣ public key ምስ ውድብን ስም ዘለዎ ኦፕሬተርን የተኣሳስር፣ hardware/OS/appን ደረጃ ሓለዋ መፍትሕን ይምዝግብ፣ ተራን ግዜ ምውዳእን ዘለዎ ዝተፈረመ trust package ይህብ፣ ስረዛ ይድግፍ።

ቅድሚ ስራሕ device ID፣ key ID፣ ውድብ፣ ኦፕሬተር፣ ተራ፣ ግዜን ፊርማን ኣረጋግጹ። `UNVERIFIED`፣ `LOCALLY_TRUSTED`፣ `ORGANIZATION_VERIFIED`ን `REVOKED`ን መለለዪታት ፕሮቶኮል እዮም፤ ስልጣን ናይ ውድብ ፖሊሲ ጥራይ ይህብ። ግዜኡ ዝሓለፈ፣ ዘይፍለጥ፣ ዘይሰማማዕ ወይ ዝተሰረዘ ጥቕል ንጸጉ።

## 4. ምርጫ ቋንቋ

ኣብ ላዕለዋይ header ዘሎ ቀዋሚ globe/language icon ጠውቑ፣ Deutsch፣ English፣ አማርኛ ወይ ትግርኛ ምረጹ። ምርጫ ኣብ መሳርሒ ይዕቀብ። መለለዪታት፣ ሃሽ፣ ኮድ፣ ስማት ሰብ/ቦታን ክብሪ ፕሮቶኮልን ኣይትርጎሙን፤ መግለጺ ጽሑፍ ይትርጎም።

## 5. ምድላው ካብ መስመር ወጻኢ

- መሳርሒ ምሉእ ቻርጅን እኹል ውሑስ storageን ኣረጋግጹ።
- App ክፈቱ፣ ቋንቋ ምረጹ፣ እምነት ኦፕሬተር/መሳርሒ ኣረጋግጹ።
- ኣብ ምርት ዝተመደበ ስራሕን ዝተፈቕደ trust packageን ኣውርዱ።
- ዕለት/ሰዓት፣ camera፣ locationን permissionsን ኣረጋግጹ።
- ውሑስ መንገዲ ምትሕልላፍ ጥቕልን ናይ ወረቐት fallbackን ኣዳልዉ።
- NFC ኣይትእመኑ፤ ናይ ሓቂ ስርሒት chip ብዕላማ ተዓጽዩ ኣሎ።

“Offline ready” ናይ ከባቢ መስርሕ ይሰርሕ ማለት ጥራይ እዩ፤ መንነት፣ እምነት፣ backupን syncን ወዲኡ ማለት ኣይኮነን።

## 6. ምርግጋጽ ኦፕሬተር

መወከሲ app ናይ ምርት login የብሉን። ምርት ብውድብ ዝተዋህበ መንነት፣ device unlock፣ ሓጺር inactivity lock፣ role authorization ንኹሉ ተግባርን supervisor approval ንስሱዕ correction/reconciliationን ከገድድ ኣለዎ። credentials ኣይትካፈሉ፣ ዝተኸፍተ መሳርሒ ኣይትግደፉ። ዝርአ ኦፕሬተር፣ ውድብ ወይ ተራ ጌጋ እንተኾይኑ ስራሕ ኣቋርጹ።

## 7. Genesisን 1 ክሳብ 100 ከረጺት ምቕራጽን

1. Workflows/Sacks ክፈቱ፣ ሓድሽ Genesis ምረጹ።
2. መወከሲ ባችን መበገሲን ካብ ምንጪ ሰነድ ብልክዕ ኣእትዉ።
3. ብዝሒ ከረጺት ካብ 1 ክሳብ 100 ግበሩ፤ ካልእ ቁጽሪ ይንጸግ።
4. ባች ፍጠሩ። App ቀዋሚ መለለዪ ከረጺት ይፈጥር፣ ባች `UNISSUED` ይኸውን።
5. ነፍሲ ወከፍ ኣብ screen ዘሎ መለለዪ ምስ ኣብ ከረጺት ዘሎ ምልክት ኣዛምዱ።

መለለዪ ዳግማይ ኣይትጠቐሙ፣ Genesis ብሕቡእ ኣይትቐይሩ። ጌጋ እንተሎ ብፖሊሲ ምርት ዝተፈቕደ correction/VOID event ፍጠሩ።

## 8. ጽሬት GPS

ኣብ ደገ ንሰማይ ግሉጽ ርእይቶ ዘለዎ ቦታ ቅረጹ። ርጉእ fix ተጸበዩ፣ horizontal accuracy፣ provider፣ capture timeን mock-location signalን መርምሩ። መወከሲ 25 ሜትር ወይ ዝሓሸ ይቕበል፤ ፖሊሲ ምርት ዝጸንዐ ክኸውን ይኽእል። ድኹም fix ድገሙ፣ ቅቡል fix ዘይተረኽበሉ ምኽንያት መዝግቡ። GPS መረጋገጺ ሓበሬታ እዩ እምበር መርትዖ መበገሲ ኣይኮነን፤ coordinate ኣይትፍጠሩ፣ ኣይትጠጋግዑ ወይ ካብ ካልእ ቦታ ኣይትቕድሑ።

## 9. ዑደት ህይወት፣ ቁጽጽር፣ ጉድኣት፣ ምኽፋትን ምእራምን

ንቡር ቅደም `UNISSUED` → `ISSUED` → `SEALED` → `IN_TRANSIT` → `OPENED` እዩ። `VOID`ን `DAMAGED`ን ናይ መወዳእታ ፍሉይ ኩነታት እዮም።

- Genesisን ከረጺታትን ድሕሪ ምርግጋጽ Issue ግበሩ።
- ዝተፈቕደ መስርሕ ማሕተም ድሕሪ ምርግጋጽ Seal ግበሩ።
- ርኽክብ/ምልኣኽ ሓበሬታ ቅኑዕ ክኸውን ከሎ transit ጀምሩ።
- ኣብ ዝተፈቕደ መዕረፊ ጥራይ Open ግበሩ፣ መረጋገጺ መዝግቡ።
- ከረጺት/ማሕተም እንተተጎዲኡ `DAMAGED` ግበሩ፣ ስራሕ ኣቋርጹ፣ quarantine ተኸተሉ።
- ዘይጠቅም መለለዪ `VOID` ግበሩ።
- ታሪኽ ኣይትደምስሱ፤ correction ነቲ ጌጋ ዝጠቅስ ሓድሽ ዝተፈረመ event እዩ።

## 10. OFFER፣ ACCEPT፣ REJECTን PENDINGን

`OFFER` ርኽክብ `PENDING` ይገብሮ፤ ኣብዚ ግዜ custody/ownership ኣይተሰጋገረን። ተቐባሊ መለለዪ ባች/ከረጺት፣ ላኣኺ፣ ተቐባሊ፣ ኩነታትን exact offer hashን ይምርምር። `ACCEPT` ወይ `REJECT` ነቲ ልክዕ ሃሽ ክጠቅስ ኣለዎ። ካልኣይ ውሳነ ወይ ዘይሰማማዕ ሃሽ ይንጸግ። ዝተኸራኸረ ወይ concurrent transfer ንግምገማ supervisor ኣብ PENDING/quarantine ይጽናሕ።

## 11. መረጋገጺ ስእልን ሰነድን

label፣ seal፣ ኩነታትን ዝተፈቕደ ሰነድን ንጹርን ምሉእን ጌርኩም ሰኣሉ። ዘይምልከቶም ሰባት፣ ID፣ screen ወይ ውልቃዊ ከባቢ ኣይተእትዉ። focus፣ completeness፣ time፣ batch association፣ MIME type፣ sizeን SHA-256ን ኣረጋግጹ። መወከሲ metadataን hashን ይሕዝ፣ ምሉእ ውሑስ media vault ኣይኮነን። ምርት encryption፣ upload retry፣ malware scan፣ retention/deletion policyን access controlን የድሊ።

## 12. ፍሉይ ምዕቃብ፣ ግጭትን ግምገማን

ፊርማ፣ hash፣ sequence፣ previous hash፣ identity/trust፣ lifecycle፣ evidence ወይ physical condition ክረጋገጽ እንተዘይክኢሉ ባች/ጥቕል quarantine ግበሩ። ዝተፈላለየ event branch ብኣውቶማቲክ ኣይወሃሃድን። ክልቲኡ ዓቅቡ፣ error code መዝግቡ፣ ስራሕ ኣቋርጹን ኣሕልፉን። “Mark reviewed” ኣብ መወከሲ ግምገማ ጥራይ ይምዝግብ፤ ምርት ብዝተፈቕደ supervisor ዝተፈረመ compensating decision የድሊ።

## 13. Export፣ importን verification ጥቕልን

ንexport “create signed export” ምረጹ፣ ጥቕል ከይቀየርኩም ብዝተፈቕደ መንገዲ ኣሕልፉ። ንimport “import and verify” ምረጹ። ቅድሚ ምቕባል manifest structure/signature፣ exact file set፣ safe path፣ byte size፣ ኩሉ SHA-256፣ chain root፣ event chainን signatureን ይፍተሽ።

ብኸፊል ኣይተእትዉ፣ file ኣይትቐይሩ፣ verification failure ኣይትሕለፉ፣ package signature ከም organization trust ኣይትቑጸሩ። Invalid/divergent package quarantine ይጽናሕ። ምርት size limit፣ streaming archive፣ recipient encryption፣ malware/media scan፣ trusted-key lookup፣ replay controlን audited syncን የድሊ።

## 14. Error codeን ምላሽ ኦፕሬተርን

- `SCT-INPUT` / `GENESIS_SACK_COUNT_INVALID`፦ ዘድሊ input ወይ ብዝሒ 1–100 ኣስተኻኽሉ።
- `SCT-STATE` / `TRANSITION_NOT_ALLOWED`፦ record refresh ግበሩ፣ ዝተፈቕደ action ጥራይ ውሰዱ።
- `SCT-EVENT`፦ ኣቋርጹን data ዓቅቡን፤ duplicate፣ sequence፣ hash ወይ chain ጌጋ ኣሎ።
- `SCT-SIGN` / `KEYSTORE_UNAVAILABLE`፦ signing ኣቋርጹ፣ registrationን key protectionን መርምሩ።
- `SCT-PACKAGE` / `MANIFEST_*`፦ import ኣይትግበሩ፣ package quarantine ግበሩ፣ hash ሓብሩ።
- `SCT-CONFLICT` / `IMPORT_QUARANTINED`፦ batch work ኣቋርጹ፣ authorized reconciliation ሕተቱ።
- `SCT-STORAGE`፦ ስራሕ ኣቋርጹ፣ መሳርሒ ዓቅቡ፣ app data ኣይትደምስሱ።
- `SCT-CHIP` / `SCT-NFC`፦ ከም መረጋገጺ authenticity ኣይትድገሙ፣ approved non-NFC fallback ተጠቐሙ።

Exact code፣ time፣ device ID፣ batch/transfer/package IDን actionን መዝግቡ። secret፣ full personal data፣ APDU ወይ chip response ንsupport ኣይትልኣኹ።

## 15. ግላውነትን ዝጠፍአ መሳርሒን

ዘድሊ data ጥራይ ኣክቡ። password፣ secret key፣ ዘየድሊ personal data፣ full document image ወይ exact coordinate ኣብ note፣ log፣ chat ወይ public system ኣይተቐምጡ።

መሳርሒ እንተጠፊኡ/ተሰሪቑ ብኡንብኡ ሓብሩ፤ device keyን trust packageን revoke ግበሩ፤ sessions disable ግበሩ፤ last trusted event/package checkpoint ፍለጡ፤ ድሕሪኡ ዘሎ untrusted activity quarantine ግበሩ፤ remote lock/erase ብፖሊሲ ጥራይ ግበሩ። Replacement ከም ሓድሽ device ይመዝገብ፤ signing key ካብ app backup ኣይትቕድሑ።

## 16. ፍታሕ ጸገም

- App እንተዘይተኸፊቱ፦ OS፣ storage፣ signed buildን device policyን መርምሩ፤ ቅድሚ evidence preservation reinstall ኣይትግበሩ።
- ቋንቋ ጌጋ እንተኾይኑ፦ persistent globe icon ተጠቐሙ።
- Location እንተዘይሃልዩ፦ ናብ ደገ ውጹ፣ permission ክፈቱ፣ accuracy ተጸበዩ፣ fallback መዝግቡ።
- Import እንተፈሺሉ፦ original package ከይቀየረ ዓቅቡ፣ hashን codeን ሓብሩ።
- History conflict፦ ስራሕ ኣቋርጹ፣ quarantine ግበሩ፣ branch ብኢድ ኣይትምረጹ።
- NFC እንተፈሺሉ፦ ምስ shipped disabled profile ዝጽበ እዩ፣ approved fallback ተጠቐሙ።
- Signing/storage failure፦ capture ኣቋርጹ፣ app data ኣይትደምስሱ፣ device time ኣይትቐይሩ።

## 17. ግዴታዊ መጠንቀቕታ NFC

> ናይ ሓቂ NFC AUTHENTICATION፣ READ፣ UPDATEን READ-BACKን ተዓጽዩ ክጸንሕ ኣለዎ፤ ዝተፈቕደ manufacturer-specific PoC ነቲ chipን memory/application layoutን ክሳብ ዝፈሊ፣ authoritative APDU/status word ክሳብ ዝጥቀም፣ ኣብ app ዘይተቐመጠ secure key provisioning/diversification/rotation/revocation ክሳብ ዝውስን፣ iOS/Android compatibility ክሳብ ዘረጋግጽ፣ replay፣ relay፣ cloning፣ tearing፣ interruption፣ lockout፣ damageን read-backን ክሳብ ዝፍትንን ናጻ security review ክሳብ ዝሓልፍን።

Repository ዝተፈቕደ production chip profile፣ APDU set ወይ provisioning key የብሉን። UID ንlookup ጥራይ እዩ፤ መረጋገጺ authenticity ኣይኮነን።
