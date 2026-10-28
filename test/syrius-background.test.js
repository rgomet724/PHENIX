'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Le mode arrière-plan préserve l’écoute, libère le PTT et respecte une pause explicite', async () => {
  const document = new EventTarget(), handlers = {}, window = {}, state = { active: true, paused: false, title: 'Groupe A', artist: 'Radio' };
  const navigator = { mediaSession: { setActionHandler: (name, callback) => { handlers[name] = callback; } } };
  let resumed = 0, paused = 0, released = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../syrius/background-audio.js'), 'utf8'), { window, document, navigator, MediaMetadata: class { constructor(value) { Object.assign(this, value); } } });
  const background = new window.SyriusBackgroundAudio({
    resume: async () => { resumed++; state.paused = false; }, stopTransmission: () => released++, pauseListening: () => { paused++; state.paused = true; },
    canResume: () => true, getState: () => state
  });
  background.update(); assert.equal(navigator.mediaSession.playbackState, 'playing'); assert.equal(navigator.mediaSession.metadata.title, 'Groupe A');
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(released, 1); assert.equal(paused, 0, 'le site ne coupe plus la lecture au verrouillage');
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(resumed, 1);
  handlers.pause(); assert.equal(paused, 1); assert.equal(navigator.mediaSession.playbackState, 'paused');
  document.dispatchEvent(new Event('visibilitychange')); assert.equal(resumed, 1, 'une pause utilisateur ne se réactive pas seule');
  handlers.play(); await new Promise(resolve => setImmediate(resolve)); assert.equal(resumed, 2);
  background.enabled = false; document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(paused, 2);
  state.active = false; background.update(); assert.equal(navigator.mediaSession.playbackState, 'none'); assert.equal(navigator.mediaSession.metadata, null);
});
