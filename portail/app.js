const state = {
  token: sessionStorage.getItem('pmPortalToken') || '',
  user: null,
  categories: [],
  apps: [],
  appearance: {}
};

const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);

  let response;
  try {
    response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new Error('Le serveur est inaccessible. Réessayez dans quelques secondes.');
  }

  let data = {};
  try { data = await response.json(); } catch {}

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(file);
  });
}

function applyAppearance() {
  const a = {
    title: 'PORTAIL ARGOS',
    subtitle1: 'Police Municipale',
    subtitle2: 'Chalon-sur-Saône',
    eyebrow: 'ARGOS • Portail professionnel',
    loginIntro: 'Portail d’accès aux applications et ressources professionnelles',
    portalWelcome: 'Sélectionnez une application pour l’ouvrir dans un nouvel onglet.',
    loginLogoData: '',
    portalLogoData: '',
    loginBackgroundData: '',
    portalBackgroundData: '',
    ...(state.appearance || {})
  };

  document.title = `${a.title} — ${a.subtitle1} ${a.subtitle2}`.trim();
  $('loginTitle').textContent = a.title;
  $('portalTitle').textContent = a.title;
  $('loginSubtitle1').textContent = a.subtitle1;
  $('portalSubtitle1').textContent = a.subtitle1;
  $('loginSubtitle2').textContent = a.subtitle2;
  $('portalSubtitle2').textContent = a.subtitle2;
  $('loginEyebrow').textContent = a.eyebrow;
  $('portalEyebrow').textContent = a.eyebrow;
  $('loginIntro').lastChild.textContent = ` ${a.loginIntro}`;
  $('welcomeText').textContent = a.portalWelcome;

  $('loginBrandLogo').src = a.loginLogoData || '/portail/logo-pm.png';
  $('portalBrandLogo').src = a.portalLogoData || a.loginLogoData || '/portail/logo-pm.png';

  const loginBg = $('loginView').querySelector('.backdrop');
  const portalBg = $('portalView').querySelector('.portal-backdrop');
  loginBg.style.backgroundImage = a.loginBackgroundData ? `url(${JSON.stringify(a.loginBackgroundData).slice(1, -1)})` : 'none';
  portalBg.style.backgroundImage = a.portalBackgroundData ? `url(${JSON.stringify(a.portalBackgroundData).slice(1, -1)})` : 'none';

  $('appearanceTitle').value = a.title;
  $('appearanceSubtitle1').value = a.subtitle1;
  $('appearanceSubtitle2').value = a.subtitle2;
  $('appearanceEyebrow').value = a.eyebrow;
  $('appearanceLoginIntro').value = a.loginIntro;
  $('appearancePortalWelcome').value = a.portalWelcome;
}

function showLogin() {
  $('portalView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  $('passwordInput').value = '';
  setTimeout(() => $('loginInput').focus(), 0);
}

function showPortal() {
  $('loginView').classList.add('hidden');
  $('portalView').classList.remove('hidden');
  $('userDisplayName').textContent = state.user.name;
  $('welcomeName').textContent = state.user.name;
  $('userRoleBadge').textContent = state.user.role === 'admin' ? 'Administrateur' : 'Utilisateur';
  $('adminOpenBtn').classList.toggle('hidden', state.user.role !== 'admin');
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
  link.append(icon, copy, arrow);
  return link;
}

function renderPortal() {
  const root = $('categoriesRoot');
  root.replaceChildren();

  for (const category of state.categories) {
    const apps = state.apps.filter(app => app.categoryId === category.id);
    const section = document.createElement('section');
    section.className = 'portal-category';

    const header = document.createElement('div');
    header.className = 'category-titlebar';
    const h2 = document.createElement('h2');
    h2.textContent = category.name;
    const count = document.createElement('span');
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
  state.appearance = data.appearance || {};
  applyAppearance();
  renderPortal();
}

async function initialize() {
  try {
    const me = await api('/portail/api/me');
    if (!me.user) {
      applyAppearance();
      return showLogin();
    }
    state.user = me.user;
    await loadPortal();
    showPortal();
  } catch {
    applyAppearance();
    showLogin();
  }
}

async function login(event) {
  event.preventDefault();
  $('loginError').textContent = '';
  const button = $('loginSubmit');
  setBusy(button, true, 'Connexion…');
  try {
    const data = await api('/portail/api/login', {
      method: 'POST',
      body: JSON.stringify({ login: $('loginInput').value.trim(), password: $('passwordInput').value })
    });
    state.token = data.token || '';
    if (state.token) sessionStorage.setItem('pmPortalToken', state.token);
    state.user = data.user;
    await loadPortal();
    showPortal();
  } catch (err) {
    $('loginError').textContent = err.message;
    $('passwordInput').select();
  } finally {
    setBusy(button, false);
  }
}

async function logout() {
  try { await api('/portail/api/logout', { method: 'POST' }); } catch {}
  state.token = '';
  state.user = null;
  sessionStorage.removeItem('pmPortalToken');
  showLogin();
}

function openAdmin() {
  $('adminModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  switchAdminTab('apps');
  loadAdmin().catch(err => alert(err.message));
}

function closeAdmin() {
  $('adminModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function switchAdminTab(name) {
  document.querySelectorAll('.admin-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== name));
}

async function loadAdmin() {
  await loadPortal();
  const usersData = await api('/portail/api/admin/users');
  state.users = usersData.users || [];
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
  $('appCategory').replaceChildren(...state.categories.map(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));

  const appList = $('appAdminList');
  appList.replaceChildren();
  state.apps.forEach(app => {
    const category = state.categories.find(c => c.id === app.categoryId);
    appList.appendChild(adminItem(
      app.name,
      `${category?.name || 'Sans catégorie'} • ordre ${app.order || 0}`,
      [miniButton('Modifier', 'edit-app', app.id), miniButton('Supprimer', 'delete-app', app.id, true)]
    ));
  });
  $('appCountText').textContent = `${state.apps.length} élément${state.apps.length > 1 ? 's' : ''}`;

  const catList = $('categoryAdminList');
  catList.replaceChildren();
  state.categories.forEach(category => {
    const count = state.apps.filter(app => app.categoryId === category.id).length;
    catList.appendChild(adminItem(
      category.name,
      `Ordre ${category.order || 0} • ${count} application${count > 1 ? 's' : ''}`,
      [miniButton('Modifier', 'edit-category', category.id), miniButton('Supprimer', 'delete-category', category.id, true)]
    ));
  });
  $('categoryCountText').textContent = `${state.categories.length} catégorie${state.categories.length > 1 ? 's' : ''}`;

  const userList = $('userAdminList');
  userList.replaceChildren();
  (state.users || []).forEach(user => {
    const accessText = user.accessEnabled === false ? 'Accès ARGOS non autorisé' : (user.role === 'admin' ? 'Administrateur ARGOS' : 'Utilisateur ARGOS');
    const sourceText = user.source === 'Render' ? 'Compte de secours Render' : `PHENIX${user.phenixRole ? ` • rôle ${user.phenixRole}` : ''}`;
    const extra = user.passwordChangeRequired ? ' • mot de passe PHENIX à mettre à jour' : '';
    const chip = user.source === 'Render' ? 'Secours' : (user.accessEnabled === false ? 'Bloqué' : 'PHENIX');
    userList.appendChild(adminItem(`${user.name} — ${user.login}`, `${accessText} • ${sourceText}${extra}`, [], chip));
  });
  $('userCountText').textContent = `${(state.users || []).length} compte${(state.users || []).length > 1 ? 's' : ''}`;
}

function resetAppForm() {
  $('appForm').reset();
  $('appId').value = '';
  $('appOrder').value = '10';
  $('removeLogo').checked = false;
  $('removeLogoRow').classList.add('hidden');
  $('appFormError').textContent = '';
  if (state.categories[0]) $('appCategory').value = state.categories[0].id;
}

function editApp(id) {
  const app = state.apps.find(item => item.id === id);
  if (!app) return;
  $('appId').value = app.id;
  $('appName').value = app.name || '';
  $('appCategory').value = app.categoryId || '';
  $('appDescription').value = app.description || '';
  $('appUrl').value = app.url || '';
  $('appOrder').value = String(app.order || 10);
  $('removeLogo').checked = false;
  $('removeLogoRow').classList.toggle('hidden', !app.logoData);
  $('appFormError').textContent = '';
  switchAdminTab('apps');
}

async function saveApp(event) {
  event.preventDefault();
  $('appFormError').textContent = '';
  const button = event.submitter || $('appForm').querySelector('button[type="submit"]');
  setBusy(button, true, 'Enregistrement…');
  try {
    const file = $('appLogo').files[0];
    const logoData = file ? await fileToDataUrl(file) : '';
    await api('/portail/api/admin/apps', {
      method: 'POST',
      body: JSON.stringify({
        id: $('appId').value,
        name: $('appName').value.trim(),
        description: $('appDescription').value.trim(),
        url: $('appUrl').value.trim(),
        categoryId: $('appCategory').value,
        order: Number($('appOrder').value || 10),
        logoData,
        removeLogo: $('removeLogo').checked
      })
    });
    resetAppForm();
    await loadAdmin();
  } catch (err) {
    $('appFormError').textContent = err.message;
  } finally {
    setBusy(button, false);
  }
}

async function deleteApp(id) {
  if (!confirm('Supprimer cette application ?')) return;
  await api(`/portail/api/admin/apps/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadAdmin();
}

function resetCategoryForm() {
  $('categoryForm').reset();
  $('categoryId').value = '';
  $('categoryOrder').value = '10';
  $('categoryFormError').textContent = '';
}

function editCategory(id) {
  const item = state.categories.find(category => category.id === id);
  if (!item) return;
  $('categoryId').value = item.id;
  $('categoryName').value = item.name || '';
  $('categoryOrder').value = String(item.order || 10);
  $('categoryFormError').textContent = '';
  switchAdminTab('categories');
}

async function saveCategory(event) {
  event.preventDefault();
  $('categoryFormError').textContent = '';
  const button = event.submitter || $('categoryForm').querySelector('button[type="submit"]');
  setBusy(button, true, 'Enregistrement…');
  try {
    await api('/portail/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ id: $('categoryId').value, name: $('categoryName').value.trim(), order: Number($('categoryOrder').value || 10) })
    });
    resetCategoryForm();
    await loadAdmin();
  } catch (err) {
    $('categoryFormError').textContent = err.message;
  } finally {
    setBusy(button, false);
  }
}

async function deleteCategory(id) {
  if (!confirm('Supprimer cette catégorie et toutes ses applications ?')) return;
  await api(`/portail/api/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadAdmin();
}

async function saveAppearance(event) {
  event.preventDefault();
  $('appearanceFormError').textContent = '';
  const button = event.submitter || $('appearanceForm').querySelector('button[type="submit"]');
  setBusy(button, true, 'Enregistrement…');
  try {
    const [loginLogoData, portalLogoData, loginBackgroundData, portalBackgroundData] = await Promise.all([
      fileToDataUrl($('loginLogoFile').files[0]),
      fileToDataUrl($('portalLogoFile').files[0]),
      fileToDataUrl($('loginBackgroundFile').files[0]),
      fileToDataUrl($('portalBackgroundFile').files[0])
    ]);

    const result = await api('/portail/api/admin/appearance', {
      method: 'POST',
      body: JSON.stringify({
        title: $('appearanceTitle').value.trim(),
        subtitle1: $('appearanceSubtitle1').value.trim(),
        subtitle2: $('appearanceSubtitle2').value.trim(),
        eyebrow: $('appearanceEyebrow').value.trim(),
        loginIntro: $('appearanceLoginIntro').value.trim(),
        portalWelcome: $('appearancePortalWelcome').value.trim(),
        loginLogoData,
        portalLogoData,
        loginBackgroundData,
        portalBackgroundData,
        removeLoginLogo: $('removeLoginLogo').checked,
        removePortalLogo: $('removePortalLogo').checked,
        removeLoginBackground: $('removeLoginBackground').checked,
        removePortalBackground: $('removePortalBackground').checked
      })
    });
    state.appearance = result.appearance || {};
    applyAppearance();
    $('appearanceForm').reset();
    applyAppearance();
  } catch (err) {
    $('appearanceFormError').textContent = err.message;
  } finally {
    setBusy(button, false);
  }
}

function handleAdminListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'edit-app') editApp(id);
  if (action === 'delete-app') deleteApp(id).catch(err => alert(err.message));
  if (action === 'edit-category') editCategory(id);
  if (action === 'delete-category') deleteCategory(id).catch(err => alert(err.message));
}

function bindEvents() {
  $('loginForm').addEventListener('submit', login);
  $('logoutBtn').addEventListener('click', logout);
  $('adminOpenBtn').addEventListener('click', openAdmin);
  $('adminCloseBtn').addEventListener('click', closeAdmin);
  $('appForm').addEventListener('submit', saveApp);
  $('categoryForm').addEventListener('submit', saveCategory);
  $('appearanceForm').addEventListener('submit', saveAppearance);
  $('appResetBtn').addEventListener('click', resetAppForm);
  $('categoryResetBtn').addEventListener('click', resetCategoryForm);
  $('appAdminList').addEventListener('click', handleAdminListClick);
  $('categoryAdminList').addEventListener('click', handleAdminListClick);
  document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => switchAdminTab(button.dataset.tab)));
  $('adminModal').addEventListener('click', (event) => { if (event.target === $('adminModal')) closeAdmin(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('adminModal').classList.contains('hidden')) closeAdmin(); });
}

bindEvents();
applyAppearance();
initialize();
