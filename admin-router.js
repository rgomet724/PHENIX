'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  APPLICATIONS,
  addAudit,
  appearanceFor,
  loadAdminConfig,
  normalizedRole,
  policyForUser,
  saveAdminConfig,
  setUserPolicy
} = require('./central-config');

const MAX_LOGO_SIZE = 400 * 1024;
const MAX_BACKGROUND_SIZE = 2 * 1024 * 1024;
const BCRYPT_ROUNDS = 12;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch { out[key] = part.slice(index + 1).trim(); }
  }
  return out;
}

function verifyPortalToken(token, secret) {
  try {
    const [version, payload, signature] = String(token || '').split('.');
    if (version !== 'v1' || !payload || !signature) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (!safeEqual(expected, signature)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now() || !parsed.sub || !parsed.login) return null;
    return {
      id: parsed.sub,
      login: parsed.login,
      name: parsed.name || parsed.login,
      role: parsed.role,
      source: parsed.source || 'ARGOS'
    };
  } catch { return null; }
}

function validateImageData(value, maxBytes, label) {
  if (!value) return '';
  const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon));base64,([A-Za-z0-9+/=]+)$/.exec(String(value));
  if (!match) throw new Error(`${label} : format non pris en charge.`);
  const decoded = Buffer.from(match[2], 'base64');
  if (decoded.length > maxBytes) throw new Error(`${label} trop volumineux.`);
  return String(value);
}

function validUrl(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('/') && !raw.startsWith('//')) return true;
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol); }
  catch { return false; }
}

function portalDefaults() {
  return {
    schemaVersion: 2,
    users: [],
    categories: [
      { id: 'cat-operationnel', name: 'Opérationnel', order: 10 },
      { id: 'cat-outils', name: 'Outils et applications', order: 20 },
      { id: 'cat-documentation', name: 'Documentation', order: 30 }
    ],
    apps: [{
      id: 'app-phenix', categoryId: 'cat-operationnel', name: 'PHENIX',
      description: 'Plateforme opérationnelle', url: '/', logoData: '', accentColor: '#0878df', order: 10
    }]
  };
}

function mountCentralAdmin(app, deps = {}) {
  const loadPhenix = deps.loadPhenix;
  const savePhenix = deps.savePhenix;
  const secret = String(deps.sessionSecret || process.env.SESSION_SECRET || '');
  if (typeof loadPhenix !== 'function' || typeof savePhenix !== 'function') throw new Error('ADMIN: loadPhenix/savePhenix requis.');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('ADMIN: SESSION_SECRET doit faire au moins 32 octets.');

  const staticDir = path.join(__dirname, 'portail', 'administration');
  const dataDir = String(process.env.PORTAL_DATA_DIR || '/var/data');
  const portalFile = path.join(dataDir, 'portal.json');
  const atlasFile = path.join(String(process.env.ATLAS_DATA_DIR || dataDir), 'atlas.json');
  const arretesFile = path.join(String(process.env.ARRETES_DATA_DIR || '/var/data/arretes'), 'arretes.json');

  function loadPortal() {
    const defaults = portalDefaults();
    try {
      if (!fs.existsSync(portalFile)) return defaults;
      const parsed = JSON.parse(fs.readFileSync(portalFile, 'utf8'));
      return {
        schemaVersion: 2,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        categories: Array.isArray(parsed.categories) ? parsed.categories : defaults.categories,
        apps: Array.isArray(parsed.apps) ? parsed.apps : defaults.apps
      };
    } catch (error) {
      console.error('[ADMIN] Lecture portal.json impossible:', error.message);
      return defaults;
    }
  }

  function savePortal(data) {
    fs.mkdirSync(path.dirname(portalFile), { recursive: true });
    const tmp = `${portalFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, portalFile);
  }

  function readJson(file, fallback = {}) {
    try {
      if (!fs.existsSync(file)) return fallback;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch { return fallback; }
  }

  function operationalAuditEntries() {
    const atlas = readJson(atlasFile, { missions: [], history: [] });
    const atlasEntries = [...(Array.isArray(atlas.missions) ? atlas.missions : []), ...(Array.isArray(atlas.history) ? atlas.history : [])]
      .map(item => ({
        id: `atlas:${item.id || crypto.randomUUID()}`,
        date: item.completedAt || item.createdAt || item.assignedAt || '',
        actor: item.completedBy || item.createdBy || 'ATLAS',
        login: '',
        source: 'ATLAS',
        action: item.completedAt || item.status === 'DONE' ? 'Intervention terminée' : 'Intervention enregistrée',
        details: [item.natureLabel, [item.number, item.street].filter(Boolean).join(' '), item.crewCallsign].filter(Boolean).join(' · '),
        ip: ''
      }));

    const arretes = readJson(arretesFile, []);
    const records = Array.isArray(arretes) ? arretes : Array.isArray(arretes.records) ? arretes.records : [];
    const arretesEntries = records.map(item => ({
      id: `arretes:${item.id || crypto.randomUUID()}`,
      date: item.createdAt || item.date || '',
      actor: item.createdBy && (item.createdBy.name || item.createdBy.login) || 'Arrêtés',
      login: item.createdBy && item.createdBy.login || '',
      source: 'Arrêtés',
      action: 'Arrêté enregistré',
      details: [item.number, item.name, ...(Array.isArray(item.streets) ? item.streets.slice(0, 3) : [])].filter(Boolean).join(' · '),
      ip: ''
    }));
    return atlasEntries.concat(arretesEntries);
  }

  function portalToken(req) {
    const auth = String(req.headers.authorization || '');
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return parseCookies(req.headers.cookie).pm_portal_auth || '';
  }

  function resolveAdmin(req) {
    const phenix = loadPhenix();
    if (req.session && req.session.userId) {
      const stored = (phenix.users || []).find(user => String(user.id) === String(req.session.userId));
      if (stored && normalizedRole(stored.role) === 'admin') {
        return { id: stored.id, login: stored.login, name: stored.displayName || stored.login, source: 'PHENIX', stored };
      }
    }

    const token = portalToken(req);
    const decoded = verifyPortalToken(token, secret);
    if (!decoded || normalizedRole(decoded.role) !== 'admin') return null;
    if (decoded.id === 'env-admin' && decoded.source === 'Render') return { ...decoded, stored: null };
    const id = String(decoded.id || '').replace(/^phenix:/, '');
    const stored = (phenix.users || []).find(user => String(user.id) === id)
      || (phenix.users || []).find(user => String(user.login || '').toLowerCase() === String(decoded.login || '').toLowerCase());
    if (!stored || normalizedRole(stored.role) !== 'admin') return null;
    return { id: stored.id, login: stored.login, name: stored.displayName || stored.login, source: 'PHENIX', stored };
  }

  function csrfFor(req, actor) {
    const token = portalToken(req) || `session:${req.sessionID || ''}:${actor.id}`;
    return crypto.createHmac('sha256', secret).update(`admin:${token}`).digest('base64url');
  }

  function requireAdmin(req, res, next) {
    const actor = resolveAdmin(req);
    if (!actor) return res.status(403).json({ error: 'ADMIN_REQUIRED', message: 'Accès réservé aux administrateurs.' });
    req.centralAdmin = actor;
    req.centralCsrf = csrfFor(req, actor);
    next();
  }

  function requireCsrf(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!safeEqual(req.get('x-admin-csrf'), req.centralCsrf)) {
      return res.status(403).json({ error: 'CSRF_INVALID', message: 'Jeton de sécurité invalide. Rechargez la page.' });
    }
    next();
  }

  function publicUser(user, config) {
    return {
      id: String(user.id),
      displayName: String(user.displayName || user.login || ''),
      login: String(user.login || ''),
      role: normalizedRole(user.role),
      brigades: user.brigades || { jour: true, nuit: true },
      mustChangePassword: Boolean(user.mustChangePassword),
      passwordChangedAt: user.passwordChangedAt || null,
      access: policyForUser(user, config)
    };
  }

  function auditAndSave(config, req, action, details) {
    addAudit(config, req.centralAdmin, action, details, req);
    saveAdminConfig(config);
  }

  function ensureLastAdmin(users, targetId, nextRole, deleting = false) {
    const remaining = users.filter(user => String(user.id) !== String(targetId));
    const otherAdmins = remaining.filter(user => normalizedRole(user.role) === 'admin');
    if ((deleting || normalizedRole(nextRole) !== 'admin') && otherAdmins.length === 0) {
      throw new Error('Impossible de supprimer ou rétrograder le dernier administrateur PHENIX.');
    }
  }

  const router = express.Router();
  router.use(express.json({ limit: '4mb' }));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store, max-age=0'); next(); });

  router.get('/public/appearance/:appId', (req, res) => {
    const appId = String(req.params.appId || '').toLowerCase();
    if (!APPLICATIONS.some(item => item.id === appId)) return res.status(404).json({ error: 'Application inconnue' });
    res.json({ appearance: appearanceFor(appId) });
  });

  router.use(requireAdmin, requireCsrf);

  router.get('/session', (req, res) => {
    const config = loadAdminConfig();
    res.json({
      user: { id: req.centralAdmin.id, login: req.centralAdmin.login, name: req.centralAdmin.name, source: req.centralAdmin.source },
      csrfToken: req.centralCsrf,
      passwordMinLength: config.security.passwordMinLength
    });
  });

  router.get('/dashboard', (req, res) => {
    const phenix = loadPhenix();
    const config = loadAdminConfig();
    const portal = loadPortal();
    let diskBytes = 0;
    const walk = directory => {
      try {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) diskBytes += fs.statSync(full).size;
        }
      } catch { /* dossier absent */ }
    };
    walk('/var/data');
    res.json({
      users: (phenix.users || []).length,
      administrators: (phenix.users || []).filter(user => normalizedRole(user.role) === 'admin').length,
      enabledArgos: (phenix.users || []).filter(user => policyForUser(user, config).argos.enabled).length,
      applications: portal.apps.length,
      auditEntries: (phenix.logs || []).length + config.audit.length + operationalAuditEntries().length,
      diskBytes,
      dataFile: '/var/data/admin-center.json'
    });
  });

  router.get('/users', (req, res) => {
    const phenix = loadPhenix();
    const config = loadAdminConfig();
    res.json({ users: (phenix.users || []).map(user => publicUser(user, config)) });
  });

  router.post('/users', (req, res) => {
    try {
      const phenix = loadPhenix();
      const config = loadAdminConfig(true);
      const input = req.body || {};
      const id = String(input.id || '');
      const displayName = String(input.displayName || '').trim().slice(0, 120);
      const login = String(input.login || '').trim().slice(0, 80);
      const role = normalizedRole(input.role);
      const password = String(input.password || '');
      const min = config.security.passwordMinLength;
      if (!displayName || !login || !['admin', 'superviseur', 'operateur', 'dashboard'].includes(role)) {
        return res.status(400).json({ error: 'Nom, identifiant et rôle valides obligatoires.' });
      }
      if ((phenix.users || []).some(user => String(user.id) !== id && String(user.login || '').toLowerCase() === login.toLowerCase())) {
        return res.status(400).json({ error: 'Cet identifiant est déjà utilisé.' });
      }
      const brigades = {
        jour: ['admin', 'superviseur'].includes(role) ? true : Boolean(input.brigades && input.brigades.jour),
        nuit: ['admin', 'superviseur'].includes(role) ? true : Boolean(input.brigades && input.brigades.nuit)
      };

      let user;
      if (id) {
        user = (phenix.users || []).find(item => String(item.id) === id);
        if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
        if (String(req.centralAdmin.id) === id && role !== 'admin') return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre rôle administrateur.' });
        ensureLastAdmin(phenix.users || [], id, role);
        user.displayName = displayName;
        user.login = login;
        user.role = role;
        user.brigades = brigades;
        if (password) {
          if (password.length < min || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: `Le mot de passe doit contenir ${min} à 72 caractères.` });
          user.passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
          user.mustChangePassword = Boolean(input.mustChangePassword);
          user.passwordChangedAt = user.mustChangePassword ? null : new Date().toISOString();
        }
      } else {
        if (password.length < min || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: `Le mot de passe doit contenir ${min} à 72 caractères.` });
        user = {
          id: crypto.randomUUID(), displayName, login, role, brigades,
          passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
          mustChangePassword: Boolean(input.mustChangePassword),
          passwordChangedAt: input.mustChangePassword ? null : new Date().toISOString()
        };
        phenix.users.push(user);
      }

      const previous = policyForUser(user, config);
      previous.phenix.role = role;
      setUserPolicy(config, user, previous);
      savePhenix(phenix);
      auditAndSave(config, req, id ? 'Modification utilisateur' : 'Création utilisateur', `${displayName} (${login}) · rôle ${role}`);
      res.json({ ok: true, user: publicUser(user, config) });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.post('/users/:id/password', (req, res) => {
    const phenix = loadPhenix();
    const config = loadAdminConfig(true);
    const user = (phenix.users || []).find(item => String(item.id) === String(req.params.id));
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const password = String(req.body && req.body.password || '');
    const min = config.security.passwordMinLength;
    if (password.length < min || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: `Le mot de passe doit contenir ${min} à 72 caractères.` });
    user.passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    user.mustChangePassword = Boolean(req.body && req.body.mustChangePassword);
    user.passwordChangedAt = user.mustChangePassword ? null : new Date().toISOString();
    savePhenix(phenix);
    auditAndSave(config, req, 'Réinitialisation mot de passe', `${user.displayName} (${user.login})`);
    res.json({ ok: true });
  });

  router.put('/users/:id/access', (req, res) => {
    try {
      const phenix = loadPhenix();
      const config = loadAdminConfig(true);
      const user = (phenix.users || []).find(item => String(item.id) === String(req.params.id));
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
      const policy = req.body && req.body.access;
      if (!policy || typeof policy !== 'object') return res.status(400).json({ error: 'Autorisations manquantes.' });
      if (String(req.centralAdmin.id) === String(user.id) && (!policy.phenix || policy.phenix.enabled === false || normalizedRole(policy.phenix.role) !== 'admin')) {
        return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre accès administrateur.' });
      }
      const nextRole = normalizedRole(policy.phenix && policy.phenix.role || user.role);
      ensureLastAdmin(phenix.users || [], user.id, nextRole);
      user.role = ['admin', 'superviseur', 'operateur', 'dashboard'].includes(nextRole) ? nextRole : user.role;
      const saved = setUserPolicy(config, user, policy);
      saved.phenix.role = user.role;
      savePhenix(phenix);
      auditAndSave(config, req, 'Modification des accès', `${user.displayName} (${user.login})`);
      res.json({ ok: true, access: saved });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.delete('/users/:id', (req, res) => {
    try {
      const phenix = loadPhenix();
      const config = loadAdminConfig(true);
      const user = (phenix.users || []).find(item => String(item.id) === String(req.params.id));
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
      if (String(req.centralAdmin.id) === String(user.id)) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
      ensureLastAdmin(phenix.users || [], user.id, user.role, true);
      phenix.users = phenix.users.filter(item => String(item.id) !== String(user.id));
      delete config.userPolicies[String(user.id)];
      savePhenix(phenix);
      auditAndSave(config, req, 'Suppression utilisateur', `${user.displayName} (${user.login})`);
      res.json({ ok: true });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.get('/catalog', (req, res) => {
    const portal = loadPortal();
    res.json({ applications: APPLICATIONS, categories: portal.categories, apps: portal.apps });
  });

  router.post('/categories', (req, res) => {
    const portal = loadPortal();
    const config = loadAdminConfig(true);
    const id = String(req.body && req.body.id || '').trim();
    const name = String(req.body && req.body.name || '').trim().slice(0, 100);
    const order = Number(req.body && req.body.order || 10);
    if (!name) return res.status(400).json({ error: 'Nom de catégorie obligatoire.' });
    if (id) {
      const item = portal.categories.find(category => category.id === id);
      if (!item) return res.status(404).json({ error: 'Catégorie introuvable.' });
      item.name = name; item.order = order;
    } else portal.categories.push({ id: crypto.randomUUID(), name, order });
    savePortal(portal);
    auditAndSave(config, req, id ? 'Modification catégorie' : 'Création catégorie', name);
    res.json({ ok: true });
  });

  router.delete('/categories/:id', (req, res) => {
    const portal = loadPortal();
    const config = loadAdminConfig(true);
    const category = portal.categories.find(item => item.id === req.params.id);
    if (!category) return res.status(404).json({ error: 'Catégorie introuvable.' });
    if (portal.apps.some(item => item.categoryId === category.id)) return res.status(400).json({ error: 'Déplacez ou supprimez les applications de cette catégorie avant de la supprimer.' });
    portal.categories = portal.categories.filter(item => item.id !== category.id);
    savePortal(portal);
    auditAndSave(config, req, 'Suppression catégorie', category.name);
    res.json({ ok: true });
  });

  router.post('/apps', (req, res) => {
    try {
      const portal = loadPortal();
      const config = loadAdminConfig(true);
      const input = req.body || {};
      const id = String(input.id || '').trim();
      const name = String(input.name || '').trim().slice(0, 100);
      const description = String(input.description || '').trim().slice(0, 180);
      const url = String(input.url || '').trim();
      const categoryId = String(input.categoryId || '').trim();
      const accentColor = /^#[0-9a-f]{6}$/i.test(String(input.accentColor || '')) ? String(input.accentColor).toLowerCase() : '#0878df';
      const order = Number(input.order || 10);
      if (!name || !validUrl(url) || !portal.categories.some(category => category.id === categoryId)) return res.status(400).json({ error: 'Nom, URL et catégorie valides obligatoires.' });
      const logoData = input.logoData ? validateImageData(input.logoData, MAX_LOGO_SIZE, 'Logo') : '';
      let item;
      if (id) {
        item = portal.apps.find(appItem => appItem.id === id);
        if (!item) return res.status(404).json({ error: 'Application introuvable.' });
        Object.assign(item, { name, description, url, categoryId, accentColor, order });
        if (logoData) item.logoData = logoData;
        if (input.removeLogo) item.logoData = '';
      } else {
        item = { id: crypto.randomUUID(), name, description, url, categoryId, accentColor, order, logoData };
        portal.apps.push(item);
      }
      savePortal(portal);
      auditAndSave(config, req, id ? 'Modification application' : 'Création application', `${name} · ${url}`);
      res.json({ ok: true, app: item });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.delete('/apps/:id', (req, res) => {
    const portal = loadPortal();
    const config = loadAdminConfig(true);
    const item = portal.apps.find(appItem => appItem.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Application introuvable.' });
    portal.apps = portal.apps.filter(appItem => appItem.id !== item.id);
    for (const policy of Object.values(config.userPolicies)) if (policy && policy.apps) delete policy.apps[item.id];
    savePortal(portal);
    auditAndSave(config, req, 'Suppression application', item.name);
    res.json({ ok: true });
  });

  router.get('/appearance', (req, res) => {
    const config = loadAdminConfig();
    res.json({ appearance: config.appearance });
  });

  router.put('/appearance/:appId', (req, res) => {
    try {
      const appId = String(req.params.appId || '').toLowerCase();
      if (!APPLICATIONS.some(item => item.id === appId)) return res.status(404).json({ error: 'Application inconnue.' });
      const config = loadAdminConfig(true);
      const current = config.appearance[appId];
      const input = req.body || {};
      current.title = String(input.title || current.title).trim().slice(0, 80) || current.title;
      current.subtitle = String(input.subtitle || '').trim().slice(0, 160);
      if (/^#[0-9a-f]{6}$/i.test(String(input.primaryColor || ''))) current.primaryColor = String(input.primaryColor).toLowerCase();
      if (/^#[0-9a-f]{6}$/i.test(String(input.accentColor || ''))) current.accentColor = String(input.accentColor).toLowerCase();
      if (/^#[0-9a-f]{6}$/i.test(String(input.backgroundColor || ''))) current.backgroundColor = String(input.backgroundColor).toLowerCase();
      if (input.logoData) current.logoData = validateImageData(input.logoData, MAX_LOGO_SIZE, 'Logo');
      if (input.faviconData) current.faviconData = validateImageData(input.faviconData, MAX_LOGO_SIZE, 'Icône d’onglet');
      if (input.backgroundData) current.backgroundData = validateImageData(input.backgroundData, MAX_BACKGROUND_SIZE, 'Fond d’écran');
      if (input.removeLogo) current.logoData = '';
      if (input.removeFavicon) current.faviconData = '';
      if (input.removeBackground) current.backgroundData = '';
      auditAndSave(config, req, 'Modification apparence', appId.toUpperCase());
      res.json({ ok: true, appearance: current });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.get('/security', (req, res) => {
    const config = loadAdminConfig();
    res.json({ passwordMinLength: config.security.passwordMinLength, passwordMaxLength: 72, passwordMaxAgeDays: 90 });
  });

  router.put('/security', (req, res) => {
    const config = loadAdminConfig(true);
    const value = Number(req.body && req.body.passwordMinLength);
    if (!Number.isInteger(value) || value < 4 || value > 32) return res.status(400).json({ error: 'Choisissez un minimum compris entre 4 et 32 caractères.' });
    config.security.passwordMinLength = value;
    auditAndSave(config, req, 'Modification sécurité', `Mot de passe minimum : ${value} caractères`);
    res.json({ ok: true, passwordMinLength: value });
  });

  router.get('/audit', (req, res) => {
    const config = loadAdminConfig();
    const phenix = loadPhenix();
    const search = String(req.query.search || '').trim().toLowerCase();
    const source = String(req.query.source || '');
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00`).getTime() : 0;
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`).getTime() : Date.now();
    const central = config.audit.map(item => ({ ...item, source: 'Administration', message: item.details, user: item.actor, type: item.action }));
    const legacy = (phenix.logs || []).map(item => ({ ...item, source: 'PHENIX', message: item.msg, action: item.type }));
    let entries = central.concat(legacy, operationalAuditEntries()).filter(item => {
      const stamp = new Date(item.date).getTime();
      if (!Number.isFinite(stamp) || stamp < from || stamp > to) return false;
      if (source && item.source !== source) return false;
      if (search && ![item.actor, item.user, item.login, item.action, item.type, item.details, item.message, item.ip].join(' ').toLowerCase().includes(search)) return false;
      return true;
    });
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ entries: entries.slice(0, 1500), total: entries.length });
  });

  app.use('/portail/administration/api', router);
  app.get(/^\/portail\/administration$/, (req, res) => res.redirect(302, '/portail/administration/'));
  app.get('/portail/administration/', (req, res) => {
    if (!resolveAdmin(req)) return res.status(403).sendFile(path.join(staticDir, 'access-denied.html'));
    res.sendFile(path.join(staticDir, 'index.html'));
  });
  app.use('/portail/administration', express.static(staticDir, { etag: true, maxAge: 0, setHeaders: res => res.setHeader('Cache-Control', 'no-store, max-age=0') }));
  app.get('/portail/administration/*', (req, res) => {
    if (!resolveAdmin(req)) return res.status(403).sendFile(path.join(staticDir, 'access-denied.html'));
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  console.log('[ADMIN] Centre d’administration disponible sur /portail/administration/');
}

module.exports = { mountCentralAdmin };
