/* Gemeinsame Helfer für Spieler, Host und Bildschirm */

const socket = io();
let serverOffset = 0;

const AVATARS = ['😎', '🤠', '👽', '🤖', '🦄', '🐸', '🐼', '🦊', '🐯', '🐙', '🦖', '🐧', '🍕', '🌮', '🔥', '⚡', '👻', '💀', '🎃', '🤡', '🥷', '🧙', '🦸', '🐵'];
const CHOICE_STYLE = [
  { cls: 'c0', icon: '▲' },
  { cls: 'c1', icon: '◆' },
  { cls: 'c2', icon: '●' },
  { cls: 'c3', icon: '■' },
];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function $(sel) {
  return document.querySelector(sel);
}

function syncTime(state) {
  serverOffset = state.now - Date.now();
}

// Ersetzt HTML nur, wenn es sich geändert hat – und behält Eingaben/aufgeklappte Elemente
function setHTML(el, html) {
  if (el._html === html) return;
  const saved = {};
  el.querySelectorAll('input[id]').forEach((i) => (saved[i.id] = { v: i.value, f: document.activeElement === i }));
  const open = new Set([...el.querySelectorAll('details[id][open]')].map((d) => d.id));
  el.innerHTML = html;
  el._html = html;
  for (const [id, s] of Object.entries(saved)) {
    const i = el.querySelector('#' + CSS.escape(id));
    if (i) {
      i.value = s.v;
      if (s.f) i.focus();
    }
  }
  open.forEach((id) => {
    const d = el.querySelector('#' + CSS.escape(id));
    if (d) d.open = true;
  });
  tickTimers();
}

function timerHTML(deadline) {
  return deadline ? `<div class="timer" data-deadline="${deadline}">⏱</div>` : '';
}

function tickTimers() {
  document.querySelectorAll('[data-deadline]').forEach((e) => {
    const left = Math.max(0, Math.ceil((Number(e.dataset.deadline) - (Date.now() + serverOffset)) / 1000));
    const txt = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : String(left);
    e.textContent = '⏱ ' + txt;
    e.classList.toggle('urgent', left <= 5);
  });
}
setInterval(tickTimers, 250);

function fmtNum(n) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

function progressHTML(g, label = 'Frage') {
  return `<div class="progress">${label} ${g.index + 1} / ${g.total}</div>`;
}

function answeredHTML(g) {
  return `<div class="answered">✋ ${g.answered} / ${g.playerCount} haben geantwortet</div>`;
}

function standingsHTML(list, limit = 10, offset = 0) {
  if (!list || !list.length) return '<p class="muted">Noch keine Spieler</p>';
  const medals = ['🥇', '🥈', '🥉'];
  return `<ol class="standings">${list
    .slice(0, limit)
    .map(
      (p, i) =>
        `<li class="${i + offset < 3 ? 'top' : ''}"><span class="rank">${medals[i + offset] || i + offset + 1 + '.'}</span><span class="av">${esc(p.avatar)}</span><span class="nm">${esc(p.name)}</span><span class="sc">${fmtNum(p.score)}</span></li>`
    )
    .join('')}</ol>`;
}

function podiumHTML(list) {
  const top = list.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  return `<div class="final">
    <h2>🏆 Endergebnis</h2>
    <div class="podium">${order
      .map(
        (i) =>
          `<div class="pod p${i + 1}"><div class="av big">${esc(top[i].avatar)}</div><div class="nm">${esc(top[i].name)}</div><div class="sc">${fmtNum(top[i].score)}</div><div class="block">${i + 1}</div></div>`
      )
      .join('')}</div>
    ${list.length > 3 ? standingsHTML(list.slice(3), 10, 3) : ''}
  </div>`;
}

function myPlaceHTML(state) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const i = sorted.findIndex((p) => p.id === state.me?.id);
  return `<div class="card center">
    <h2>🏁 Spiel vorbei!</h2>
    <div class="huge">${i >= 0 ? i + 1 + '.' : '–'}</div>
    <p>Platz von ${sorted.length} mit <b>${fmtNum(state.me?.score || 0)}</b> Punkten</p>
    <p class="muted">Warte, bis der Host das nächste Spiel startet…</p>
  </div>`;
}

function waitingHTML(text, sub = '') {
  return `<div class="card center"><div class="spinner"></div><h2>${text}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`;
}

function gainHTML(pts) {
  return pts > 0 ? `<div class="gain">+${fmtNum(pts)}</div>` : '';
}

// ---------------------------------------------------------------------------
// Bühne (Host-Vorschau und großer Bildschirm)

const Stage = {
  quiz(g) {
    if (g.phase === 'end') return podiumHTML(g.standings);
    const reveal = g.phase === 'reveal';
    const max = Math.max(1, ...(g.counts || [1]));
    return `
      <div class="stage-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
      <div class="question ${g.bigQuestion ? 'emoji-q' : ''}">${esc(g.question)}</div>
      <div class="choices">${g.choices
        .map((c, i) => {
          const st = CHOICE_STYLE[i];
          const cls = reveal ? (i === g.correct ? 'correct' : 'wrong') : '';
          const bar = reveal ? `<span class="count">${g.counts[i]}</span><span class="bar" style="width:${(g.counts[i] / max) * 100}%"></span>` : '';
          return `<div class="choice ${st.cls} ${cls}"><span class="icon">${st.icon}</span><span class="txt">${esc(c)}</span>${bar}</div>`;
        })
        .join('')}</div>
      ${
        reveal
          ? `<div class="gains">${(g.gains || []).slice(0, 6).map((x) => `<span class="chip">${esc(x.avatar)} ${esc(x.name)} <b>+${x.pts}</b></span>`).join('') || '<span class="muted">Niemand lag richtig 😬</span>'}</div>`
          : answeredHTML(g)
      }`;
  },

  schaetzen(g) {
    if (g.phase === 'end') return podiumHTML(g.standings);
    let body;
    if (g.phase === 'question') {
      body = `<div class="unit-hint">Antwort in: <b>${esc(g.unit || 'Zahl')}</b></div>${answeredHTML(g)}`;
    } else {
      body = `<div class="solution">${fmtNum(g.correct)} ${esc(g.unit)}</div>
        <ol class="ranking">${g.ranking
          .map((r) => `<li><span class="rank">${r.rank}.</span><span class="av">${esc(r.avatar)}</span><span class="nm">${esc(r.name)}</span><span class="val">${fmtNum(r.value)}</span><span class="pts">${r.pts ? '+' + r.pts : ''}</span></li>`)
          .join('') || '<li class="muted">Keine Tipps abgegeben</li>'}</ol>`;
    }
    return `<div class="stage-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
      <div class="question">${esc(g.question)}</div>${body}`;
  },

  eher(g) {
    if (g.phase === 'end') return podiumHTML(g.standings);
    let body;
    if (g.phase === 'vote') body = answeredHTML(g);
    else {
      const max = Math.max(1, ...g.results.map((r) => r.count));
      body = `<div class="bars">${g.results
        .map(
          (r) =>
            `<div class="barrow ${g.winners.includes(r.id) ? 'win' : ''}"><span class="av">${esc(r.avatar)}</span><span class="nm">${esc(r.name)}</span><span class="track"><span class="fill" style="width:${(r.count / max) * 100}%"></span></span><span class="cnt">${r.count}</span></div>`
        )
        .join('') || '<p class="muted">Keine Stimmen</p>'}</div>`;
    }
    return `<div class="stage-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
      <div class="question">${esc(g.question)}</div>${body}`;
  },

  lieber(g) {
    if (g.phase === 'end') return podiumHTML(g.standings);
    const reveal = g.phase === 'reveal';
    const total = reveal ? g.counts[0] + g.counts[1] : 0;
    const side = (i) => {
      const pct = total ? Math.round((g.counts[i] / total) * 100) : 0;
      return `<div class="side s${i} ${reveal && g.counts[i] > g.counts[1 - i] ? 'win' : ''}">
        <div class="opt">${esc(g.options[i])}</div>
        ${reveal ? `<div class="pct">${pct}%</div><div class="voters">${g.voters[i].map(esc).join(' ')}</div>` : ''}
      </div>`;
    };
    return `<div class="stage-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
      <div class="question small">Was wärst du lieber?</div>
      <div class="versus">${side(0)}<div class="vs">ODER</div>${side(1)}</div>
      ${reveal ? '' : answeredHTML(g)}`;
  },

  spion(g, opts = {}) {
    if (g.phase === 'end') return podiumHTML(g.standings);
    const head = `<div class="stage-head"><div class="progress">Runde ${g.round} / ${g.rounds}</div>${timerHTML(g.deadline)}</div>`;
    const secret =
      opts.host && g.secret
        ? `<details class="secret" id="spy-secret"><summary>🤫 Lösung anzeigen (nur für dich)</summary>Wort: <b>${esc(g.secret.word)}</b> · Spion: <b>${g.secret.spies.map(esc).join(', ')}</b></details>`
        : '';
    if (g.phase === 'roles')
      return `${head}<div class="big-emoji">🕵️</div><div class="question">Kategorie: ${esc(g.category)}</div>
        <p class="lead">Schaut heimlich auf euer Handy! ${g.spyCount > 1 ? `Es gibt <b>${g.spyCount}</b> Spione.` : 'Einer von euch ist der Spion…'}</p>${secret}`;
    if (g.phase === 'discuss')
      return `${head}<div class="question">💬 Fragerunde</div>
        <p class="lead"><b>${esc(g.starter)}</b> fängt an und stellt jemandem eine Frage zum geheimen Wort. Wer gefragt wurde, fragt als Nächstes.</p>
        <p class="muted">Kategorie: ${esc(g.category)}</p>${secret}`;
    if (g.phase === 'vote') return `${head}<div class="question">🗳️ Wer ist der Spion?</div><p class="lead">Stimmt auf euren Handys ab!</p>${answeredHTML(g)}${secret}`;
    return `${head}
      <div class="reveal-banner ${g.caught ? 'good' : 'bad'}">${g.caught ? '🎉 Spion enttarnt!' : '😈 Der Spion ist entkommen!'}</div>
      <div class="spy-list">${g.spies.map((s) => `<div class="spy"><span class="av big">${esc(s.avatar)}</span><span>${esc(s.name)}</span></div>`).join('')}</div>
      <p class="lead">Das geheime Wort war: <b>${esc(g.word)}</b></p>
      <div class="gains">${g.results.map((r) => `<span class="chip ${r.spy ? 'hot' : ''}">${esc(r.avatar)} ${esc(r.name)}: ${r.count} 🗳️</span>`).join('')}</div>`;
  },

  wop(g) {
    const log = g.log.length
      ? `<div class="log">${g.log.map((l) => `<span class="chip">${l.ok ? '✅' : '❌'} ${esc(l.name)} · ${l.type === 'truth' ? 'Wahrheit' : 'Pflicht'}</span>`).join('')}</div>`
      : '';
    if (g.phase === 'idle')
      return `<div class="big-emoji">🎰</div><div class="question">Wer ist als Nächstes dran?</div>${log}<h3>Bestenliste</h3>${standingsHTML(g.standings, 5)}`;
    const who = `<div class="who"><span class="av huge-av">${esc(g.current?.avatar)}</span><div class="nm">${esc(g.current?.name)}</div></div>`;
    if (g.phase === 'choose') return `${who}<div class="question">Wahrheit 💬 oder Pflicht ⚡?</div>`;
    return `${who}<div class="badge ${g.type}">${g.type === 'truth' ? '💬 WAHRHEIT' : '⚡ PFLICHT'}</div><div class="question">${esc(g.text)}</div>`;
  },

  reaktion(g) {
    if (g.phase === 'end') return podiumHTML(g.standings);
    const head = `<div class="stage-head"><div class="progress">Runde ${Math.max(1, g.round)} / ${g.rounds}</div></div>`;
    if (g.phase === 'ready')
      return `${head}<div class="big-emoji">⚡</div><div class="question">Reaktionstest</div><p class="lead">Wenn der Bildschirm <b class="txt-green">GRÜN</b> wird, so schnell wie möglich tippen. Wer zu früh tippt, ist raus!</p>`;
    if (g.phase === 'wait') return `${head}<div class="signal red">Wartet…</div>${answeredHTML(g)}`;
    if (g.phase === 'go') return `${head}<div class="signal green">JETZT!</div>${answeredHTML(g)}`;
    return `${head}<div class="question">Ergebnis</div>
      <ol class="ranking">${g.ranking.map((r, i) => `<li><span class="rank">${i + 1}.</span><span class="av">${esc(r.avatar)}</span><span class="nm">${esc(r.name)}</span><span class="val">${r.ms} ms</span><span class="pts">${r.pts ? '+' + r.pts : ''}</span></li>`).join('') || '<li class="muted">Keiner war schnell genug</li>'}</ol>
      ${g.fouls.length ? `<p class="muted">🚫 Zu früh: ${g.fouls.map(esc).join(', ')}</p>` : ''}`;
  },
};
Stage.emoji = Stage.quiz;

function renderStage(state, opts = {}) {
  if (!state.game) return '';
  const fn = Stage[state.gameId];
  return `<div class="stage game-${state.gameId}">${fn ? fn(state.game, opts) : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Spieler-Ansicht

let reactGo = { round: -1, at: 0 };

const Player = {
  quiz(g, state) {
    if (g.phase === 'end') return myPlaceHTML(state);
    if (g.phase === 'question') {
      if (g.myChoice !== null) return waitingHTML('Antwort eingeloggt ✅', 'Warte auf die anderen…');
      return `<div class="p-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
        <div class="p-question ${g.bigQuestion ? 'emoji-q' : ''}">${esc(g.question)}</div>
        <div class="p-choices">${g.choices
          .map((c, i) => `<button class="choice-btn ${CHOICE_STYLE[i].cls}" data-input='${JSON.stringify({ choice: i })}'><span class="icon">${CHOICE_STYLE[i].icon}</span>${esc(c)}</button>`)
          .join('')}</div>`;
    }
    const right = g.myChoice === g.correct;
    return `<div class="card center ${right ? 'good' : 'bad'}">
      <div class="huge">${right ? '✅' : g.myChoice === null ? '⌛' : '❌'}</div>
      <h2>${right ? 'Richtig!' : g.myChoice === null ? 'Zu langsam!' : 'Leider falsch'}</h2>
      ${gainHTML(g.myGain)}
      <p>Richtige Antwort: <b>${esc(g.choices[g.correct])}</b></p>
    </div>`;
  },

  schaetzen(g, state) {
    if (g.phase === 'end') return myPlaceHTML(state);
    if (g.phase === 'question') {
      if (g.myAnswer !== null) return waitingHTML(`Dein Tipp: ${fmtNum(g.myAnswer)} ${esc(g.unit)}`, 'Warte auf die anderen…');
      return `<div class="p-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
        <div class="p-question">${esc(g.question)}</div>
        <form class="estimate" data-form="value">
          <input id="estimate-input" type="text" inputmode="decimal" autocomplete="off" placeholder="Deine Schätzung" required>
          <span class="unit">${esc(g.unit)}</span>
          <button class="btn primary big" type="submit">Tipp abgeben</button>
        </form>`;
    }
    return `<div class="card center">
      <p>Richtige Antwort</p><div class="huge">${fmtNum(g.correct)} <small>${esc(g.unit)}</small></div>
      ${g.myAnswer !== null ? `<p>Dein Tipp: <b>${fmtNum(g.myAnswer)}</b> → Platz ${g.myRank}</p>` : '<p class="muted">Du hast nicht getippt</p>'}
      ${gainHTML(g.myGain)}
    </div>`;
  },

  eher(g, state) {
    if (g.phase === 'end') return myPlaceHTML(state);
    if (g.phase === 'vote') {
      if (g.myVote) {
        const t = g.candidates.find((c) => c.id === g.myVote);
        return waitingHTML(`Du hast für ${esc(t?.name || '?')} gestimmt`, 'Warte auf die anderen…');
      }
      return `<div class="p-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
        <div class="p-question">${esc(g.question)}</div>
        <div class="p-grid">${g.candidates.map((c) => `<button class="person-btn" data-input='${JSON.stringify({ target: c.id })}'><span class="av">${esc(c.avatar)}</span>${esc(c.name)}</button>`).join('')}</div>`;
    }
    const winners = g.results.filter((r) => g.winners.includes(r.id));
    const withMajority = g.myVote && g.winners.includes(g.myVote);
    return `<div class="card center">
      <p>${esc(g.question)}</p>
      <div class="huge">${winners.map((w) => esc(w.avatar)).join(' ') || '🤷'}</div>
      <h2>${winners.map((w) => esc(w.name)).join(' & ') || 'Keiner'}</h2>
      ${withMajority ? '<p>Du lagst mit der Mehrheit! </p>' + gainHTML(200) : ''}
    </div>`;
  },

  lieber(g, state) {
    if (g.phase === 'end') return myPlaceHTML(state);
    if (g.phase === 'vote') {
      if (g.myChoice !== null) return waitingHTML(`Du wählst: ${esc(g.options[g.myChoice])}`, 'Warte auf die anderen…');
      return `<div class="p-head">${progressHTML(g)}${timerHTML(g.deadline)}</div>
        <div class="p-question small">Was wärst du lieber?</div>
        <div class="p-versus">
          <button class="side-btn s0" data-input='{"choice":0}'>${esc(g.options[0])}</button>
          <div class="vs">ODER</div>
          <button class="side-btn s1" data-input='{"choice":1}'>${esc(g.options[1])}</button>
        </div>`;
    }
    const total = g.counts[0] + g.counts[1];
    const mine = g.myChoice;
    const majority = g.counts[0] === g.counts[1] ? null : g.counts[0] > g.counts[1] ? 0 : 1;
    return `<div class="card center">
      ${[0, 1].map((i) => `<p class="${mine === i ? 'mine' : ''}">${esc(g.options[i])}: <b>${total ? Math.round((g.counts[i] / total) * 100) : 0}%</b></p>`).join('')}
      ${mine === null ? '<p class="muted">Du hast nicht abgestimmt</p>' : majority === null ? '<h2>Unentschieden! 🤝</h2>' : mine === majority ? '<h2>Du bist bei der Mehrheit 👥</h2>' + gainHTML(100) : '<h2>Du bist ein Unikat 🦄</h2>'}
    </div>`;
  },

  spion(g, state) {
    if (g.phase === 'end') return myPlaceHTML(state);
    if (!g.inRound && g.phase !== 'reveal') return waitingHTML('Du steigst nächste Runde ein', 'Diese Runde läuft schon.');
    const card = g.isSpy
      ? `<div class="role spy-role"><div class="huge">🕵️</div><h2>Du bist der SPION!</h2><p>Kategorie: <b>${esc(g.category)}</b></p><p class="muted">Finde das geheime Wort heraus, ohne aufzufliegen. Bluffe!</p></div>`
      : `<div class="role"><p>Das geheime Wort ist</p><div class="word">${esc(g.word)}</div><p class="muted">Kategorie: ${esc(g.category)} · Verrate es nicht zu deutlich!</p></div>`;
    const roleCard = `<details class="rolecard" id="rolecard"><summary>👆 Tippen, um deine Rolle zu sehen</summary>${card}</details>`;
    if (g.phase === 'roles') return `<div class="p-head"><div class="progress">Runde ${g.round} / ${g.rounds}</div></div>${roleCard}<p class="muted center">Halte dein Handy so, dass niemand mitguckt 👀</p>`;
    if (g.phase === 'discuss')
      return `<div class="p-head"><div class="progress">Fragerunde</div>${timerHTML(g.deadline)}</div>${roleCard}<p class="center"><b>${esc(g.starter)}</b> beginnt mit der ersten Frage.</p>`;
    if (g.phase === 'vote') {
      if (g.myVote) {
        const t = g.candidates.find((c) => c.id === g.myVote);
        return waitingHTML(`Du verdächtigst ${esc(t?.name || '?')}`, 'Warte auf die anderen…');
      }
      return `<div class="p-question">Wer ist der Spion?</div>
        <div class="p-grid">${g.candidates
          .filter((c) => c.id !== state.me?.id)
          .map((c) => `<button class="person-btn" data-input='${JSON.stringify({ target: c.id })}'><span class="av">${esc(c.avatar)}</span>${esc(c.name)}</button>`)
          .join('')}</div>`;
    }
    const won = g.isSpy ? !g.caught : g.caught;
    return `<div class="card center ${won ? 'good' : 'bad'}">
      <div class="huge">${won ? '🎉' : '😵'}</div>
      <h2>${g.caught ? 'Spion enttarnt!' : 'Der Spion ist entkommen!'}</h2>
      <p>Spion: <b>${g.spies.map((s) => esc(s.avatar + ' ' + s.name)).join(', ')}</b></p>
      <p>Wort: <b>${esc(g.word)}</b></p>
      ${g.inRound ? gainHTML(won ? (g.isSpy ? 600 : 300) : 0) : ''}
    </div>`;
  },

  wop(g) {
    if (g.phase === 'idle') return waitingHTML('Gleich wird ausgelost… 🎰', 'Wer ist wohl als Nächstes dran?');
    if (g.phase === 'choose') {
      if (g.isMe)
        return `<div class="card center"><div class="huge">😱</div><h2>Du bist dran!</h2><p>Was nimmst du?</p></div>
          <div class="p-versus">
            <button class="side-btn truth" data-input='{"type":"truth"}'>💬 Wahrheit</button>
            <button class="side-btn dare" data-input='{"type":"dare"}'>⚡ Pflicht</button>
          </div>`;
      return `<div class="card center"><div class="huge">${esc(g.current?.avatar)}</div><h2>${esc(g.current?.name)} ist dran!</h2><p class="muted">Wahrheit oder Pflicht?</p></div>`;
    }
    return `<div class="card center">
      ${g.isMe ? '<h2>Deine Aufgabe:</h2>' : `<p>${esc(g.current?.avatar)} <b>${esc(g.current?.name)}</b> muss:</p>`}
      <div class="badge ${g.type}">${g.type === 'truth' ? '💬 WAHRHEIT' : '⚡ PFLICHT'}</div>
      <div class="p-question">${esc(g.text)}</div>
    </div>`;
  },

  reaktion(g, state) {
    if (g.phase === 'end') return myPlaceHTML(state);
    if (g.phase === 'ready') return waitingHTML('Mach dich bereit ⚡', 'Wenn dein Bildschirm grün wird: sofort tippen!');
    if (g.phase === 'reveal') {
      const m = g.mine;
      return `<div class="card center">
        ${m?.foul ? '<div class="huge">🚫</div><h2>Zu früh getippt!</h2>' : m ? `<div class="huge">${m.ms} ms</div><h2>Platz ${g.myRank}</h2>${gainHTML(g.myGain)}` : '<div class="huge">😴</div><h2>Verpennt!</h2>'}
      </div>`;
    }
    if (g.mine) return g.mine.foul ? `<div class="tap red"><div>🚫 Zu früh!</div></div>` : waitingHTML(`${g.mine.ms} ms`, 'Warte auf die anderen…');
    if (g.phase === 'wait') return `<button class="tap red" data-tap="1"><div>Warte auf Grün…</div></button>`;
    if (reactGo.round !== g.round) reactGo = { round: g.round, at: performance.now() };
    return `<button class="tap green" data-tap="1"><div>TIPP!</div></button>`;
  },
};
Player.emoji = Player.quiz;

function renderPlayer(state) {
  const fn = Player[state.gameId];
  return fn ? fn(state.game, state) : '';
}

function bindPlayerInputs(container) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-input]');
    if (!b) return;
    b.classList.add('pressed');
    socket.emit('player:input', JSON.parse(b.dataset.input));
    if (navigator.vibrate) navigator.vibrate(30);
  });
  container.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-tap]');
    if (!b) return;
    e.preventDefault();
    const ms = Math.round(performance.now() - reactGo.at);
    socket.emit('player:input', { ms });
    if (navigator.vibrate) navigator.vibrate(40);
  });
  container.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const input = f.querySelector('input');
    const value = input.value.trim();
    if (!value) return;
    socket.emit('player:input', { [f.dataset.form]: value });
    input.value = '';
  });
}
