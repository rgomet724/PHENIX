'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_SIZE = 1024 * 1024;
const MAX_LOGO_SIZE = 400 * 1024;
const VERSION = '2.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

function resolveDataDir() {
  const requested = String(process.env.DATA_DIR || '').trim();
  const candidates = requested ? [requested] : [path.join(__dirname, 'data'), '/tmp/portail-pm-chalon'];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.write-test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch (err) {
      console.warn(`[storage] ${dir} indisponible: ${err.message}`);
    }
  }
  throw new Error('Aucun répertoire de données accessible en écriture.');
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'portal.json');
const ADMIN_LOGIN = String(process.env.PORTAL_ADMIN_LOGIN || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.PORTAL_ADMIN_PASSWORD || '');
const ADMIN_NAME = String(process.env.PORTAL_ADMIN_NAME || 'Administrateur').trim() || 'Administrateur';
const ENV_SECRET = String(process.env.SESSION_SECRET || '');
const TOKEN_SECRET = ENV_SECRET.length >= 32 ? ENV_SECRET : crypto.randomBytes(48).toString('base64url');

if (PROD && ENV_SECRET.length < 32) console.warn('[config] SESSION_SECRET absent ou trop court : secret temporaire généré pour ce démarrage.');
if (PROD && !ADMIN_PASSWORD) console.warn('[config] PORTAL_ADMIN_PASSWORD absent : le serveur démarre mais le compte admin Render ne pourra pas se connecter.');

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
        id: 'app-phenix',
        categoryId: 'cat-operationnel',
        name: 'PHENIX',
        description: 'Plateforme opérationnelle',
        url: 'https://VOTRE-LIEN-PHENIX.onrender.com',
        logoData: '',
        order: 10
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
    console.error('[storage] Lecture portal.json impossible:', err);
    return base;
  }
}

function saveData(data) {
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
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

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signToken(user) {
  const now = Date.now();
  const payload = b64urlJson({ sub: user.id, login: user.login, name: user.name, role: user.role, iat: now, exp: now + TOKEN_TTL_MS });
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
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function tokenFromRequest(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie).pm_portal_auth || '';
}

function currentUser(req) {
  return verifyToken(tokenFromRequest(req));
}

function isSecureRequest(req) {
  return PROD || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}

function authCookie(req, token) {
  const parts = [
    `pm_portal_auth=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(req) {
  const parts = ['pm_portal_auth=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function securityHeaders(extra = {}) {
  return {
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...extra
  };
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  }));
  res.end(body);
}

function sendText(res, status, text) {
  const body = String(text);
  res.writeHead(status, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }));
  res.end(body);
}

function requireLogin(req, res) {
  const user = currentUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'AUTH_REQUIRED', message: 'Authentification requise.' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireLogin(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'ADMIN_REQUIRED', message: 'Droits administrateur requis.' });
    return null;
  }
  return user;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(Object.assign(new Error('Requête trop volumineuse.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON invalide.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
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

const loginAttempts = new Map();
function loginAllowed(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 25;
  const state = loginAttempts.get(key);
  if (!state || state.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  state.count += 1;
  return state.count <= max;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveFile(req, res, pathname) {
  let relative = pathname === '/' ? '/index.html' : pathname;
  let filePath;
  try {
    relative = decodeURIComponent(relative);
    filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  } catch {
    return false;
  }
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const cache = ext === '.html' || ext === '.js' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=600';
  const headers = securityHeaders({ 'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'Cache-Control': cache });
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/healthz') {
    return sendJson(res, 200, {
      ok: true,
      service: 'portail-pm-chalon',
      version: VERSION,
      authMode: 'signed-token-cookie-and-bearer',
      adminConfigured: Boolean(ADMIN_PASSWORD),
      sessionSecretConfigured: ENV_SECRET.length >= 32,
      persistentDataConfigured: Boolean(process.env.DATA_DIR)
    });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    return sendJson(res, 200, { user: currentUser(req) || null });
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    if (!loginAllowed(req)) return sendJson(res, 429, { error: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    const body = await readJson(req);
    const login = String(body.login || '').trim();
    const loginNorm = login.toLocaleLowerCase('fr-FR');
    const password = String(body.password || '');
    if (!login || !password) return sendJson(res, 400, { error: 'MISSING_CREDENTIALS', message: 'Identifiant et mot de passe requis.' });

    let user = null;
    const envAdminMatches = loginNorm === ADMIN_LOGIN.toLocaleLowerCase('fr-FR');
    if (envAdminMatches) {
      if (!ADMIN_PASSWORD) return sendJson(res, 503, { error: 'ADMIN_NOT_CONFIGURED', message: 'Le compte administrateur Render n’est pas encore configuré.' });
      if (safeEqual(password, ADMIN_PASSWORD)) user = { id: 'env-admin', login: ADMIN_LOGIN, name: ADMIN_NAME, role: 'admin' };
    }

    if (!user && !envAdminMatches) {
      const data = loadData();
      const stored = data.users.find(u => String(u.login || '').toLocaleLowerCase('fr-FR') === loginNorm);
      if (stored && await verifyPassword(password, stored.passwordHash)) {
        user = { id: stored.id, login: stored.login, name: stored.name || stored.login, role: stored.role === 'admin' ? 'admin' : 'user' };
      }
    }

    if (!user) {
      console.warn(`[auth] Échec de connexion pour « ${login.replace(/[\r\n]/g, '')} ».`);
      return sendJson(res, 401, { error: 'BAD_CREDENTIALS', message: 'Identifiant ou mot de passe incorrect.' });
    }

    const token = signToken(user);
    console.log(`[auth] Connexion réussie: ${user.login} (${user.role}).`);
    return sendJson(res, 200, { ok: true, user, token }, { 'Set-Cookie': authCookie(req, token) });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(req) });
  }

  if (req.method === 'GET' && pathname === '/api/portal') {
    const user = requireLogin(req, res);
    if (!user) return;
    const data = loadData();
    const categories = [...data.categories].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name), 'fr'));
    const apps = [...data.apps].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name), 'fr'));
    return sendJson(res, 200, { categories, apps, user });
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    const user = requireAdmin(req, res);
    if (!user) return;
    const data = loadData();
    const users = [
      { id: 'env-admin', login: ADMIN_LOGIN, name: ADMIN_NAME, role: 'admin', protected: true, source: 'Render' },
      ...data.users.map(({ passwordHash, ...u }) => ({ ...u, protected: false, source: 'Portail' }))
    ];
    return sendJson(res, 200, { users });
  }

  if (req.method === 'POST' && pathname === '/api/admin/users') {
    const user = requireAdmin(req, res);
    if (!user) return;
    const body = await readJson(req);
    const data = loadData();
    const login = String(body.login || '').trim();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    const role = body.role === 'admin' ? 'admin' : 'user';
    if (!login || !name || password.length < 12) return sendJson(res, 400, { error: 'INVALID_USER', message: 'Nom, identifiant et mot de passe de 12 caractères minimum requis.' });
    const norm = login.toLocaleLowerCase('fr-FR');
    if (norm === ADMIN_LOGIN.toLocaleLowerCase('fr-FR') || data.users.some(u => String(u.login).toLocaleLowerCase('fr-FR') === norm)) {
      return sendJson(res, 409, { error: 'LOGIN_EXISTS', message: 'Cet identifiant est déjà utilisé.' });
    }
    data.users.push({ id: crypto.randomUUID(), login, name, role, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() });
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  let match = pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
  if (req.method === 'POST' && match) {
    const user = requireAdmin(req, res);
    if (!user) return;
    const id = decodeURIComponent(match[1]);
    if (id === 'env-admin') return sendJson(res, 400, { error: 'ENV_ADMIN', message: 'Le mot de passe du compte Render se modifie dans PORTAL_ADMIN_PASSWORD.' });
    const body = await readJson(req);
    const password = String(body.password || '');
    if (password.length < 12) return sendJson(res, 400, { error: 'WEAK_PASSWORD', message: '12 caractères minimum requis.' });
    const data = loadData();
    const target = data.users.find(u => u.id === id);
    if (!target) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Utilisateur introuvable.' });
    target.passwordHash = await hashPassword(password);
    target.passwordChangedAt = new Date().toISOString();
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  match = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === 'DELETE' && match) {
    const user = requireAdmin(req, res);
    if (!user) return;
    const id = decodeURIComponent(match[1]);
    if (id === 'env-admin') return sendJson(res, 400, { error: 'PROTECTED_USER', message: 'Le compte administrateur Render est protégé.' });
    if (id === user.id) return sendJson(res, 400, { error: 'SELF_DELETE', message: 'Vous ne pouvez pas supprimer votre propre compte.' });
    const data = loadData();
    if (!data.users.some(u => u.id === id)) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Utilisateur introuvable.' });
    data.users = data.users.filter(u => u.id !== id);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/categories') {
    const user = requireAdmin(req, res);
    if (!user) return;
    const body = await readJson(req);
    const data = loadData();
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    const order = Number.isFinite(Number(body.order)) ? Number(body.order) : 10;
    if (!name) return sendJson(res, 400, { error: 'NAME_REQUIRED', message: 'Le nom de la catégorie est requis.' });
    if (id) {
      const category = data.categories.find(c => c.id === id);
      if (!category) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Catégorie introuvable.' });
      category.name = name;
      category.order = order;
    } else {
      data.categories.push({ id: crypto.randomUUID(), name, order });
    }
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  match = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (req.method === 'DELETE' && match) {
    const user = requireAdmin(req, res);
    if (!user) return;
    const id = decodeURIComponent(match[1]);
    const data = loadData();
    if (!data.categories.some(c => c.id === id)) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Catégorie introuvable.' });
    data.categories = data.categories.filter(c => c.id !== id);
    data.apps = data.apps.filter(a => a.categoryId !== id);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/apps') {
    const user = requireAdmin(req, res);
    if (!user) return;
    const body = await readJson(req);
    const data = loadData();
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const url = String(body.url || '').trim();
    const categoryId = String(body.categoryId || '').trim();
    const order = Number.isFinite(Number(body.order)) ? Number(body.order) : 10;
    if (!name || !url || !categoryId) return sendJson(res, 400, { error: 'MISSING_FIELDS', message: 'Nom, lien et catégorie requis.' });
    if (!validHttpUrl(url)) return sendJson(res, 400, { error: 'INVALID_URL', message: 'Le lien doit commencer par http:// ou https://.' });
    if (!data.categories.some(c => c.id === categoryId)) return sendJson(res, 400, { error: 'INVALID_CATEGORY', message: 'Catégorie invalide.' });
    let logoData = null;
    if (body.logoData) {
      const validated = validateLogoData(body.logoData);
      if (!validated.ok) return sendJson(res, 400, { error: 'INVALID_LOGO', message: validated.message });
      logoData = validated.value;
    }
    if (id) {
      const target = data.apps.find(a => a.id === id);
      if (!target) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Application introuvable.' });
      target.name = name;
      target.description = description;
      target.url = url;
      target.categoryId = categoryId;
      target.order = order;
      if (logoData) target.logoData = logoData;
      if (body.removeLogo === true) target.logoData = '';
    } else {
      data.apps.push({ id: crypto.randomUUID(), categoryId, name, description, url, logoData: logoData || '', order });
    }
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  match = pathname.match(/^\/api\/admin\/apps\/([^/]+)$/);
  if (req.method === 'DELETE' && match) {
    const user = requireAdmin(req, res);
    if (!user) return;
    const id = decodeURIComponent(match[1]);
    const data = loadData();
    if (!data.apps.some(a => a.id === id)) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Application introuvable.' });
    data.apps = data.apps.filter(a => a.id !== id);
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Route API introuvable.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/healthz' || pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Méthode non autorisée.');
    if (serveFile(req, res, pathname)) return;
    if (serveFile(req, res, '/index.html')) return;
    sendText(res, 404, 'Introuvable.');
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) sendJson(res, err.statusCode || 500, { error: 'SERVER_ERROR', message: err.message || 'Erreur serveur.' });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Portail PM Chalon v${VERSION} démarré sur le port ${PORT}.`);
  console.log(`[storage] Données: ${DATA_DIR}${process.env.DATA_DIR ? ' (DATA_DIR configuré)' : ' (stockage local)'}.`);
  console.log(`[auth] Administrateur Render: ${ADMIN_LOGIN}; mot de passe ${ADMIN_PASSWORD ? 'configuré' : 'ABSENT'}.`);
});
