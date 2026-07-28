(function initializeDialoguePolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.YUUKA_DIALOGUE_POLICY = policy;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';

  const MOOD_TIERS = Object.freeze(['angry', 'upset', 'neutral', 'pleased', 'delighted']);
  const AFFINITY_TIERS = Object.freeze(['distant', 'familiar', 'trusted', 'close']);
  const RELATIONSHIP_CATEGORIES = Object.freeze(new Set(['interaction', 'petHead', 'poke', 'idle']));

  function clampNumber(value, minimum, maximum) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return minimum;
    return Math.max(minimum, Math.min(maximum, numeric));
  }

  function moodTier(mood) {
    return MOOD_TIERS[Math.round(clampNumber(mood, -2, 2)) + 2];
  }

  function affinityTier(affinity) {
    const value = clampNumber(affinity, 0, 100);
    if (value < 25) return 'distant';
    if (value < 50) return 'familiar';
    if (value < 75) return 'trusted';
    return 'close';
  }

  function candidatesFor(baseDialogue, relationshipDialogue, category, relationship, enabled = true) {
    if (enabled && RELATIONSHIP_CATEGORIES.has(category)) {
      const candidates = relationshipDialogue?.[category]?.[moodTier(relationship?.mood)]
        ?.[affinityTier(relationship?.affinity)];
      if (Array.isArray(candidates) && candidates.length) return candidates;
    }
    return baseDialogue?.[category] || baseDialogue?.interaction || ['……'];
  }

  function actionFor(relationship, enabled = true) {
    if (!enabled) return 'greet';
    const mood = moodTier(relationship?.mood);
    const affinity = affinityTier(relationship?.affinity);
    if (mood === 'angry' || mood === 'upset') return 'think';
    if (mood === 'delighted' && (affinity === 'trusted' || affinity === 'close')) return 'celebrate';
    return 'greet';
  }

  function idleActionFor(relationship, enabled = true) {
    if (!enabled) return null;
    const mood = moodTier(relationship?.mood);
    if (mood === 'angry' || mood === 'upset') return 'think';
    if (mood === 'pleased' || mood === 'delighted') return 'greet';
    return null;
  }

  return Object.freeze({
    AFFINITY_TIERS,
    MOOD_TIERS,
    actionFor,
    affinityTier,
    candidatesFor,
    idleActionFor,
    moodTier
  });
});
