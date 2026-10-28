'use strict';
(() => {
  const FILES = { ptt: '/syrius/sounds/ptt.wav', alert: '/syrius/sounds/alerte-code-rouge.mp3' };
  class SyriusRadioSounds {
    constructor({ getContext }) {
      this.getContext = getContext; this.volume = .8; this.muted = false;
      this.resources = new Map(); this.buffers = new WeakMap(); this.playing = new Set(); this.pending = new Set();
      this.seenAlerts = new Set(); this.alertFlight = null;
      for (const kind of Object.keys(FILES)) this.resource(kind).catch(() => {});
    }
    resource(kind) {
      if (!FILES[kind]) return Promise.reject(new Error('Son inconnu.'));
      if (!this.resources.has(kind)) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
        const resource = fetch(FILES[kind], { credentials: 'same-origin', signal: controller.signal })
          .then(response => { if (!response.ok) throw new Error('Son indisponible.'); return response.arrayBuffer(); })
          .catch(error => { this.resources.delete(kind); throw error; }).finally(() => clearTimeout(timer));
        this.resources.set(kind, resource);
      }
      return this.resources.get(kind);
    }
    buffer(kind, context) {
      let cache = this.buffers.get(context);
      if (!cache) { cache = new Map(); this.buffers.set(context, cache); }
      if (!cache.has(kind)) {
        const decoding = this.resource(kind).then(bytes => context.decodeAudioData(bytes.slice(0)))
          .catch(error => { cache.delete(kind); throw error; });
        cache.set(kind, decoding);
      }
      return cache.get(kind);
    }
    prepare() {
      const context = this.getContext();
      if (!context || context.state !== 'running') return Promise.resolve(false);
      return Promise.all(Object.keys(FILES).map(kind => this.buffer(kind, context))).then(() => true).catch(() => false);
    }
    setVolume(value, muted = false) {
      this.volume = Math.max(0, Math.min(1, value)); this.muted = muted;
      for (const entry of this.playing) entry.gain.gain.value = muted ? 0 : this.volume;
    }
    play(kind, { signal } = {}) {
      const context = this.getContext();
      if (!context || context.state !== 'running' || this.muted || !this.volume || signal?.aborted) return Promise.resolve(false);
      return new Promise(resolve => {
        let done = false, node = null, gain = null, entry = null, timer;
        const finish = heard => {
          if (done) return; done = true; clearTimeout(timer);
          signal?.removeEventListener('abort', cancel); this.pending.delete(cancel);
          if (entry) this.playing.delete(entry);
          if (node) { node.onended = null; try { node.stop(); } catch { /* déjà terminé */ } node.disconnect(); }
          gain?.disconnect(); resolve(heard);
        };
        const cancel = () => finish(false);
        this.pending.add(cancel); signal?.addEventListener('abort', cancel, { once: true });
        // Un fichier lent ou indisponible ne doit pas bloquer la radio.
        timer = setTimeout(cancel, 750);
        this.buffer(kind, context).then(buffer => {
          if (done) return;
          if (context !== this.getContext() || context.state !== 'running' || this.muted || !this.volume || signal?.aborted) return cancel();
          clearTimeout(timer);
          gain = context.createGain(); gain.gain.value = this.volume; gain.connect(context.destination);
          node = context.createBufferSource(); node.buffer = buffer; node.connect(gain);
          entry = { node, gain }; this.playing.add(entry);
          node.onended = () => finish(true);
          // Une suspension système peut empêcher onended : ne jamais y rester bloqué.
          timer = setTimeout(cancel, Math.ceil(buffer.duration * 1000) + 600);
          node.start();
        }).catch(cancel);
      });
    }
    observeAlerts(alerts, channelId, initial = false) {
      let fresh = false;
      for (const alert of alerts) {
        if (!this.seenAlerts.has(alert.id) && !initial && channelId && alert.channelId === channelId && !alert.acknowledgedBy) fresh = true;
        this.seenAlerts.add(alert.id);
      }
      while (this.seenAlerts.size > 400) this.seenAlerts.delete(this.seenAlerts.values().next().value);
      // Plusieurs alertes simultanées restent visibles, sans superposer les voix.
      if (!fresh || this.alertFlight) return;
      const playing = this.play('alert'); this.alertFlight = playing;
      playing.finally(() => { if (this.alertFlight === playing) this.alertFlight = null; });
    }
    stop() { for (const cancel of [...this.pending]) cancel(); }
    reset() { this.stop(); this.seenAlerts.clear(); this.alertFlight = null; }
  }
  window.SyriusRadioSounds = SyriusRadioSounds;
})();
