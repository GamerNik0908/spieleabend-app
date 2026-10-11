# 🎮 Spieleabend

Partyspiele im Browser – vor allem für Jugendliche. Du startest als **Host** einen Raum, alle anderen
treten mit einem **4-stelligen Code** (oder per QR-Code) von ihrem eigenen Handy bei. In der
**Kommandozentrale** steuerst du alles: Spiele starten, weiterschalten, Punkte vergeben, Leute rauswerfen,
Lobby sperren …

## Spiele

| Spiel | Worum geht's |
| --- | --- |
| 🧠 Quiz-Duell | Multiple-Choice-Fragen, schnelle richtige Antworten geben mehr Punkte |
| 🤔 Emoji-Rätsel | Welcher Film steckt hinter den Emojis? |
| 🎯 Schätz mal! | Zahlen schätzen – wer am nächsten dran ist, gewinnt |
| 👀 Wer würde eher…? | Abstimmen, wer aus der Runde am ehesten … |
| ⚖️ Lieber… oder…? | Zwei Optionen, die Mehrheit punktet |
| 🕵️ Wer ist der Spion? | Alle kennen das geheime Wort – außer dem Spion |
| 🔥 Wahrheit oder Pflicht | Zufällige Person, harmlose Fragen & Aufgaben |
| ⚡ Reaktionstest | Bei Grün tippen – wer zu früh tippt, ist raus |

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 18.

```bash
npm install
npm start
```

Dann im Browser `http://localhost:3000` öffnen und auf **„Spieleabend starten“** klicken.

**Wichtig:** Damit die anderen mit ihren Handys mitspielen können, müssen alle im **selben WLAN** sein.
Beim Start zeigt der Server die WLAN-Adresse an (z. B. `http://192.168.0.23:3000`). Die
Kommandozentrale zeigt diese Adresse und den passenden QR-Code automatisch an.

Willst du übers Internet spielen (Freunde nicht im selben WLAN), kannst du die App auf einem Hoster wie
Render, Railway oder Fly.io deployen – es ist eine normale Node-App (`npm start`, Port über `PORT`).

## So läuft ein Abend

1. **Host:** „Spieleabend starten“ → du landest in der Kommandozentrale mit Code und QR-Code.
2. **Optional:** „📺 Bildschirm öffnen“ und das Fenster auf einem Fernseher/Beamer anzeigen. Dort sehen
   alle Fragen, Ergebnisse und die Bestenliste.
3. **Spieler:** Code eingeben (oder QR scannen), Namen und Avatar wählen – fertig.
4. **Host:** Spiel auswählen, Optionen (Anzahl Fragen, Zeit …) einstellen, „Starten“. Mit den großen
   Buttons schaltest du weiter. Punkte sammeln sich über alle Spiele hinweg.

Wer die Seite neu lädt oder kurz die Verbindung verliert, kommt automatisch wieder in den Raum – auch
der Host.

## Eigene Fragen hinzufügen

Alle Inhalte stehen in [`games/content.js`](games/content.js). Einfach neue Zeilen im gleichen Format
ergänzen.

## Aufbau

- `server.js` – Express + Socket.IO, Räume, Spieler, Host-Befehle
- `games/` – ein Modul pro Spiel (Zustand, Eingaben, Ansichten)
- `public/` – Startseite, Spieler-Ansicht (`play.html`), Kommandozentrale (`host.html`), Bildschirm (`screen.html`)
- `test/smoke.js` – spielt alle Spiele mit simulierten Spielern durch (`npm test`)
