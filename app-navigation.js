'use strict';

const express = require('express');
const path = require('path');

const LEGACY_ORIGIN = 'https://pegase-2.onrender.com';

function isPhenixAppUrl(value) {
  try {
    const url = new URL(String(value || ''), LEGACY_ORIGIN);
    return url.origin === LEGACY_ORIGIN && /^\/phenix(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

// Les tuiles PHENIX existantes peuvent encore utiliser l'ancienne racine.
// On adapte leur URL à la lecture sans modifier les liens des autres applications.
function normalizePortalApp(item) {
  if (item.id !== 'app-phenix' && String(item.name || '').trim().toUpperCase() !== 'PHENIX') return item;
  const raw = String(item.url || '').trim();
  if (!raw) return item;
  try {
    const url = new URL(raw, LEGACY_ORIGIN);
    if (url.origin !== LEGACY_ORIGIN || !['/', '/index.html'].includes(url.pathname)) return item;
    const relative = raw.startsWith('/') && !raw.startsWith('//');
    return { ...item, url: `${relative ? '' : url.origin}/phenix/${url.search}${url.hash}` };
  } catch {
    return item;
  }
}

function mountApplicationPages(app) {
  const publicDir = path.join(__dirname, 'public');
  const staticOptions = {
    etag: true,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    }
  };

  // ARGOS devient l'accueil, /portail/ reste compatible avec les anciens favoris.
  app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'portail', 'index.html'));
  });
  app.get('/index.html', (req, res) => res.redirect(302, `/${req.originalUrl.slice(req.path.length)}`));
  app.get(/^\/phenix$/, (req, res) => res.redirect(302, `/phenix/${req.originalUrl.slice(req.path.length)}`));
  app.use('/phenix', express.static(publicDir, staticOptions));
  // Les API et les chemins d'assets historiques de PHENIX restent valides.
  app.use(express.static(publicDir, { ...staticOptions, index: false }));
}

module.exports = { isPhenixAppUrl, normalizePortalApp, mountApplicationPages };
