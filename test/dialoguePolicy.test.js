'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const policy = require('../media/dialoguePolicy');

function relationshipDialogue() {
  const context = {};
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'media/relationshipDialogue.js'), 'utf8'),
    context,
    { filename: 'relationshipDialogue.js' }
  );
  return context.YUUKA_RELATIONSHIP_DIALOGUE;
}

test('relationship dialogue has every mood and affinity combination', () => {
  const dialogue = relationshipDialogue();
  for (const category of ['interaction', 'petHead', 'poke', 'idle']) {
    for (const mood of policy.MOOD_TIERS) {
      for (const affinity of policy.AFFINITY_TIERS) {
        const lines = dialogue[category]?.[mood]?.[affinity];
        assert.equal(Array.isArray(lines), true, `${category}/${mood}/${affinity}`);
        assert.equal(lines.length > 0, true, `${category}/${mood}/${affinity}`);
      }
    }
  }
});

test('mood and affinity use stable user-visible tiers', () => {
  assert.equal(policy.moodTier(-2), 'angry');
  assert.equal(policy.moodTier(-1), 'upset');
  assert.equal(policy.moodTier(0), 'neutral');
  assert.equal(policy.moodTier(1), 'pleased');
  assert.equal(policy.moodTier(2), 'delighted');
  assert.equal(policy.affinityTier(0), 'distant');
  assert.equal(policy.affinityTier(24), 'distant');
  assert.equal(policy.affinityTier(25), 'familiar');
  assert.equal(policy.affinityTier(50), 'trusted');
  assert.equal(policy.affinityTier(75), 'close');
  assert.equal(policy.affinityTier(100), 'close');
});

test('relationship dialogue changes with both mood and affinity', () => {
  const relationship = relationshipDialogue();
  const base = { interaction: ['base interaction'] };
  const angryClose = policy.candidatesFor(base, relationship, 'interaction', { mood: -2, affinity: 100 });
  const delightedDistant = policy.candidatesFor(base, relationship, 'interaction', { mood: 2, affinity: 0 });
  const neutralTrusted = policy.candidatesFor(base, relationship, 'interaction', { mood: 0, affinity: 50 });

  assert.notDeepEqual(angryClose, delightedDistant);
  assert.notDeepEqual(neutralTrusted, delightedDistant);
  assert.deepEqual(
    policy.candidatesFor(base, relationship, 'interaction', { mood: 2, affinity: 100 }, false),
    ['base interaction']
  );
});

test('relationship action favors concern before celebration', () => {
  assert.equal(policy.actionFor({ mood: -1, affinity: 100 }), 'think');
  assert.equal(policy.actionFor({ mood: 2, affinity: 74 }), 'celebrate');
  assert.equal(policy.actionFor({ mood: 2, affinity: 75 }), 'celebrate');
  assert.equal(policy.idleActionFor({ mood: 0, affinity: 100 }), null);
});
