'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Le maintien tactile PTT annule les gestes de sélection même si le micro n’est pas prêt', () => {
  const surface = new EventTarget(), button = new EventTarget(), document = new EventTarget(), window = new EventTarget();
  let enabled = false, started = 0, stopped = 0, removedSelection = 0;
  const selection = { anchorNode: button, focusNode: button, removeAllRanges() { removedSelection++; } };
  window.getSelection = () => selection;
  surface.contains = node => node === button; surface.setPointerCapture = () => {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../syrius/ptt-control.js'), 'utf8'), { window, document });
  window.bindSyriusPtt({ button, surface, canStart: () => enabled, start: () => started++, stop: () => stopped++ });
  const touch = (type, id) => {
    const event = new Event(type, { cancelable: true });
    event.touches = [{ identifier: id }]; event.changedTouches = [{ identifier: id }]; return event;
  };
  let event = touch('touchstart', 1); surface.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true); assert.equal(started, 0); assert.equal(removedSelection, 1);
  document.dispatchEvent(touch('touchend', 1));
  enabled = true; event = touch('touchstart', 2); surface.dispatchEvent(event);
  assert.equal(started, 1); assert.equal(event.defaultPrevented, true);
  const pointer = new Event('pointerdown', { cancelable: true }); pointer.pointerType = 'touch'; pointer.button = 0; pointer.pointerId = 2;
  surface.dispatchEvent(pointer); assert.equal(started, 1, 'pas de double émission touch + pointer');
  for (const type of ['touchmove', 'contextmenu', 'selectstart', 'dragstart']) {
    const blocked = new Event(type, { cancelable: true }); surface.dispatchEvent(blocked); assert.equal(blocked.defaultPrevented, true);
  }
  document.dispatchEvent(touch('touchend', 99)); assert.equal(stopped, 1, 'un autre doigt ne rend pas la parole');
  document.dispatchEvent(touch('touchcancel', 2)); assert.equal(stopped, 2);
  const mouse = new Event('pointerdown', { cancelable: true }); mouse.pointerType = 'mouse'; mouse.button = 0; mouse.pointerId = 7;
  surface.dispatchEvent(mouse); assert.equal(started, 2);
  const up = new Event('pointerup'); up.pointerId = 7; window.dispatchEvent(up); assert.equal(stopped, 3);
  selection.anchorNode = {}; selection.focusNode = {}; surface.dispatchEvent(mouse);
  assert.equal(removedSelection, 3, 'la sélection de la messagerie n’est pas effacée');
  window.dispatchEvent(new Event('blur')); assert.equal(stopped, 4);
});
