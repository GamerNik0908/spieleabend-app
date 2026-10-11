const content = require('./content');
const makeQuiz = require('./quiz');

const modules = [
  makeQuiz({
    id: 'quiz',
    name: 'Quiz-Duell',
    emoji: '🧠',
    desc: 'Multiple-Choice-Fragen. Wer schneller richtig antwortet, kriegt mehr Punkte.',
    questions: content.quiz,
  }),
  makeQuiz({
    id: 'emoji',
    name: 'Emoji-Rätsel',
    emoji: '🤔',
    desc: 'Welcher Film, Song oder Begriff versteckt sich hinter den Emojis?',
    questions: content.emoji,
    bigQuestion: true,
  }),
  require('./schaetzen'),
  require('./eher'),
  require('./lieber'),
  require('./spion'),
  require('./wop'),
  require('./reaktion'),
];

const byId = new Map(modules.map((m) => [m.id, m]));

function list() {
  return modules.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    desc: m.desc,
    minPlayers: m.minPlayers,
    options: m.options || [],
  }));
}

function resolveOptions(mod, given = {}) {
  const opts = {};
  for (const o of mod.options || []) {
    let v = Number(given[o.key]);
    if (!Number.isFinite(v)) v = o.default;
    opts[o.key] = Math.max(o.min, Math.min(o.max, Math.round(v)));
  }
  return opts;
}

module.exports = { list, get: (id) => byId.get(id), resolveOptions };
