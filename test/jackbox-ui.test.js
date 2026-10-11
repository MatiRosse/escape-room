import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getJackboxState } from '../shared/jackbox.js';

const source = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '') + '\nthis.EscapeGame = EscapeGame;';

function harness() {
  const elements = new Map();
  const timers = new Map();
  const actions = [];
  const sfx = [];
  let timerId = 0;
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id,
        textContent: '', innerHTML: '', value: '', style: {}, disabled: false,
        parentElement: { style: {} },
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
        listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; }
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    getJackboxState, console,
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, location: { hostname: 'localhost' } },
    localStorage: { getItem: () => 'wss://old-production.example/ws' },
    sound: { playSFX: name => sfx.push(name) },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(source, context);
  const game = Object.create(context.EscapeGame.prototype);
  Object.assign(game, {
    network: { serverUrl: 'ws://localhost:3001/ws', sendAction: (action, payload) => actions.push({ action, payload }) },
    scene: { applyGameState() {} }, displayedLogIds: new Set(), jackDials: [7, 3, 4, 1],
    controls: { lock() {}, unlock() {} },
    updatePartnerStatus() {}, updateInventoryUI() {}, updateMissionObjectiveUI() {}
  });
  game.setupUIBindings();
  return { game, element, timers, actions, sfx };
}

test('UI uses one authoritative opening action and clears pending failure when box opens', () => {
  const { game, element, timers, actions } = harness();
  game.onGameStateUpdate({ circusInventory: {}, circusPuzzles: { crankCollected: true } });
  assert.match(element('jackbox-crank-text').innerHTML, /EN INVENTARIO/);
  assert.equal(element('ws-url-input').value, 'ws://localhost:3001/ws');
  element('btn-modal-crank-jack').listeners.click();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, 'SUBMIT_JACK_CODE');
  assert.equal(actions[0].payload.code, '7341');
  assert.equal(timers.size, 1);
  game.onGameStateUpdate({ circusInventory: {}, circusPuzzles: { crankInserted: true, jackBoxUnlocked: true } });
  assert.equal(timers.size, 0);
  assert.equal(element('btn-modal-crank-jack').disabled, true);
  assert.match(element('jackbox-feedback').textContent, /abierta/);
});

test('Screenshot regression: clicking an already open box cannot report a missing crank', () => {
  const { game, element, actions, sfx } = harness();
  game.onGameStateUpdate({ circusInventory: {}, circusPuzzles: { jackPopped: true } });
  const feedback = element('jackbox-feedback').textContent;
  element('btn-modal-crank-jack').listeners.click();
  assert.equal(element('jackbox-feedback').textContent, feedback);
  assert.equal(actions.length, 0);
  assert.equal(sfx.length, 0);
  assert.equal(element('jack-loot-section').classList.contains('hidden'), false);
});

test('World poster interaction schedules a local scare and closing the clue cancels it', () => {
  const { game, element, actions } = harness();
  const calls = [];
  game.posterScare = { schedule: () => calls.push('schedule'), dismiss: () => calls.push('dismiss') };
  element('modal-clown-poster').classList.add('hidden');
  game.handleWorldInteraction('CIRCUS_POSTER');
  assert.equal(element('modal-clown-poster').classList.contains('hidden'), false);
  assert.deepEqual(calls, ['schedule']);
  game.closeModal('modal-clown-poster');
  assert.equal(element('modal-clown-poster').classList.contains('hidden'), true);
  assert.deepEqual(calls, ['schedule', 'dismiss']);
  assert.equal(actions.length, 0);
});
