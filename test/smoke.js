// Spielt alle Spiele mit einem Host (der selbst mitspielt) und drei simulierten Spielern durch.
// Start: npm test – der Server wird hier automatisch gestartet.
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const assert = require('assert');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Winziges gültiges JPEG (1x1 Pixel)
const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function client() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.last = null;
  s.on('state', (st) => (s.last = st));
  return s;
}
const call = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

async function until(fn, label, ms = 3000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      if (fn()) return;
    } catch (e) {}
    await wait(15);
  }
  throw new Error('Timeout: ' + label);
}

async function main() {
  const server = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
  await wait(700);
  try {
    const host = client();
    const { code } = await call(host, 'host:create');
    const hcmd = async (d) => {
      const res = await call(host, 'host:cmd', d);
      assert.ok(res.ok, `${d.cmd} ${d.action || ''}: ${res.error}`);
      return res;
    };
    const g = () => (host.last && host.last.game) || {};

    // Spieler (einer mit Foto)
    const players = [];
    for (const [i, name] of ['Ali', 'Bea', 'Cem'].entries()) {
      const p = client();
      const res = await call(p, 'player:join', { code, name, photo: i === 0 ? JPEG : undefined });
      assert.ok(res.ok, res.error);
      p.pid = res.playerId;
      players.push(p);
    }
    await hcmd({ cmd: 'hostJoin', name: 'Host' });
    await until(() => host.last.players.length === 4 && host.last.hostPid, 'host spielt mit');
    const hostPid = host.last.hostPid;
    const photoUrl = host.last.players.find((p) => p.name === 'Ali').photo;
    const photoRes = await fetch(URL + photoUrl);
    assert.strictEqual(photoRes.status, 200);
    console.log('✓ Lobby, Foto, Host spielt mit');

    // Alle Teilnehmer: id -> socket (der Host gibt seine Eingaben über seinen Host-Socket ab)
    const sock = { [hostPid]: host };
    players.forEach((p) => (sock[p.pid] = p));
    const input = (pid, payload) => sock[pid].emit('player:input', payload);

    // ---------------- Spiel 1: Wer ist der Dümmste?
    await hcmd({ cmd: 'startGame', gameId: 'duemmste', options: { perRound: 1, lives: 1, jokers: 1 } });
    await until(() => g().phase === 'turn', 'dümmste start');
    // Host-Lösung verdeckt, wenn er selbst dran ist
    const order = [];
    for (let i = 0; i < 4; i++) {
      await until(() => g().phase === 'turn' && g().turn === i + 1, 'zug ' + i);
      const cur = g().current.pid;
      order.push(cur);
      if (cur === hostPid) {
        assert.strictEqual(host.last.game.answer, null, 'Host darf eigene Lösung nicht sehen');
        input(cur, { type: 'buzz' });
        await until(() => host.last.game.answer, 'lösung nach buzz');
      }
      if (i === 0) {
        // Erster Spieler setzt Joker auf den nächsten
        const target = g().profiles.find((p) => p.id !== cur).id;
        input(cur, { type: 'joker', target });
        await until(() => g().current.jokerFrom === cur, 'joker');
        await hcmd({ cmd: 'action', action: 'judge', payload: { result: 'wrong' } });
        continue;
      }
      // Alle anderen: zwei falsch, einer richtig
      await hcmd({ cmd: 'action', action: 'judge', payload: { result: i === 3 ? 'right' : 'wrong' } });
    }
    await until(() => g().phase === 'summary', 'summary');
    const cands = g().candidates;
    assert.ok(cands.length >= 2, 'mindestens zwei nicht safe');
    await hcmd({ cmd: 'action', action: 'startVote' });
    await until(() => g().phase === 'vote', 'vote');
    // Alle stimmen für den ersten Kandidaten (der selbst stimmt für den zweiten)
    for (const pid of Object.keys(sock)) {
      input(pid, { type: 'vote', target: pid === cands[0] ? cands[1] : cands[0] });
    }
    await until(() => g().phase === 'verdict' || g().phase === 'end', 'verdict');
    assert.strictEqual(g().loser, cands[0]);
    // Host entscheidet um
    await hcmd({ cmd: 'action', action: 'setLoser', payload: { pid: cands[1] } });
    await until(() => g().loser === cands[1], 'setLoser');
    assert.strictEqual(g().profiles.find((p) => p.id === cands[0]).lives, 1);
    await hcmd({ cmd: 'action', action: 'nextRound' });
    await until(() => g().phase === 'turn' && g().round === 2, 'runde 2');
    assert.ok(g().profiles.find((p) => p.id === cands[1]).out, 'Verlierer ist raus');
    // Nachträglich korrigieren
    await hcmd({ cmd: 'action', action: 'lives', payload: { pid: cands[1], delta: 1 } });
    await until(() => !g().profiles.find((p) => p.id === cands[1]).out, 'leben zurück');
    console.log('✓ Wer ist der Dümmste? (Joker, Voting, Korrektur)');

    // ---------------- Spiel 2: Quiz-Board
    await hcmd({ cmd: 'startGame', gameId: 'board', options: { cats: 4, steal: 1 } });
    await until(() => g().phase === 'pick' && g().cats.length === 4, 'board start');
    const chooser = g().chooser;
    input(chooser, { type: 'pick', c: 0, r: 2 });
    await until(() => g().phase === 'answer', 'board answer');
    input(chooser, { type: 'buzz' });
    await until(() => g().buzzed, 'board buzzed');
    await hcmd({ cmd: 'action', action: 'judge', payload: { correct: false } });
    await until(() => g().phase === 'steal', 'steal');
    const stealer = players.map((p) => p.pid).find((pid) => pid !== chooser);
    input(hostPid, { type: 'buzz' }); // Host darf nicht klauen
    input(stealer, { type: 'buzz' });
    await until(() => g().phase === 'stealAnswer', 'steal answer');
    assert.strictEqual(g().answerer, stealer);
    await hcmd({ cmd: 'action', action: 'judge', payload: { correct: true } });
    await until(() => g().phase === 'reveal', 'board reveal');
    const score = (pid) => host.last.players.find((p) => p.id === pid).score;
    assert.strictEqual(score(chooser), -150);
    assert.strictEqual(score(stealer), 300);
    await hcmd({ cmd: 'action', action: 'next' });
    await until(() => g().phase === 'pick' && g().chooser !== chooser, 'nächste person');
    console.log('✓ Quiz-Board (Fehler, Klauen, Punkte)');

    // ---------------- Spiel 3: Bluff
    await hcmd({ cmd: 'startGame', gameId: 'bluff', options: { rounds: 2 } });
    await until(() => g().phase === 'write', 'bluff write');
    const real = host.last.game.answer;
    input(players[0].pid, { type: 'lie', text: real }); // echte Antwort wird abgelehnt
    await until(() => players[0].last.game.rejected, 'abgelehnt');
    const ids = Object.keys(sock);
    ids.forEach((pid, i) => input(pid, { type: 'lie', text: 'Lüge Nummer ' + i }));
    await until(() => g().phase === 'vote', 'bluff vote');
    // Ali findet die Wahrheit, alle anderen fallen auf Alis Lüge rein
    const opts = players[0].last.game.options;
    const realId = host.last.game.optionAuthors.find((o) => o.real).id;
    const aliLie = host.last.game.optionAuthors.find((o) => o.authors.includes(players[0].pid)).id;
    for (const pid of ids) input(pid, { type: 'vote', id: pid === players[0].pid ? realId : aliLie });
    await until(() => g().phase === 'reveal', 'bluff reveal');
    assert.ok(opts.length >= 4);
    assert.strictEqual(score(players[0].pid), 1000 + 3 * 500);
    console.log('✓ Bluff (Ablehnung echter Antwort, Punkte)');

    // ---------------- Host-Befehle
    await hcmd({ cmd: 'spicy', value: true });
    await until(() => players[1].last.spicy, 'spicy');
    await hcmd({ cmd: 'endGame' });
    await hcmd({ cmd: 'kick', pid: players[2].pid });
    await until(() => host.last.players.length === 3, 'kick');
    await hcmd({ cmd: 'lock', value: true });
    const locked = await call(client(), 'player:join', { code, name: 'Neu' });
    assert.ok(!locked.ok);
    players[0].disconnect();
    const again = client();
    const rejoin = await call(again, 'player:join', { code, playerId: players[0].pid });
    assert.ok(rejoin.ok, rejoin.error);
    console.log('✓ Spicy, Kick, Sperre, Reconnect');

    console.log('\nAlle Tests bestanden');
  } finally {
    server.kill();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
