'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.style = {};
    this.clientWidth = 800;
    this.clientHeight = 156;
    this.offsetWidth = 144;
    this.textContent = '';
    this.classList = { add() {}, remove() {} };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }

  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
}

function loadWebview() {
  const elements = new Map([
    ['world', new FakeElement()],
    ['pet', new FakeElement()],
    ['speech', new FakeElement()],
    ['play', new FakeElement()],
    ['work', new FakeElement()],
    ['reset', new FakeElement()]
  ]);
  const windowListeners = new Map();
  const posted = [];
  const timers = new Map();
  let nextTimerId = 1;
  const context = {
    acquireVsCodeApi: () => ({
      getState: () => ({}),
      setState() {},
      postMessage: (message) => posted.push(message)
    }),
    document: { getElementById: (id) => elements.get(id) },
    window: {
      YUUKA_DIALOGUE: {
        interaction: ['interaction'], work: ['work'], interrupted: ['interrupted'],
        annoyed: ['annoyed'], saved: ['saved'], taskSucceeded: ['success'], reset: ['reset']
      },
      addEventListener: (type, listener) => windowListeners.set(type, listener)
    },
    setTimeout: (callback, delay) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => 2,
    clearInterval() {},
    console,
    Math,
    Date
  };
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, '../media/main.js'), 'utf8'),
    context,
    { filename: 'main.js' }
  );
  return { elements, posted, timers, message: windowListeners.get('message') };
}

test('webview boots and passive events cannot interrupt work lock', () => {
  const webview = loadWebview();
  assert.equal(webview.posted.some(({ type }) => type === 'hello'), true);
  assert.equal(typeof webview.message, 'function');

  webview.message({ data: { command: 'work' } });
  const workSpeech = webview.elements.get('speech').textContent;
  assert.equal(workSpeech, 'work');

  webview.message({ data: { command: 'saved' } });
  assert.equal(webview.elements.get('speech').textContent, workSpeech);
});

test('rapid repeated interaction uses the annoyance cooldown response', () => {
  const webview = loadWebview();
  webview.message({ data: { command: 'play' } });
  webview.message({ data: { command: 'play' } });
  assert.equal(webview.elements.get('speech').textContent, 'annoyed');
});

test('mouse movement only changes direction after a short dwell', () => {
  const webview = loadWebview();
  const world = webview.elements.get('world');
  const pet = webview.elements.get('pet');
  const initialFrame = pet.style.backgroundPosition;

  world.listeners.get('pointermove')({ clientX: 700 });
  assert.equal(pet.style.backgroundPosition, initialFrame);

  const dwellTimer = [...webview.timers.values()].find(({ delay }) => delay === 450);
  assert.ok(dwellTimer);
  dwellTimer.callback();
  assert.notEqual(pet.style.backgroundPosition, initialFrame);
});
