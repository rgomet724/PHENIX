'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { createHash } = require('node:crypto');

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
  const home = await fetch(`${origin}/`);
  assert.equal(home.status, 200);
  assert.equal(home.url, `${origin}/`, 'ARGOS reste affiché à la racine');
  assert.match(await home.text(), /<title>.*ARGOS/i);
  assert.match(home.headers.get('cache-control'), /no-store/);
  assert.match(await (await fetch(`${origin}/portail/`)).text(), /<title>.*ARGOS/i);
  const phenixRedirect = await fetch(`${origin}/phenix?mode=test`, { redirect: 'manual' });
  assert.equal(phenixRedirect.status, 302);
  assert.equal(phenixRedirect.headers.get('location'), '/phenix/?mode=test');
  const phenix = await fetch(`${origin}/phenix/`);
  assert.equal(phenix.status, 200);
  assert.match(await phenix.text(), /<title>PHENIX<\/title>/);
  const phenixManifest = await (await fetch(`${origin}/manifest.json`)).json();
  assert.equal(phenixManifest.start_url, '/phenix/');
  assert.equal(phenixManifest.scope, '/phenix/');
  assert.equal((await fetch(`${origin}/admin-theme.js`)).status, 200);
  const login = await fetch(`${origin}/syrius/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'integration-admin', password: 'integration-test-only' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const status = await fetch(`${origin}/api/status`, { headers: { cookie } });
  assert.equal((await status.json()).user.id, 'integration-admin');
  const bootstrap = await fetch(`${origin}/syrius/api/bootstrap`, { headers: { cookie } });
  assert.equal((await bootstrap.json()).user.role, 'admin');
  for (const asset of ['app.js', 'styles.css', 'icons.svg', 'favicon.svg', 'map-fallback.svg', 'radio-audio.js', 'radio-sounds.js', 'audio-transport.js', 'audio-codec.js', 'audio-inbox.js', 'background-audio.js', 'ptt-control.js', 'branding.js', 'audio-worklet.js', 'manifest.webmanifest', 'sw.js', 'offline.html', 'icon-192.png', 'icon-512.png']) {
    assert.equal((await fetch(`${origin}/syrius/${asset}`)).status, 200, asset);
  }
  for (const [asset, hash] of [
    ['ptt.wav', '670a81f9c8036c673b0b801b7038e14e6a3b35ebf336f749c9ef34537160d4f6'],
    ['alerte-code-rouge.mp3', '95507460492852c4bf9c91a4140f379c7c61e30b908b8edda3a95752ec99681a']
  ]) {
    const response = await fetch(`${origin}/syrius/sounds/${asset}`); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /audio\//);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), hash, 'le fichier sonore validé est servi sans modification');
  }
  const manifest = await (await fetch(`${origin}/syrius/manifest.webmanifest`)).json();
  assert.equal(manifest.scope, '/syrius/'); assert.equal(manifest.display, 'standalone');
  const worker = await fetch(`${origin}/syrius/sw.js`);
  assert.match(worker.headers.get('content-type'), /javascript/);
  const permissions = (await fetch(`${origin}/syrius/`)).headers.get('permissions-policy');
  assert.match(permissions, /microphone=\(self\)/);
  const catalog = await fetch(`${origin}/portail/administration/api/catalog`, { headers: { cookie } });
  assert.equal(catalog.status, 200);
  const catalogData = await catalog.json();
  assert.ok(catalogData.applications.some(app => app.id === 'syrius'));
  assert.equal(catalogData.apps.find(app => app.id === 'app-phenix').url, '/phenix/');
  // Le réglage reste exclusivement dans le centre d’administration existant.
  const adminSession = await (await fetch(`${origin}/portail/administration/api/session`, { headers: { cookie } })).json();
  const streamController = new AbortController();
  t.after(() => streamController.abort());
  const stream = await fetch(`${origin}/syrius/api/stream?clientId=integration-branding-radio`, { headers: { cookie }, signal: streamController.signal });
  const reader = stream.body.getReader();
  await reader.read(); // état initial
  const logoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  const changed = await fetch(`${origin}/portail/administration/api/appearance/syrius`, {
    method: 'PUT', headers: { cookie, 'content-type': 'application/json', 'x-admin-csrf': adminSession.csrfToken },
    body: JSON.stringify({ title: 'Radio de test', subtitle: 'Police de test', primaryColor: '#123456', accentColor: '#a32478', backgroundColor: '#eeeeee', logoData, faviconData: logoData, backgroundData: logoData })
  });
  assert.equal(changed.status, 200);
  const timer = setTimeout(() => streamController.abort(), 3000);
  let liveAppearance;
  try {
    const decoder = new TextDecoder(); let pending = '';
    while (!liveAppearance) {
      const { value, done } = await reader.read(); assert.equal(done, false); pending += decoder.decode(value, { stream: true });
      let index;
      while ((index = pending.indexOf('\n\n')) !== -1) {
        const frame = pending.slice(0, index); pending = pending.slice(index + 2);
        const raw = frame.match(/^data: (.+)$/m)?.[1];
        if (raw && frame.startsWith('event: state')) {
          const state = JSON.parse(raw);
          if (state.appearance.accentColor === '#a32478') liveAppearance = state.appearance;
        }
      }
    }
  } finally { clearTimeout(timer); streamController.abort(); }
  assert.equal(liveAppearance.title, 'Radio de test');
  assert.equal(liveAppearance.logoData, undefined, 'les images ne saturent pas le flux de parole');
  assert.match(liveAppearance.logoUrl, /^\/syrius\/branding\/logo\?v=/);
  const logo = await fetch(`${origin}${liveAppearance.logoUrl}`);
  assert.equal(logo.status, 200); assert.match(logo.headers.get('content-type'), /image\/png/);
  assert.equal(Buffer.from(await logo.arrayBuffer()).toString('base64'), logoData.split(',')[1]);
  const publicBranding = await (await fetch(`${origin}/syrius/branding`)).json();
  assert.equal(publicBranding.appearance.primaryColor, '#123456');
  const portalLogin = await fetch(`${origin}/portail/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'integration-admin', password: 'integration-test-only' }) });
  assert.equal(portalLogin.status, 200);
  const portal = await fetch(`${origin}/portail/api/portal`, { headers: { cookie: portalLogin.headers.get('set-cookie').split(';')[0] } });
  const portalData = await portal.json();
  assert.equal(portalData.apps.find(app => app.id === 'app-phenix').url, '/phenix/');
  assert.ok(portalData.apps.some(app => app.id === 'app-syrius' && app.url === '/syrius/'));
  const radioTile = portalData.apps.find(app => app.id === 'app-syrius');
  assert.equal(radioTile.name, 'Radio de test'); assert.equal(radioTile.logoData, logoData); assert.equal(radioTile.accentColor, '#a32478');
});

