'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { appAccess, appearanceFor, normalizedRole, passwordMinLength } = require('./central-config');
const { migrateDashboard } = require('./dashboard/pages');

const KINDS = new Set(['news', 'meetings', 'text', 'image', 'links', 'duty']);
const FONTS = new Set(['system', 'serif', 'rounded', 'mono']);
const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
const MEDIA_NAME = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, fallback = '') => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value.toLowerCase() : fallback;
const number = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback;
const uuid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : crypto.randomUUID();

function newBlock(kind, title, width) {
  return { id: crypto.randomUUID(), kind, title, width, minHeight: 240, hidden: false, background: '#ffffff', color: '#193b4d', fontSize: 16, align: 'left', bold: false, italic: false, body: '', image: '', caption: '', items: [] };
}

function initialData() {
  const news = newBlock('news', 'Vie du service', 8);
  news.minHeight = 360;
  news.width = 6;
  const meetings = newBlock('meetings', 'Prochaines réunions', 4);
  meetings.minHeight = 260;
  meetings.width = 6;
  const information = newBlock('text', 'Informations utiles', 3);
  information.body = '';
  information.background = '#e8f2ed';
  const links = newBlock('links', 'Vos accès utiles', 4);
  links.items = [{ id: crypto.randomUUID(), label: 'Portail ARGOS', url: '/' }, { id: crypto.randomUUID(), label: 'PHENIX', url: '/phenix/' }];
  return migrateDashboard({
    schemaVersion: 1, revision: 1,
    settings: { title: '', subtitle: '', accent: '', background: '', font: 'system', logo: '', backgroundImage: '', columns: 12, showClock: true, displaySeconds: 20 },
    duty: { label: 'ASTREINTE DIRECTION', name: '', phone: '', note: '' },
    blocks: [news, meetings, information, links], posts: [], audit: [], updatedAt: '', updatedBy: null
  });
}

function safeLink(value) {
  const raw = text(value, 1500);
  if (/^\/(?!\/)/.test(raw) && !/[\\\u0000-\u0020]/.test(raw)) return raw;
  try { const url = new URL(raw); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* rejected below */ }
  fail(400, 'Utilisez une adresse https://, http:// ou un chemin commençant par /.');
}

function validDate(value) {
  const raw = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw) || !Number.isFinite(Date.parse(raw))) fail(400, 'Date de réunion invalide.');
  const canonical = new Date(raw).toISOString();
  if (canonical.slice(0, 19) !== raw.slice(0, 19)) fail(400, 'La date de réunion n’existe pas dans le calendrier.');
  return canonical;
}

function mountDashboard(app, deps = {}) {
  if (typeof deps.loadPhenix !== 'function') throw new Error('DASHBOARD : loadPhenix requis.');
  const dataDir = process.env.DASHBOARD_DATA_DIR || process.env.PORTAL_DATA_DIR || path.dirname(process.env.PHENIX_DATA_FILE || '/var/data/data.json');
  const filename = deps.dataFile || path.join(dataDir, 'dashboard.json');
  const mediaDir = path.join(path.dirname(filename), 'dashboard-media');
  const staticDir = path.join(__dirname, 'dashboard');
  const seed = initialData();
  const users = () => deps.loadPhenix().users || [];
  const access = user => appAccess(user, 'dashboard');
  const canEdit = user => ['admin', 'superviseur'].includes(normalizedRole(user.role)) && ['admin', 'superviseur'].includes(access(user).role);
  const actor = user => ({ id: String(user.id), name: String(user.displayName || user.login).slice(0, 120) });
  const identity = user => ({ ...actor(user), role: access(user).role, canEdit: canEdit(user), centralAdmin: normalizedRole(user.role) === 'admin' });
  const api = express.Router();

  function load() {
    if (!fs.existsSync(filename)) return structuredClone(seed);
    try {
      const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (![1, 2].includes(data.schemaVersion) || !Number.isInteger(data.revision) || !Array.isArray(data.blocks) || !Array.isArray(data.posts) || !data.settings || !data.duty) throw new Error('Structure invalide');
      if (data.schemaVersion === 2 && (!Array.isArray(data.pages) || !data.pages.length)) throw new Error('Pages invalides');
      // Retire uniquement les textes fournis par l’ancien modèle, en conservant les contenus personnalisés.
      if (data.settings.subtitle === 'Le point de rencontre de vos équipes') data.settings.subtitle = '';
      for (const block of data.blocks) {
        if (block.kind === 'text' && block.body === 'Un espace pour les informations utiles, les consignes du quotidien et les nouvelles de votre service.') block.body = '';
      }
      return migrateDashboard(data);
    } catch (error) {
      console.error('[DASHBOARD] Lecture impossible :', error.message);
      fail(503, 'Le dashboard est temporairement indisponible. Les données existantes ont été conservées.');
    }
  }

  function persist(data, req, action) {
    const now = new Date().toISOString();
    data.revision++;
    data.updatedAt = now;
    data.updatedBy = actor(req.dashboardUser);
    data.audit = [{ at: now, userId: req.dashboardUser.id, name: data.updatedBy.name, action }, ...(data.audit || [])].slice(0, 1000);
    const tmp = `${filename}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      if (fs.existsSync(filename)) fs.copyFileSync(filename, `${filename}.backup`);
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, filename);
    } catch (error) {
      console.error('[DASHBOARD] Sauvegarde impossible :', error.message);
      fail(503, 'L’enregistrement a échoué. Réessayez avant de quitter la page.');
    }
  }

  function authenticate(req, res, next) {
    const user = users().find(item => String(item.id) === String(req.session?.userId || ''));
    if (!user) return res.status(401).json({ error: 'Connectez-vous au Dashboard.', code: 'AUTH_REQUIRED' });
    if (!access(user).enabled) return res.status(403).json({ error: 'Votre accès au Dashboard est désactivé. Contactez un administrateur.', code: 'ACCESS_DISABLED' });
    if (deps.passwordExpired?.(user)) return res.status(428).json({ error: 'Renouvelez votre mot de passe depuis l’écran de connexion du Dashboard.', code: 'PASSWORD_CHANGE_REQUIRED' });
    req.dashboardUser = user;
    next();
  }

  function editor(req, res, next) {
    if (!canEdit(req.dashboardUser)) return res.status(403).json({ error: 'La modification est réservée aux superviseurs et administrateurs.' });
    next();
  }

  function checkedData(req) {
    const data = load();
    if (!Number.isInteger(req.body?.revision) || req.body.revision !== data.revision) fail(409, 'Le dashboard a été modifié depuis un autre poste. Rechargez la dernière version avant de recommencer.');
    return data;
  }

  function media(value) {
    const raw = text(value, 200);
    if (!raw) return '';
    const prefix = '/dashboard/media/';
    if (!raw.startsWith(prefix) || !MEDIA_NAME.test(raw.slice(prefix.length)) || !fs.existsSync(path.join(mediaDir, raw.slice(prefix.length)))) fail(400, 'Cette photo n’est plus disponible. Importez-la de nouveau.');
    return raw;
  }

  function cleanBlock(input, seen, pages, previous) {
    if (!input || !KINDS.has(input.kind)) fail(400, 'Type de bloc invalide.');
    const id = uuid(input.id);
    if (seen.has(id)) fail(400, 'Deux blocs ont le même identifiant.');
    seen.add(id);
    const pageId = input.pageId === undefined ? previous?.pageId || pages[0].id : text(input.pageId, 80);
    if (!pages.some(page => page.id === pageId)) fail(400, 'Un bloc est associé à une page inexistante.');
    const block = {
      id, kind: input.kind, pageId, title: text(input.title, 120, 'Sans titre'),
      width: [3, 4, 6, 8, 9, 12].includes(input.width) ? input.width : 4,
      minHeight: number(input.minHeight, 160, 1200, 240), hidden: input.hidden === true,
      background: color(input.background, '#ffffff'), color: color(input.color, '#193b4d'),
      fontSize: number(input.fontSize, 12, 60, 16), align: ['left', 'center', 'right'].includes(input.align) ? input.align : 'left',
      bold: input.bold === true, italic: input.italic === true,
      fixedHeight: typeof input.fixedHeight === 'boolean' ? input.fixedHeight : ['news', 'image'].includes(input.kind),
      newsLimit: number(input.newsLimit, 1, 5, 1), imageHeight: number(input.imageHeight, 0, 600, 120),
      imageWidth: number(input.imageWidth, 25, 100, 100), imageFit: input.imageFit === 'cover' ? 'cover' : 'contain',
      postId: text(input.postId, 80),
      body: text(input.body, 15000), image: media(input.image), caption: text(input.caption, 500), items: []
    };
    if (!Array.isArray(input.items) || input.items.length > 100) fail(400, 'Un bloc peut contenir au maximum 100 éléments.');
    if (block.kind === 'meetings') block.items = input.items.map(item => {
      if (!item || !text(item.title, 160)) fail(400, 'Le titre de la réunion est obligatoire.');
      const start = validDate(item.start), end = item.end ? validDate(item.end) : '';
      if (end && Date.parse(end) <= Date.parse(start)) fail(400, 'La réunion doit se terminer après son début.');
      return { id: uuid(item.id), title: text(item.title, 160), start, end, location: text(item.location, 300), description: text(item.description, 2000), url: item.url ? safeLink(item.url) : '' };
    });
    if (block.kind === 'links') block.items = input.items.map(item => {
      if (!item || !text(item.label, 120)) fail(400, 'Le nom du lien est obligatoire.');
      return { id: uuid(item.id), label: text(item.label, 120), url: safeLink(item.url) };
    });
    return block;
  }

  const wrap = handler => (req, res, next) => { try { handler(req, res, next); } catch (error) { next(error); } };
  const csrf = req => {
    const given = Buffer.from(String(req.get('x-csrf-token') || ''));
    const expected = Buffer.from(String(req.session.csrfToken || ''));
    return expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  };
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin')) {
      try { if (new URL(req.get('origin')).host !== req.get('host')) return res.status(403).json({ error: 'Origine refusée.' }); }
      catch { return res.status(403).json({ error: 'Origine refusée.' }); }
    }
    next();
  });
  const credentialLimiter = rateLimit({ windowMs: 15 * 60000, limit: 8, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => `${ipKeyGenerator(req.ip)}:${text(req.body?.login, 80).toLowerCase()}`, message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
  });
  api.post('/password', credentialLimiter, wrap((req, res) => {
    const data = deps.loadPhenix(), login = text(req.body?.login, 80), oldPassword = req.body?.oldPassword, nextPassword = req.body?.newPassword;
    const user = (data.users || []).find(item => String(item.login).toLocaleLowerCase('fr') === login.toLocaleLowerCase('fr'));
    if (!user || typeof oldPassword !== 'string' || Buffer.byteLength(oldPassword) > 72 || !user.passwordHash || !bcrypt.compareSync(oldPassword, user.passwordHash)) return res.status(401).json({ error: 'Identifiant ou ancien mot de passe incorrect.' });
    if (!access(user).enabled) return res.status(403).json({ error: 'Votre accès au Dashboard est désactivé.' });
    if (typeof nextPassword !== 'string' || nextPassword.length < passwordMinLength() || Buffer.byteLength(nextPassword) > 72 || nextPassword === oldPassword) fail(400, `Choisissez un nouveau mot de passe différent, d’au moins ${passwordMinLength()} caractères et de 72 octets maximum.`);
    if (typeof deps.savePhenix !== 'function') fail(503, 'Le renouvellement de mot de passe est momentanément indisponible.');
    user.passwordHash = bcrypt.hashSync(nextPassword, 12); user.passwordChangedAt = new Date().toISOString(); user.mustChangePassword = false;
    data.logs = [{ id: crypto.randomUUID(), date: new Date().toISOString(), userId: user.id, user: user.displayName || user.login, type: 'Sécurité / comptes', msg: 'Modification du mot de passe depuis le Dashboard', route: '/dashboard/api/password' }, ...(data.logs || [])].slice(0, 10000);
    deps.savePhenix(data);
    res.json({ ok: true });
  }));
  api.post('/login', credentialLimiter, wrap((req, res, next) => {
    const login = text(req.body?.login, 80), password = req.body?.password;
    const user = users().find(item => String(item.login).toLocaleLowerCase('fr') === login.toLocaleLowerCase('fr'));
    if (!user || typeof password !== 'string' || Buffer.byteLength(password) > 72 || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    if (!access(user).enabled) return res.status(403).json({ error: 'Votre accès au Dashboard est désactivé. Contactez un administrateur.' });
    if (deps.passwordExpired?.(user)) return res.status(428).json({ error: 'Votre mot de passe doit être renouvelé. Utilisez « Renouveler mon mot de passe » sous le formulaire.' });
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      req.session.save(error => error ? next(error) : res.json({ user: identity(user), csrfToken: req.session.csrfToken }));
    });
  }));
  api.use(authenticate);
  api.use((req, res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !csrf(req)) return res.status(403).json({ error: 'La session de sécurité a changé. Rechargez la page.' });
    next();
  });
  api.use(rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Trop de requêtes. Réessayez dans une minute.' } }));
  api.get('/state', wrap((req, res) => {
    const data = load();
    const { audit, ...dashboard } = data;
    res.json({ dashboard, user: identity(req.dashboardUser), csrfToken: req.session.csrfToken, appearance: appearanceFor('dashboard') });
  }));
  api.post('/logout', (req, res, next) => req.session.destroy(error => error ? next(error) : res.json({ ok: true })));
  api.put('/board', editor, wrap((req, res) => {
    const data = checkedData(req), input = req.body;
    if (!input.settings || !input.duty || !Array.isArray(input.blocks) || input.blocks.length > 120) fail(400, 'Le dashboard peut contenir au maximum 120 blocs.');
    const rawPages = input.pages === undefined ? data.pages : input.pages;
    if (!Array.isArray(rawPages) || !rawPages.length || rawPages.length > 20) fail(400, 'Le dashboard doit contenir de 1 à 20 pages.');
    const pageIds = new Set();
    const pages = rawPages.map(page => {
      const id = uuid(page?.id), title = text(page?.title, 80);
      if (!title || pageIds.has(id)) fail(400, 'Chaque page doit avoir un nom et un identifiant unique.');
      pageIds.add(id); return { id, title };
    });
    const settings = input.settings, duty = input.duty, seen = new Set();
    data.settings = {
      title: text(settings.title, 120), subtitle: text(settings.subtitle, 240),
      accent: color(settings.accent, '#16877b'), background: color(settings.background, '#f3f5f3'),
      font: FONTS.has(settings.font) ? settings.font : 'system', logo: media(settings.logo), backgroundImage: media(settings.backgroundImage),
      columns: 12, showClock: settings.showClock !== false, displaySeconds: number(settings.displaySeconds, 8, 120, 20), pageSeconds: 60
    };
    data.duty = { label: text(duty.label, 80, 'ASTREINTE DIRECTION'), name: text(duty.name, 160), phone: text(duty.phone, 60), note: text(duty.note, 500) };
    const oldBlocks = data.blocks;
    data.pages = pages;
    data.blocks = input.blocks.map(block => cleanBlock(block, seen, pages, oldBlocks.find(old => old.id === block?.id)));
    persist(data, req, 'Modification de la page et de l’astreinte');
    res.json({ dashboard: { ...data, audit: undefined } });
  }));

  function cleanPost(input) {
    const title = text(input.title, 180), body = text(input.body, 10000);
    if (!title) fail(400, 'Le titre de la publication est obligatoire.');
    if (!body && !input.image) fail(400, 'Ajoutez du texte ou une photo à votre publication.');
    return { title, body, image: media(input.image), pinned: input.pinned === true };
  }
  api.post('/posts', editor, wrap((req, res) => {
    const data = checkedData(req);
    if (data.posts.length >= 500) fail(400, 'La limite de 500 publications est atteinte. Supprimez des publications anciennes.');
    const post = { ...cleanPost(req.body), id: crypto.randomUUID(), createdBy: actor(req.dashboardUser), createdAt: new Date().toISOString(), updatedAt: '', updatedBy: null };
    data.posts.unshift(post);
    persist(data, req, 'Création d’une publication');
    res.status(201).json({ post, revision: data.revision });
  }));
  api.put('/posts/:id', editor, wrap((req, res) => {
    const data = checkedData(req), post = data.posts.find(item => item.id === req.params.id);
    if (!post) fail(404, 'Publication introuvable.');
    Object.assign(post, cleanPost(req.body), { updatedAt: new Date().toISOString(), updatedBy: actor(req.dashboardUser) });
    persist(data, req, 'Modification d’une publication');
    res.json({ post, revision: data.revision });
  }));
  api.delete('/posts/:id', editor, wrap((req, res) => {
    const data = checkedData(req), index = data.posts.findIndex(item => item.id === req.params.id);
    if (index < 0) fail(404, 'Publication introuvable.');
    data.posts.splice(index, 1);
    persist(data, req, 'Suppression d’une publication');
    res.json({ ok: true, revision: data.revision });
  }));
  api.post('/media', editor, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_MEDIA_BYTES }), wrap((req, res) => {
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > MAX_MEDIA_BYTES) fail(400, 'Photo invalide. Formats acceptés : JPEG, PNG et WebP, 2 Mo maximum.');
    let extension;
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = 'png';
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg';
    else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
    if (!extension) fail(400, 'Le contenu du fichier n’est pas une photo JPEG, PNG ou WebP.');
    fs.mkdirSync(mediaDir, { recursive: true });
    const files = fs.readdirSync(mediaDir).filter(name => MEDIA_NAME.test(name));
    if (files.length >= 1000 || files.reduce((sum, name) => sum + fs.statSync(path.join(mediaDir, name)).size, 0) + bytes.length > 200 * 1024 * 1024) fail(507, 'L’espace photo du Dashboard est plein. Contactez un administrateur.');
    const name = `${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(mediaDir, name), bytes, { mode: 0o600, flag: 'wx' });
    res.status(201).json({ url: `/dashboard/media/${name}` });
  }));
  api.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.status >= 400 && error.status < 600) return res.status(error.status).json({ error: error.type === 'entity.too.large' ? 'Le fichier est trop volumineux.' : error.message });
    console.error('[DASHBOARD]', error.message);
    res.status(500).json({ error: 'Une erreur est survenue dans le Dashboard.' });
  });
  app.use('/dashboard/api', api);
  app.get('/dashboard/media/:file', authenticate, wrap((req, res, next) => {
    if (!MEDIA_NAME.test(req.params.file)) return res.sendStatus(404);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.sendFile(path.join(mediaDir, req.params.file), error => error ? (error.status === 404 ? res.sendStatus(404) : next(error)) : undefined);
  }));
  app.get(/^\/dashboard$/, (req, res) => res.redirect(302, `/dashboard/${req.originalUrl.slice(req.path.length)}`));
  app.use('/dashboard', express.static(staticDir, { maxAge: 0, setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));
}

module.exports = { mountDashboard, initialData, safeLink };
