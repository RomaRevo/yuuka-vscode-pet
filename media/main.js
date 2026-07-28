(() => {
  const vscode = acquireVsCodeApi();
  const world = document.getElementById('world');
  const pet = document.getElementById('pet');
  const speech = document.getElementById('speech');
  const timerPhase = document.getElementById('timer-phase');
  const timerTask = document.getElementById('timer-task');
  const timerDisplay = document.getElementById('timer-display');
  const timerPrimary = document.getElementById('timer-primary');
  const timerStop = document.getElementById('timer-stop');
  const timerReset = document.getElementById('timer-reset');
  const taskList = document.getElementById('task-list');
  const taskEmpty = document.getElementById('task-empty');
  const reminderList = document.getElementById('reminder-list');
  const reminderEmpty = document.getElementById('reminder-empty');
  const relationshipEnabled = document.getElementById('relationship-enabled');
  const relationshipControls = document.getElementById('relationship-controls');
  const moodSelect = document.getElementById('mood-select');
  const affinityRange = document.getElementById('affinity-range');
  const affinityNumber = document.getElementById('affinity-number');
  const affinityOutput = document.getElementById('affinity-output');
  const sceneSelect = document.getElementById('scene-select');
  const sceneName = document.getElementById('scene-name');
  const sceneDetail = document.getElementById('scene-detail');
  const dialogue = window.YUUKA_DIALOGUE || {};
  const relationshipDialogue = window.YUUKA_RELATIONSHIP_DIALOGUE || {};
  const dialoguePolicy = window.YUUKA_DIALOGUE_POLICY;
  const persisted = vscode.getState() || {};
  const frameW = 72;
  const frameH = 78;
  const scale = 2;
  const rows = {
    idle: { row: 0, count: 7, speed: 430 },
    right: { row: 1, count: 8, speed: 95 },
    left: { row: 2, count: 8, speed: 95 },
    greet: { row: 3, count: 4, speed: 180 },
    jump: { row: 4, count: 5, speed: 110 },
    alert: { row: 5, count: 8, speed: 150 },
    think: { row: 6, count: 6, speed: 260 },
    work: { row: 7, count: 6, speed: 210 },
    celebrate: { row: 8, count: 6, speed: 140 },
    lookRight: { row: 9, count: 8, speed: 180 },
    lookLeft: { row: 10, count: 8, speed: 180 },
    workAngry: { row: 11, count: 6, speed: 210 }
  };
  const recentDialogue = [];
  let settings = {
    relationshipEnabled: true,
    randomEventFrequency: 'low',
    scene: 'millennium'
  };
  let relationship = {
    mood: Number.isFinite(persisted.mood) ? Math.max(-2, Math.min(2, Math.round(persisted.mood))) : 0,
    affinity: Number.isFinite(persisted.affinity) ? Math.max(0, Math.min(100, Math.round(persisted.affinity))) : 0
  };
  let state = 'idle';
  let frame = 0;
  let x = 0;
  let targetX = null;
  let workLocked = false;
  let focusActive = false;
  let productivity = null;
  let loopTimer = null;
  let oneShotTimer = null;
  let workReactionTimer = null;
  let lookIntentTimer = null;
  let lookReturnTimer = null;
  let randomEventTimer = null;
  let pointerStart = null;
  let dragging = false;
  let lastInteractionAt = 0;
  let lastWorkInterruptionAt = 0;
  let lastPassiveReactionAt = 0;

  function persistRelationship() {
    vscode.setState({ ...persisted, ...relationship });
  }

  function renderRelationship() {
    relationshipEnabled.checked = settings.relationshipEnabled;
    relationshipControls.classList.toggle('disabled', !settings.relationshipEnabled);
    for (const control of relationshipControls.querySelectorAll('input, select, button')) {
      control.disabled = !settings.relationshipEnabled;
    }
    moodSelect.value = String(relationship.mood);
    affinityRange.value = String(relationship.affinity);
    affinityNumber.value = String(relationship.affinity);
    affinityOutput.textContent = String(relationship.affinity);
  }

  function setRelationship(mood, affinity) {
    relationship = {
      mood: Math.max(-2, Math.min(2, Math.round(Number(mood) || 0))),
      affinity: Math.max(0, Math.min(100, Math.round(Number(affinity) || 0)))
    };
    persistRelationship();
    renderRelationship();
  }

  function renderScene() {
    const scenes = {
      office: ['简洁办公室', '柔和窗光与桌面边缘，保持安静的工作氛围。'],
      millennium: ['千年风格', '蓝色网格与数据光效，呼应千年科技感。'],
      transparent: ['纯透明感', '弱化装饰，让背景自然融入当前 VS Code 主题。']
    };
    const scene = Object.hasOwn(scenes, settings.scene) ? settings.scene : 'millennium';
    settings.scene = scene;
    world.dataset.scene = scene;
    sceneSelect.value = scene;
    sceneName.textContent = scenes[scene][0];
    sceneDetail.textContent = scenes[scene][1];
  }

  function adjustRelationship(moodDelta, affinityDelta) {
    if (!settings.relationshipEnabled) return;
    relationship.mood = Math.max(-2, Math.min(2, relationship.mood + moodDelta));
    relationship.affinity = Math.max(0, Math.min(100, relationship.affinity + affinityDelta));
    persistRelationship();
    renderRelationship();
  }

  function settleMood() {
    if (!settings.relationshipEnabled || relationship.mood === 0) return;
    relationship.mood += relationship.mood > 0 ? -1 : 1;
    persistRelationship();
    renderRelationship();
  }

  function relationshipAction() {
    return dialoguePolicy?.actionFor(relationship, settings.relationshipEnabled) || 'greet';
  }

  function idleAction() {
    return dialoguePolicy?.idleActionFor(relationship, settings.relationshipEnabled)
      || (Math.random() > 0.5 ? 'lookLeft' : 'lookRight');
  }

  function chooseLine(category) {
    const options = dialoguePolicy?.candidatesFor(
      dialogue,
      relationshipDialogue,
      category,
      relationship,
      settings.relationshipEnabled
    ) || dialogue[category] || dialogue.interaction || ['……'];
    const candidates = options.filter((line) => !recentDialogue.includes(line));
    const pool = candidates.length ? candidates : options;
    const line = pool[Math.floor(Math.random() * pool.length)];
    recentDialogue.push(line);
    if (recentDialogue.length > 4) recentDialogue.shift();
    return line;
  }

  function maxX() {
    return Math.max(0, world.clientWidth - frameW * scale);
  }

  function place(nextX) {
    x = Math.max(0, Math.min(maxX(), nextX));
    pet.style.left = `${x}px`;
  }

  function render() {
    const spec = rows[state];
    pet.style.backgroundPosition = `${-frame * frameW * scale}px ${-spec.row * frameH * scale}px`;
  }

  function animate() {
    clearTimeout(loopTimer);
    const spec = rows[state];
    frame = (frame + 1) % spec.count;
    if (targetX !== null) {
      const delta = targetX - x;
      if (Math.abs(delta) < 4) {
        place(targetX);
        targetX = null;
        setState('idle');
        return;
      }
      place(x + Math.sign(delta) * Math.min(7, Math.abs(delta)));
    }
    render();
    loopTimer = setTimeout(animate, spec.speed);
  }

  function setState(next) {
    state = next;
    frame = 0;
    render();
    clearTimeout(loopTimer);
    loopTimer = setTimeout(animate, rows[next].speed);
  }

  function say(text) {
    speech.textContent = text;
    vscode.postMessage({ type: 'status', text });
  }

  function sayFrom(category) {
    say(chooseLine(category));
  }

  function oneShot(next, duration, text) {
    clearTimeout(oneShotTimer);
    targetX = null;
    setState(next);
    if (text) say(text);
    oneShotTimer = setTimeout(() => {
      if (!workLocked) setState('idle');
    }, duration);
  }

  function passiveOneShot(next, duration, category, force = false) {
    if (workLocked || state === 'work' || state === 'workAngry' || dragging) return false;
    const passiveStates = ['idle', 'lookLeft', 'lookRight'];
    if (!force && (!passiveStates.includes(state) || Date.now() - lastPassiveReactionAt < 1500)) return false;
    lastPassiveReactionAt = Date.now();
    oneShot(next, duration, chooseLine(category));
    return true;
  }

  function play(category = 'interaction') {
    if (focusActive) {
      reactToWorkInterruption();
      return;
    }
    workLocked = false;
    clearTimeout(workReactionTimer);
    const now = Date.now();
    if (now - lastInteractionAt < 800) {
      lastInteractionAt = now;
      adjustRelationship(-1, 0);
      oneShot('alert', 1200, chooseLine('annoyed'));
      return;
    }
    lastInteractionAt = now;
    pet.classList.remove('bounce');
    void pet.offsetWidth;
    pet.classList.add('bounce');
    const action = category === 'poke' ? 'alert' : category === 'petHead' ? 'greet' : relationshipAction();
    // Speak from the current relationship state; apply this interaction's effect afterward.
    const line = chooseLine(category);
    adjustRelationship(category === 'poke' ? -1 : 1, category === 'petHead' ? 2 : category === 'poke' ? 0 : 1);
    oneShot(action, 1600, line);
  }

  function work() {
    clearTimeout(oneShotTimer);
    clearTimeout(workReactionTimer);
    workLocked = true;
    targetX = null;
    setState('work');
    sayFrom('work');
  }

  function reactToWorkInterruption() {
    if (!workLocked && state !== 'work' && state !== 'workAngry') return false;
    const now = Date.now();
    if (now - lastWorkInterruptionAt < 800) return true;
    lastWorkInterruptionAt = now;
    workLocked = true;
    targetX = null;
    clearTimeout(workReactionTimer);
    pet.classList.remove('annoyed');
    void pet.offsetWidth;
    pet.classList.add('annoyed');
    setState('workAngry');
    adjustRelationship(-1, 0);
    sayFrom('interrupted');
    workReactionTimer = setTimeout(() => {
      if (workLocked) setState('work');
    }, 1100);
    return true;
  }

  function handleCommand(command, payload) {
    if (command === 'settings') {
      settings = { ...settings, ...(payload.settings || {}) };
      renderRelationship();
      renderScene();
      return;
    }
    if (command === 'saved') passiveOneShot('greet', 1100, 'saved');
    if (command === 'typingReminder') passiveOneShot('alert', 2600, 'typingReminder');
    if (command === 'idle') {
      const action = idleAction();
      settleMood();
      passiveOneShot(action, 2400, 'idle');
    }
    if (command === 'focus') passiveOneShot('greet', 1200, 'focus');
    if (command === 'taskSucceeded' && passiveOneShot('celebrate', 2400, 'taskSucceeded')) {
      adjustRelationship(1, 2);
    }
    if (command === 'taskFailed' && passiveOneShot('alert', 2400, 'taskFailed')) adjustRelationship(-1, 0);
    if (command === 'milestone' && passiveOneShot('celebrate', 2800, 'milestone', true)) {
      adjustRelationship(2, 3);
    }
    if (command === 'jump') passiveOneShot('jump', 1100, 'jump', true);
    if (command === 'think') passiveOneShot('think', 2400, 'think', true);
    if (command === 'resetRelationship') {
      setRelationship(0, 0);
      if (!workLocked) passiveOneShot('greet', 1400, 'relationshipReset', true);
    }
    if (command === 'productivityState') renderProductivity(payload.state, payload.restoreActive);
    if (command === 'focusStarted') {
      focusActive = true;
      work();
      sayFrom('focusStarted');
    }
    if (command === 'focusPaused') releaseFocus('focusPaused');
    if (command === 'focusStopped') releaseFocus('focusStopped');
    if (command === 'focusCompleted') {
      focusActive = false;
      workLocked = false;
      adjustRelationship(2, 2);
      oneShot('celebrate', 2600, chooseLine('focusCompleted'));
    }
    if (command === 'breakStarted') {
      focusActive = false;
      workLocked = false;
      oneShot('greet', 1600, chooseLine('breakStarted'));
    }
    if (command === 'breakCompleted') {
      focusActive = false;
      workLocked = false;
      oneShot('alert', 2200, chooseLine('breakCompleted'));
    }
    if (command === 'localTaskCompleted') {
      adjustRelationship(1, 1);
      if (focusActive || workLocked) sayFrom('taskCompletedDuringFocus');
      else oneShot('celebrate', 2200, chooseLine('localTaskCompleted'));
    }
    if (command === 'reminderDue') passiveOneShot('alert', 2400, 'reminderDue', true);
    if (command === 'hydrationReminder') passiveOneShot('alert', 2400, 'hydrationReminder', true);
    if (command === 'hourlyReminder') passiveOneShot('greet', 1600, 'hourlyReminder');
    if (command === 'productivityError') {
      say(payload.text || chooseLine('interaction'));
    }
  }

  function releaseFocus(category) {
    focusActive = false;
    workLocked = false;
    clearTimeout(workReactionTimer);
    targetX = null;
    setState('idle');
    sayFrom(category);
  }

  function renderProductivity(next, restoreActive = false) {
    if (!next) return;
    productivity = next;
    const phaseLabels = { focus: '专注', shortBreak: '短休息', longBreak: '长休息' };
    timerPhase.textContent = phaseLabels[next.timer.phase] || '专注';
    timerTask.textContent = next.selectedTaskTitle || '未选择当前任务';
    timerDisplay.textContent = formatDuration(next.timer.remainingMs);
    timerPrimary.textContent = next.timer.status === 'running' ? '暂停'
      : next.timer.status === 'paused' ? '继续' : '开始';
    timerStop.disabled = next.timer.status === 'idle';
    focusActive = next.timer.status === 'running' && next.timer.phase === 'focus';
    if (restoreActive && focusActive) {
      work();
      sayFrom('focusRestored');
    }
    renderTasks(next.tasks || [], next.selectedTaskId);
    renderReminders(next.reminders || []);
    renderStats(next.stats);
  }

  function renderTasks(tasks, selectedTaskId) {
    taskList.replaceChildren();
    taskEmpty.hidden = tasks.length > 0;
    for (const task of tasks) {
      const item = document.createElement('li');
      item.className = `item-row${task.completed ? ' completed' : ''}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `完成任务：${task.title}`);
      checkbox.addEventListener('change', () => postProductivity('toggleTask', { id: task.id }));
      const select = document.createElement('button');
      select.className = 'icon-button secondary';
      select.textContent = selectedTaskId === task.id ? '●' : '○';
      select.title = selectedTaskId === task.id ? '取消当前任务' : '设为当前任务';
      select.setAttribute('aria-pressed', String(selectedTaskId === task.id));
      select.disabled = task.completed;
      select.addEventListener('click', () => postProductivity('selectTask', { id: task.id }));
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = task.title;
      const remove = document.createElement('button');
      remove.className = 'icon-button secondary';
      remove.textContent = '×';
      remove.title = '删除任务';
      remove.setAttribute('aria-label', `删除任务：${task.title}`);
      remove.addEventListener('click', () => postProductivity('deleteTask', { id: task.id }));
      item.append(checkbox, select, title, remove);
      taskList.append(item);
    }
  }

  function renderReminders(reminders) {
    reminderList.replaceChildren();
    reminderEmpty.hidden = reminders.length > 0;
    for (const reminder of reminders) {
      const item = document.createElement('li');
      item.className = 'item-row reminder-row';
      const text = document.createElement('span');
      text.className = 'item-title';
      text.textContent = reminder.text;
      const time = document.createElement('time');
      time.dateTime = new Date(reminder.dueAt).toISOString();
      time.textContent = formatReminderTime(reminder.dueAt);
      const remove = document.createElement('button');
      remove.className = 'icon-button secondary';
      remove.textContent = '×';
      remove.title = '删除提醒';
      remove.setAttribute('aria-label', `删除提醒：${reminder.text}`);
      remove.addEventListener('click', () => postProductivity('deleteReminder', { id: reminder.id }));
      item.append(text, time, remove);
      reminderList.append(item);
    }
  }

  function renderStats(stats) {
    if (!stats) return;
    document.getElementById('today-focus').textContent = String(stats.today.focusSessions);
    document.getElementById('today-minutes').textContent = String(stats.today.focusMinutes);
    document.getElementById('today-tasks').textContent = String(stats.today.tasksCompleted);
    document.getElementById('focus-streak').textContent = String(stats.streak);
    document.getElementById('week-minutes').textContent = String(stats.week.focusMinutes);
    document.getElementById('week-tasks').textContent = String(stats.week.tasksCompleted);
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatReminderTime(dueAt) {
    return new Date(dueAt).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  function postProductivity(action, payload = {}) {
    vscode.postMessage({ type: 'productivity', action, ...payload });
  }

  function maybeRunRandomEvent() {
    if (workLocked || state !== 'idle' || dragging) return;
    const chances = { off: 0, low: 0.03, normal: 0.08, high: 0.16 };
    const chance = chances[settings.randomEventFrequency] ?? chances.low;
    if (Math.random() >= chance) return;
    const category = Math.random() > 0.5 ? 'randomBudget' : 'randomSchedule';
    passiveOneShot('think', 2800, category);
  }

  function finishPointer(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    const wasDragging = dragging;
    const relativeY = event.clientY - pet.getBoundingClientRect().top;
    pointerStart = null;
    dragging = false;
    pet.classList.remove('dragging');
    if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
    if (wasDragging) {
      adjustRelationship(0, 1);
      setState('idle');
      sayFrom('placed');
      return;
    }
    play(relativeY < pet.clientHeight * 0.45 ? 'petHead' : 'poke');
  }

  world.addEventListener('click', (event) => {
    if (reactToWorkInterruption() || event.target === pet) return;
    const clickX = event.clientX - world.getBoundingClientRect().left;
    targetX = Math.max(0, Math.min(maxX(), clickX - frameW * scale / 2));
    setState(targetX >= x ? 'right' : 'left');
  });

  world.addEventListener('pointermove', (event) => {
    if (workLocked || dragging || state !== 'idle') return;
    const petCenter = world.getBoundingClientRect().left + x + frameW * scale / 2;
    const direction = event.clientX >= petCenter ? 'lookRight' : 'lookLeft';
    clearTimeout(lookIntentTimer);
    clearTimeout(lookReturnTimer);
    lookIntentTimer = setTimeout(() => {
      if (workLocked || dragging || state !== 'idle') return;
      setState(direction);
      lookReturnTimer = setTimeout(() => {
        if (!workLocked && !dragging && (state === 'lookLeft' || state === 'lookRight')) setState('idle');
      }, 1400);
    }, 450);
  });
  world.addEventListener('pointerleave', () => {
    clearTimeout(lookIntentTimer);
  });

  pet.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    if (reactToWorkInterruption()) return;
    pointerStart = { pointerId: event.pointerId, clientX: event.clientX, x };
    dragging = false;
    pet.setPointerCapture(event.pointerId);
  });
  pet.addEventListener('pointermove', (event) => {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    const delta = event.clientX - pointerStart.clientX;
    if (Math.abs(delta) > 4) dragging = true;
    if (!dragging) return;
    pet.classList.add('dragging');
    targetX = null;
    place(pointerStart.x + delta);
  });
  pet.addEventListener('pointerup', finishPointer);
  pet.addEventListener('pointercancel', (event) => {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    pointerStart = null;
    dragging = false;
    pet.classList.remove('dragging');
    if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
    if (!workLocked) setState('idle');
  });
  pet.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  pet.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!reactToWorkInterruption()) play('interaction');
    }
  });
  document.getElementById('play').addEventListener('click', () => play('interaction'));
  document.getElementById('work').addEventListener('click', work);
  document.getElementById('reset').addEventListener('click', () => {
    if (focusActive) {
      reactToWorkInterruption();
      return;
    }
    workLocked = false;
    clearTimeout(workReactionTimer);
    targetX = null;
    place(maxX() / 2);
    oneShot('greet', 1200, chooseLine('reset'));
  });
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      for (const candidate of document.querySelectorAll('.tab')) {
        const active = candidate === tab;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-selected', String(active));
        document.getElementById(candidate.dataset.panel).hidden = !active;
        document.getElementById(candidate.dataset.panel).classList.toggle('active', active);
      }
    });
  }
  timerPrimary.addEventListener('click', () => {
    postProductivity(productivity?.timer.status === 'running' ? 'pause' : 'start');
  });
  timerStop.addEventListener('click', () => postProductivity('stop'));
  timerReset.addEventListener('click', () => postProductivity('reset'));
  document.getElementById('task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('task-input');
    postProductivity('addTask', { title: input.value });
    input.value = '';
  });
  document.getElementById('reminder-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('reminder-input');
    const time = document.getElementById('reminder-time');
    postProductivity('addReminder', { text: input.value, dueAt: new Date(time.value).getTime() });
    input.value = '';
  });
  document.getElementById('clear-stats').addEventListener('click', () => postProductivity('clearStats'));
  relationshipEnabled.addEventListener('change', () => {
    settings.relationshipEnabled = relationshipEnabled.checked;
    renderRelationship();
    vscode.postMessage({ type: 'relationshipSettings', enabled: relationshipEnabled.checked });
  });
  moodSelect.addEventListener('change', () => setRelationship(moodSelect.value, relationship.affinity));
  affinityRange.addEventListener('input', () => setRelationship(relationship.mood, affinityRange.value));
  affinityNumber.addEventListener('change', () => setRelationship(relationship.mood, affinityNumber.value));
  document.getElementById('reset-relationship').addEventListener('click', () => {
    setRelationship(0, 0);
    if (!workLocked) passiveOneShot('greet', 1400, 'relationshipReset', true);
  });
  sceneSelect.addEventListener('change', () => {
    settings.scene = sceneSelect.value;
    renderScene();
    vscode.postMessage({ type: 'appearanceSettings', scene: settings.scene });
  });
  window.addEventListener('resize', () => place(x));
  window.addEventListener('message', (event) => {
    if (event.data.command === 'play') play('interaction');
    if (event.data.command === 'work') work();
    if (event.data.command === 'reset') {
      if (focusActive) {
        reactToWorkInterruption();
        return;
      }
      workLocked = false;
      clearTimeout(workReactionTimer);
      targetX = null;
      place(maxX() / 2);
      setState('idle');
    }
    handleCommand(event.data.command, event.data);
  });

  place(maxX() / 2);
  setState('idle');
  renderRelationship();
  renderScene();
  randomEventTimer = setInterval(maybeRunRandomEvent, 60000);
  window.addEventListener('beforeunload', () => {
    clearTimeout(loopTimer);
    clearTimeout(oneShotTimer);
    clearTimeout(workReactionTimer);
    clearTimeout(lookIntentTimer);
    clearTimeout(lookReturnTimer);
    clearInterval(randomEventTimer);
  });
  vscode.postMessage({ type: 'hello' });
})();
