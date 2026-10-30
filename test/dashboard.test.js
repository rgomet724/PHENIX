'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phenix-dashboard-test-'));
process.env.CENTRAL_ADMIN_DATA_FILE = path.join(directory, 'admin.json');
const { mountDashboard } = require('../dashboard-router');
const { loadAdminConfig, saveAdminConfig, setUserPolicy, policyForUser } = require('../central-config');

test('Dashboard : accès distinct, édition protégée, publications, photos et persistance', async t => {
  const password = 'dashboard-test-only-2026';
  const users = [
    { id: 'admin', login: 'admin', displayName: 'Admin test', role: 'admin' },
    { id: 'supervisor', login: 'supervisor', displayName: 'Superviseur test', role: 'superviseur' },
    { id: 'operator', login: 'operator', displayName: 'Opérateur test', role: 'operateur' },
    { id: 'blocked', login: 'blocked', displayName: 'Compte sans accès', role: 'operateur' },
    { id: 'expired', login: 'expired', displayName: 'Compte expiré', role: 'superviseur', mustChangePassword: true }
  ].map(user => ({ ...user, passwordHash: bcrypt.hashSync(password, 4) }));
  const config = loadAdminConfig(true);
  for (const user of users) {
    const policy = policyForUser(user, config);
    policy.dashboard.enabled = user.id !== 'blocked';
    if (user.id === 'supervisor') policy.phenix.enabled = false;
    if (user.id === 'operator') policy.dashboard.role = 'admin';
    setUserPolicy(config, user, policy);
  }
  saveAdminConfig(config);
  const filename = path.join(directory, 'dashboard.json');
  const accounts = {};
  function createApp() {
    const app = express(); app.use(express.json({ limit: '4mb' }));
    app.use(session({ secret: 'isolated-dashboard-tests-not-production', resave: false, saveUninitialized: false, name: 'phenix.sid' }));
    mountDashboard(app, { dataFile: filename, loadPhenix: () => ({ users }), savePhenix: () => {}, passwordExpired: user => Boolean(user.mustChangePassword) });
    return app;
  }
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  async function call(route, body, who = 'admin', method = 'POST', extra = {}) {
    const response = await fetch(`${origin}/dashboard/api${route}`, {
      method: body === undefined ? 'GET' : method,
      headers: { cookie: accounts[who]?.cookie || '', 'x-csrf-token': accounts[who]?.csrf || '', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json(), response };
  }
  async function login(who) {
    const result = await call('/login', { login: who, password }, who);
    if (result.status === 200) accounts[who] = { cookie: result.response.headers.get('set-cookie').split(';')[0], csrf: result.data.csrfToken };
    return result;
  }
  let board, photo, post, revision;

  await t.test('L’écran de connexion est public ; les données et photos exigent le droit Dashboard', async () => {
    const redirect = await fetch(`${origin}/dashboard?from=test`, { redirect: 'manual' });
    assert.equal(redirect.headers.get('location'), '/dashboard/?from=test');
    assert.match(await (await fetch(`${origin}/dashboard/`)).text(), /\/dashboard\/pages\.js/);
    assert.equal((await call('/state', undefined, 'anonymous')).status, 401);
    assert.equal((await fetch(`${origin}/dashboard/media/00000000-0000-0000-0000-000000000000.png`)).status, 401);
    assert.equal((await login('blocked')).status, 403);
    assert.equal((await login('expired')).status, 428);
    assert.equal((await call('/login', { login: 'admin', password: 'wrong' }, 'anonymous')).status, 401);
    assert.equal((await login('admin')).data.user.canEdit, true);
    assert.equal((await login('supervisor')).data.user.canEdit, true, 'le droit Dashboard fonctionne même sans accès PHENIX');
    assert.equal((await login('operator')).data.user.canEdit, false, 'un opérateur ne devient pas éditeur même si son rôle Dashboard est mal configuré');
    const result = await call('/state');
    board = result.data.dashboard;
    revision = board.revision;
    assert.equal(result.data.audit, undefined);
    assert.equal(board.audit, undefined);
    assert.equal(board.duty.label, 'ASTREINTE DIRECTION');
  });

  await t.test('Les opérateurs lisent ; seuls superviseurs et administrateurs modifient avec CSRF et bonne origine', async () => {
    assert.equal((await call('/state', undefined, 'operator')).status, 200);
    assert.equal((await call('/board', { ...board, revision }, 'operator', 'PUT')).status, 403);
    assert.equal((await call('/posts', { revision, title: 'Interdit', body: 'Interdit' }, 'operator')).status, 403);
    assert.equal((await call('/board', { ...board, revision }, 'admin', 'PUT', { 'x-csrf-token': '' })).status, 403);
    assert.equal((await call('/board', { ...board, revision }, 'admin', 'PUT', { origin: 'https://outside.example' })).status, 403);
    board.settings.title = 'Dashboard de test'; board.duty.name = 'Direction de test';
    const agenda = board.blocks.find(block => block.kind === 'meetings');
    agenda.items.push({ id: 'meeting-test', title: 'Point de test', start: '2026-11-03T08:30:00.000Z', end: '2026-11-03T09:30:00.000Z', location: 'Salle de test', description: 'Ordre du jour de test', url: 'https://example.org/reunion' });
    const result = await call('/board', { ...board, revision }, 'supervisor', 'PUT');
    assert.equal(result.status, 200, JSON.stringify(result.data));
    board = result.data.dashboard; revision = board.revision;
    assert.equal((await call('/board', { ...board, revision: revision - 1 }, 'admin', 'PUT')).status, 409, 'une ancienne version ne peut pas écraser les modifications');
    assert.equal((await call('/state', undefined, 'operator')).data.dashboard.duty.name, 'Direction de test');
  });

  await t.test('Un compte peut renouveler son mot de passe Dashboard sans accès PHENIX', async () => {
    const expired = users.find(user => user.id === 'expired');
    assert.equal((await call('/password', { login: 'expired', oldPassword: 'wrong', newPassword: 'renewed-dashboard-test' }, 'anonymous')).status, 401);
    assert.equal((await call('/password', { login: 'expired', oldPassword: password, newPassword: 'abc' }, 'anonymous')).status, 400);
    assert.equal((await call('/password', { login: 'expired', oldPassword: password, newPassword: 'renewed-dashboard-test' }, 'anonymous', 'POST', { origin: 'https://outside.example' })).status, 403);
    assert.equal((await call('/password', { login: 'expired', oldPassword: password, newPassword: 'renewed-dashboard-test' }, 'anonymous')).status, 200);
    assert.equal(expired.mustChangePassword, false); assert.ok(expired.passwordChangedAt);
    assert.equal(bcrypt.compareSync('renewed-dashboard-test', expired.passwordHash), true);
    assert.equal((await call('/login', { login: 'expired', password: 'renewed-dashboard-test' }, 'expired')).status, 200);
  });

  await t.test('Les photos sont validées, privées et servies comme images', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
    const upload = async (bytes, who = 'supervisor', type = 'image/png') => fetch(`${origin}/dashboard/api/media`, { method: 'POST', headers: { cookie: accounts[who].cookie, 'x-csrf-token': accounts[who].csrf, 'content-type': type }, body: bytes });
    assert.equal((await upload(png, 'operator')).status, 403);
    assert.equal((await upload(Buffer.from('<svg onload="alert(1)"></svg>'))).status, 400);
    assert.equal((await upload(Buffer.alloc(2 * 1024 * 1024 + 1))).status, 413);
    const uploaded = await upload(png); assert.equal(uploaded.status, 201); photo = (await uploaded.json()).url;
    assert.equal((await fetch(origin + photo)).status, 401);
    const image = await fetch(origin + photo, { headers: { cookie: accounts.operator.cookie } });
    assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /image\/png/);
    assert.match(image.headers.get('cache-control'), /private.*no-store/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    assert.equal((await fetch(`${origin}/dashboard/media/not-a-file.png`, { headers: { cookie: accounts.admin.cookie } })).status, 404);
  });

  await t.test('Les publications portent l’auteur réel et conservent leur attribution après modification', async () => {
    const forged = { id: 'someone-else', name: 'Faux auteur' };
    const created = await call('/posts', { revision, title: 'Nouvelle de test', body: 'Contenu de test', image: photo, pinned: true, createdBy: forged, createdAt: '1900-01-01' }, 'supervisor');
    assert.equal(created.status, 201, JSON.stringify(created.data));
    post = created.data.post; revision = created.data.revision;
    assert.deepEqual(post.createdBy, { id: 'supervisor', name: 'Superviseur test' });
    assert.notEqual(post.createdAt, '1900-01-01');
    const updated = await call(`/posts/${post.id}`, { revision, title: 'Nouvelle corrigée', body: 'Texte corrigé', image: photo, createdBy: forged }, 'admin', 'PUT');
    assert.equal(updated.status, 200); revision = updated.data.revision;
    assert.deepEqual(updated.data.post.createdBy, post.createdBy);
    assert.equal(updated.data.post.updatedBy.id, 'admin');
    assert.ok(updated.data.post.updatedAt);
    assert.equal((await call('/state', undefined, 'operator')).data.dashboard.posts[0].title, 'Nouvelle corrigée');
    assert.equal((await call(`/posts/${post.id}`, { revision }, 'operator', 'DELETE')).status, 403);
  });

  await t.test('La mise en page est validée et ne peut pas introduire de liens exécutables ou de faux médias', async () => {
    board = (await call('/state')).data.dashboard;
    const bad = structuredClone(board); bad.blocks.find(block => block.kind === 'links').items.push({ id: 'evil', label: 'Interdit', url: 'javascript:alert(1)' });
    assert.equal((await call('/board', { ...bad, revision }, 'admin', 'PUT')).status, 400);
    const invalidMeeting = structuredClone(board);
    invalidMeeting.blocks.find(block => block.kind === 'meetings').items[0].start = '2027-02-30T08:30:00.000Z';
    assert.equal((await call('/board', { ...invalidMeeting, revision }, 'admin', 'PUT')).status, 400);
    bad.blocks = structuredClone(board.blocks); bad.blocks[0].image = '/etc/passwd';
    assert.equal((await call('/board', { ...bad, revision }, 'admin', 'PUT')).status, 400);
    const valid = structuredClone(board); valid.blocks.reverse(); valid.blocks[0].width = 12; valid.blocks[0].hidden = true;
    valid.blocks.find(block => block.kind === 'text').body = '<script>alert(1)</script> — conservé comme texte';
    const saved = await call('/board', { ...valid, revision }, 'admin', 'PUT');
    assert.equal(saved.status, 200, JSON.stringify(saved.data)); revision = saved.data.dashboard.revision;
    assert.equal(saved.data.dashboard.blocks[0].id, valid.blocks[0].id);
    assert.equal(saved.data.dashboard.blocks[0].hidden, true);
    assert.equal(saved.data.dashboard.posts[0].createdBy.id, 'supervisor');
  });

  await t.test('L’ancienne page est convertie en plusieurs pages et en astreinte compacte sans perdre les données', async () => {
    const legacy = JSON.parse(fs.readFileSync(filename, 'utf8'));
    legacy.schemaVersion = 1; delete legacy.pages;
    legacy.blocks = legacy.blocks.filter(block => block.kind !== 'duty');
    for (const block of legacy.blocks) for (const key of ['pageId', 'fixedHeight', 'imageHeight', 'imageWidth', 'imageFit', 'newsLimit', 'postId']) delete block[key];
    const originalPosts = structuredClone(legacy.posts), originalDuty = structuredClone(legacy.duty);
    fs.writeFileSync(filename, JSON.stringify(legacy));
    const migrated = (await call('/state')).data.dashboard;
    assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.pages.length, 2);
    assert.deepEqual(migrated.duty, originalDuty); assert.deepEqual(migrated.posts, originalPosts);
    assert.equal(migrated.blocks.find(block => block.kind === 'duty').width, 3);
    const news = migrated.blocks.find(block => block.kind === 'news');
    assert.equal(news.fixedHeight, true); assert.equal(news.imageHeight, 120); assert.equal(news.newsLimit, 1);
    assert.equal(news.pageId, migrated.pages[1].id);
    const saved = await call('/board', { ...migrated, revision }, 'admin', 'PUT');
    assert.equal(saved.status, 200); revision = saved.data.dashboard.revision;
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).schemaVersion, 2);
  });

  await t.test('Les pages et la taille des publications sont enregistrées ; les références invalides sont refusées', async () => {
    board = (await call('/state')).data.dashboard;
    board.pages.push({ id: 'page-extra', title: 'Réunions' });
    board.blocks.find(block => block.kind === 'meetings').pageId = 'page-extra';
    const news = board.blocks.find(block => block.kind === 'news');
    Object.assign(news, { width: 4, minHeight: 260, fixedHeight: true, imageHeight: 80, imageWidth: 40, imageFit: 'contain', newsLimit: 1, postId: post.id });
    const saved = await call('/board', { ...board, settings: { ...board.settings, pageSeconds: 10 }, revision }, 'admin', 'PUT');
    assert.equal(saved.status, 200, JSON.stringify(saved.data)); revision = saved.data.dashboard.revision;
    const view = (await call('/state', undefined, 'operator')).data.dashboard;
    assert.equal(view.pages.length, 3); assert.equal(view.settings.pageSeconds, 60);
    assert.equal(view.blocks.find(block => block.kind === 'meetings').pageId, 'page-extra');
    const visibleNews = view.blocks.find(block => block.kind === 'news');
    assert.equal(visibleNews.imageHeight, 80); assert.equal(visibleNews.imageWidth, 40); assert.equal(visibleNews.fixedHeight, true); assert.equal(visibleNews.postId, post.id);
    const missing = structuredClone(view); missing.blocks[0].pageId = 'missing-page';
    assert.equal((await call('/board', { ...missing, revision }, 'admin', 'PUT')).status, 400);
    const duplicates = structuredClone(view); duplicates.pages[1].id = duplicates.pages[0].id;
    assert.equal((await call('/board', { ...duplicates, revision }, 'admin', 'PUT')).status, 400);
    assert.equal((await call('/board', { ...view, pages: [], revision }, 'admin', 'PUT')).status, 400);
    assert.equal((await call('/board', { ...view, revision }, 'operator', 'PUT')).status, 403);
    assert.equal((await call('/state')).data.dashboard.revision, revision);
  });

  await t.test('Les droits révoqués sont appliqués à une session déjà ouverte', async () => {
    const next = loadAdminConfig(true), operator = users.find(user => user.id === 'operator'), policy = policyForUser(operator, next);
    policy.dashboard.enabled = false; setUserPolicy(next, operator, policy); saveAdminConfig(next);
    assert.equal((await call('/state', undefined, 'operator')).status, 403);
    assert.equal((await fetch(origin + photo, { headers: { cookie: accounts.operator.cookie } })).status, 403);
    users.find(user => user.id === 'supervisor').role = 'operateur';
    assert.equal((await call('/posts', { revision, title: 'Interdit', body: 'Interdit' }, 'supervisor')).status, 403);
  });

  await t.test('Les données et réunions survivent au remontage du routeur ; une base illisible n’est pas réinitialisée', async () => {
    const stored = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(stored.settings.title, 'Dashboard de test');
    assert.equal(stored.blocks.find(block => block.kind === 'meetings').items[0].start, '2026-11-03T08:30:00.000Z');
    assert.equal(stored.posts[0].createdBy.id, 'supervisor'); assert.equal(stored.revision, revision);
    assert.ok(fs.existsSync(`${filename}.backup`)); assert.ok(stored.audit.length > 0);
    const second = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => second.once('listening', resolve));
    try {
      const base = `http://127.0.0.1:${second.address().port}`;
      const login = await fetch(`${base}/dashboard/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'admin', password }) });
      const cookie = login.headers.get('set-cookie').split(';')[0];
      const result = await fetch(`${base}/dashboard/api/state`, { headers: { cookie } });
      assert.equal((await result.json()).dashboard.revision, revision);
      fs.writeFileSync(filename, '{invalid');
      const unavailable = await fetch(`${base}/dashboard/api/state`, { headers: { cookie } });
      assert.equal(unavailable.status, 503); await unavailable.text();
      assert.equal(fs.readFileSync(filename, 'utf8'), '{invalid');
      fs.writeFileSync(filename, JSON.stringify(stored));
    } finally { second.closeAllConnections(); await new Promise(resolve => second.close(resolve)); }
  });

  await t.test('La suppression d’une publication est persistée sans supprimer les réunions', async () => {
    assert.equal((await call(`/posts/${post.id}`, { revision }, 'admin', 'DELETE')).status, 200);
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(data.posts.length, 0); assert.equal(data.blocks.find(block => block.kind === 'meetings').items.length, 1);
  });
});
