export const POSTER_SCARE_DELAY = 2800;
export const POSTER_SCARE_DURATION = 1150;

// This is a local scare: reading a clue must never interrupt another player.
export class CircusPosterScare {
  constructor({ poster, overlay, image, playSound, storage = null,
    isPageVisible = () => document.visibilityState === 'visible',
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = id => clearTimeout(id) }) {
    Object.assign(this, { poster, overlay, image, playSound, storage, isPageVisible, setTimer, clearTimer });
    this.pendingTimer = null;
    this.hideTimer = null;
    this.active = false;
    this.played = false;
    this.enabled = false;
    this.roundKey = null;
    this.stopSound = null;
  }

  updateState(state) {
    const roundKey = JSON.stringify([state.roomId, state.createdAt, state.startTime]);
    if (roundKey !== this.roundKey) {
      this.dismiss();
      this.roundKey = roundKey;
      this.played = false;
      try {
        this.played = this.storage?.getItem(`circus-poster-scare:${roundKey}`) === 'played';
      } catch { /* The scare also works when session storage is unavailable. */ }
    }
    this.enabled = state.mapTheme === 'circus' && state.status === 'IN_PROGRESS';
    if (!this.enabled) this.dismiss();
  }

  schedule() {
    if (!this.enabled || this.played || this.pendingTimer !== null || !this.poster || !this.overlay) return;
    this.pendingTimer = this.setTimer(() => {
      this.pendingTimer = null;
      if (!this.enabled || this.played || !this.isPageVisible() || this.poster.classList.contains('hidden')) return;
      // Never play a scream against an empty overlay if the image failed to load.
      if (!this.image?.complete || !this.image.naturalWidth) return;
      this.played = true;
      try {
        this.storage?.setItem(`circus-poster-scare:${this.roundKey}`, 'played');
      } catch { /* In-memory deduplication still prevents repeated scares. */ }
      this.active = true;
      this.overlay.classList.remove('hidden');
      this.stopSound = this.playSound();
      this.hideTimer = this.setTimer(() => this.dismiss(), POSTER_SCARE_DURATION);
    }, POSTER_SCARE_DELAY);
  }

  dismiss() {
    this.clearTimer(this.pendingTimer);
    this.clearTimer(this.hideTimer);
    this.pendingTimer = null;
    this.hideTimer = null;
    this.overlay?.classList.add('hidden');
    this.active = false;
    if (typeof this.stopSound === 'function') this.stopSound();
    this.stopSound = null;
  }
}
