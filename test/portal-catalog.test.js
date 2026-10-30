'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePortalCatalog } = require('../portal-catalog');

function legacy() {
  return { schemaVersion: 2, users: [{ id: 'legacy-user' }], categories: [{ id: 'cat-operationnel', name: 'Opérationnel', order: 10 }], apps: [{ id: 'app-phenix', name: 'PHENIX', categoryId: 'cat-operationnel', url: '/', logoData: 'logo-test', order: 12 }] };
}

test('Le catalogue rétablit les rubriques et rend les tuiles automatiques administrables', () => {
  const source = legacy(), before = structuredClone(source), catalog = normalizePortalCatalog(source);
  assert.deepEqual(source, before, 'la lecture ne réécrit pas le fichier source');
  assert.equal(catalog.schemaVersion, 3);
  assert.deepEqual(catalog.categories.map(item => item.id), ['cat-operationnel', 'cat-outils', 'cat-documentation']);
  assert.deepEqual(catalog.apps.map(item => item.id), ['app-phenix', 'app-dashboard', 'app-syrius']);
  assert.equal(catalog.apps[0].url, '/phenix/'); assert.equal(catalog.apps[0].logoData, 'logo-test'); assert.equal(catalog.apps[0].order, 12);
  assert.deepEqual(catalog.users, before.users);
  assert.deepEqual(normalizePortalCatalog(catalog), catalog, 'la migration est stable');
});

test('Les catégories et tuiles personnalisées ne sont ni remplacées ni dupliquées', () => {
  const source = legacy();
  source.categories.push({ id: 'custom-tools', name: 'Outils et applications', order: 72 });
  source.apps.push({ id: 'custom-radio', name: 'Radio locale', url: 'https://pegase-2.onrender.com/syrius/?mode=test', categoryId: 'custom-tools', accentColor: '#123456' });
  source.apps.push({ id: 'custom-dashboard', name: 'Écran du service', url: '/dashboard/?tv=1', categoryId: 'custom-tools' });
  const catalog = normalizePortalCatalog(source, { syrius: { title: 'Titre central' } });
  assert.equal(catalog.categories.filter(item => item.name === 'Outils et applications').length, 1);
  assert.equal(catalog.apps.length, 3);
  assert.deepEqual(catalog.apps[1], source.apps[1]); assert.deepEqual(catalog.apps[2], source.apps[2]);
});

test('Une suppression volontaire ne fait pas réapparaître les tuiles ni les rubriques', () => {
  const catalog = normalizePortalCatalog(legacy());
  catalog.apps = catalog.apps.filter(item => item.id === 'app-phenix');
  catalog.categories = catalog.categories.filter(item => item.id === 'cat-operationnel');
  assert.deepEqual(normalizePortalCatalog(catalog), catalog);
});

test('Une tuile sans rubrique est récupérée et peut être déplacée depuis l’administration', () => {
  const catalog = normalizePortalCatalog({ schemaVersion: 3, categories: [], apps: [{ id: 'orphan', name: 'Lien conservé', categoryId: 'missing', url: 'https://example.org/' }] });
  assert.equal(catalog.apps[0].categoryId, 'cat-non-classe');
  assert.equal(catalog.categories[0].name, 'Sans catégorie');
  assert.deepEqual(normalizePortalCatalog(catalog), catalog);
});

test('La tuile radio suit l’apparence centrale jusqu’à sa personnalisation', () => {
  const appearance = { title: 'Radio du service', subtitle: 'Contact', logoData: 'logo-test', accentColor: '#abcdef' };
  const catalog = normalizePortalCatalog(legacy(), { syrius: appearance });
  const radio = catalog.apps.find(item => item.id === 'app-syrius');
  assert.equal(radio.name, appearance.title); assert.equal(radio.logoData, appearance.logoData);
  radio.followAppearance = false; radio.name = 'Nom choisi'; radio.categoryId = 'cat-outils';
  const reloaded = normalizePortalCatalog(catalog, { syrius: { ...appearance, title: 'Autre nom' } }).apps.find(item => item.id === radio.id);
  assert.equal(reloaded.name, 'Nom choisi'); assert.equal(reloaded.categoryId, 'cat-outils');
});
