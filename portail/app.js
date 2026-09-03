'use strict';

const state = {
  token: sessionStorage.getItem('pmPortalToken') || '',
  user: null,
  categories: [],
  apps: [],
  users: []
};

const el = id => document.getElementById(id);

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'no-store'
    });
  } catch {
    throw new Error('Le serveur est inaccessible. Réessayez dans quelques secondes.');
  }

  let data = {};
  try { data = await response.json(); } catch { /* réponse vide */ }

  if (response.status === 401 && url !== '/portail/api/login') {
    state.token = '';
    state.user = null;
    sessionStorage.removeItem('pmPortalToken');
    showLogin();
  }

  if (!response.ok) throw new Error(data.message || data.error || `Erreur ${response.status}`);
  return data;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label || 'Veuillez patienter…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function showLogin() {
  el('portalView').classList.add('hidden');
  el('loginView').classList.remove('hidden');
  el('passwordInput').value = '';
  setTimeout(() => el('loginInput').focus(), 0);
}

function showPortal() {
  el('loginView').classList.add('hidden');
  el('portalView').classList.remove('hidden');
  el('userDisplayName').textContent = state.user.name;
  el('welcomeName').textContent = state.user.name;
  el('userRoleBadge').textContent = state.user.role === 'admin' ? 'Administrateur' : 'Utilisateur';
  el('adminOpenBtn').classList.toggle('hidden', state.user.role !== 'admin');
}

function appCard(app) {
  const link = document.createElement('a');
  link.className = 'application-card';
  link.href = app.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const icon = document.createElement('div');
  icon.className = 'app-icon';
  if (app.logoData) {
    const img = document.createElement('img');
    img.src = app.logoData;
    img.alt = '';
    icon.appendChild(img);
  } else {
    icon.classList.add('fallback');
    icon.textContent = '↗';
  }

  const copy = document.createElement('div');
  copy.className = 'app-copy';
  const title = document.createElement('h3');
  title.textContent = app.name;
  const desc = document.createElement('p');
  desc.textContent = app.description || 'Ouvrir l’application';
  copy.append(title, desc);

  const arrow = document.createElement('span');
  arrow.className = 'app-arrow';
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden', 'true');

  link.append(icon, copy, arrow);
  return link;
}

function renderPortal() {
  const root = el('categoriesRoot');
  root.replaceChildren();

  for (const category of state.categories) {
    const section = document.createElement('section');
    section.className = 'portal-category';

    const header = document.createElement('div');
    header.className = 'category-titlebar';
    const h2 = document.createElement('h2');
    h2.textContent = category.name;
    const count = document.createElement('span');
    const apps = state.apps.filter(app => app.categoryId === category.id);
    count.textContent = `${apps.length} application${apps.length > 1 ? 's' : ''}`;
    header.append(h2, count);

    if (apps.length) {
      const grid = document.createElement('div');
      grid.className = 'app-grid';
      apps.forEach(app => grid.appendChild(appCard(app)));
      section.append(header, grid);
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-category';
      empty.textContent = 'Aucune application disponible dans cette catégorie.';
      section.append(header, empty);
    }
    root.appendChild(section);
  }
}

async function loadPortal() {
  const data = await api('/portail/api/portal');
  state.user = data.user;
  state.categories = data.categories || [];
  state.apps = data.apps || [];
  renderPortal();
}

async function initialize() {
  try {
    const me = await api('/portail/api/me');
    if (!me.user) return showLogin();
    state.user = me.user;
    await loadPortal();
    showPortal();
  } catch (err) {
    console.error(err);
    showLogin();
  }
}

async function login(event) {
  event.preventDefault();
  const error = el('loginError');
  const button = el('loginSubmit');
  error.textContent = '';
  setBusy(button, true, 'Connexion…');

  try {
    const data = await api('/portail/api/login', {
      method: 'POST',
      body: JSON.stringify({
        login: el('loginInput').value.trim(),
        password: el('passwordInput').value
      })
    });
    state.token = data.token || '';
    if (state.token) sessionStorage.setItem('pmPortalToken', state.token);
    state.user = data.user;
    await loadPortal();
    showPortal();
  } catch (err) {
    error.textContent = err.message;
    el('passwordInput').select();
  } finally {
    setBusy(button, false);
  }
}

async function logout() {
  try { await api('/portail/api/logout', { method: 'POST' }); } catch { /* local logout anyway */ }
  state.token = '';
  state.user = null;
  sessionStorage.removeItem('pmPortalToken');
  showLogin();
}

function openAdmin() {
  el('adminModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  switchAdminTab('apps');
  loadAdmin().catch(err => alert(err.message));
}

function closeAdmin() {
  el('adminModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function switchAdminTab(name) {
  document.querySelectorAll('.admin-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== name));
}

async function loadAdmin() {
  await loadPortal();
  const users = await api('/portail/api/admin/users');
  state.users = users.users || [];
  renderAdmin();
}

function miniButton(text, action, id, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `admin-mini-btn${danger ? ' danger' : ''}`;
  button.textContent = text;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

function adminItem(titleText, subtitleText, buttons = [], chipText = '') {
  const row = document.createElement('div');
  row.className = 'admin-item';
  const main = document.createElement('div');
  main.className = 'admin-item-main';
  const title = document.createElement('strong');
  title.textContent = titleText;
  const subtitle = document.createElement('span');
  subtitle.textContent = subtitleText;
  main.append(title, subtitle);
  if (chipText) {
    const chip = document.createElement('span');
    chip.className = 'protected-chip';
    chip.textContent = chipText;
    main.appendChild(chip);
  }
  const actions = document.createElement('div');
  actions.className = 'admin-item-actions';
  buttons.forEach(button => actions.appendChild(button));
  row.append(main, actions);
  return row;
}

function renderAdmin() {
  el('appCategory').replaceChildren(...state.categories.map(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));

  const appList = el('appAdminList');
  appList.replaceChildren();
  state.apps.forEach(app => {
    const category = state.categories.find(c => c.id === app.categoryId);
    appList.appendChild(adminItem(
      app.name,
      `${category?.name || 'Sans catégorie'} • ordre ${app.order || 0}`,
      [miniButton('Modifier', 'edit-app', app.id), miniButton('Supprimer', 'delete-app', app.id, true)]
    ));
  });
  el('appCountText').textContent = `${state.apps.length} élément${state.apps.length > 1 ? 's' : ''}`;

  const catList = el('categoryAdminList');
  catList.replaceChildren();
  state.categories.forEach(category => {
    const count = state.apps.filter(app => app.categoryId === category.id).length;
    catList.appendChild(adminItem(
      category.name,
      `Ordre ${category.order || 0} • ${count} application${count > 1 ? 's' : ''}`,
      [miniButton('Modifier', 'edit-category', category.id), miniButton('Supprimer', 'delete-category', category.id, true)]
    ));
  });
  el('categoryCountText').textContent = `${state.categories.length} catégorie${state.categories.length > 1 ? 's' : ''}`;

  const userList = el('userAdminList');
  userList.replaceChildren();
  state.users.forEach(user => {
    const isRender = user.source === 'Render';
    const accessText = user.accessEnabled === false
      ? 'Accès ARGOS désactivé'
      : (user.role === 'admin' ? 'Administrateur ARGOS' : 'Utilisateur ARGOS');
    const sourceText = isRender
      ? 'Compte de secours Render'
      : `PHENIX${user.phenixRole ? ` • rôle ${user.phenixRole}` : ''}`;
    const passwordText = user.passwordChangeRequired ? ' • mot de passe PHENIX à changer' : '';
    userList.appendChild(adminItem(
      `${user.name} — ${user.login}`,
      `${accessText} • ${sourceText}${passwordText}`,
      [],
      isRender ? 'Secours Render' : (user.accessEnabled === false ? 'Non autorisé' : 'Compte PHENIX')
    ));
  });
  el('userCountText').textContent = `${state.users.length} compte${state.users.length > 1 ? 's' : ''} • source PHENIX`;
}

function resetAppForm() {
  el('appForm').reset();
  el('appId').value = '';
  el('appOrder').value = '10';
  el('removeLogo').checked = false;
  el('removeLogoRow').classList.add('hidden');
  el('appFormError').textContent = '';
  if (state.categories[0]) el('appCategory').value = state.categories[0].id;
}

function editApp(id) {
  const app = state.apps.find(item => item.id === id);
  if (!app) return;
  el('appId').value = app.id;
  el('appName').value = app.name;
  el('appDescription').value = app.description || '';
  el('appUrl').value = app.url;
  el('appCategory').value = app.categoryId;
  el('appOrder').value = String(app.order ?? 10);
  el('appLogo').value = '';
  el('removeLogo').checked = false;
  el('removeLogoRow').classList.toggle('hidden', !app.logoData);
  el('appFormError').textContent = '';
  el('appName').focus();
}

async function saveApp(event) {
  event.preventDefault();
  const error = el('appFormError');
  error.textContent = '';
  const file = el('appLogo').files[0];
  if (file && file.size > 400 * 1024) {
    error.textContent = 'Le logo doit faire moins de 400 Ko.';
    return;
  }

  let logoData = '';
  if (file) {
    logoData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Impossible de lire le fichier du logo.'));
      reader.readAsDataURL(file);
    });
  }

  const payload = {
    id: el('appId').value,
    name: el('appName').value.trim(),
    description: el('appDescription').value.trim(),
    url: el('appUrl').value.trim(),
    categoryId: el('appCategory').value,
    order: Number(el('appOrder').value || 10),
    removeLogo: el('removeLogo').checked,
    logoData
  };

  try {
    await api('/portail/api/admin/apps', { method: 'POST', body: JSON.stringify(payload) });
    resetAppForm();
    await loadAdmin();
  } catch (err) {
    error.textContent = err.message;
  }
}

async function deleteApp(id) {
  const app = state.apps.find(item => item.id === id);
  if (!app || !confirm(`Supprimer l’application « ${app.name} » ?`)) return;
  await api(`/portail/api/admin/apps/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadAdmin();
}

function resetCategoryForm() {
  el('categoryForm').reset();
  el('categoryId').value = '';
  el('categoryOrder').value = '10';
  el('categoryFormError').textContent = '';
}

function editCategory(id) {
  const category = state.categories.find(item => item.id === id);
  if (!category) return;
  el('categoryId').value = category.id;
  el('categoryName').value = category.name;
  el('categoryOrder').value = String(category.order ?? 10);
  el('categoryFormError').textContent = '';
  el('categoryName').focus();
}

async function saveCategory(event) {
  event.preventDefault();
  const error = el('categoryFormError');
  error.textContent = '';
  try {
    await api('/portail/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({
        id: el('categoryId').value,
        name: el('categoryName').value.trim(),
        order: Number(el('categoryOrder').value || 10)
      })
    });
    resetCategoryForm();
    await loadAdmin();
  } catch (err) {
    error.textContent = err.message;
  }
}

async function deleteCategory(id) {
  const category = state.categories.find(item => item.id === id);
  if (!category || !confirm(`Supprimer la catégorie « ${category.name} » et toutes ses applications ?`)) return;
  await api(`/portail/api/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  resetCategoryForm();
  await loadAdmin();
}

async function createUser(event) {
  event.preventDefault();
  const error = el('userFormError');
  error.textContent = '';
  try {
    await api('/portail/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        name: el('newUserName').value.trim(),
        login: el('newUserLogin').value.trim(),
        password: el('newUserPassword').value,
        role: el('newUserRole').value
      })
    });
    el('userForm').reset();
    await loadAdmin();
  } catch (err) {
    error.textContent = err.message;
  }
}

async function resetUserPassword(id) {
  const user = state.users.find(item => item.id === id);
  if (!user) return;
  const password = prompt(`Nouveau mot de passe pour ${user.login} (12 caractères minimum) :`);
  if (password === null) return;
  if (password.length < 12) return alert('Le mot de passe doit contenir au moins 12 caractères.');
  await api(`/portail/api/admin/users/${encodeURIComponent(id)}/password`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
  alert('Mot de passe mis à jour.');
}

async function deleteUser(id) {
  const user = state.users.find(item => item.id === id);
  if (!user || !confirm(`Supprimer le compte « ${user.login} » ?`)) return;
  await api(`/portail/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadAdmin();
}

function handleAdminAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  const jobs = {
    'edit-app': () => editApp(id),
    'delete-app': () => deleteApp(id),
    'edit-category': () => editCategory(id),
    'delete-category': () => deleteCategory(id),
    'reset-password': () => resetUserPassword(id),
    'delete-user': () => deleteUser(id)
  };
  Promise.resolve(jobs[action]?.()).catch(err => alert(err.message));
}

function bindEvents() {
  el('loginForm').addEventListener('submit', login);
  el('logoutBtn').addEventListener('click', logout);
  el('adminOpenBtn').addEventListener('click', openAdmin);
  el('adminCloseBtn').addEventListener('click', closeAdmin);
  el('adminModal').addEventListener('click', event => { if (event.target === el('adminModal')) closeAdmin(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !el('adminModal').classList.contains('hidden')) closeAdmin(); });

  document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => switchAdminTab(button.dataset.tab)));
  el('appForm').addEventListener('submit', saveApp);
  el('appResetBtn').addEventListener('click', resetAppForm);
  el('appAdminList').addEventListener('click', handleAdminAction);
  el('categoryForm').addEventListener('submit', saveCategory);
  el('categoryResetBtn').addEventListener('click', resetCategoryForm);
  el('categoryAdminList').addEventListener('click', handleAdminAction);
  el('userAdminList').addEventListener('click', handleAdminAction);
}

bindEvents();
initialize();
