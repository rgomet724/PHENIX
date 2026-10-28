'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_FILE = String(process.env.CENTRAL_ADMIN_DATA_FILE || '/var/data/admin-center.json');
const TMP_FILE = `${DATA_FILE}.tmp`;
const MAX_AUDIT = 10000;
let cachedConfig = null;
let cachedMtimeMs = -1;
let cachedSize = -1;

const APPLICATIONS = Object.freeze([
  { id: 'phenix', name: 'PHENIX', roles: ['admin', 'superviseur', 'operateur', 'dashboard'] },
  { id: 'argos', name: 'Portail ARGOS', roles: ['admin', 'user'] },
  { id: 'atlas', name: 'ATLAS', roles: ['admin', 'superviseur', 'operateur', 'consultation'] },
  { id: 'arretes', name: 'Arrêtés', roles: ['admin', 'user'] },
  { id: 'syrius', name: 'SYRIUS · Radio', roles: ['admin', 'user'] }
]);

const DEFAULT_APPEARANCE = Object.freeze({
  phenix: {
    title: 'PHENIX', subtitle: 'Plateforme Hiérarchisée des Engagements et Interventions',
    primaryColor: '#0758b6', accentColor: '#3b82f6', backgroundColor: '#07111f',
    logoData: '', faviconData: '', backgroundData: ''
  },
  argos: {
    title: 'Portail ARGOS', subtitle: 'Police Municipale · Chalon-sur-Saône',
    primaryColor: '#0a5f91', accentColor: '#10a4c7', backgroundColor: '#eef3f5',
    logoData: '', faviconData: '', backgroundData: ''
  },
  atlas: {
    title: 'ATLAS', subtitle: 'Gestion de l’attente des interventions',
    primaryColor: '#0018a8', accentColor: '#0878df', backgroundColor: '#eef3f8',
    logoData: '', faviconData: '', backgroundData: ''
  },
  syrius: {
    title: 'SYRIUS', subtitle: 'Communications radio · PHENIX',
    primaryColor: '#253d91', accentColor: '#4264d7', backgroundColor: '#eef1f6',
    logoData: '', faviconData: '', backgroundData: ''
  },
  arretes: {
    title: 'Arrêtés municipaux', subtitle: 'Police Municipale · Chalon-sur-Saône',
    primaryColor: '#0878df', accentColor: '#e40521', backgroundColor: '#f4f7fb',
    logoData: '', faviconData: '', backgroundData: ''
  }
});

const NOTIFICATION_EVENTS = Object.freeze([
  {
    id: 'phenix-crew-status', appId: 'phenix', legacyKind: 'crew',
    label: 'Changement disponible / indisponible',
    description: 'Alerte lorsqu’un équipage passe DISPONIBLE ou INDISPONIBLE, avec le motif.'
  },
  {
    id: 'phenix-consigne', appId: 'phenix', legacyKind: 'urgent',
    label: 'Nouvelle consigne PHENIX',
    description: 'Alerte lors de la création ou de la modification d’une consigne destinée au poste.'
  },
  {
    id: 'phenix-flash', appId: 'phenix', legacyKind: 'system',
    label: 'Nouveau texte flash PHENIX',
    description: 'Alerte lors de la diffusion d’un nouveau texte flash.'
  },
  {
    id: 'atlas-new-intervention', appId: 'atlas', legacyKind: '',
    label: 'Nouvelle intervention ATLAS',
    description: 'Alerte lors de l’arrivée d’une nouvelle intervention dans ATLAS.'
  }
]);

function normalizedRole(role) {
  const value = String(role || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (value === 'administrateur') return 'admin';
  if (value === 'operateur') return 'operateur';
  if (value === 'consultations') return 'consultation';
  return value;
}

function hexColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function cleanText(value, max, fallback = '') {
  const text = String(value || '').trim().slice(0, max);
  return text || fallback;
}

function defaultData() {
  const events = {};
  for (const event of NOTIFICATION_EVENTS) {
    events[event.id] = {
      soundEnabled: true,
      desktopEnabled: true,
      custom: false,
      filename: '',
      path: '',
      updatedAt: ''
    };
  }
  return {
    schemaVersion: 2,
    security: { passwordMinLength: 6 },
    userPolicies: {},
    appearance: JSON.parse(JSON.stringify(DEFAULT_APPEARANCE)),
    notifications: { events },
    audit: []
  };
}

function migrate(value) {
  const base = defaultData();
  const data = value && typeof value === 'object' ? value : {};
  data.schemaVersion = 2;
  data.security = data.security && typeof data.security === 'object' ? data.security : base.security;
  data.security.passwordMinLength = Math.min(32, Math.max(4, Number(data.security.passwordMinLength) || 6));
  data.userPolicies = data.userPolicies && typeof data.userPolicies === 'object' ? data.userPolicies : {};
  data.appearance = data.appearance && typeof data.appearance === 'object' ? data.appearance : {};
  for (const app of APPLICATIONS) {
    const defaults = DEFAULT_APPEARANCE[app.id];
    const current = data.appearance[app.id] && typeof data.appearance[app.id] === 'object' ? data.appearance[app.id] : {};
    data.appearance[app.id] = {
      title: cleanText(current.title, 80, defaults.title),
      subtitle: cleanText(current.subtitle, 160, defaults.subtitle),
      primaryColor: hexColor(current.primaryColor, defaults.primaryColor),
      accentColor: hexColor(current.accentColor, defaults.accentColor),
      backgroundColor: hexColor(current.backgroundColor, defaults.backgroundColor),
      logoData: String(current.logoData || ''),
      faviconData: String(current.faviconData || ''),
      backgroundData: String(current.backgroundData || '')
    };
  }
  data.notifications = data.notifications && typeof data.notifications === 'object' ? data.notifications : {};
  data.notifications.events = data.notifications.events && typeof data.notifications.events === 'object' ? data.notifications.events : {};
  for (const definition of NOTIFICATION_EVENTS) {
    const defaults = base.notifications.events[definition.id];
    const current = data.notifications.events[definition.id] && typeof data.notifications.events[definition.id] === 'object'
      ? data.notifications.events[definition.id]
      : {};
    data.notifications.events[definition.id] = {
      soundEnabled: typeof current.soundEnabled === 'boolean' ? current.soundEnabled : defaults.soundEnabled,
      desktopEnabled: typeof current.desktopEnabled === 'boolean' ? current.desktopEnabled : defaults.desktopEnabled,
      custom: Boolean(current.custom),
      filename: cleanText(current.filename, 180),
      path: String(current.path || ''),
      updatedAt: String(current.updatedAt || '')
    };
  }
  data.audit = Array.isArray(data.audit) ? data.audit.slice(0, MAX_AUDIT) : [];
  return data;
}

function loadAdminConfig(copy = false) {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      if (!cachedConfig || cachedMtimeMs !== -1) cachedConfig = defaultData();
      cachedMtimeMs = -1;
      cachedSize = -1;
      return copy ? structuredClone(cachedConfig) : cachedConfig;
    }
    const stat = fs.statSync(DATA_FILE);
    if (cachedConfig && cachedMtimeMs === stat.mtimeMs && cachedSize === stat.size) return copy ? structuredClone(cachedConfig) : cachedConfig;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    cachedConfig = migrate(raw.trim() ? JSON.parse(raw) : {});
    cachedMtimeMs = stat.mtimeMs;
    cachedSize = stat.size;
    return copy ? structuredClone(cachedConfig) : cachedConfig;
  } catch (error) {
    console.error('[ADMIN] Lecture admin-center.json impossible:', error.message);
    if (!cachedConfig) cachedConfig = defaultData();
    return copy ? structuredClone(cachedConfig) : cachedConfig;
  }
}

function saveAdminConfig(value) {
  const data = migrate(value);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(TMP_FILE, DATA_FILE);
  const stat = fs.statSync(DATA_FILE);
  cachedConfig = data;
  cachedMtimeMs = stat.mtimeMs;
  cachedSize = stat.size;
  return data;
}

function passwordMinLength() {
  return loadAdminConfig().security.passwordMinLength;
}

function defaultAccessForUser(user) {
  const role = normalizedRole(user && user.role);
  const argosEnabled = ['admin', 'superviseur', 'operateur'].includes(role);
  return {
    phenix: { enabled: true, role: ['admin', 'superviseur', 'operateur', 'dashboard'].includes(role) ? role : 'operateur' },
    argos: { enabled: argosEnabled, role: role === 'admin' ? 'admin' : 'user' },
    atlas: {
      enabled: argosEnabled,
      role: role === 'admin' ? 'admin' : role === 'superviseur' ? 'superviseur' : role === 'operateur' ? 'operateur' : 'consultation'
    },
    arretes: { enabled: argosEnabled, role: role === 'admin' ? 'admin' : 'user' },
    syrius: { enabled: argosEnabled, role: role === 'admin' ? 'admin' : 'user' },
    apps: {}
  };
}

function cleanPolicy(policy, user) {
  const defaults = defaultAccessForUser(user);
  const source = policy && typeof policy === 'object' ? policy : {};
  const result = { apps: {} };
  for (const app of APPLICATIONS) {
    const item = source[app.id] && typeof source[app.id] === 'object' ? source[app.id] : {};
    const fallback = defaults[app.id];
    const role = app.roles.includes(normalizedRole(item.role)) ? normalizedRole(item.role) : fallback.role;
    result[app.id] = { enabled: typeof item.enabled === 'boolean' ? item.enabled : fallback.enabled, role };
  }
  if (source.apps && typeof source.apps === 'object') {
    for (const [id, allowed] of Object.entries(source.apps)) result.apps[String(id).slice(0, 100)] = allowed !== false;
  }
  return result;
}

function policyForUser(user, config = loadAdminConfig()) {
  if (!user) return null;
  const id = String(user.id || '').replace(/^phenix:/, '');
  return cleanPolicy(config.userPolicies[id], user);
}

function setUserPolicy(config, user, policy) {
  const id = String(user.id || '').replace(/^phenix:/, '');
  config.userPolicies[id] = cleanPolicy(policy, user);
  return config.userPolicies[id];
}

function appAccess(user, appId, config = loadAdminConfig()) {
  const policy = policyForUser(user, config);
  if (!policy || !policy[appId]) return { enabled: false, role: '' };
  return policy[appId];
}

function portalAppAllowed(user, portalAppId, config = loadAdminConfig()) {
  const policy = policyForUser(user, config);
  if (!policy || !policy.argos.enabled) return false;
  return policy.apps[portalAppId] !== false;
}

function appearanceFor(appId, config = loadAdminConfig()) {
  const fallback = DEFAULT_APPEARANCE[appId] || DEFAULT_APPEARANCE.argos;
  return { ...fallback, ...(config.appearance[appId] || {}) };
}

function notificationDefinition(eventId) {
  return NOTIFICATION_EVENTS.find(item => item.id === String(eventId || '')) || null;
}

function notificationSetting(eventId, config = loadAdminConfig()) {
  const definition = notificationDefinition(eventId);
  if (!definition) return null;
  const current = config.notifications && config.notifications.events && config.notifications.events[definition.id] || {};
  return {
    id: definition.id,
    appId: definition.appId,
    legacyKind: definition.legacyKind,
    label: definition.label,
    description: definition.description,
    soundEnabled: current.soundEnabled !== false,
    desktopEnabled: current.desktopEnabled !== false,
    custom: Boolean(current.custom),
    filename: String(current.filename || ''),
    path: String(current.path || ''),
    updatedAt: String(current.updatedAt || '')
  };
}

function notificationSettingsForApp(appId = '', config = loadAdminConfig()) {
  const selected = String(appId || '').toLowerCase();
  const events = {};
  for (const definition of NOTIFICATION_EVENTS) {
    if (selected && definition.appId !== selected) continue;
    const setting = notificationSetting(definition.id, config);
    events[definition.id] = {
      id: setting.id,
      appId: setting.appId,
      label: setting.label,
      description: setting.description,
      soundEnabled: setting.soundEnabled,
      desktopEnabled: setting.desktopEnabled,
      custom: setting.custom,
      filename: setting.filename,
      updatedAt: setting.updatedAt,
      soundUrl: `/portail/administration/api/public/notification-sounds/${encodeURIComponent(setting.id)}`
    };
  }
  return { events };
}

function addAudit(config, actor, action, details, req) {
  const forwarded = String(req && req.headers && req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  config.audit.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    actorId: actor ? String(actor.id || '') : '',
    actor: actor ? String(actor.name || actor.displayName || actor.login || 'Administrateur') : 'Système',
    login: actor ? String(actor.login || '') : '',
    action: cleanText(action, 160, 'Modification'),
    details: cleanText(details, 500),
    ip: forwarded || (req && (req.ip || req.socket && req.socket.remoteAddress)) || '',
    userAgent: String(req && req.headers && req.headers['user-agent'] || '').slice(0, 300)
  });
  config.audit = config.audit.slice(0, MAX_AUDIT);
}

module.exports = {
  APPLICATIONS,
  DATA_FILE,
  MAX_AUDIT,
  NOTIFICATION_EVENTS,
  addAudit,
  appAccess,
  appearanceFor,
  defaultAccessForUser,
  hexColor,
  loadAdminConfig,
  notificationDefinition,
  notificationSetting,
  notificationSettingsForApp,
  normalizedRole,
  passwordMinLength,
  policyForUser,
  portalAppAllowed,
  saveAdminConfig,
  setUserPolicy
};

