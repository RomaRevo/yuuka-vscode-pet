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
});

test('editor reactions do not read document or terminal content', () => {
  assert.doesNotMatch(extensionSource, /\.getText\s*\(/);
  assert.doesNotMatch(extensionSource, /contentChanges/);
  assert.doesNotMatch(extensionSource, /onDidWriteTerminalData/);
  assert.doesNotMatch(extensionSource, /createTerminal/);
});
