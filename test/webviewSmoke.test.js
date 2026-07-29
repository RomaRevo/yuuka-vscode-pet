'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = {};
    this.clientWidth = 800;
    this.clientHeight = 156;
    this.offsetWidth = 144;
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  focus() { this.focused = true; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll() { return []; }

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
    ['timer-phase', new FakeElement()],
    ['timer-task', new FakeElement()],
    ['timer-display', new FakeElement()],
    ['timer-primary', new FakeElement()],
    ['timer-stop', new FakeElement()],
    ['timer-reset', new FakeElement()],
    ['focus-duration-select', new FakeElement()],
    ['focus-duration-custom', new FakeElement()],
    ['focus-duration-input', new FakeElement()],
    ['focus-duration-apply', new FakeElement()],
    ['focus-duration-hint', new FakeElement()],
    ['task-list', new FakeElement()],
    ['task-empty', new FakeElement()],
    ['task-form', new FakeElement()],
    ['task-input', new FakeElement()],
    ['task-submit', new FakeElement()],
    ['reminder-list', new FakeElement()],
    ['reminder-empty', new FakeElement()],
    ['reminder-form', new FakeElement()],
    ['reminder-input', new FakeElement()],
    ['reminder-time', new FakeElement()],
    ['reminder-submit', new FakeElement()],
    ['productivity-message', new FakeElement()],
    ['today-focus', new FakeElement()],
    ['today-minutes', new FakeElement()],
    ['today-tasks', new FakeElement()],
    ['focus-streak', new FakeElement()],
    ['week-minutes', new FakeElement()],
    ['week-tasks', new FakeElement()],
    ['clear-stats', new FakeElement()],
    ['relationship-enabled', new FakeElement()],
    ['relationship-controls', new FakeElement()],
    ['mood-select', new FakeElement()],
    ['affinity-range', new FakeElement()],
    ['affinity-number', new FakeElement()],
    ['affinity-output', new FakeElement()],
    ['reset-relationship', new FakeElement()],
    ['outfit-select', new FakeElement()],
    ['outfit-name', new FakeElement()],
    ['outfit-detail', new FakeElement()],
    ['scene-select', new FakeElement()],
    ['scene-name', new FakeElement()],
    ['scene-detail', new FakeElement()],
    ['play', new FakeElement()],
    ['work', new FakeElement()],
    ['reset', new FakeElement()]
  ]);
  const tabDefinitions = [
    ['tab-focus', 'focus-panel'],
    ['tab-tasks', 'tasks-panel'],
    ['tab-reminders', 'reminders-panel'],
    ['tab-stats', 'stats-panel'],
    ['tab-relationship', 'relationship-panel'],
    ['tab-appearance', 'scene-panel']
  ];
  const tabs = tabDefinitions.map(([id, panel]) => {
    const tab = new FakeElement();
    tab.dataset.panel = panel;
    elements.set(id, tab);
    elements.set(panel, new FakeElement());
    return tab;
  });
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
    document: {
      getElementById: (id) => elements.get(id),
      querySelectorAll: (selector) => (selector === '.tab' ? tabs : []),
      createElement: () => new FakeElement()
    },
    window: {
      YUUKA_DIALOGUE: {
        interaction: ['interaction'], work: ['work'], interrupted: ['interrupted'],
        annoyed: ['annoyed'], saved: ['saved'], taskSucceeded: ['success'], reset: ['reset']
      },
      addEventListener: (type, listener) => windowListeners.set(type, listener),
      matchMedia: () => ({ matches: false })
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
    fs.readFileSync(path.resolve(__dirname, '../media/dialoguePolicy.js'), 'utf8'),
    context,
    { filename: 'dialoguePolicy.js' }
  );
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, '../media/relationshipDialogue.js'), 'utf8'),
    context,
    { filename: 'relationshipDialogue.js' }
  );
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

test('productivity snapshot renders and timer control posts an action', () => {
  const webview = loadWebview();
  webview.message({ data: {
    command: 'productivityState',
    state: {
      tasks: [], selectedTaskId: null, selectedTaskTitle: '', reminders: [],
      focusMinutes: 25,
      timer: { phase: 'focus', status: 'idle', remainingMs: 25 * 60000 },
      stats: {
        today: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        week: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        streak: 0
      }
    }
  } });
  assert.equal(webview.elements.get('timer-display').textContent, '25:00');
  assert.equal(webview.elements.get('focus-duration-select').value, '25');
  webview.elements.get('timer-primary').listeners.get('click')();
  assert.equal(webview.posted.some(({ type, action }) => type === 'productivity' && action === 'start'), true);
});

test('focus duration presets and custom minutes post validated actions', () => {
  const webview = loadWebview();
  webview.message({ data: {
    command: 'productivityState',
    state: {
      tasks: [], selectedTaskId: null, selectedTaskTitle: '', reminders: [],
      focusMinutes: 25,
      timer: { phase: 'focus', status: 'idle', remainingMs: 25 * 60000 },
      stats: {
        today: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        week: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        streak: 0
      }
    }
  } });

  const select = webview.elements.get('focus-duration-select');
  select.value = '45';
  select.listeners.get('change')();
  assert.equal(
    webview.posted.some(({ action, minutes }) => action === 'setFocusMinutes' && minutes === 45),
    true
  );

  webview.message({ data: {
    command: 'productivityState',
    state: {
      tasks: [], selectedTaskId: null, selectedTaskTitle: '', reminders: [],
      focusMinutes: 45,
      timer: { phase: 'focus', status: 'idle', remainingMs: 45 * 60000 },
      stats: {
        today: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        week: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        streak: 0
      }
    }
  } });
  select.value = 'custom';
  select.listeners.get('change')();
  assert.equal(webview.elements.get('focus-duration-custom').hidden, false);

  const input = webview.elements.get('focus-duration-input');
  input.value = '37';
  webview.elements.get('focus-duration-custom').listeners.get('submit')({ preventDefault() {} });
  assert.equal(
    webview.posted.some(({ action, minutes }) => action === 'setFocusMinutes' && minutes === 37),
    true
  );
});

test('focus duration controls lock while a timer is active', () => {
  const webview = loadWebview();
  webview.message({ data: {
    command: 'productivityState',
    state: {
      tasks: [], selectedTaskId: null, selectedTaskTitle: '', reminders: [],
      focusMinutes: 45,
      timer: { phase: 'focus', status: 'running', remainingMs: 44 * 60000 },
      stats: {
        today: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        week: { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 },
        streak: 0
      }
    }
  } });

  assert.equal(webview.elements.get('focus-duration-select').disabled, true);
  assert.equal(webview.elements.get('focus-duration-input').disabled, true);
  assert.match(webview.elements.get('focus-duration-hint').textContent, /结束或重置/);
});

test('tabs support arrow-key navigation and keep one focusable tab', () => {
  const webview = loadWebview();
  const focusTab = webview.elements.get('tab-focus');
  const tasksTab = webview.elements.get('tab-tasks');
  let prevented = false;

  focusTab.listeners.get('keydown')({
    key: 'ArrowRight',
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(tasksTab.focused, true);
  assert.equal(tasksTab.attributes.get('aria-selected'), 'true');
  assert.equal(tasksTab.attributes.get('tabindex'), '0');
  assert.equal(focusTab.attributes.get('tabindex'), '-1');
  assert.equal(webview.elements.get('tasks-panel').hidden, false);
  assert.equal(webview.elements.get('focus-panel').hidden, true);
});

test('failed task submission keeps the draft and shows inline recovery feedback', () => {
  const webview = loadWebview();
  const taskInput = webview.elements.get('task-input');
  const taskSubmit = webview.elements.get('task-submit');
  taskInput.value = '保留这段草稿';

  webview.elements.get('task-form').listeners.get('submit')({ preventDefault() {} });
  assert.equal(taskSubmit.disabled, true);

  webview.message({ data: { command: 'productivityError', text: '今日任务已达到上限。' } });
  assert.equal(taskInput.value, '保留这段草稿');
  assert.equal(taskSubmit.disabled, false);
  assert.equal(webview.elements.get('productivity-message').hidden, false);
  assert.equal(webview.elements.get('productivity-message').textContent, '今日任务已达到上限。');
});

test('relationship controls expose and clamp manual mood and affinity settings', () => {
  const webview = loadWebview();
  webview.message({ data: { command: 'settings', settings: { relationshipEnabled: true } } });

  const mood = webview.elements.get('mood-select');
  const affinity = webview.elements.get('affinity-number');
  mood.value = '-2';
  mood.listeners.get('change')();
  affinity.value = '140';
  affinity.listeners.get('change')();

  assert.equal(mood.value, '-2');
  assert.equal(affinity.value, '100');
  assert.equal(webview.elements.get('affinity-output').textContent, '100');

  const enabled = webview.elements.get('relationship-enabled');
  enabled.checked = false;
  enabled.listeners.get('change')();
  assert.equal(webview.posted.some((message) => (
    message.type === 'relationshipSettings' && message.enabled === false
  )), true);

  webview.elements.get('reset-relationship').listeners.get('click')();
  assert.equal(mood.value, '0');
  assert.equal(affinity.value, '0');
});

test('manual relationship values select distinct interaction dialogue', () => {
  const webview = loadWebview();
  const mood = webview.elements.get('mood-select');
  const affinity = webview.elements.get('affinity-number');

  mood.value = '-2';
  mood.listeners.get('change')();
  affinity.value = '100';
  affinity.listeners.get('change')();
  webview.message({ data: { command: 'play' } });
  assert.equal(webview.elements.get('speech').textContent, '别以为靠近一点就能蒙混过关……我只是暂时不想凶老师。');
});

test('scene selection updates the local background and posts the setting', () => {
  const webview = loadWebview();
  webview.message({ data: { command: 'settings', settings: { scene: 'office' } } });
  assert.equal(webview.elements.get('world').dataset.scene, 'office');
  assert.equal(webview.elements.get('scene-name').textContent, '简洁办公室');

  const scene = webview.elements.get('scene-select');
  scene.value = 'transparent';
  scene.listeners.get('change')();
  assert.equal(webview.elements.get('world').dataset.scene, 'transparent');
  assert.equal(webview.posted.some((message) => (
    message.type === 'appearanceSettings' && message.scene === 'transparent'
  )), true);
});

test('pajama appearance uses the v2 horizontal cardinals and posts outfit changes', () => {
  const webview = loadWebview();
  const world = webview.elements.get('world');
  const pet = webview.elements.get('pet');

  webview.message({ data: { command: 'settings', settings: { outfit: 'pajama' } } });
  assert.equal(world.dataset.outfit, 'pajama');
  assert.equal(webview.elements.get('outfit-name').textContent, '睡衣');

  world.listeners.get('pointermove')({ clientX: 700 });
  const dwellTimer = [...webview.timers.values()].find(({ delay }) => delay === 450);
  dwellTimer.callback();
  assert.equal(pet.style.backgroundPosition, '-576px -1404px');

  const returnTimer = [...webview.timers.values()].find(({ delay }) => delay === 1400);
  returnTimer.callback();
  world.listeners.get('pointermove')({ clientX: 0 });
  const leftDwellTimer = [...webview.timers.values()].filter(({ delay }) => delay === 450).at(-1);
  leftDwellTimer.callback();
  assert.equal(pet.style.backgroundPosition, '-576px -1560px');

  const outfit = webview.elements.get('outfit-select');
  outfit.value = 'classic';
  outfit.listeners.get('change')();
  assert.equal(world.dataset.outfit, 'classic');
  assert.equal(webview.posted.some((message) => (
    message.type === 'appearanceSettings' && message.outfit === 'classic'
  )), true);
});

test('pajama appearance maps app feedback to matching v2 animation semantics', () => {
  function positionAfter(...commands) {
    const webview = loadWebview();
    webview.message({ data: { command: 'settings', settings: { outfit: 'pajama' } } });
    for (const command of commands) webview.message({ data: { command } });
    return webview.elements.get('pet').style.backgroundPosition;
  }

  assert.equal(positionAfter('think'), '0px -1248px');
  assert.equal(positionAfter('milestone'), '0px -468px');
  assert.equal(positionAfter('typingReminder'), '0px -936px');

  const interrupted = loadWebview();
  interrupted.message({ data: { command: 'settings', settings: { outfit: 'pajama' } } });
  interrupted.message({ data: { command: 'work' } });
  interrupted.elements.get('world').listeners.get('click')({
    target: interrupted.elements.get('world'),
    clientX: 0
  });
  assert.equal(interrupted.elements.get('pet').style.backgroundPosition, '0px -780px');
});

test('pajama appearance slows frame loops and one-shot actions without changing classic timing', () => {
  const classic = loadWebview();
  const classicWorld = classic.elements.get('world');
  classicWorld.listeners.get('click')({ target: classicWorld, clientX: 700 });
  assert.equal([...classic.timers.values()].some(({ delay }) => delay === 95), true);

  const pajama = loadWebview();
  const pajamaWorld = pajama.elements.get('world');
  pajama.message({ data: { command: 'settings', settings: { outfit: 'pajama' } } });
  pajamaWorld.listeners.get('click')({ target: pajamaWorld, clientX: 700 });
  assert.equal([...pajama.timers.values()].some(({ delay }) => delay === 180), true);

  pajama.message({ data: { command: 'jump' } });
  assert.equal([...pajama.timers.values()].some(({ delay }) => delay === 210), true);
  assert.equal([...pajama.timers.values()].some(({ delay }) => delay === 1650), true);
});
