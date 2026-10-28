'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phenix-syrius-test-'));
process.env.CENTRAL_ADMIN_DATA_FILE = path.join(directory, 'admin.json');
const { mountSyrius } = require('../syrius-router');
const { loadAdminConfig, saveAdminConfig, setUserPolicy } = require('../central-config');
const password = 'test-radio-only-2026';

test('SYRIUS : conférences, accès, persistance et signalisation entre deux postes', async t => {
  const users = [
    { id: 'admin', login: 'admin', displayName: 'Central test', role: 'admin' },
    { id: 'alpha', login: 'alpha', displayName: 'Équipage Alpha', role: 'operateur' },
    { id: 'bravo', login: 'bravo', displayName: 'Équipage Bravo', role: 'operateur' },
    { id: 'screen', login: 'screen', displayName: 'Écran', role: 'dashboard' }
  ].map(user => ({ ...user, passwordHash: bcrypt.hashSync(password, 4) }));
  const app = express(); app.use(express.json());
  app.use(session({ secret: 'isolated-syrius-tests-not-production', resave: false, saveUninitialized: false, name: 'phenix.sid' }));
  const filename = path.join(directory, 'syrius.json');
  const radio = mountSyrius(app, { dataFile: filename, loadPhenix: () => ({ users }), passwordExpired: user => Boolean(user.mustChangePassword) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const streams = [];
  const accounts = {};
  async function call(route, body, who = 'admin', method = 'POST', headers = {}) {
    const account = accounts[who] || {};
    const response = await fetch(`${origin}/syrius/api${route}`, {
      method: body === undefined ? 'GET' : method,
      headers: { cookie: account.cookie || '', 'x-csrf-token': account.csrfToken || '', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json(), response };
  }
  async function login(who) {
    const result = await call('/login', { login: who, password }, who);
    assert.equal(result.status, 200);
    accounts[who] = { cookie: result.response.headers.get('set-cookie').split(';')[0], csrfToken: result.data.csrfToken };
  }
  async function stream(who, clientId) {
    const controller = new AbortController();
    const response = await fetch(`${origin}/syrius/api/stream?clientId=${clientId}`, { headers: { cookie: accounts[who].cookie }, signal: controller.signal });
    assert.equal(response.status, 200);
    const events = [], waiters = [];
    const next = (type, predicate = () => true) => new Promise((resolve, reject) => {
      const index = events.findIndex(event => event.type === type && predicate(event.data));
      if (index !== -1) return resolve(events.splice(index, 1)[0].data);
      const entry = { type, predicate, resolve, reject };
      entry.timer = setTimeout(() => { const index = waiters.indexOf(entry); if (index !== -1) waiters.splice(index, 1); reject(new Error(`Événement ${type} non reçu`)); }, 2000);
      waiters.push(entry);
    });
    const reading = (async () => {
      const decoder = new TextDecoder(); let buffer = '';
      try {
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true }); let end;
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const type = block.match(/^event: (.+)$/m)?.[1], raw = block.match(/^data: (.+)$/m)?.[1];
            if (!type || !raw) continue;
            const event = { type, data: JSON.parse(raw) };
            const index = waiters.findIndex(waiter => waiter.type === type && waiter.predicate(event.data));
            if (index !== -1) { const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(event.data); }
            else events.push(event);
          }
        }
      } catch (error) { if (error.name !== 'AbortError') throw error; }
    })();
    const item = { next, events, close: () => controller.abort(), reading }; streams.push(item);
    await next('state'); return item;
  }
  const adminClient = 'test-admin-radio-poste', alphaClient = 'test-alpha-radio-poste';
  let adminStream, alphaStream, privateId, publicId, floorId;
  t.after(async () => {
    streams.forEach(item => item.close()); radio.close();
    await Promise.all(streams.map(item => item.reading));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await t.test('La route /syrius est servie et le bootstrap exige une session', async () => {
    const redirect = await fetch(`${origin}/syrius`, { redirect: 'manual' });
    assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), '/syrius/');
    const page = await fetch(`${origin}/syrius/`); assert.equal(page.status, 200);
    assert.match(await page.text(), /Administration des conférences/);
    assert.match(page.headers.get('content-security-policy'), /tile.openstreetmap.org/);
    assert.equal((await call('/bootstrap', undefined, 'nobody')).status, 401);
  });
  await t.test('Les comptes PHENIX se connectent et les comptes sans accès sont refusés', async () => {
    await login('admin'); await login('alpha'); await login('bravo');
    assert.equal((await call('/login', { login: 'admin', password: 'incorrect' }, 'nobody')).status, 401);
    assert.equal((await call('/login', { login: 'screen', password }, 'nobody')).status, 403);
    const result = await call('/bootstrap'); assert.equal(result.data.user.role, 'admin');
    assert.equal(result.data.channels.length, 3); assert.equal(result.data.users.length, 3);
  });
  await t.test('Seul un administrateur crée les conférences ; CSRF et origine sont contrôlés', async () => {
    assert.equal((await call('/channels', { name: 'Interdit' }, 'alpha')).status, 403);
    assert.equal((await call('/channels', { name: 'Sans jeton' }, 'admin', 'POST', { 'x-csrf-token': '' })).status, 403);
    assert.equal((await call('/channels', { name: 'Autre origine' }, 'admin', 'POST', { origin: 'https://autre.example' })).status, 403);
    const created = await call('/channels', { name: 'Événement centre-ville', description: 'Conférence de test', memberIds: [] });
    assert.equal(created.status, 201); publicId = created.data.channel.id;
    assert.equal((await call('/channels', { name: 'événement CENTRE-VILLE' })).status, 409);
    assert.equal((await call('/channels', { name: '', memberIds: [] })).status, 400);
    assert.equal((await call('/channels', { name: 'Invalide', memberIds: ['inexistant'] })).status, 400);
  });
  await t.test('Une conférence peut être renommée ; les messages restent associés au groupe', async () => {
    assert.equal((await call(`/channels/${publicId}`, { name: 'Dispositif marché' }, 'admin', 'PATCH')).status, 200);
    assert.equal((await call('/messages', { channelId: publicId, text: '<img src=x onerror=alert(1)>' }, 'alpha')).status, 201);
    const result = await call('/bootstrap', undefined, 'bravo');
    assert.equal(result.data.channels.find(channel => channel.id === publicId).name, 'Dispositif marché');
    assert.equal(result.data.messages.find(message => message.channelId === publicId).text, '<img src=x onerror=alert(1)>');
    assert.equal(result.data.users.length, 0);
  });
  await t.test('Les conférences restreintes et leurs messages sont invisibles aux autres membres', async () => {
    const created = await call('/channels', { name: 'Alpha privé', memberIds: ['alpha'] }); privateId = created.data.channel.id;
    assert.equal((await call('/messages', { channelId: privateId, text: 'Message privé' }, 'alpha')).status, 201);
    const bravo = await call('/bootstrap', undefined, 'bravo');
    assert.ok(!bravo.data.channels.some(channel => channel.id === privateId));
    assert.ok(!bravo.data.messages.some(message => message.channelId === privateId));
    assert.equal((await call('/messages', { channelId: privateId, text: 'Intrusion' }, 'bravo')).status, 404);
  });
  await t.test('Deux postes rejoignent le même groupe et voient les présences', async () => {
    adminStream = await stream('admin', adminClient); alphaStream = await stream('alpha', alphaClient);
    assert.equal((await call('/presence', { clientId: adminClient, channelId: publicId })).status, 200);
    assert.equal((await call('/presence', { clientId: alphaClient, channelId: publicId, callsign: 'ALPHA 01' }, 'alpha')).status, 200);
    const result = await adminStream.next('state', value => value.peers.length === 2);
    assert.ok(result.peers.some(peer => peer.name === 'ALPHA 01'));
    assert.equal((await call('/presence', { clientId: alphaClient, status: 'busy' }, 'bravo')).status, 409);
  });
  await t.test('La prise de parole est exclusive, renouvelable et distribuée aux auditeurs', async () => {
    const claimed = await call('/floor', { clientId: alphaClient, action: 'claim' }, 'alpha');
    assert.equal(claimed.status, 200); floorId = claimed.data.floor.id;
    assert.deepEqual(claimed.data.recipients, [adminClient]);
    assert.equal((await call('/floor', { clientId: adminClient, action: 'claim' })).status, 409);
    assert.equal((await call('/floor', { clientId: alphaClient, action: 'renew' }, 'alpha')).status, 200);
    const receiving = await adminStream.next('state', value => value.channels.find(channel => channel.id === publicId)?.floor?.id === floorId);
    assert.equal(receiving.channels.find(channel => channel.id === publicId).floor.name, 'ALPHA 01');
  });
  await t.test('La signalisation audio atteint uniquement un poste de la même conférence', async () => {
    const offer = { type: 'offer', sdp: 'v=0\r\ns=SYRIUS test\r\n' };
    assert.equal((await call('/signal', { clientId: alphaClient, to: adminClient, floorId, signal: offer }, 'alpha')).status, 200);
    const signal = await adminStream.next('signal'); assert.equal(signal.from, alphaClient); assert.equal(signal.signal.sdp, offer.sdp);
    assert.equal((await call('/signal', { clientId: alphaClient, to: 'inexistant', floorId, signal: offer }, 'alpha')).status, 409);
    assert.equal((await call('/signal', { clientId: alphaClient, to: adminClient, floorId: 'ancienne-liaison', signal: offer }, 'alpha')).status, 409);
  });
  await t.test('Le son HTTPS est relayé intact, sans écho ni fuite vers un autre groupe', async () => {
    const bravoClient = 'test-bravo-radio-poste', bravoStream = await stream('bravo', bravoClient);
    await call('/presence', { clientId: bravoClient, channelId: 'pm-general' }, 'bravo');
    const pcm = Buffer.from([0x00, 0x40, 0x00, 0xc0, 0xff, 0x7f, 0x00, 0x80]).toString('base64');
    const packet = { clientId: alphaClient, floorId, sequence: 0, sampleRate: 16000, pcm };
    const sent = await call('/audio', packet, 'alpha');
    assert.equal(sent.status, 200); assert.equal(sent.data.recipients, 1);
    const received = await adminStream.next('audio');
    assert.equal(received.pcm, pcm); assert.equal(received.floorId, floorId);
    assert.equal(received.channelId, publicId); assert.equal(received.sequence, 0);
    assert.equal((await call('/audio', packet, 'alpha')).status, 409, 'un paquet ne peut pas être rejoué');
    assert.equal((await call('/audio', { ...packet, sequence: 1 }, 'bravo')).status, 409, 'un autre compte ne peut pas usurper le poste');
    assert.equal((await call('/audio', { ...packet, clientId: adminClient, sequence: 1 })).status, 409, 'un auditeur ne peut pas émettre');
    assert.equal((await call('/audio', { ...packet, sequence: 1, pcm: '<invalid>' }, 'alpha')).status, 400);
    assert.equal((await call('/audio', { ...packet, sequence: 1, pcm: Buffer.alloc(6402).toString('base64') }, 'alpha')).status, 400);
    assert.equal((await call('/audio', { ...packet, sequence: 1, pcm: 'AA==' }, 'alpha')).status, 400, 'un échantillon PCM16 doit avoir deux octets');
    assert.equal((await call('/audio', { ...packet, sequence: 1, sampleRate: 48000 }, 'alpha')).status, 400);
    assert.equal((await call('/audio', { ...packet, sequence: 1 }, 'alpha', 'POST', { 'x-csrf-token': '' })).status, 403);
    await call('/presence', { clientId: bravoClient, status: 'away' }, 'bravo');
    await bravoStream.next('state', value => value.peers.some(peer => peer.status === 'away'));
    assert.ok(!bravoStream.events.some(event => event.type === 'audio'));
    assert.ok(!alphaStream.events.some(event => event.type === 'audio'));
    await call('/presence', { clientId: bravoClient, channelId: publicId }, 'bravo');
    assert.equal((await call('/audio', { ...packet, sequence: 1 }, 'alpha')).data.recipients, 2);
    assert.equal((await bravoStream.next('audio')).pcm, pcm, 'un poste rejoignant pendant une émission entend la suite');
    await call('/floor', { clientId: alphaClient, action: 'release' }, 'alpha');
    assert.equal((await call('/audio', { ...packet, sequence: 2 }, 'alpha')).status, 409, 'relâcher le PTT coupe la diffusion');
    floorId = (await call('/floor', { clientId: alphaClient, action: 'claim' }, 'alpha')).data.floor.id;
    assert.equal((await call('/audio', { ...packet, floorId, sequence: 0 }, 'alpha')).status, 200, 'l’émission suivante repart de zéro');
    const saved = fs.readFileSync(filename, 'utf8'); assert.ok(!saved.includes(pcm), 'aucun audio n’est enregistré');
    bravoStream.close();
  });
  await t.test('La position est partagée uniquement dans le groupe rejoint ; une alerte peut être acquittée', async () => {
    assert.equal((await call('/presence', { clientId: alphaClient, position: { lat: 46.781, lng: 4.854 } }, 'alpha')).status, 200);
    const result = await adminStream.next('state', value => value.peers.some(peer => peer.position));
    assert.equal(result.peers.find(peer => peer.userId === 'alpha').position.lat, 46.781);
    const bravo = await call('/bootstrap', undefined, 'bravo'); assert.deepEqual(bravo.data.peers, []);
    assert.equal((await call('/alerts', { clientId: alphaClient, text: 'Test assistance' }, 'alpha')).status, 201);
    const admin = await call('/bootstrap'); const alert = admin.data.alerts[0];
    assert.equal(alert.text, 'Test assistance');
    assert.equal((await call(`/alerts/${alert.id}/ack`, {}, 'alpha')).status, 403);
    assert.equal((await call(`/alerts/${alert.id}/ack`, {})).status, 200);
  });
  await t.test('L’archivage interrompt les liaisons et autorise une réouverture', async () => {
    assert.equal((await call(`/channels/${publicId}/archive`, { archived: true })).status, 200);
    const ended = await alphaStream.next('state', value => value.channelId === null && !value.channels.some(channel => channel.id === publicId));
    assert.ok(!ended.channels.some(channel => channel.id === publicId));
    assert.equal((await call('/floor', { clientId: alphaClient, action: 'claim' }, 'alpha')).status, 404);
    assert.equal((await call(`/channels/${publicId}/archive`, { archived: false })).status, 200);
    assert.ok((await call('/bootstrap', undefined, 'alpha')).data.channels.some(channel => channel.id === publicId));
  });
  await t.test('Un retrait de membre libère immédiatement sa prise de parole', async () => {
    await call('/presence', { clientId: alphaClient, channelId: privateId }, 'alpha');
    const claim = await call('/floor', { clientId: alphaClient, action: 'claim' }, 'alpha');
    assert.equal((await call(`/channels/${privateId}`, { memberIds: ['bravo'] }, 'admin', 'PATCH')).status, 200);
    const revoked = await alphaStream.next('state', value => value.channelId === null && !value.channels.some(channel => channel.id === privateId));
    assert.equal(revoked.peers.length, 0);
    const admin = await call('/bootstrap'); assert.equal(admin.data.channels.find(channel => channel.id === privateId).floor, null);
    assert.equal((await call('/audio', { clientId: alphaClient, floorId: claim.data.floor.id, sequence: 0, sampleRate: 16000, pcm: 'AAAAAA==' }, 'alpha')).status, 404);
  });
  await t.test('La désactivation centrale coupe un poste déjà connecté', async () => {
    const config = loadAdminConfig(true), user = users.find(user => user.id === 'alpha');
    const policy = { syrius: { enabled: false, role: 'user' } }; setUserPolicy(config, user, policy); saveAdminConfig(config);
    await call('/messages', { channelId: publicId, text: 'Contrôle de désactivation' });
    await alphaStream.next('expired');
    assert.equal((await call('/bootstrap', undefined, 'alpha')).status, 403);
  });
  await t.test('La persistance contient les conférences renommées, les messages et les acquittements', async () => {
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(saved.channels.find(channel => channel.id === publicId).name, 'Dispositif marché');
    assert.ok(saved.messages.some(message => message.text === 'Message privé'));
    assert.ok(saved.alerts[0].acknowledgedBy);
    assert.equal(saved.floors, undefined); assert.equal(saved.peers, undefined); assert.equal(saved.signals, undefined);
  });
  await t.test('La déconnexion ferme immédiatement le flux du compte', async () => {
    assert.equal((await call('/logout', {})).status, 200); await adminStream.next('expired');
    assert.equal((await call('/bootstrap')).status, 401);
  });
});
