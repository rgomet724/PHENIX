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

test('Le microphone rééchantillonne 44,1 / 48 kHz en paquets PCM16 de 120 ms sans perdre la fin de phrase', () => {
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
    assert.equal(packets.length, 9); assert.equal(packets[0].samples.byteLength, 3840);
    assert.ok(packets.every(packet => new Int16Array(packet.samples).every(value => value === 8192)));
    assert.equal(input.messages.at(-1).type, 'stopped');
    input.process([[new Float32Array(4096).fill(1)]]);
    assert.equal(input.messages.filter(message => message.type === 'pcm').length, 9, 'aucune émission après relâchement');
    input.port.onmessage({ data: { type: 'start', id: 2 } });
    input.process([[new Float32Array(Math.ceil(rate / 16000 * 100)).fill(-.5)]]);
    input.port.onmessage({ data: { type: 'stop', id: 2 } });
    const tail = input.messages.filter(message => message.type === 'pcm').at(-1);
    assert.equal(tail.id, 2); assert.ok(new Int16Array(tail.samples).every(value => value === -16384));
  }
});

function audioHarness(send = async () => {}, finish = async () => {}) {
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
  vm.runInNewContext(fs.readFileSync(path.join(root, 'audio-codec.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'radio-audio.js'), 'utf8'), context);
  const audio = new context.window.SyriusAudio({ send, finish, onError: error => errors.push(error), onLevel: value => levels.push(value) });
  return { audio, nodes, worklets, track, errors, levels, context };
}

test('Le PTT attend l’activation audio, expédie dans l’ordre et termine le dernier fragment avant de rendre la parole', async () => {
  const sent = []; let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const { audio, worklets, track, errors } = audioHarness(async body => { sent.push(...(body.packets || [body])); if (body.sequence === 0) await blocked; });
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
  assert.ok(sent.every(packet => packet.floorId === 'floor-1' && packet.sampleRate === 8000 && packet.codec === 'mulaw8'));
  const codec = require('../syrius/audio-codec');
  assert.equal(codec.decode(sent[0]).samples[0], 0, 'la paire opposée est moyennée avant sous-échantillonnage');
  assert.ok(Math.abs(codec.decode(sent[2]).samples[0] * 32768 - 1234) < 100);
  assert.equal(audio.session, null); assert.equal(errors.length, 0);
  audio.startCapture('floor-2');
  worklet.emit({ type: 'pcm', id, samples: new Int16Array([3000]).buffer });
  await audio.stopCapture();
  assert.equal(sent.at(-1).floorId, 'floor-2'); assert.equal(sent.at(-1).sequence, 0);
});

test('Le secours HTTP maintient la cadence avec un aller-retour de 400 ms, supérieur aux fragments de 120 ms', async () => {
  const sent = [], batchSizes = [];
  const { audio, worklets, errors } = audioHarness(async body => {
    const packets = body.packets || [body]; batchSizes.push(packets.length); sent.push(...packets);
    await new Promise(resolve => setTimeout(resolve, 400));
  });
  await audio.prepareMicrophone(); audio.startCapture('delayed-floor');
  const id = worklets[0].command.id;
  for (let index = 0; index < 24; index++) {
    worklets[0].emit({ type: 'pcm', id, samples: new Int16Array(1920).fill(index).buffer });
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  await audio.stopCapture();
  assert.equal(errors.length, 0); assert.equal(sent.length, 24);
  assert.deepEqual(sent.map(packet => packet.sequence), Array.from({ length: 24 }, (_, index) => index));
  assert.ok(batchSizes.some(size => size > 1), 'les fragments s’envoient par lots plutôt que de saturer la file');
});

test('Le microphone iPhone reprend après l’autorisation et réutilise sa capture après une interruption', async () => {
  const { audio, context, worklets } = audioHarness();
  let acquisitions = 0;
  const getMicrophone = context.navigator.mediaDevices.getUserMedia;
  context.navigator.mediaDevices.getUserMedia = async () => {
    acquisitions++; audio.context.state = 'interrupted'; return getMicrophone();
  };
  await audio.prepareMicrophone(); assert.equal(audio.ready, true); assert.equal(acquisitions, 1);
  audio.context.state = 'interrupted'; assert.equal(audio.ready, false); assert.equal(audio.microphoneReady, true);
  await audio.prepareMicrophone(); assert.equal(audio.ready, true); assert.equal(acquisitions, 1); assert.equal(worklets.length, 1);
});

test('Relâcher attend l’accusé de fin de phrase sans attendre un accusé pour chaque fragment', async () => {
  let resolveFinish, finishing = false;
  const { audio, worklets } = audioHarness(async () => {}, async (_floorId, sequence) => {
    assert.equal(sequence, 0); finishing = true; await new Promise(resolve => { resolveFinish = resolve; });
  });
  await audio.prepareMicrophone(); audio.startCapture('flush-floor');
  worklets[0].emit({ type: 'pcm', id: worklets[0].command.id, samples: new Int16Array(2560).buffer });
  let stopped = false; const stop = audio.stopCapture().then(() => { stopped = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finishing, true); assert.equal(stopped, false);
  resolveFinish(); await stop; assert.equal(stopped, true);
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
  assert.equal(nodes[0].at, .14); assert.equal(audio.output.gain.value, .4);
  audio.receive(packet); assert.equal(nodes.length, 1);
  audio.setVolume(.4, true); assert.equal(audio.output.gain.value, 0);
  audio.receive({ ...packet, floorId: 'floor-2' });
  assert.equal(nodes.length, 2); assert.notEqual(nodes[0].stopped, true, 'la fin du précédent locuteur n’est pas coupée');
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

test('Les pauses et changements d’écran réutilisent le même micro autorisé jusqu’à sa fermeture explicite', async () => {
  const { audio, track, context } = audioHarness();
  const acquire = context.navigator.mediaDevices.getUserMedia; let requests = 0;
  context.navigator.mediaDevices.getUserMedia = async () => { requests++; return acquire(); };
  await audio.prepareMicrophone();
  for (let index = 0; index < 12; index++) {
    audio.startCapture(`group-${index}`); await audio.pauseMicrophone();
    assert.equal(track.enabled, false); assert.equal(track.readyState, 'live');
    audio.context.state = 'interrupted'; await audio.prepareMicrophone();
  }
  assert.equal(requests, 1, 'pas de nouvelle demande getUserMedia à chaque reprise');
  audio.disableMicrophone(); assert.equal(track.readyState, 'ended');
});

test('Un contexte audio fermé est reconstruit sans redemander un microphone dont la piste est encore disponible', async () => {
  const { audio, track, context, worklets } = audioHarness(); let requests = 0;
  const acquire = context.navigator.mediaDevices.getUserMedia;
  context.navigator.mediaDevices.getUserMedia = async () => { requests++; return acquire(); };
  await audio.prepareMicrophone(); const previous = audio.context;
  previous.state = 'closed'; await audio.resumeExisting();
  assert.notEqual(audio.context, previous); assert.equal(worklets.length, 2); assert.equal(requests, 1);
  assert.equal(track.readyState, 'live'); assert.equal(audio.ready, true);
});

test('Une rafale d’une seconde ne supprime pas les syllabes déjà reçues', async () => {
  const { audio, nodes } = audioHarness(); await audio.enableListening();
  const pcm = Buffer.alloc(5120).toString('base64');
  for (let sequence = 0; sequence < 8; sequence++) audio.receive({ floorId: 'burst', sequence, sampleRate: 16000, pcm });
  assert.equal(nodes.length, 8); assert.equal(audio.quality.discarded, 0);
  assert.ok(nodes.every(node => !node.stopped));
  for (let index = 1; index < nodes.length; index++) assert.equal(nodes[index].startAt, nodes[index - 1].endAt);
});

test('La réserve absorbe des variations d’arrivée sans créer un blanc entre chaque fragment', async () => {
  const { audio, nodes } = audioHarness(); await audio.enableListening();
  const packet = require('../syrius/audio-codec').encode(new Int16Array(2560).fill(10000));
  const arrivals = [0, .20, .28, .53, .60, .82, .90];
  arrivals.forEach((at, sequence) => { audio.context.currentTime = at; audio.receive({ ...packet, floorId: 'jitter', sequence }); });
  assert.equal(audio.quality.underruns, 0);
  for (let index = 1; index < nodes.length; index++) assert.equal(nodes[index].startAt, nodes[index - 1].endAt);
});

test('Un retard extrême élimine uniquement les fragments futurs, jamais celui en cours de lecture', async () => {
  const { audio, nodes } = audioHarness(); await audio.enableListening();
  const packet = require('../syrius/audio-codec').encode(new Int16Array(2560));
  audio.receive({ ...packet, floorId: 'backlog', sequence: 0 });
  audio.context.currentTime = .20;
  for (let sequence = 1; sequence < 25; sequence++) audio.receive({ ...packet, floorId: 'backlog', sequence });
  assert.notEqual(nodes[0].stopped, true); assert.ok(audio.quality.discarded > 0);
  assert.ok(audio.playAt - audio.context.currentTime < 1.8, 'pas de file audio de plusieurs secondes');
});

test('Une suspension imposée par le téléphone ne rejoue pas les anciennes paroles au réveil', async () => {
  const { audio, nodes } = audioHarness(); await audio.prepareMicrophone();
  const packet = require('../syrius/audio-codec').encode(new Int16Array(2560));
  audio.receive({ ...packet, floorId: 'before-lock', sequence: 0 });
  audio.context.state = 'interrupted'; audio.context.onstatechange();
  assert.equal(nodes[0].stopped, true); assert.equal(audio.playing.size, 0); assert.equal(audio.microphoneReady, true);
  await audio.resumeExisting(); audio.receive({ ...packet, floorId: 'after-lock', sequence: 0 });
  assert.equal(audio.playing.size, 1); assert.equal(nodes.length, 2);
});
