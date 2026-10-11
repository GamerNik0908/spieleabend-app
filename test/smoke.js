// Spielt alle Spiele mit einem Host und drei simulierten Spielern einmal durch.
// Start: npm test (Server muss NICHT laufen, wird hier gestartet)
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const assert = require('assert');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (fn()) return;
    await wait(20);
  }
  throw new Error('Timeout: ' + label);
}

async function main() {
  const server = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
  await wait(700);
  try {
    const host = client();
    const { code, hostToken } = await call(host, 'host:create');
    assert.match(code, /^[A-Z]{4}$/);

    const players = [];
    for (const name of ['Ali', 'Bea', 'Cem']) {
      const p = client();
      const res = await call(p, 'player:join', { code, name, avatar: '😎' });
      assert.ok(res.ok, res.error);
      p.pid = res.playerId;
      players.push(p);
    }
    const dup = await call(client(), 'player:join', { code, name: 'ali' });
    assert.ok(!dup.ok, 'doppelter Name muss abgelehnt werden');
    await until(() => host.last && host.last.players.length === 3, 'drei Spieler');

    const hcmd = (d) => call(host, 'host:cmd', d);
    const g = () => host.last.game || {};
    async function startGame(gameId, options) {
      host.last = null;
      players.forEach((p) => (p.last = null));
      const res = await hcmd({ cmd: 'startGame', gameId, options });
      assert.ok(res.ok, res.error);
      await until(() => host.last && host.last.gameId === gameId, 'start ' + gameId);
    }

    // Quiz: alle antworten -> automatische Auflösung
    await startGame('quiz', { rounds: 3, time: 10 });
    for (let i = 0; i < 3; i++) {
      await until(() => g().phase === 'question' && g().index === i, 'quiz frage ' + i);
      players.forEach((p, k) => p.emit('player:input', { choice: k % 4 }));
      await until(() => g().phase === 'reveal', 'quiz reveal');
      await hcmd({ cmd: 'action', action: 'next' });
    }
    await until(() => g().phase === 'end', 'quiz ende');
    console.log('✓ Quiz', host.last.players.map((p) => p.score));

    // Schätzen
    await startGame('schaetzen', { rounds: 3 });
    players.forEach((p, k) => p.emit('player:input', { value: String(100 * (k + 1)) }));
    await until(() => g().phase === 'reveal' && g().ranking, 'schätzen reveal');
    assert.strictEqual(g().ranking.length, 3);
    console.log('✓ Schätzen');

    // Wer würde eher
    await startGame('eher', { rounds: 3 });
    players.forEach((p) => p.emit('player:input', { target: players[0].pid }));
    await until(() => g().phase === 'reveal', 'eher reveal');
    assert.deepStrictEqual(g().winners, [players[0].pid]);
    console.log('✓ Wer würde eher');

    // Lieber
    await startGame('lieber', { rounds: 3 });
    players.forEach((p, k) => p.emit('player:input', { choice: k === 0 ? 1 : 0 }));
    await until(() => g().phase === 'reveal', 'lieber reveal');
    assert.deepStrictEqual(g().counts, [2, 1]);
    console.log('✓ Lieber oder');

    // Spion
    await startGame('spion', { rounds: 1 });
    await until(() => players.every((p) => p.last && p.last.game && p.last.game.phase === 'roles'), 'spion rollen');
    const spies = players.filter((p) => p.last.game.isSpy);
    assert.strictEqual(spies.length, 1);
    assert.strictEqual(spies[0].last.game.word, null, 'Spion darf das Wort nicht sehen');
    assert.ok(players.filter((p) => !p.last.game.isSpy).every((p) => p.last.game.word));
    await hcmd({ cmd: 'action', action: 'discuss' });
    await hcmd({ cmd: 'action', action: 'vote' });
    const spy = spies[0];
    players.forEach((p) => {
      const target = p === spy ? players.find((x) => x !== spy).pid : spy.pid;
      p.emit('player:input', { target });
    });
    await until(() => g().phase === 'reveal', 'spion reveal');
    assert.strictEqual(g().caught, true);
    console.log('✓ Spion');

    // Wahrheit oder Pflicht
    await startGame('wop');
    await hcmd({ cmd: 'action', action: 'spin' });
    await until(() => g().phase === 'choose', 'wop choose');
    const current = players.find((p) => p.pid === g().current.id);
    current.emit('player:input', { type: 'dare' });
    await until(() => g().phase === 'task' && g().text, 'wop task');
    await hcmd({ cmd: 'action', action: 'done' });
    await until(() => g().phase === 'idle', 'wop idle');
    console.log('✓ Wahrheit oder Pflicht');

    // Reaktion: ein Frühstarter, zwei normale
    await startGame('reaktion', { rounds: 1 });
    await hcmd({ cmd: 'action', action: 'go' });
    await until(() => g().phase === 'wait', 'reaktion wait');
    players[0].emit('player:input', { ms: 0 });
    await until(() => g().phase === 'go', 'reaktion go', 8000);
    players[1].emit('player:input', { ms: 250 });
    players[2].emit('player:input', { ms: 300 });
    await until(() => g().phase === 'reveal', 'reaktion reveal');
    assert.strictEqual(g().fouls.length, 1);
    assert.strictEqual(g().ranking[0].name, 'Bea');
    console.log('✓ Reaktion');

    // Host-Befehle
    await hcmd({ cmd: 'endGame' });
    await hcmd({ cmd: 'kick', pid: players[2].pid });
    await until(() => host.last.players.length === 2, 'kick');
    await hcmd({ cmd: 'lock', value: true });
    const locked = await call(client(), 'player:join', { code, name: 'Neu' });
    assert.ok(!locked.ok);
    // Wiederverbinden mit gleicher ID klappt trotz Sperre
    players[0].disconnect();
    const again = client();
    const rejoin = await call(again, 'player:join', { code, playerId: players[0].pid });
    assert.ok(rejoin.ok, rejoin.error);
    // Host kann nach Reload weitermachen
    const host2 = client();
    assert.ok((await call(host2, 'host:resume', { code, hostToken })).ok);
    console.log('✓ Host-Befehle, Reconnect');

    console.log('\nAlle Tests bestanden 🎉');
    process.exitCode = 0;
  } finally {
    server.kill();
    setTimeout(() => process.exit(), 100);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
