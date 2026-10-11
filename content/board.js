// Kategorien für das Quiz-Board. Pro Kategorie 5 Stufen (100–500), pro Stufe mehrere Fragen –
// beim Spielstart wird pro Feld zufällig eine gezogen.

module.exports = [
  {
    name: 'Schule',
    levels: [
      [
        { q: 'Welches Schulfach beschäftigt sich mit Lebewesen?', a: 'Biologie' },
        { q: 'Wie nennt man Wörter für Dinge, z. B. „Tisch“?', a: 'Nomen / Substantive' },
      ],
      [
        { q: 'Wie heißt die kleinste Einheit des Lebens?', a: 'Die Zelle' },
        { q: 'Wie heißt der Vorgang, bei dem Pflanzen aus Licht Energie gewinnen?', a: 'Photosynthese' },
      ],
      [
        { q: 'In welchem Jahr endete der Zweite Weltkrieg in Europa?', a: '1945' },
        { q: 'Wer war der erste Bundeskanzler der Bundesrepublik?', a: 'Konrad Adenauer' },
      ],
      [
        { q: 'Wer schrieb „Die Verwandlung“?', a: 'Franz Kafka' },
        { q: 'Wie heißt das Gesetz U = R · I?', a: 'Ohmsches Gesetz' },
      ],
      [
        { q: 'Was bedeutet „Carpe diem“?', a: 'Nutze den Tag' },
        { q: 'Wie lautet die chemische Formel von Schwefelsäure?', a: 'H₂SO₄' },
      ],
    ],
  },
  {
    name: 'Mathe',
    levels: [
      [
        { q: 'Was ist 8 × 6?', a: '48' },
        { q: 'Was ist 9 × 7?', a: '63' },
      ],
      [
        { q: 'Was ist die Wurzel aus 81?', a: '9' },
        { q: 'Wie viel sind 25 % von 80?', a: '20' },
      ],
      [
        { q: 'Wie groß ist die Winkelsumme im Viereck?', a: '360°' },
        { q: 'Was ist 3 hoch 4?', a: '81' },
      ],
      [
        { q: 'Was ist 13 × 17?', a: '221' },
        { q: 'Was ist 15²?', a: '225' },
      ],
      [
        { q: 'Welche Primzahl kommt nach 89?', a: '97' },
        { q: 'Wie viele Diagonalen hat ein Sechseck?', a: '9' },
      ],
    ],
  },
  {
    name: 'Filme & Serien',
    levels: [
      [
        { q: 'Welcher Superheld wurde von einer radioaktiven Spinne gebissen?', a: 'Spider-Man' },
        { q: 'Wie heißt der Schneemann aus „Die Eiskönigin“?', a: 'Olaf' },
      ],
      [
        { q: 'In welcher Kleinstadt spielt „Stranger Things“?', a: 'Hawkins' },
        { q: 'Wie heißt Barbies Freund?', a: 'Ken' },
      ],
      [
        { q: 'Welcher Bösewicht schnippt in „Avengers“ mit den Infinity-Steinen?', a: 'Thanos' },
        { q: 'Wie heißt die Schule in der Serie „Wednesday“?', a: 'Nevermore Academy' },
      ],
      [
        { q: 'Welche Serie handelt von einem tödlichen Wettbewerb mit Kinderspielen in Südkorea?', a: 'Squid Game' },
        { q: 'Wer spielte Jack in „Titanic“?', a: 'Leonardo DiCaprio' },
      ],
      [
        { q: 'Welcher Film gewann 2024 den Oscar als bester Film?', a: 'Oppenheimer' },
        { q: 'Wer führte Regie bei „Inception“ und „Oppenheimer“?', a: 'Christopher Nolan' },
      ],
    ],
  },
  {
    name: 'Musik',
    levels: [
      [
        { q: 'Welche Sängerin war mit der „Eras Tour“ unterwegs?', a: 'Taylor Swift' },
        { q: 'Wie viele Saiten hat eine normale Gitarre?', a: '6' },
      ],
      [
        { q: 'Aus welchem Land kommt die Band BTS?', a: 'Südkorea' },
        { q: 'Wer singt „Blinding Lights“?', a: 'The Weeknd' },
      ],
      [
        { q: 'Wer singt „Shape of You“?', a: 'Ed Sheeran' },
        { q: 'Welche Band hat „Bohemian Rhapsody“ gemacht?', a: 'Queen' },
      ],
      [
        { q: 'Aus welcher Stadt kommen die Beatles?', a: 'Liverpool' },
        { q: 'Aus wie vielen Linien besteht ein Notensystem?', a: '5' },
      ],
      [
        { q: 'Wer komponierte „Für Elise“?', a: 'Ludwig van Beethoven' },
        { q: 'Welcher Musiker wurde „King of Pop“ genannt – und wie hieß sein meistverkauftes Album?', a: 'Michael Jackson – Thriller' },
      ],
    ],
  },
  {
    name: 'Gaming',
    levels: [
      [
        { q: 'Wie heißt der Klempner von Nintendo?', a: 'Mario' },
        { q: 'In welchem Spiel baut man mit Blöcken und kämpft gegen Creeper?', a: 'Minecraft' },
      ],
      [
        { q: 'Wie heißt die Prinzessin, die Mario immer rettet?', a: 'Peach' },
        { q: 'Wie heißt der Battle-Royale-Shooter von Epic Games?', a: 'Fortnite' },
      ],
      [
        { q: 'Wie heißt Links Pferd in „Zelda“?', a: 'Epona' },
        { q: 'In welcher fiktiven Stadt spielt GTA V?', a: 'Los Santos' },
      ],
      [
        { q: 'Welche Farbe hat der Pac-Man-Geist Blinky?', a: 'Rot' },
        { q: 'Wie heißt das Feuer-Starter-Pokémon der ersten Generation?', a: 'Glumanda' },
      ],
      [
        { q: 'Welches ist das meistverkaufte Videospiel aller Zeiten?', a: 'Minecraft' },
        { q: 'In welchem Jahr kam die erste PlayStation in Japan heraus?', a: '1994' },
      ],
    ],
  },
  {
    name: 'Sport',
    levels: [
      [
        { q: 'Wie viele Spieler einer Mannschaft stehen beim Fußball auf dem Platz?', a: '11' },
        { q: 'In welcher Sportart gibt es den „Slam Dunk“?', a: 'Basketball' },
      ],
      [
        { q: 'Wie oft wurden die deutschen Männer Fußball-Weltmeister?', a: '4-mal' },
        { q: 'Wie viele Ringe hat das olympische Symbol?', a: '5' },
      ],
      [
        { q: 'Wer gewann die Fußball-WM 2022?', a: 'Argentinien' },
        { q: 'Wie lang ist ein Marathon?', a: '42,195 km' },
      ],
      [
        { q: 'In welcher Sportart steht „Love“ für null Punkte?', a: 'Tennis' },
        { q: 'Welcher Fahrer hat wie Michael Schumacher 7 Formel-1-Titel?', a: 'Lewis Hamilton' },
      ],
      [
        { q: 'In welcher Stadt finden die Olympischen Sommerspiele 2028 statt?', a: 'Los Angeles' },
        { q: 'Wie viele Punkte ist ein Touchdown im American Football wert?', a: '6' },
      ],
    ],
  },
  {
    name: 'Internet',
    levels: [
      [
        { q: 'Welche App ist für die „For You Page“ bekannt?', a: 'TikTok' },
        { q: 'Welche Plattform hat einen roten Play-Button als Logo?', a: 'YouTube' },
      ],
      [
        { q: 'Welche Streaming-Plattform mit lila Logo ist vor allem für Gaming bekannt?', a: 'Twitch' },
        { q: 'Wofür steht „LOL“?', a: 'Laughing out loud' },
      ],
      [
        { q: 'Welchem Konzern gehören Instagram und WhatsApp?', a: 'Meta' },
        { q: 'Wie hieß X früher?', a: 'Twitter' },
      ],
      [
        { q: 'Welcher YouTuber hat die meisten Abonnenten der Welt?', a: 'MrBeast' },
        { q: 'Wofür steht „FOMO“?', a: 'Fear of missing out' },
      ],
      [
        { q: 'In welchem Jahr wurde Facebook gegründet?', a: '2004' },
        { q: 'Wofür steht „GIF“?', a: 'Graphics Interchange Format' },
      ],
    ],
  },
  {
    name: 'Geografie',
    levels: [
      [
        { q: 'Wie heißt die Hauptstadt von Frankreich?', a: 'Paris' },
        { q: 'Auf welchem Kontinent liegt Ägypten?', a: 'Afrika' },
      ],
      [
        { q: 'Welcher Fluss fließt durch Wien?', a: 'Donau' },
        { q: 'Wie heißt die Hauptstadt von Portugal?', a: 'Lissabon' },
      ],
      [
        { q: 'Welches ist flächenmäßig das größte Land der Welt?', a: 'Russland' },
        { q: 'Wie heißt die Hauptstadt von Kanada?', a: 'Ottawa' },
      ],
      [
        { q: 'Wie heißt die Hauptstadt der Türkei?', a: 'Ankara' },
        { q: 'Wie heißt die Hauptstadt von Australien?', a: 'Canberra' },
      ],
      [
        { q: 'Wie heißt die Hauptstadt von Kasachstan?', a: 'Astana' },
        { q: 'Wie heißt der tiefste See der Welt?', a: 'Baikalsee' },
      ],
    ],
  },
  {
    name: 'Tiere',
    levels: [
      [
        { q: 'Welches ist das größte Tier der Welt?', a: 'Blauwal' },
        { q: 'Wie viele Beine hat eine Spinne?', a: '8' },
      ],
      [
        { q: 'Welches Säugetier kann richtig fliegen?', a: 'Fledermaus' },
        { q: 'Wie nennt man ein Känguru-Baby?', a: 'Joey' },
      ],
      [
        { q: 'Wie viele Herzen hat ein Oktopus?', a: '3' },
        { q: 'Welcher Vogel kann rückwärts fliegen?', a: 'Kolibri' },
      ],
      [
        { q: 'Welches ist das größte Landraubtier der Welt?', a: 'Eisbär' },
        { q: 'Wie lange ist eine Elefantenkuh ungefähr trächtig?', a: 'Etwa 22 Monate' },
      ],
      [
        { q: 'Welches Tier hat den höchsten Blutdruck?', a: 'Giraffe' },
        { q: 'Wie viele Magenabschnitte hat eine Kuh?', a: '4' },
      ],
    ],
  },
  {
    name: 'Essen',
    levels: [
      [
        { q: 'Aus welchem Land kommt Sushi?', a: 'Japan' },
        { q: 'Was ist die Hauptzutat von Guacamole?', a: 'Avocado' },
      ],
      [
        { q: 'Aus welcher Bohne wird Schokolade gemacht?', a: 'Kakao' },
        { q: 'In welcher deutschen Stadt wurde der Döner im Brot populär?', a: 'Berlin' },
      ],
      [
        { q: 'Woraus wird Tofu hergestellt?', a: 'Sojabohnen' },
        { q: 'Aus welchem Land kommt die Paella?', a: 'Spanien' },
      ],
      [
        { q: 'Welches Gewürz ist das teuerste der Welt?', a: 'Safran' },
        { q: 'Was ist Wasabi?', a: 'Japanischer Meerrettich' },
      ],
      [
        { q: 'Was ist botanisch gesehen eine Beere: Banane oder Erdbeere?', a: 'Banane' },
        { q: 'Welches Land isst pro Kopf die meiste Schokolade?', a: 'Schweiz' },
      ],
    ],
  },
];
