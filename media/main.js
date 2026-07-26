(() => {
  const vscode = acquireVsCodeApi();
  const world = document.getElementById('world');
  const pet = document.getElementById('pet');
  const speech = document.getElementById('speech');
  const dialogue = window.YUUKA_DIALOGUE || {};
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
    randomEventFrequency: 'low'
  };
  let relationship = {
    mood: Number.isFinite(persisted.mood) ? persisted.mood : 0,
    affinity: Number.isFinite(persisted.affinity) ? persisted.affinity : 0
  };
  let state = 'idle';
  let frame = 0;
  let x = 0;
  let targetX = null;
  let workLocked = false;
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

  function adjustRelationship(moodDelta, affinityDelta) {
    if (!settings.relationshipEnabled) return;
    relationship.mood = Math.max(-2, Math.min(2, relationship.mood + moodDelta));
    relationship.affinity = Math.max(0, Math.min(100, relationship.affinity + affinityDelta));
    persistRelationship();
  }

  function settleMood() {
    if (!settings.relationshipEnabled || relationship.mood === 0) return;
    relationship.mood += relationship.mood > 0 ? -1 : 1;
    persistRelationship();
  }

  function relationshipDialogueCategory() {
    if (!settings.relationshipEnabled) return 'interaction';
    if (relationship.mood < 0) return 'moodLow';
    if (relationship.affinity >= 10) return 'affinityHigh';
    if (relationship.mood > 0) return 'moodHigh';
    return 'interaction';
  }

  function relationshipAction() {
    if (!settings.relationshipEnabled) return 'greet';
    if (relationship.mood < 0) return 'think';
    if (relationship.mood > 0 || relationship.affinity >= 10) return 'celebrate';
    return 'greet';
  }

  function idleAction() {
    if (settings.relationshipEnabled && relationship.mood < 0) return 'think';
    if (settings.relationshipEnabled && relationship.mood > 0) return 'greet';
    return Math.random() > 0.5 ? 'lookLeft' : 'lookRight';
  }

  function chooseLine(category) {
    const options = dialogue[category] || dialogue.interaction || ['……'];
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
    const dialogueCategory = category === 'interaction' ? relationshipDialogueCategory() : category;
    const action = category === 'poke' ? 'alert' : category === 'petHead' ? 'greet' : relationshipAction();
    adjustRelationship(category === 'poke' ? -1 : 1, category === 'petHead' ? 2 : category === 'poke' ? 0 : 1);
    oneShot(action, 1600, chooseLine(dialogueCategory));
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
      relationship = { mood: 0, affinity: 0 };
      persistRelationship();
      if (!workLocked) passiveOneShot('greet', 1400, 'relationshipReset', true);
    }
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
    workLocked = false;
    clearTimeout(workReactionTimer);
    targetX = null;
    place(maxX() / 2);
    oneShot('greet', 1200, chooseLine('reset'));
  });
  window.addEventListener('resize', () => place(x));
  window.addEventListener('message', (event) => {
    if (event.data.command === 'play') play('interaction');
    if (event.data.command === 'work') work();
    if (event.data.command === 'reset') {
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
