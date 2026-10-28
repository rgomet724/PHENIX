'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(load = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })) {
  const window = {}, nodes = [], requests = [];
  let context = makeContext();
  function makeContext() {
    return { state: 'running', destination: {}, decodes: 0,
      async decodeAudioData() { this.decodes++; return { duration: .18 }; },
      createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; },
      createBufferSource() {
        const node = { connect(gain) { this.gain = gain; }, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; }, end() { this.onended?.(); } };
        nodes.push(node); return node;
      }
    };
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../syrius/radio-sounds.js'), 'utf8'), {
    window, fetch: async (...args) => { requests.push(args); return load(...args); }, AbortController, setTimeout, clearTimeout
  });
  const sounds = new window.SyriusRadioSounds({ getContext: () => context });
  return { sounds, nodes, requests, context, replaceContext() { context = makeContext(); return context; } };
}

test('Les sons utilisent le contexte et le volume de la radio, sans nouvelle demande de microphone', async t => {
  const h = harness(); t.after(() => h.sounds.reset());
  await h.sounds.prepare(); assert.equal(h.requests.length, 2); assert.equal(h.context.decodes, 2);
  const playing = h.sounds.play('ptt'); await tick();
  assert.equal(h.nodes.length, 1); assert.equal(h.nodes[0].started, true); assert.equal(h.nodes[0].gain.gain.value, .8);
  h.sounds.setVolume(.4); assert.equal(h.nodes[0].gain.gain.value, .4);
  h.nodes[0].end(); assert.equal(await playing, true);
  h.sounds.setVolume(.4, true); assert.equal(await h.sounds.play('ptt'), false);
  h.sounds.setVolume(.4); const next = h.replaceContext(); await h.sounds.prepare();
  assert.equal(h.requests.length, 2, 'les fichiers téléchargés sont réutilisés'); assert.equal(next.decodes, 2, 'chaque nouveau contexte décode ses propres buffers');
});

test('Relâcher pendant le signal ou suspendre le téléphone annule la lecture sans la rejouer au retour', async t => {
  const h = harness(); t.after(() => h.sounds.reset()); await h.sounds.prepare();
  const controller = new AbortController(), pending = h.sounds.play('ptt', { signal: controller.signal }); await tick();
  controller.abort(); assert.equal(await pending, false); assert.equal(h.nodes[0].stopped, true);
  const alert = h.sounds.play('alert'); await tick(); h.context.state = 'interrupted'; h.sounds.stop();
  assert.equal(await alert, false); assert.equal(h.nodes[1].stopped, true);
  h.context.state = 'running'; await tick(); assert.equal(h.nodes.length, 2);
});

test('Une ressource audio indisponible ou trop lente ne bloque pas le PTT et ne joue pas en retard', async t => {
  const missing = harness(async () => ({ ok: false })); t.after(() => missing.sounds.reset());
  assert.equal(await missing.sounds.play('ptt'), false);
  const releases = []; const h = harness(() => new Promise(resolve => { releases.push(resolve); })); t.after(() => h.sounds.reset());
  const playing = h.sounds.play('alert'); assert.equal(await playing, false);
  for (const release of releases) release({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }); await tick(); await tick();
  assert.equal(h.nodes.length, 0, 'pas de son lancé après expiration');
});

test('L’alerte vocale est limitée au groupe rejoint, sans anciennes alertes, doublons ni superposition', async t => {
  const h = harness(); t.after(() => h.sounds.reset()); await h.sounds.prepare();
  const old = { id: 'old', channelId: 'a', acknowledgedBy: null };
  h.sounds.observeAlerts([old], null, true);
  const other = { id: 'other', channelId: 'b', acknowledgedBy: null };
  const ack = { id: 'ack', channelId: 'a', acknowledgedBy: 'Admin' };
  h.sounds.observeAlerts([other, ack, old], 'a'); await tick(); assert.equal(h.nodes.length, 0);
  const fresh = { id: 'fresh', channelId: 'a', acknowledgedBy: null };
  h.sounds.observeAlerts([fresh, other, ack, old], 'a'); await tick(); assert.equal(h.nodes.length, 1);
  h.sounds.observeAlerts([fresh, other, ack, old], 'a'); await tick(); assert.equal(h.nodes.length, 1);
  const simultaneous = { id: 'simultaneous', channelId: 'a', acknowledgedBy: null };
  h.sounds.observeAlerts([simultaneous, fresh], 'a'); await tick(); assert.equal(h.nodes.length, 1);
  h.nodes[0].end(); await tick();
  h.sounds.observeAlerts([simultaneous, fresh, other, ack, old], 'a'); await tick(); assert.equal(h.nodes.length, 1, 'une reconnexion et un acquittement ne rejouent rien');
  h.sounds.observeAlerts([{ id: 'next', channelId: 'a' }, simultaneous], 'a'); await tick(); assert.equal(h.nodes.length, 2);
});

function pttHarness() {
  const log = [], cues = [];
  let claim;
  const context = {
    starting: false, holding: false, stopping: null, preparingRadio: false, connected: true,
    state: { channelId: 'a' }, selectedId: 'a', desiredChannel: 'a', clientId: 'me', attempt: 0, grant: null, cueController: null,
    transmitting: false, stateRevision: -1, renewTimer: null, maxTalkTimer: null,
    radio: { ready: true, microphoneReady: true, session: null,
      async enableListening() { log.push('listening'); },
      startCapture() { this.session = { failed: false }; log.push('capture'); },
      async stopCapture() { log.push('capture-stopped'); }
    },
    sounds: { play(kind, { signal } = {}) {
      log.push('cue'); return new Promise(resolve => {
        const done = value => { signal?.removeEventListener('abort', cancel); resolve(value); };
        const cancel = () => { log.push('cue-cancelled'); done(false); };
        signal?.addEventListener('abort', cancel, { once: true }); cues.push(done);
      });
    } },
    transport: { async open() {}, startFloor() { log.push('transport-floor'); } },
    request: async (_route, body) => {
      log.push(body.action);
      if (body.action === 'claim') return new Promise(resolve => { claim = resolve; });
      return { ok: true };
    },
    renderRadio() {}, toast() {}, microphoneError: error => error.message,
    AbortController, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}
  };
  const source = fs.readFileSync(path.join(__dirname, '../syrius/app.js'), 'utf8');
  const functions = source.slice(source.indexOf('  function stopSpeaking()'), source.indexOf('  function stopLocation()'));
  vm.runInNewContext(functions, context);
  return { context, log, cues, grant() { claim({ revision: 5, floor: { id: 'floor' }, recipients: ['other'] }); } };
}

test('Le bip suit l’attribution serveur, le micro s’ouvre après le bip et le signal de fin suit la libération', async () => {
  const h = pttHarness(), start = h.context.startSpeaking(); await tick();
  assert.ok(!h.log.includes('cue')); h.grant(); await tick();
  assert.ok(h.log.includes('cue')); assert.ok(!h.log.includes('capture'));
  h.cues[0](true); await start; assert.ok(h.log.includes('capture'));
  const end = h.context.stopSpeaking(); await tick();
  assert.ok(h.log.indexOf('capture-stopped') < h.log.indexOf('release'));
  assert.equal(h.cues.length, 2); assert.equal(h.log.at(-1), 'cue');
  h.cues[1](true); await end;
});

test('Relâcher avant l’attribution ou pendant le bip ne lance aucune capture ni faux signal de fin', async () => {
  const before = pttHarness(), start = before.context.startSpeaking(); await tick();
  await before.context.stopSpeaking(); before.grant(); await start;
  assert.ok(!before.log.includes('cue')); assert.ok(!before.log.includes('capture')); assert.ok(before.log.includes('release'));
  const during = pttHarness(), pending = during.context.startSpeaking(); await tick(); during.grant(); await tick();
  await during.context.stopSpeaking(); await pending;
  assert.ok(during.log.includes('cue-cancelled')); assert.ok(!during.log.includes('capture')); assert.equal(during.cues.length, 1);
});

test('Une perte d’accès pendant le bip ou une transmission échouée ne reçoit pas de confirmation sonore trompeuse', async () => {
  const revoked = pttHarness(), pending = revoked.context.startSpeaking(); await tick(); revoked.grant(); await tick();
  revoked.context.state.channelId = null; revoked.context.desiredChannel = null; revoked.cues[0](true); await pending;
  assert.ok(!revoked.log.includes('capture')); assert.ok(revoked.log.includes('release')); assert.equal(revoked.cues.length, 1);
  const failed = pttHarness(), start = failed.context.startSpeaking(); await tick(); failed.grant(); await tick(); failed.cues[0](false); await start;
  assert.ok(failed.log.includes('capture'), 'un fichier indisponible ne bloque pas le PTT');
  failed.context.radio.session.failed = true; await failed.context.stopSpeaking(); assert.equal(failed.cues.length, 1);
});
