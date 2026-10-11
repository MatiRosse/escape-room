import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { WebSocket } from 'ws';
import { getJackboxState, insertJackCrank } from '../shared/jackbox.js';
import { NetworkClient } from '../src/network.js';

// Exercise the real Worker action handler; only the platform base class is stubbed.
const workerSource = (await readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8'))
  .replace('import { DurableObject } from "cloudflare:workers";', 'class DurableObject {}')
  .replace("'../shared/jackbox.js'", JSON.stringify(new URL('../shared/jackbox.js', import.meta.url).href));
const { EscapeRoomDO } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);

function workerRoom() {
  const room = new EscapeRoomDO({}, {});
  room.gameState.players.alfa = { name: 'Alfa' };
  room.messages = [];
  room.broadcast = message => room.messages.push(structuredClone(message));
  return room;
}

for (const key of ['jack_crank', 'circusCrank', 'jackCrank', 'crankCollected', 'crankInserted', 'jackCrankInserted', 'inventoryInserted']) {
  test(`Worker opens the box with legacy crank state: ${key}`, () => {
    const room = workerRoom();
    room.gameState.circusInventory = {};
    if (['crankCollected', 'crankInserted', 'jackCrankInserted'].includes(key)) {
      room.gameState.circusPuzzles[key] = true;
    } else {
      room.gameState.circusInventory[key === 'inventoryInserted' ? 'jack_crank' : key] =
        key === 'inventoryInserted' ? { inserted: true } : { collected: true, holder: 'alfa' };
    }
    room.handleAction('alfa', 'SUBMIT_JACK_CODE', { code: '7341' });
    assert.deepEqual(getJackboxState(room.gameState), { hasCrank: true, crankInserted: true, open: true });
    for (const alias of ['jack_crank', 'circusCrank', 'jackCrank']) {
      assert.equal(room.gameState.circusInventory[alias].inserted, true);
    }
    assert.equal(room.messages.at(-1).sfx, 'jack_spring');
  });
}

test('Worker rejects missing crank and wrong code, and repeated opening is harmless', () => {
  const room = workerRoom();
  assert.equal(insertJackCrank(room.gameState), false);
  room.handleAction('alfa', 'SUBMIT_JACK_CODE', { code: '7341' });
  assert.equal(getJackboxState(room.gameState).open, false);
  assert.equal(room.messages.at(-1).sfx, 'access_denied');
  room.handleAction('alfa', 'POP_BALLOON');
  room.handleAction('alfa', 'TAKE_CRANK');
  room.handleAction('alfa', 'SUBMIT_JACK_CODE', { code: '0000' });
  assert.equal(getJackboxState(room.gameState).open, false);
  room.handleAction('alfa', 'INSERT_JACK_CRANK');
  room.handleAction('alfa', 'SUBMIT_JACK_CODE', { code: '7341' });
  const messageCount = room.messages.length;
  room.handleAction('alfa', 'SUBMIT_JACK_CODE', { code: '0000' });
  assert.equal(room.messages.length, messageCount);
  room.handleAction('alfa', 'TAKE_TAMER_KEY');
  room.handleAction('alfa', 'TAKE_CAGE_LEVER');
  room.handleAction('alfa', 'ESCAPE_CIRCUS');
  assert.equal(room.gameState.status, 'ESCAPED');
});

for (const key of ['jackPopped', 'jackSpringPopped', 'jackBoxUnlocked']) {
  test(`Loot is collectible from already open rooms: ${key}`, () => {
    const room = workerRoom();
    room.gameState.circusPuzzles[key] = true;
    room.handleAction('alfa', 'TAKE_TAMER_KEY');
    room.handleAction('alfa', 'TAKE_CAGE_LEVER');
    room.handleAction('alfa', 'ESCAPE_CIRCUS');
    assert.equal(room.gameState.status, 'ESCAPED');
  });
}

test('Local browser defaults use the local server; public hosting uses its own origin', () => {
  const previousWindow = globalThis.window;
  try {
    for (const [hostname, port, protocol, expected] of [
      ['localhost', '5173', 'http:', 'ws://localhost:3001/ws'],
      ['localhost', '3001', 'http:', 'ws://localhost:3001/ws'],
      ['127.0.0.1', '3001', 'http:', 'ws://127.0.0.1:3001/ws'],
      ['[::1]', '5173', 'http:', 'ws://[::1]:3001/ws'],
      ['escape.example', '', 'https:', 'wss://escape.example/ws']
    ]) {
      globalThis.window = { location: { hostname, port, protocol, host: `${hostname}${port ? `:${port}` : ''}` } };
      assert.equal(NetworkClient.prototype.getDefaultWsUrl(), expected);
    }
  } finally {
    globalThis.window = previousWindow;
  }
});

function waitMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('WebSocket response timed out')); }, 5000);
    function cleanup() { clearTimeout(timeout); socket.off('message', onMessage); }
    function onMessage(data) {
      const message = JSON.parse(data);
      if (predicate(message)) { cleanup(); resolve(message); }
    }
    socket.on('message', onMessage);
  });
}

test('Node server: cooperative crank → box → loot → escape over real WebSockets', { timeout: 15000 }, async t => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  let output = '';
  await new Promise((resolve, reject) => {
    child.stderr.on('data', data => { output += data; });
    child.on('exit', code => reject(new Error(`Server exited ${code}: ${output}`)));
    child.stdout.on('data', data => { if (String(data).includes('Escuchando')) resolve(); });
  });
  const sockets = [];
  t.after(() => sockets.forEach(socket => socket.terminate()));
  async function join(name) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(socket);
    await once(socket, 'open');
    const response = waitMessage(socket, message => message.type === 'INIT_STATE');
    socket.send(JSON.stringify({ type: 'JOIN_ROOM', name, roomId: 'jackbox-test', mapTheme: 'circus' }));
    await response;
    return socket;
  }
  const alfa = await join('Alfa');
  const bravo = await join('Bravo');
  async function action(socket, action, payload = {}) {
    // Drain earlier partner broadcasts before waiting for this action's response.
    const pong = waitMessage(socket, message => message.type === 'PONG');
    socket.send(JSON.stringify({ type: 'PING' }));
    await pong;
    const response = waitMessage(socket, message => ['STATE_UPDATE', 'TRIGGER_SFX'].includes(message.type));
    socket.send(JSON.stringify({ type: 'GAME_ACTION', action, payload }));
    return response;
  }
  assert.equal((await action(bravo, 'SUBMIT_JACK_CODE', { code: '7341' })).sfx, 'access_denied');
  await action(alfa, 'TAKE_CIRCUS_KNIFE');
  await action(alfa, 'POP_BALLOON');
  await action(alfa, 'TAKE_CRANK');
  assert.equal((await action(bravo, 'SUBMIT_JACK_CODE', { code: '0000' })).sfx, 'access_denied');
  const partnerUpdate = waitMessage(alfa, message => message.type === 'STATE_UPDATE');
  const opened = await action(bravo, 'SUBMIT_JACK_CODE', { code: '7341' });
  assert.equal(opened.state.circusPuzzles.jackCrankInserted, true);
  assert.equal(opened.state.circusPuzzles.jackBoxUnlocked, true);
  assert.equal((await partnerUpdate).state.circusPuzzles.jackBoxUnlocked, true);
  await action(alfa, 'TAKE_TAMER_KEY');
  await action(bravo, 'TAKE_CAGE_LEVER');
  assert.equal((await action(bravo, 'ESCAPE_CIRCUS')).state.status, 'ESCAPED');
});
