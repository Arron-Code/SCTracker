# SCTracker Mobile iOS – Gebrauchsanweisung

Version 0.2.0, Build 21 – September 2026

## 1. Zweck der App

SCTracker Mobile unterstützt die mobile Erfassung und Synchronisierung von
Lieferanten-, Kaffee-Plot- und Compliance-Daten. Daten können zunächst offline
auf dem iPhone erfasst und später mit dem SCTracker-Backend synchronisiert
werden.

Die App unterstützt:

- Lieferantenerfassung;
- Kaffee-Plot-Erfassung über GPS oder GeoJSON;
- Geofencing für gespeicherte Plots;
- verschlüsselten Dokument-Upload;
- Satellitenanalysen, Evidence Packs und DDS-Entwürfe;
- Offline-Arbeit und spätere Synchronisierung;
- Deutsch, Englisch, Amharisch und Tigrinya.

SCTracker ersetzt keine rechtliche Beratung und trifft keine automatische
EUDR-Konformitätsentscheidung. Freigaben müssen durch die zuständigen Personen
der Organisation geprüft werden.

## 2. Voraussetzungen

Für die Verwendung werden benötigt:

- ein iPhone mit Gerätecode oder biometrischer Sperre;
- eine Internetverbindung für Anmeldung, E-Mail-Verifizierung und
  Synchronisierung;
- ein von der Organisation bereitgestelltes SCTracker-Benutzerkonto;
- Zugriff auf die E-Mail-Adresse des Benutzerkontos;
- bei Plot- und Geofencing-Funktionen die iOS-Standortberechtigung.

Eine öffentliche Selbstregistrierung ist nicht verfügbar. Neue Konten werden
von einem Administrator angelegt.

## 3. Installation über TestFlight

1. Installieren Sie **TestFlight** aus dem Apple App Store.
2. Öffnen Sie die TestFlight-Einladung der Organisation.
3. Wählen Sie **Asterostrace/SCTracker**.
4. Tippen Sie auf **Installieren** oder **Aktualisieren**.
5. Prüfen Sie in TestFlight, dass mindestens Version **0.2.0 (21)** installiert
   ist.
6. Öffnen Sie die App.

Wenn Build 21 noch nicht angezeigt wird, schließen Sie TestFlight vollständig,
öffnen Sie es erneut und aktualisieren Sie die Seite. Neue Builds werden erst
angezeigt, nachdem Apple die Verarbeitung abgeschlossen und den Build der
Testgruppe zugeordnet hat.

## 4. Sprache auswählen

1. Tippen Sie im Kopfbereich auf die Sprachauswahl.
2. Wählen Sie **Deutsch**, **English**, **አማርኛ** oder **ትግርኛ**.
3. Schließen Sie die Auswahl.

Die Sprache wird auf dem iPhone gespeichert und beim nächsten Start wieder
verwendet.

## 5. Anmelden

1. Geben Sie Ihre vollständige E-Mail-Adresse ein.
2. Geben Sie Ihr Passwort ein.
3. Tippen Sie auf **Anmelden**.
4. Warten Sie, bis die Anmeldung abgeschlossen ist. Tippen Sie nicht mehrfach
   auf die Schaltfläche.

Nach erfolgreicher Anmeldung lädt die App die verfügbaren Organisationen.

### 5.1 E-Mail erstmals bestätigen

Wenn das Konto noch nicht bestätigt wurde, öffnet die App automatisch die
Ansicht **E-Mail bestätigen**.

1. Öffnen Sie die Verifizierungs-E-Mail.
2. Kopieren oder merken Sie sich den sechsstelligen Code.
3. Geben Sie den Code in der App unter **Verifizierungscode** ein.
4. Tippen Sie auf **Code bestätigen**.
5. Nach erfolgreicher Bestätigung setzt die App die Anmeldung automatisch fort.

Der Code ist nur begrenzte Zeit gültig. Bei einem ungültigen oder abgelaufenen
Code tippen Sie auf **Code erneut senden** und verwenden ausschließlich den
neuesten Code.

Mit **Zurück zur Anmeldung** brechen Sie die Code-Eingabe ab. Das Passwort und
der Code werden nicht dauerhaft auf dem Gerät gespeichert.

### 5.2 Passwort vergessen

1. Geben Sie Ihre E-Mail-Adresse ein.
2. Tippen Sie auf **Passwort vergessen?**.
3. Öffnen Sie die neueste Reset-E-Mail auf dem iPhone.
4. Öffnen Sie den Reset-Link. Der Link leitet zurück in die SCTracker-App.
5. Geben Sie ein neues Passwort mit mindestens acht Zeichen ein.
6. Wiederholen Sie das Passwort.
7. Tippen Sie auf **Passwort zurücksetzen**.
8. Melden Sie sich mit dem neuen Passwort an.

Jeder neue Reset-Vorgang kann ältere Reset-Links ungültig machen. Verwenden Sie
deshalb immer die zuletzt erhaltene E-Mail.

## 6. Organisation auswählen

Nach der Anmeldung muss eine aktive Organisation ausgewählt sein.

1. Tippen Sie auf die gewünschte Organisation.
2. Prüfen Sie, dass die Organisation als aktiv markiert ist.
3. Erst danach können Organisationsdaten geladen und synchronisiert werden.

Wenn keine Organisation angezeigt wird, aktualisieren Sie die Ansicht und
prüfen Sie die Internetverbindung. Bleibt die Liste leer, muss ein Administrator
das Konto in der SCTracker-Web-Administration per E-Mail mit einer Organisation
verbinden.

Organisationen und Mitgliedschaften werden ausschließlich zentral in der
Web-Administration gepflegt. Die mobile App kann keine Organisation anlegen.

## 7. Navigation

Am unteren Bildschirmrand stehen fünf Bereiche zur Verfügung:

- **Start:** Übersicht über Lieferanten, Plots, Dokumente und
  Synchronisierungsstatus;
- **Partner:** Lieferanten erfassen und anzeigen;
- **Plots:** Kaffee-Plots, GPS-Punkte, GeoJSON und Geofencing verwalten;
- **Vorgänge:** Dokumente, Satellitenanalysen, Evidence Packs und DDS;
- **Hilfe:** Hinweise zu Offline-Arbeit und Datenschutz.

## 8. Start und Synchronisierung

Die Startseite zeigt die Anzahl der lokal vorhandenen Lieferanten, Plots und
Dokumente. Zusätzlich werden der Zeitpunkt der letzten Synchronisierung und die
Anzahl wartender Änderungen angezeigt.

Statusanzeigen:

- **Online:** Das iPhone hat eine Netzwerkverbindung.
- **Offline:** Lokale Erfassung ist möglich, Servervorgänge sind nicht möglich.
- **In Warteschlange:** Änderungen wurden lokal gespeichert und noch nicht
  übertragen.
- **Synchronisiert:** Die Änderung wurde vom Backend übernommen.
- **Fehlgeschlagen:** Die Übertragung konnte nicht abgeschlossen werden.
- **Konflikt:** Lokale und serverseitige Daten unterscheiden sich.

### Manuell synchronisieren

1. Stellen Sie eine stabile Internetverbindung her.
2. Prüfen Sie, dass Sie angemeldet sind und die richtige Organisation aktiv ist.
3. Tippen Sie auf **Jetzt synchronisieren**.
4. Warten Sie auf **Synchronisierung abgeschlossen**.

Bei einem Konflikt überschreibt SCTracker keine Daten automatisch. Vergleichen
Sie beide Versionen und wählen Sie bewusst **Lokale Version behalten** oder
**Serverversion verwenden**.

## 9. Lieferanten erfassen

1. Öffnen Sie **Partner**.
2. Geben Sie den Namen des Lieferanten ein.
3. Geben Sie Land und Region ein.
4. Tippen Sie auf **Lieferant hinzufügen**.

Der Datensatz wird sofort offline gespeichert und in die
Synchronisierungswarteschlange aufgenommen. Erfassen Sie Namen, Land und Region
so, wie sie in den freigegebenen Quelldokumenten stehen.

## 10. Kaffee-Plot erfassen

1. Öffnen Sie **Plots**.
2. Geben Sie Produzent, Plot- oder Farmname und Fläche in Hektar ein.
3. Geben Sie optional die Lieferanten-ID ein.
4. Erfassen Sie die Geometrie über GPS oder importieren Sie ein
   GeoJSON-Polygon.
5. Prüfen Sie die Geometrie.
6. Richten Sie bei Bedarf Geofencing ein.
7. Tippen Sie auf **Offline-Plot speichern**.

### 10.1 Plot über GPS erfassen

1. Gehen Sie zum ersten Grenzpunkt des Plots.
2. Tippen Sie auf **GPS-Punkt hinzufügen**.
3. Warten Sie, bis der Standort ermittelt wurde.
4. Gehen Sie zu mindestens zwei weiteren unterschiedlichen Grenzpunkten und
   wiederholen Sie die Erfassung.
5. Prüfen Sie, dass mindestens drei Punkte vorhanden sind.

Für bessere Ergebnisse:

- GPS im Freien und mit möglichst freier Sicht verwenden;
- nicht mehrere Punkte an derselben Position erfassen;
- die tatsächliche Plotgrenze ablaufen;
- erfundene oder von anderen Flächen kopierte Koordinaten vermeiden.

### 10.2 GeoJSON importieren

1. Tippen Sie auf **GeoJSON importieren**.
2. Wählen Sie eine zulässige GeoJSON-Datei.
3. Prüfen Sie den angezeigten JSON-Inhalt.
4. Tippen Sie auf **GeoJSON übernehmen**.

Ein gültiges Polygon benötigt mindestens drei unterschiedliche Positionen und
einen geschlossenen Polygonring. Bei der Meldung **Das Polygon ist ungültig**
muss die Quelldatei korrigiert werden.

### 10.3 Geofencing einrichten

1. Tippen Sie beim Plot auf **Geofencing einrichten** oder
   **Geofencing öffnen**.
2. Prüfen Sie Mittelpunkt und Radius auf der Karte.
3. Verschieben Sie bei Bedarf den grünen Mittelpunkt oder den orangefarbenen
   Radiusmarker.
4. Speichern Sie den Geofence.
5. Erlauben Sie den Standortzugriff **Immer**, wenn iOS danach fragt und die
   Hintergrundüberwachung verwendet werden soll.
6. Erlauben Sie Benachrichtigungen, damit Ein- und Austrittsmeldungen angezeigt
   werden können.

Wenn GPS nicht verfügbar ist, kann die App den Mittelpunkt aus Land und Region
des Lieferanten oder aus einer manuellen Land-/Region-Eingabe bestimmen. Prüfen
Sie diesen Näherungswert sorgfältig.

## 11. Compliance-Vorgänge

Öffnen Sie **Vorgänge**. Für Servervorgänge werden Anmeldung, aktive
Organisation, Internetverbindung und ein konfiguriertes Backend benötigt.

### 11.1 Dokument verschlüsselt hochladen

1. Geben Sie eine Export-Passphrase mit mindestens zwölf Zeichen ein.
2. Tippen Sie auf **Dokument auswählen und hochladen**.
3. Wählen Sie die Datei.
4. Warten Sie auf den Status **Hochgeladen**.

Die App verschlüsselt die Datei vor dem Upload. Teilen Sie die Passphrase über
einen anderen sicheren Kommunikationsweg und speichern Sie sie nicht zusammen
mit dem Exportpaket. Eine verlorene Passphrase kann nicht aus dem Paket
rekonstruiert werden.

### 11.2 Satellitenanalyse anfordern

1. Geben Sie unter **Referenz-ID** die vorgesehene Plot- oder Vorgangs-ID ein.
2. Tippen Sie auf **Analyse anfordern**.
3. Tippen Sie später auf **Status abrufen**, bis ein Ergebnis vorliegt.

Das Ergebnis ist ein Prüfsignal und keine automatische rechtliche Freigabe.

### 11.3 Evidence Pack anfordern

1. Geben Sie die korrekte Referenz-ID ein.
2. Legen Sie eine Export-Passphrase mit mindestens zwölf Zeichen fest.
3. Tippen Sie auf **Evidence Pack anfordern**.
4. Aktualisieren Sie den Status.
5. Laden oder teilen Sie das fertige Paket.

Das geteilte Paket ist verschlüsselt. Übermitteln Sie die Passphrase getrennt.

### 11.4 DDS-Entwurf

1. Geben Sie die zugehörige Referenz-ID ein.
2. Tippen Sie auf **DDS-Entwurf erstellen**.
3. Rufen Sie den Status ab.
4. Tippen Sie auf **Validieren**.
5. Beheben Sie gemeldete Pflicht- oder Datenfehler.
6. Tippen Sie erst nach fachlicher Freigabe auf **Einreichen**.

Ein technischer Erfolgsstatus bestätigt nicht automatisch die materielle
EUDR-Konformität.

## 12. Offline arbeiten

Lieferanten und Plot-Entwürfe können ohne Internetverbindung erfasst werden.
Änderungen bleiben lokal in einer Warteschlange, bis eine Synchronisierung
möglich ist.

Vor längerer Offline-Arbeit:

1. App und iPhone vollständig aktualisieren.
2. Anmelden und richtige Organisation auswählen.
3. Einmal erfolgreich synchronisieren.
4. Akkustand und freien Speicher prüfen.
5. Standortberechtigungen prüfen.

Die App nicht löschen, solange noch nicht synchronisierte Daten vorhanden sind.
Eine Neuinstallation kann lokale, noch nicht übertragene Daten entfernen.

## 13. Abmelden

1. Öffnen Sie den Anmelde-/Organisationsbereich.
2. Tippen Sie auf **Abmelden**.
3. Prüfen Sie, dass wieder die Anmeldemaske angezeigt wird.

Synchronisieren Sie nach Möglichkeit vor dem Abmelden. Geben Sie das entsperrte
iPhone nicht an andere Personen weiter und teilen Sie keine Zugangsdaten.

## 14. Datenschutz und sichere Nutzung

- Personen- und Standortdaten nur mit entsprechender Berechtigung erfassen.
- Nur Daten der aktiven Organisation bearbeiten.
- Passwörter, Verifizierungscodes und Export-Passphrasen nicht weitergeben.
- Keine Zugangsdaten in Namen, Referenzfeldern oder Dokumentbeschreibungen
  speichern.
- Das iPhone mit Gerätecode, Face ID oder Touch ID schützen.
- Verlorene oder gestohlene Geräte sofort der Organisation melden.
- Konflikte und fehlgeschlagene Übertragungen nicht ignorieren.
- Dokumente und Evidence Packs nur über freigegebene Kanäle teilen.

## 15. Fehlerbehebung

### Anmeldung leert die Felder, aber nichts passiert

1. Prüfen Sie, dass Build 21 oder neuer installiert ist.
2. Prüfen Sie die Internetverbindung.
3. Warten Sie mindestens 15 Sekunden auf eine sichtbare Fehlermeldung.
4. Schließen und öffnen Sie die App erneut.
5. Melden Sie Zeitpunkt, E-Mail-Adresse und Build-Nummer an den Support. Senden
   Sie niemals das Passwort.

### „Email not verified“

Build 21 öffnet automatisch die Code-Eingabe. Fordern Sie bei Bedarf einen
neuen Code an und verwenden Sie nur den neuesten sechsstelligen Code. Prüfen Sie
auch Spam- und Junk-Ordner.

### Keine Verifizierungs-E-Mail

1. E-Mail-Adresse auf Tippfehler prüfen.
2. Spam-/Junk-Ordner prüfen.
3. Einige Minuten warten.
4. Einmal auf **Code erneut senden** tippen.
5. Bei weiterhin fehlender E-Mail den Administrator kontaktieren.

### Reset-Link ungültig oder unvollständig

Fordern Sie einen neuen Reset-Link an und öffnen Sie ausschließlich die neueste
E-Mail auf dem iPhone. Reset-Links sind zeitlich begrenzt.

### Keine Organisation sichtbar

Internetverbindung prüfen, Ansicht aktualisieren und erneut anmelden. Wenn
weiterhin keine Organisation erscheint, muss ein Administrator die
Organisationsmitgliedschaft prüfen.

### Standort kann nicht ermittelt werden

Öffnen Sie **iOS-Einstellungen > Datenschutz & Sicherheit >
Ortungsdienste > SCTracker** und erlauben Sie den benötigten Zugriff. Gehen Sie
ins Freie und versuchen Sie es erneut.

### Synchronisierung fehlgeschlagen

Prüfen Sie Online-Status, Anmeldung und aktive Organisation. Tippen Sie danach
auf **Erneut versuchen** oder **Jetzt synchronisieren**. Bei einem Konflikt muss
eine Version bewusst ausgewählt werden.

### Build 21 fehlt in TestFlight

TestFlight vollständig schließen und neu öffnen. Prüfen Sie die Einladung und
die interne Testgruppe. Wenn der Build nach abgeschlossener Apple-Verarbeitung
weiterhin fehlt, muss ein Administrator die Zuordnung zur Testgruppe prüfen.

## 16. Supportangaben

Bei einer Störung sollten folgende Angaben übermittelt werden:

- App-Version und Build-Nummer;
- iOS-Version und iPhone-Modell;
- verwendete Organisation;
- betroffener Bereich;
- Zeitpunkt des Fehlers;
- genaue Fehlermeldung;
- Online- oder Offline-Status;
- Referenz-ID des betroffenen Vorgangs, sofern vorhanden.

Übermitteln Sie niemals Passwörter, Verifizierungscodes, Session-Token,
Datenbank-Zugangsdaten oder Export-Passphrasen.
