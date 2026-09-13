# SCTracker Native Apps — Benutzerhandbuch

## Deutsch · Referenzimplementierung

Version 0.1 — September 2026

> WICHTIG: Die iOS- und Android-Apps sind ausführbare Referenzimplementierungen, keine Produktionssysteme, Sicherheitszertifizierungen, Rechtsberatung oder automatische EUDR-Konformitätsentscheidung.

## 1. Zweck und Sicherheitsgrenzen

SCTracker erfasst offline Nachweise zu Kaffeechargen, Säcken, Siegeln, Übergaben, Standort, Medienreferenzen und Paketprüfung. Ereignisse werden nur angehängt und per Hash verkettet, damit spätere Änderungen erkennbar sind.

Die Referenz zeigt lokale Signaturen, Lebenszyklusregeln, Übergabeentscheidungen, Quarantäne und geprüften Paketaustausch. Für Produktion sind zusätzlich Backend-Identität und -Autorisierung, Organisationsvertrauen und Widerruf, sichere Registrierung und Wiederherstellung, verschlüsselte Sicherung und Übertragung, Aufbewahrungsregeln, Überwachung, Datenschutzprüfung, unabhängige Protokoll-/Sicherheitsprüfung und geschulte Bediener erforderlich. Ein Hash oder eine Gerätesignatur beweist weder die Wahrheit einer Angabe noch die Berechtigung eines Akteurs.

## 2. Installation und Einrichtung

### Android

1. Android 8.0/API 26 oder neuer mit Displaysperre verwenden; nur einen von der Organisation freigegebenen, signierten Build installieren.
2. Für Entwicklung `mobile-native\android` mit JDK 17 und Android SDK 35 in Android Studio öffnen oder `.\gradlew.bat assembleDebug` ausführen.
3. Nur erforderliche Kamera-, Standort-, Datei- und NFC-Berechtigungen erteilen. Die Referenz modelliert Medien und GPS, enthält aber noch nicht alle Erfassungsabläufe.
4. Prüfen, dass der Header „offline bereit“ meldet und das Sprachsymbol dauerhaft sichtbar ist.

### iOS

1. iOS 17 oder neuer mit Gerätecode verwenden; nur freigegebene signierte Builds installieren.
2. Für Entwicklung `mobile-native\ios\SCTrackerNative.xcodeproj` in Xcode 16 oder neuer öffnen und das Schema `SCTrackerNative` wählen.
3. NFC auf einem Gerät benötigt die richtige App-ID und NFC-Tag-Reading-Berechtigung. Der Simulator nutzt nur einen Entwicklungs-Softwareschlüssel.
4. Prüfen, dass das Globus-Symbol in jedem Bildschirm-Header sichtbar bleibt.

Simulator-Daten, Entwicklungsschlüssel, Debug-Builds und Beispielakteure dürfen nicht für Produktionsnachweise verwendet werden.

## 3. Geräteregistrierung und Vertrauenspaket

Mitgelieferte Akteure, Rollen und Vertrauensstatus sind Platzhalter. In Produktion registriert ein Administrator das Gerät, bindet den öffentlichen Schlüssel an Organisation und benannten Bediener, dokumentiert Hardware/OS/App und Schlüsselschutz, stellt ein signiertes Vertrauenspaket mit Rollen und Ablauf aus und ermöglicht Widerruf.

Vor Arbeitsbeginn Geräte-ID, Schlüssel-ID, Organisation, Bediener, Rollen, Gültigkeit und Signatur des Vertrauenspakets mit dem Einsatzauftrag abgleichen. `UNVERIFIED`, `LOCALLY_TRUSTED`, `ORGANIZATION_VERIFIED` und `REVOKED` sind Protokollkennungen; nur die Organisationsrichtlinie vergibt Befugnisse. Abgelaufene, unbekannte, unpassende oder widerrufene Pakete ablehnen.

## 4. Sprachauswahl

Das dauerhafte Globus-/Sprachsymbol im oberen Header antippen und Deutsch, English, አማርኛ oder ትግርኛ wählen. Die Auswahl wird lokal gespeichert. Kennungen, Hashes, Codes, Eigennamen und Protokollwerte bleiben unverändert; erklärende Beschriftungen werden übersetzt.

## 5. Offline-Vorbereitung

- Gerät laden und genügend geschützten Speicher prüfen.
- App öffnen, Sprache wählen und Bediener-/Gerätevertrauen prüfen.
- In Produktion Arbeitsauftrag und freigegebenes Vertrauenspaket herunterladen.
- Datum/Uhrzeit, Kamera, Standort und Berechtigungen prüfen.
- Sicheren Paketübertragungsweg und Papier-Ersatzverfahren vorbereiten.
- Nicht auf NFC verlassen: echte Chipvorgänge sind absichtlich gesperrt.

„Offline bereit“ bedeutet nur, dass lokale Abläufe funktionieren; Identität, Vertrauen, Sicherung und Synchronisierung sind damit nicht abgeschlossen.

## 6. Bedienerauthentifizierung

Die Referenz enthält keine Produktionsanmeldung. Produktion muss Organisationsidentität, Geräteentsperrung, kurze Inaktivitätssperre, rollenbasierte Autorisierung jeder Aktion und Aufsicht für sensible Korrekturen/Abgleiche erzwingen. Zugangsdaten nie teilen und entsperrte Geräte nie unbeaufsichtigt lassen. Bei falschem Bediener, falscher Organisation oder Rolle Arbeit stoppen.

## 7. Genesis und Erfassung von bis zu 100 Säcken

1. Abläufe/Säcke öffnen und neue Chargen-Genesis wählen.
2. Chargenreferenz und Herkunft exakt aus den Quelldokumenten übernehmen.
3. Sackzahl von 1 bis 100 einstellen; andere Werte werden abgelehnt.
4. Charge erstellen. Die App erzeugt deterministische Sackreferenzen und startet mit `UNISSUED`.
5. Jede angezeigte Sackreferenz mit der physischen Kennzeichnung vergleichen.

Kennungen nie wiederverwenden und Genesis nie still ändern. Fehler werden nach Produktionsrichtlinie durch ein autorisiertes Korrektur- oder Ungültigkeitsereignis berichtigt.

## 8. GPS-Qualität

Standort im Freien bei freier Sicht erfassen. Auf stabilen Fix warten und horizontale Genauigkeit, Quelle, Erfassungszeit sowie gegebenenfalls Mock-Standort prüfen. Die Referenz markiert höchstens 25 Meter als akzeptabel; Einsatzregeln können strenger sein. Schlechte Messung wiederholen und fehlenden Fix begründen. GPS ist Nachweismetadatum, kein Herkunftsbeweis; Koordinaten nie erfinden, runden oder von einem anderen Ort kopieren.

## 9. Lebenszyklus, Kontrollen, Schaden, Öffnung und Korrekturen

Normal: `UNISSUED` → `ISSUED` → `SEALED` → `IN_TRANSIT` → `OPENED`. `VOID` und `DAMAGED` sind terminale Ausnahmezustände. Die Oberfläche bietet nur erlaubte Aktionen.

- Erst nach Prüfung von Genesis und Säcken ausgeben.
- Nur nach freigegebenem Siegelverfahren versiegeln.
- Transport erst mit korrekten Übergabe-/Versanddaten starten.
- Nur am autorisierten Ziel öffnen und Nachweis erfassen.
- Schäden an Sack oder Siegel als beschädigt markieren, normale Bearbeitung stoppen und Quarantäne befolgen.
- Nicht nutzbare Kennungen als ungültig markieren.
- Historie nie überschreiben; Korrekturen sind neue signierte Ereignisse mit Bezug zum Fehler und erforderlicher Berechtigung.

## 10. OFFER, ACCEPT, REJECT und PENDING

`OFFER` erzeugt eine Übergabe im Status `PENDING`; Verwahrung ist noch nicht übertragen. Der Empfänger prüft Chargen-/Sackreferenzen, Sender, Empfänger, Zustand und exakten Angebots-Hash. `ACCEPT` oder `REJECT` muss exakt diesen Hash referenzieren. Zweite Entscheidungen und falsche Hashes werden abgelehnt. Streitige oder parallele Übergaben bleiben bis zur Aufsichtsprüfung ausstehend/quarantänisiert; nicht neu erstellen, um Konflikte zu verbergen.

## 11. Foto- und Dokumentnachweise

Etiketten, Siegel, Zustand und zulässige Dokumente scharf und vollständig fotografieren. Unbeteiligte Personen, Ausweise, Bildschirme und private Umgebung vermeiden. Fokus, Vollständigkeit, Zeit, Chargenzuordnung, MIME-Typ, Größe und SHA-256-Referenz prüfen. Die Referenz speichert Modelle/Hashes, keinen vollständigen sicheren Medientresor. Produktion benötigt verschlüsselte Speicherung, Upload-Wiederholung, Malware-Prüfung, Aufbewahrung/Löschung und Zugriffskontrolle.

## 12. Quarantäne, Konflikte und Prüfung

Charge oder Paket quarantänisieren, wenn Signatur, Hash, Sequenz, Vorgänger-Hash, Identität/Vertrauen, Lebenszyklus, Nachweis oder physischer Zustand nicht geprüft werden kann. Abweichende Ereigniszweige werden nicht automatisch zusammengeführt. Beide Zweige erhalten, Fehlercode notieren, weitere Aktionen stoppen und eskalieren. „Als geprüft markieren“ dokumentiert in der Referenz nur die Prüfung; Produktion benötigt eine signierte Ausgleichsentscheidung durch autorisierte Aufsicht.

## 13. Paketexport, -import und Prüfung

Für Export „signierten Export erstellen“ wählen, Paket unverändert lassen und über freigegebenen Kanal übertragen. Für Import „importieren und prüfen“ wählen. Vor Annahme werden Manifeststruktur/-signatur, exakte Dateimenge, sichere Pfade, Bytegrößen, alle SHA-256-Hashes, Kettenwurzel, Ereignisketten und Signaturen geprüft.

Nie teilweise importieren, Inhalte umbenennen/ändern, Prüfungsfehler umgehen oder eine eigenständige Signatur als Organisationsvertrauen behandeln. Ungültige/abweichende Pakete bleiben in Quarantäne. Produktion benötigt außerdem Größenlimits, Streaming-Archive, Empfängerverschlüsselung, Malware-/Medienprüfung, vertrauenswürdige Schlüsselsuche, Replay-Schutz und auditierte Synchronisierung.

## 14. Fehlercodes und Reaktion

- `SCT-INPUT` / `GENESIS_SACK_COUNT_INVALID`: Pflichtangaben oder Sackzahl 1–100 korrigieren.
- `SCT-STATE` / `TRANSITION_NOT_ALLOWED`: Datensatz aktualisieren und nur erlaubte Aktion ausführen.
- `SCT-EVENT`: stoppen und Daten erhalten; Duplikat, Sequenz, Hash oder Kette ist fehlerhaft.
- `SCT-SIGN` / `KEYSTORE_UNAVAILABLE`: Signieren stoppen; Registrierung und Schlüsselschutz prüfen.
- `SCT-PACKAGE` / `MANIFEST_*`: nicht importieren; Paket quarantänisieren und Hash melden.
- `SCT-CONFLICT` / `IMPORT_QUARANTINED`: Chargenarbeit stoppen und autorisierten Abgleich anfordern.
- `SCT-STORAGE`: Arbeit stoppen, Gerät sichern, Support kontaktieren; App-Daten nicht löschen.
- `SCT-CHIP` / `SCT-NFC`: nicht als Echtheitsprüfung wiederholen; freigegebenen Nicht-NFC-Ersatz nutzen.

Exakten Code, Zeitpunkt, Geräte-ID, Chargen-/Übergabe-/Paketkennung und Aktion notieren. Keine Geheimnisse, vollständigen Personendaten, APDUs oder Chipantworten an Support senden.

## 15. Datenschutz und verlorenes Gerät

Nur notwendige Daten erfassen. Passwörter, Schlüssel, unnötige Personendaten, vollständige Dokumentbilder oder genaue Koordinaten nie in Notizen, Logs, Chat oder öffentliche Systeme schreiben. Einwilligung, Zugriff, Aufbewahrung und Löschung beachten.

Bei Verlust/Diebstahl sofort melden, Geräteschlüssel und Vertrauenspaket widerrufen, Sitzungen sperren, letzten vertrauenswürdigen Ereignis-/Paketcheckpoint ermitteln, spätere nicht vertrauenswürdige Aktivität quarantänisieren und nur nach Richtlinie sperren/löschen. Ersatzgerät neu registrieren; Signierschlüssel nie aus App-Backup kopieren.

## 16. Fehlerbehebung

- App startet nicht: OS, Speicher, Signatur und Geräterichtlinie prüfen; vor Beweissicherung nicht neu installieren.
- Falsche Sprache: dauerhaftes Globus-Symbol nutzen; nur neu starten, wenn Auswahl nicht übernommen wird.
- Kein Standort: ins Freie gehen, Berechtigung aktivieren, Genauigkeit abwarten und Ersatz dokumentieren.
- Import scheitert: Originalpaket unverändert aufbewahren; Hash und Code melden.
- Konflikt: Betrieb stoppen und quarantänisieren; nie manuell einen Zweig auswählen.
- NFC scheitert: beim ausgelieferten deaktivierten Profil erwartet; Ersatzverfahren nutzen.
- Signatur/Speicher scheitert: Erfassung stoppen; App-Daten nicht löschen und Gerätezeit nicht ändern.

## 17. Verbindliche NFC-Warnung

> ECHTE NFC-AUTHENTIFIZIERUNG, LESEN, AKTUALISIEREN UND RÜCKLESEN MÜSSEN GESPERRT BLEIBEN, bis ein genehmigter herstellerspezifischer PoC Chip und Speicher-/App-Layout identifiziert, autoritative APDUs/Statuswörter nutzt, sichere nicht in der App eingebettete Schlüsselbereitstellung, Diversifizierung, Rotation und Widerruf definiert, iOS-/Android-Kompatibilität belegt, Replay, Relay, Klonen, Tearing, Unterbrechung, Sperre, Schaden und Rücklesen testet und unabhängig sicherheitsgeprüft ist.

Das Repository enthält kein freigegebenes Produktions-Chipprofil, APDU-Set oder Bereitstellungsschlüssel. UID dient nur zur Suche und ist nie Echtheitsnachweis.
