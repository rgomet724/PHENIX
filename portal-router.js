'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_LOGO_SIZE = 400 * 1024;
const VERSION = '2.1.0-combined';

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
      console.warn(`[PORTAIL] Stockage indisponible ${dir}: ${err.message}`);
    }
  }
  throw new Error('Aucun stockage disponible pour le portail.');
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => err ? reject(err) : resolve(key));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  try {
    const [algo, salt, hashHex] = String(encoded || '').split('$');
    if (algo !== 'scrypt' || !salt || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, salt);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function validateLogoData(value) {
  if (!value) return { ok: true, value: '' };
  const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(String(value));
  if (!match) return { ok: false, message: 'Format de logo non pris en charge.' };
  try {
    const decoded = Buffer.from(match[2], 'base64');
    if (decoded.length > MAX_LOGO_SIZE) return { ok: false, message: 'Le logo doit faire moins de 400 Ko.' };
    return { ok: true, value: String(value) };
  } catch {
    return { ok: false, message: 'Logo invalide.' };
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

function mountPortal(app) {
  const IS_PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  const ADMIN_LOGIN = String(process.env.PORTAL_ADMIN_LOGIN || 'admin').trim() || 'admin';
  const ADMIN_PASSWORD = String(process.env.PORTAL_ADMIN_PASSWORD || '');
  const ADMIN_NAME = String(process.env.PORTAL_ADMIN_NAME || 'Administrateur').trim() || 'Administrateur';
  const ENV_SECRET = String(process.env.SESSION_SECRET || '');
  const TOKEN_SECRET = ENV_SECRET.length >= 32 ? ENV_SECRET : crypto.randomBytes(48).toString('base64url');
  const PORTAL_DIR = path.join(__dirname, 'portail');
  const requestedDataDir = String(process.env.PORTAL_DATA_DIR || '').trim();
  const DATA_DIR = writableDir(requestedDataDir
    ? [requestedDataDir]
    : ['/var/data', path.join(__dirname, 'data'), '/tmp/portail-pm-chalon']);
  const DB_FILE = path.join(DATA_DIR, 'portal.json');

  if (IS_PROD && ENV_SECRET.length < 32) console.warn('[PORTAIL] SESSION_SECRET absent ou trop court : jetons invalidés au redémarrage.');
  if (IS_PROD && !ADMIN_PASSWORD) console.warn('[PORTAIL] PORTAL_ADMIN_PASSWORD absent : connexion admin indisponible.');

  function defaultData() {
    return {
      schemaVersion: 2,
      users: [],
      categories: [
        { id: 'cat-operationnel', name: 'Opérationnel', order: 10 },
        { id: 'cat-outils', name: 'Outils et applications', order: 20 },
        { id: 'cat-documentation', name: 'Documentation', order: 30 }
      ],
      apps: [
        {
          id: 'app-phenix', categoryId: 'cat-operationnel', name: 'PHENIX',
          description: 'Plateforme opérationnelle', url: '/', logoData: '', order: 10
        }
      ]
    };
  }

  function loadData() {
    const base = defaultData();
    try {
      if (!fs.existsSync(DB_FILE)) return base;
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return {
        schemaVersion: 2,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        categories: Array.isArray(parsed.categories) ? parsed.categories : base.categories,
        apps: Array.isArray(parsed.apps) ? parsed.apps : base.apps
      };
    } catch (err) {
      console.error('[PORTAIL] Lecture portal.json impossible:', err.message);
      return base;
    }
  }

  function saveData(data) {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, DB_FILE);
  }

  function signToken(user) {
    const now = Date.now();
    const payload = Buffer.from(JSON.stringify({
      sub: user.id, login: user.login, name: user.name, role: user.role,
      iat: now, exp: now + TOKEN_TTL_MS
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
      return { id: parsed.sub, login: parsed.login, name: parsed.name || parsed.login, role: parsed.role === 'admin' ? 'admin' : 'user' };
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
      if (key) {
        try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
      }
    }
    return out;
  }

  function tokenFromRequest(req) {
    const auth = String(req.headers.authorization || '');
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return parseCookies(req.headers.cookie).pm_portal_auth || '';
  }

  function currentUser(req) { return verifyToken(tokenFromRequest(req)); }
  function isSecure(req) { return IS_PROD || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https'; }
  function cookie(req, token, maxAge = Math.floor(TOKEN_TTL_MS / 1000)) {
    const parts = [`pm_portal_auth=${encodeURIComponent(token)}`, 'Path=/portail', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
    if (isSecure(req)) parts.push('Secure');
    return parts.join('; ');
  }

  function requireLogin(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authentification requise.' });
    req.portalUser = user;
    next();
  }

  function requireAdmin(req, res, next) {
    requireLogin(req, res, () => {
      if (req.portalUser.role !== 'admin') return res.status(403).json({ error: 'ADMIN_REQUIRED', message: 'Droits administrateur requis.' });
      next();
    });
  }

  const attempts = new Map();
  function loginAllowed(req) {
    const key = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const now = Date.now(), windowMs = 15 * 60 * 1000, max = 25;
    const state = attempts.get(key);
    if (!state || state.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    state.count += 1;
    return state.count <= max;
  }

  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    next();
  });

  router.get('/healthz', (req, res) => res.json({
    ok: true,
    service: 'portail-pm-chalon',
    version: VERSION,
    adminConfigured: Boolean(ADMIN_PASSWORD),
    sessionSecretConfigured: ENV_SECRET.length >= 32,
    dataFile: DB_FILE
  }));

  router.get('/me', (req, res) => res.json({ user: currentUser(req) || null }));

  router.post('/login', async (req, res, next) => {
    try {
      if (!loginAllowed(req)) return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
      const login = String(req.body?.login || '').trim();
      const password = String(req.body?.password || '');
      if (!login || !password) return res.status(400).json({ error: 'MISSING_CREDENTIALS', message: 'Identifiant et mot de passe requis.' });
      const loginNorm = login.toLocaleLowerCase('fr-FR');
      const envAdminMatches = loginNorm === ADMIN_LOGIN.toLocaleLowerCase('fr-FR');
      let user = null;
      if (envAdminMatches && ADMIN_PASSWORD && safeEqual(password, ADMIN_PASSWORD)) {
        user = { id: 'env-admin', login: ADMIN_LOGIN, name: ADMIN_NAME, role: 'admin' };
      }
      if (!user && !envAdminMatches) {
        const data = loadData();
        const stored = data.users.find(u => String(u.login || '').toLocaleLowerCase('fr-FR') === loginNorm);
        if (stored && await verifyPassword(password, stored.passwordHash)) {
          user = { id: stored.id, login: stored.login, name: stored.name || stored.login, role: stored.role === 'admin' ? 'admin' : 'user' };
        }
      }
      if (!user) return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'Identifiant ou mot de passe incorrect.' });
      const token = signToken(user);
      console.log(`[PORTAIL] Connexion réussie: ${user.login} (${user.role})`);
      res.set('Set-Cookie', cookie(req, token));
      res.json({ ok: true, user, token });
    } catch (err) { next(err); }
  });

  router.post('/logout', (req, res) => {
    res.set('Set-Cookie', cookie(req, '', 0));
    res.json({ ok: true });
  });

  router.get('/portal', requireLogin, (req, res) => {
    const data = loadData();
    const categories = [...data.categories].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name), 'fr'));
    const apps = [...data.apps].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name), 'fr'));
    res.json({ categories, apps, user: req.portalUser });
  });

  router.get('/admin/users', requireAdmin, (req, res) => {
    const data = loadData();
    res.json({ users: [
      { id: 'env-admin', login: ADMIN_LOGIN, name: ADMIN_NAME, role: 'admin', protected: true, source: 'Render' },
      ...data.users.map(({ passwordHash, ...u }) => ({ ...u, protected: false, source: 'Portail' }))
    ] });
  });

  router.post('/admin/users', requireAdmin, async (req, res, next) => {
    try {
      const data = loadData();
      const login = String(req.body?.login || '').trim();
      const name = String(req.body?.name || '').trim();
      const password = String(req.body?.password || '');
      const role = req.body?.role === 'admin' ? 'admin' : 'user';
      if (!login || !name || password.length < 12) return res.status(400).json({ error: 'INVALID_USER', message: 'Nom, identifiant et mot de passe de 12 caractères minimum requis.' });
      const norm = login.toLocaleLowerCase('fr-FR');
      if (norm === ADMIN_LOGIN.toLocaleLowerCase('fr-FR') || data.users.some(u => String(u.login).toLocaleLowerCase('fr-FR') === norm)) {
        return res.status(409).json({ error: 'LOGIN_EXISTS', message: 'Cet identifiant est déjà utilisé.' });
      }
      data.users.push({ id: crypto.randomUUID(), login, name, role, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() });
      saveData(data);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.post('/admin/users/:id/password', requireAdmin, async (req, res, next) => {
    try {
      if (req.params.id === 'env-admin') return res.status(400).json({ error: 'ENV_ADMIN', message: 'Le mot de passe du compte Render se modifie dans PORTAL_ADMIN_PASSWORD.' });
      const password = String(req.body?.password || '');
      if (password.length < 12) return res.status(400).json({ error: 'WEAK_PASSWORD', message: '12 caractères minimum requis.' });
      const data = loadData();
      const target = data.users.find(u => u.id === req.params.id);
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable.' });
      target.passwordHash = await hashPassword(password);
      target.passwordChangedAt = new Date().toISOString();
      saveData(data);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.delete('/admin/users/:id', requireAdmin, (req, res) => {
    if (req.params.id === 'env-admin') return res.status(400).json({ error: 'PROTECTED_USER', message: 'Le compte administrateur Render est protégé.' });
    const data = loadData();
    if (!data.users.some(u => u.id === req.params.id)) return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable.' });
    data.users = data.users.filter(u => u.id !== req.params.id);
    saveData(data);
    res.json({ ok: true });
  });

  router.post('/admin/categories', requireAdmin, (req, res) => {
    const data = loadData();
    const id = String(req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const order = Number.isFinite(Number(req.body?.order)) ? Number(req.body.order) : 10;
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Le nom de la catégorie est requis.' });
    if (id) {
      const category = data.categories.find(c => c.id === id);
      if (!category) return res.status(404).json({ error: 'NOT_FOUND', message: 'Catégorie introuvable.' });
      category.name = name; category.order = order;
    } else data.categories.push({ id: crypto.randomUUID(), name, order });
    saveData(data); res.json({ ok: true });
  });

  router.delete('/admin/categories/:id', requireAdmin, (req, res) => {
    const data = loadData();
    if (!data.categories.some(c => c.id === req.params.id)) return res.status(404).json({ error: 'NOT_FOUND', message: 'Catégorie introuvable.' });
    data.categories = data.categories.filter(c => c.id !== req.params.id);
    data.apps = data.apps.filter(a => a.categoryId !== req.params.id);
    saveData(data); res.json({ ok: true });
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
      const validated = validateLogoData(req.body.logoData);
      if (!validated.ok) return res.status(400).json({ error: 'INVALID_LOGO', message: validated.message });
      logoData = validated.value;
    }
    if (id) {
      const target = data.apps.find(a => a.id === id);
      if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Application introuvable.' });
      Object.assign(target, { name, description, url, categoryId, order });
      if (logoData) target.logoData = logoData;
      if (req.body?.removeLogo === true) target.logoData = '';
    } else data.apps.push({ id: crypto.randomUUID(), categoryId, name, description, url, logoData: logoData || '', order });
    saveData(data); res.json({ ok: true });
  });

  router.delete('/admin/apps/:id', requireAdmin, (req, res) => {
    const data = loadData();
    if (!data.apps.some(a => a.id === req.params.id)) return res.status(404).json({ error: 'NOT_FOUND', message: 'Application introuvable.' });
    data.apps = data.apps.filter(a => a.id !== req.params.id);
    saveData(data); res.json({ ok: true });
  });

  app.use('/portail/api', router);
  app.get('/portail', (req, res) => res.redirect(302, '/portail/'));
  app.use('/portail', express.static(PORTAL_DIR, {
    etag: true,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html') || filePath.endsWith('.js')) res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
  }));
  app.get('/portail/*', (req, res) => res.sendFile(path.join(PORTAL_DIR, 'index.html')));

  console.log(`[PORTAIL] Disponible sur /portail/ — données: ${DB_FILE}`);
}

module.exports = { mountPortal };
