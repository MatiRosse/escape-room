import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CircusPosterScare, POSTER_SCARE_DELAY, POSTER_SCARE_DURATION } from '../src/circus-scare.js';
import { sound } from '../src/audio.js';

function node(hidden = false) {
  const classes = new Set(hidden ? ['hidden'] : []);
  return { classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) } };
}

function harness(storage = new Map()) {
  const poster = node();
  const overlay = node(true);
  const image = { complete: true, naturalWidth: 1024 };
  const timers = new Map();
  let time = 0, timerId = 0, screams = 0, stops = 0, visible = true;
  const state = { roomId: 'circo-test', createdAt: 1, startTime: 2, mapTheme: 'circus', status: 'IN_PROGRESS' };
  const options = {
    poster, overlay, image,
    playSound: () => { screams++; return () => { stops++; }; },
    storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    isPageVisible: () => visible,
    setTimer: (callback, delay) => { timers.set(++timerId, { callback, at: time + delay }); return timerId; },
    clearTimer: id => timers.delete(id)
  };
  const scare = new CircusPosterScare(options);
  scare.updateState(state);
  function advance(milliseconds) {
    const end = time + milliseconds;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      time = next[1].at;
      next[1].callback();
    }
    time = end;
  }
  return { scare, options, state, poster, overlay, image, timers, advance,
    setVisible: value => { visible = value; }, screams: () => screams, stops: () => stops };
}

test('Poster scare waits until reading, appears once, and leaves the clue open', () => {
  const h = harness();
  h.scare.schedule();
  h.scare.schedule();
  assert.equal(h.timers.size, 1);
  h.advance(POSTER_SCARE_DELAY - 1);
  assert.equal(h.screams(), 0);
  h.advance(1);
  assert.equal(h.screams(), 1);
  assert.equal(h.scare.active, true);
  assert.equal(h.overlay.classList.contains('hidden'), false);
  h.advance(POSTER_SCARE_DURATION);
  assert.equal(h.scare.active, false);
  assert.equal(h.overlay.classList.contains('hidden'), true);
  assert.equal(h.poster.classList.contains('hidden'), false);
  assert.equal(h.stops(), 1);
  h.scare.schedule();
  h.advance(10000);
  assert.equal(h.screams(), 1);
});

test('Closing the poster cancels a pending scare; reopening allows another reading attempt', () => {
  const h = harness();
  h.scare.schedule();
  h.advance(1000);
  h.poster.classList.add('hidden');
  h.scare.dismiss();
  h.advance(POSTER_SCARE_DELAY);
  assert.equal(h.screams(), 0);
  h.poster.classList.remove('hidden');
  h.scare.schedule();
  h.advance(POSTER_SCARE_DELAY);
  assert.equal(h.screams(), 1);
});

test('Other maps, completed rounds, hidden tabs and missing artwork do not trigger', () => {
  for (const stateChange of [{ mapTheme: 'vault' }, { status: 'ESCAPED' }]) {
    const h = harness();
    h.scare.schedule();
    h.scare.updateState({ ...h.state, ...stateChange });
    h.advance(10000);
    assert.equal(h.screams(), 0);
    assert.equal(h.overlay.classList.contains('hidden'), true);
  }
  for (const condition of ['tab', 'image', 'poster']) {
    const h = harness();
    h.scare.schedule();
    if (condition === 'tab') h.setVisible(false);
    if (condition === 'image') h.image.naturalWidth = 0;
    if (condition === 'poster') h.poster.classList.add('hidden');
    h.advance(10000);
    assert.equal(h.screams(), 0);
    assert.equal(h.scare.played, false);
  }
});

test('Dismiss stops the scream and reset rearms the scare for the new round', () => {
  const h = harness();
  h.scare.schedule();
  h.advance(POSTER_SCARE_DELAY);
  h.scare.dismiss();
  assert.equal(h.stops(), 1);
  assert.equal(h.timers.size, 0);
  h.scare.updateState({ ...h.state, createdAt: 3, startTime: 4 });
  h.scare.schedule();
  h.advance(POSTER_SCARE_DELAY);
  assert.equal(h.screams(), 2);
});

test('Reload remembers the scare for this player; another player is independent', () => {
  const storage = new Map();
  const first = harness(storage);
  first.scare.schedule();
  first.advance(POSTER_SCARE_DELAY + POSTER_SCARE_DURATION);
  const reloaded = harness(storage);
  reloaded.scare.schedule();
  reloaded.advance(10000);
  assert.equal(reloaded.screams(), 0);
  const otherPlayer = harness();
  otherPlayer.scare.schedule();
  otherPlayer.advance(POSTER_SCARE_DELAY);
  assert.equal(otherPlayer.screams(), 1);
});

test('Storage failures do not prevent one scare or repeat it', () => {
  const h = harness();
  h.scare.storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  h.scare.updateState({ ...h.state, createdAt: 10 });
  h.scare.schedule();
  h.advance(10000);
  h.scare.schedule();
  h.advance(10000);
  assert.equal(h.screams(), 1);
});

test('Default timers do not pass the scare controller as the browser timer receiver', () => {
  const savedSet = globalThis.setTimeout, savedClear = globalThis.clearTimeout;
  try {
    globalThis.setTimeout = function () { assert.equal(this, undefined); return 1; };
    globalThis.clearTimeout = function () { assert.equal(this, undefined); };
    const h = harness();
    const scare = new CircusPosterScare({ ...h.options, setTimer: undefined, clearTimer: undefined });
    scare.updateState(h.state);
    scare.schedule();
    assert.equal(scare.pendingTimer, 1);
    scare.dismiss();
  } finally {
    globalThis.setTimeout = savedSet;
    globalThis.clearTimeout = savedClear;
  }
});

test('Screamer audio uses the master mute bus and can be stopped on dismissal', () => {
  const original = { ctx: sound.ctx, initialized: sound.initialized, masterGain: sound.masterGain, destNode: sound.destNode, isMuted: sound.isMuted };
  const nodes = [];
  function audioNode() {
    const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const result = { gain: parameter(), frequency: parameter(), Q: parameter(), connections: [], stopCount: 0,
      connect(target) { this.connections.push(target); }, disconnect() {}, start() {}, stop() { this.stopCount++; } };
    nodes.push(result);
    return result;
  }
  const destination = {}, master = {};
  try {
    Object.assign(sound, { initialized: true, destNode: master, masterGain: master, isMuted: true,
      ctx: { currentTime: 1, state: 'running', sampleRate: 44100, destination,
        createOscillator: audioNode, createGain: audioNode, createBufferSource: audioNode, createBiquadFilter: audioNode,
        createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }) } });
    const stop = sound.playSFX('clown_screamer');
    assert.equal(typeof stop, 'function');
    assert.equal(nodes.some(node => node.connections.includes(master)), true);
    assert.equal(nodes.some(node => node.connections.includes(destination)), false);
    stop();
    assert.equal(nodes.filter(node => node.stopCount === 2).length, 3);
  } finally {
    Object.assign(sound, original);
  }
});
