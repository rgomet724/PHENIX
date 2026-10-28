'use strict';

(() => {
  class SyriusAudioTransport {
    constructor({ clientId, request, onState = () => {}, onLost = () => {} }) {
      this.clientId = clientId; this.request = request; this.onState = onState; this.onLost = onLost;
      this.socket = null; this.ready = false; this.opening = null; this.retryAfter = 0;
      this.flushes = new Map(); this.floorModes = new Map(); this.generation = 0;
    }
    changed() { this.onState(this.ready ? 'stream' : 'http'); }
    open() {
      if (this.ready || Date.now() < this.retryAfter) return Promise.resolve();
      if (this.opening) return this.opening;
      const generation = this.generation;
      this.opening = this.connect(generation).catch(() => { if (generation === this.generation) { this.retryAfter = Date.now() + 30000; this.changed(); } }).finally(() => { this.opening = null; });
      return this.opening;
    }
    async connect(generation) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000);
      let result;
      try { result = await this.request('/audio-link', { clientId: this.clientId }, 'POST', controller.signal); }
      finally { clearTimeout(timeout); }
      if (generation !== this.generation) return;
      const url = new URL(result.path, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== '/syrius/audio') throw new Error('Adresse audio invalide.');
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url.href); this.socket = socket;
      await new Promise((resolve, reject) => {
        let authenticated = false;
        const timer = setTimeout(() => { socket.close(); reject(new Error('Connexion audio indisponible.')); }, 5000);
        socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', clientId: this.clientId, ticket: result.ticket }));
        socket.onerror = () => { if (!authenticated) { clearTimeout(timer); reject(new Error('Connexion audio indisponible.')); } };
        socket.onmessage = event => {
          let body; try { body = JSON.parse(event.data); } catch { return; }
          if (body.type === 'ready') {
            if (this.socket !== socket || generation !== this.generation || socket.readyState !== WebSocket.OPEN) { socket.close(); return; }
            authenticated = true; clearTimeout(timer); this.ready = true; this.retryAfter = 0; this.changed(); resolve();
          } else if (body.type === 'flushed') {
            const pending = this.flushes.get(body.floorId);
            if (pending && pending.sequence === body.sequence) { this.flushes.delete(body.floorId); pending.resolve(); }
          } else if (body.type === 'error') {
            const error = new Error(body.error || 'La connexion audio a été interrompue.');
            if (!authenticated) { clearTimeout(timer); reject(error); socket.close(); }
            else { this.rejectFlushes(error); this.onLost(error); }
          }
        };
        socket.onclose = () => {
          clearTimeout(timer);
          if (!authenticated) reject(new Error('Connexion audio indisponible.'));
          if (this.socket !== socket) return;
          const wasReady = this.ready; this.socket = null; this.ready = false;
          const error = new Error('La liaison audio a été interrompue. Maintenez à nouveau PTT pour reconnecter.');
          this.rejectFlushes(error); this.changed();
          if (wasReady) this.onLost(error);
        };
      });
    }
    startFloor(floorId) {
      // Un mode reste fixé pour toute la phrase : les deux transports ne se
      // doublent pas et un HTTP lent ne peut pas arriver après un paquet WSS.
      this.floorModes.set(floorId, this.ready ? 'stream' : 'http');
    }
    send(packet, signal) {
      if (this.floorModes.get(packet.floorId) !== 'stream') return this.request('/audio', { clientId: this.clientId, ...packet }, 'POST', signal);
      if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('La liaison audio est interrompue.'));
      if (this.socket.bufferedAmount > 64000) return Promise.reject(new Error('La connexion n’arrive plus à envoyer le son en direct. Réessayez après reconnexion.'));
      this.socket.send(JSON.stringify({ type: 'audio', ...packet }));
      return Promise.resolve();
    }
    async finish(floorId, sequence) {
      try {
        if (this.floorModes.get(floorId) !== 'stream') return;
        if (!this.ready) throw new Error('La liaison audio est interrompue.');
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { this.flushes.delete(floorId); reject(new Error('Le serveur audio ne répond plus.')); }, 4000);
          this.flushes.set(floorId, { sequence, resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
          try { this.socket.send(JSON.stringify({ type: 'flush', floorId, sequence })); }
          catch (error) { this.flushes.get(floorId)?.reject(error); this.flushes.delete(floorId); }
        });
      } finally { this.floorModes.delete(floorId); }
    }
    rejectFlushes(error) { for (const pending of this.flushes.values()) pending.reject(error); this.flushes.clear(); }
    close() {
      this.generation++;
      const socket = this.socket; this.socket = null; this.ready = false; this.retryAfter = 0;
      this.rejectFlushes(new Error('Radio fermée.')); this.floorModes.clear();
      socket?.close(); this.changed();
    }
  }
  window.SyriusAudioTransport = SyriusAudioTransport;
})();
