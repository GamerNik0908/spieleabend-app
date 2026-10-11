function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Zählt Stimmen { voterId: choice } -> { choice: count }
function tally(votes) {
  const counts = {};
  for (const v of Object.values(votes)) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

function topKeys(counts) {
  const max = Math.max(0, ...Object.values(counts));
  if (max === 0) return [];
  return Object.keys(counts).filter((k) => counts[k] === max);
}

function fmtNum(n) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

// Antworttext inkl. Toleranz, z. B. "330 m (± 10)"
function answerText(q) {
  if (typeof q.a !== 'number') return String(q.a);
  let s = fmtNum(q.a) + (q.unit ? ' ' + q.unit : '');
  if (q.tol) s += ` (± ${fmtNum(q.tol)})`;
  return s;
}

// Für Text-Vergleiche: klein, ohne Akzente/Satzzeichen
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

module.exports = { shuffle, pick, tally, topKeys, fmtNum, answerText, normalize };
