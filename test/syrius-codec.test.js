'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const codec = require('../syrius/audio-codec');

test('La voix compressée réduit de quatre le volume des échantillons et conserve la durée', () => {
  const input = Int16Array.from({ length: 2560 }, (_, index) => Math.round(Math.sin(index * 2 * Math.PI * 400 / 16000) * 14000));
  const packet = codec.encode(input), bytes = Buffer.from(packet.pcm, 'base64');
  assert.equal(bytes.length, input.byteLength / 4); assert.equal(packet.sampleRate, 8000);
  const decoded = codec.decode(packet); assert.equal(decoded.samples.length / decoded.sampleRate, input.length / 16000);
  let error = 0, power = 0;
  decoded.samples.forEach((value, index) => {
    const original = (input[index * 2] + input[index * 2 + 1]) / 2 / 32768;
    error += (original - value) ** 2; power += original ** 2;
  });
  assert.ok(10 * Math.log10(power / error) > 25, 'la quantification conserve le signal de référence avec un rapport signal/erreur supérieur à 25 dB');
});

test('Silence, valeurs signées et conversion pour les anciens postes restent compatibles', () => {
  assert.equal(codec.expand(255), 0); assert.equal(codec.expand(128), 32124); assert.equal(codec.expand(0), -32124);
  assert.equal(codec.compress(0), 255); assert.equal(codec.compress(32767), 128); assert.equal(codec.compress(-32768), 0);
  const packet = { floorId: 'test', sequence: 3, ...codec.encode(new Int16Array([16000, 16000, -16000, -16000, 0, 0])) };
  const legacy = codec.legacy(packet);
  assert.equal(legacy.sampleRate, 16000); assert.equal(legacy.codec, undefined); assert.equal(legacy.floorId, 'test'); assert.equal(legacy.sequence, 3);
  const oldAudio = codec.decode(legacy), newAudio = codec.decode(packet);
  newAudio.samples.forEach((value, index) => { assert.equal(oldAudio.samples[index * 2], value); assert.equal(oldAudio.samples[index * 2 + 1], value); });
  assert.throws(() => codec.decode({ codec: 'unknown', sampleRate: 8000, pcm: 'AAAA' }), /inconnu/);
  assert.throws(() => codec.decode({ codec: 'mulaw8', sampleRate: 8000, pcm: Buffer.alloc(1601).toString('base64') }), /invalide/);
});
