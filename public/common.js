/* Gemeinsame Helfer und Ansichten für Spieler, Host und Bildschirm */

const socket = io();
let serverOffset = 0;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 });
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
const attr = (obj) => esc(JSON.stringify(obj));

function syncTime(state) {
  serverOffset = state.now - Date.now();
  document.body.classList.toggle('spicy', !!state.spicy);
}

// Ersetzt HTML nur bei Änderungen und behält Eingaben, Fokus und aufgeklappte Elemente
function setHTML(el, html) {
  if (!el || el._html === html) return;
  const saved = {};
  el.querySelectorAll('input[id]:not([type=file]), textarea[id]').forEach((i) => (saved[i.id] = { v: i.value, f: document.activeElement === i }));
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
  return deadline ? `<span class="timer" data-deadline="${deadline}"></span>` : '';
}
function tickTimers() {
  document.querySelectorAll('[data-deadline]').forEach((e) => {
    const left = Math.max(0, Math.ceil((Number(e.dataset.deadline) - (Date.now() + serverOffset)) / 1000));
    e.textContent = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `0:${String(left).padStart(2, '0')}`;
    e.classList.toggle('urgent', left <= 5);
  });
}
setInterval(tickTimers, 250);

// ---------------------------------------------------------------------------
// Spieler & Avatare

function playerMap(state) {
  const m = {};
  for (const p of state.players) m[p.id] = p;
  return m;
}
function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
function av(p, size = 40) {
  if (!p) return `<span class="av" style="--s:${size}px">?</span>`;
  const inner = p.photo ? `<img src="${esc(p.photo)}" alt="">` : esc(initials(p.name));
  return `<span class="av" style="--s:${size}px;--c:${esc(p.color)}" title="${esc(p.name)}">${inner}</span>`;
}
function nameOf(P, pid) {
  return esc(P[pid]?.name || '?');
}

// Bild im Browser quadratisch zuschneiden und verkleinern (JPEG)
function readPhoto(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const HEART = '<svg class="life" viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
function livesHTML(n, max) {
  let s = '';
  for (let i = 0; i < Math.max(max, n); i++) s += i < n ? HEART : HEART.replace('class="life"', 'class="life lost"');
  return `<div class="lives">${s}</div>`;
}
function dotsHTML(dots, perRound) {
  if (!dots) return '';
  const regular = dots.filter((d) => !d.extra).length;
  let s = dots.map((d) => `<span class="dot ${d.result} ${d.extra ? 'extra' : ''}"></span>`).join('');
  for (let i = regular; i < perRound; i++) s += '<span class="dot"></span>';
  return `<div class="dots">${s}</div>`;
}

function standingsHTML(state, ids, { highlight } = {}) {
  const P = playerMap(state);
  return `<div class="standings">${ids
    .filter((id) => P[id])
    .map(
      (id, i) => `<div class="score-row ${highlight === id ? 'active' : ''}"><span class="pos">${i + 1}</span>${av(P[id], 30)}<span class="nm">${esc(P[id].name)}</span><span class="sc ${P[id].score < 0 ? 'neg' : ''}">${fmt(P[id].score)}</span></div>`
    )
    .join('')}</div>`;
}

function waitingHTML(title, sub = '') {
  return `<div class="card big-state"><div class="spinner"></div><div class="t" style="font-size:1.3rem">${title}</div>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`;
}

const DIFF = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' };
const diffTag = (d) => `<span class="tag d${d}">${DIFF[d]}</span>`;
const RES = { right: '✓', wrong: '✗', joker: 'J' };

// ===========================================================================
// Spiel 1: Wer ist der Dümmste?

const Duemmste = {
  title(state) {
    return state.spicy ? 'Wer ist der Dümmste?' : 'Wer verliert ein Leben?';
  },

  profiles(state, g, { compact = false } = {}) {
    const P = playerMap(state);
    const cands = g.phase === 'vote' || g.phase === 'summary' ? g.candidates || [] : [];
    return g.profiles
      .map((pr) => {
        const p = P[pr.id];
        const cls = [compact ? 'compact' : '', pr.out ? 'out' : '', g.current && g.current.pid === pr.id ? 'turn' : '', cands.includes(pr.id) ? 'cand' : ''].join(' ');
        if (compact)
          return `<div class="profile ${cls}">${av(p, 26)}<div><div class="nm">${esc(p?.name)}</div>${dotsHTML(pr.dots, g.perRound)}</div></div>`;
        return `<div class="profile ${cls}">${av(p, 52)}<div class="nm">${esc(p?.name)}</div>${livesHTML(pr.lives, g.maxLives)}${dotsHTML(pr.dots, g.perRound)}${pr.jokers ? `<div class="joker-count">JOKER ×${pr.jokers}</div>` : ''}</div>`;
      })
      .join('');
  },

  lastHTML(state, g) {
    if (!g.last) return '';
    const P = playerMap(state);
    const l = g.last;
    return `<div class="last ${l.result} rise">${av(P[l.pid], 36)}<div class="txt">
      <div><b>${nameOf(P, l.pid)}</b> · ${l.result === 'right' ? '<span class="tag ok">Richtig</span>' : '<span class="tag bad">Falsch</span>'} · <span class="muted">${esc(l.q)}</span></div>
      <div class="a">Lösung: ${esc(l.a)}</div>
      ${l.comment ? `<div class="comment">${esc(l.comment)}</div>` : ''}
    </div></div>`;
  },

  candidateCards(state, g, ids, { buttons = false, myId } = {}) {
    const P = playerMap(state);
    return `<div class="cands">${ids
      .map((pid) => {
        const qs = (g.history || []).filter((h) => h.pid === pid);
        const list = qs
          .map(
            (h) =>
              `<li><span class="res ${h.result}">${RES[h.result]}</span><span>${esc(h.q)} ${diffTag(h.d)}<br><span class="sub">${
                h.result === 'joker' ? `Joker an ${nameOf(P, h.jokerTo)}` : `Lösung: ${esc(h.a)}${h.jokerFrom ? ` · per Joker von ${nameOf(P, h.jokerFrom)}` : ''}`
              }</span></span></li>`
          )
          .join('');
        const btn = buttons && pid !== myId ? `<button class="btn primary block" style="margin-top:12px" data-input='${attr({ type: 'vote', target: pid })}'>Wählen</button>` : '';
        return `<div class="cand"><div class="head">${av(P[pid], 40)}<span class="nm">${nameOf(P, pid)}</span></div><ul class="qlist">${list}</ul>${btn}</div>`;
      })
      .join('')}</div>`;
  },

  stage(state) {
    const g = state.game;
    const P = playerMap(state);
    const top = `<div class="stage-top"><span class="label">Runde ${g.round}${g.phase === 'turn' ? ` · Frage ${g.turn} von ${g.totalTurns}` : ''}</span><span class="label">${state.spicy ? '🌶️ Spicy' : ''}</span></div>`;
    const profiles = `<div class="profiles">${this.profiles(state, g)}</div>`;

    if (g.phase === 'end') {
      const w = P[g.winner];
      return `<div class="stage"><div class="winner rise"><div class="crown">GEWINNER</div>${w ? av(w, 120) : ''}<div class="verdict"><div class="big-name">${w ? esc(w.name) : 'Niemand'}</div><div class="sub">ist der schlauste Kopf im Raum.</div></div></div>${profiles}</div>`;
    }
    if (g.phase === 'turn' && g.current) {
      const c = g.current;
      return `<div class="stage">${top}${profiles}
        <div class="q-card rise">
          <div class="who">${av(P[c.pid], 44)}<span class="nm">${nameOf(P, c.pid)}</span>${diffTag(c.d)}</div>
          ${c.jokerFrom ? `<div class="label" style="margin-bottom:10px;color:var(--warn)">Joker von ${nameOf(P, c.jokerFrom)}</div>` : ''}
          <div class="q-text">${esc(c.q)}</div>
          <div class="status ${c.buzzed ? 'done' : 'live'}">${c.buzzed ? 'Abgegeben' : 'Antwortet …'}</div>
        </div>
        ${this.lastHTML(state, g)}</div>`;
    }
    if (g.phase === 'summary') {
      const safe = g.profiles.filter((p) => !p.out && p.dots && !g.candidates.includes(p.id)).map((p) => p.id);
      return `<div class="stage">${top}${profiles}
        <div class="q-card"><div class="q-text">Runde ${g.round} ist vorbei</div>
        <p class="muted">${g.candidates.length === 0 ? 'Alle haben alles richtig – niemand muss zittern.' : `Safe: ${safe.map((id) => nameOf(P, id)).join(', ') || 'niemand'}`}</p></div>
        ${g.candidates.length ? `<div class="label">Nicht safe</div>${this.candidateCards(state, g, g.candidates)}` : ''}
        ${this.lastHTML(state, g)}</div>`;
    }
    if (g.phase === 'vote') {
      return `<div class="stage">${top}
        <div class="q-card"><div class="q-text">${this.title(state)}</div>
        <p class="muted">${g.revote ? 'Gleichstand – Stichwahl!' : 'Anonyme Abstimmung auf euren Handys.'}</p>
        <div class="status live">${g.votedCount} / ${g.voterCount} abgestimmt</div></div>
        ${this.candidateCards(state, g, g.candidates)}</div>`;
    }
    if (g.phase === 'verdict') {
      const counts = g.voteCounts || {};
      const max = Math.max(1, ...Object.values(counts));
      const bars = Object.keys(counts).length
        ? `<div class="vote-bars">${Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([pid, n]) => `<div class="vote-bar">${av(P[pid], 28)}<span style="width:90px">${nameOf(P, pid)}</span><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div><span class="n">${n}</span></div>`)
            .join('')}</div>`
        : '';
      return `<div class="stage">${top}
        <div class="verdict rise">${av(P[g.loser], 110)}<div class="big-name">${nameOf(P, g.loser)}</div>
        <div class="sub">${g.loserOut ? 'ist raus.' : 'verliert ein Leben.'}${g.randomLoser ? ' (Gleichstand – Zufall hat entschieden)' : ''}</div>
        ${g.comment ? `<p class="comment" style="font-size:1.2rem">${esc(g.comment)}</p>` : ''}${bars}</div>
        ${profiles}</div>`;
    }
    return `<div class="stage">${top}${profiles}</div>`;
  },

  player(state) {
    const g = state.game;
    const P = playerMap(state);
    const me = state.me.id;
    const strip = `<div class="strip">${this.profiles(state, g, { compact: true })}</div>`;
    const myProfile = g.profiles.find((p) => p.id === me);
    const myStatus = myProfile ? `<div class="row" style="justify-content:center">${livesHTML(myProfile.lives, g.maxLives)}${dotsHTML(myProfile.dots, g.perRound)}</div>` : '';

    if (g.phase === 'end') {
      const w = P[g.winner];
      return `${strip}<div class="card big-state">${w ? av(w, 90) : ''}<div class="t">${g.winner === me ? 'Du hast gewonnen!' : `${esc(w?.name || 'Niemand')} gewinnt`}</div></div>`;
    }
    if (g.phase === 'turn' && g.current) {
      const c = g.current;
      if (g.isMe) {
        if (c.buzzed) return `${strip}<div class="card big-state"><div class="t">Abgegeben</div><p class="muted">Warte auf die Bewertung …</p></div>`;
        const others = g.profiles.filter((p) => p.id !== me && !p.out && p.dots);
        const joker =
          g.myJokers > 0 && !c.jokerFrom
            ? `<details class="card" id="joker"><summary class="btn block" style="list-style:none">Joker einsetzen (${g.myJokers} übrig)</summary>
                <p class="muted">Wähle, wer die Frage für dich beantworten muss. Für dich zählt sie als gelöst.</p>
                <div class="choice-list">${others.map((p) => `<button class="choice" data-input='${attr({ type: 'joker', target: p.id })}'>${av(P[p.id], 30)}${nameOf(P, p.id)}</button>`).join('')}</div></details>`
            : '';
        return `${strip}<div class="your-turn">DU BIST DRAN</div>
          <div class="center">${diffTag(c.d)}${c.jokerFrom ? ` <span class="tag" style="color:var(--warn)">Joker von ${nameOf(P, c.jokerFrom)}</span>` : ''}</div>
          <div class="p-q">${esc(c.q)}</div>
          <p class="center muted" style="margin:0">Antworte laut – dann drück den Buzzer.</p>
          <button class="buzzer" data-input='{"type":"buzz"}'>FERTIG<small>Antwort abgeben</small></button>
          ${joker}`;
      }
      return `${strip}<div class="card center">
          <div class="row" style="justify-content:center">${av(P[c.pid], 34)}<b>${nameOf(P, c.pid)}</b>${diffTag(c.d)}</div>
          <div class="p-q" style="margin-top:12px">${esc(c.q)}</div>
          <div class="status ${c.buzzed ? 'done' : 'live'}">${c.buzzed ? 'Abgegeben' : 'Antwortet …'}</div>
        </div>${this.lastHTML(state, g)}${myStatus}`;
    }
    if (g.phase === 'summary') {
      const notSafe = g.candidates.includes(me);
      return `${strip}<div class="card big-state"><div class="t ${notSafe ? 'bad' : 'ok'}">${!myProfile || myProfile.out ? 'Runde vorbei' : notSafe ? 'Nicht safe' : 'Du bist safe'}</div>${myStatus}<p class="muted">Gleich wird abgestimmt …</p></div>${this.lastHTML(state, g)}`;
    }
    if (g.phase === 'vote') {
      if (g.myVote) return `${strip}${waitingHTML('Stimme abgegeben', `Anonym. ${g.votedCount} / ${g.voterCount} haben abgestimmt.`)}`;
      const options = g.candidates.filter((id) => id !== me);
      if (!options.length) return `${strip}${waitingHTML('Die anderen stimmen ab …')}`;
      return `${strip}<div class="your-turn">${esc(this.title(state)).toUpperCase()}</div>
        <p class="center muted" style="margin:0">${g.revote ? 'Gleichstand – Stichwahl. ' : ''}Deine Stimme ist anonym.</p>
        ${this.candidateCards(state, g, options, { buttons: true, myId: me })}`;
    }
    if (g.phase === 'verdict') {
      return `${strip}<div class="card big-state">${av(P[g.loser], 80)}<div class="t">${g.loser === me ? (g.loserOut ? 'Du bist raus.' : 'Du verlierst ein Leben.') : `${nameOf(P, g.loser)} ${g.loserOut ? 'ist raus' : 'verliert ein Leben'}`}</div>${g.comment ? `<p class="comment">${esc(g.comment)}</p>` : ''}</div>${myStatus}`;
    }
    return strip;
  },

  host(state) {
    const g = state.game;
    const P = playerMap(state);
    let html = '';
    if (g.phase === 'turn' && g.current) {
      html += `<div class="solution"><div class="label">Lösung · ${nameOf(P, g.current.pid)} ist dran ${g.current.buzzed ? '· <span style="color:var(--accent)">ABGEGEBEN</span>' : ''}</div>
        <div class="val">${g.answerHidden ? 'Verdeckt – erst nach deinem Buzzer' : esc(g.answer)}</div></div>`;
    }
    if (g.phase === 'verdict') {
      html += `<div class="panel" style="margin-top:12px"><div class="label">Anders entscheiden – stattdessen verliert:</div><div class="row" style="margin-top:8px">${g.profiles
        .filter((p) => p.id !== g.loser && (p.lives > 0 || false))
        .map((p) => `<button class="btn sm" data-action="setLoser" data-payload='${attr({ pid: p.id })}'>${av(P[p.id], 20)} ${nameOf(P, p.id)}</button>`)
        .join('')}</div></div>`;
    }
    // Nachträglich bearbeiten: Leben, Joker, Punkte dieser Runde
    const rows = g.profiles
      .map((pr) => {
        const dots = (pr.dots || [])
          .map((d, i) => {
            const nextRes = d.result === 'right' ? 'wrong' : d.result === 'wrong' ? 'joker' : 'right';
            return `<span class="dot ${d.result} ${d.extra ? 'extra' : ''}" title="Klicken zum Ändern" data-action="setDot" data-payload='${attr({ pid: pr.id, index: i, result: nextRes })}'></span>`;
          })
          .join('');
        const dotTools = pr.dots
          ? `<button class="btn xs" title="Grünen Punkt hinzufügen" data-action="addDot" data-payload='${attr({ pid: pr.id, result: 'right' })}'>+✓</button>
             <button class="btn xs" title="Roten Punkt hinzufügen" data-action="addDot" data-payload='${attr({ pid: pr.id, result: 'wrong' })}'>+✗</button>
             ${pr.dots.length ? `<button class="btn xs" title="Letzten Punkt entfernen" data-action="removeDot" data-payload='${attr({ pid: pr.id, index: pr.dots.length - 1 })}'>−</button>` : ''}`
          : '<span class="muted">–</span>';
        return `<tr>
          <td>${av(P[pr.id], 24)}</td><td class="nm">${nameOf(P, pr.id)}</td>
          <td><span class="stepper"><button class="btn xs" data-action="lives" data-payload='${attr({ pid: pr.id, delta: -1 })}'>−</button><b>${pr.lives}</b><button class="btn xs" data-action="lives" data-payload='${attr({ pid: pr.id, delta: 1 })}'>+</button></span></td>
          <td><span class="stepper"><button class="btn xs" data-action="jokers" data-payload='${attr({ pid: pr.id, delta: -1 })}'>−</button><b>${pr.jokers}</b><button class="btn xs" data-action="jokers" data-payload='${attr({ pid: pr.id, delta: 1 })}'>+</button></span></td>
          <td><div class="row" style="gap:5px">${dots}${dotTools}</div></td>
        </tr>`;
      })
      .join('');
    html += `<div class="panel" style="margin-top:12px"><div class="panel-head"><h3>Korrigieren</h3><span class="muted" style="font-size:.8rem">Punkt anklicken = ändern</span></div>
      <table class="edit-table"><tr class="label"><td></td><td>Name</td><td>Leben</td><td>Joker</td><td>Runde ${g.round}</td></tr>${rows}</table></div>`;
    return html;
  },
};

// ===========================================================================
// Spiel 2: Quiz-Board

const Board = {
  grid(g, { clickable = false, host = false, mini = false, P = {} } = {}) {
    const cols = g.cats.length;
    let html = `<div class="${mini ? 'mini-board' : 'board'}" style="grid-template-columns:repeat(${cols},1fr)">`;
    html += g.cats.map((c) => `<div class="cat">${esc(c.name)}</div>`).join('');
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = g.cats[c].cells[r];
        const active = g.cell && g.cell.c === c && g.cell.r === r;
        const cls = `cell ${cell.used ? 'used' : ''} ${active ? 'active' : ''}`;
        const content = cell.used && cell.by && !mini ? av(P[cell.by], 22) : cell.v;
        if (clickable && !cell.used) html += `<button class="${cls}" data-input='${attr({ type: 'pick', c, r })}'>${cell.v}</button>`;
        else if (host && g.phase === 'pick')
          html += cell.used
            ? `<button class="${cls}" title="Feld wieder öffnen" data-action="reopen" data-payload='${attr({ c, r })}'>${content}</button>`
            : `<button class="${cls}" title="Für ${''}aktuelle Person wählen" data-action="pick" data-payload='${attr({ c, r })}'>${cell.v}</button>`;
        else html += `<div class="${cls}">${content}</div>`;
      }
    }
    return html + '</div>';
  },

  resultsHTML(state, g) {
    const P = playerMap(state);
    if (!g.results.length) return '';
    return `<div class="results">${g.results
      .map((r) => `<span class="result-chip">${av(P[r.pid], 26)}${nameOf(P, r.pid)} <span class="d ${r.delta > 0 ? 'pos' : 'neg'}">${signed(r.delta)}</span></span>`)
      .join('')}</div>`;
  },

  questionCard(state, g) {
    const P = playerMap(state);
    let status = '';
    if (g.phase === 'answer') status = `<div class="status ${g.buzzed ? 'done' : 'live'}">${nameOf(P, g.answerer)} · ${g.buzzed ? 'Abgegeben' : 'antwortet …'}</div>`;
    if (g.phase === 'steal') status = `<div class="status done">Buzzer offen – wer weiß es?</div>`;
    if (g.phase === 'stealAnswer') status = `<div class="status done">${nameOf(P, g.answerer)} hat gebuzzert</div>`;
    return `<div class="q-card rise">
      <div class="label">${esc(g.catName)} · ${g.cellValue}</div>
      <div class="q-text" style="margin-top:10px">${esc(g.question)}</div>
      ${g.phase === 'reveal' ? `<div class="answer-big">${esc(g.answer)}</div>` : status}
      ${this.resultsHTML(state, g)}
      ${g.comment && g.phase === 'reveal' ? `<p class="comment">${esc(g.comment)}</p>` : ''}
    </div>`;
  },

  stage(state) {
    const g = state.game;
    const P = playerMap(state);
    const scores = `<div><div class="label" style="margin-bottom:8px">Punkte</div>${standingsHTML(state, g.standings, { highlight: g.phase === 'pick' ? g.chooser : g.answerer })}</div>`;
    if (g.phase === 'end') return `<div class="stage"><div class="winner"><div class="crown">ENDSTAND</div></div>${standingsHTML(state, g.standings)}</div>`;
    const main = g.cell
      ? this.questionCard(state, g)
      : `<div class="stage-top"><span class="label">${nameOf(P, g.chooser)} wählt ein Feld</span></div>${this.grid(g, { P })}`;
    return `<div class="stage"><div class="board-wrap"><div>${main}</div>${scores}</div></div>`;
  },

  player(state) {
    const g = state.game;
    const P = playerMap(state);
    const me = state.me.id;
    if (g.phase === 'end') return `<div class="your-turn">ENDSTAND</div>${standingsHTML(state, g.standings, { highlight: me })}`;
    if (g.phase === 'pick') {
      if (g.isChooser) return `<div class="your-turn">DU WÄHLST</div>${this.grid(g, { clickable: true, mini: true })}`;
      return `<div class="card center"><div class="row" style="justify-content:center">${av(P[g.chooser], 30)}<b>${nameOf(P, g.chooser)}</b> wählt …</div></div>${this.grid(g, { mini: true })}`;
    }
    const head = `<div class="center"><span class="label">${esc(g.catName)} · ${g.cellValue}</span></div><div class="p-q">${esc(g.question)}</div>`;
    if (g.phase === 'answer') {
      if (g.answerer === me) {
        if (g.buzzed) return `${head}<div class="card big-state"><div class="t">Abgegeben</div><p class="muted">Warte auf die Bewertung …</p></div>`;
        return `<div class="your-turn">DU BIST DRAN</div>${head}<p class="center muted" style="margin:0">Antworte laut – dann drück den Buzzer.</p><button class="buzzer" data-input='{"type":"buzz"}'>FERTIG<small>Antwort abgeben</small></button>`;
      }
      return `${head}<div class="center"><div class="status ${g.buzzed ? 'done' : 'live'}">${nameOf(P, g.answerer)} · ${g.buzzed ? 'Abgegeben' : 'antwortet …'}</div></div>`;
    }
    if (g.phase === 'steal') {
      if (g.canSteal) return `${head}${this.resultsHTML(state, g)}<button class="buzzer" data-input='{"type":"buzz"}'>BUZZ<small>Ich weiß es!</small></button>`;
      return `${head}${this.resultsHTML(state, g)}${waitingHTML('Die anderen dürfen buzzern …')}`;
    }
    if (g.phase === 'stealAnswer') {
      if (g.answerer === me) return `<div class="your-turn">DU HAST GEBUZZERT</div>${head}<div class="card big-state"><div class="t">Antworte jetzt laut!</div></div>`;
      return `${head}<div class="center"><div class="status done">${nameOf(P, g.answerer)} hat gebuzzert</div></div>`;
    }
    const mine = g.results.filter((r) => r.pid === me).reduce((s, r) => s + r.delta, 0);
    return `${head}<div class="card big-state"><div class="label">Antwort</div><div class="t">${esc(g.answer)}</div>${mine ? `<div class="gain ${mine > 0 ? 'pos' : 'neg'}">${signed(mine)}</div>` : ''}${g.comment ? `<p class="comment">${esc(g.comment)}</p>` : ''}</div>`;
  },

  host(state) {
    const g = state.game;
    const P = playerMap(state);
    let html = '';
    if (g.cell) {
      html += `<div class="solution"><div class="label">Lösung · ${esc(g.catName)} ${g.cellValue}</div><div class="val">${g.answerHidden ? 'Verdeckt – erst nach deinem Buzzer' : esc(g.answer)}</div>
        ${g.phase === 'steal' ? '<p class="muted" style="margin:6px 0 0">Du buzzerst nicht mit, weil du die Lösung gesehen hast.</p>' : ''}</div>`;
    }
    if (g.phase === 'pick') {
      html += `<div class="panel"><div class="panel-head"><h3>Feld für ${nameOf(P, g.chooser)} wählen</h3></div>
        <p class="muted" style="margin-top:0;font-size:.85rem">Freie Felder anklicken = auswählen. Benutzte Felder anklicken = wieder öffnen.</p>
        ${this.grid(g, { host: true, mini: true, P })}</div>`;
    }
    return html;
  },
};

// ===========================================================================
// Spiel 3: Bluff

const Bluff = {
  q(text) {
    return esc(text).replace('___', '<span class="blank">&nbsp;</span>');
  },

  revealHTML(state, g, me) {
    const P = playerMap(state);
    return `<div class="options">${g.reveal
      .map((o) => {
        const tag = o.real
          ? '<span class="tag ok">Echt</span>'
          : o.house
            ? '<span class="tag">Haus-Lüge</span>'
            : `<span class="tag bad">Lüge</span> von ${o.authors.map((a) => nameOf(P, a)).join(' & ')}`;
        return `<div class="option ${o.real ? 'real' : ''} ${me && o.voters.includes(me) ? 'mine' : ''}">${esc(o.text)}
          <div class="meta">${tag}</div>
          <div class="voters">${o.voters.map((v) => av(P[v], 22)).join('')}</div></div>`;
      })
      .join('')}</div>`;
  },

  stage(state) {
    const g = state.game;
    const P = playerMap(state);
    if (g.phase === 'end') return `<div class="stage"><div class="winner"><div class="crown">ENDSTAND</div></div>${standingsHTML(state, g.standings)}</div>`;
    const top = `<div class="stage-top"><span class="label">Frage ${g.index + 1} von ${g.total}</span>${timerHTML(g.deadline)}</div>`;
    const q = `<div class="q-card"><div class="q-text">${this.q(g.question)}</div>${
      g.phase === 'write' ? `<div class="status live">${g.writtenCount} / ${g.playerCount} haben gelogen</div>` : g.phase === 'vote' ? `<div class="status live">${g.votedCount} abgestimmt</div>` : ''
    }</div>`;
    if (g.phase === 'write')
      return `<div class="stage">${top}${q}<p class="center muted">Denkt euch eine glaubwürdige falsche Antwort aus.</p><div class="writers">${state.players
        .filter((p) => p.connected)
        .map((p) => av(p, 34).replace('class="av"', `class="av ${g.written.includes(p.id) ? 'done' : ''}"`))
        .join('')}</div></div>`;
    if (g.phase === 'vote')
      return `<div class="stage">${top}${q}<div class="options">${g.options.map((o) => `<div class="option">${esc(o.text)}</div>`).join('')}</div></div>`;
    return `<div class="stage">${top}${q}${this.revealHTML(state, g)}${g.comment ? `<p class="comment center" style="font-size:1.15rem">${esc(g.comment)}</p>` : ''}
      <div class="results">${Object.entries(g.gained || {})
        .sort((a, b) => b[1] - a[1])
        .map(([pid, n]) => `<span class="result-chip">${av(P[pid], 26)}${nameOf(P, pid)} <span class="d pos">+${fmt(n)}</span></span>`)
        .join('')}</div></div>`;
  },

  player(state) {
    const g = state.game;
    const me = state.me.id;
    if (g.phase === 'end') return `<div class="your-turn">ENDSTAND</div>${standingsHTML(state, g.standings, { highlight: me })}`;
    const head = `<div class="row"><span class="label grow">Frage ${g.index + 1} / ${g.total}</span>${timerHTML(g.deadline)}</div><div class="p-q">${this.q(g.question)}</div>`;
    if (g.phase === 'write') {
      if (g.myLie) return `${head}${waitingHTML(`Deine Lüge: „${esc(g.myLie)}“`, 'Warte auf die anderen …')}`;
      return `${head}<form data-form="lie" class="card">
        <label class="label" for="lie-input">Deine falsche Antwort</label>
        <input id="lie-input" maxlength="50" autocomplete="off" placeholder="Klingt echt, ist aber gelogen" style="margin-top:8px">
        ${g.rejected ? '<div class="error">Das ist (fast) die echte Antwort! Denk dir was anderes aus.</div>' : ''}
        <button class="btn primary block lg" style="margin-top:12px" type="submit">Abschicken</button></form>`;
    }
    if (g.phase === 'vote') {
      if (g.myVote !== null) return `${head}${waitingHTML('Gewählt', 'Mal sehen, ob du richtig liegst …')}`;
      return `${head}<p class="center muted" style="margin:0">Welche Antwort ist die echte?</p><div class="choice-list">${g.options
        .filter((o) => o.id !== g.myOptionId)
        .map((o) => `<button class="choice big" data-input='${attr({ type: 'vote', id: o.id })}'>${esc(o.text)}</button>`)
        .join('')}</div>`;
    }
    const found = g.reveal.find((o) => o.real)?.voters.includes(me);
    return `${head}<div class="card big-state"><div class="t ${found ? 'ok' : 'bad'}">${found ? 'Richtig erkannt!' : 'Reingefallen'}</div><p>Echt war: <b>${esc(g.answer)}</b></p>${g.myGain ? `<div class="gain pos">+${fmt(g.myGain)}</div>` : ''}</div>${this.revealHTML(state, g, me)}`;
  },

  host(state) {
    const g = state.game;
    const P = playerMap(state);
    const playing = !!state.hostPid;
    let html = playing
      ? `<details class="solution" id="bluff-sol"><summary class="label" style="cursor:pointer">Lösung anzeigen (du spielst mit – Vorsicht)</summary><div class="val">${esc(g.answer)}</div></details>`
      : `<div class="solution"><div class="label">Echte Antwort</div><div class="val">${esc(g.answer)}</div></div>`;
    if (g.phase === 'write' && g.lies.length) {
      html += `<div class="panel"><div class="panel-head"><h3>Eingereichte Lügen</h3></div><div class="lie-list">${g.lies
        .map((l) => `<div class="row">${av(P[l.pid], 22)}<span class="grow">${playing ? '•••' : esc(l.text)}</span><button class="btn xs danger" data-action="removeLie" data-payload='${attr({ pid: l.pid })}'>Entfernen</button></div>`)
        .join('')}</div></div>`;
    }
    if (g.phase === 'vote') {
      html += `<div class="panel"><div class="panel-head"><h3>Antworten</h3></div><div class="lie-list">${g.optionAuthors
        .map(
          (o) =>
            `<div class="row"><span class="grow">${esc(o.text)} ${o.real ? '<span class="tag ok">echt</span>' : o.house ? '<span class="tag">Haus</span>' : `<span class="muted">– ${o.authors.map((a) => nameOf(P, a)).join(', ')}</span>`}</span>${
              o.real ? '' : `<button class="btn xs danger" data-action="removeLie" data-payload='${attr({ id: o.id })}'>Entfernen</button>`
            }</div>`
        )
        .join('')}</div></div>`;
    }
    return html;
  },
};

const GAMES = { duemmste: Duemmste, board: Board, bluff: Bluff };

function renderStage(state) {
  const G = GAMES[state.gameId];
  return G && state.game ? G.stage(state) : '';
}
function renderPlayer(state) {
  const G = GAMES[state.gameId];
  return G && state.game ? G.player(state) : '';
}
function renderHostPanel(state) {
  const G = GAMES[state.gameId];
  return G && state.game ? G.host(state) : '';
}

// Wurde gerade gebuzzert? (für den Signalton auf Host & Bildschirm)
let lastBuzzKey = null;
function buzzKey(state) {
  const g = state.game;
  if (!g) return null;
  if (state.gameId === 'duemmste' && g.current && g.current.buzzed) return `d${g.round}-${g.turn}-${g.current.pid}`;
  if (state.gameId === 'board' && ((g.phase === 'answer' && g.buzzed) || g.phase === 'stealAnswer')) return `b${g.cellValue}${g.catName}-${g.answerer}`;
  return null;
}
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 520;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    o.connect(gain).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.35);
  } catch (e) {}
}
function checkBuzz(state) {
  const k = buzzKey(state);
  if (k && k !== lastBuzzKey) beep();
  lastBuzzKey = k;
}

// Klicks auf Spieler-Buttons an den Server schicken
function bindPlayerInputs(container) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-input]');
    if (!b) return;
    b.classList.add('pressed');
    socket.emit('player:input', JSON.parse(b.dataset.input));
    if (navigator.vibrate) navigator.vibrate(30);
  });
  container.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const input = f.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('player:input', { type: f.dataset.form, text });
    input.value = '';
  });
}
