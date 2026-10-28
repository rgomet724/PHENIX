'use strict';

(() => {
  const SAMPLE_RATE = 16000;
  const encode = samples => {
    const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
    samples.forEach((sample, index) => view.setInt16(index * 2, sample, true));
    let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value);
  };

  class SyriusAudio {
    constructor({ send, finish = async () => {}, onState = () => {}, onError = () => {}, onLevel = () => {}, onInterrupted = () => {} }) {
      this.send = send; this.finish = finish; this.onState = onState; this.onError = onError; this.onLevel = onLevel; this.onInterrupted = onInterrupted;
      this.context = null; this.stream = null; this.worklet = null; this.input = null;
      this.session = null; this.preparing = null; this.generation = 0; this.sequenceId = 0;
      this.playing = new Set(); this.playAt = 0; this.receivingFloor = null; this.receiveSequence = -1;
      this.volume = .8; this.muted = false; this.monitoring = false;
    }
    get listening() { return this.context?.state === 'running'; }
    get microphoneReady() { return Boolean(this.worklet && this.stream?.getAudioTracks().some(track => track.readyState === 'live')); }
    get ready() { return this.listening && this.microphoneReady; }
    changed() { this.onState({ ready: this.ready, listening: this.listening }); }

    // Appel direct depuis un clic : Safari/Chrome autorisent alors la sortie son.
    async enableListening() {
      if (!this.context || this.context.state === 'closed') {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw new Error('Ce navigateur ne prend pas en charge l’audio. Ouvrez SYRIUS dans Safari ou Chrome à jour.');
        this.context = new Context({ latencyHint: 'interactive' });
        this.output = this.context.createGain(); this.output.connect(this.context.destination);
        this.setVolume(this.volume, this.muted);
        this.context.onstatechange = () => {
          if (!this.listening) this.onInterrupted();
          this.changed();
        };
      }
      let timer;
      try {
        await Promise.race([this.context.resume(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Touchez « Activer l’écoute » pour reprendre le son.')), 3000); })]);
      } finally { clearTimeout(timer); }
      this.changed();
      if (!this.listening) throw new Error('Touchez « Activer l’écoute » pour autoriser le haut-parleur.');
    }
    prepareMicrophone() {
      if (this.preparing) return this.preparing;
      if (this.microphoneReady) return this.enableListening();
      const generation = this.generation;
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return Promise.reject(new Error('Le microphone nécessite une adresse HTTPS et Safari ou Chrome à jour.'));
      // Les deux demandes partent avant le premier await, pendant le geste utilisateur.
      // Une autorisation micro peut interrompre le contexte sur iPhone.
      // Le reprendre une seconde fois après getUserMedia, sans rouvrir un micro
      // déjà disponible lorsque seule la lecture a été suspendue.
      this.enableListening().catch(() => {});
      const microphone = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.preparing = (async () => {
        let acquired = null;
        try {
          acquired = await microphone;
          if (generation !== this.generation) { acquired.getTracks().forEach(track => track.stop()); return; }
          await this.enableListening();
          if (!this.context.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('Mettez votre navigateur à jour pour utiliser le microphone radio.');
          acquired.getAudioTracks().forEach(track => { track.enabled = false; });
          await this.context.audioWorklet.addModule('/syrius/audio-worklet.js');
          if (generation !== this.generation) { acquired.getTracks().forEach(track => track.stop()); return; }
          const previousStream = this.stream, previousInput = this.input, previousWorklet = this.worklet, previousSilent = this.silent;
          previousStream?.getTracks().forEach(track => track.stop()); previousInput?.disconnect(); previousWorklet?.disconnect(); previousSilent?.disconnect();
          this.stream = acquired;
          this.input = this.context.createMediaStreamSource(acquired);
          this.worklet = new AudioWorkletNode(this.context, 'syrius-microphone', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
          this.silent = this.context.createGain(); this.silent.gain.value = 0;
          this.input.connect(this.worklet); this.worklet.connect(this.silent); this.silent.connect(this.context.destination);
          this.worklet.port.onmessage = ({ data }) => {
            if (data.type === 'level') this.onLevel(data.value);
            const session = this.session;
            if (!session || data.id !== session.id) return;
            if (data.type === 'pcm') this.queuePacket(session, new Int16Array(data.samples));
            if (data.type === 'stopped') session.flushed?.();
          };
          acquired.getAudioTracks().forEach(track => {
            track.onended = () => { this.onInterrupted(); this.changed(); };
            track.onmute = () => { if (this.session) this.onInterrupted(); this.changed(); };
            track.onunmute = () => this.changed();
          });
        } catch (error) {
          acquired?.getTracks().forEach(track => track.stop());
          throw error;
        } finally { this.preparing = null; this.changed(); }
      })();
      return this.preparing;
    }
    startCapture(floorId) {
      if (!this.ready || this.session) throw new Error('Activez la radio avant de maintenir le PTT.');
      clearTimeout(this.monitorTimer); this.monitoring = false;
      this.session = { id: ++this.sequenceId, floorId, sequence: 0, queue: [], inFlight: 0, sending: false, chain: Promise.resolve(), failed: false, stop: null };
      this.worklet.port.postMessage({ type: 'start', id: this.session.id });
      this.stream.getAudioTracks().forEach(track => { track.enabled = true; });
    }
    queuePacket(session, samples) {
      if (session.failed || !samples.length) return;
      if (session.queue.length + session.inFlight >= 8) { this.fail(session, new Error('La connexion n’arrive plus à envoyer le son en direct. Relâchez puis réessayez.')); return; }
      const packet = { floorId: session.floorId, sequence: session.sequence++, sampleRate: SAMPLE_RATE, pcm: encode(samples) };
      session.queue.push(packet);
      if (!session.sending) session.chain = this.pump(session);
    }
    async pump(session) {
      session.sending = true;
      try {
        while (session.queue.length && !session.failed) {
          // En secours HTTP, rassembler les fragments arrivés pendant le trajet
          // précédent : un aller-retour de 400 ms ne réduit plus la cadence à
          // un seul fragment de 160 ms. En WSS, send résout dès la mise en file.
          const packets = session.queue.splice(0, 4); session.inFlight = packets.length;
          const body = packets.length === 1 ? packets[0] : { floorId: session.floorId, packets };
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000);
          try { await this.send(body, controller.signal); }
          finally { clearTimeout(timer); session.inFlight = 0; }
        }
      } catch (error) { this.fail(session, error); }
      finally { session.sending = false; }
    }
    fail(session, error) {
      if (session.failed) return;
      session.failed = true;
      this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
      this.onError(error.name === 'AbortError' ? new Error('La transmission audio a été interrompue par le réseau.') : error);
    }
    stopCapture() {
      const session = this.session;
      this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
      if (!session) return Promise.resolve();
      if (session.stop) return session.stop;
      session.stop = (async () => {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 250);
          session.flushed = () => { clearTimeout(timer); resolve(); };
          this.worklet?.port.postMessage({ type: 'stop', id: session.id });
        });
        // Le dernier fragment arrive avant l’accusé de fin du worklet. Ne libérer
        // l’alternat serveur qu’une fois les paquets déjà capturés expédiés.
        await session.chain;
        if (!session.failed) {
          try { await this.finish(session.floorId, session.sequence - 1); }
          catch (error) { this.fail(session, error); }
        }
        if (this.session === session) this.session = null;
      })();
      return session.stop;
    }
    disableMicrophone() {
      this.generation++; clearTimeout(this.monitorTimer); this.monitoring = false;
      this.stream?.getTracks().forEach(track => { track.enabled = false; track.stop(); });
      const previous = this.worklet, input = this.input, silent = this.silent;
      this.stream = null;
      this.stopCapture().finally(() => {
        input?.disconnect(); previous?.disconnect(); silent?.disconnect();
        if (this.worklet === previous) { this.worklet = null; this.input = null; }
        this.changed();
      });
      this.changed();
    }
    pauseMicrophone() {
      // Conserver la piste déjà autorisée évite une nouvelle demande Safari au
      // changement d’écran, au retour au premier plan ou après une reconnexion.
      const stopped = this.stopCapture(); this.stopMicrophoneTest(); return stopped;
    }
    setVolume(value, muted = false) {
      this.volume = Math.max(0, Math.min(1, value)); this.muted = muted;
      if (this.output) this.output.gain.value = muted ? 0 : this.volume;
    }
    resetPlayback() {
      for (const node of this.playing) { try { node.stop(); } catch { /* déjà terminé */ } }
      this.playing.clear(); this.playAt = 0; this.receivingFloor = null; this.receiveSequence = -1;
    }
    receive(packet) {
      if (!this.listening) { this.changed(); return; }
      if (packet.sampleRate !== SAMPLE_RATE || typeof packet.pcm !== 'string' || packet.pcm.length > 8536) return;
      if (this.receivingFloor !== packet.floorId) { this.resetPlayback(); this.receivingFloor = packet.floorId; }
      if (!Number.isInteger(packet.sequence) || packet.sequence <= this.receiveSequence) return;
      const bytes = atob(packet.pcm);
      if (!bytes.length || bytes.length % 2 || bytes.length > 6400) return;
      this.receiveSequence = packet.sequence;
      const buffer = this.context.createBuffer(1, bytes.length / 2, SAMPLE_RATE), output = buffer.getChannelData(0);
      for (let index = 0; index < output.length; index++) {
        const value = bytes.charCodeAt(index * 2) | (bytes.charCodeAt(index * 2 + 1) << 8);
        output[index] = (value > 32767 ? value - 65536 : value) / 32768;
      }
      const now = this.context.currentTime;
      if (this.playAt > now + .8) { this.resetPlayback(); this.receivingFloor = packet.floorId; this.receiveSequence = packet.sequence; }
      const node = this.context.createBufferSource(); node.buffer = buffer; node.connect(this.output);
      node.onended = () => { this.playing.delete(node); node.disconnect(); };
      const start = Math.max(this.playAt, now + .07);
      node.start(start); this.playAt = start + buffer.duration; this.playing.add(node);
    }
    async testSpeaker() {
      await this.enableListening();
      const oscillator = this.context.createOscillator(), gain = this.context.createGain(), now = this.context.currentTime;
      oscillator.frequency.value = 660; gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.12, now + .04); gain.gain.setValueAtTime(.12, now + .55); gain.gain.linearRampToValueAtTime(0, now + .65);
      oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(now); oscillator.stop(now + .7);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    async testMicrophone() {
      await this.prepareMicrophone();
      if (!this.ready || this.session) return;
      this.monitoring = true; this.stream.getAudioTracks().forEach(track => { track.enabled = true; });
      clearTimeout(this.monitorTimer);
      this.monitorTimer = setTimeout(() => this.stopMicrophoneTest(), 6000);
    }
    stopMicrophoneTest() {
      clearTimeout(this.monitorTimer); this.monitoring = false;
      if (!this.session) this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
      this.onLevel(0);
    }
  }
  window.SyriusAudio = SyriusAudio;
})();
