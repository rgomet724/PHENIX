'use strict';
(() => {
  // Utilise les fonctions média publiques du navigateur ; aucune boucle muette
  // ni demande de micro automatique pour tenter de garder le téléphone éveillé.
  class SyriusBackgroundAudio {
    constructor({ resume, stopTransmission, pauseListening, canResume, getState, onChange = () => {}, onError = () => {} }) {
      this.resume = resume; this.stopTransmission = stopTransmission; this.pauseListening = pauseListening;
      this.canResume = canResume; this.getState = getState; this.onChange = onChange; this.onError = onError;
      this.enabled = true; this.userPaused = false; this.signature = '';
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stopTransmission();
          if (!this.enabled) this.pauseListening();
        } else if (this.canAutoResume) this.resume().catch(() => this.onChange());
        this.onChange();
      });
      if (navigator.mediaSession?.setActionHandler) {
        for (const [action, handler] of [['play', () => {
          this.userPaused = false;
          if (this.canResume()) this.resume().then(() => this.update()).catch(this.onError);
        }], ['pause', () => {
          this.userPaused = true; this.stopTransmission(); this.pauseListening(); this.update();
        }]]) {
          try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* action non prise en charge */ }
        }
      }
    }
    get canAutoResume() { return !this.userPaused && this.canResume(); }
    update() {
      if (!navigator.mediaSession) return;
      const state = this.getState();
      try {
        const signature = `${state.active}:${state.title}:${state.artist}`;
        if (signature !== this.signature) {
          this.signature = signature;
          navigator.mediaSession.metadata = state.active && typeof MediaMetadata !== 'undefined' ? new MediaMetadata({ title: state.title, artist: state.artist, album: 'Conférence radio' }) : null;
        }
        navigator.mediaSession.playbackState = !state.active ? 'none' : state.paused || this.userPaused ? 'paused' : 'playing';
      } catch { /* API optionnelle */ }
    }
  }
  window.SyriusBackgroundAudio = SyriusBackgroundAudio;
})();
