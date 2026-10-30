'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PAGE_INTERVAL_MS, migrateDashboard, nextPageId, pageBlocks, rotationStep, moveBlock } = require('../dashboard/pages');

function legacyData() {
  return { schemaVersion: 1, revision: 9, settings: { title: 'Informations utiles', font: 'system' }, duty: { label: 'ASTREINTE DIRECTION', name: 'Responsable test', phone: '01 02 03 04 05', note: 'Consigne de test' },
    blocks: [{ id: 'news', kind: 'news', width: 8, minHeight: 400, items: [] }, { id: 'agenda', kind: 'meetings', width: 4, items: [{ id: 'meeting', title: 'Réunion test', start: '2026-11-03T08:30:00.000Z' }] }, { id: 'text', kind: 'text', width: 4, body: 'Information conservée', items: [] }],
    posts: [{ id: 'post', title: 'Publication test', image: '/dashboard/media/photo.jpg', createdBy: { id: 'user', name: 'Auteur test' } }]
  };
}

test('L’ancien dashboard est réparti sur deux pages avec une petite astreinte sans perdre les contenus', () => {
  const data = legacyData(), posts = structuredClone(data.posts), meetings = structuredClone(data.blocks[1].items), duty = structuredClone(data.duty);
  migrateDashboard(data);
  assert.equal(data.schemaVersion, 2); assert.equal(data.revision, 9);
  assert.deepEqual(data.pages.map(page => page.title), ['Informations', 'Vie du service']);
  assert.deepEqual(data.posts, posts); assert.deepEqual(data.duty, duty);
  const tile = data.blocks.find(block => block.kind === 'duty');
  assert.equal(tile.width, 3); assert.equal(tile.minHeight, 180); assert.equal(tile.pageId, data.pages[0].id);
  assert.equal(data.blocks.find(block => block.id === 'news').pageId, data.pages[1].id);
  assert.equal(data.blocks.find(block => block.id === 'news').fixedHeight, true);
  assert.equal(data.blocks.find(block => block.id === 'news').imageHeight, 120);
  assert.equal(data.blocks.find(block => block.id === 'news').newsLimit, 1);
  assert.deepEqual(data.blocks.find(block => block.id === 'agenda').items, meetings);
  assert.equal(data.blocks.find(block => block.id === 'text').body, 'Information conservée');
  assert.equal(data.settings.pageSeconds, 60);
  const once = structuredClone(data); migrateDashboard(data); assert.deepEqual(data, once, 'la migration ne duplique pas les pages ou l’astreinte');
});

test('Les pages et tailles choisies sont conservées après migration', () => {
  const data = migrateDashboard(legacyData());
  data.pages.reverse(); data.pages[0].title = 'Page personnalisée';
  const news = data.blocks.find(block => block.kind === 'news'); news.imageHeight = 80; news.imageWidth = 30; news.fixedHeight = false; news.newsLimit = 2;
  data.blocks = data.blocks.filter(block => block.kind !== 'duty');
  const before = structuredClone(data); migrateDashboard(data);
  assert.deepEqual(data, before, 'une astreinte volontairement retirée n’est pas réinsérée');
});

test('Les pages avancent toutes les 60 secondes et reviennent à la première', () => {
  const pages = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  assert.equal(PAGE_INTERVAL_MS, 60000);
  assert.deepEqual(rotationStep(pages, 'one', 60000, 59999), { pageId: 'one', nextAt: 60000, changed: false });
  assert.deepEqual(rotationStep(pages, 'one', 60000, 60000), { pageId: 'two', nextAt: 120000, changed: true });
  assert.deepEqual(rotationStep(pages, 'three', 180000, 180000), { pageId: 'one', nextAt: 240000, changed: true });
});

test('L’édition, une fenêtre ouverte ou une pause empêchent d’avancer et la reprise laisse une minute complète', () => {
  const pages = [{ id: 'one' }, { id: 'two' }];
  const paused = rotationStep(pages, 'one', 60000, 120000, true);
  assert.deepEqual(paused, { pageId: 'one', nextAt: 180000, changed: false });
  assert.equal(rotationStep(pages, paused.pageId, paused.nextAt, 179999).changed, false);
  assert.equal(rotationStep(pages, paused.pageId, paused.nextAt, 180000).pageId, 'two');
});

test('La navigation manuelle fonctionne dans les deux sens et une page supprimée est remplacée', () => {
  const pages = [{ id: 'one' }, { id: 'two' }];
  assert.equal(nextPageId(pages, 'one', -1), 'two'); assert.equal(nextPageId(pages, 'two'), 'one');
  assert.equal(nextPageId([], 'one'), '');
  assert.deepEqual(rotationStep(pages, 'removed', 1, 90000), { pageId: 'one', nextAt: 150000, changed: true });
  assert.equal(rotationStep([{ id: 'one' }], 'one', 1, 90000).changed, false);
});

test('Les blocs sont filtrés par page et leur déplacement ne traverse pas les autres pages', () => {
  const data = { blocks: [{ id: 'a', pageId: 'one' }, { id: 'other', pageId: 'two' }, { id: 'b', pageId: 'one', hidden: true }, { id: 'c', pageId: 'one' }] };
  assert.deepEqual(pageBlocks(data, 'one').map(block => block.id), ['a', 'c']);
  assert.deepEqual(pageBlocks(data, 'one', true).map(block => block.id), ['a', 'b', 'c']);
  assert.equal(moveBlock(data, 'a', 1), true);
  assert.deepEqual(pageBlocks(data, 'one', true).map(block => block.id), ['b', 'a', 'c']);
  assert.deepEqual(pageBlocks(data, 'two').map(block => block.id), ['other']);
  assert.equal(moveBlock(data, 'c', 1), false); assert.equal(moveBlock(data, 'missing', 1), false);
});
