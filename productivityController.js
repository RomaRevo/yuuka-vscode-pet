'use strict';

const {
  MAX_REMINDERS,
  MAX_TASKS,
  completeTimer,
  dateKey,
  hourKey,
  isQuietTime,
  normalizeStats,
  normalizeWorkspaceState,
  pauseTimer,
  recordDaily,
  resetTimer,
  rolloverWorkspaceTasks,
  startTimer,
  statsSummary,
  timerSnapshot
} = require('./productivityState');

const WORKSPACE_KEY = 'yuukaPet.productivity.workspace.v1';
const STATS_KEY = 'yuukaPet.productivity.stats.v1';
const MIN_FOCUS_MINUTES = 1;
const MAX_FOCUS_MINUTES = 180;

class ProductivityController {
  constructor(context, provider, vscode, getSettings) {
    this.context = context;
    this.provider = provider;
    this.vscode = vscode;
    this.getSettings = getSettings;
    const storedWorkspace = context.workspaceState.get(WORKSPACE_KEY);
    this.workspace = normalizeWorkspaceState(storedWorkspace, this.getSettings().durations);
    this.stats = normalizeStats(context.globalState.get(STATS_KEY));
    this.pendingWorkspaceSave = storedWorkspace?.version !== this.workspace.version
      || storedWorkspace?.taskDate !== this.workspace.taskDate;
    this.queue = Promise.resolve();
    this.interval = setInterval(() => void this.tick(), 1000);
    context.subscriptions.push({ dispose: () => clearInterval(this.interval) });
  }

  viewState(now = Date.now()) {
    const selectedTask = this.workspace.tasks.find(({ id }) => id === this.workspace.selectedTaskId) || null;
    return {
      tasks: this.workspace.tasks,
      selectedTaskId: this.workspace.selectedTaskId,
      selectedTaskTitle: selectedTask?.title || '',
      focusMinutes: Math.round(this.getSettings().durations.focus / 60000),
      timer: timerSnapshot(this.workspace.timer, now),
      reminders: this.workspace.reminders.slice().sort((a, b) => a.dueAt - b.dueAt),
      stats: statsSummary(this.stats, now)
    };
  }

  sync(restoreActive = false) {
    this.provider.post('productivityState', { state: this.viewState(), restoreActive });
  }

  syncVisible() {
    this.provider.notify('productivityState', { state: this.viewState() });
  }

  handleAction(action, payload = {}) {
    return this.enqueue(`productivity action "${action}"`, () => this.handleActionNow(action, payload));
  }

  async handleActionNow(action, payload = {}) {
    const now = Date.now();
    const settings = this.getSettings();
    await this.ensureCurrentDay(now);
    if (action === 'start') {
      this.workspace.timer = startTimer(this.workspace.timer, settings.durations, now);
      await this.saveWorkspace();
      this.sync();
      this.provider.post(this.workspace.timer.phase === 'focus' ? 'focusStarted' : 'breakStarted');
      return;
    }
    if (action === 'pause') {
      this.workspace.timer = pauseTimer(this.workspace.timer, now);
      await this.saveWorkspace();
      this.sync();
      this.provider.post('focusPaused');
      return;
    }
    if (action === 'stop') {
      this.workspace.timer = resetTimer(settings.durations, 'focus');
      await this.saveWorkspace();
      this.sync();
      this.provider.post('focusStopped');
      return;
    }
    if (action === 'reset') {
      this.workspace.timer = resetTimer(settings.durations, this.workspace.timer.phase);
      await this.saveWorkspace();
      this.sync();
      this.provider.post('focusStopped');
      return;
    }
    if (action === 'setFocusMinutes') {
      if (this.workspace.timer.status !== 'idle') {
        return this.error('请先结束或重置当前计时，再修改专注时长。');
      }
      const minutes = Number(payload.minutes);
      if (!Number.isInteger(minutes) || minutes < MIN_FOCUS_MINUTES || minutes > MAX_FOCUS_MINUTES) {
        return this.error(`专注时长必须是 ${MIN_FOCUS_MINUTES}–${MAX_FOCUS_MINUTES} 分钟之间的整数。`);
      }
      await this.vscode.workspace.getConfiguration('yuukaPet.focus')
        .update('focusMinutes', minutes, this.vscode.ConfigurationTarget.Global);
      const durations = { ...settings.durations, focus: minutes * 60000 };
      if (this.workspace.timer.phase === 'focus') {
        this.workspace.timer = resetTimer(durations, 'focus');
        await this.saveWorkspace();
      }
      this.sync();
      return;
    }
    if (action === 'addTask') {
      const title = cleanText(payload.title);
      if (!title) return this.error('任务内容不能为空。');
      if (this.workspace.tasks.length >= MAX_TASKS) {
        return this.error(`今日任务已达到 ${MAX_TASKS} 项，请完成或删除部分任务后再添加。`);
      }
      this.workspace.tasks.push({
        id: makeId('task'), title, completed: false, counted: false, createdAt: now, completedAt: null
      });
      await this.saveWorkspace();
      this.sync();
      return;
    }
    if (action === 'toggleTask') {
      const task = this.workspace.tasks.find(({ id }) => id === payload.id);
      if (!task) return;
      task.completed = !task.completed;
      task.completedAt = task.completed ? now : null;
      if (task.completed && !task.counted) {
        task.counted = true;
        this.stats = recordDaily(this.stats, dateKey(now), { tasksCompleted: 1 });
        await this.saveStats();
      }
      if (task.completed && this.workspace.selectedTaskId === task.id) this.workspace.selectedTaskId = null;
      await this.saveWorkspace();
      this.sync();
      if (task.completed) this.provider.post('localTaskCompleted', { title: task.title });
      return;
    }
    if (action === 'deleteTask') {
      this.workspace.tasks = this.workspace.tasks.filter(({ id }) => id !== payload.id);
      if (this.workspace.selectedTaskId === payload.id) this.workspace.selectedTaskId = null;
      await this.saveWorkspace();
      this.sync();
      return;
    }
    if (action === 'selectTask') {
      const task = this.workspace.tasks.find((candidate) => candidate.id === payload.id && !candidate.completed);
      if (!task || task.completed) return;
      this.workspace.selectedTaskId = this.workspace.selectedTaskId === task.id ? null : task.id;
      await this.saveWorkspace();
      this.sync();
      return;
    }
    if (action === 'addReminder') {
      const text = cleanText(payload.text);
      const dueAt = Number(payload.dueAt);
      if (!text) return this.error('提醒内容不能为空。');
      if (!Number.isFinite(dueAt) || dueAt <= now) return this.error('请选择未来的提醒时间。');
      if (this.workspace.reminders.length >= MAX_REMINDERS) {
        return this.error(`待处理提醒已达到 ${MAX_REMINDERS} 项，请删除部分提醒后再添加。`);
      }
      this.workspace.reminders.push({ id: makeId('reminder'), text, dueAt });
      await this.saveWorkspace();
      this.sync();
      return;
    }
    if (action === 'deleteReminder') {
      this.workspace.reminders = this.workspace.reminders.filter(({ id }) => id !== payload.id);
      await this.saveWorkspace();
      this.sync();
      return;
    }
    if (action === 'clearStats') {
      const choice = await this.vscode.window.showWarningMessage(
        '清除本机保存的全部专注统计？任务和计时器不会被删除。',
        { modal: true },
        '清除统计'
      );
      if (choice !== '清除统计') return;
      this.stats = normalizeStats({});
      await this.saveStats();
      this.sync();
    }
  }

  refreshSettings() {
    return this.enqueue('refresh productivity settings', () => this.refreshSettingsNow());
  }

  async refreshSettingsNow() {
    if (this.workspace.timer.status === 'idle') {
      this.workspace.timer = resetTimer(this.getSettings().durations, this.workspace.timer.phase);
      await this.saveWorkspace();
    }
    this.sync();
  }

  tick() {
    return this.enqueue('productivity timer tick', () => this.tickNow());
  }

  async tickNow() {
    const now = Date.now();
    const settings = this.getSettings();
    await this.ensureCurrentDay(now);
    if (this.workspace.timer.status === 'running' && this.workspace.timer.endAt <= now) {
      const result = completeTimer(this.workspace, settings.durations, settings.longBreakEvery);
      this.workspace = result.workspace;
      if (result.completedPhase === 'focus') {
        this.stats = recordDaily(this.stats, dateKey(now), {
          focusSessions: 1,
          focusMinutes: result.completedMinutes
        });
        await this.saveStats();
        void this.vscode.window.showInformationMessage('优香：专注完成，按计划休息一下吧。');
        this.provider.notify('focusCompleted', { nextPhase: this.workspace.timer.phase });
      } else {
        void this.vscode.window.showInformationMessage('优香：休息结束，准备继续下一轮计划吧。');
        this.provider.notify('breakCompleted');
      }
      await this.saveWorkspace();
    }
    await this.checkReminders(now, settings);
    this.syncVisible();
  }

  async checkReminders(now, settings) {
    if (isQuietTime(now, settings.quietHoursStart, settings.quietHoursEnd)) return;
    const due = this.workspace.reminders.filter(({ dueAt }) => dueAt <= now);
    if (due.length) {
      this.workspace.reminders = this.workspace.reminders.filter(({ dueAt }) => dueAt > now);
      await this.saveWorkspace();
      const summary = due.slice(0, 3).map(({ text }) => text).join('；');
      const suffix = due.length > 3 ? `；另有 ${due.length - 3} 项` : '';
      void this.vscode.window.showInformationMessage(`优香提醒：${summary}${suffix}`);
      this.provider.notify('reminderDue', { text: summary });
      return;
    }
    if (!settings.remindersEnabled) return;
    if (settings.hydrationMinutes > 0
      && now - this.workspace.lastHydrationAt >= settings.hydrationMinutes * 60000) {
      this.workspace.lastHydrationAt = now;
      await this.saveWorkspace();
      void this.vscode.window.showInformationMessage('优香提醒：喝点水，也活动一下肩颈吧。');
      this.provider.notify('hydrationReminder');
      return;
    }
    const date = new Date(now);
    const currentHourKey = hourKey(now);
    if (settings.hourlyReminder && date.getMinutes() === 0 && this.workspace.lastHourlyKey !== currentHourKey) {
      this.workspace.lastHourlyKey = currentHourKey;
      await this.saveWorkspace();
      void this.vscode.window.showInformationMessage('优香提醒：整点了，检查一下当前计划的进度吧。');
      this.provider.notify('hourlyReminder');
    }
  }

  error(text) {
    this.provider.post('productivityError', { text });
  }

  async ensureCurrentDay(now) {
    const result = rolloverWorkspaceTasks(this.workspace, now);
    if (result.changed) {
      this.workspace = result.workspace;
      this.pendingWorkspaceSave = true;
    }
    if (!this.pendingWorkspaceSave) return;
    await this.saveWorkspace();
    this.pendingWorkspaceSave = false;
  }

  enqueue(label, operation) {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => undefined);
    return pending.catch((error) => {
      this.reportFailure(label, error);
      return undefined;
    });
  }

  reportFailure(label, error) {
    console.error(`[Yuuka Pet] ${label} failed`, error);
    const text = '本地状态保存失败，请稍后重试。';
    this.provider.post('productivityError', { text });
    void this.vscode.window.showErrorMessage(`优香：${text}`);
  }

  saveWorkspace() {
    return this.context.workspaceState.update(WORKSPACE_KEY, this.workspace);
  }

  saveStats() {
    return this.context.globalState.update(STATS_KEY, this.stats);
  }
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = {
  MAX_FOCUS_MINUTES,
  MIN_FOCUS_MINUTES,
  ProductivityController,
  STATS_KEY,
  WORKSPACE_KEY
};
