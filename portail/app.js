const state = {
  token: sessionStorage.getItem('pmPortalToken') || '',
  user: null,
  categories: [],
  apps: [],
  users: [],
  appearance: {}
};

const $ = id => document.getElementById(id);

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  let response;
  try {
    response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new Error('Le serveur est inaccessible.');
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(file);
  });
}

function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text || 'Patientez…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function normalizedAppearance() {
  return {
    title: 'Portail ARGOS',
    subtitle1: 'Police Municipale',
    subtitle2: 'Chalon-sur-Saône',
    loginIntro: 'Authentification requise',
    portalWelcome: 'Sélectionnez une application',
    loginLogoData: '',
    portalLogoData: '',
    loginBackgroundData: '',
    portalBackgroundData: '',
    ...state.appearance
  };
}

function applyAppearance() {
  const a = normalizedAppearance();
  document.title = `${a.title} — ${a.subtitle1}`;
  $('loginTitle').textContent = a.title;
  $('portalTitle').textContent = a.title;
  $('loginSubtitle1').textContent = a.subtitle1;
  $('portalSubtitle1').textContent = a.subtitle1;
  $('loginSubtitle2').textContent = a.subtitle2;
  $('portalSubtitle2').textContent = a.subtitle2;
  $('loginInfoBar').textContent = a.loginIntro;
  $('portalInfoBar').textContent = a.portalWelcome;
  $('loginBrandLogo').src = a.loginLogoData || '/portail/logo-pm.png';
  $('portalBrandLogo').src = a.portalLogoData || a.loginLogoData || '/portail/logo-pm.png';
  $('loginBackdrop').style.backgroundImage = a.loginBackgroundData ? `url("${a.loginBackgroundData}")` : 'none';
  $('portalBackdrop').style.backgroundImage = a.portalBackgroundData ? `url("${a.portalBackgroundData}")` : 'none';

  $('appearanceTitle').value = a.title;
  $('appearanceSubtitle1').value = a.subtitle1;
  $('appearanceSubtitle2').value = a.subtitle2;
  $('appearanceLoginIntro').value = a.loginIntro;
  $('appearancePortalWelcome').value = a.portalWelcome;
}

async function loadPublicAppearance() {
  try {
    const data = await api('/portail/api/appearance');
    state.appearance = data.appearance || {};
    applyAppearance();
  } catch {
    applyAppearance();
  }
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
  $('userDisplayName').textContent = state.user?.name || state.user?.login || '—';
  $('adminOpenBtn').classList.toggle('hidden', state.user?.role !== 'admin');
}

function appTile(app) {
  const a = document.createElement('a');
  a.className = 'application-tile';
  a.href = app.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const logo = document.createElement('div');
  logo.className = 'app-logo';
  if (app.logoData) {
    const img = document.createElement('img');
    img.src = app.logoData;
    img.alt = '';
    logo.appendChild(img);
  } else {
    logo.classList.add('fallback');
    logo.textContent = '▣';
  }

  const text = document.createElement('div');
  text.className = 'app-text';
  const title = document.createElement('span');
  title.className = 'app-title';
  title.textContent = app.name;
  const desc = document.createElement('span');
  desc.className = 'app-description';
  desc.textContent = app.description || 'Ouvrir l’application';
  text.append(title, desc);
  a.append(logo, text);
  return a;
}

function renderPortal() {
  const root = $('categoriesRoot');
  root.replaceChildren();
  for (const category of state.categories) {
    const panel = document.createElement('section');
    panel.className = 'category-panel';
    const heading = document.createElement('div');
    heading.className = 'category-heading';
    heading.textContent = category.name;
    const body = document.createElement('div');
    body.className = 'category-body';
    const apps = state.apps.filter(app => app.categoryId === category.id);
    if (apps.length) apps.forEach(app => body.appendChild(appTile(app)));
    else {
      const empty = document.createElement('div');
      empty.className = 'empty-category';
      empty.textContent = 'Aucune application disponible.';
      body.appendChild(empty);
    }
    panel.append(heading, body);
    root.appendChild(panel);
  }
}

async function loadPortal() {
  const data = await api('/portail/api/portal');
  state.user = data.user;
  state.categories = data.categories || [];
  state.apps = data.apps || [];
  state.appearance = data.appearance || state.appearance;
  applyAppearance();
  renderPortal();
}

async function initialize() {
  await loadPublicAppearance();
  try {
    const me = await api('/portail/api/me');
    if (!me.user) return showLogin();
    state.user = me.user;
    await loadPortal();
    showPortal();
  } catch {
    showLogin();
  }
}

async function login(event) {
  event.preventDefault();
  $('loginError').classList.add('hidden');
  $('loginError').textContent = '';
  setBusy($('loginSubmit'), true, 'Connexion…');
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
    $('loginError').classList.remove('hidden');
    $('passwordInput').select();
  } finally {
    setBusy($('loginSubmit'), false);
  }
}

async function logout() {
  try { await api('/portail/api/logout', { method: 'POST' }); } catch {}
  state.token = '';
  state.user = null;
  sessionStorage.removeItem('pmPortalToken');
  showLogin();
}

function switchAdminTab(name) {
  document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== name));
}

function openAdmin() {
  $('adminModal').classList.remove('hidden');
  switchAdminTab('apps');
  loadAdmin().catch(err => alert(err.message));
}
function closeAdmin() { $('adminModal').classList.add('hidden'); }

function miniButton(text, action, id, danger = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `admin-mini-btn${danger ? ' danger' : ''}`;
  b.textContent = text;
  b.dataset.action = action;
  b.dataset.id = id;
  return b;
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
  buttons.forEach(b => actions.appendChild(b));
  row.append(main, actions);
  return row;
}

async function loadAdmin() {
  await loadPortal();
  const usersData = await api('/portail/api/admin/users');
  state.users = usersData.users || [];
  renderAdmin();
}

function renderAdmin() {
  $('appCategory').replaceChildren(...state.categories.map(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name; return o;
  }));

  $('appAdminList').replaceChildren(...state.apps.map(app => {
    const cat = state.categories.find(c => c.id === app.categoryId);
    return adminItem(app.name, `${cat?.name || 'Sans catégorie'} • ordre ${app.order || 0}`, [miniButton('Modifier', 'edit-app', app.id), miniButton('Supprimer', 'delete-app', app.id, true)]);
  }));
  $('appCountText').textContent = `(${state.apps.length})`;

  $('categoryAdminList').replaceChildren(...state.categories.map(c => adminItem(c.name, `Ordre ${c.order || 0}`, [miniButton('Modifier', 'edit-category', c.id), miniButton('Supprimer', 'delete-category', c.id, true)])));
  $('categoryCountText').textContent = `(${state.categories.length})`;

  $('userAdminList').replaceChildren(...state.users.map(u => {
    const access = u.accessEnabled === false ? 'Accès ARGOS bloqué' : (u.role === 'admin' ? 'Administrateur ARGOS' : 'Utilisateur ARGOS');
    const source = u.source === 'Render' ? 'Secours Render' : `PHENIX • ${u.phenixRole || 'rôle inconnu'}`;
    return adminItem(`${u.name} — ${u.login}`, `${access} • ${source}${u.passwordChangeRequired ? ' • mot de passe à changer' : ''}`, [], u.source === 'Render' ? 'Secours' : 'PHENIX');
  }));
  $('userCountText').textContent = `(${state.users.length})`;
}

function resetAppForm() {
  $('appForm').reset(); $('appId').value = ''; $('appOrder').value = '10'; $('removeLogoRow').classList.add('hidden'); $('appFormError').textContent = '';
  if (state.categories[0]) $('appCategory').value = state.categories[0].id;
}
function editApp(id) {
  const app = state.apps.find(a => a.id === id); if (!app) return;
  $('appId').value = app.id; $('appName').value = app.name || ''; $('appCategory').value = app.categoryId || ''; $('appDescription').value = app.description || ''; $('appUrl').value = app.url || ''; $('appOrder').value = String(app.order || 10);
  $('removeLogoRow').classList.toggle('hidden', !app.logoData); switchAdminTab('apps');
}
async function saveApp(event) {
  event.preventDefault(); const btn = event.submitter; setBusy(btn, true, 'Enregistrement…'); $('appFormError').textContent = '';
  try {
    const logoData = await fileToDataUrl($('appLogo').files[0]);
    await api('/portail/api/admin/apps', { method: 'POST', body: JSON.stringify({ id:$('appId').value,name:$('appName').value.trim(),description:$('appDescription').value.trim(),url:$('appUrl').value.trim(),categoryId:$('appCategory').value,order:Number($('appOrder').value||10),logoData,removeLogo:$('removeLogo').checked }) });
    resetAppForm(); await loadAdmin();
  } catch (err) { $('appFormError').textContent = err.message; }
  finally { setBusy(btn, false); }
}
async function deleteApp(id) { if (!confirm('Supprimer cette application ?')) return; await api(`/portail/api/admin/apps/${encodeURIComponent(id)}`, {method:'DELETE'}); await loadAdmin(); }

function resetCategoryForm(){ $('categoryForm').reset(); $('categoryId').value=''; $('categoryOrder').value='10'; $('categoryFormError').textContent=''; }
function editCategory(id){ const c=state.categories.find(x=>x.id===id); if(!c)return; $('categoryId').value=c.id; $('categoryName').value=c.name; $('categoryOrder').value=String(c.order||10); switchAdminTab('categories'); }
async function saveCategory(event){
  event.preventDefault(); const btn=event.submitter; setBusy(btn,true,'Enregistrement…'); $('categoryFormError').textContent='';
  try { await api('/portail/api/admin/categories',{method:'POST',body:JSON.stringify({id:$('categoryId').value,name:$('categoryName').value.trim(),order:Number($('categoryOrder').value||10)})}); resetCategoryForm(); await loadAdmin(); }
  catch(err){ $('categoryFormError').textContent=err.message; } finally{ setBusy(btn,false); }
}
async function deleteCategory(id){ if(!confirm('Supprimer cette catégorie et ses applications ?'))return; await api(`/portail/api/admin/categories/${encodeURIComponent(id)}`,{method:'DELETE'}); await loadAdmin(); }

async function saveAppearance(event){
  event.preventDefault(); const btn=event.submitter; setBusy(btn,true,'Enregistrement…'); $('appearanceFormError').textContent='';
  try{
    const [loginLogoData,portalLogoData,loginBackgroundData,portalBackgroundData]=await Promise.all([
      fileToDataUrl($('loginLogoFile').files[0]),fileToDataUrl($('portalLogoFile').files[0]),fileToDataUrl($('loginBackgroundFile').files[0]),fileToDataUrl($('portalBackgroundFile').files[0])
    ]);
    const data=await api('/portail/api/admin/appearance',{method:'POST',body:JSON.stringify({
      title:$('appearanceTitle').value.trim(),subtitle1:$('appearanceSubtitle1').value.trim(),subtitle2:$('appearanceSubtitle2').value.trim(),eyebrow:'ARGOS',loginIntro:$('appearanceLoginIntro').value.trim(),portalWelcome:$('appearancePortalWelcome').value.trim(),loginLogoData,portalLogoData,loginBackgroundData,portalBackgroundData,removeLoginLogo:$('removeLoginLogo').checked,removePortalLogo:$('removePortalLogo').checked,removeLoginBackground:$('removeLoginBackground').checked,removePortalBackground:$('removePortalBackground').checked
    })});
    state.appearance=data.appearance||{}; applyAppearance();
    $('loginLogoFile').value=''; $('portalLogoFile').value=''; $('loginBackgroundFile').value=''; $('portalBackgroundFile').value='';
    $('removeLoginLogo').checked=false; $('removePortalLogo').checked=false; $('removeLoginBackground').checked=false; $('removePortalBackground').checked=false;
  }catch(err){ $('appearanceFormError').textContent=err.message; } finally{ setBusy(btn,false); }
}

function listAction(event){
  const b=event.target.closest('button[data-action]'); if(!b)return;
  if(b.dataset.action==='edit-app') editApp(b.dataset.id);
  if(b.dataset.action==='delete-app') deleteApp(b.dataset.id).catch(e=>alert(e.message));
  if(b.dataset.action==='edit-category') editCategory(b.dataset.id);
  if(b.dataset.action==='delete-category') deleteCategory(b.dataset.id).catch(e=>alert(e.message));
}

$('loginForm').addEventListener('submit',login);
$('logoutBtn').addEventListener('click',logout);
$('adminOpenBtn').addEventListener('click',openAdmin);
$('adminCloseBtn').addEventListener('click',closeAdmin);
$('appForm').addEventListener('submit',saveApp);
$('categoryForm').addEventListener('submit',saveCategory);
$('appearanceForm').addEventListener('submit',saveAppearance);
$('appResetBtn').addEventListener('click',resetAppForm);
$('categoryResetBtn').addEventListener('click',resetCategoryForm);
$('appAdminList').addEventListener('click',listAction);
$('categoryAdminList').addEventListener('click',listAction);
document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>switchAdminTab(b.dataset.tab)));
$('adminModal').addEventListener('click',e=>{if(e.target===$('adminModal'))closeAdmin()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('adminModal').classList.contains('hidden'))closeAdmin()});

initialize();
