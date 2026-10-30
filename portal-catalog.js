'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizePortalApp } = require('./app-navigation');

const SCHEMA_VERSION = 3;
const DEFAULT_CATEGORIES = [
  { id: 'cat-operationnel', name: 'Opérationnel', order: 10 },
  { id: 'cat-outils', name: 'Outils et applications', order: 20 },
  { id: 'cat-documentation', name: 'Documentation', order: 30 }
];
const resolvedDirectories = new Map();

function portalDataDirectory() {
  const requested = String(process.env.PORTAL_DATA_DIR || '').trim();
  if (resolvedDirectories.has(requested)) return resolvedDirectories.get(requested);
  for (const directory of requested ? [requested] : ['/var/data', path.join(__dirname, 'data'), '/tmp/portail-pm-chalon']) {
    const probe = path.join(directory, `.portal-write-test-${crypto.randomUUID()}`);
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(probe, 'ok', { mode: 0o600 });
      fs.unlinkSync(probe);
      resolvedDirectories.set(requested, directory);
      return directory;
    } catch (error) {
      try { fs.unlinkSync(probe); } catch { /* Aucun fichier de contrôle à retirer. */ }
      console.warn(`[PORTAIL] Stockage indisponible ${directory}: ${error.message}`);
    }
  }
  throw new Error('Aucun stockage disponible pour le portail.');
}

function defaultPortalCatalog(appearances = {}) {
  return normalizePortalCatalog({ schemaVersion: 2, users: [], categories: DEFAULT_CATEGORIES, apps: [{
    id: 'app-phenix', categoryId: 'cat-operationnel', name: 'PHENIX',
    description: 'Plateforme opérationnelle', url: '/phenix/', logoData: '', accentColor: '#0878df', order: 10
  }] }, appearances);
}

function matchesApplication(item, id) {
  if (item.id === `app-${id}`) return true;
  try {
    const url = new URL(String(item.url || ''), 'https://pegase-2.onrender.com');
    return url.origin === 'https://pegase-2.onrender.com' && new RegExp(`^/${id}(?:/|$)`).test(url.pathname);
  } catch { return false; }
}

// Le portail, son ancien panneau et l’administration centrale lisent le même
// catalogue. Les tuiles automatiques deviennent modifiables lors de la migration.
function normalizePortalCatalog(input, appearances = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const categories = (Array.isArray(source.categories) ? source.categories : DEFAULT_CATEGORIES).map(item => ({ ...item }));
  const apps = (Array.isArray(source.apps) ? source.apps : []).map(item => ({ ...normalizePortalApp(item) }));
  if (Number(source.schemaVersion || 0) < SCHEMA_VERSION) {
    for (const category of DEFAULT_CATEGORIES) {
      if (!categories.some(item => item.id === category.id || String(item.name).trim().toLocaleLowerCase('fr') === category.name.toLocaleLowerCase('fr'))) categories.push({ ...category });
    }
    const categoryId = (categories.find(item => item.id === 'cat-operationnel') || categories[0]).id;
    if (!apps.some(item => matchesApplication(item, 'dashboard'))) apps.push({
      id: 'app-dashboard', categoryId, name: 'Dashboard · Vie du service',
      description: 'Actualités, astreinte et prochaines réunions', url: '/dashboard/', logoData: '', accentColor: '#16877b', order: 5
    });
    if (!apps.some(item => matchesApplication(item, 'syrius'))) apps.push({
      id: 'app-syrius', categoryId, name: 'SYRIUS', description: 'Communications radio · PHENIX', url: '/syrius/',
      logoData: '', accentColor: '#4264d7', order: 25, followAppearance: true
    });
  }
  // Une tuile personnalisée garde ses choix. Les tuiles SYRIUS issues de
  // l’ancienne génération automatique suivent l’apparence jusqu’à leur édition.
  for (const item of apps) {
    if (item.followAppearance === true && matchesApplication(item, 'syrius') && appearances.syrius) {
      const appearance = appearances.syrius;
      Object.assign(item, { name: appearance.title, description: appearance.subtitle, logoData: appearance.logoData, accentColor: appearance.accentColor });
    }
    if (!categories.some(category => category.id === item.categoryId)) {
      let category = categories.find(entry => entry.id === 'cat-non-classe');
      if (!category) { category = { id: 'cat-non-classe', name: 'Sans catégorie', order: 40 }; categories.push(category); }
      item.categoryId = category.id;
    }
  }
  return { ...source, schemaVersion: SCHEMA_VERSION, users: Array.isArray(source.users) ? source.users : [], categories, apps };
}

module.exports = { defaultPortalCatalog, normalizePortalCatalog, portalDataDirectory };
