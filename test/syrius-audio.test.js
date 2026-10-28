'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'syrius');

function microphone(rate) {
  let Processor;
  const context = { sampleRate: rate, AudioWorkletProcessor: class {
    constructor() { this.messages = []; this.port = { postMessage: value => this.messages.push(value) }; }
  }, registerProcessor: (_name, implementation) => { Processor = implementation; } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'audio-worklet.js'), 'utf8'), context);
  return new Processor();
}

test('Le microphone rééchantillonne 44,1 / 48 kHz en paquets PCM16 de 160 ms sans perdre la fin de phrase', () => {
  for (const rate of [44100, 48000, 16000]) {
    const input = microphone(rate);
    input.port.onmessage({ data: { type: 'start', id: 1 } });
    for (let offset = 0; offset < rate; offset += 128) {
      input.process([[new Float32Array(Math.min(128, rate - offset)).fill(.25)]]);
    }
    input.port.onmessage({ data: { type: 'stop', id: 1 } });
    const packets = input.messages.filter(message => message.type === 'pcm');
    const sampleCount = packets.reduce((sum, packet) => sum + packet.samples.byteLength / 2, 0);
    assert.equal(sampleCount, 16000, `cadence matérielle ${rate}`);
    assert.equal(packets.length, 7); assert.equal(packets[0].samples.byteLength, 5120);
    assert.ok(packets.every(packet => new Int16Array(packet.samples).every(value => value === 8192)));
    assert.equal(input.messages.at(-1).type, 'stopped');
    input.process([[new Float32Array(4096).fill(1)]]);
    assert.equal(input.messages.filter(message => message.type === 'pcm').length, 7, 'aucune émission après relâchement');
    input.port.onmessage({ data: { type: 'start', id: 2 } });
    input.process([[new Float32Array(Math.ceil(rate / 16000 * 100)).fill(-.5)]]);
    input.port.onmessage({ data: { type: 'stop', id: 2 } });
    const tail = input.messages.filter(message => message.type === 'pcm').at(-1);
    assert.equal(tail.id, 2); assert.ok(new Int16Array(tail.samples).every(value => value === -16384));
  }
});

function audioHarness(send = async () => {}) {
  const nodes = [], worklets = [], errors = [], levels = [];
  const track = { enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class Node {
    constructor() { this.gain = { value: 1 }; }
    connect() {} disconnect() {} stop() { this.stopped = true; }
  }
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; }
    async resume() { this.state = 'running'; this.onstatechange?.(); }
    createGain() { return new Node(); }
    createMediaStreamSource() { return new Node(); }
    createBuffer(_channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, data, getChannelData: () => data }; }
    createBufferSource() { const node = new Node(); node.start = at => { node.at = at; }; nodes.push(node); return node; }
  }
  class Worklet extends Node {
    constructor() {
      super(); worklets.push(this);
      this.port = { postMessage: data => {
        this.command = data;
        if (data.type === 'stop') queueMicrotask(() => {
          if (this.tail) this.emit({ type: 'pcm', id: data.id, samples: new Int16Array(this.tail).buffer });
          this.emit({ type: 'stopped', id: data.id });
        });
      } };
    }
    emit(data) { this.port.onmessage({ data }); }
  }
  const context = { window: { AudioContext: Context, isSecureContext: true }, navigator: { mediaDevices: { getUserMedia: async () => stream } }, AudioWorkletNode: Worklet,
    btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary'),
    AbortController, setTimeout, clearTimeout, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'radio-audio.js'), 'utf8'), context);
  const audio = new context.window.SyriusAudio({ send, onError: error => errors.push(error), onLevel: value => levels.push(value) });
  return { audio, nodes, worklets, track, errors, levels };
}

test('Le PTT attend l’activation audio, expédie dans l’ordre et termine le dernier fragment avant de rendre la parole', async () => {
  const sent = []; let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const { audio, worklets, track, errors } = audioHarness(async packet => { sent.push(packet); if (packet.sequence === 0) await blocked; });
  assert.throws(() => audio.startCapture('floor-1'), /Activez la radio/);
  await audio.prepareMicrophone(); assert.ok(audio.ready); assert.equal(track.enabled, false);
  audio.startCapture('floor-1'); assert.equal(track.enabled, true);
  const worklet = worklets[0], id = worklet.command.id;
  worklet.emit({ type: 'pcm', id, samples: new Int16Array([16384, -16384]).buffer });
  worklet.emit({ type: 'pcm', id, samples: new Int16Array([8192]).buffer });
  worklet.tail = [1234];
  let ended = false; const stopped = audio.stopCapture().then(() => { ended = true; });
  assert.equal(track.enabled, false, 'le micro se coupe immédiatement');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(ended, false); assert.equal(sent.length, 1);
  unblock(); await stopped;
  assert.deepEqual(sent.map(packet => packet.sequence), [0, 1, 2]);
  assert.ok(sent.every(packet => packet.floorId === 'floor-1' && packet.sampleRate === 16000));
  assert.equal(Buffer.from(sent[0].pcm, 'base64').readInt16LE(2), -16384);
  assert.equal(Buffer.from(sent[2].pcm, 'base64').readInt16LE(0), 1234);
  assert.equal(audio.session, null); assert.equal(errors.length, 0);
  audio.startCapture('floor-2');
  worklet.emit({ type: 'pcm', id, samples: new Int16Array([3000]).buffer });
  await audio.stopCapture();
  assert.equal(sent.at(-1).floorId, 'floor-2'); assert.equal(sent.at(-1).sequence, 0);
});

test('Un échec réseau arrête le micro et un retard ne s’accumule pas sans limite', async () => {
  const { audio, worklets, track, errors } = audioHarness(async () => { throw new Error('réseau interrompu'); });
  await audio.prepareMicrophone(); audio.startCapture('floor-1');
  worklets[0].emit({ type: 'pcm', id: worklets[0].command.id, samples: new Int16Array(2560).buffer });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(track.enabled, false); assert.equal(errors.length, 1); assert.match(errors[0].message, /réseau/);
  await audio.stopCapture();
});

test('La réception reconstruit les échantillons signés, respecte le volume et évite les doublons et les anciens groupes', async () => {
  const { audio, nodes } = audioHarness();
  const packet = { floorId: 'floor-1', sequence: 0, sampleRate: 16000, pcm: Buffer.from([0, 64, 0, 192]).toString('base64') };
  audio.receive(packet); assert.equal(nodes.length, 0, 'pas de lecture avant le geste utilisateur');
  await audio.enableListening(); audio.setVolume(.4); audio.receive(packet);
  assert.equal(nodes.length, 1); assert.equal(nodes[0].buffer.data[0], .5); assert.equal(nodes[0].buffer.data[1], -.5);
  assert.equal(nodes[0].at, .07); assert.equal(audio.output.gain.value, .4);
  audio.receive(packet); assert.equal(nodes.length, 1);
  audio.setVolume(.4, true); assert.equal(audio.output.gain.value, 0);
  audio.receive({ ...packet, floorId: 'floor-2' });
  assert.equal(nodes.length, 2); assert.equal(nodes[0].stopped, true);
  audio.resetPlayback(); assert.equal(nodes[1].stopped, true); assert.equal(audio.playing.size, 0);
});

test('Un test micro ne transmet rien à la conférence et se ferme explicitement', async () => {
  const sent = []; const { audio, worklets, track } = audioHarness(async packet => sent.push(packet));
  await audio.testMicrophone(); assert.equal(track.enabled, true); assert.equal(audio.monitoring, true);
  worklets[0].emit({ type: 'level', value: .2 });
  worklets[0].emit({ type: 'pcm', id: 999, samples: new Int16Array(2560).buffer });
  assert.equal(sent.length, 0); audio.stopMicrophoneTest(); assert.equal(track.enabled, false);
  audio.disableMicrophone(); assert.equal(track.readyState, 'ended'); assert.equal(audio.ready, false);
});
