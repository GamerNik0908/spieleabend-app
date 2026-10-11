# Spieleabend

Quizshow für Jugendliche im Browser. Du startest als **Host** einen Raum, alle anderen treten mit einem
**4-stelligen Code** (oder per QR-Code) vom eigenen Handy bei – mit Namen und Profilfoto. In der
**Kommandozentrale** steuerst du alles und kannst trotzdem **selbst mitspielen**.

## Die Spiele

### 1. Wer ist der Dümmste?
- Reihum bekommt jede Person eine allgemeine Frage (leicht / mittel / schwer). Bei Schätzfragen gibt es
  eine Toleranz (z. B. Eiffelturm 330 m ± 15).
- Man antwortet laut und drückt dann auf dem Handy den **Buzzer**. Alle sehen „Abgegeben“, du siehst in der
  Zentrale die Lösung und klickst **Richtig** oder **Falsch** (Tastatur: `R` / `F`). Danach geht's
  automatisch weiter.
- Jede Person hat pro Runde 2 (einstellbar) Kreise im Profil: grün = richtig, rot = falsch.
  Nur grün = **safe**.
- **Joker**: Wer dran ist, kann die Frage an jemand anderen weitergeben. Für einen selbst zählt sie als
  gelöst, die andere Person bekommt einen zusätzlichen Kreis (grün oder rot).
- Nach der Runde stimmen alle **anonym** ab, wer unter den Nicht-Safen am dümmsten war. Die Fragen und
  ihre Schwierigkeit werden dabei angezeigt. Bei Gleichstand gibt es eine Stichwahl.
- Wer verliert, verliert ein Leben (Standard: 3). Wer keine Leben mehr hat, fliegt. Die letzte Person gewinnt.
- Du kannst alles nachträglich ändern: Kreise umfärben, Leben und Joker anpassen, eine andere Person
  verlieren lassen, Fragen tauschen oder überspringen.

### 2. Quiz-Board
- Board mit Kategorien (Schule, Mathe, Filme & Serien, Gaming, Internet, …) und Feldern von 100 bis 500.
- Reihum wählt eine Person ein Feld (auf dem Handy oder du in der Zentrale) und beantwortet die Frage.
- Richtig: + Punkte. Falsch: − halbe Punkte, dann ist der **Buzzer für alle offen**. Wer zuerst buzzert,
  darf antworten – richtig gibt die Punkte, falsch wieder − die Hälfte.

### 3. Bluff
- Zu einer verrückten, aber wahren Tatsache erfindet jede Person eine glaubwürdige falsche Antwort.
- Danach sehen alle alle Antworten und müssen die echte finden.
- Echte gefunden: +1000. Jede Person, die auf deine Lüge reinfällt: +500.

## Spicy-Modus 🌶️
Schalter in der Zentrale. Färbt alles rot, die Abstimmung heißt „Wer ist der Dümmste?“ und es gibt freche
Kommentare bei falschen Antworten und beim Rausfliegen.

## Selbst mitspielen
In der Zentrale links „Selbst mitspielen?“ – Name eingeben, fertig. Du bekommst ein Profil wie alle anderen
und rechts ein „Dein Handy“-Feld mit Buzzer, Joker, Abstimmung usw. Deine eigene Lösung bleibt verdeckt,
bis du gebuzzert hast. Beim Quiz-Board buzzerst du nicht mit, weil du die Lösung schon gesehen hast.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm start
```

Dann `http://localhost:3000` öffnen und **„Kommandozentrale öffnen“** klicken.

Damit die anderen mitspielen können, müssen alle im **selben WLAN** sein. Die Zentrale zeigt automatisch
die richtige WLAN-Adresse und den QR-Code. Fragt Windows nach der Firewall: **Zulassen** (privates Netzwerk).

Für einen Fernseher/Beamer: in der Zentrale **„Bildschirm öffnen“** und das Fenster dort anzeigen.

## Eigene Fragen

Alle Fragen stehen im Ordner [`content/`](content):

- `duemmste.js` – Fragen mit Schwierigkeit (`d`), Antwort (`a`), optional Toleranz (`tol`) und Einheit (`unit`)
- `board.js` – Kategorien mit je 5 Stufen
- `bluff.js` – Tatsachen mit Lücke `___`
- `roasts.js` – Kommentare (normal und spicy)

## Aufbau

- `server.js` – Express + Socket.IO: Räume, Spieler, Profilbilder, Host-Befehle
- `games/` – ein Modul pro Spiel
- `public/` – Startseite, Handy-Ansicht (`play.html`), Kommandozentrale (`host.html`), Bildschirm (`screen.html`)
- `test/smoke.js` – spielt alle Spiele automatisch durch (`npm test`)
