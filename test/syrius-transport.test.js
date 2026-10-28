'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(request = async () => ({ path: '/syrius/audio', ticket: 'test-ticket' })) {
  const sockets = [], lost = [], modes = [];
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.messages = []; sockets.push(this); }
    send(raw) { this.messages.push(JSON.parse(raw)); }
    opened() { this.readyState = 1; this.onopen(); }
    receive(body) { this.onmessage({ data: JSON.stringify(body) }); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const window = { location: { href: 'https://radio.example/syrius/', origin: 'https://radio.example' } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../syrius/audio-transport.js'), 'utf8'), { window, WebSocket: Socket, URL, AbortController, setTimeout, clearTimeout });
  const transport = new window.SyriusAudioTransport({ clientId: 'test-client', request, onLost: error => lost.push(error), onState: mode => modes.push(mode) });
  return { transport, sockets, lost, modes };
}

test('Le flux WSS n’attend aucun accusé entre les fragments ; seul le dernier est confirmé', async () => {
  const { transport, sockets } = harness();
  const opening = transport.open(); await new Promise(resolve => setImmediate(resolve));
  const socket = sockets[0]; assert.equal(socket.url, 'wss://radio.example/syrius/audio');
  socket.opened(); assert.equal(socket.messages[0].type, 'auth'); assert.equal(socket.url.includes('test-ticket'), false);
  socket.receive({ type: 'ready' }); await opening; transport.startFloor('f1');
  for (let sequence = 0; sequence < 20; sequence++) await transport.send({ floorId: 'f1', sequence, sampleRate: 16000, pcm: 'AAAAAA==' });
  assert.equal(socket.messages.filter(message => message.type === 'audio').length, 20);
  let finished = false; const closing = transport.finish('f1', 19).then(() => { finished = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false);
  socket.receive({ type: 'flushed', floorId: 'f1', sequence: 18 }); assert.equal(finished, false);
  socket.receive({ type: 'flushed', floorId: 'f1', sequence: 19 }); await closing; assert.equal(finished, true);
  transport.close();
});

test('Une coupure WSS arrête la phrase et ne la bascule pas en HTTP au milieu des fragments', async () => {
  const calls = []; const { transport, sockets, lost } = harness(async (...args) => { calls.push(args); return { path: '/syrius/audio', ticket: 'test-ticket' }; });
  const opening = transport.open(); await new Promise(resolve => setImmediate(resolve));
  sockets[0].opened(); sockets[0].receive({ type: 'ready' }); await opening;
  transport.startFloor('f1'); sockets[0].close(); assert.equal(lost.length, 1);
  await assert.rejects(transport.send({ floorId: 'f1', sequence: 0 }), /interrompue/);
  assert.equal(calls.filter(call => call[0] === '/audio').length, 0);
  transport.close();
});

test('Le secours HTTP accepte un lot et une fermeture annule un ticket encore en préparation', async () => {
  const calls = []; const { transport } = harness(async (...args) => { calls.push(args); throw new Error('WSS indisponible'); });
  await transport.open(); transport.startFloor('fallback');
  await transport.send({ floorId: 'fallback', packets: [{ sequence: 0 }, { sequence: 1 }] }).catch(() => {});
  assert.equal(calls.at(-1)[0], '/audio'); assert.equal(calls.at(-1)[1].packets.length, 2);
  await transport.finish('fallback', 1); transport.close();
  let issue;
  const pending = harness(() => new Promise(resolve => { issue = resolve; }));
  const opening = pending.transport.open(); pending.transport.close(); issue({ path: '/syrius/audio', ticket: 'expired' });
  await opening; assert.equal(pending.sockets.length, 0, 'une fermeture ne peut pas rouvrir le flux en retard');
});
