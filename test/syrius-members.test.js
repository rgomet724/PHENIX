'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function pickerHarness() {
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag; this.children = []; this.value = ''; this.textContent = ''; this.classList = { toggle() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
  }
  const window = {}, document = { createElement: tag => new Element(tag) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../syrius/member-picker.js'), 'utf8'), { window, document });
  const elements = Object.fromEntries(['list', 'search', 'summary', 'empty', 'clear'].map(name => [name, new Element(name)]));
  const picker = new window.SyriusMemberPicker(elements);
  const filter = text => { elements.search.value = text; elements.search.dispatchEvent(new Event('input')); };
  const checkbox = id => elements.list.children.map(row => row.children[0]).find(input => input.value === id);
  const select = (id, checked) => { const input = checkbox(id); assert.ok(input); assert.ok(!input.disabled); input.checked = checked; input.dispatchEvent(new Event('change')); };
  return { picker, ...elements, filter, checkbox, select };
}
const agents = [
  { id: 'alpha', name: 'Équipe Alpha', login: 'pm001', role: 'user', enabled: true },
  { id: 'bravo', name: 'Agent Bravo', login: 'pm002', role: 'user', enabled: true },
  { id: 'off', name: 'Agent désactivé', login: 'pm003', role: 'user', enabled: false }
];

test('Le choix des agents résiste aux recherches par nom et identifiant, sans perdre les cases hors écran', () => {
  const h = pickerHarness(); h.picker.open(agents, []);
  assert.equal(h.list.children.length, 3, 'tous les comptes sont affichés, sans condition de présence en ligne');
  h.filter('equipe'); h.select('alpha', true);
  h.filter('pm002'); h.select('bravo', true);
  h.filter('introuvable'); assert.equal(h.empty.hidden, false);
  assert.deepEqual([...h.picker.memberIds].sort(), ['alpha', 'bravo']);
  assert.match(h.summary.textContent, /2 agents sélectionnés/);
  h.filter(''); assert.equal(h.checkbox('alpha').checked, true); assert.equal(h.checkbox('bravo').checked, true);
  const enter = new Event('keydown', { cancelable: true }); Object.defineProperty(enter, 'key', { value: 'Enter' });
  h.search.dispatchEvent(enter); assert.equal(enter.defaultPrevented, true, 'Entrée dans la recherche ne sauvegarde pas le formulaire');
  h.clear.dispatchEvent(new Event('click')); assert.deepEqual([...h.picker.memberIds], []);
  assert.match(h.summary.textContent, /seuls les administrateurs/);
});

test('Les comptes désactivés restent visibles ; une appartenance existante peut être retirée', () => {
  const h = pickerHarness(); h.picker.open(agents, []);
  assert.equal(h.checkbox('off').disabled, true);
  h.picker.open(agents, ['off', 'deleted']);
  assert.equal(h.checkbox('off').checked, true); assert.equal(h.checkbox('off').disabled, false);
  assert.equal(h.checkbox('deleted').checked, true);
  h.select('off', false); h.select('deleted', false);
  assert.deepEqual([...h.picker.memberIds], []);
});

test('Une mise à jour du répertoire conserve les choix en cours et une autre conférence repart de ses propres agents', () => {
  const h = pickerHarness(); h.picker.open(agents, ['alpha']); h.select('bravo', true);
  h.picker.refresh(agents.map(user => user.id === 'alpha' ? { ...user, enabled: false } : user));
  assert.deepEqual([...h.picker.memberIds].sort(), ['alpha', 'bravo']);
  h.select('alpha', false); assert.deepEqual([...h.picker.memberIds], ['bravo']);
  h.picker.open(agents, []); assert.equal(h.checkbox('alpha').checked, false); assert.equal(h.checkbox('bravo').checked, false);
});
