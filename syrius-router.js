'use strict';

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const voiceCodec = require('./syrius/audio-codec');
const { appAccess, appearanceFor } = require('./central-config');

const COLORS = ['#4264d7', '#7653b3', '#198b78', '#bd7c2e', '#bd4d68'];
const LEASE_MS = 25000;
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const equal = (a, b) => {
  const aa = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};

function initialData() {
  return {
    schemaVersion: 1,
    channels: [
      { id: 'pm-general', name: 'PM · Général', description: 'Liaison générale de la police municipale', color: COLORS[0], memberIds: [], archived: false },
      { id: 'pm-operations', name: 'PM · Opérations', description: 'Coordination des équipages sur le terrain', color: COLORS[1], memberIds: [], archived: false },
      { id: 'interservices', name: 'Interservices', description: 'Conférence de coordination entre services', color: COLORS[2], memberIds: [], archived: false }
    ],
    messages: [], events: [], alerts: []
  };
}

function mountSyrius(app, options) {
  const filename = options.dataFile || process.env.SYRIUS_DATA_FILE || path.join(path.dirname(process.env.PHENIX_DATA_FILE || '/var/data/data.json'), 'syrius.json');
  let data = initialData();
  if (fs.existsSync(filename)) {
    // Ne jamais écraser silencieusement une base existante illisible.
    data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (!['channels', 'messages', 'events', 'alerts'].every(key => Array.isArray(data[key]))) throw new Error('Base SYRIUS invalide.');
  }
  const clients = new Map();
  const floors = new Map();
  const audioTickets = new Map();
  let socketServer = null, httpServer = null, socketHeartbeat = null;
  const brandAssets = new Map();
  let revision = 0;
  const api = express.Router();
  const users = () => options.loadPhenix().users || [];
  const access = user => appAccess(user, 'syrius');
  const isAdmin = user => access(user).role === 'admin';
  const allowed = (user, channel) => Boolean(channel && (isAdmin(user) || !channel.memberIds.length || channel.memberIds.includes(user.id)));
  const nameOf = user => String(user.displayName || user.login || 'Utilisateur').slice(0, 80);
  const channelFor = id => data.channels.find(channel => channel.id === id);
  const usable = (user, channel) => access(user).enabled && allowed(user, channel) && !channel.archived;
  const userFor = id => users().find(user => user.id === id);
  const identity = user => ({ id: user.id, name: nameOf(user), role: access(user).role });

  function persist(next) {
    const tmp = `${filename}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, filename);
      data = next;
    } catch (error) {
      console.error('[SYRIUS] Sauvegarde impossible:', error.message);
      fail(503, 'La sauvegarde est indisponible. Votre modification n’a pas été enregistrée.');
    }
  }

  function event(next, user, channelId, kind, detail) {
    next.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), userId: user.id, name: nameOf(user), channelId, kind, detail });
    next.events = next.events.slice(0, 1000);
  }

  function release(clientId) {
    for (const [channelId, floor] of floors) if (floor.clientId === clientId) floors.delete(channelId);
  }

  function send(client, type, body) {
    if (!client.res.destroyed && !client.res.writableEnded) client.res.write(`event: ${type}\ndata: ${JSON.stringify(body)}\n\n`);
  }

  function peersFor(user, client) {
    return [...clients.values()].filter(peer => {
      const channel = channelFor(peer.channelId);
      return channel && usable(user, channel) && usable(peer.user, channel) && peer.channelId === client?.channelId;
    }).map(peer => ({ clientId: peer.id, userId: peer.user.id, name: peer.callsign, status: peer.status, channelId: peer.channelId, position: peer.position }));
  }

  function snapshot(user, client) {
    const visible = data.channels.filter(channel => allowed(user, channel) && (isAdmin(user) || !channel.archived));
    const ids = new Set(visible.map(channel => channel.id));
    return {
      revision, user: identity(user), clientId: client?.id || null, channelId: client?.channelId || null,
      channels: visible.map(channel => ({ ...channel,
        participantCount: [...clients.values()].filter(peer => peer.channelId === channel.id && usable(peer.user, channel)).length,
        floor: floors.get(channel.id) || null
      })),
      peers: peersFor(user, client),
      messages: data.messages.filter(message => ids.has(message.channelId)).slice(-400),
      events: data.events.filter(item => ids.has(item.channelId)).slice(0, 150),
      alerts: data.alerts.filter(item => ids.has(item.channelId)).slice(0, 100),
      users: isAdmin(user) ? users().filter(item => access(item).enabled).map(identity) : [],
      audioTransport: socketServer ? 'wss-voice' : 'https-voice', audioSampleRate: 8000, audioCodecs: ['mulaw8', 'pcm16'], appearance: branding()
    };
  }

  function branding() {
    const { logoData, faviconData, backgroundData, ...settings } = appearanceFor('syrius');
    // Les images se chargent séparément et restent hors du flux temps réel :
    // une photo de fond ne doit pas retarder les paquets de parole.
    for (const [kind, value] of [['logo', logoData], ['favicon', faviconData], ['background', backgroundData]]) {
      let asset = brandAssets.get(kind);
      if (!asset || asset.data !== value) {
        asset = { data: value, url: value ? `/syrius/branding/${kind}?v=${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}` : '' };
        brandAssets.set(kind, asset);
      }
      settings[`${kind}Url`] = asset.url;
    }
    return settings;
  }

  function reconcile() {
    const currentUsers = users();
    for (const client of clients.values()) {
      const current = currentUsers.find(user => user.id === client.user.id);
      if (!current || !access(current).enabled || options.passwordExpired?.(current)) {
        send(client, 'expired', {}); client.res.end(); release(client.id); continue;
      }
      client.user = current;
      if (client.channelId && !usable(current, channelFor(client.channelId))) {
        release(client.id); client.channelId = null; client.position = null;
      }
    }
  }

  function broadcast() {
    revision++;
    reconcile();
    for (const client of clients.values()) send(client, 'state', snapshot(client.user, client));
  }

  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origine refusée.' }); }
        catch { return res.status(403).json({ error: 'Origine refusée.' }); }
      }
    }
    next();
  });
  api.post('/login', rateLimit({
    windowMs: 15 * 60000, limit: 8, skipSuccessfulRequests: true,
    standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => `${ipKeyGenerator(req.ip)}:${text(req.body?.login, 80).toLowerCase()}`,
    message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
  }), (req, res, next) => {
    try {
      const login = text(req.body?.login, 80), password = req.body?.password;
      const user = users().find(item => item.login === login);
      if (!user || typeof password !== 'string' || password.length > 100 || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
      if (!access(user).enabled) return res.status(403).json({ error: 'Votre accès à SYRIUS est désactivé.' });
      if (options.passwordExpired?.(user)) return res.status(428).json({ error: 'Changez d’abord votre mot de passe depuis PHENIX.' });
      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.userId = user.id;
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        req.session.save(error => error ? next(error) : res.json({ user: identity(user), csrfToken: req.session.csrfToken }));
      });
    } catch (error) { next(error); }
  });
  api.use((req, res, next) => {
    const user = req.session?.userId && userFor(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Connectez-vous avec votre compte PHENIX.' });
    if (!access(user).enabled) return res.status(403).json({ error: 'Votre accès à SYRIUS est désactivé. Contactez votre administrateur.' });
    if (options.passwordExpired?.(user)) return res.status(428).json({ error: 'Changez d’abord votre mot de passe depuis PHENIX.' });
    req.syriusUser = user;
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!equal(req.get('x-csrf-token'), req.session.csrfToken)) return res.status(403).json({ error: 'Jeton de sécurité invalide. Rechargez la page.' });
    }
    next();
  });
  api.use(rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => `${req.syriusUser.id}:${req.sessionID}`,
    skip: req => req.path === '/audio',
    message: { error: 'Trop de requêtes. Réessayez dans une minute.' } }));
  const admin = (req, res, next) => isAdmin(req.syriusUser) ? next() : res.status(403).json({ error: 'Cette action est réservée aux administrateurs SYRIUS.' });
  function requireChannel(req, id, active = true) {
    const channel = channelFor(id);
    if (!channel || !allowed(req.syriusUser, channel)) fail(404, 'Conférence introuvable.');
    if (active && channel.archived) fail(409, 'Cette conférence est archivée.');
    return channel;
  }
  function requireClient(req) {
    const client = clients.get(req.body?.clientId);
    if (!client || client.user.id !== req.syriusUser.id || client.sessionId !== req.sessionID) fail(409, 'La liaison radio est interrompue. Reconnectez-vous.');
    return client;
  }

  api.post('/audio-link', (req, res) => {
    const client = requireClient(req);
    if (!socketServer) fail(503, 'La connexion audio continue est indisponible.');
    for (const [key, ticket] of audioTickets) if (ticket.clientId === client.id || ticket.expiresAt < Date.now()) audioTickets.delete(key);
    const ticket = crypto.randomBytes(32).toString('hex');
    audioTickets.set(ticket, { clientId: client.id, sessionId: req.sessionID, expiresAt: Date.now() + 30000 });
    res.json({ path: '/syrius/audio', ticket });
  });

  api.get('/bootstrap', (req, res) => res.json({ ...snapshot(req.syriusUser), csrfToken: req.session.csrfToken }));
  api.post('/logout', (req, res, next) => {
    const sessionId = req.sessionID;
    req.session.destroy(error => {
      if (error) return next(error);
      for (const client of clients.values()) if (client.sessionId === sessionId) { send(client, 'expired', {}); release(client.id); client.res.end(); }
      res.clearCookie('phenix.sid', { path: '/' }); res.json({ ok: true });
    });
  });
  api.get('/stream', (req, res) => {
    const id = text(req.query.clientId, 80);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return res.status(400).json({ error: 'Identifiant de poste invalide.' });
    const previous = clients.get(id);
    if (previous && (previous.user.id !== req.syriusUser.id || previous.sessionId !== req.sessionID)) return res.status(409).json({ error: 'Identifiant déjà utilisé.' });
    if (!previous && ([...clients.values()].filter(client => client.user.id === req.syriusUser.id).length >= 4 || clients.size >= 64)) return res.status(429).json({ error: 'Trop de postes connectés.' });
    if (previous) { clients.delete(id); release(id); previous.audioSocket?.close(1008, 'Session remplacée'); previous.res.end(); }
    res.set({ 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const client = { id, res, sessionId: req.sessionID, user: req.syriusUser, callsign: nameOf(req.syriusUser), channelId: null, status: 'available', position: null };
    clients.set(id, client);
    let checkingSession = false;
    const heartbeat = setInterval(() => {
      if (!req.sessionStore || checkingSession) return;
      checkingSession = true;
      req.sessionStore.get(req.sessionID, (error, session) => {
        checkingSession = false;
        if (error || session?.userId !== client.user.id) { send(client, 'expired', {}); res.end(); return; }
        reconcile();
        if (!res.writableEnded) res.write(': heartbeat\n\n');
      });
    }, 15000);
    heartbeat.unref();
    res.once('close', () => {
      clearInterval(heartbeat);
      if (clients.get(id) === client) {
        clients.delete(id); release(id); client.audioSocket?.close(1008, 'Session terminée');
        for (const [key, ticket] of audioTickets) if (ticket.clientId === id) audioTickets.delete(key);
        broadcast();
      }
    });
    broadcast();
  });

  api.post('/presence', (req, res) => {
    const client = requireClient(req);
    if (Object.hasOwn(req.body, 'channelId')) {
      if (req.body.channelId !== null) requireChannel(req, req.body.channelId);
      release(client.id); client.channelId = req.body.channelId; client.position = null;
    }
    if (req.body.callsign !== undefined) client.callsign = text(req.body.callsign, 40) || nameOf(client.user);
    if (['available', 'busy', 'away'].includes(req.body.status)) client.status = req.body.status;
    if (Array.isArray(req.body.audioCodecs)) client.audioCodecs = req.body.audioCodecs.includes('mulaw8') ? ['mulaw8'] : [];
    if (Object.hasOwn(req.body, 'position')) {
      const position = req.body.position;
      if (position === null) client.position = null;
      else if (client.channelId && Number.isFinite(position?.lat) && Number.isFinite(position?.lng) && Math.abs(position.lat) <= 85 && Math.abs(position.lng) <= 180) {
        client.position = { lat: position.lat, lng: position.lng, at: new Date().toISOString() };
      } else fail(400, 'Position invalide ou conférence non rejointe.');
    }
    broadcast(); res.json({ ok: true });
  });

  function channelInput(req, existing) {
    const body = req.body || {};
    const name = text(body.name ?? existing?.name, 60);
    if (!name) fail(400, 'Donnez un nom à la conférence.');
    if (data.channels.some(channel => channel.id !== existing?.id && channel.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) fail(409, 'Ce nom de conférence est déjà utilisé.');
    const memberIds = body.memberIds ?? existing?.memberIds ?? [];
    if (!Array.isArray(memberIds) || memberIds.length > 500 || memberIds.some(id => typeof id !== 'string' || !users().some(user => user.id === id && access(user).enabled))) fail(400, 'La liste des membres contient un compte non autorisé.');
    return { name, description: text(body.description ?? existing?.description, 160),
      color: COLORS.includes(body.color) ? body.color : existing?.color || COLORS[0], memberIds: [...new Set(memberIds)] };
  }
  api.post('/channels', admin, (req, res) => {
    if (data.channels.length >= 100) fail(409, 'La limite de 100 conférences est atteinte.');
    const channel = { id: crypto.randomUUID(), ...channelInput(req), archived: false, createdAt: new Date().toISOString() };
    const next = structuredClone(data); next.channels.push(channel);
    event(next, req.syriusUser, channel.id, 'admin', `Création de la conférence ${channel.name}`);
    persist(next); broadcast(); res.status(201).json({ channel });
  });
  api.patch('/channels/:id', admin, (req, res) => {
    const current = requireChannel(req, req.params.id, false);
    const patch = channelInput(req, current);
    const next = structuredClone(data); Object.assign(next.channels.find(channel => channel.id === current.id), patch);
    event(next, req.syriusUser, current.id, 'admin', `Modification de la conférence ${patch.name}`);
    persist(next); broadcast(); res.json({ ok: true });
  });
  api.post('/channels/:id/archive', admin, (req, res) => {
    const channel = requireChannel(req, req.params.id, false);
    if (typeof req.body.archived !== 'boolean') fail(400, 'État d’archivage invalide.');
    const next = structuredClone(data); next.channels.find(item => item.id === channel.id).archived = req.body.archived;
    event(next, req.syriusUser, channel.id, 'admin', req.body.archived ? 'Conférence archivée' : 'Conférence réouverte');
    persist(next); broadcast(); res.json({ ok: true });
  });

  api.post('/messages', (req, res) => {
    const channel = requireChannel(req, req.body.channelId);
    const message = text(req.body.text, 2000);
    if (!message) fail(400, 'Écrivez un message.');
    const next = structuredClone(data);
    next.messages.push({ id: crypto.randomUUID(), channelId: channel.id, userId: req.syriusUser.id, name: nameOf(req.syriusUser), text: message, at: new Date().toISOString() });
    next.messages = next.messages.slice(-2000);
    persist(next); broadcast(); res.status(201).json({ ok: true });
  });
  api.post('/alerts', (req, res) => {
    const client = requireClient(req), channel = requireChannel(req, client.channelId);
    const next = structuredClone(data);
    next.alerts.unshift({ id: crypto.randomUUID(), channelId: channel.id, userId: client.user.id, name: client.callsign,
      at: new Date().toISOString(), text: text(req.body.text, 300) || 'Demande d’assistance', position: client.position, acknowledgedBy: null });
    next.alerts = next.alerts.slice(0, 200);
    event(next, client.user, channel.id, 'alert', 'Alerte de conférence : demande d’assistance');
    persist(next); broadcast(); res.status(201).json({ ok: true });
  });
  api.post('/alerts/:id/ack', admin, (req, res) => {
    const alert = data.alerts.find(item => item.id === req.params.id);
    if (!alert) fail(404, 'Alerte introuvable.');
    const next = structuredClone(data);
    Object.assign(next.alerts.find(item => item.id === alert.id), { acknowledgedBy: nameOf(req.syriusUser), acknowledgedAt: new Date().toISOString() });
    event(next, req.syriusUser, alert.channelId, 'alert', 'Alerte prise en compte');
    persist(next); broadcast(); res.json({ ok: true });
  });

  api.post('/floor', (req, res) => {
    const client = requireClient(req), channel = requireChannel(req, client.channelId);
    const current = floors.get(channel.id);
    if (current && current.expiresAt <= Date.now()) floors.delete(channel.id);
    const floor = floors.get(channel.id);
    const action = req.body.action;
    if (!['claim', 'renew', 'release'].includes(action)) fail(400, 'Action radio invalide.');
    if (action === 'release') { release(client.id); broadcast(); return res.json({ ok: true }); }
    if (floor && floor.clientId !== client.id) fail(409, `${floor.name} a déjà la parole.`);
    if (action === 'renew' && !floor) fail(409, 'La prise de parole a expiré.');
    if (!floor) {
      const next = structuredClone(data);
      event(next, client.user, channel.id, 'radio', `Prise de parole · ${client.callsign}`);
      persist(next);
    }
    const grant = floor || { clientId: client.id, userId: client.user.id, name: client.callsign, startedAt: Date.now(), id: crypto.randomUUID() };
    grant.expiresAt = Date.now() + LEASE_MS;
    floors.set(channel.id, grant);
    broadcast(); res.json({ ok: true, revision, floor: grant, recipients: peersFor(client.user, client).filter(peer => peer.clientId !== client.id).map(peer => peer.clientId) });
  });

  api.post('/signal', (req, res) => {
    const client = requireClient(req), target = clients.get(req.body.to), signal = req.body.signal;
    requireChannel(req, client.channelId);
    const floor = floors.get(client.channelId);
    if (!target || target.channelId !== client.channelId || !usable(target.user, channelFor(client.channelId)) || !floor || floor.id !== req.body.floorId || floor.expiresAt <= Date.now()) fail(409, 'Communication terminée ou destinataire indisponible.');
    if (![client.id, target.id].includes(floor.clientId)) fail(403, 'La parole n’est pas attribuée à cette liaison.');
    if (!signal || !['offer', 'answer', 'ice'].includes(signal.type) || JSON.stringify(signal).length > 24000) fail(400, 'Signal radio invalide.');
    if (signal.type === 'offer' && floor.clientId !== client.id) fail(403, 'Prise de parole requise.');
    if (['offer', 'answer'].includes(signal.type) && (typeof signal.sdp !== 'string' || signal.sdp.length > 20000)) fail(400, 'Description audio invalide.');
    if (signal.type === 'ice' && (typeof signal.candidate !== 'object' || signal.candidate === null || typeof signal.candidate.candidate !== 'string' || signal.candidate.candidate.length > 2000)) fail(400, 'Candidat réseau invalide.');
    send(target, 'signal', { from: client.id, floorId: floor.id, signal }); res.json({ ok: true });
  });

  // Transport commun au flux continu WSS et au secours HTTPS par lots.
  // Seul le titulaire de l’alternat peut envoyer vers les membres de son groupe.
  function relayAudio(client, user, body) {
    const channel = channelFor(client.channelId);
    if (!channel || !usable(user, channel)) fail(404, 'Conférence introuvable.');
    const floor = floors.get(channel.id);
    if (!floor || floor.clientId !== client.id || floor.id !== body.floorId || floor.expiresAt <= Date.now()) fail(409, 'La prise de parole audio est terminée.');
    const packets = body.packets === undefined ? [body] : body.packets;
    if (!Array.isArray(packets) || !packets.length || packets.length > 4) fail(400, 'Lot audio invalide.');
    let lastSequence = client.audioFloorId === floor.id ? client.audioSequence : -1;
    let totalSamples = client.audioFloorId === floor.id ? client.audioSamples : 0;
    const validated = packets.map(packet => {
      const { pcm, sequence, sampleRate, codec } = packet || {};
      const compressed = codec === 'mulaw8';
      if ((codec && !['mulaw8', 'pcm16'].includes(codec)) || sampleRate !== (compressed ? 8000 : 16000) || !Number.isInteger(sequence) || sequence < 0 || sequence > 5000 ||
          (packet.floorId !== undefined && packet.floorId !== floor.id) ||
          typeof pcm !== 'string' || pcm.length < 4 || pcm.length > 8536 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(pcm)) fail(400, 'Paquet audio invalide.');
      const bytes = Buffer.from(pcm, 'base64');
      if (!bytes.length || bytes.length > (compressed ? 1600 : 6400) || (!compressed && bytes.length % 2) || bytes.toString('base64') !== pcm) fail(400, 'Données audio invalides.');
      if (sequence <= lastSequence) fail(409, 'Ce paquet audio a déjà été traité.');
      lastSequence = sequence; totalSamples += compressed ? bytes.length * 2 : bytes.length / 2;
      return { from: client.id, channelId: channel.id, floorId: floor.id, sequence, sampleRate, pcm, ...(codec ? { codec } : {}) };
    });
    if (totalSamples > ((Date.now() - floor.startedAt + 1500) / 1000) * 16000) fail(429, 'Le flux audio dépasse la cadence autorisée.');
    client.audioFloorId = floor.id; client.audioSequence = lastSequence; client.audioSamples = totalSamples;
    let recipients = 0, legacyPackets;
    for (const target of clients.values()) {
      const currentUser = userFor(target.user.id);
      if (target.id === client.id || target.channelId !== channel.id || !currentUser || !usable(currentUser, channel) || options.passwordExpired?.(currentUser)) continue;
      const useSocket = target.receiveAudio && target.audioSocket?.readyState === WebSocket.OPEN;
      const pendingLimit = target.audioCodecs?.includes('mulaw8') ? 16000 : 64000;
      if ((useSocket ? target.audioSocket.bufferedAmount : target.res.writableLength) > pendingLimit) continue;
      const packets = target.audioCodecs?.includes('mulaw8') ? validated : (legacyPackets ||= validated.map(voiceCodec.legacy));
      for (const packet of packets) {
        const outgoing = { ...packet, serial: target.audioSerial = (target.audioSerial || 0) + 1 };
        if (useSocket) target.audioSocket.send(JSON.stringify({ type: 'audio', ...outgoing }));
        else send(target, 'audio', outgoing);
      }
      recipients++;
    }
    return { ok: true, recipients };
  }

  api.post('/audio', rateLimit({ windowMs: 1000, limit: 40,
    keyGenerator: req => `${req.syriusUser.id}:${req.sessionID}`,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Le flux audio est trop rapide. Relâchez le PTT puis réessayez.' }
  }), (req, res) => res.json(relayAudio(requireClient(req), req.syriusUser, req.body)));

  function upgradeAudio(req, socket, head) {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return socket.destroy(); }
    if (pathname !== '/syrius/audio') return;
    let origin;
    try { origin = new URL(req.headers.origin); } catch { /* origine obligatoire */ }
    if (!origin || origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol) || socketServer.clients.size >= 128) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    socketServer.handleUpgrade(req, socket, head, ws => socketServer.emit('connection', ws));
  }
  function attachServer(server) {
    if (httpServer) { if (httpServer !== server) throw new Error('Serveur audio déjà attaché.'); return; }
    httpServer = server;
    socketServer = new WebSocketServer({ noServer: true, maxPayload: 40000, perMessageDeflate: false });
    server.on('upgrade', upgradeAudio);
    socketServer.on('connection', ws => {
      let client = null, windowStart = Date.now(), messageCount = 0;
      ws.isAlive = true;
      const authTimeout = setTimeout(() => ws.close(1008, 'Authentification requise'), 5000);
      authTimeout.unref();
      ws.on('error', () => {});
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('close', () => {
        clearTimeout(authTimeout);
        if (client?.audioSocket === ws) {
          client.audioSocket = null; client.receiveAudio = false;
          if (clients.get(client.id) === client) { release(client.id); broadcast(); }
        }
      });
      ws.on('message', (raw, binary) => {
        try {
          if (binary) fail(400, 'Format audio invalide.');
          const body = JSON.parse(raw.toString());
          if (!body || typeof body !== 'object') fail(400, 'Message audio invalide.');
          if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messageCount = 0; }
          if (++messageCount > 40) fail(429, 'Le flux audio est trop rapide.');
          if (!client) {
            const ticket = typeof body.ticket === 'string' && audioTickets.get(body.ticket);
            if (body.type !== 'auth' || !ticket || ticket.expiresAt < Date.now() || ticket.clientId !== body.clientId) fail(401, 'Connexion audio non autorisée.');
            audioTickets.delete(body.ticket);
            const candidate = clients.get(ticket.clientId), user = candidate && userFor(candidate.user.id);
            if (!candidate || candidate.sessionId !== ticket.sessionId || !user || !access(user).enabled || options.passwordExpired?.(user)) fail(401, 'Session audio terminée.');
            client = candidate; clearTimeout(authTimeout);
            const previous = client.audioSocket; client.audioSocket = ws; previous?.close(1000, 'Liaison remplacée');
            client.receiveAudio = body.receiveAudio === true;
            if (Array.isArray(body.audioCodecs)) client.audioCodecs = body.audioCodecs.includes('mulaw8') ? ['mulaw8'] : [];
            ws.send(JSON.stringify({ type: 'ready' })); return;
          }
          const user = userFor(client.user.id);
          if (clients.get(client.id) !== client || client.audioSocket !== ws || !user || !access(user).enabled || options.passwordExpired?.(user)) fail(401, 'Session audio terminée.');
          if (body.type === 'audio') relayAudio(client, user, body);
          else if (body.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
          else if (body.type === 'flush') {
            const floor = floors.get(client.channelId);
            const sequence = client.audioFloorId === body.floorId ? client.audioSequence : -1;
            if (!floor || floor.clientId !== client.id || floor.id !== body.floorId || floor.expiresAt <= Date.now() || !Number.isInteger(body.sequence) || body.sequence !== sequence) fail(409, 'La transmission audio est terminée.');
            // Accusé uniquement en fin de phrase, jamais entre les fragments.
            ws.send(JSON.stringify({ type: 'flushed', floorId: body.floorId, sequence }));
          } else fail(400, 'Commande audio invalide.');
        } catch (error) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', status: error.status || 400, error: error.status ? error.message : 'Message audio invalide.' }));
          if (!client || error.status === 401 || error.status === 429 || !error.status) ws.close(1008, 'Liaison refusée');
        }
      });
    });
    socketHeartbeat = setInterval(() => {
      for (const ws of socketServer.clients) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        ws.isAlive = false; ws.ping();
      }
      for (const [key, ticket] of audioTickets) if (ticket.expiresAt < Date.now()) audioTickets.delete(key);
    }, 15000);
    socketHeartbeat.unref();
  }

  const watchdog = setInterval(() => {
    let changed = false;
    for (const [id, floor] of floors) if (floor.expiresAt <= Date.now()) { floors.delete(id); changed = true; }
    if (changed) broadcast();
  }, 5000);
  watchdog.unref();
  api.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (!error.status) console.error('[SYRIUS]', error.stack);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Erreur interne du service radio.' });
  });

  app.use('/syrius', (req, res, next) => {
    const socketOrigin = `wss://${req.get('host')}`;
    res.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; media-src 'self' blob:; connect-src 'self' ${socketOrigin}; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Permissions-Policy', 'microphone=(self), geolocation=(self)');
    next();
  });
  app.get(/^\/syrius$/, (req, res) => res.redirect(302, '/syrius/'));
  app.get('/syrius/branding', (req, res) => res.set('Cache-Control', 'no-store').json({ appearance: branding() }));
  app.get('/syrius/branding/:kind', (req, res) => {
    branding();
    const asset = brandAssets.get(req.params.kind);
    const match = asset?.data?.match(/^data:(image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(404).end();
    res.set({ 'Content-Type': match[1], 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(Buffer.from(match[2], 'base64'));
  });
  app.use('/syrius/api', api);
  app.use('/syrius', express.static(path.join(__dirname, 'syrius'), {
    etag: true, maxAge: 0,
    setHeaders: res => res.set('Cache-Control', 'no-cache')
  }));
  return { attachServer, snapshot, refreshAppearance: broadcast, close() {
    clearInterval(watchdog); clearInterval(socketHeartbeat); audioTickets.clear();
    httpServer?.removeListener('upgrade', upgradeAudio);
    if (socketServer) { for (const ws of socketServer.clients) ws.terminate(); socketServer.close(); }
    for (const client of clients.values()) client.res.end();
  } };
}

module.exports = { mountSyrius };
