'use strict';
// Essai local isolé : aucun téléphone ni compte réel, aucune donnée de production.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { WebSocket } = require('ws');
const codec = require('../syrius/audio-codec');
const delay = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'syrius-soak-'));
process.env.CENTRAL_ADMIN_DATA_FILE = path.join(directory, 'admin.json');
const { mountSyrius } = require('../syrius-router');

test('30 secondes de relais vocal vers sept destinataires WSS/SSE, avec renouvellement PTT et contrôle de session', { timeout: 40000 }, async t => {
  const users = ['admin', 'speaker'].map(login => ({ id: login, login, role: login === 'admin' ? 'admin' : 'operateur', passwordHash: bcrypt.hashSync('isolated-soak-test', 4) }));
  const app = express(); app.use(express.json()); app.use(session({ secret: 'syrius-isolated-soak-test-not-production', resave: false, saveUninitialized: false }));
  const radio = mountSyrius(app, { dataFile: path.join(directory, 'radio.json'), loadPhenix: () => ({ users }) });
  const server = app.listen(0, '127.0.0.1'); radio.attachServer(server);
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const accounts = {}, sockets = [], streams = [], listeners = [];
  t.after(async () => {
    for (const stream of streams) stream.controller.abort();
    for (const socket of sockets) socket.terminate();
    radio.close(); await Promise.all(streams.map(stream => stream.reading));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (const name of ['admin', 'speaker']) {
    const response = await fetch(`${origin}/syrius/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: name, password: 'isolated-soak-test' }) });
    assert.equal(response.status, 200);
    accounts[name] = { cookie: response.headers.get('set-cookie').split(';')[0], csrf: (await response.json()).csrfToken };
  }
  async function call(name, route, body) {
    const account = accounts[name];
    const response = await fetch(`${origin}/syrius/api${route}`, { method: 'POST', headers: { cookie: account.cookie, 'x-csrf-token': account.csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  }
  function heard(target, packet) {
    assert.equal(packet.sequence, target.count, `ordre de parole sur ${target.id}`);
    assert.equal(packet.codec === 'mulaw8', target.compressed, `codec sur ${target.id}`);
    const decoded = codec.decode(packet); assert.equal(decoded.samples.length / decoded.sampleRate, .12);
    target.count++; target.samples += decoded.samples.length;
  }
  async function connect(name, id, mode, compressed) {
    const target = { id, name, mode, compressed, count: 0, samples: 0 };
    const controller = new AbortController();
    const response = await fetch(`${origin}/syrius/api/stream?clientId=${id}`, { headers: { cookie: accounts[name].cookie }, signal: controller.signal });
    assert.equal(response.status, 200);
    let ready; const initialized = new Promise(resolve => { ready = resolve; });
    const reading = (async () => {
      const decoder = new TextDecoder(); let pending = '';
      try {
        for await (const chunk of response.body) {
          pending += decoder.decode(chunk, { stream: true }); let end;
          while ((end = pending.indexOf('\n\n')) !== -1) {
            const frame = pending.slice(0, end); pending = pending.slice(end + 2);
            if (frame.startsWith('event: state')) ready();
            if (frame.startsWith('event: audio')) {
              assert.equal(mode, 'sse', 'pas de copie SSE pour un destinataire WSS');
              heard(target, JSON.parse(frame.match(/^data: (.+)$/m)[1]));
            }
          }
        }
      } catch (error) { if (error.name !== 'AbortError') throw error; }
    })();
    streams.push({ controller, reading }); await initialized;
    await call(name, '/presence', { clientId: id, channelId: 'pm-general', audioCodecs: compressed ? ['mulaw8'] : [] });
    if (mode === 'wss' || mode === 'speaker') {
      const ticket = await call(name, '/audio-link', { clientId: id });
      const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/syrius/audio`, { origin }); sockets.push(socket);
      const replies = [], waiters = [];
      socket.on('error', () => {});
      const next = type => new Promise((resolve, reject) => {
        const index = replies.findIndex(item => item.type === type); if (index !== -1) return resolve(replies.splice(index, 1)[0]);
        const timer = setTimeout(() => reject(new Error(`Réponse ${type} absente`)), 3000); waiters.push({ type, resolve: value => { clearTimeout(timer); resolve(value); } });
      });
      socket.on('message', raw => {
        const packet = JSON.parse(raw);
        if (packet.type === 'audio') { assert.equal(mode, 'wss', 'aucun écho vers le locuteur'); heard(target, packet); }
        else {
          assert.notEqual(packet.type, 'error', packet.error);
          const index = waiters.findIndex(waiter => waiter.type === packet.type);
          if (index === -1) replies.push(packet); else waiters.splice(index, 1)[0].resolve(packet);
        }
      });
      await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      socket.send(JSON.stringify({ type: 'auth', clientId: id, ticket: ticket.ticket, receiveAudio: mode === 'wss', audioCodecs: ['mulaw8'] }));
      await next('ready'); target.socket = socket; target.next = next;
    }
    return target;
  }
  const speaker = await connect('speaker', 'soak-speaker-radio', 'speaker', true);
  for (let index = 0; index < 7; index++) {
    const name = index < 4 ? 'admin' : 'speaker', mode = index < 4 ? 'wss' : 'sse';
    listeners.push(await connect(name, `soak-listener-radio-${index}`, mode, index !== 6));
  }
  const claim = await call('speaker', '/floor', { clientId: speaker.id, action: 'claim' });
  const packet = codec.encode(Int16Array.from({ length: 1920 }, (_, index) => Math.round(Math.sin(index * 2 * Math.PI * 400 / 16000) * 12000)));
  const start = performance.now(); let renewed = start, renewals = 0;
  for (let sequence = 0; sequence < 250; sequence++) {
    await delay(start + sequence * 120 - performance.now());
    speaker.socket.send(JSON.stringify({ type: 'audio', floorId: claim.floor.id, sequence, ...packet }));
    if (performance.now() - renewed >= 6500) {
      await call('speaker', '/floor', { clientId: speaker.id, action: 'renew' }); renewed = performance.now(); renewals++;
    }
  }
  speaker.socket.send(JSON.stringify({ type: 'flush', floorId: claim.floor.id, sequence: 249 })); await speaker.next('flushed');
  await call('speaker', '/floor', { clientId: speaker.id, action: 'release' });
  const deadline = performance.now() + 2000;
  while (listeners.some(target => target.count < 250) && performance.now() < deadline) await delay(20);
  for (const target of listeners) {
    assert.equal(target.count, 250, target.id); assert.equal(target.samples / (target.compressed ? 8000 : 16000), 30, target.id);
  }
  assert.ok(renewals >= 4); assert.equal(speaker.count, 0);
  t.diagnostic('1 750 fragments reçus dans l’ordre ; 30 secondes par destinataire ; aucun audio écrit sur disque. Ceci ne mesure pas la lecture sur téléphone.');
});
