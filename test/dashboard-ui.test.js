'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const pages = require('../dashboard/pages');

async function screen(canEdit = false) {
  const elements = new Map(), clock = { now: 100000 };
  function element(id) {
    const classes = new Set();
    return { id, open: false, dataset: {}, value: '', textContent: '', html: '', style: { setProperty() {} },
      classList: { add(...names) { names.forEach(name => classes.add(name)); }, remove(...names) { names.forEach(name => classes.delete(name)); }, contains: name => classes.has(name), toggle(name, force) { const add = force ?? !classes.has(name); if (add) classes.add(name); else classes.delete(name); return add; } },
      set innerHTML(value) { this.html = value; registerIds(value); }, get innerHTML() { return this.html; },
      replaceChildren() { this.html = ''; }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; }, focus() {}
    };
  }
  function registerIds(html) { for (const match of html.matchAll(/\bid="([^"]+)"/g)) if (!elements.has(match[1])) elements.set(match[1], element(match[1])); }
  registerIds(fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8'));
  const data = pages.migrateDashboard({ schemaVersion: 1, revision: 1, settings: { title: 'Titre test', font: 'system', showClock: true, displaySeconds: 20 }, duty: { label: 'ASTREINTE DIRECTION', name: 'Responsable test', phone: '01 02 03 04 05', note: '' },
    blocks: [{ id: 'news', kind: 'news', width: 6, minHeight: 360, background: '#ffffff', color: '#193b4d', title: 'Vie du service', items: [] }],
    posts: [1, 2].map(id => ({ id: `post-${id}`, title: `Publication ${id}`, body: 'Texte de test', createdAt: '2026-10-01T12:00:00Z', createdBy: { id: 'author', name: 'Auteur test' }, image: '/dashboard/media/photo.jpg' }))
  });
  const context = vm.createContext({
    document: { hidden: false, body: element('body'), documentElement: element('html'), getElementById(id) { assert.ok(elements.has(id), `élément présent : ${id}`); return elements.get(id); }, querySelector: () => element('meta'), querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, scrollTo() {} }, DashboardPages: pages, DashboardPhotos: {}, crypto: webcrypto,
    Headers, Blob, URL, Intl, Date: class extends Date { static now() { return clock.now; } }, structuredClone,
    fetch: async () => ({ ok: true, json: async () => ({ dashboard: structuredClone(data), user: { name: 'Compte test', canEdit, centralAdmin: canEdit }, appearance: {}, csrfToken: 'test' }) }),
    setInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, confirm: () => true
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dashboard/app.js'), 'utf8'), context);
  await vm.runInContext('loadState(true)', context);
  return { elements, clock, api: vm.runInContext('({state, loadState, rotationTick, setCurrentPage, beginEdit, change})', context) };
}

test('L’écran affiche l’astreinte sur sa page puis une publication compacte et garde la minute malgré le rafraîchissement', async () => {
  const { elements, clock, api } = await screen();
  assert.match(elements.get('board').innerHTML, /data-kind="duty"/);
  assert.match(elements.get('board').innerHTML, /Responsable test/);
  assert.equal(elements.get('edit-page').classList.contains('hidden'), true);
  assert.equal(elements.get('manage-pages').classList.contains('hidden'), true);
  const deadline = api.state.nextPageAt;
  clock.now += 30000; await api.loadState();
  assert.equal(api.state.nextPageAt, deadline, 'le rafraîchissement ne recommence pas le compte à rebours');
  clock.now = deadline; api.rotationTick();
  assert.equal(api.state.pageId, 'page-publications');
  const html = elements.get('board').innerHTML;
  assert.doesNotMatch(html, /data-kind="duty"/);
  assert.match(html, /--post-image-height:120px/); assert.match(html, /data-fixed="true"/);
  assert.equal((html.match(/class="post(?: |")/g) || []).length, 1, 'une seule publication est affichée par défaut');
  assert.match(html, /Auteur test/);
});

test('L’éditeur garde son brouillon en changeant de page et le défilement reste suspendu', async () => {
  const { elements, clock, api } = await screen(true);
  assert.equal(elements.get('manage-pages').classList.contains('hidden'), false);
  api.beginEdit(); api.change(() => { api.state.data.duty.name = 'Nouveau responsable'; });
  clock.now += 90000; api.rotationTick();
  assert.equal(api.state.pageId, 'page-informations');
  api.setCurrentPage('page-publications'); api.setCurrentPage('page-informations');
  assert.equal(api.state.data.duty.name, 'Nouveau responsable');
  assert.equal(api.state.dirty, true); assert.equal(api.state.editing, true);
  assert.match(elements.get('board').innerHTML, /Nouveau responsable/);
});
