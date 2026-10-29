'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizePortalApp, isPhenixAppUrl } = require('../app-navigation');

test('Les anciennes tuiles PHENIX atteignent la nouvelle application avec leurs paramètres', () => {
  for (const [url, expected] of [
    ['/', '/phenix/'],
    ['/index.html?mode=dashboard#equipes', '/phenix/?mode=dashboard#equipes'],
    ['https://pegase-2.onrender.com/', 'https://pegase-2.onrender.com/phenix/'],
    ['https://pegase-2.onrender.com/?mode=dashboard#equipes', 'https://pegase-2.onrender.com/phenix/?mode=dashboard#equipes']
  ]) {
    const app = { id: 'app-phenix', name: 'PHENIX', url, order: 10 };
    const adapted = normalizePortalApp(app);
    assert.equal(adapted.url, expected);
    assert.equal(app.url, url, 'la configuration enregistrée reste intacte');
    assert.equal(normalizePortalApp(adapted).url, expected, 'la conversion est stable');
    assert.equal(isPhenixAppUrl(adapted.url), true, 'les restrictions PHENIX reconnaissent la nouvelle URL');
  }
  assert.equal(normalizePortalApp({ id: 'custom-id', name: 'Phenix', url: '/' }).url, '/phenix/');
});

test('Les liens ARGOS, externes et personnalisés gardent leur destination', () => {
  for (const app of [
    { id: 'app-argos', name: 'ARGOS', url: '/' },
    { id: 'app-phenix', name: 'PHENIX', url: '/phenix/' },
    { id: 'app-phenix', name: 'PHENIX', url: '/autre-application/' },
    { id: 'app-phenix', name: 'PHENIX', url: 'https://example.org/' },
    { id: 'external', name: 'Documentation', url: 'https://example.org/' }
  ]) assert.deepEqual(normalizePortalApp(app), app);
  assert.equal(isPhenixAppUrl('/phenix'), true);
  assert.equal(isPhenixAppUrl('/phenix/'), true);
  assert.equal(isPhenixAppUrl('/'), false);
  assert.equal(isPhenixAppUrl('/phenix-other/'), false);
  assert.equal(isPhenixAppUrl('https://example.org/phenix/'), false);
});

test('Les boutons PHENIX ouvrent ARGOS et l’administration dans de nouveaux onglets', async () => {
  const opened = [];
  const window = { location: { href: '/phenix/' }, open: (...args) => opened.push(args) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/admin-theme.js'), 'utf8'), {
    window, fetch: async () => ({ ok: false })
  });
  window.openArgosPortal();
  window.openCentralAdmin();
  assert.deepEqual(opened, [
    ['/', '_blank', 'noopener,noreferrer'],
    ['/portail/administration/', '_blank', 'noopener,noreferrer']
  ]);
  assert.equal(window.location.href, '/phenix/');
});
