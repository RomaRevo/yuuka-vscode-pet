'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extensionSource = fs.readFileSync(path.join(root, 'extension.js'), 'utf8');

test('P2 commands and settings are contributed', () => {
  const commands = new Set(packageJson.contributes.commands.map(({ command }) => command));
  for (const command of [
    'yuukaPet.jump',
    'yuukaPet.think',
    'yuukaPet.celebrateMilestone',
    'yuukaPet.resetRelationship'
  ]) {
    assert.equal(commands.has(command), true);
  }

  const settings = packageJson.contributes.configuration.properties;
  assert.equal(settings['yuukaPet.reactions.enabled'].default, true);
  assert.equal(settings['yuukaPet.reactions.taskResults'].default, true);
  assert.equal(settings['yuukaPet.randomEvents.frequency'].default, 'low');
  assert.equal(settings['yuukaPet.relationship.enabled'].default, true);
  assert.equal(settings['yuukaPet.appearance.outfit'].default, 'classic');
  assert.deepEqual(settings['yuukaPet.appearance.outfit'].enum, ['classic', 'pajama']);
  assert.equal(settings['yuukaPet.appearance.scene'].default, 'millennium');
  assert.deepEqual(settings['yuukaPet.appearance.scene'].enum, ['office', 'millennium', 'transparent']);
});

test('the compact Chinese pet title does not add duplicate view-title actions', () => {
  assert.equal(packageJson.displayName, '桌宠：像素小优香');
  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].title, '桌宠');
  assert.equal(packageJson.contributes.views.yuukaPet[0].name, '像素小优香');
  assert.equal(Object.hasOwn(packageJson.contributes, 'menus'), false);
});

test('contextual dialogue offers varied and gentle work-lock feedback', () => {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'media/dialogue.js'), 'utf8'),
    context,
    { filename: 'dialogue.js' }
  );
  const dialogue = context.window.YUUKA_DIALOGUE;
  for (const [category, lines] of Object.entries(dialogue)) {
    assert.equal(lines.length >= 3, true, `${category} should have at least three choices`);
  }
  assert.equal(dialogue.interrupted.length >= 5, true);
  assert.equal(dialogue.interrupted.includes('我正在处理工作，不要用走来走去打断我！'), false);
});

test('P1 productivity commands and settings are contributed', () => {
  const commands = new Set(packageJson.contributes.commands.map(({ command }) => command));
  for (const command of [
    'yuukaPet.startFocus',
    'yuukaPet.pauseFocus',
    'yuukaPet.resetFocus',
    'yuukaPet.clearStatistics'
  ]) {
    assert.equal(commands.has(command), true);
  }

  const settings = packageJson.contributes.configuration.properties;
  assert.equal(settings['yuukaPet.focus.focusMinutes'].default, 25);
  assert.equal(settings['yuukaPet.focus.focusMinutes'].minimum, 1);
  assert.equal(settings['yuukaPet.focus.focusMinutes'].maximum, 180);
  assert.equal(settings['yuukaPet.focus.shortBreakMinutes'].default, 5);
  assert.equal(settings['yuukaPet.focus.longBreakMinutes'].default, 15);
  assert.equal(settings['yuukaPet.reminders.enabled'].default, false);
  assert.equal(settings['yuukaPet.reminders.quietHoursStart'].default, '22:00');
  assert.equal(packageJson.activationEvents.includes('onStartupFinished'), true);
  assert.deepEqual(packageJson.extensionKind, ['ui', 'workspace']);
  assert.match(extensionSource, /id="focus-duration-select"/);
  assert.match(extensionSource, /id="focus-duration-input"[^>]+min="1"[^>]+max="180"/);
});

test('relationship controls are visible in the pet view', () => {
  const extensionSource = fs.readFileSync(path.resolve(__dirname, '../extension.js'), 'utf8');
  const buildSource = fs.readFileSync(path.resolve(__dirname, '../build_vsix.py'), 'utf8');
  assert.match(extensionSource, /data-panel="relationship-panel">关系/);
  assert.match(extensionSource, /id="mood-select"/);
  assert.match(extensionSource, /id="affinity-range"/);
  assert.match(extensionSource, /id="affinity-number"/);
  assert.match(extensionSource, /type === 'relationshipSettings'/);
  assert.match(extensionSource, /dialoguePolicy\.js/);
  assert.match(extensionSource, /relationshipDialogue\.js/);
  assert.match(buildSource, /media\/dialoguePolicy\.js/);
  assert.match(buildSource, /media\/relationshipDialogue\.js/);
});

test('theme-aware local scenes and optional outfits are visible in the pet view', () => {
  const extensionSource = fs.readFileSync(path.resolve(__dirname, '../extension.js'), 'utf8');
  const styleSource = fs.readFileSync(path.resolve(__dirname, '../media/style.css'), 'utf8');
  const buildSource = fs.readFileSync(path.resolve(__dirname, '../build_vsix.py'), 'utf8');
  const officeBackground = fs.readFileSync(path.resolve(__dirname, '../media/scene-office-v1.png'));
  const pajamaSprite = fs.readFileSync(path.resolve(__dirname, '../media/spritesheet-pajama.webp'));
  assert.match(extensionSource, /data-panel="scene-panel">外观/);
  assert.match(extensionSource, /id="scene-select"/);
  assert.match(extensionSource, /id="outfit-select"/);
  assert.match(extensionSource, /type === 'appearanceSettings'/);
  for (const scene of ['office', 'millennium', 'transparent']) {
    assert.match(styleSource, new RegExp(`data-scene='${scene}'`));
  }
  assert.match(styleSource, /var\(--vscode-sideBar-background\)/);
  assert.match(styleSource, /url\('\.\/scene-office-v1\.png'\)/);
  assert.doesNotMatch(styleSource, /https?:\/\//);
  assert.match(buildSource, /media\/scene-office-v1\.png/);
  assert.equal(officeBackground.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(officeBackground.readUInt32BE(16), 384);
  assert.equal(officeBackground.readUInt32BE(20), 256);
  assert.equal(pajamaSprite.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(pajamaSprite.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(
    crypto.createHash('sha256').update(pajamaSprite).digest('hex'),
    '2a5da11104f4b8d5a568af558604833adb8c5dabac543e3916a6d93c860a2db6'
  );
  assert.match(buildSource, /media\/spritesheet-pajama\.webp/);
});

test('modernized UI exposes shared radii, accessible tabs, and reduced motion', () => {
  const styleSource = fs.readFileSync(path.resolve(__dirname, '../media/style.css'), 'utf8');
  assert.match(styleSource, /--yuuka-radius-lg:\s*14px/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styleSource, /border-left:\s*[2-9]/);
  assert.match(extensionSource, /aria-controls="focus-panel"/);
  assert.match(extensionSource, /id="productivity-message"/);
});

test('editor reactions do not read document or terminal content', () => {
  assert.doesNotMatch(extensionSource, /\.getText\s*\(/);
  assert.doesNotMatch(extensionSource, /contentChanges/);
  assert.doesNotMatch(extensionSource, /onDidWriteTerminalData/);
  assert.doesNotMatch(extensionSource, /createTerminal/);
});
