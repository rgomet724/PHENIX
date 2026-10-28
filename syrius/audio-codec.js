'use strict';
// Compandage µ-law pour la parole : 8 kHz / 8 bits, au lieu du PCM16 16 kHz.
// Ce module est partagé par le navigateur et le relais Node pour la compatibilité.
(() => {
  const pack = bytes => {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text);
  };
  const unpack = text => {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
    const raw = atob(text); return Uint8Array.from(raw, char => char.charCodeAt(0));
  };
  function compress(value) {
    const sign = value < 0 ? 128 : 0;
    let magnitude = Math.min(32635, Math.abs(value)) + 132, exponent = 7;
    for (let mask = 16384; exponent > 0 && !(magnitude & mask); mask >>= 1) exponent--;
    return ~(sign | (exponent << 4) | ((magnitude >> (exponent + 3)) & 15)) & 255;
  }
  function expand(value) {
    const bits = (~value) & 255;
    const magnitude = ((((bits & 15) << 3) + 132) << ((bits >> 4) & 7)) - 132;
    return bits & 128 ? -magnitude : magnitude;
  }
  function encode(samples) {
    const bytes = new Uint8Array(Math.ceil(samples.length / 2));
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = compress(Math.round((samples[index * 2] + (samples[index * 2 + 1] ?? samples[index * 2])) / 2));
    }
    return { codec: 'mulaw8', sampleRate: 8000, pcm: pack(bytes) };
  }
  function decode(packet) {
    const bytes = unpack(packet.pcm);
    if (packet.codec === 'mulaw8' && packet.sampleRate === 8000) {
      if (!bytes.length || bytes.length > 1600) throw new Error('Fragment vocal invalide.');
      return { sampleRate: 8000, samples: Float32Array.from(bytes, byte => expand(byte) / 32768) };
    }
    if (packet.codec && packet.codec !== 'pcm16') throw new Error('Codec inconnu.');
    if (packet.sampleRate !== 16000 || !bytes.length || bytes.length % 2 || bytes.length > 6400) throw new Error('Fragment PCM invalide.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), samples = new Float32Array(bytes.length / 2);
    for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
    return { sampleRate: 16000, samples };
  }
  function legacy(packet) {
    if (packet.codec !== 'mulaw8') return packet;
    const bytes = unpack(packet.pcm), pcm = new Uint8Array(bytes.length * 4), view = new DataView(pcm.buffer);
    bytes.forEach((byte, index) => { const value = expand(byte); view.setInt16(index * 4, value, true); view.setInt16(index * 4 + 2, value, true); });
    const { codec, ...rest } = packet;
    return { ...rest, sampleRate: 16000, pcm: pack(pcm) };
  }
  const api = { encode, decode, legacy, compress, expand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.SyriusVoiceCodec = api;
})();
