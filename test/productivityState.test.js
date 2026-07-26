'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  completeTimer,
  dateKey,
  isQuietTime,
  normalizeStats,
  normalizeWorkspaceState,
  pauseTimer,
  recordDaily,
  startTimer,
  statsSummary,
  timerSnapshot
} = require('../productivityState');

const durations = { focus: 25 * 60000, shortBreak: 5 * 60000, longBreak: 15 * 60000 };

test('running timer restores from its absolute end time', () => {
  const workspace = normalizeWorkspaceState({}, durations, 1000);
  const running = startTimer(workspace.timer, durations, 1000);
  assert.equal(timerSnapshot(running, 61000).remainingMs, 24 * 60000);
  const paused = pauseTimer(running, 61000);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.remainingMs, 24 * 60000);
  assert.equal(startTimer(paused, durations, 120000).endAt, 120000 + 24 * 60000);
});

test('every fourth completed focus selects a long break', () => {
  let workspace = normalizeWorkspaceState({}, durations, 0);
  workspace.focusCycles = 3;
  workspace.timer = startTimer(workspace.timer, durations, 0);
  const result = completeTimer(workspace, durations, 4);
  assert.equal(result.completedPhase, 'focus');
  assert.equal(result.workspace.focusCycles, 4);
  assert.equal(result.workspace.timer.phase, 'longBreak');
});

test('statistics summarize today, current week, and focus streak', () => {
  const now = new Date(2026, 6, 26, 12).getTime();
  let stats = normalizeStats({});
  stats = recordDaily(stats, '2026-07-24', { focusSessions: 1, focusMinutes: 25 });
  stats = recordDaily(stats, '2026-07-25', { focusSessions: 2, focusMinutes: 50 });
  stats = recordDaily(stats, dateKey(now), { focusSessions: 1, focusMinutes: 25, tasksCompleted: 3 });
  const summary = statsSummary(stats, now);
  assert.deepEqual(summary.today, { focusSessions: 1, focusMinutes: 25, tasksCompleted: 3 });
  assert.deepEqual(summary.week, { focusSessions: 4, focusMinutes: 100, tasksCompleted: 3 });
  assert.equal(summary.streak, 3);
});

test('quiet hours support ranges that cross midnight', () => {
  assert.equal(isQuietTime(new Date(2026, 6, 26, 23, 0).getTime(), '22:00', '08:00'), true);
  assert.equal(isQuietTime(new Date(2026, 6, 26, 7, 59).getTime(), '22:00', '08:00'), true);
  assert.equal(isQuietTime(new Date(2026, 6, 26, 12, 0).getTime(), '22:00', '08:00'), false);
});
