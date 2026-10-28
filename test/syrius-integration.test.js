'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');

test('Intégration avec le serveur PHENIX, le portail ARGOS et l’administration centrale', async t => {
  const root = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'syrius-server-test-'));
  fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({
    users: [{ id: 'integration-admin', login: 'integration-admin', role: 'admin', displayName: 'Administration test', passwordHash: bcrypt.hashSync('integration-test-only', 4), passwordChangedAt: new Date().toISOString() }],
    events: [{ id: 'integration-event', title: 'Test uniquement' }]
  }));
  fs.writeFileSync(path.join(directory, 'portal.json'), JSON.stringify({
    schemaVersion: 2, users: [], categories: [{ id: 'cat-operationnel', name: 'Opérationnel', order: 10 }],
    apps: [{ id: 'app-phenix', name: 'PHENIX', categoryId: 'cat-operationnel', url: '/', order: 10 }]
  }));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: {
    ...process.env, NODE_ENV: 'development', RENDER: 'false', PORT: String(port),
    SESSION_SECRET: 'isolated-integration-test-not-production-2026',
    PHENIX_DATA_FILE: path.join(directory, 'data.json'), CENTRAL_ADMIN_DATA_FILE: path.join(directory, 'admin.json'),
    SYRIUS_DATA_FILE: path.join(directory, 'syrius.json'), PORTAL_DATA_DIR: directory,
    ATLAS_DATA_DIR: directory, ARRETES_DATA_DIR: path.join(directory, 'arretes'), AUTO_REFRESH_STREETS: 'false'
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  t.after(async () => {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Démarrage impossible : ${output}`)), 5000);
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('PHENIX sécurisé prêt')) { clearTimeout(timer); resolve(); } });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Serveur arrêté (${code}) : ${output}`)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  const login = await fetch(`${origin}/syrius/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'integration-admin', password: 'integration-test-only' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const status = await fetch(`${origin}/api/status`, { headers: { cookie } });
  assert.equal((await status.json()).user.id, 'integration-admin');
  const bootstrap = await fetch(`${origin}/syrius/api/bootstrap`, { headers: { cookie } });
  assert.equal((await bootstrap.json()).user.role, 'admin');
  for (const asset of ['app.js', 'styles.css', 'icons.svg', 'favicon.svg', 'map-fallback.svg', 'radio-audio.js', 'audio-worklet.js', 'manifest.webmanifest', 'sw.js', 'offline.html', 'icon-192.png', 'icon-512.png']) {
    assert.equal((await fetch(`${origin}/syrius/${asset}`)).status, 200, asset);
  }
  const manifest = await (await fetch(`${origin}/syrius/manifest.webmanifest`)).json();
  assert.equal(manifest.scope, '/syrius/'); assert.equal(manifest.display, 'standalone');
  const worker = await fetch(`${origin}/syrius/sw.js`);
  assert.match(worker.headers.get('content-type'), /javascript/);
  const permissions = (await fetch(`${origin}/syrius/`)).headers.get('permissions-policy');
  assert.match(permissions, /microphone=\(self\)/);
  const catalog = await fetch(`${origin}/portail/administration/api/catalog`, { headers: { cookie } });
  assert.equal(catalog.status, 200);
  assert.ok((await catalog.json()).applications.some(app => app.id === 'syrius'));
  const portalLogin = await fetch(`${origin}/portail/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'integration-admin', password: 'integration-test-only' }) });
  assert.equal(portalLogin.status, 200);
  const portal = await fetch(`${origin}/portail/api/portal`, { headers: { cookie: portalLogin.headers.get('set-cookie').split(';')[0] } });
  const portalData = await portal.json();
  assert.ok(portalData.apps.some(app => app.url === '/'), JSON.stringify(portalData.apps));
  assert.ok(portalData.apps.some(app => app.id === 'app-syrius' && app.url === '/syrius/'));
});
