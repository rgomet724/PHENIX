'use strict';

const API = '/portail/administration/api';
const state = {
  csrfToken: '', user: null, dashboard: null, users: [], passwordResets: [], notificationEvents: [], applications: [], categories: [], apps: [], appearance: {}, security: null,
  view: 'dashboard', accessUserId: '', appearanceApp: 'phenix'
};

const $ = id => document.getElementById(id);
const roleLabels = {
  admin: 'Administrateur', superviseur: 'Superviseur', operateur: 'Opérateur', dashboard: 'Écran Dashboard',
  user: 'Utilisateur', consultation: 'Consultation'
};
const appLabels = { phenix: 'PHENIX', argos: 'Portail ARGOS', atlas: 'ATLAS', arretes: 'Arrêtés' };

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || 'GET').toUpperCase();
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) headers.set('x-admin-csrf', state.csrfToken);
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'Une erreur est survenue.');
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / 1024 / 1024).toFixed(1)} Mo`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

let toastTimer;
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const box = $('toast');
  box.textContent = message;
  box.classList.toggle('error', error);
  box.classList.remove('hidden');
  toastTimer = setTimeout(() => box.classList.add('hidden'), 4200);
}

function openModal(title, html, afterOpen) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modal').classList.remove('hidden');
  if (afterOpen) afterOpen();
}

function closeModal() { $('modal').classList.add('hidden'); $('modalBody').replaceChildren(); }

function switchView(name) {
  state.view = name;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.viewPanel !== name));
  if (name === 'history') loadHistory().catch(error => toast(error.message, true));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function initialize() {
  bindEvents();
  try {
    const session = await api('/session');
    state.csrfToken = session.csrfToken;
    state.user = session.user;
    $('currentUser').textContent = `${session.user.name} · Administrateur`;
    await loadEverything();
    $('loading').classList.add('hidden');
    switchView('dashboard');
  } catch (error) {
    $('loading').textContent = error.message;
    $('loading').style.borderTopColor = '#d91f2b';
  }
}

async function loadEverything() {
  const [dashboard, users, passwordResets, notifications, catalog, appearance, security] = await Promise.all([
    api('/dashboard'), api('/users'), api('/password-resets'), api('/notifications'), api('/catalog'), api('/appearance'), api('/security')
  ]);
  state.dashboard = dashboard;
  state.users = users.users || [];
  state.passwordResets = passwordResets.requests || [];
  state.notificationEvents = notifications.events || [];
  state.applications = catalog.applications || [];
  state.categories = catalog.categories || [];
  state.apps = catalog.apps || [];
  state.appearance = appearance.appearance || {};
  state.security = security;
  if (!state.accessUserId || !state.users.some(user => user.id === state.accessUserId)) state.accessUserId = state.users[0]?.id || '';
  renderAll();
}

function renderAll() {
  renderDashboard(); renderUsers(); renderPasswordResets(); renderNotifications(); renderAccess(); renderApps(); renderAppearance(); renderSecurity();
}

function renderDashboard() {
  const data = state.dashboard || {};
  const cards = [
    [data.users || 0, 'Utilisateurs'], [data.administrators || 0, 'Administrateurs'],
    [data.passwordResetPending || 0, 'Mots de passe oubliés'],
    [data.enabledArgos || 0, 'Accès ARGOS actifs'], [data.applications || 0, 'Tuiles du portail'],
    [formatBytes(data.diskBytes), 'Données sur le disque']
  ];
  $('dashboardCards').innerHTML = cards.map(([value, label]) => `<article class="stat-card"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></article>`).join('');
}

function accessBadges(user) {
  return ['phenix', 'argos', 'atlas', 'arretes'].map(id => `<span class="access-dot${user.access?.[id]?.enabled ? '' : ' off'}">${escapeHtml(appLabels[id])}</span>`).join('');
}

function renderUsers() {
  const query = String($('userSearch')?.value || '').trim().toLowerCase();
  const users = state.users.filter(user => !query || [user.displayName, user.login, user.role].join(' ').toLowerCase().includes(query));
  $('userCount').textContent = `${users.length} compte${users.length > 1 ? 's' : ''}`;
  $('userRows').innerHTML = users.length ? users.map(user => `
    <tr>
      <td class="user-cell"><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.login)}</small></td>
      <td><span class="role-badge ${escapeHtml(user.role)}">${escapeHtml(roleLabels[user.role] || user.role)}</span></td>
      <td><div class="access-dots">${accessBadges(user)}</div></td>
      <td><span class="status-badge ${user.mustChangePassword ? 'warning' : 'ok'}">${user.mustChangePassword ? 'À changer' : 'Actif'}</span></td>
      <td class="actions-cell"><div class="actions">
        <button class="link-button" data-action="edit-user" data-id="${escapeHtml(user.id)}">Modifier</button>
        <button class="link-button" data-action="reset-password" data-id="${escapeHtml(user.id)}">Mot de passe</button>
        <button class="link-button danger" data-action="delete-user" data-id="${escapeHtml(user.id)}">Supprimer</button>
      </div></td>
    </tr>`).join('') : '<tr><td class="empty-row" colspan="5">Aucun utilisateur correspondant.</td></tr>';
}

function renderPasswordResets() {
  const requests = state.passwordResets || [];
  const count = requests.length;
  $('passwordResetCount').textContent = `${count} demande${count > 1 ? 's' : ''} en attente`;
  const badge = $('passwordResetNavCount');
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
  $('passwordResetRows').innerHTML = count ? requests.map(request => `
    <tr>
      <td class="user-cell"><strong>${escapeHtml(request.displayName)}</strong><small>${escapeHtml(request.login)}</small></td>
      <td>${escapeHtml(formatDate(request.createdAt))}</td>
      <td>${escapeHtml(request.deviceName || request.deviceId || 'Non identifié')}</td>
      <td>${escapeHtml(request.requestIp || '—')}</td>
      <td class="actions-cell"><div class="actions">
        <button class="link-button" data-action="complete-password-request" data-id="${escapeHtml(request.id)}">Réinitialiser</button>
        <button class="link-button danger" data-action="dismiss-password-request" data-id="${escapeHtml(request.id)}">Classer</button>
      </div></td>
    </tr>`).join('') : '<tr><td class="empty-row" colspan="5">Aucune demande de mot de passe en attente.</td></tr>';
}

function completePasswordRequest(request) {
  const min = state.security?.passwordMinLength || 6;
  openModal('Traiter la demande de mot de passe', `
    <form id="forgotPasswordForm" class="modal-form">
      <p>Agent : <strong>${escapeHtml(request.displayName)}</strong> (${escapeHtml(request.login)})</p>
      <label class="field"><span>Mot de passe temporaire *</span><input id="temporaryPassword" type="password" minlength="${min}" maxlength="72" required autocomplete="new-password"><small>${min} caractères minimum. L’agent devra le modifier à sa prochaine connexion.</small></label>
      <p id="modalError" class="form-error"></p>
      <div class="form-footer"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Réinitialiser le mot de passe</button></div>
    </form>`, () => {
      document.querySelector('[data-close-modal]').addEventListener('click', closeModal);
      $('forgotPasswordForm').addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await api(`/password-resets/${encodeURIComponent(request.id)}/complete`, { method: 'POST', body: JSON.stringify({ password: $('temporaryPassword').value }) });
          closeModal(); await loadEverything(); toast('Demande traitée et mot de passe temporaire défini.');
        } catch (error) { $('modalError').textContent = error.message; }
      });
      $('temporaryPassword').focus();
    });
}

async function dismissPasswordRequest(request) {
  if (!confirm(`Classer la demande de « ${request.displayName} » sans modifier son mot de passe ?`)) return;
  await api(`/password-resets/${encodeURIComponent(request.id)}/dismiss`, { method: 'POST', body: '{}' });
  await loadEverything(); toast('Demande classée.');
}

function notificationIcon(event) {
  if (event.id === 'phenix-crew-status') return '🚓';
  if (event.id === 'phenix-consigne') return '📋';
  if (event.id === 'phenix-flash') return '⚡';
  return '📡';
}

function renderNotifications() {
  $('notificationCards').innerHTML = state.notificationEvents.map(event => `
    <article class="notification-card" style="--event-color:${event.appId === 'atlas' ? '#0018a8' : '#0878df'}">
      <div class="notification-card-head">
        <div class="notification-card-title"><span class="notification-card-icon">${notificationIcon(event)}</span><div><span class="notification-app">${escapeHtml(event.appId.toUpperCase())}</span><h2>${escapeHtml(event.label)}</h2><p>${escapeHtml(event.description)}</p></div></div>
      </div>
      <div class="notification-options">
        <label class="notification-option"><span><b>Son</b><small>Jouer l’alerte audio</small></span><input type="checkbox" data-notification-sound="${escapeHtml(event.id)}" ${event.soundEnabled ? 'checked' : ''}></label>
        <label class="notification-option"><span><b>Bureau</b><small>Afficher une notification Windows</small></span><input type="checkbox" data-notification-desktop="${escapeHtml(event.id)}" ${event.desktopEnabled ? 'checked' : ''}></label>
      </div>
      <div class="notification-sound">
        <label class="field"><span>Son personnalisé · MP3 ou WAV · 2 Mo maximum</span><input type="file" accept=".mp3,.wav,.wave,audio/mpeg,audio/wav" data-notification-file="${escapeHtml(event.id)}"></label>
        <div class="notification-current">${event.custom ? `Son actuel : ${escapeHtml(event.filename || 'personnalisé')}` : 'Son par défaut intégré'}</div>
        <div class="notification-actions">
          <button class="button small primary" data-action="upload-notification-sound" data-id="${escapeHtml(event.id)}">Enregistrer le son</button>
          <button class="button small secondary" data-action="test-notification-sound" data-id="${escapeHtml(event.id)}">Tester</button>
          <button class="button small danger" data-action="reset-notification-sound" data-id="${escapeHtml(event.id)}">Son par défaut</button>
        </div>
      </div>
    </article>`).join('');
}

async function saveNotificationSettings() {
  const events = {};
  for (const event of state.notificationEvents) {
    const sound = [...document.querySelectorAll('[data-notification-sound]')].find(input => input.dataset.notificationSound === event.id);
    const desktop = [...document.querySelectorAll('[data-notification-desktop]')].find(input => input.dataset.notificationDesktop === event.id);
    events[event.id] = { soundEnabled: Boolean(sound?.checked), desktopEnabled: Boolean(desktop?.checked) };
  }
  try {
    await api('/notifications', { method: 'PUT', body: JSON.stringify({ events }) });
    await loadEverything(); toast('Réglages des notifications enregistrés.');
  } catch (error) { toast(error.message, true); }
}

function notificationDraftOptions() {
  const options = new Map();
  for (const event of state.notificationEvents) {
    const sound = [...document.querySelectorAll('[data-notification-sound]')].find(input => input.dataset.notificationSound === event.id);
    const desktop = [...document.querySelectorAll('[data-notification-desktop]')].find(input => input.dataset.notificationDesktop === event.id);
    options.set(event.id, { soundEnabled: Boolean(sound?.checked), desktopEnabled: Boolean(desktop?.checked) });
  }
  return options;
}

async function reloadNotificationSounds(draft) {
  const result = await api('/notifications');
  state.notificationEvents = (result.events || []).map(event => ({ ...event, ...draft.get(event.id) }));
  renderNotifications();
}

function notificationEventById(id) { return state.notificationEvents.find(event => event.id === id); }

async function uploadNotificationSound(event) {
  if (!event) return;
  const input = [...document.querySelectorAll('[data-notification-file]')].find(item => item.dataset.notificationFile === event.id);
  const file = input?.files?.[0];
  if (!file) return toast('Choisissez d’abord un fichier MP3 ou WAV.', true);
  if (file.size > 2 * 1024 * 1024) return toast('Le son doit faire moins de 2 Mo.', true);
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!['mp3', 'wav', 'wave'].includes(extension)) return toast('Format accepté : MP3 ou WAV.', true);
  try {
    const draft = notificationDraftOptions();
    const data = await readDataUrl(file);
    await api(`/notifications/${encodeURIComponent(event.id)}/sound`, { method: 'POST', body: JSON.stringify({ filename: file.name, data }) });
    await reloadNotificationSounds(draft); toast('Son enregistré pour cet événement.');
  } catch (error) { toast(error.message, true); }
}

async function testNotificationSound(event) {
  if (!event) return;
  try {
    const audio = new Audio(`${event.soundUrl}?v=${encodeURIComponent(event.updatedAt || Date.now())}&t=${Date.now()}`);
    audio.volume = 1;
    await audio.play();
    toast('Lecture du son sur ce poste.');
  } catch { toast('Le son est illisible ou sa lecture est bloquée par le navigateur.', true); }
}

async function resetNotificationSound(event) {
  if (!event || !confirm(`Restaurer le son par défaut pour « ${event.label} » ?`)) return;
  try {
    const draft = notificationDraftOptions();
    await api(`/notifications/${encodeURIComponent(event.id)}/sound`, { method: 'DELETE' });
    await reloadNotificationSounds(draft); toast('Son par défaut restauré.');
  } catch (error) { toast(error.message, true); }
}

async function testDesktopNotification() {
  if (!('Notification' in window)) return toast('Les notifications de bureau ne sont pas disponibles sur ce navigateur.', true);
  try {
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') return toast('Autorisation refusée dans le navigateur.', true);
    new Notification('ARGOS — Test de notification', { body: 'Les notifications de bureau sont autorisées sur ce poste.', tag: 'argos-admin-test' });
    toast('Notification de test envoyée.');
  } catch (error) { toast(error.message, true); }
}

function userForm(user = null) {
  const editing = Boolean(user);
  const min = state.security?.passwordMinLength || 6;
  openModal(editing ? 'Modifier un utilisateur' : 'Créer un utilisateur', `
    <form id="userModalForm" class="modal-form">
      <input id="modalUserId" type="hidden" value="${escapeHtml(user?.id || '')}">
      <div class="modal-grid">
        <label class="field"><span>Nom affiché *</span><input id="modalDisplayName" maxlength="120" value="${escapeHtml(user?.displayName || '')}" required></label>
        <label class="field"><span>Identifiant *</span><input id="modalLogin" maxlength="80" value="${escapeHtml(user?.login || '')}" required autocomplete="off"></label>
        <label class="field"><span>Rôle PHENIX *</span><select id="modalRole">
          ${['admin', 'superviseur', 'operateur', 'dashboard'].map(role => `<option value="${role}"${user?.role === role ? ' selected' : ''}>${roleLabels[role]}</option>`).join('')}
        </select></label>
        <label class="field"><span>${editing ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe *'}</span><input id="modalPassword" type="password" minlength="${min}" maxlength="72" ${editing ? '' : 'required'} autocomplete="new-password"><small>${min} caractères minimum.</small></label>
      </div>
      <div class="modal-grid">
        <label class="check-row"><input id="modalBrigadeJour" type="checkbox" ${user?.brigades?.jour ? 'checked' : ''}> Brigade de jour</label>
        <label class="check-row"><input id="modalBrigadeNuit" type="checkbox" ${user?.brigades?.nuit ? 'checked' : ''}> Brigade de nuit</label>
      </div>
      <label class="check-row"><input id="modalMustChange" type="checkbox" ${editing ? '' : 'checked'}> Obliger l’utilisateur à changer ce mot de passe à la prochaine connexion</label>
      <p id="modalError" class="form-error"></p>
      <div class="form-footer"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Enregistrer</button></div>
    </form>`, () => {
      $('userModalForm').addEventListener('submit', saveUser);
      document.querySelector('[data-close-modal]').addEventListener('click', closeModal);
      $('modalDisplayName').focus();
    });
}

async function saveUser(event) {
  event.preventDefault();
  const payload = {
    id: $('modalUserId').value,
    displayName: $('modalDisplayName').value.trim(), login: $('modalLogin').value.trim(), role: $('modalRole').value,
    password: $('modalPassword').value, mustChangePassword: $('modalMustChange').checked,
    brigades: { jour: $('modalBrigadeJour').checked, nuit: $('modalBrigadeNuit').checked }
  };
  try {
    await api('/users', { method: 'POST', body: JSON.stringify(payload) });
    closeModal(); await loadEverything(); toast(payload.id ? 'Utilisateur modifié.' : 'Utilisateur créé.');
  } catch (error) { $('modalError').textContent = error.message; }
}

function resetPassword(user) {
  const min = state.security?.passwordMinLength || 6;
  openModal('Réinitialiser le mot de passe', `
    <form id="passwordForm" class="modal-form">
      <p>Compte : <strong>${escapeHtml(user.displayName)}</strong> (${escapeHtml(user.login)})</p>
      <label class="field"><span>Nouveau mot de passe *</span><input id="newPassword" type="password" minlength="${min}" maxlength="72" required autocomplete="new-password"><small>${min} caractères minimum.</small></label>
      <label class="check-row"><input id="forcePasswordChange" type="checkbox" checked> Obliger le changement à la prochaine connexion</label>
      <p id="modalError" class="form-error"></p>
      <div class="form-footer"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Modifier le mot de passe</button></div>
    </form>`, () => {
      document.querySelector('[data-close-modal]').addEventListener('click', closeModal);
      $('passwordForm').addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await api(`/users/${encodeURIComponent(user.id)}/password`, { method: 'POST', body: JSON.stringify({ password: $('newPassword').value, mustChangePassword: $('forcePasswordChange').checked }) });
          closeModal(); await loadEverything(); toast('Mot de passe modifié.');
        } catch (error) { $('modalError').textContent = error.message; }
      });
      $('newPassword').focus();
    });
}

async function deleteUser(user) {
  if (!confirm(`Supprimer définitivement le compte « ${user.displayName} » ?`)) return;
  try { await api(`/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' }); await loadEverything(); toast('Utilisateur supprimé.'); }
  catch (error) { toast(error.message, true); }
}

function selectedAccessUser() { return state.users.find(user => user.id === state.accessUserId) || state.users[0] || null; }

function renderAccess() {
  const select = $('accessUser');
  select.innerHTML = state.users.map(user => `<option value="${escapeHtml(user.id)}"${user.id === state.accessUserId ? ' selected' : ''}>${escapeHtml(user.displayName)} — ${escapeHtml(user.login)}</option>`).join('');
  const user = selectedAccessUser();
  if (!user) {
    $('accessUserSummary').innerHTML = '<span>Aucun utilisateur.</span>';
    $('coreAccessCards').replaceChildren(); $('portalAccessList').replaceChildren(); return;
  }
  state.accessUserId = user.id;
  $('accessUserSummary').innerHTML = `<strong>${escapeHtml(user.displayName)}</strong><span>${escapeHtml(user.login)} · ${escapeHtml(roleLabels[user.role] || user.role)}</span>`;
  $('coreAccessCards').innerHTML = state.applications.map(app => {
    const access = user.access?.[app.id] || { enabled: false, role: app.roles[0] };
    return `<div class="access-card" data-core-app="${escapeHtml(app.id)}">
      <div class="access-card-head"><div class="access-card-title"><span class="app-dot ${app.id === 'arretes' ? 'red' : app.id === 'argos' ? 'cyan' : app.id === 'atlas' ? 'navy' : 'blue'}"></span>${escapeHtml(app.name)}</div>
      <label class="toggle" title="Autoriser l’accès"><input data-access-enabled type="checkbox" ${access.enabled ? 'checked' : ''}><span></span></label></div>
      <label class="field"><span>Rôle dans l’application</span><select data-access-role>${app.roles.map(role => `<option value="${role}"${access.role === role ? ' selected' : ''}>${escapeHtml(roleLabels[role] || role)}</option>`).join('')}</select></label>
    </div>`;
  }).join('');
  $('portalAccessList').innerHTML = state.apps.map(app => `<label class="check-item"><input type="checkbox" data-portal-app="${escapeHtml(app.id)}" ${user.access?.apps?.[app.id] !== false ? 'checked' : ''}><span><b>${escapeHtml(app.name)}</b><br><small>${escapeHtml(app.description || app.url)}</small></span></label>`).join('') || '<p class="info-box">Aucune tuile configurée.</p>';
}

async function saveAccess(event) {
  event.preventDefault();
  const user = selectedAccessUser(); if (!user) return;
  const access = { apps: {} };
  document.querySelectorAll('[data-core-app]').forEach(card => {
    access[card.dataset.coreApp] = { enabled: card.querySelector('[data-access-enabled]').checked, role: card.querySelector('[data-access-role]').value };
  });
  document.querySelectorAll('[data-portal-app]').forEach(input => { access.apps[input.dataset.portalApp] = input.checked; });
  try { await api(`/users/${encodeURIComponent(user.id)}/access`, { method: 'PUT', body: JSON.stringify({ access }) }); await loadEverything(); toast('Autorisations enregistrées.'); }
  catch (error) { toast(error.message, true); }
}

function renderApps() {
  const categories = new Map(state.categories.map(category => [category.id, category]));
  $('appCount').textContent = `${state.apps.length} application${state.apps.length > 1 ? 's' : ''}`;
  $('appList').innerHTML = state.apps.length ? [...state.apps].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map(app => `
    <div class="managed-item" style="--item-accent:${escapeHtml(app.accentColor || '#0878df')}"><span class="accent-line"></span><div class="managed-item-logo">${app.logoData ? `<img src="${escapeHtml(app.logoData)}" alt="">` : escapeHtml(app.name.slice(0, 2).toUpperCase())}</div><div class="managed-item-main"><strong>${escapeHtml(app.name)}</strong><small>${escapeHtml(categories.get(app.categoryId)?.name || 'Sans catégorie')} · ${escapeHtml(app.url)} · ordre ${Number(app.order || 0)}</small></div><div class="managed-item-actions"><button class="link-button" data-action="edit-app" data-id="${escapeHtml(app.id)}">Modifier</button><button class="link-button danger" data-action="delete-app" data-id="${escapeHtml(app.id)}">Supprimer</button></div></div>`).join('') : '<p class="info-box">Aucune application.</p>';
  $('categoryList').innerHTML = [...state.categories].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map(category => {
    const count = state.apps.filter(app => app.categoryId === category.id).length;
    return `<div class="managed-item"><div class="managed-item-main"><strong>${escapeHtml(category.name)}</strong><small>Ordre ${Number(category.order || 0)} · ${count} application${count > 1 ? 's' : ''}</small></div><div class="managed-item-actions"><button class="link-button" data-action="edit-category" data-id="${escapeHtml(category.id)}">Modifier</button><button class="link-button danger" data-action="delete-category" data-id="${escapeHtml(category.id)}">Supprimer</button></div></div>`;
  }).join('');
}

function appForm(app = null) {
  openModal(app ? 'Modifier une application' : 'Nouvelle application', `
    <form id="appModalForm" class="modal-form"><input id="modalAppId" type="hidden" value="${escapeHtml(app?.id || '')}">
      <div class="modal-grid"><label class="field"><span>Nom *</span><input id="modalAppName" value="${escapeHtml(app?.name || '')}" required></label><label class="field"><span>Catégorie *</span><select id="modalAppCategory">${state.categories.map(category => `<option value="${escapeHtml(category.id)}"${app?.categoryId === category.id ? ' selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></label></div>
      <label class="field"><span>Description</span><input id="modalAppDescription" maxlength="180" value="${escapeHtml(app?.description || '')}"></label>
      <label class="field"><span>URL *</span><input id="modalAppUrl" value="${escapeHtml(app?.url || '')}" placeholder="/portail/application/ ou https://…" required></label>
      <div class="modal-grid"><label class="field"><span>Ordre</span><input id="modalAppOrder" type="number" value="${Number(app?.order ?? 10)}"></label><label class="field color-field"><span>Couleur de la tuile</span><input id="modalAppColor" type="color" value="${escapeHtml(app?.accentColor || '#0878df')}"></label></div>
      <label class="field"><span>Logo · 400 Ko maximum</span><input id="modalAppLogo" type="file" accept="image/*"></label>
      ${app?.logoData ? '<label class="check-row"><input id="modalRemoveAppLogo" type="checkbox"> Retirer le logo actuel</label>' : '<input id="modalRemoveAppLogo" type="checkbox" class="hidden">'}
      <p id="modalError" class="form-error"></p><div class="form-footer"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Enregistrer</button></div>
    </form>`, () => {
      document.querySelector('[data-close-modal]').addEventListener('click', closeModal);
      $('appModalForm').addEventListener('submit', saveApp);
      $('modalAppName').focus();
    });
}

async function saveApp(event) {
  event.preventDefault();
  try {
    const file = $('modalAppLogo').files[0];
    const logoData = file ? await imageData(file, 400 * 1024, 700) : '';
    const payload = { id: $('modalAppId').value, name: $('modalAppName').value.trim(), categoryId: $('modalAppCategory').value, description: $('modalAppDescription').value.trim(), url: $('modalAppUrl').value.trim(), order: Number($('modalAppOrder').value || 10), accentColor: $('modalAppColor').value, logoData, removeLogo: $('modalRemoveAppLogo').checked };
    await api('/apps', { method: 'POST', body: JSON.stringify(payload) }); closeModal(); await loadEverything(); toast('Application enregistrée.');
  } catch (error) { $('modalError').textContent = error.message; }
}

async function deleteApp(app) {
  if (!confirm(`Supprimer l’application « ${app.name} » ?`)) return;
  try { await api(`/apps/${encodeURIComponent(app.id)}`, { method: 'DELETE' }); await loadEverything(); toast('Application supprimée.'); }
  catch (error) { toast(error.message, true); }
}

function categoryForm(category = null) {
  openModal(category ? 'Modifier une catégorie' : 'Nouvelle catégorie', `<form id="categoryModalForm" class="modal-form"><label class="field"><span>Nom *</span><input id="modalCategoryName" value="${escapeHtml(category?.name || '')}" required></label><label class="field"><span>Ordre</span><input id="modalCategoryOrder" type="number" value="${Number(category?.order ?? 10)}"></label><p id="modalError" class="form-error"></p><div class="form-footer"><button class="button secondary" type="button" data-close-modal>Annuler</button><button class="button primary" type="submit">Enregistrer</button></div></form>`, () => {
    document.querySelector('[data-close-modal]').addEventListener('click', closeModal);
    $('categoryModalForm').addEventListener('submit', async event => {
      event.preventDefault();
      try { await api('/categories', { method: 'POST', body: JSON.stringify({ id: category?.id || '', name: $('modalCategoryName').value.trim(), order: Number($('modalCategoryOrder').value || 10) }) }); closeModal(); await loadEverything(); toast('Catégorie enregistrée.'); }
      catch (error) { $('modalError').textContent = error.message; }
    });
    $('modalCategoryName').focus();
  });
}

async function deleteCategory(category) {
  if (!confirm(`Supprimer la catégorie « ${category.name} » ?`)) return;
  try { await api(`/categories/${encodeURIComponent(category.id)}`, { method: 'DELETE' }); await loadEverything(); toast('Catégorie supprimée.'); }
  catch (error) { toast(error.message, true); }
}

function renderAppearance() {
  $('appearanceApp').value = state.appearanceApp;
  const item = state.appearance[state.appearanceApp]; if (!item) return;
  $('appearanceTitle').value = item.title || '';
  $('appearanceSubtitle').value = item.subtitle || '';
  $('primaryColor').value = item.primaryColor || '#0878df';
  $('accentColor').value = item.accentColor || '#e40521';
  $('backgroundColor').value = item.backgroundColor || '#eef3f8';
  $('removeLogo').checked = $('removeFavicon').checked = $('removeBackground').checked = false;
  $('appearanceLogo').value = $('appearanceFavicon').value = $('appearanceBackground').value = '';
  $('logoState').textContent = item.logoData ? 'Logo personnalisé actif' : 'Logo d’origine utilisé';
  $('faviconState').textContent = item.faviconData ? 'Icône personnalisée active' : 'Icône d’origine utilisée';
  $('backgroundState').textContent = item.backgroundData ? 'Fond personnalisé actif' : 'Fond d’origine utilisé';
  updateAppearancePreview();
}

function updateAppearancePreview() {
  const stored = state.appearance[state.appearanceApp]; if (!stored) return;
  const item = {
    ...stored,
    title: $('appearanceTitle').value,
    subtitle: $('appearanceSubtitle').value,
    primaryColor: $('primaryColor').value,
    accentColor: $('accentColor').value,
    backgroundColor: $('backgroundColor').value
  };
  const preview = $('appearancePreview');
  preview.style.backgroundColor = item.backgroundColor || '#eef3f8';
  preview.style.backgroundImage = item.backgroundData ? `url(${JSON.stringify(item.backgroundData)})` : 'none';
  preview.innerHTML = `<div class="preview-content"><div class="preview-logo">${item.logoData ? `<img src="${escapeHtml(item.logoData)}" alt="">` : escapeHtml((item.title || state.appearanceApp).slice(0, 2).toUpperCase())}</div><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.subtitle)}</span></div></div>`;
  preview.style.borderTop = `6px solid ${item.accentColor || '#e40521'}`;
}

async function saveAppearance(event) {
  event.preventDefault();
  const appId = state.appearanceApp;
  try {
    const logo = $('appearanceLogo').files[0];
    const favicon = $('appearanceFavicon').files[0];
    const background = $('appearanceBackground').files[0];
    const payload = {
      title: $('appearanceTitle').value.trim(), subtitle: $('appearanceSubtitle').value.trim(), primaryColor: $('primaryColor').value,
      accentColor: $('accentColor').value, backgroundColor: $('backgroundColor').value,
      logoData: logo ? await imageData(logo, 400 * 1024, 800) : '',
      faviconData: favicon ? await imageData(favicon, 400 * 1024, 256) : '',
      backgroundData: background ? await imageData(background, 2 * 1024 * 1024, 1920) : '',
      removeLogo: $('removeLogo').checked, removeFavicon: $('removeFavicon').checked, removeBackground: $('removeBackground').checked
    };
    await api(`/appearance/${encodeURIComponent(appId)}`, { method: 'PUT', body: JSON.stringify(payload) });
    await loadEverything(); toast('Apparence enregistrée. Rechargez l’application concernée pour voir le résultat.');
  } catch (error) { toast(error.message, true); }
}

async function imageData(file, maxBytes, maxDimension) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('Choisissez un fichier image.');
  if (file.type === 'image/svg+xml') {
    if (file.size > maxBytes) throw new Error(`L’image dépasse ${formatBytes(maxBytes)}.`);
    return readDataUrl(file);
  }
  const original = await readDataUrl(file);
  if (file.size <= maxBytes) return original;
  const image = await loadImage(original);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [.86, .76, .66, .56, .46, .36]) {
    const data = canvas.toDataURL('image/webp', quality);
    if (Math.ceil((data.length - data.indexOf(',') - 1) * .75) <= maxBytes) return data;
  }
  throw new Error(`Impossible de réduire cette image sous ${formatBytes(maxBytes)}.`);
}

function readDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('Lecture du fichier impossible.')); reader.readAsDataURL(file); }); }
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image invalide.')); image.src = src; }); }

async function loadHistory() {
  const params = new URLSearchParams();
  if ($('historySearch').value.trim()) params.set('search', $('historySearch').value.trim());
  if ($('historySource').value) params.set('source', $('historySource').value);
  if ($('historyFrom').value) params.set('from', $('historyFrom').value);
  if ($('historyTo').value) params.set('to', $('historyTo').value);
  const data = await api(`/audit?${params}`);
  $('historyRows').innerHTML = data.entries.length ? data.entries.map(item => `<tr><td>${escapeHtml(formatDate(item.date))}</td><td><strong>${escapeHtml(item.actor || item.user || 'Système')}</strong><br><small>${escapeHtml(item.login || '')}</small></td><td><span class="source-chip ${item.source === 'Administration' ? 'admin' : ''}">${escapeHtml(item.source)}</span></td><td>${escapeHtml(item.action || item.type || 'Autre')}</td><td class="history-detail">${escapeHtml(item.details || item.message || '')}</td><td>${escapeHtml(item.ip || '—')}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-row">Aucune trace correspondant aux filtres.</td></tr>';
}

function renderSecurity() { $('passwordMinLength').value = state.security?.passwordMinLength || 6; }

async function saveSecurity(event) {
  event.preventDefault();
  try { await api('/security', { method: 'PUT', body: JSON.stringify({ passwordMinLength: Number($('passwordMinLength').value) }) }); await loadEverything(); toast('Règle de mot de passe enregistrée.'); }
  catch (error) { toast(error.message, true); }
}

async function handleAction(event) {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const id = button.dataset.id;
  const actions = {
    'edit-user': () => userForm(state.users.find(item => item.id === id)),
    'reset-password': () => resetPassword(state.users.find(item => item.id === id)),
    'complete-password-request': () => completePasswordRequest(state.passwordResets.find(item => item.id === id)),
    'dismiss-password-request': () => dismissPasswordRequest(state.passwordResets.find(item => item.id === id)),
    'upload-notification-sound': () => uploadNotificationSound(notificationEventById(id)),
    'test-notification-sound': () => testNotificationSound(notificationEventById(id)),
    'reset-notification-sound': () => resetNotificationSound(notificationEventById(id)),
    'delete-user': () => deleteUser(state.users.find(item => item.id === id)),
    'edit-app': () => appForm(state.apps.find(item => item.id === id)),
    'delete-app': () => deleteApp(state.apps.find(item => item.id === id)),
    'edit-category': () => categoryForm(state.categories.find(item => item.id === id)),
    'delete-category': () => deleteCategory(state.categories.find(item => item.id === id))
  };
  try { await actions[button.dataset.action]?.(); } catch (error) { toast(error.message, true); }
}

function bindEvents() {
  $('navigation').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) switchView(button.dataset.view); });
  document.addEventListener('click', event => {
    const go = event.target.closest('[data-go]'); if (go) switchView(go.dataset.go);
    const reload = event.target.closest('[data-reload]'); if (reload) loadEverything().then(() => toast('Données actualisées.')).catch(error => toast(error.message, true));
  });
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', event => { if (event.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('modal').classList.contains('hidden')) closeModal(); });
  $('newUserBtn').addEventListener('click', () => userForm());
  $('userSearch').addEventListener('input', renderUsers);
  $('userRows').addEventListener('click', handleAction);
  $('passwordResetRows').addEventListener('click', handleAction);
  $('notificationCards').addEventListener('click', handleAction);
  $('saveNotificationsBtn').addEventListener('click', saveNotificationSettings);
  $('testDesktopNotificationBtn').addEventListener('click', testDesktopNotification);
  $('accessUser').addEventListener('change', event => { state.accessUserId = event.target.value; renderAccess(); });
  $('accessForm').addEventListener('submit', saveAccess);
  $('newAppBtn').addEventListener('click', () => appForm());
  $('newCategoryBtn').addEventListener('click', () => categoryForm());
  $('appList').addEventListener('click', handleAction);
  $('categoryList').addEventListener('click', handleAction);
  $('appearanceApp').addEventListener('change', event => { state.appearanceApp = event.target.value; renderAppearance(); });
  $('appearanceForm').addEventListener('submit', saveAppearance);
  ['appearanceTitle', 'appearanceSubtitle', 'primaryColor', 'accentColor', 'backgroundColor'].forEach(id => $(id).addEventListener('input', updateAppearancePreview));
  $('historyFilters').addEventListener('submit', event => { event.preventDefault(); loadHistory().catch(error => toast(error.message, true)); });
  $('refreshHistoryBtn').addEventListener('click', () => loadHistory().catch(error => toast(error.message, true)));
  $('securityForm').addEventListener('submit', saveSecurity);
  const today = new Date(); $('historyTo').value = today.toISOString().slice(0, 10); today.setDate(today.getDate() - 7); $('historyFrom').value = today.toISOString().slice(0, 10);
}

document.addEventListener('DOMContentLoaded', initialize);
