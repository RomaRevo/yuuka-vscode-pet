'use strict';

const fs = require('node:fs');
const path = require('node:path');
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
  assert.equal(settings['yuukaPet.appearance.scene'].default, 'millennium');
  assert.deepEqual(settings['yuukaPet.appearance.scene'].enum, ['office', 'millennium', 'transparent']);
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
  assert.equal(settings['yuukaPet.focus.shortBreakMinutes'].default, 5);
  assert.equal(settings['yuukaPet.focus.longBreakMinutes'].default, 15);
  assert.equal(settings['yuukaPet.reminders.enabled'].default, false);
  assert.equal(settings['yuukaPet.reminders.quietHoursStart'].default, '22:00');
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

test('theme-aware local scenes are visible in the pet view', () => {
  const extensionSource = fs.readFileSync(path.resolve(__dirname, '../extension.js'), 'utf8');
  const styleSource = fs.readFileSync(path.resolve(__dirname, '../media/style.css'), 'utf8');
  const buildSource = fs.readFileSync(path.resolve(__dirname, '../build_vsix.py'), 'utf8');
  const officeBackground = fs.readFileSync(path.resolve(__dirname, '../media/scene-office-v1.png'));
  assert.match(extensionSource, /data-panel="scene-panel">场景/);
  assert.match(extensionSource, /id="scene-select"/);
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
});

test('editor reactions do not read document or terminal content', () => {
  assert.doesNotMatch(extensionSource, /\.getText\s*\(/);
  assert.doesNotMatch(extensionSource, /contentChanges/);
  assert.doesNotMatch(extensionSource, /onDidWriteTerminalData/);
  assert.doesNotMatch(extensionSource, /createTerminal/);
});
