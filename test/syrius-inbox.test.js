'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('La voix du groupe rejoint peut arriver avant la mise à jour de l’écran, sans doublon entre WSS et SSE', () => {
  const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../syrius/audio-inbox.js'), 'utf8'), { window });
  let desiredChannel = 'a', changes = 0; const heard = [];
  const inbox = new window.SyriusAudioInbox({ clientId: 'local', getChannel: () => desiredChannel, onPacket: packet => heard.push(packet), onChannelChange: () => changes++ });
  const packet = { channelId: 'a', from: 'remote', floorId: 'f1', serial: 5, sequence: 0 };
  assert.equal(inbox.receive(packet), true); assert.equal(heard.length, 1);
  assert.equal(inbox.receive({ ...packet, serial: 4 }), false, 'un ancien fragment SSE ne suit pas un fragment WSS plus récent');
  assert.equal(inbox.receive(packet), false, 'pas de double lecture');
  desiredChannel = 'b'; assert.equal(inbox.receive({ ...packet, serial: 6 }), false, 'le groupe quitté ne reste pas audible');
  assert.equal(inbox.receive({ ...packet, channelId: 'b', serial: 7 }), true); assert.equal(changes, 2);
  assert.equal(inbox.receive({ ...packet, channelId: 'b', from: 'local', serial: 8 }), false, 'aucun écho local');
  desiredChannel = null; assert.equal(inbox.receive({ ...packet, channelId: 'b', serial: 9 }), false);
  desiredChannel = 'b'; inbox.resetConnection(); assert.equal(inbox.receive({ ...packet, channelId: 'b', serial: 1 }), true, 'compteur neuf après reconnexion serveur');
});
