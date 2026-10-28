'use strict';

// La cadence du matériel varie (44,1 / 48 kHz). Les paquets réseau sont toujours
// du PCM16 mono à 16 kHz ; un paquet représente 120 ms de parole.
class SyriusMicrophone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.id = null;
    this.ratio = sampleRate / 16000;
    this.packet = new Int16Array(1920);
    this.offset = 0;
    this.sum = 0;
    this.weight = 0;
    this.levelSamples = 0;
    this.peak = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        this.id = data.id; this.offset = 0; this.sum = 0; this.weight = 0;
      } else if (data.type === 'stop') {
        if (this.id === data.id) { this.flush(); this.id = null; }
        this.port.postMessage({ type: 'stopped', id: data.id });
      }
    };
  }
  flush() {
    if (!this.offset || !this.id) return;
    const samples = this.packet.slice(0, this.offset);
    this.port.postMessage({ type: 'pcm', id: this.id, samples: samples.buffer }, [samples.buffer]);
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.peak = Math.max(this.peak, Math.abs(value)); this.levelSamples++;
      if (this.id !== null) {
        let remaining = 1;
        while (remaining > 1e-7) {
          const part = Math.min(remaining, this.ratio - this.weight);
          this.sum += value * part; this.weight += part; remaining -= part;
          if (this.weight >= this.ratio - 1e-7) {
            const sample = Math.max(-1, Math.min(1, this.sum / this.ratio));
            this.packet[this.offset++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
            this.sum = 0; this.weight = 0;
            if (this.offset === this.packet.length) this.flush();
          }
        }
      }
    }
    if (this.levelSamples >= sampleRate / 10) {
      this.port.postMessage({ type: 'level', value: this.peak }); this.levelSamples = 0; this.peak = 0;
    }
    // La sortie reste silencieuse : aucun retour local du microphone.
    return true;
  }
}
registerProcessor('syrius-microphone', SyriusMicrophone);
