'use strict';

class ReactionPolicy {
  constructor(now = Date.now()) {
    this.lastActivityAt = now;
    this.lastEditAt = null;
    this.typingStartedAt = null;
    this.lastSaveReactionAt = null;
    this.lastFocusReactionAt = null;
    this.idleNotified = false;
  }

  markActivity(now) {
    this.lastActivityAt = now;
    this.idleNotified = false;
  }

  noteEdit(now, typingThresholdMs, typingBreakMs = 120000) {
    if (this.lastEditAt === null || now - this.lastEditAt > typingBreakMs) {
      this.typingStartedAt = now;
    }
    this.lastEditAt = now;
    this.markActivity(now);
    if (this.typingStartedAt !== null && now - this.typingStartedAt >= typingThresholdMs) {
      this.typingStartedAt = now;
      return true;
    }
    return false;
  }

  noteSave(now, cooldownMs) {
    this.markActivity(now);
    if (this.lastSaveReactionAt !== null && now - this.lastSaveReactionAt < cooldownMs) return false;
    this.lastSaveReactionAt = now;
    return true;
  }

  noteFocus(now, cooldownMs) {
    this.markActivity(now);
    if (this.lastFocusReactionAt !== null && now - this.lastFocusReactionAt < cooldownMs) return false;
    this.lastFocusReactionAt = now;
    return true;
  }

  checkIdle(now, idleThresholdMs) {
    if (this.idleNotified || now - this.lastActivityAt < idleThresholdMs) return false;
    this.idleNotified = true;
    this.typingStartedAt = null;
    this.lastEditAt = null;
    return true;
  }
}

module.exports = { ReactionPolicy };
