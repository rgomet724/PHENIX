'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

function tokenFromRequest(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie).pm_portal_auth || '';
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function argosRoleFromPhenix(role) {
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'administrateur') return 'admin';
  if (r === 'superviseur') return 'superviseur';
  if (r === 'operateur') return 'operateur';
  return null;
}

function verifyArgosToken(token, secret) {
  try {
    const [version, payload, sig] = String(token || '').split('.');
    if (version !== 'v1' || !payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (!safeEqual(expected, sig)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now() || !parsed.sub || !parsed.login) return null;
    return {
      id: parsed.sub,
      login: parsed.login,
      name: parsed.name || parsed.login,
      role: parsed.role || 'user',
      source: parsed.source || '',
      phenixRole: parsed.phenixRole || ''
    };
  } catch {
    return null;
  }
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function priorityWeight(p) {
  return String(p).toUpperCase() === 'URGENT' ? 0 : 1;
}

function missionSort(a, b) {
  const pa = priorityWeight(a.priority), pb = priorityWeight(b.priority);
  if (pa !== pb) return pa - pb;
  return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
}

function interventionParts(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([^|]+)\|\s*(.+)$/);
  return m ? { code: m[1].trim(), label: m[2].trim() } : { code: '', label: s };
}

function normalizeInterventions(list) {
  const labels = [...new Set((Array.isArray(list) ? list : []).map(interventionParts).map(x => x.label).map(x => String(x || '').trim()).filter(Boolean))];
  labels.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }));
  return labels.slice(0, 500).map((label, i) => `${String(20 + i).padStart(3, '0')} | ${label}`);
}

function buildAddress(m) {
  return [String(m.number || '').trim(), String(m.street || '').trim(), String(m.complement || '').trim()].filter(Boolean).join(' ');
}

function buildPhenixIntervention(m) {
  const addr = buildAddress(m);
  return `${m.natureLabel || 'Intervention'}${addr ? ` — ${addr}` : ''}`;
}

function ensurePortalTile(portalFile) {
  try {
    let data = null;
    if (fs.existsSync(portalFile)) {
      const raw = fs.readFileSync(portalFile, 'utf8');
      if (raw.trim()) data = JSON.parse(raw);
    }
    if (!data || typeof data !== 'object') data = { schemaVersion: 2, categories: [], apps: [] };
    if (!Array.isArray(data.categories)) data.categories = [];
    if (!Array.isArray(data.apps)) data.apps = [];

    let category = data.categories.find(c => String(c.name || '').toLocaleLowerCase('fr-FR') === 'opérationnel')
      || data.categories.find(c => String(c.id || '') === 'cat-operationnel');
    if (!category) {
      category = { id: 'cat-operationnel', name: 'Opérationnel', order: 10 };
      data.categories.unshift(category);
    }

    const existing = data.apps.find(a => a.id === 'app-atlas' || a.url === '/portail/atlas/');
    if (existing) {
      existing.categoryId = category.id;
      existing.name = existing.name || 'ATLAS';
      existing.description = existing.description || 'Gestion de l’attente des interventions';
      existing.url = '/portail/atlas/';
      if (!Number.isFinite(Number(existing.order))) existing.order = 15;
    } else {
      data.apps.push({
        id: 'app-atlas',
        categoryId: category.id,
        name: 'ATLAS',
        description: 'Gestion de l’attente des interventions',
        url: '/portail/atlas/',
        logoData: '',
        order: 15
      });
    }
    atomicWriteJson(portalFile, data);
    console.log('[ATLAS] Tuile ARGOS enregistrée.');
  } catch (err) {
    console.warn('[ATLAS] Impossible d’enregistrer automatiquement la tuile ARGOS:', err.message);
  }
}

function mountInterventions(app, deps = {}) {
  const loadPhenix = deps.loadPhenix;
  const savePhenix = deps.savePhenix;
  const secret = String(deps.sessionSecret || process.env.SESSION_SECRET || '');
  if (typeof loadPhenix !== 'function' || typeof savePhenix !== 'function') throw new Error('ATLAS: loadPhenix/savePhenix requis.');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('ATLAS: SESSION_SECRET doit faire au moins 32 octets.');

  const DATA_DIR = String(process.env.ATLAS_DATA_DIR || process.env.PORTAL_DATA_DIR || '/var/data');
  const DB_FILE = path.join(DATA_DIR, 'atlas.json');
  const PORTAL_FILE = path.join(String(process.env.PORTAL_DATA_DIR || '/var/data'), 'portal.json');
  const PUBLIC_DIR = path.join(__dirname, 'atlas');

  function defaultData() {
    return {
      schemaVersion: 1,
      missions: [],
      history: [],
      streets: []
    };
  }

  function loadDispatch() {
    try {
      if (!fs.existsSync(DB_FILE)) return defaultData();
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return {
        schemaVersion: 1,
        missions: Array.isArray(parsed.missions) ? parsed.missions : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        streets: Array.isArray(parsed.streets) ? parsed.streets : []
      };
    } catch (err) {
      console.error('[ATLAS] Lecture atlas.json impossible:', err.message);
      return defaultData();
    }
  }

  function saveDispatch(data) {
    data.history = (data.history || []).slice(0, 1000);
    atomicWriteJson(DB_FILE, data);
  }

  function resolveUser(req) {
    const token = verifyArgosToken(tokenFromRequest(req), secret);
    if (!token) return null;
    if (token.id === 'env-admin' && String(token.role).toLowerCase() === 'admin') {
      return { id: token.id, login: token.login, name: token.name, role: 'admin', source: 'Render' };
    }

    const phenix = loadPhenix();
    const byId = String(token.id || '').replace(/^phenix:/, '');
    const stored = (phenix.users || []).find(u => String(u.id) === byId)
      || (phenix.users || []).find(u => String(u.login || '').toLocaleLowerCase('fr-FR') === String(token.login || '').toLocaleLowerCase('fr-FR'));
    if (!stored) return null;
    const role = argosRoleFromPhenix(stored.role);
    if (!role) return null;
    return { id: stored.id, login: stored.login, name: stored.displayName || stored.login, role, source: 'PHENIX' };
  }

  function requireUser(req, res, next) {
    const user = resolveUser(req);
    if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Ouvrez ATLAS depuis le portail ARGOS après connexion.' });
    req.regulationUser = user;
    next();
  }

  function requireManager(req, res, next) {
    const user = resolveUser(req);
    if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Connexion requise.' });
    if (!['admin', 'superviseur'].includes(user.role)) return res.status(403).json({ error: 'FORBIDDEN', message: 'Réservé aux administrateurs et superviseurs.' });
    req.regulationUser = user;
    next();
  }

  function activeCrews() {
    const p = loadPhenix();
    return (p.crews || []).map(c => ({
      id: String(c.id),
      callsign: String(c.callsign || ''),
      status: String(c.status || 'DISPO'),
      intervention: String(c.intervention || ''),
      matricules: Array.isArray(c.matricules) ? c.matricules : []
    }));
  }

  function findCrew(phenix, id) {
    return (phenix.crews || []).find(c => String(c.id) === String(id));
  }

  function crewBusyInDispatch(data, crewId, excludingMissionId = '') {
    return (data.missions || []).some(m => String(m.crewId || '') === String(crewId) && String(m.id) !== String(excludingMissionId) && ['ASSIGNED', 'DEPARTED', 'ONSCENE'].includes(m.status));
  }

  function setCrewOnMission(mission, status) {
    const phenix = loadPhenix();
    const crew = findCrew(phenix, mission.crewId);
    if (!crew) throw Object.assign(new Error('La patrouille n’existe plus dans PHENIX.'), { statusCode: 409 });

    if (status === 'DEPARTED' || status === 'ONSCENE') {
      crew.status = 'INDISPO';
      crew.intervention = buildPhenixIntervention(mission);
      crew.interventionCode = String(mission.natureCode || '').trim().toUpperCase();
      crew.interventionSource = 'regulation';
      crew.eventId = String(mission.id);
      crew.dispatchMissionId = String(mission.id);
    }

    if (status === 'DONE') {
      if (String(crew.dispatchMissionId || crew.eventId || '') === String(mission.id) || crew.interventionSource === 'regulation') {
        crew.status = 'DISPO';
        crew.intervention = '';
        crew.interventionCode = '';
        crew.interventionSource = '';
        crew.eventId = '';
        crew.dispatchMissionId = '';
      }
    }
    savePhenix(phenix);
  }

  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store, max-age=0'); next(); });

  router.get('/healthz', (req, res) => res.json({ ok: true, version: VERSION, dataFile: DB_FILE }));

  router.get('/state', requireUser, (req, res) => {
    const data = loadDispatch();
    const phenix = loadPhenix();
    const natures = (phenix.interventions || []).map(interventionParts).filter(x => x.label);
    const missions = [...data.missions].sort(missionSort);
    const nextMission = missions.find(m => m.status === 'WAITING' && !m.crewId) || null;
    res.json({
      user: req.regulationUser,
      canManage: ['admin', 'superviseur'].includes(req.regulationUser.role),
      missions,
      nextMissionId: nextMission ? nextMission.id : null,
      crews: activeCrews(),
      natures,
      streets: [...data.streets].sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base', numeric: true })),
      serverTime: Date.now()
    });
  });

  router.post('/missions', requireUser, (req, res) => {
    const b = req.body || {};
    const natureLabel = String(b.natureLabel || '').trim();
    const natureCode = String(b.natureCode || '').trim();
    const street = String(b.street || '').trim();
    if (!natureLabel) return res.status(400).json({ error: 'NATURE_REQUIRED', message: 'La nature d’intervention est obligatoire.' });
    if (!street) return res.status(400).json({ error: 'ADDRESS_REQUIRED', message: 'La voie est obligatoire.' });

    const data = loadDispatch();
    const crewId = String(b.crewId || '').trim();
    if (crewId && crewBusyInDispatch(data, crewId)) return res.status(409).json({ error: 'CREW_BUSY', message: 'Cette patrouille a déjà une mission active dans ATLAS.' });
    if (crewId && !activeCrews().some(c => c.id === crewId)) return res.status(400).json({ error: 'CREW_NOT_FOUND', message: 'Cette patrouille n’est plus active dans PHENIX.' });

    const mission = {
      id: crypto.randomUUID(),
      priority: String(b.priority || '').toUpperCase() === 'URGENT' ? 'URGENT' : 'NORMAL',
      natureCode,
      natureLabel,
      number: String(b.number || '').trim().slice(0, 20),
      street: street.slice(0, 180),
      complement: String(b.complement || '').trim().slice(0, 240),
      notes: String(b.notes || '').trim().slice(0, 1000),
      status: crewId ? 'ASSIGNED' : 'WAITING',
      crewId,
      crewCallsign: crewId ? (activeCrews().find(c => c.id === crewId)?.callsign || '') : '',
      createdAt: new Date().toISOString(),
      createdBy: req.regulationUser.name,
      assignedAt: crewId ? new Date().toISOString() : null,
      departedAt: null,
      onSceneAt: null
    };
    data.missions.push(mission);
    if (street && !data.streets.some(x => String(x).toLocaleLowerCase('fr-FR') === street.toLocaleLowerCase('fr-FR'))) data.streets.push(street);
    saveDispatch(data);
    res.json({ ok: true, mission });
  });

  router.post('/missions/:id/assign', requireUser, (req, res) => {
    const data = loadDispatch();
    const mission = data.missions.find(m => m.id === req.params.id);
    if (!mission) return res.status(404).json({ error: 'NOT_FOUND', message: 'Intervention introuvable.' });
    if (!['WAITING', 'ASSIGNED'].includes(mission.status)) return res.status(409).json({ error: 'MISSION_STARTED', message: 'Cette intervention a déjà démarré.' });
    const crewId = String(req.body?.crewId || '').trim();
    const crew = activeCrews().find(c => c.id === crewId);
    if (!crew) return res.status(400).json({ error: 'CREW_NOT_FOUND', message: 'Patrouille active introuvable dans PHENIX.' });
    if (crewBusyInDispatch(data, crewId, mission.id)) return res.status(409).json({ error: 'CREW_BUSY', message: 'Cette patrouille a déjà une mission active.' });
    mission.crewId = crew.id;
    mission.crewCallsign = crew.callsign;
    mission.status = 'ASSIGNED';
    mission.assignedAt = mission.assignedAt || new Date().toISOString();
    saveDispatch(data);
    res.json({ ok: true, mission });
  });

  router.post('/next', requireUser, (req, res) => {
    const crewId = String(req.body?.crewId || '').trim();
    if (!crewId) return res.status(400).json({ error: 'CREW_REQUIRED', message: 'Choisissez une patrouille.' });
    const data = loadDispatch();
    if (crewBusyInDispatch(data, crewId)) return res.status(409).json({ error: 'CREW_BUSY', message: 'Cette patrouille a déjà une mission active.' });
    const crew = activeCrews().find(c => c.id === crewId);
    if (!crew) return res.status(400).json({ error: 'CREW_NOT_FOUND', message: 'Patrouille active introuvable dans PHENIX.' });
    const next = [...data.missions].filter(m => m.status === 'WAITING' && !m.crewId).sort(missionSort)[0];
    if (!next) return res.json({ ok: true, mission: null, message: 'Aucune mission à venir.' });
    next.crewId = crew.id;
    next.crewCallsign = crew.callsign;
    next.status = 'ASSIGNED';
    next.assignedAt = new Date().toISOString();
    saveDispatch(data);
    res.json({ ok: true, mission: next });
  });

  router.post('/missions/:id/status', requireUser, (req, res) => {
    const requested = String(req.body?.status || '').toUpperCase();
    if (!['DEPARTED', 'ONSCENE', 'DONE'].includes(requested)) return res.status(400).json({ error: 'BAD_STATUS', message: 'État invalide.' });
    const data = loadDispatch();
    const mission = data.missions.find(m => m.id === req.params.id);
    if (!mission) return res.status(404).json({ error: 'NOT_FOUND', message: 'Intervention introuvable.' });
    if (!mission.crewId) return res.status(409).json({ error: 'NO_CREW', message: 'Aucune patrouille n’est affectée à cette intervention.' });

    const now = new Date().toISOString();
    if (requested === 'DEPARTED') {
      mission.status = 'DEPARTED';
      mission.departedAt = mission.departedAt || now;
      setCrewOnMission(mission, 'DEPARTED');
    } else if (requested === 'ONSCENE') {
      if (!mission.departedAt) mission.departedAt = now;
      mission.status = 'ONSCENE';
      mission.onSceneAt = mission.onSceneAt || now;
      setCrewOnMission(mission, 'ONSCENE');
    } else {
      const completed = { ...mission, status: 'DONE', completedAt: now, completedBy: req.regulationUser.name };
      setCrewOnMission(mission, 'DONE');
      data.missions = data.missions.filter(m => m.id !== mission.id);
      data.history.unshift(completed);
    }
    saveDispatch(data);
    res.json({ ok: true });
  });

  router.delete('/missions/:id', requireManager, (req, res) => {
    const data = loadDispatch();
    const mission = data.missions.find(m => m.id === req.params.id);
    if (!mission) return res.status(404).json({ error: 'NOT_FOUND', message: 'Intervention introuvable.' });
    if (['DEPARTED', 'ONSCENE'].includes(mission.status)) {
      try { setCrewOnMission(mission, 'DONE'); } catch {}
    }
    data.missions = data.missions.filter(m => m.id !== req.params.id);
    saveDispatch(data);
    res.json({ ok: true });
  });

  router.post('/catalog/natures', requireManager, (req, res) => {
    const labels = Array.isArray(req.body?.labels) ? req.body.labels : [];
    const phenix = loadPhenix();
    phenix.interventions = normalizeInterventions(labels);
    savePhenix(phenix);
    res.json({ ok: true, natures: phenix.interventions.map(interventionParts) });
  });

  router.post('/catalog/streets', requireManager, (req, res) => {
    const values = Array.isArray(req.body?.streets) ? req.body.streets : [];
    const data = loadDispatch();
    data.streets = [...new Set(values.map(x => String(x || '').trim()).filter(Boolean))].slice(0, 5000).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }));
    saveDispatch(data);
    res.json({ ok: true, streets: data.streets });
  });

  app.use('/portail/atlas/api', router);
  app.get(/^\/portail\/atlas$/, (req, res) => res.redirect(302, '/portail/atlas/'));
  app.use('/portail/atlas', express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (/\.(?:html|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
  }));
  app.get('/portail/atlas/*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  ensurePortalTile(PORTAL_FILE);
  setTimeout(() => ensurePortalTile(PORTAL_FILE), 1500).unref?.();
  console.log(`[ATLAS] Disponible sur /portail/atlas/ — données: ${DB_FILE}`);
}

module.exports = { mountInterventions };
