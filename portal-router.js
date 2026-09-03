'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const VERSION = '2.3.0-appearance';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_APP_LOGO_SIZE = 400 * 1024;
const MAX_UI_IMAGE_SIZE = 2 * 1024 * 1024;
const PHENIX_PASSWORD_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function writableDir(candidates) {
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.portal-write-test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch (err) {
      console.warn(`[ARGOS] Stockage indisponible ${dir}: ${err.message}`);
    }
  }
  throw new Error('Aucun stockage disponible pour ARGOS.');
}

function validateDataImage(value, maxBytes) {
  if (value === undefined || value === null || value === '') return { ok: true, value: '' };
  const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(String(value));
  if (!match) return { ok: false, message: 'Format d’image non pris en charge.' };
  try {
    const decoded = Buffer.from(match[2], 'base64');
    if (decoded.length > maxBytes) return { ok: false, message: `Image trop lourde (max ${Math.round(maxBytes / 1024)} Ko).` };
    return { ok: true, value: String(value) };
  } catch {
    return { ok: false, message: 'Image invalide.' };
  }
}

function validAppUrl(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('/') && !raw.startsWith('//')) return true;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizePhenixRole(role) {
  return String(role || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function argosRoleFromPhenix(role) {
  const normalized = normalizePhenixRole(role);
  if (normalized === 'admin' || normalized === 'administrateur') return 'admin';
  if (normalized === 'superviseur' || normalized === 'operateur') return 'user';
  return null;
}

function phenixPasswordExpired(user) {
  if (!user) return true;
  if (normalizePhenixRole(user.role) === 'dashboard') return false;
  if (user.mustChangePassword) return true;
  if (!user.passwordChangedAt) return true;
  const changed = new Date(user.passwordChangedAt).getTime();
  return !Number.isFinite(changed) || (Date.now() - changed) >= PHENIX_PASSWORD_MAX_AGE_MS;
}

function mountPortal(app) {
  const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  const ADMIN_LOGIN = String(process.env.PORTAL_ADMIN_LOGIN || 'admin').trim() || 'admin';
  const ADMIN_PASSWORD = String(process.env.PORTAL_ADMIN_PASSWORD || '');
  const ADMIN_NAME = String(process.env.PORTAL_ADMIN_NAME || 'Administrateur ARGOS').trim() || 'Administrateur ARGOS';
  const ENV_SECRET = String(process.env.SESSION_SECRET || '');
  const TOKEN_SECRET = ENV_SECRET.length >= 32 ? ENV_SECRET : crypto.randomBytes(48).toString('base64url');
  const PORTAL_DIR = path.join(__dirname, 'portail');
  const requestedDataDir = String(process.env.PORTAL_DATA_DIR || '').trim();
  const DATA_DIR = writableDir(requestedDataDir ? [requestedDataDir] : ['/var/data', path.join(__dirname, 'data'), '/tmp/argos']);
  const DB_FILE = path.join(DATA_DIR, 'portal.json');
  const PHENIX_DB_FILE = String(process.env.PHENIX_DATA_FILE || '/var/data/data.json').trim() || '/var/data/data.json';

  function defaultData() {
    return {
      schemaVersion: 3,
      categories: [
        { id: 'cat-operationnel', name: 'Opérationnel', order: 10 },
        { id: 'cat-outils', name: 'Outils et applications', order: 20 },
        { id: 'cat-documentation', name: 'Documentation', order: 30 }
      ],
      apps: [
        { id: 'app-phenix', categoryId: 'cat-operationnel', name: 'PHENIX', description: 'Plateforme opérationnelle', url: '/', logoData: '', order: 10 }
      ],
      appearance: {
        title: 'Portail ARGOS',
        subtitle1: 'Police Municipale',
        subtitle2: 'Chalon-sur-Saône',
        eyebrow: 'ARGOS • Portail professionnel',
        loginIntro: 'Portail d’accès aux applications et ressources professionnelles',
        portalWelcome: 'Sélectionnez une application pour l’ouvrir dans un nouvel onglet.',
        loginLogoData: '',
        portalLogoData: '',
        loginBackgroundData: '',
        portalBackgroundData: ''
      }
    };
  }

  function loadData() {
    const base = defaultData();
    try {
      if (!fs.existsSync(DB_FILE)) return base;
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return {
        schemaVersion: 3,
        categories: Array.isArray(parsed.categories) ? parsed.categories : base.categories,
        apps: Array.isArray(parsed.apps) ? parsed.apps : base.apps,
        appearance: {
          ...base.appearance,
          ...(parsed.appearance && typeof parsed.appearance === 'object' ? parsed.appearance : {})
        }
      };
    } catch (err) {
      console.error('[ARGOS] Lecture portal.json impossible:', err.message);
      return base;
    }
  }

  function saveData(data) {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, DB_FILE);
  }

  function loadPhenixUsers() {
    try {
      if (!fs.existsSync(PHENIX_DB_FILE)) return { ok: false, users: [], error: `Base PHENIX introuvable: ${PHENIX_DB_FILE}` };
      const parsed = JSON.parse(fs.readFileSync(PHENIX_DB_FILE, 'utf8'));
      return { ok: true, users: Array.isArray(parsed.users) ? parsed.users : [], error: '' };
    } catch (err) {
      console.error('[ARGOS] Lecture comptes PHENIX impossible:', err.message);
      return { ok: false, users: [], error: err.message };
    }
  }

  function signToken(user) {
    const now = Date.now();
    const payload = Buffer.from(JSON.stringify({
      sub: user.id,
      login: user.login,
      name: user.name,
      role: user.role,
      source: user.source || 'ARGOS',
      phenixRole: user.phenixRole || '',
      iat: now,
      exp: now + TOKEN_TTL_MS
    }), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
    return `v1.${payload}.${sig}`;
  }

  function verifyToken(token) {
    try {
      const [version, payload, sig] = String(token || '').split('.');
      if (version !== 'v1' || !payload || !sig) return null;
      const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
      if (!safeEqual(expected, sig)) return null;
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!parsed.exp || parsed.exp < Date.now() || !parsed.sub || !parsed.login || !parsed.role) return null;
      return {
        id: parsed.sub,
        login: parsed.login,
        name: parsed.name || parsed.login,
        role: parsed.role === 'admin' ? 'admin' : 'user',
        source: parsed.source || 'ARGOS',
        phenixRole: parsed.phenixRole || ''
      };
    } catch {
      return null;
    }
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

  function currentUser(req) {
    const user = verifyToken(tokenFromRequest(req));
    if (!user) return null;

    if (user.source === 'PHENIX') {
      const phenix = loadPhenixUsers();
      if (!phenix.ok) return null;
      const rawId = String(user.id).startsWith('phenix:') ? String(user.id).slice(7) : String(user.id);
      const stored = phenix.users.find(u => String(u.id) === rawId);
      if (!stored) return null;
      const role = argosRoleFromPhenix(stored.role);
      if (!role || phenixPasswordExpired(stored)) return null;
      return {
        id: `phenix:${stored.id}`,
        login: stored.login,
        name: stored.displayName || stored.login,
        role,
        source: 'PHENIX',
        phenixRole: normalizePhenixRole(stored.role)
      };
    }

    return user;
  }

  function isSecure(req) {
    return IS_PROD || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  }

  function authCookie(req, token, maxAge = Math.floor(TOKEN_TTL_MS / 1000)) {
    const parts = [`pm_portal_auth=${encodeURIComponent(token)}`, 'Path=/portail', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
    if (isSecure(req)) parts.push('Secure');
    return parts.join('; ');
  }

  function requireLogin(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Connexion requise.' });
    req.portalUser = user;
    next();
  }

  function requireAdmin(req, res, next) {
    return requireLogin(req, res, () => {
      if (req.portalUser.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès administrateur requis.' });
      next();
    });
  }

  const attempts = new Map();
  function loginAllowed(req) {
    const key = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const max = 25;
    const state = attempts.get(key);
    if (!state || state.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    state.count += 1;
    return state.count <= max;
  }

  const router = express.Router();
  router.use(express.json({ limit: '5mb' }));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    next();
  });

  router.get('/healthz', (req, res) => {
    const phenix = loadPhenixUsers();
    res.json({
      ok: true,
      version: VERSION,
      accountSource: 'PHENIX',
      phenixDataAvailable: phenix.ok,
      adminConfigured: Boolean(ADMIN_PASSWORD),
      sessionSecretConfigured: ENV_SECRET.length >= 32,
      dataFile: DB_FILE
    });
  });

  router.get('/appearance', (req, res) => {
    const data = loadData();
    res.json({ appearance: data.appearance });
  });

  router.get('/me', (req, res) => res.json({ user: currentUser(req) || null }));

  router.post('/login', (req, res) => {
    if (!loginAllowed(req)) return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });

    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    if (!login || !password) return res.status(400).json({ error: 'MISSING_CREDENTIALS', message: 'Identifiant et mot de passe requis.' });
    const loginNorm = login.toLocaleLowerCase('fr-FR');

    let user = null;
    if (loginNorm === ADMIN_LOGIN.toLocaleLowerCase('fr-FR') && ADMIN_PASSWORD && safeEqual(password, ADMIN_PASSWORD)) {
      user = { id: 'env-admin', login: ADMIN_LOGIN, name: ADMIN_NAME, role: 'admin', source: 'Render' };
    }

    if (!user) {
      const phenix = loadPhenixUsers();
      if (!phenix.ok) return res.status(503).json({ error: 'PHENIX_UNAVAILABLE', message: 'Les comptes PHENIX sont indisponibles pour le moment.' });
      const stored = phenix.users.find(u => String(u.login || '').toLocaleLowerCase('fr-FR') === loginNorm);
      if (!stored || !stored.passwordHash || !bcrypt.compareSync(password, stored.passwordHash)) {
        return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'Identifiant ou mot de passe incorrect.' });
      }
      const role = argosRoleFromPhenix(stored.role);
      if (!role) return res.status(403).json({ error: 'ROLE_NOT_ALLOWED', message: 'Ce compte PHENIX n’est pas autorisé sur ARGOS.' });
      if (phenixPasswordExpired(stored)) {
        return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED', message: 'Ce compte doit d’abord mettre à jour son mot de passe dans PHENIX.' });
      }
      user = {
        id: `phenix:${stored.id}`,
        login: stored.login,
        name: stored.displayName || stored.login,
        role,
        source: 'PHENIX',
        phenixRole: normalizePhenixRole(stored.role)
      };
    }

    const token = signToken(user);
    res.set('Set-Cookie', authCookie(req, token));
    res.json({ ok: true, token, user });
  });

  router.post('/logout', (req, res) => {
    res.set('Set-Cookie', authCookie(req, '', 0));
    res.json({ ok: true });
  });

  router.get('/portal', requireLogin, (req, res) => {
    const data = loadData();
    const categories = [...data.categories].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name), 'fr'));
    const apps = [...data.apps].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name), 'fr'));
    res.json({ user: req.portalUser, categories, apps, appearance: data.appearance });
  });

  router.get('/admin/users', requireAdmin, (req, res) => {
    const phenix = loadPhenixUsers();
    const users = [{ id: 'env-admin', login: ADMIN_LOGIN, name: ADMIN_NAME, role: 'admin', source: 'Render', protected: true, accessEnabled: true, phenixRole: '' }];
    if (phenix.ok) {
      users.push(...phenix.users.map(u => ({
        id: `phenix:${u.id}`,
        login: u.login,
        name: u.displayName || u.login,
        role: argosRoleFromPhenix(u.role) || 'blocked',
        source: 'PHENIX',
        protected: false,
        accessEnabled: Boolean(argosRoleFromPhenix(u.role)) && !phenixPasswordExpired(u),
        phenixRole: normalizePhenixRole(u.role),
        passwordChangeRequired: phenixPasswordExpired(u)
      })));
    }
    res.json({ users, phenixAvailable: phenix.ok, phenixError: phenix.error || '' });
  });

  router.post('/admin/categories', requireAdmin, (req, res) => {
    const data = loadData();
    const id = String(req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const order = Number.isFinite(Number(req.body?.order)) ? Number(req.body.order) : 10;
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Le nom de la catégorie est requis.' });
    if (id) {
      const target = data.categories.find(c => c.id === id);
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Catégorie introuvable.' });
      target.name = name;
      target.order = order;
    } else {
      data.categories.push({ id: crypto.randomUUID(), name, order });
    }
    saveData(data);
    res.json({ ok: true });
  });

  router.delete('/admin/categories/:id', requireAdmin, (req, res) => {
    const data = loadData();
    if (!data.categories.some(c => c.id === req.params.id)) return res.status(404).json({ error: 'NOT_FOUND', message: 'Catégorie introuvable.' });
    data.categories = data.categories.filter(c => c.id !== req.params.id);
    data.apps = data.apps.filter(a => a.categoryId !== req.params.id);
    saveData(data);
    res.json({ ok: true });
  });

  router.post('/admin/apps', requireAdmin, (req, res) => {
    const data = loadData();
    const id = String(req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const url = String(req.body?.url || '').trim();
    const categoryId = String(req.body?.categoryId || '').trim();
    const order = Number.isFinite(Number(req.body?.order)) ? Number(req.body.order) : 10;
    if (!name || !url || !categoryId) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Nom, lien et catégorie requis.' });
    if (!validAppUrl(url)) return res.status(400).json({ error: 'INVALID_URL', message: 'Lien invalide.' });
    if (!data.categories.some(c => c.id === categoryId)) return res.status(400).json({ error: 'INVALID_CATEGORY', message: 'Catégorie invalide.' });

    let logoData = null;
    if (req.body?.logoData) {
      const checked = validateDataImage(req.body.logoData, MAX_APP_LOGO_SIZE);
      if (!checked.ok) return res.status(400).json({ error: 'INVALID_LOGO', message: checked.message || 'Logo invalide.' });
      logoData = checked.value;
    }

    if (id) {
      const target = data.apps.find(a => a.id === id);
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Application introuvable.' });
      target.name = name;
      target.description = description;
      target.url = url;
      target.categoryId = categoryId;
      target.order = order;
      if (logoData !== null) target.logoData = logoData;
      if (req.body?.removeLogo === true) target.logoData = '';
    } else {
      data.apps.push({ id: crypto.randomUUID(), name, description, url, categoryId, order, logoData: logoData || '' });
    }
    saveData(data);
    res.json({ ok: true });
  });

  router.delete('/admin/apps/:id', requireAdmin, (req, res) => {
    const data = loadData();
    if (!data.apps.some(a => a.id === req.params.id)) return res.status(404).json({ error: 'NOT_FOUND', message: 'Application introuvable.' });
    data.apps = data.apps.filter(a => a.id !== req.params.id);
    saveData(data);
    res.json({ ok: true });
  });

  router.post('/admin/appearance', requireAdmin, (req, res) => {
    const data = loadData();
    const incoming = req.body || {};
    const title = String(incoming.title || '').trim() || 'Portail ARGOS';
    const subtitle1 = String(incoming.subtitle1 || '').trim() || 'Police Municipale';
    const subtitle2 = String(incoming.subtitle2 || '').trim() || 'Chalon-sur-Saône';
    const eyebrow = String(incoming.eyebrow || '').trim() || 'ARGOS • Portail professionnel';
    const loginIntro = String(incoming.loginIntro || '').trim() || 'Portail d’accès aux applications et ressources professionnelles';
    const portalWelcome = String(incoming.portalWelcome || '').trim() || 'Sélectionnez une application pour l’ouvrir dans un nouvel onglet.';

    const loginLogoCheck = validateDataImage(incoming.loginLogoData || '', MAX_UI_IMAGE_SIZE);
    const portalLogoCheck = validateDataImage(incoming.portalLogoData || '', MAX_UI_IMAGE_SIZE);
    const loginBgCheck = validateDataImage(incoming.loginBackgroundData || '', MAX_UI_IMAGE_SIZE);
    const portalBgCheck = validateDataImage(incoming.portalBackgroundData || '', MAX_UI_IMAGE_SIZE);
    for (const check of [loginLogoCheck, portalLogoCheck, loginBgCheck, portalBgCheck]) {
      if (!check.ok) return res.status(400).json({ error: 'INVALID_IMAGE', message: check.message });
    }

    data.appearance = {
      ...data.appearance,
      title,
      subtitle1,
      subtitle2,
      eyebrow,
      loginIntro,
      portalWelcome
    };

    if (incoming.loginLogoData) data.appearance.loginLogoData = loginLogoCheck.value;
    if (incoming.portalLogoData) data.appearance.portalLogoData = portalLogoCheck.value;
    if (incoming.loginBackgroundData) data.appearance.loginBackgroundData = loginBgCheck.value;
    if (incoming.portalBackgroundData) data.appearance.portalBackgroundData = portalBgCheck.value;

    if (incoming.removeLoginLogo === true) data.appearance.loginLogoData = '';
    if (incoming.removePortalLogo === true) data.appearance.portalLogoData = '';
    if (incoming.removeLoginBackground === true) data.appearance.loginBackgroundData = '';
    if (incoming.removePortalBackground === true) data.appearance.portalBackgroundData = '';

    saveData(data);
    res.json({ ok: true, appearance: data.appearance });
  });

  app.use('/portail/api', router);
  app.get(/^\/portail$/, (req, res) => res.redirect(302, '/portail/'));
  app.use('/portail', express.static(PORTAL_DIR, {
    etag: true,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
      }
    }
  }));
  app.get('/portail/*', (req, res) => res.sendFile(path.join(PORTAL_DIR, 'index.html')));

  console.log(`[ARGOS] Disponible sur /portail/ — données: ${DB_FILE}`);
}

module.exports = { mountPortal };
