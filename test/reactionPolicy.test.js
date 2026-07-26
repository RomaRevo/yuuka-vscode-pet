'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ReactionPolicy } = require('../reactionPolicy');

test('save reactions respect cooldown', () => {
  const policy = new ReactionPolicy(0);
  assert.equal(policy.noteSave(1000, 5000), true);
  assert.equal(policy.noteSave(4000, 5000), false);
  assert.equal(policy.noteSave(6000, 5000), true);
});

test('continuous typing triggers after threshold and resets after a break', () => {
  const policy = new ReactionPolicy(0);
  assert.equal(policy.noteEdit(0, 10000), false);
  assert.equal(policy.noteEdit(10000, 10000), true);
  assert.equal(policy.noteEdit(200000, 10000), false);
});

test('idle fires once until activity resumes', () => {
  const policy = new ReactionPolicy(0);
  assert.equal(policy.checkIdle(10000, 10000), true);
  assert.equal(policy.checkIdle(20000, 10000), false);
  policy.markActivity(21000);
  assert.equal(policy.checkIdle(31000, 10000), true);
});

test('focus reactions respect cooldown', () => {
  const policy = new ReactionPolicy(0);
  assert.equal(policy.noteFocus(1000, 5000), true);
  assert.equal(policy.noteFocus(3000, 5000), false);
  assert.equal(policy.noteFocus(7000, 5000), true);
});
