'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { DateTime } = require('luxon');
const { computeDeleteAt } = require('./lib/expiry');
const { isStoredPdfName, optimizePdf } = require('./lib/pdf-storage');
const { ArretesStore, normalize } = require('./lib/store');
const { StreetsRepository } = require('./lib/streets');

const PREFIX = '/arretes';
const COOKIE_NAME = 'argos_arretes_auth';
const VERSION = '1.1.0-pegase2';

function mountArretes(app, auth) {
  if (!auth || typeof auth.consumeSsoToken !== 'function' || typeof auth.issueSessionToken !== 'function' || typeof auth.verifySessionToken !== 'function') {
    throw new Error('Le raccordement ARGOS des arrêtés est incomplet');
  }

  const rootDir = __dirname;
  const publicDir = path.join(rootDir, 'public');
  const dataDir = path.resolve(process.env.ARRETES_DATA_DIR || '/var/data/arretes');
  const store = new ArretesStore(dataDir);
  const streets = new StreetsRepository(dataDir, path.join(rootDir, 'data', 'streets.seed.json'));
  const router = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, store.uploadsDir),
      filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.pdf`),
    }),
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (file.mimetype !== 'application/pdf') return callback(new Error('La pièce jointe doit être un PDF'));
      callback(null, true);
    },
  });

  const ready = initialize();

  router.get('/healthz', async (_req, res) => {
    try {
      await ready;
      const availableStreets = await streets.list();
      res.json({ ok: true, service: 'argos-arretes-municipaux', version: VERSION, streets: availableStreets.length });
    } catch {
      res.status(503).json({ ok: false, service: 'argos-arretes-municipaux' });
    }
  });

  router.use(async (_req, _res, next) => {
    try {
      await ready;
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/sso/consume', (req, res) => {
    try {
      const user = auth.consumeSsoToken(String(req.query.token || ''));
      if (!user) throw new Error('Jeton ARGOS invalide');
      setCookie(req, res, auth.issueSessionToken(user));
      res.redirect(303, `${PREFIX}/`);
    } catch {
      res.status(403).sendFile('access-denied.html', { root: publicDir });
    }
  });

  router.get('/auth/logout', (req, res) => {
    clearCookie(req, res);
    res.redirect(303, '/portail/');
  });

  router.get('/assets/styles.css', (_req, res) => res.sendFile('styles.css', { root: publicDir, maxAge: '1h' }));
  router.get('/assets/app.js', (_req, res) => res.sendFile('app.js', { root: publicDir, maxAge: '1h' }));
  router.get('/', requireAuth, (_req, res) => res.sendFile('index.html', { root: publicDir }));

  router.use('/api', requireAuth, requireCsrf);

  router.get('/api/me', (req, res) => {
    res.json({
      user: {
        login: req.arretesUser.login,
        name: req.arretesUser.name,
        role: req.arretesUser.role,
        admin: req.arretesUser.role === 'admin',
      },
      csrfToken: csrfTokenFor(req.arretesSessionToken),
    });
  });

  router.get('/api/streets', async (_req, res, next) => {
    try {
      const [items, metadata] = await Promise.all([streets.list(), streets.metadata()]);
      res.json({ streets: items, metadata });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/admin/streets/refresh', requireAdmin, async (_req, res, next) => {
    try {
      const items = await streets.refreshFromBan();
      res.json({ ok: true, count: items.length });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/admin/streets', requireAdmin, async (req, res, next) => {
    try {
      const street = await streets.add(req.body.name);
      res.status(201).json({ street });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/arretes', async (req, res, next) => {
    try {
      await store.purgeExpired();
      const records = await store.list({
        q: req.query.q,
        street: req.query.street,
        from: req.query.from,
        to: req.query.to,
        status: req.query.status,
      });
      res.json({ records, count: records.length });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/arretes', upload.single('attachment'), async (req, res, next) => {
    let uploadedPath = req.file?.path;
    try {
      const input = validateRecordInput(req.body, req.file);
      const knownStreets = new Set((await streets.list()).map(normalize));
      if (input.streets.some((street) => !knownStreets.has(normalize(street)))) {
        throw badRequest('Une voie sélectionnée ne figure plus dans le référentiel. Rechargez la page.');
      }
      if (!(await isPdfFile(uploadedPath))) throw new Error('Le fichier transmis n’est pas un PDF valide');
      const optimized = await optimizePdf(uploadedPath);
      uploadedPath = optimized.path;
      const record = await store.create({
        ...input,
        attachment: {
          storedName: optimized.storedName,
          originalName: sanitizeFilename(req.file.originalname),
          originalSize: optimized.originalSize,
          size: optimized.storedSize,
          savedBytes: optimized.savedBytes,
          encoding: optimized.encoding,
          optimized: true,
          mimeType: 'application/pdf',
        },
        createdBy: { login: req.arretesUser.login, name: req.arretesUser.name },
      });
      uploadedPath = null;
      res.status(201).json({ record });
    } catch (error) {
      if (uploadedPath) await fs.unlink(uploadedPath).catch(() => {});
      next(error);
    }
  });

  router.get('/api/arretes/:id/piece-jointe', async (req, res, next) => {
    try {
      const record = await store.findById(req.params.id);
      if (!record?.attachment?.storedName) return res.status(404).json({ error: 'Pièce jointe introuvable' });
      if (!isStoredPdfName(record.attachment.storedName)) throw new Error('Nom de fichier invalide');
      const storedPath = path.join(store.uploadsDir, record.attachment.storedName);
      await fs.access(storedPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${asciiFilename(record.attachment.originalName)}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      if (record.attachment.encoding === 'gzip' || record.attachment.storedName.endsWith('.gz')) res.setHeader('Content-Encoding', 'gzip');
      res.sendFile(record.attachment.storedName, { root: store.uploadsDir });
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({ error: 'Pièce jointe introuvable' });
      next(error);
    }
  });

  router.delete('/api/arretes/:id', requireAdmin, async (req, res, next) => {
    try {
      const deleted = await store.deleteById(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Arrêté introuvable' });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    console.error('[ARRETES]', error && error.stack ? error.stack : error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Le PDF dépasse la limite de 15 Mo' });
    }
    const publicMessages = [
      'La pièce jointe doit être un PDF',
      'Le fichier transmis n’est pas un PDF valide',
      'Nom de voie invalide',
      'Date de fin invalide',
      'Ce numéro d’arrêté existe déjà',
    ];
    const message = publicMessages.includes(error.message) || error.status === 400 ? error.message : 'Une erreur interne est survenue';
    res.status(error.status || 500).json({ error: message });
  });

  app.get(/^\/arretes$/, (_req, res) => res.redirect(302, `${PREFIX}/`));
  app.use(PREFIX, router);
  console.log(`[ARRETES] Disponible sur ${PREFIX}/ — stockage: ${dataDir}`);

  function sessionTokenFromRequest(req) {
    return parseCookies(req.headers.cookie)[COOKIE_NAME] || '';
  }

  function requireAuth(req, res, next) {
    const token = sessionTokenFromRequest(req);
    const user = token ? auth.verifySessionToken(token) : null;
    if (!user) {
      if (req.baseUrl.endsWith('/api') || req.originalUrl.startsWith(`${PREFIX}/api/`)) {
        return res.status(401).json({ error: 'Accès depuis ARGOS requis' });
      }
      return res.status(403).sendFile('access-denied.html', { root: publicDir });
    }
    req.arretesUser = user;
    req.arretesSessionToken = token;
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.arretesUser?.role !== 'admin') return res.status(403).json({ error: 'Droits administrateur requis' });
    next();
  }

  function requireCsrf(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const expected = csrfTokenFor(req.arretesSessionToken);
    const supplied = String(req.headers['x-csrf-token'] || '');
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: 'Jeton de sécurité invalide. Rechargez la page.' });
    }
    next();
  }

  async function initialize() {
    await fs.mkdir(dataDir, { recursive: true });
    await store.initialize();
    await streets.initialize();
    await store.purgeExpired();

    if (process.env.AUTO_REFRESH_STREETS !== 'false') {
      streets.refreshFromBan().then(
        (items) => console.log(`[ARRETES] Liste BAN actualisée : ${items.length} voies.`),
        (error) => console.warn(`[ARRETES] Actualisation BAN différée : ${error.message}`),
      );
    }

    const cleanupInterval = setInterval(() => {
      store.purgeExpired().catch((error) => console.error('[ARRETES] Échec de la purge automatique', error));
    }, 6 * 60 * 60 * 1000);
    cleanupInterval.unref();

    const refreshInterval = setInterval(() => {
      if (process.env.AUTO_REFRESH_STREETS !== 'false') streets.refreshFromBan().catch((error) => console.warn(`[ARRETES] ${error.message}`));
    }, 7 * 24 * 60 * 60 * 1000);
    refreshInterval.unref();
  }
}

function parseCookies(header = '') {
  const result = {};
  for (const entry of String(header).split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(entry.slice(separator + 1).trim()); }
    catch { result[key] = entry.slice(separator + 1).trim(); }
  }
  return result;
}

function csrfTokenFor(sessionToken) {
  return crypto.createHash('sha256').update(`arretes-csrf:${sessionToken}`).digest('base64url');
}

function isSecure(req) {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}

function setCookie(req, res, token) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, `Path=${PREFIX}`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=43200'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearCookie(req, res) {
  const parts = [`${COOKIE_NAME}=`, `Path=${PREFIX}`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateRecordInput(body, file) {
  const number = cleanText(body.number, 80);
  const name = cleanText(body.name, 220);
  const date = String(body.date || '');
  const locationDetails = cleanText(body.locationDetails, 500, false);
  const temporary = body.temporary === 'true' || body.temporary === 'on';
  let selectedStreets;
  try { selectedStreets = JSON.parse(body.streets || '[]'); }
  catch { throw badRequest('La sélection des voies est invalide'); }
  if (!number) throw badRequest('Le numéro de l’arrêté est obligatoire');
  if (!name) throw badRequest('Le nom de l’arrêté est obligatoire');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid) throw badRequest('La date de l’arrêté est invalide');
  if (!Array.isArray(selectedStreets) || !selectedStreets.length || selectedStreets.length > 50) throw badRequest('Sélectionnez au moins une voie');
  selectedStreets = [...new Set(selectedStreets.map((street) => cleanText(street, 160)).filter(Boolean))];
  if (!file) throw badRequest('Ajoutez l’arrêté au format PDF');

  let startDate = null;
  let endDate = null;
  let deleteAt = null;
  if (temporary) {
    startDate = String(body.startDate || '');
    endDate = String(body.endDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !DateTime.fromISO(startDate).isValid) throw badRequest('La date de début est invalide');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !DateTime.fromISO(endDate).isValid) throw badRequest('La date de fin est invalide');
    if (DateTime.fromISO(endDate) < DateTime.fromISO(startDate)) throw badRequest('La date de fin doit suivre la date de début');
    deleteAt = computeDeleteAt(endDate);
  }
  return { number, name, date, streets: selectedStreets, locationDetails, temporary, startDate, endDate, deleteAt };
}

function cleanText(value, maxLength, required = true) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  if (cleaned.length > maxLength) throw badRequest(`Un champ dépasse ${maxLength} caractères`);
  if (required && !cleaned) return '';
  return cleaned;
}

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || 'arrete.pdf')).replace(/[\r\n"]/g, '').trim();
  return (base || 'arrete.pdf').slice(0, 180);
}

function asciiFilename(filename) {
  return sanitizeFilename(filename).normalize('NFD').replace(/[^\x20-\x7E]/g, '').replace(/[\\/]/g, '-') || 'arrete.pdf';
}

async function isPdfFile(filePath) {
  if (!filePath) return false;
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(5);
    await handle.read(buffer, 0, 5, 0);
    return buffer.toString('ascii') === '%PDF-';
  } finally {
    await handle.close();
  }
}

module.exports = { mountArretes, validateRecordInput };

