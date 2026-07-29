'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProductivityController } = require('../productivityController');
const { MAX_REMINDERS, MAX_TASKS } = require('../productivityState');

function createHarness(options = {}) {
  const workspaceValues = new Map();
  const globalValues = new Map();
  const posted = [];
  const errors = [];
  const context = {
    subscriptions: [],
    workspaceState: {
      get: (key) => workspaceValues.get(key),
      update: async (key, value) => {
        if (options.failWorkspaceUpdates) throw new Error('simulated persistence failure');
        workspaceValues.set(key, structuredClone(value));
      }
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
      showWarningMessage: async () => undefined,
      showErrorMessage: async (text) => errors.push(text)
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
  return { controller, context, errors, globalValues, posted, workspaceValues };
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

test('task and reminder creation reject values beyond their explicit limits', async (t) => {
  const harness = createHarness();
  t.after(() => harness.context.subscriptions.forEach(({ dispose }) => dispose()));
  harness.controller.workspace.tasks = Array.from({ length: MAX_TASKS }, (_, index) => ({
    id: `task-${index}`,
    title: `Task ${index}`,
    completed: false,
    counted: false,
    createdAt: Date.now(),
    completedAt: null
  }));
  harness.controller.workspace.reminders = Array.from({ length: MAX_REMINDERS }, (_, index) => ({
    id: `reminder-${index}`,
    text: `Reminder ${index}`,
    dueAt: Date.now() + 60000 + index
  }));

  await harness.controller.handleAction('addTask', { title: 'One too many' });
  await harness.controller.handleAction('addReminder', {
    text: 'One too many',
    dueAt: Date.now() + 120000
  });

  assert.equal(harness.controller.workspace.tasks.length, MAX_TASKS);
  assert.equal(harness.controller.workspace.reminders.length, MAX_REMINDERS);
  assert.equal(harness.posted.some(({ text }) => text?.includes(`${MAX_TASKS} 项`)), true);
  assert.equal(harness.posted.some(({ text }) => text?.includes(`${MAX_REMINDERS} 项`)), true);
});

test('persistence failures are caught and reported without applying the action', async (t) => {
  const harness = createHarness({ failWorkspaceUpdates: true });
  t.after(() => harness.context.subscriptions.forEach(({ dispose }) => dispose()));
  const originalConsoleError = console.error;
  console.error = () => {};
  t.after(() => { console.error = originalConsoleError; });

  await assert.doesNotReject(() => harness.controller.handleAction('addTask', { title: 'Keep draft' }));

  assert.equal(harness.controller.workspace.tasks.length, 0);
  assert.equal(harness.errors.length, 1);
  assert.equal(harness.posted.some(({ command }) => command === 'productivityError'), true);
});
