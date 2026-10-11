// Kommentare zu Spielereignissen. {name} wird ersetzt.
// „spicy“ wird benutzt, wenn der Host den Spicy-Modus einschaltet.

module.exports = {
  right: {
    mild: ['Sauber, {name}!', 'Korrekt.', '{name} weiß Bescheid.', 'Richtig – stark.', 'Punkt für {name}.'],
    spicy: [
      '{name} hat heute tatsächlich mitgedacht.',
      'Okay {name}, das war wohl Glück.',
      'Wer hätte das gedacht – {name} kann was.',
      'Sogar {name} wusste das.',
      'Nicht schlecht für jemanden wie {name}.',
      'Blindes Huhn, Korn, {name}. Du kennst das.',
    ],
  },
  wrong: {
    mild: ['Leider falsch.', 'Knapp daneben ist auch vorbei.', 'Das war nix, {name}.', 'Nope.', 'Autsch.'],
    spicy: [
      '{name}, bitte Gehirn neu starten.',
      'Bro hat beim Denken Lag.',
      '{name}.exe funktioniert nicht mehr.',
      'Das war so falsch, dass es schon wieder Kunst ist.',
      'Sogar Google hat sich gerade geschämt.',
      '{name} hat die Frage gehört und einfach irgendwas gesagt.',
      'Selbstbewusst falsch – ganz stark, {name}.',
      'Ich glaube, {name} braucht WLAN fürs Hirn.',
      'Das Bildungssystem hat bei {name} komplett versagt.',
      'Schule geschwänzt, {name}?',
    ],
  },
  lifeLost: {
    mild: ['{name} verliert ein Leben.', 'Ein Leben weniger für {name}.', 'Das kostet {name} ein Leben.'],
    spicy: [
      'Die Gruppe hat entschieden: {name} ist heute der Dümmste.',
      '{name} wurde offiziell zum Dummkopf der Runde gewählt.',
      'Demokratie hat gesprochen. {name}, das tut weh.',
      '{name}, deine Freunde halten dich für dumm. Schriftlich.',
      'Glückwunsch {name}, du bist die schwächste Leuchte im Raum.',
    ],
  },
  out: {
    mild: ['{name} ist raus.', 'Das war’s für {name}.', 'Keine Leben mehr – {name} scheidet aus.'],
    spicy: [
      '{name} fliegt raus. Tschüss, Genie.',
      'Game over, {name}. Vielleicht mal ein Buch lesen?',
      '{name} hat alle Leben verbraten. Respekt vor so viel Ahnungslosigkeit.',
      'Und {name} verlässt die Show – bitte Gehirn am Ausgang abholen.',
    ],
  },
  bluffKing: {
    mild: ['{name} hat die meisten reingelegt.', 'Starker Bluff von {name}.', '{name} lügt richtig gut.'],
    spicy: [
      '{name} lügt so gut, dass man sich Sorgen machen sollte.',
      'Traut {name} nie wieder irgendwas.',
      '{name} hat euch alle verarscht.',
      'Pathologischer Lügner-Award geht an {name}.',
    ],
  },
};
