'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProductivityController } = require('../productivityController');

function createHarness() {
  const workspaceValues = new Map();
  const globalValues = new Map();
  const posted = [];
  const context = {
    subscriptions: [],
    workspaceState: {
      get: (key) => workspaceValues.get(key),
      update: async (key, value) => workspaceValues.set(key, structuredClone(value))
    },
    globalState: {
      get: (key) => globalValues.get(key),
      update: async (key, value) => globalValues.set(key, structuredClone(value))
    }
  };
  const provider = {
    post: (command, payload = {}) => posted.push({ command, ...payload }),
    notify: (command, payload = {}) => posted.push({ command, ...payload })
  };
  const vscode = {
    window: {
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => undefined
    }
  };
  const settings = () => ({
    durations: { focus: 60000, shortBreak: 30000, longBreak: 90000 },
    longBreakEvery: 4,
    remindersEnabled: false,
    hydrationMinutes: 60,
    hourlyReminder: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00'
  });
  const controller = new ProductivityController(context, provider, vscode, settings);
  return { controller, context, globalValues, posted };
}

test('tasks persist locally and only count their first completion', async (t) => {
  const harness = createHarness();
  t.after(() => harness.context.subscriptions.forEach(({ dispose }) => dispose()));
  await harness.controller.handleAction('addTask', { title: '  Review plan  ' });
  const task = harness.controller.workspace.tasks[0];
  assert.equal(task.title, 'Review plan');
  await harness.controller.handleAction('toggleTask', { id: task.id });
  await harness.controller.handleAction('toggleTask', { id: task.id });
  await harness.controller.handleAction('toggleTask', { id: task.id });
  const entries = Object.values(harness.controller.stats.daily);
  assert.equal(entries.reduce((sum, entry) => sum + entry.tasksCompleted, 0), 1);
});

test('elapsed focus records statistics and switches to a break', async (t) => {
  const harness = createHarness();
  t.after(() => harness.context.subscriptions.forEach(({ dispose }) => dispose()));
  await harness.controller.handleAction('start');
  harness.controller.workspace.timer.endAt = 0;
  await harness.controller.tick();
  assert.equal(harness.controller.workspace.timer.phase, 'shortBreak');
  const entries = Object.values(harness.controller.stats.daily);
  assert.equal(entries.reduce((sum, entry) => sum + entry.focusSessions, 0), 1);
  assert.equal(harness.posted.some(({ command }) => command === 'focusCompleted'), true);
});
