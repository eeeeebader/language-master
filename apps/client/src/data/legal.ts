/** German legal drafts. Placeholders in [brackets]; not legal advice – a lawyer reviews before launch. */
export const IMPRESSUM = `# Impressum

Angaben gemäß § 5 DDG

[Vorname Nachname] / [Firma, Rechtsform]
[Straße Hausnummer]
[PLZ Ort]
Deutschland

Kontakt
E-Mail: [kontakt@languagemaster.app]

Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
[Vorname Nachname], [Anschrift wie oben]

Verbraucherstreitbeilegung
Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).

Urheberrechtshinweis
Wörterbuchdaten basieren auf Wiktionary (CC BY-SA 4.0). Lerninhalte, Geschichten und Software: © 2026 [Name].`;

export const DATENSCHUTZ = `# Datenschutzerklärung

Stand: [Datum], Version 1

## 1. Verantwortlicher
[Name, Anschrift, E-Mail wie im Impressum]

## 2. Welche Daten wir verarbeiten und warum
In dieser Version (0.1) werden alle Daten ausschließlich lokal auf deinem Gerät gespeichert. Es findet keine Übertragung an einen Server statt.

Geplant für spätere Versionen: Konto und Anmeldung (Benutzername, E-Mail, Anmeldeweg, Bestätigung „mindestens 16“), Lernfunktion (Listen, Lernfortschritt, Geschichten), Erstellung von Geschichten (Lemma-Listen und Einstellungen, keine Namen), Käufe (Transaktions-IDs; Zahlungsdaten nur bei Stripe, Apple, Google), Sicherheit und Fehlerbehebung (gekürzte IP, Gerätetyp, App-Version; 30 Tage).

## 3. Offline-Daten auf deinem Gerät
Die App speichert Wörterbuch, Lektionen, Listen und Lernfortschritt lokal, damit sie ohne Internetverbindung funktioniert. Diese Daten löschst du unter Profil → Alle Daten löschen oder durch Deinstallation.

## 4. Speicherdauer und automatische Löschung (geplant)
Nach 12 Monaten ohne Anmeldung löschen wir Lerninhalte, nach 24 Monaten das Konto. Wir informieren 30 Tage vorher per E-Mail.

## 5. Deine Rechte
Auskunft (Art. 15), Berichtigung (16), Löschung (17), Einschränkung (18), Datenübertragbarkeit (20), Widerspruch (21). Export und Löschung sind direkt in der App möglich.

## 6. Mindestalter
Die Nutzung ist Personen ab 16 Jahren vorbehalten.`;

export const AGB = `# Allgemeine Geschäftsbedingungen (AGB)

Stand: [Datum], Version 1

## 1. Geltungsbereich
Diese AGB gelten für die Nutzung der App „Language Master“ von [Name, Anschrift]. Für Käufe über App Store oder Google Play gelten ergänzend die Bedingungen des Stores.

## 2. Registrierung
Die Nutzung setzt die Bestätigung voraus, dass du mindestens 16 Jahre alt bist.

## 3. Leistungsumfang
Kostenlose Nutzung: alle Lernfunktionen für eine aktive Zielsprache, eine KI-Geschichte pro Tag, zwei gespeicherte Geschichten. Premium (einmaliger Kauf): bis zu fünf Zielsprachen, Archiv bis 50 Geschichten je Sprache, 25 Tokens. Tokens: Verbrauchsgut für zusätzliche Geschichten; bei Fehlschlag automatisch gutgeschrieben.

## 4. KI-generierte Inhalte
Geschichten und Erklärungen werden teilweise automatisch erzeugt und können Fehler enthalten. Sie sind Lernmaterial, keine verbindliche Sprachauskunft.

## 5. Verfügbarkeit
Wir garantieren keine bestimmte Verfügbarkeit. Offline-Funktionen bleiben von Störungen unberührt.

## 6. Preise, Zahlung, Widerrufsrecht
Preise enthalten die gesetzliche Umsatzsteuer. Bei digitalen Inhalten erlischt das Widerrufsrecht, wenn du vor Vertragsschluss ausdrücklich zustimmst, dass wir mit der Ausführung beginnen, und bestätigst, dass du dadurch dein Widerrufsrecht verlierst (§ 356 Abs. 5 BGB).

## 7. Nutzungsrechte
Einfaches, nicht übertragbares Recht zur Nutzung für den eigenen Sprachlernzweck. Deine Listen und Einträge bleiben dein Eigentum. Wörterbuchdaten: CC BY-SA 4.0 (Wiktionary).

## 8. Pflichten der Nutzer
Untersagt sind automatisierte Nutzung, Umgehung von Nutzungsgrenzen und Missbrauch der KI-Erstellung.

## 9. Speicherung und Löschung
Lerninhalte werden 12 Monate nach der letzten Anmeldung gelöscht, Konten nach 24 Monaten. Du kannst dein Konto jederzeit löschen.

## 10. Haftung
Wir haften unbeschränkt bei Vorsatz, grober Fahrlässigkeit und Verletzung von Leben, Körper oder Gesundheit; bei einfacher Fahrlässigkeit nur bei Verletzung wesentlicher Vertragspflichten.

## 11. Änderungen der AGB
Änderungen bedürfen deiner Zustimmung bei der nächsten Anmeldung.

## 12. Schlussbestimmungen
Es gilt deutsches Recht. Zwingende Verbraucherschutzvorschriften bleiben unberührt.`;

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Wofür ist Language Master?",
    a: "Um dich ruhig und spielerisch von null bis A1/A2 zu bringen. Das Ziel ist, dass du der App entwächst und liest, was dich interessiert. Wenn du deine nächste Sprache beginnst, komm zurück.",
  },
  {
    q: "Wie entscheiden die Karteikarten, was ich sehe?",
    a: "Ein Scheduler namens FSRS schätzt, wie gut du jedes Wort erinnerst, und zeigt es kurz bevor du es vergessen würdest. In Zeitmodi bestimmt deine Antwortgeschwindigkeit die Note; fühlt sich eine Note falsch an, tippe eine andere.",
  },
  {
    q: "Warum benutzen meine Geschichten meine Wörter?",
    a: "Jeder kennt andere Wörter. Deine Geschichte wird aus den Wörtern gebaut, die du kennst, plus ein paar neuen und denen, die du immer wieder vergisst – damit du sie im Kontext siehst.",
  },
  {
    q: "Was ist die Abdeckung?",
    a: "Der Anteil der Wörter eines Texts, die du schon kennst. Rund 95 % ist der Sweet Spot: leicht genug zum Folgen, mit ein paar Wörtern zum Mitnehmen. Willst du dich in Neues stürzen, schieb den Regler.",
  },
  {
    q: "Wie werden KI-Geschichten gemacht, und was sind sie nicht?",
    a: "Ein Sprachmodell schreibt einen kurzen Text aus deinen Einstellungen; die Grammatiknotizen werden gegen einen Parser geprüft. Die Geschichten sind bewusst funktional: einfach, klar, verständlich. Sie sind Trainingsmaterial, keine Literatur.",
  },
  {
    q: "Reicht das, um die Sprache zu lernen?",
    a: "Nein. Verständliche Geschichten decken nur einen kleinen Teil ab: Tempo, Slang, Humor, Vielfalt. Lies parallel einfache echte Bücher, hör Musik und Podcasts, schau Serien im Original.",
  },
  {
    q: "Was passiert nach A2?",
    a: "Du bist weit gekommen. Ab hier bringen dir echte Gespräche, Bücher, Podcasts und Filme mehr als jede App. Du bist gut vorbereitet.",
  },
  {
    q: "Wie funktioniert die Serie?",
    a: "Du wählst deine Lerntage; nur die zählen. Urlaub pausiert sie, und eine unterbrochene Serie lässt sich innerhalb von 5 verpassten Lerntagen wiederherstellen – ohne Strafe.",
  },
  {
    q: "Was passiert mit meinen Daten?",
    a: "In dieser Version bleibt alles auf deinem Gerät. Später: Listen, Wörter und Geschichten werden 12 Monate nach dem letzten Login gelöscht, das Konto nach 24 Monaten. Du kannst alles jederzeit exportieren oder löschen.",
  },
];
