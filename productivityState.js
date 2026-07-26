'use strict';

const PHASES = new Set(['focus', 'shortBreak', 'longBreak']);
const STATUSES = new Set(['idle', 'running', 'paused']);

function normalizeDurations(durations) {
  return {
    focus: positiveNumber(durations?.focus, 25 * 60000),
    shortBreak: positiveNumber(durations?.shortBreak, 5 * 60000),
    longBreak: positiveNumber(durations?.longBreak, 15 * 60000)
  };
}

function normalizeWorkspaceState(raw, durations, now = Date.now()) {
  const safeDurations = normalizeDurations(durations);
  const source = raw && typeof raw === 'object' ? raw : {};
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.filter(validTask).slice(0, 100).map((task) => ({
      id: task.id,
      title: task.title.slice(0, 120),
      completed: Boolean(task.completed),
      counted: Boolean(task.counted),
      createdAt: finiteNumber(task.createdAt, now),
      completedAt: Number.isFinite(task.completedAt) ? task.completedAt : null
    }))
    : [];
  const selectedTaskId = tasks.some(({ id }) => id === source.selectedTaskId)
    ? source.selectedTaskId
    : null;
  const phase = PHASES.has(source.timer?.phase) ? source.timer.phase : 'focus';
  let status = STATUSES.has(source.timer?.status) ? source.timer.status : 'idle';
  const durationMs = positiveNumber(source.timer?.durationMs, safeDurations[phase]);
  const remainingMs = positiveNumber(source.timer?.remainingMs, durationMs);
  const endAt = Number.isFinite(source.timer?.endAt) ? source.timer.endAt : null;
  if (status === 'running' && endAt === null) status = 'paused';
  const reminders = Array.isArray(source.reminders)
    ? source.reminders.filter(validReminder).slice(0, 50).map((reminder) => ({
      id: reminder.id,
      text: reminder.text.slice(0, 120),
      dueAt: reminder.dueAt
    }))
    : [];

  return {
    version: 1,
    tasks,
    selectedTaskId,
    timer: { phase, status, durationMs, remainingMs, endAt },
    focusCycles: Math.max(0, Math.floor(finiteNumber(source.focusCycles, 0))),
    reminders,
    lastHydrationAt: finiteNumber(source.lastHydrationAt, now),
    lastHourlyKey: typeof source.lastHourlyKey === 'string' ? source.lastHourlyKey : null
  };
}

function normalizeStats(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const daily = {};
  if (source.daily && typeof source.daily === 'object') {
    for (const [key, value] of Object.entries(source.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue;
      daily[key] = {
        focusSessions: nonNegativeInteger(value.focusSessions),
        focusMinutes: nonNegativeInteger(value.focusMinutes),
        tasksCompleted: nonNegativeInteger(value.tasksCompleted)
      };
    }
  }
  return { version: 1, daily };
}

function timerSnapshot(timer, now = Date.now()) {
  const remainingMs = timer.status === 'running'
    ? Math.max(0, timer.endAt - now)
    : Math.max(0, timer.remainingMs);
  return { ...timer, remainingMs };
}

function startTimer(timer, durations, now = Date.now()) {
  const safeDurations = normalizeDurations(durations);
  const phase = PHASES.has(timer?.phase) ? timer.phase : 'focus';
  const fallback = safeDurations[phase];
  const remainingMs = timer?.status === 'paused'
    ? positiveNumber(timer.remainingMs, fallback)
    : fallback;
  return {
    phase,
    status: 'running',
    durationMs: timer?.status === 'paused' ? positiveNumber(timer.durationMs, fallback) : fallback,
    remainingMs,
    endAt: now + remainingMs
  };
}

function pauseTimer(timer, now = Date.now()) {
  if (timer.status !== 'running') return timer;
  return { ...timer, status: 'paused', remainingMs: Math.max(0, timer.endAt - now), endAt: null };
}

function resetTimer(durations, phase = 'focus') {
  const safeDurations = normalizeDurations(durations);
  const safePhase = PHASES.has(phase) ? phase : 'focus';
  return {
    phase: safePhase,
    status: 'idle',
    durationMs: safeDurations[safePhase],
    remainingMs: safeDurations[safePhase],
    endAt: null
  };
}

function completeTimer(workspace, durations, longBreakEvery = 4) {
  const completedPhase = workspace.timer.phase;
  let focusCycles = workspace.focusCycles;
  let nextPhase = 'focus';
  if (completedPhase === 'focus') {
    focusCycles += 1;
    const interval = Math.max(1, Math.floor(longBreakEvery));
    nextPhase = focusCycles % interval === 0 ? 'longBreak' : 'shortBreak';
  }
  return {
    workspace: {
      ...workspace,
      focusCycles,
      timer: resetTimer(durations, nextPhase)
    },
    completedPhase,
    completedMinutes: Math.max(1, Math.round(workspace.timer.durationMs / 60000))
  };
}

function recordDaily(stats, date, increments) {
  const normalized = normalizeStats(stats);
  const current = normalized.daily[date] || { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 };
  return {
    version: 1,
    daily: {
      ...normalized.daily,
      [date]: {
        focusSessions: current.focusSessions + nonNegativeInteger(increments.focusSessions),
        focusMinutes: current.focusMinutes + nonNegativeInteger(increments.focusMinutes),
        tasksCompleted: current.tasksCompleted + nonNegativeInteger(increments.tasksCompleted)
      }
    }
  };
}

function statsSummary(stats, now = Date.now()) {
  const normalized = normalizeStats(stats);
  const today = dateKey(now);
  const todayStats = normalized.daily[today] || zeroStats();
  const current = new Date(now);
  const mondayOffset = (current.getDay() + 6) % 7;
  const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - mondayOffset);
  const week = zeroStats();
  for (let i = 0; i < 7; i += 1) {
    const key = dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime());
    const entry = normalized.daily[key] || zeroStats();
    week.focusSessions += entry.focusSessions;
    week.focusMinutes += entry.focusMinutes;
    week.tasksCompleted += entry.tasksCompleted;
  }

  let streak = 0;
  const cursor = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  if ((normalized.daily[today]?.focusSessions || 0) === 0) cursor.setDate(cursor.getDate() - 1);
  while ((normalized.daily[dateKey(cursor.getTime())]?.focusSessions || 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { today: { ...todayStats }, week, streak };
}

function dateKey(now = Date.now()) {
  const date = new Date(now);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function hourKey(now = Date.now()) {
  const date = new Date(now);
  return `${dateKey(now)}-${String(date.getHours()).padStart(2, '0')}`;
}

function isQuietTime(now, start, end) {
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
  const date = new Date(now);
  const current = date.getHours() * 60 + date.getMinutes();
  return startMinutes < endMinutes
    ? current >= startMinutes && current < endMinutes
    : current >= startMinutes || current < endMinutes;
}

function parseClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function validTask(task) {
  return task && typeof task.id === 'string' && typeof task.title === 'string' && task.title.trim();
}

function validReminder(reminder) {
  return reminder && typeof reminder.id === 'string' && typeof reminder.text === 'string'
    && reminder.text.trim() && Number.isFinite(reminder.dueAt);
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeInteger(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function zeroStats() {
  return { focusSessions: 0, focusMinutes: 0, tasksCompleted: 0 };
}

module.exports = {
  completeTimer,
  dateKey,
  hourKey,
  isQuietTime,
  normalizeDurations,
  normalizeStats,
  normalizeWorkspaceState,
  pauseTimer,
  recordDaily,
  resetTimer,
  startTimer,
  statsSummary,
  timerSnapshot
};
