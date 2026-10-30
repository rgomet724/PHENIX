'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = { data: null, user: null, appearance: {}, csrf: '', editing: false, dirty: false, selected: '', original: null, history: [], presenting: false, slide: 0, saving: false, pageId: '', nextPageAt: 0, nextSlideAt: 0, rotationPaused: false };
const names = { duty: 'Astreinte direction', news: 'Publications', meetings: 'Réunions', text: 'Texte libre', image: 'Photo', links: 'Liens utiles' };
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M15 9v12"/>',
  apps: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  settings: '<path d="m9 3-1 3-3 1-2 3 2 2v3l3 1 1 3h5l1-3 3-1v-3l2-2-2-3-3-1-1-3z"/><circle cx="11.5" cy="11" r="3"/>',
  logout: '<path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  external: '<path d="M14 3h7v7m-1-6-9 9M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/>',
  phone: '<path d="m7 3 3 5-2 2a14 14 0 0 0 6 6l2-2 5 3-1 4C10 22 2 14 3 4z"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/>',
  monitor: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3c4-6-2-10-7-10z"/><circle cx="7" cy="10" r=".7"/><circle cx="10" cy="6" r=".7"/><circle cx="15" cy="6" r=".7"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h5v5H7zM16 8h1M16 12h1M7 16h10"/>',
  meetings: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m5 0h3"/>',
  text: '<path d="M4 5h16M12 5v15M8 20h8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  links: '<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
  grip: '<circle cx="8" cy="5" r=".6"/><circle cx="8" cy="12" r=".6"/><circle cx="8" cy="19" r=".6"/><circle cx="15" cy="5" r=".6"/><circle cx="15" cy="12" r=".6"/><circle cx="15" cy="19" r=".6"/>',
  up: '<path d="m6 14 6-6 6 6"/>', down: '<path d="m6 10 6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  pin: '<path d="m9 3 9 9-4 1-3 4-4-4-4-4 4-3zM8 16l-5 5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name === 'duty' ? 'phone' : name] || paths.grid}</svg>`;
const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const format = (value, options) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...options }).format(new Date(value));
const shortDate = value => format(value, { day: 'numeric', month: 'short' });
const fullDate = value => format(value, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const time = value => format(value, { hour: '2-digit', minute: '2-digit' });
const boardSnapshot = () => structuredClone({ settings: state.data.settings, duty: state.data.duty, pages: state.data.pages, blocks: state.data.blocks });
let toastTimer, dragId = '', modalGeneration = 0, resizing = null;
const photoUploads = new Map();

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), error ? 6500 : 3800);
}

async function api(route, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = options.method || 'GET';
  let body = options.body;
  if (body !== undefined && !(body instanceof Blob)) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
  if (method !== 'GET') headers.set('X-CSRF-Token', state.csrf);
  let response;
  try { response = await fetch(`/dashboard/api${route}`, { ...options, method, body, headers, credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw new Error('Connexion interrompue. Vérifiez votre connexion puis réessayez.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Object.assign(new Error(result.error || 'Le serveur ne peut pas traiter cette demande.'), { status: response.status });
    if (response.status === 401 && !['/login', '/password'].includes(route) || response.status === 403 && result.code === 'ACCESS_DISABLED') showLogin(error.message);
    throw error;
  }
  return result;
}

function showLogin(message = '') {
  if (state.presenting) stopPresentation();
  if ($('modal').open) { modalGeneration++; abortPhotos(); $('modal').close(); }
  $('app').classList.add('hidden'); $('login-screen').classList.remove('hidden'); $('login-error').textContent = message;
  $('board').replaceChildren(); state.user = null; state.data = null; state.editing = false; state.dirty = false;
  state.pageId = ''; state.nextPageAt = 0; state.nextSlideAt = 0;
}

async function loadState(initial = false) {
  try {
    const result = await api('/state');
    if (state.editing && !initial) return;
    Object.assign(state, { data: result.dashboard, user: result.user, csrf: result.csrfToken, appearance: result.appearance || {} });
    $('login-screen').classList.add('hidden'); $('app').classList.remove('hidden'); $('connection-status').classList.add('hidden');
    render();
  } catch (error) {
    if ([401, 403, 428].includes(error.status)) showLogin(initial && error.status === 401 ? '' : error.message);
    else if (state.data) { $('connection-status').textContent = `${error.message} Les dernières informations reçues restent affichées.`; $('connection-status').classList.remove('hidden'); }
    else $('login-error').textContent = error.message;
    if (!initial) throw error;
  }
}

function render() {
  if (!state.data) return;
  const s = state.data.settings, appearance = state.appearance;
  document.documentElement.style.setProperty('--accent', s.accent || appearance.accentColor || '#16877b');
  document.documentElement.style.setProperty('--paper', s.background || appearance.backgroundColor || '#f3f5f3');
  document.documentElement.style.setProperty('--navy', appearance.primaryColor || '#123b53');
  document.body.classList.remove('font-system', 'font-serif', 'font-rounded', 'font-mono'); document.body.classList.add(`font-${s.font}`);
  const title = s.title || appearance.title || 'La vie du service';
  $('page-title').textContent = title; document.title = `${title} · Dashboard`;
  const subtitle = s.subtitle || appearance.subtitle || '';
  $('page-subtitle').textContent = subtitle; $('page-subtitle').classList.toggle('hidden', !subtitle);
  const logo = s.logo || appearance.logoData;
  $('page-logo').classList.toggle('hidden', !logo); if (logo) $('page-logo').src = logo; else $('page-logo').removeAttribute('src');
  const backgroundImage = s.backgroundImage || appearance.backgroundData;
  document.querySelector('.main').style.backgroundImage = backgroundImage ? `linear-gradient(#f3f5f3dd,#f3f5f3dd),url("${backgroundImage}")` : '';
  document.querySelector('link[rel="icon"]').href = appearance.faviconData || '/dashboard/favicon.svg';
  $('user-name').textContent = state.user.name; $('avatar').textContent = initials(state.user.name);
  $('edit-page').classList.toggle('hidden', !state.user.canEdit || state.editing);
  $('admin-link').classList.toggle('hidden', !state.user.centralAdmin);
  $('edit-toolbar').classList.toggle('hidden', !state.editing); $('inspector').classList.toggle('hidden', !state.editing);
  $('workspace').classList.toggle('editing', state.editing);
  $('updated').textContent = state.data.updatedAt ? `Mis à jour le ${fullDate(state.data.updatedAt)}${state.data.updatedBy?.name ? ` par ${state.data.updatedBy.name}` : ''}` : 'Aucune modification enregistrée';
  renderPageBar(); renderBoard(); renderInspector(); updateSaveStatus(); updateClock();
}

function updateClock() {
  $('today').textContent = format(Date.now(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('clock').textContent = state.data?.settings.showClock ? `${time(Date.now())} · Paris` : '';
}

function currentPageBlocks() { return DashboardPages.pageBlocks(state.data, state.pageId, state.editing); }

function renderPageBar() {
  const pages = state.data.pages;
  if (!pages.some(page => page.id === state.pageId)) state.pageId = pages[0].id;
  if (!state.nextPageAt) state.nextPageAt = Date.now() + DashboardPages.PAGE_INTERVAL_MS;
  const blocks = currentPageBlocks();
  if (!blocks.some(block => block.id === state.selected)) state.selected = blocks[0]?.id || '';
  $('page-tabs').innerHTML = pages.map((page, index) => `<button type="button" role="tab" aria-selected="${page.id === state.pageId}" class="page-tab${page.id === state.pageId ? ' active' : ''}" data-page="${esc(page.id)}"><span>${index + 1}</span>${esc(page.title)}</button>`).join('');
  $('previous-page').disabled = pages.length < 2; $('next-page').disabled = pages.length < 2;
  $('manage-pages').classList.toggle('hidden', !state.user.canEdit || state.presenting);
  updateRotationStatus();
}

function setCurrentPage(id, manual = true) {
  if (!state.data.pages.some(page => page.id === id)) return;
  state.pageId = id; state.selected = '';
  if (manual) { state.nextPageAt = Date.now() + DashboardPages.PAGE_INTERVAL_MS; state.slide = 0; }
  renderPageBar(); renderBoard(); renderInspector();
  window.scrollTo({ top: 0, behavior: manual ? 'smooth' : 'auto' });
}

function updateRotationStatus(now = Date.now()) {
  if (!state.data) return;
  const paused = state.rotationPaused || state.editing || $('modal').open;
  const remaining = Math.max(0, Math.ceil((state.nextPageAt - now) / 1000));
  const index = state.data.pages.findIndex(page => page.id === state.pageId) + 1;
  $('rotation-status').textContent = state.editing ? 'Défilement suspendu · édition' : paused ? 'Défilement en pause' : state.data.pages.length < 2 ? '1 page' : `${index} / ${state.data.pages.length} · prochaine page ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  $('toggle-rotation').textContent = state.rotationPaused ? 'Reprendre' : 'Pause';
  $('toggle-rotation').setAttribute('aria-pressed', String(state.rotationPaused));
  $('toggle-rotation').classList.toggle('hidden', state.editing || state.data.pages.length < 2 && !state.presenting);
}

function rotationTick() {
  if (!state.data || !state.user) return;
  const now = Date.now(), paused = state.rotationPaused || state.editing || state.saving || $('modal').open || document.hidden || Boolean(resizing);
  const next = DashboardPages.rotationStep(state.data.pages, state.pageId, state.nextPageAt, now, paused);
  state.nextPageAt = next.nextAt;
  if (next.changed) setCurrentPage(next.pageId, false);
  if (paused || !state.nextSlideAt) state.nextSlideAt = now + (state.data.settings.displaySeconds || 20) * 1000;
  if (!paused && state.presenting && now >= state.nextSlideAt) {
    state.slide++; state.nextSlideAt = now + (state.data.settings.displaySeconds || 20) * 1000; renderBoard();
  }
  updateRotationStatus(now);
}

function pagesManager() {
  beginEdit();
  openModal('Pages du dashboard', `<div id="page-manager-list" class="page-manager-list">${state.data.pages.map((page, index) => `<div class="page-manager-row" data-managed-page="${esc(page.id)}"><span class="page-number">${index + 1}</span><label><span class="sr-only">Nom de la page ${index + 1}</span><input data-page-name value="${esc(page.title)}" maxlength="80" required></label><div class="page-manager-actions"><button type="button" class="icon-button" data-page-op="up" title="Déplacer avant" aria-label="Déplacer la page avant"${index === 0 ? ' disabled' : ''}>${icon('up')}</button><button type="button" class="icon-button" data-page-op="down" title="Déplacer après" aria-label="Déplacer la page après"${index === state.data.pages.length - 1 ? ' disabled' : ''}>${icon('down')}</button><button type="button" class="icon-button" data-page-op="copy" title="Dupliquer la page" aria-label="Dupliquer cette page">${icon('copy')}</button><button type="button" class="icon-button danger" data-page-op="delete" title="Supprimer la page" aria-label="Supprimer cette page"${state.data.pages.length === 1 ? ' disabled' : ''}>${icon('trash')}</button></div></div>`).join('')}</div><form id="add-page-form" class="add-page-form"><label>Nouvelle page<input id="new-page-title" value="Page ${state.data.pages.length + 1}" maxlength="80" required></label><button class="button secondary" type="submit">${icon('plus')}Ajouter une page</button></form><p class="form-note">Les pages défilent toutes les minutes. Le défilement est suspendu pendant la modification. Enregistrez la page pour partager vos changements.</p><div class="modal-actions"><button class="button primary" type="button" data-close>Terminer</button></div>`, 'MISE EN PAGE');
  $('add-page-form').onsubmit = event => {
    event.preventDefault(); if (state.data.pages.length >= 20) return toast('Le dashboard peut contenir au maximum 20 pages.', true);
    const title = $('new-page-title').value.trim(); if (!title) return;
    change(() => { const page = { id: crypto.randomUUID(), title }; state.data.pages.push(page); state.pageId = page.id; state.selected = ''; });
    closeModal(); toast('Page ajoutée. Vous pouvez y ajouter des blocs.');
  };
  $('page-manager-list').addEventListener('change', event => {
    if (!event.target.matches('[data-page-name]')) return;
    const page = state.data.pages.find(item => item.id === event.target.closest('[data-managed-page]').dataset.managedPage);
    const title = event.target.value.trim(); if (!title) { event.target.value = page.title; return; }
    change(() => { page.title = title; });
  });
  $('page-manager-list').addEventListener('click', event => {
    const operation = event.target.closest('[data-page-op]')?.dataset.pageOp; if (!operation) return;
    const id = event.target.closest('[data-managed-page]').dataset.managedPage;
    const page = state.data.pages.find(item => item.id === id), index = state.data.pages.indexOf(page);
    if (operation === 'delete') {
      if (state.data.pages.length < 2) return;
      const target = state.data.pages.find(item => item.id !== id);
      if (!confirm(`Supprimer « ${page.title} » ? Ses blocs seront déplacés vers « ${target.title} ».`)) return;
      change(() => { state.data.blocks.forEach(block => { if (block.pageId === id) block.pageId = target.id; }); state.data.pages.splice(index, 1); if (state.pageId === id) state.pageId = target.id; });
    } else if (operation === 'copy') {
      const blocks = DashboardPages.pageBlocks(state.data, id, true);
      if (state.data.pages.length >= 20 || state.data.blocks.length + blocks.length > 120) return toast('La limite de pages ou de blocs est atteinte.', true);
      change(() => {
        const copy = { id: crypto.randomUUID(), title: `${page.title} · Copie`.slice(0, 80) };
        state.data.pages.splice(index + 1, 0, copy);
        state.data.blocks.push(...blocks.map(block => ({ ...structuredClone(block), id: crypto.randomUUID(), pageId: copy.id, items: block.items.map(item => ({ ...item, id: crypto.randomUUID() })) })));
        state.pageId = copy.id;
      });
    } else {
      const destination = index + (operation === 'up' ? -1 : 1); if (destination < 0 || destination >= state.data.pages.length) return;
      change(() => { state.data.pages.splice(index, 1); state.data.pages.splice(destination, 0, page); });
    }
    pagesManager();
  });
}

function actionButton(action, label, symbol, extra = '') {
  return `<button type="button" class="tiny-button" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${esc(label)}</button>`;
}

function empty(symbol, title, description, action = '', label = '', className = '') {
  return `<div class="empty-state ${className}"><span class="empty-icon">${icon(symbol)}</span><h3>${esc(title)}</h3><p>${esc(description)}</p>${action && state.user.canEdit ? `<button class="button small secondary" data-action="${action}">${icon('plus')}${esc(label)}</button>` : ''}</div>`;
}

function sortedPosts() {
  return [...state.data.posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function postHtml(post, compact = false, detail = false) {
  const edit = state.user.canEdit && !state.presenting;
  const shortened = !detail && post.body.length > (compact ? 180 : 450);
  const body = shortened ? post.body.slice(0, compact ? 180 : 450) + '…' : post.body;
  return `<article class="post${compact ? ' compact' : ''}" data-post="${esc(post.id)}">
    ${post.image ? `<img class="post-photo" src="${esc(post.image)}" alt="${esc(post.title)}" loading="lazy" data-action="view-photo">` : ''}
    ${post.pinned ? `<span class="pin">${icon('pin')} À LA UNE</span>` : ''}
    <h3>${detail ? esc(post.title) : `<button class="post-title-button" data-action="read-post" type="button">${esc(post.title)}</button>`}</h3>${body ? `<p>${esc(body)}</p>` : ''}${shortened ? actionButton('read-post', 'Lire la suite', 'arrow') : ''}
    <div class="post-meta"><span class="author-avatar">${esc(initials(post.createdBy?.name))}</span><b>${esc(post.createdBy?.name || 'Auteur non renseigné')}</b><i class="post-dot"></i><span>${esc(shortDate(post.createdAt))} à ${esc(time(post.createdAt))}</span>${edit ? `<div class="post-actions"><button data-action="edit-post">Modifier</button><button data-action="delete-post">Supprimer</button></div>` : ''}</div>
    ${post.updatedAt ? `<div class="post-edited">Modifié le ${esc(fullDate(post.updatedAt))}${post.updatedBy?.name ? ` par ${esc(post.updatedBy.name)}` : ''}</div>` : ''}
  </article>`;
}

function meetingHtml(item, blockId, detail = false) {
  const past = Date.parse(item.end || item.start) < Date.now();
  return `<article class="meeting${past ? ' meeting-past' : ''}" data-meeting="${esc(item.id)}" data-owner="${esc(blockId)}"><div class="meeting-date"><b>${esc(format(item.start, { day: '2-digit' }))}</b><span>${esc(format(item.start, { month: 'short' }).replace('.', ''))}</span></div><div class="meeting-copy"><h3>${esc(item.title)}</h3><div class="meeting-detail">${icon('clock')}<span>${esc(time(item.start))}${item.end ? ` – ${esc(time(item.end))}` : ''} · Paris</span></div>${item.location ? `<div class="meeting-detail">${icon('location')}<span>${esc(item.location)}</span></div>` : ''}${detail && item.description ? `<p>${esc(item.description)}</p>` : ''}${past ? '<span class="meeting-tag">Passée</span>' : ''}<div class="meeting-tools">${actionButton('meeting-detail', 'Détails', '')}${state.editing ? actionButton('edit-meeting', 'Modifier', '') + actionButton('delete-meeting', 'Supprimer', '') : ''}</div></div></article>`;
}

function renderBlockBody(block) {
  if (block.kind === 'duty') {
    const duty = state.data.duty, phone = duty.phone.replace(/[^0-9+*#]/g, '');
    return `<div class="duty-card-body"><div class="duty-card-icon">${icon('phone')}</div><strong>${esc(duty.name || 'Astreinte à renseigner')}</strong>${duty.phone ? `<a href="${phone ? `tel:${esc(phone)}` : '#'}">${esc(duty.phone)}</a>` : '<span class="duty-missing">Aucun numéro renseigné</span>'}${duty.note ? `<p>${esc(duty.note)}</p>` : ''}</div>`;
  }
  if (block.kind === 'news') {
    const posts = sortedPosts().filter(post => !block.postId || post.id === block.postId);
    if (!posts.length) return `<div class="card-content">${empty('news', 'Aucune publication', 'Les publications du service apparaîtront ici.', 'new-post', 'Créer une publication', 'news-empty')}</div>`;
    const limit = block.postId ? 1 : block.newsLimit;
    const offset = state.presenting && !block.postId ? state.slide % posts.length : 0;
    const shown = [...posts.slice(offset), ...posts.slice(0, offset)].slice(0, limit);
    return `<div class="card-content">${shown.map((post, index) => postHtml(post, index > 0)).join('')}${!state.presenting && posts.length > limit ? actionButton('all-posts', `Voir les ${posts.length} publications`, 'arrow') : ''}</div>`;
  }
  if (block.kind === 'meetings') {
    const items = [...block.items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const future = items.filter(item => Date.parse(item.end || item.start) >= Date.now() - 3600000);
    const shown = state.editing ? items : future.slice(0, 5);
    return `<div class="card-content"><div class="meetings">${shown.length ? shown.map(item => meetingHtml(item, block.id)).join('') : empty('meetings', 'Aucune réunion programmée', 'Les prochaines réunions apparaîtront ici.', state.user.canEdit ? 'add-meeting' : '', 'Ajouter une réunion')}</div>${items.length && !state.presenting ? `<div style="margin-top:18px">${actionButton('all-meetings', 'Tout l’agenda', 'arrow')}</div>` : ''}</div>`;
  }
  if (block.kind === 'text') return `<div class="card-content"><div class="text-body" ${state.editing ? 'contenteditable="plaintext-only" role="textbox" aria-label="Texte du bloc" data-field="body" data-placeholder="Texte de l’information"' : ''}>${esc(block.body)}</div></div>`;
  if (block.kind === 'image') return `<div class="image-content">${block.image ? `<img src="${esc(block.image)}" alt="${esc(block.caption || block.title)}" data-action="view-photo"><p class="image-caption">${esc(block.caption)}</p>` : empty('image', 'Aucune photo', 'Ajoutez une photo ou une affiche.', 'edit-content', 'Choisir une photo')}</div>`;
  return `<div class="card-content"><div class="links-list">${block.items.length ? block.items.map(item => `<a class="useful-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(item.label)}</span>${icon('external')}</a>`).join('') : empty('links', 'Aucun lien', 'Les liens du service apparaîtront ici.', 'edit-content', 'Ajouter des liens')}</div></div>`;
}

function renderBoard() {
  const blocks = DashboardPages.pageBlocks(state.data, state.pageId, state.editing);
  $('board').innerHTML = blocks.length ? blocks.map(block => {
    const editor = state.editing ? `<div class="block-tools"><span class="drag-handle" title="Glisser pour déplacer" aria-hidden="true">${icon('grip')}</span><span class="block-kind">${esc(names[block.kind])}</span><div class="tools-right"><button data-action="move-up" title="Déplacer avant" aria-label="Déplacer ce bloc avant">${icon('up')}</button><button data-action="move-down" title="Déplacer après" aria-label="Déplacer ce bloc après">${icon('down')}</button><button data-action="duplicate" title="Dupliquer" aria-label="Dupliquer ce bloc">${icon('copy')}</button><button data-action="delete-block" title="Supprimer" aria-label="Supprimer ce bloc">${icon('trash')}</button></div></div>` : '';
    const tools = state.user.canEdit && !state.presenting ? block.kind === 'news' ? actionButton('new-post', 'Publier', 'plus') : block.kind === 'duty' ? actionButton('edit-duty', 'Modifier', 'edit') : block.kind === 'meetings' ? actionButton('add-meeting', 'Ajouter', 'plus') : state.editing ? actionButton('edit-content', 'Modifier', 'edit') : '' : '';
    return `<section class="board-card${state.selected === block.id ? ' selected' : ''}${block.hidden ? ' is-hidden' : ''}" data-block="${esc(block.id)}" data-kind="${block.kind}" data-fixed="${block.fixedHeight}" data-images-hidden="${block.imageHeight === 0}" style="--post-image-height:${Number(block.imageHeight)}px;--post-image-width:${Number(block.imageWidth)}%;--post-image-fit:${esc(block.imageFit)};--width:${Number(block.width)};--height:${Number(block.minHeight)}px;--card-bg:${esc(block.background)};--card-color:${esc(block.color)};--text-size:${Number(block.fontSize)}px;--align:${esc(block.align)};--weight:${block.bold ? 650 : 400};--italic:${block.italic ? 'italic' : 'normal'}">${editor}<div class="card-heading"><div class="card-title-group"><span class="card-title-icon">${icon(block.kind)}</span><h2 ${state.editing ? 'contenteditable="plaintext-only" role="textbox" aria-label="Titre du bloc" data-field="title"' : ''}>${esc(block.title)}</h2></div>${tools}</div>${renderBlockBody(block)}${state.editing ? '<span class="resize-handle" title="Glisser pour redimensionner le bloc" aria-hidden="true"></span>' : ''}</section>`;
  }).join('') : `<div class="no-blocks">${empty('layout', 'Aucun bloc', 'Ajoutez un bloc depuis le mode édition.', state.user.canEdit ? 'add-block' : '', 'Ajouter un bloc')}</div>`;
}

function selectedBlock() { return state.data?.blocks.find(block => block.id === state.selected); }
function selectBlock(id) {
  if (!state.editing || state.selected === id) return;
  state.selected = id;
  document.querySelectorAll('[data-block]').forEach(node => node.classList.toggle('selected', node.dataset.block === id));
  renderInspector();
}

function mediaProperties(block) {
  if (!['news', 'image'].includes(block.kind)) return '';
  return `<hr>${block.kind === 'news' ? `<label>Publication affichée<select data-prop="postId"><option value="">Automatique · dernières publications</option>${block.postId && !state.data.posts.some(post => post.id === block.postId) ? `<option value="${esc(block.postId)}" selected>Publication supprimée</option>` : ''}${sortedPosts().map(post => `<option value="${esc(post.id)}"${block.postId === post.id ? ' selected' : ''}>${esc(post.title)}</option>`).join('')}</select></label><label>Nombre de publications<select data-prop="newsLimit"${block.postId ? ' disabled' : ''}>${[1, 2, 3, 4, 5].map(value => `<option value="${value}"${value === block.newsLimit ? ' selected' : ''}>${value} publication${value > 1 ? 's' : ''}</option>`).join('')}</select></label>` : ''}<label>Hauteur des photos <span class="size-readout">${block.imageHeight ? `${block.imageHeight} px` : 'Masquées'}</span><input data-prop="imageHeight" type="range" min="0" max="600" step="20" value="${block.imageHeight}"></label><label>Largeur des photos <span class="size-readout">${block.imageWidth} %</span><input data-prop="imageWidth" type="range" min="25" max="100" step="5" value="${block.imageWidth}"></label><label>Affichage de l’image<select data-prop="imageFit"><option value="contain"${block.imageFit === 'contain' ? ' selected' : ''}>Image entière</option><option value="cover"${block.imageFit === 'cover' ? ' selected' : ''}>Remplir et recadrer</option></select></label>`;
}

function renderInspector() {
  if (!state.editing) return;
  const block = selectedBlock();
  if (!block) { $('inspector-fields').innerHTML = '<p class="inspector-note">Cliquez sur un bloc de la page. Vous pourrez le redimensionner, changer ses couleurs ou modifier son contenu.</p>'; return; }
  $('inspector-fields').innerHTML = `<label>Page<select data-prop="pageId">${state.data.pages.map(page => `<option value="${esc(page.id)}"${page.id === block.pageId ? ' selected' : ''}>${esc(page.title)}</option>`).join('')}</select></label><label>Titre du bloc<input data-prop="title" value="${esc(block.title)}" maxlength="120"></label><div class="compact-mobile"><label>Largeur<select data-prop="width">${[[3, '1/4 de page'], [4, '1/3 de page'], [6, '1/2 page'], [8, '2/3 de page'], [9, '3/4 de page'], [12, 'Pleine largeur']].map(([v, label]) => `<option value="${v}"${v === block.width ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Hauteur du bloc <span class="size-readout">${block.minHeight} px</span><input data-prop="minHeight" type="range" min="160" max="1200" step="20" value="${block.minHeight}"></label></div><label class="check-label"><input type="checkbox" data-prop="fixedHeight"${block.fixedHeight ? ' checked' : ''}>Hauteur fixe (contenu défilant)</label><div class="property-row"><label>Fond<input type="color" data-prop="background" value="${esc(block.background)}"></label><label>Texte<input type="color" data-prop="color" value="${esc(block.color)}"></label></div>${block.kind === 'text' ? `<label>Taille du texte <span class="size-readout">${block.fontSize} px</span><input type="range" data-prop="fontSize" min="12" max="60" value="${block.fontSize}"></label><label>Alignement<select data-prop="align">${[['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite']].map(([value, label]) => `<option value="${value}"${value === block.align ? ' selected' : ''}>${label}</option>`).join('')}</select></label><div class="property-row"><label class="check-label"><input type="checkbox" data-prop="bold"${block.bold ? ' checked' : ''}>Gras</label><label class="check-label"><input type="checkbox" data-prop="italic"${block.italic ? ' checked' : ''}>Italique</label></div>` : ''}${mediaProperties(block)}<hr><label class="check-label"><input type="checkbox" data-prop="hidden"${block.hidden ? ' checked' : ''}>Masquer en consultation</label><button class="button secondary small full" data-inspector-action="content">${icon('edit')}Modifier le contenu</button><div class="property-row" style="margin-top:9px"><button class="button secondary small" data-inspector-action="duplicate">${icon('copy')}Dupliquer</button><button class="button secondary small danger" data-inspector-action="delete">${icon('trash')}Supprimer</button></div><p class="inspector-note">Glissez la poignée du bloc pour le déplacer, ou utilisez ses flèches. Sur téléphone, les blocs s’affichent les uns sous les autres.</p>`;
}

function updateSaveStatus() {
  $('save-status').textContent = state.saving ? 'Enregistrement…' : state.dirty ? 'Modifications non enregistrées' : 'La page est à jour';
  $('save-page').disabled = state.saving || !state.dirty; $('undo').disabled = !state.history.length;
}
function remember() { state.history.push(boardSnapshot()); if (state.history.length > 35) state.history.shift(); }
function dirty() { state.dirty = true; updateSaveStatus(); }
function change(callback, redraw = true) { remember(); callback(); dirty(); if (redraw) { renderPageBar(); renderBoard(); renderInspector(); } }

function beginEdit() {
  if (!state.user?.canEdit) return;
  if (state.presenting) stopPresentation();
  if (state.editing) return;
  state.original = boardSnapshot(); state.history = []; state.editing = true; state.dirty = false;
  state.selected = DashboardPages.pageBlocks(state.data, state.pageId, true)[0]?.id || ''; render();
}

function cancelEdit() {
  if (state.dirty && !confirm('Abandonner les modifications de la page ? Les publications déjà partagées seront conservées.')) return;
  Object.assign(state.data, state.original); state.editing = false; state.dirty = false; state.history = []; render();
  loadState().catch(error => toast(error.message, true));
}

async function savePage() {
  if (!state.dirty || state.saving) return;
  state.saving = true; updateSaveStatus();
  try {
    const result = await api('/board', { method: 'PUT', body: { revision: state.data.revision, ...boardSnapshot() } });
    state.data = result.dashboard; state.editing = false; state.dirty = false; state.history = []; state.original = null;
    render(); toast('La page est enregistrée pour toute l’équipe.');
  } catch (error) {
    if (error.status === 409) showConflict(error.message); else toast(error.message, true);
  } finally { state.saving = false; updateSaveStatus(); }
}

function showConflict(message) {
  openModal('Une nouvelle version est disponible', `<p class="form-note">${esc(message)} Votre page en cours reste disponible. Vous pouvez la télécharger avant de recharger.</p><div class="modal-actions"><button id="download-draft" class="button secondary small">Télécharger mon brouillon</button><button id="reload-version" class="button primary small">Recharger la page</button></div>`);
  $('download-draft').onclick = () => download('dashboard-brouillon.json', JSON.stringify(boardSnapshot(), null, 2), 'application/json');
  $('reload-version').onclick = () => { if (state.dirty && !confirm('Recharger et abandonner les modifications non enregistrées ?')) return; state.editing = false; state.dirty = false; closeModal(); loadState().catch(error => toast(error.message, true)); };
}

function abortPhotos() { for (const controller of photoUploads.values()) controller.abort(); photoUploads.clear(); }
function openModal(title, html, kicker = 'DASHBOARD') {
  abortPhotos();
  modalGeneration++; $('modal-title').textContent = title; $('modal-kicker').textContent = kicker; $('modal-body').innerHTML = html;
  if (!$('modal').open) $('modal').showModal();
  return modalGeneration;
}
function closeModal() { modalGeneration++; abortPhotos(); $('modal').close(); $('modal-body').replaceChildren(); }
function formError(error) { const box = $('modal-error'); if (box) box.textContent = error.message; else toast(error.message, true); }
const buttons = (submit = 'Enregistrer') => `<p id="modal-error" class="modal-error" role="alert"></p><div class="modal-actions"><button type="button" class="button secondary" data-close>Annuler</button><button type="submit" class="button primary">${esc(submit)}</button></div>`;

function photoPicker(current, id = 'photo') {
  return `<div class="photo-picker"><span class="empty-icon">${icon('image')}</span><label>Choisir une photo<input id="${id}" type="file" accept="image/jpeg,image/png,image/webp"><small>JPEG, PNG ou WebP · La photo est optimisée avant l’envoi.</small></label></div><span id="${id}-status" class="photo-status"></span><img id="${id}-preview" class="photo-preview${current ? '' : ' hidden'}"${current ? ` src="${esc(current)}"` : ''} alt="Aperçu de la photo"><button id="${id}-remove" class="remove-photo${current ? '' : ' hidden'}" type="button">Retirer cette photo</button>`;
}

function bindPhoto(current, setValue, id = 'photo') {
  const generation = modalGeneration;
  const update = value => { setValue(value); $(id + '-preview').classList.toggle('hidden', !value); $(id + '-remove').classList.toggle('hidden', !value); if (value) $(id + '-preview').src = value; else $(id + '-preview').removeAttribute('src'); };
  $(id + '-remove').onclick = () => { update(''); $(id).value = ''; };
  $(id).onchange = async () => {
    const file = $(id).files[0]; if (!file) return;
    const controller = new AbortController(); photoUploads.set(id, controller);
    const form = $(id).closest('form'); const submit = form?.querySelector('button[type=submit]');
    if (form) form.dataset.uploads = String(Number(form.dataset.uploads || 0) + 1);
    $(id).disabled = true;
    if (submit) submit.disabled = true;
    $(id + '-status').textContent = '';
    try {
      const result = await DashboardPhotos.uploadPhoto(file, {
        csrf: state.csrf, signal: controller.signal,
        onStatus: progress => {
          if (generation !== modalGeneration) return;
          $(id + '-status').textContent = progress.stage === 'prepare' ? 'Préparation de la photo…' : progress.stage === 'saving' ? 'Enregistrement de la photo…' : progress.stage === 'done' ? 'Photo prête.' : `Envoi de la photo… ${progress.percent ?? 0} %`;
        }
      });
      if (generation !== modalGeneration) return;
      update(result.url); $(id + '-status').textContent = 'Photo prête.';
    } catch (error) {
      if (generation === modalGeneration && error.name !== 'AbortError') {
        if (error.status === 401 || error.code === 'ACCESS_DISABLED') showLogin(error.message);
        else { $(id + '-status').textContent = ''; $(id).value = ''; formError(error); }
      }
    }
    finally {
      if (photoUploads.get(id) === controller) photoUploads.delete(id);
      if (generation === modalGeneration) {
        $(id).disabled = false;
        if (form) form.dataset.uploads = String(Math.max(0, Number(form.dataset.uploads || 0) - 1));
        if (submit) submit.disabled = Number(form?.dataset.uploads || 0) > 0;
      }
    }
  };
}

function postEditor(post = null) {
  if (!state.user.canEdit) return;
  let image = post?.image || '';
  openModal(post ? 'Modifier la publication' : 'Nouvelle publication', `<form id="post-form" class="modal-form"><label>Titre<input id="post-title" value="${esc(post?.title || '')}" required maxlength="180" placeholder="Titre de la publication"></label><label>Votre publication<textarea id="post-body" rows="5" maxlength="10000" placeholder="Texte de la publication">${esc(post?.body || '')}</textarea></label>${photoPicker(image)}<label class="check-label"><input id="post-pinned" type="checkbox"${post?.pinned ? ' checked' : ''}>Épingler cette publication à la une</label><p class="form-note">${post ? `Auteur d’origine : ${esc(post.createdBy.name)}. Votre nom apparaîtra comme auteur de la modification.` : `La publication sera signée ${esc(state.user.name)} et visible par les personnes ayant accès au Dashboard.`}</p>${buttons(post ? 'Enregistrer la publication' : 'Publier')}</form>`, 'VIE DU SERVICE');
  bindPhoto(image, value => { image = value; });
  $('post-form').onsubmit = async event => {
    event.preventDefault(); const submit = event.submitter; submit.disabled = true;
    try {
      const result = await api(post ? `/posts/${encodeURIComponent(post.id)}` : '/posts', { method: post ? 'PUT' : 'POST', body: { revision: state.data.revision, title: $('post-title').value, body: $('post-body').value, image, pinned: $('post-pinned').checked } });
      state.data.revision = result.revision;
      if (post) state.data.posts = state.data.posts.map(item => item.id === post.id ? result.post : item); else state.data.posts.unshift(result.post);
      closeModal(); renderBoard(); toast(post ? 'La publication est mise à jour.' : 'Publication enregistrée.');
    } catch (error) { if (error.status === 409) showConflict(error.message); else formError(error); }
    finally { if (submit.isConnected) submit.disabled = false; }
  };
}

function dutyEditor(block = null) {
  beginEdit(); if (block) selectBlock(block.id); const d = state.data.duty;
  openModal('Astreinte direction', `<form id="duty-form" class="modal-form"><label>Libellé<input id="duty-title" value="${esc(d.label)}" maxlength="80" required></label><label>Nom ou service<input id="duty-person" value="${esc(d.name)}" maxlength="160" placeholder="Nom du responsable d’astreinte"></label><label>Téléphone<input id="duty-number" type="tel" value="${esc(d.phone)}" maxlength="60" placeholder="Numéro à joindre"></label><label>Précisions<textarea id="duty-details" maxlength="500" placeholder="Période d’astreinte, horaires, consignes…">${esc(d.note)}</textarea></label><p class="form-note">Ce changement sera partagé lorsque vous enregistrerez la page.</p>${buttons('Appliquer à la page')}</form>`, 'CONTACT DU SERVICE');
  $('duty-form').onsubmit = event => { event.preventDefault(); change(() => { const oldLabel = state.data.duty.label; state.data.duty = { label: $('duty-title').value, name: $('duty-person').value, phone: $('duty-number').value, note: $('duty-details').value }; state.data.blocks.filter(item => item.kind === 'duty' && item.title === oldLabel).forEach(item => { item.title = state.data.duty.label; }); }, false); closeModal(); render(); };
}

function toLocalInput(value) {
  if (!value) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function fromParisInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Renseignez la date et l’heure de la réunion.');
  const target = Date.parse(value + ':00Z'); let candidate = target;
  for (let i = 0; i < 4; i++) candidate += target - Date.parse(toLocalInput(candidate) + ':00Z');
  if (toLocalInput(candidate) !== value) throw new Error('Cette heure n’existe pas à Paris en raison du changement d’heure.');
  return new Date(candidate).toISOString();
}

function meetingEditor(block, item = null) {
  beginEdit(); selectBlock(block.id);
  openModal(item ? 'Modifier la réunion' : 'Nouvelle réunion', `<form id="meeting-form" class="modal-form"><label>Intitulé<input id="meeting-title" value="${esc(item?.title || '')}" required maxlength="160" placeholder="Réunion de service, point d’équipe…"></label><div class="form-row"><label>Début · heure de Paris<input id="meeting-start" type="datetime-local" value="${toLocalInput(item?.start)}" required></label><label>Fin · facultative<input id="meeting-end" type="datetime-local" value="${toLocalInput(item?.end)}"></label></div><label>Lieu<input id="meeting-location" value="${esc(item?.location || '')}" maxlength="300" placeholder="Salle, bâtiment ou visioconférence"></label><label>Informations / ordre du jour<textarea id="meeting-description" maxlength="2000">${esc(item?.description || '')}</textarea></label><label>Lien de visioconférence ou document<input id="meeting-url" value="${esc(item?.url || '')}" maxlength="1500" placeholder="https://…"><small>Facultatif. Les liens s’ouvrent dans un nouvel onglet.</small></label><p class="form-note">La réunion sera visible après l’enregistrement de la page.</p>${buttons('Appliquer à la page')}</form>`, 'AGENDA DU SERVICE');
  $('meeting-form').onsubmit = event => {
    event.preventDefault();
    try {
      const start = fromParisInput($('meeting-start').value), end = $('meeting-end').value ? fromParisInput($('meeting-end').value) : '';
      if (end && end <= start) throw new Error('La fin de réunion doit être après le début.');
      const url = checkedLink($('meeting-url').value, true);
      const next = { id: item?.id || crypto.randomUUID(), title: $('meeting-title').value, start, end, location: $('meeting-location').value, description: $('meeting-description').value, url };
      change(() => { if (item) block.items = block.items.map(current => current.id === item.id ? next : current); else block.items.push(next); });
      closeModal(); toast('Réunion ajoutée à la page. Pensez à enregistrer.');
    } catch (error) { formError(error); }
  };
}

function checkedLink(value, optional = false) {
  const raw = value.trim(); if (!raw && optional) return '';
  if (/^\/(?!\/)/.test(raw) && !/[\\\u0000-\u0020]/.test(raw)) return raw;
  try { const url = new URL(raw); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* invalid */ }
  throw new Error('Saisissez un lien https://, http:// ou un chemin commençant par /.');
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function meetingDetails(block, item) {
  openModal(item.title, `<div class="modal-form"><p class="form-note">${esc(fullDate(item.start))}${item.end ? ` — fin ${esc(fullDate(item.end))}` : ''} · heure de Paris</p>${item.location ? `<p>${esc(item.location)}</p>` : ''}${item.description ? `<p class="text-body" style="font-size:14px">${esc(item.description)}</p>` : ''}${item.url ? `<a class="button secondary" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}Ouvrir le lien de la réunion</a>` : ''}<div class="modal-actions"><button id="calendar-export" class="button secondary">${icon('download')}Ajouter à mon agenda</button>${state.user.canEdit ? '<button id="meeting-edit-detail" class="button primary">Modifier la réunion</button>' : ''}</div></div>`, 'AGENDA DU SERVICE');
  $('calendar-export').onclick = () => {
    const escapeICS = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r/g, '');
    const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PHENIX//Dashboard//FR', 'BEGIN:VEVENT', `UID:${item.id}@dashboard`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(item.start)}`, ...(item.end ? [`DTEND:${stamp(item.end)}`] : []), `SUMMARY:${escapeICS(item.title)}`, `LOCATION:${escapeICS(item.location)}`, `DESCRIPTION:${escapeICS(item.description)}`, 'END:VEVENT', 'END:VCALENDAR'];
    download('reunion-service.ics', lines.join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
  };
  if ($('meeting-edit-detail')) $('meeting-edit-detail').onclick = () => meetingEditor(block, item);
}

function showAgenda(block) {
  const items = [...block.items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  openModal(block.title, `<p class="list-note">Dates et heures de Paris · ${items.length} réunion${items.length > 1 ? 's' : ''}</p><div class="meetings">${items.map(item => meetingHtml(item, block.id, true)).join('') || '<p class="form-note">Aucune réunion ajoutée.</p>'}</div>${state.user.canEdit ? '<div class="modal-actions"><button id="agenda-add" class="button primary">Ajouter une réunion</button></div>' : ''}`, 'AGENDA DU SERVICE');
  if ($('agenda-add')) $('agenda-add').onclick = () => meetingEditor(block);
}

function blockPalette() {
  beginEdit();
  const descriptions = { duty: 'Responsable, téléphone et précisions.', news: 'Publications, photos et nom de leur auteur.', meetings: 'Dates, horaires, lieux et ordre du jour.', text: 'Une information libre, à votre façon.', image: 'Une photo, une affiche ou un visuel.', links: 'Tous les raccourcis utiles à l’équipe.' };
  openModal('Ajouter un bloc', `<div class="block-palette">${Object.entries(names).map(([kind, label]) => `<button class="palette-item" data-add-kind="${kind}"><span>${icon(kind)}</span><strong>${label}</strong><small>${descriptions[kind]}</small></button>`).join('')}</div>`, 'MISE EN PAGE');
  document.querySelectorAll('[data-add-kind]').forEach(button => { button.onclick = () => {
    if (state.data.blocks.length >= 120) return toast('Votre page peut contenir au maximum 120 blocs.', true);
    const kind = button.dataset.addKind, block = { id: crypto.randomUUID(), kind, pageId: state.pageId, title: names[kind], width: kind === 'duty' ? 3 : kind === 'news' ? 6 : 4, minHeight: kind === 'duty' ? 180 : kind === 'news' ? 360 : 240, fixedHeight: ['news', 'image'].includes(kind), newsLimit: 1, postId: '', imageHeight: 120, imageWidth: 100, imageFit: 'contain', hidden: false, background: kind === 'duty' ? '#123b53' : '#ffffff', color: kind === 'duty' ? '#ffffff' : '#193b4d', fontSize: 16, align: 'left', bold: false, italic: false, body: '', image: '', caption: '', items: [] };
    change(() => { state.data.blocks.push(block); state.selected = block.id; }); closeModal();
    document.querySelector(`[data-block="${block.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (['text', 'image', 'links'].includes(kind)) editContent(block);
  }; });
}

function editContent(block) {
  beginEdit(); selectBlock(block.id);
  if (block.kind === 'duty') return dutyEditor(block);
  if (block.kind === 'news') return postEditor();
  if (block.kind === 'meetings') return showAgenda(block);
  if (block.kind === 'text') {
    openModal('Modifier le texte', `<form id="text-form" class="modal-form"><label>Titre<input id="text-title" maxlength="120" value="${esc(block.title)}" required></label><label>Texte<textarea id="text-body" rows="9" maxlength="15000" placeholder="Modifier le texte, vos consignes, votre message…">${esc(block.body)}</textarea></label><p class="form-note">La taille, les couleurs et l’alignement se règlent dans les propriétés du bloc.</p>${buttons('Appliquer au bloc')}</form>`);
    $('text-form').onsubmit = event => { event.preventDefault(); change(() => { block.title = $('text-title').value; block.body = $('text-body').value; }); closeModal(); };
  } else if (block.kind === 'image') {
    let image = block.image;
    openModal('Photo / affiche', `<form id="image-form" class="modal-form"><label>Titre<input id="image-title" value="${esc(block.title)}" maxlength="120" required></label>${photoPicker(image)}<label>Légende<textarea id="image-caption" maxlength="500" rows="2">${esc(block.caption)}</textarea></label>${buttons('Appliquer au bloc')}</form>`);
    bindPhoto(image, value => { image = value; });
    $('image-form').onsubmit = event => { event.preventDefault(); change(() => { block.title = $('image-title').value; block.image = image; block.caption = $('image-caption').value; }); closeModal(); };
  } else if (block.kind === 'links') linksEditor(block);
}

function linksEditor(block) {
  let items = structuredClone(block.items);
  openModal('Liens utiles', `<form id="links-form" class="modal-form"><label>Titre du bloc<input id="links-title" value="${esc(block.title)}" maxlength="120" required></label><div id="links-rows"></div><div class="form-row"><label>Nom du lien<input id="new-link-label" maxlength="120" placeholder="Nom de la ressource"></label><label>Adresse<input id="new-link-url" maxlength="1500" placeholder="https://…"></label></div><button id="append-link" class="button secondary" type="button">${icon('plus')}Ajouter ce lien</button><p class="form-note">Les liens s’ouvrent dans un nouvel onglet.</p>${buttons('Appliquer au bloc')}</form>`);
  const list = () => { $('links-rows').innerHTML = items.map(item => `<div class="link-edit-row"><div><b>${esc(item.label)}</b><small>${esc(item.url)}</small></div><button type="button" data-remove-link="${esc(item.id)}">Supprimer</button></div>`).join(''); document.querySelectorAll('[data-remove-link]').forEach(button => { button.onclick = () => { items = items.filter(item => item.id !== button.dataset.removeLink); list(); }; }); };
  const append = () => {
    const label = $('new-link-label').value.trim(), url = $('new-link-url').value.trim();
    if (!label && !url) return false;
    if (!label) throw new Error('Donnez un nom au lien.');
    if (items.length >= 100) throw new Error('Un bloc peut contenir au maximum 100 liens.');
    items.push({ id: crypto.randomUUID(), label, url: checkedLink(url) }); $('new-link-label').value = ''; $('new-link-url').value = ''; list(); return true;
  };
  list(); $('append-link').onclick = () => { try { if (!append()) throw new Error('Renseignez un nom et une adresse.'); $('modal-error').textContent = ''; } catch (error) { formError(error); } };
  $('links-form').onsubmit = event => { event.preventDefault(); try { append(); change(() => { block.title = $('links-title').value; block.items = items; }); closeModal(); } catch (error) { formError(error); } };
}

function appearanceEditor() {
  beginEdit(); const settings = state.data.settings, appearance = state.appearance;
  let logo = settings.logo, backgroundImage = settings.backgroundImage;
  openModal('Paramètres de la page', `<form id="appearance-form" class="modal-form"><label>Titre de la page<input id="setting-title" value="${esc(settings.title || appearance.title || 'La vie du service')}" maxlength="120"></label><label>Sous-titre<input id="setting-subtitle" value="${esc(settings.subtitle || appearance.subtitle || '')}" maxlength="240"></label><div class="form-row"><label>Couleur principale<input id="setting-accent" type="color" value="${esc(settings.accent || appearance.accentColor || '#16877b')}"></label><label>Fond de page<input id="setting-background" type="color" value="${esc(settings.background || appearance.backgroundColor || '#f3f5f3')}"></label></div><label>Police<select id="setting-font">${[['system', 'Moderne'], ['serif', 'Éditoriale'], ['rounded', 'Arrondie'], ['mono', 'Machine à écrire']].map(([value, label]) => `<option value="${value}"${settings.font === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Logo de la page</label>${photoPicker(logo, 'logo-photo')}<label>Image de fond</label>${photoPicker(backgroundImage, 'background-photo')}<div class="form-row"><label>Défilement des publications en vue écran<select id="setting-seconds">${[8, 12, 20, 30, 60, 120].map(v => `<option value="${v}"${v === settings.displaySeconds ? ' selected' : ''}>Toutes les ${v} secondes</option>`).join('')}</select></label><label class="check-label"><input id="setting-clock" type="checkbox"${settings.showClock ? ' checked' : ''}>Afficher l’heure</label></div>${buttons('Appliquer à la page')}</form>`, 'PERSONNALISATION');
  bindPhoto(logo, value => { logo = value; }, 'logo-photo'); bindPhoto(backgroundImage, value => { backgroundImage = value; }, 'background-photo');
  $('appearance-form').onsubmit = event => { event.preventDefault(); change(() => { Object.assign(settings, { title: $('setting-title').value, subtitle: $('setting-subtitle').value, accent: $('setting-accent').value, background: $('setting-background').value, font: $('setting-font').value, logo, backgroundImage, showClock: $('setting-clock').checked, displaySeconds: Number($('setting-seconds').value) }); }, false); closeModal(); render(); };
}

function moveBlock(block, offset) {
  const blocks = DashboardPages.pageBlocks(state.data, block.pageId, true);
  if (!blocks[blocks.indexOf(block) + offset]) return;
  change(() => { DashboardPages.moveBlock(state.data, block.id, offset); });
}
function duplicateBlock(block) {
  if (state.data.blocks.length >= 120) return toast('La limite de 120 blocs est atteinte.', true);
  change(() => { const copy = structuredClone(block); copy.id = crypto.randomUUID(); copy.title += ' · Copie'; copy.items = copy.items.map(item => ({ ...item, id: crypto.randomUUID() })); state.data.blocks.splice(state.data.blocks.indexOf(block) + 1, 0, copy); state.selected = copy.id; });
}
function removeBlock(block) {
  if (!confirm(`Supprimer le bloc « ${block.title} » ?${block.kind === 'news' ? ' Les publications seront conservées.' : ''}`)) return;
  change(() => { state.data.blocks = state.data.blocks.filter(item => item.id !== block.id); state.selected = state.data.blocks[0]?.id || ''; });
}

async function handleAction(event) {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  const card = button.closest('[data-block]'); const owner = button.closest('[data-owner]');
  const block = state.data.blocks.find(item => item.id === (card?.dataset.block || owner?.dataset.owner));
  const post = state.data.posts.find(item => item.id === button.closest('[data-post]')?.dataset.post);
  const meeting = block?.items.find(item => item.id === button.closest('[data-meeting]')?.dataset.meeting);
  if (action === 'view-photo') { openModal(button.alt || 'Photo du service', `<img class="lightbox-image" src="${esc(button.src)}" alt="${esc(button.alt)}">`); return; }
  if (action === 'all-posts') { openModal('Toutes les publications', `<div class="view-all-feed">${sortedPosts().map(post => postHtml(post, false, true)).join('')}</div>`, 'VIE DU SERVICE'); return; }
  if (action === 'read-post' && post) { openModal(post.title, `<div class="view-all-feed">${postHtml(post, false, true)}</div>`, 'VIE DU SERVICE'); return; }
  if (action === 'all-meetings' && block) return showAgenda(block);
  if (action === 'meeting-detail' && meeting) return meetingDetails(block, meeting);
  if (!state.user.canEdit) return;
  if (action === 'new-post') return postEditor();
  if (action === 'edit-post' && post) return postEditor(post);
  if (action === 'delete-post' && post && confirm(`Supprimer la publication « ${post.title} » ?`)) {
    try { const result = await api(`/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE', body: { revision: state.data.revision } }); state.data.posts = state.data.posts.filter(item => item.id !== post.id); state.data.revision = result.revision; closeModal(); renderBoard(); renderInspector(); toast('Publication supprimée.'); }
    catch (error) { if (error.status === 409) showConflict(error.message); else toast(error.message, true); }
    return;
  }
  if (action === 'add-block') return blockPalette();
  if (!block) return;
  if (action === 'edit-duty') return dutyEditor(block);
  if (action === 'add-meeting') return meetingEditor(block);
  if (action === 'edit-meeting' && meeting) return meetingEditor(block, meeting);
  if (action === 'delete-meeting' && meeting && confirm('Supprimer cette réunion de la page ?')) { change(() => { block.items = block.items.filter(item => item.id !== meeting.id); }); if ($('modal').open) showAgenda(block); return; }
  if (action === 'edit-content') return editContent(block);
  if (!state.editing) return;
  if (action === 'move-up') moveBlock(block, -1);
  if (action === 'move-down') moveBlock(block, 1);
  if (action === 'duplicate') duplicateBlock(block);
  if (action === 'delete-block') removeBlock(block);
}

async function startPresentation() {
  if (state.editing) { toast('Enregistrez ou annulez vos modifications avant de passer en vue écran.', true); return; }
  state.presenting = true; state.slide = 0; document.body.classList.add('presenting'); $('presentation-controls').classList.remove('hidden');
  renderBoard(); window.scrollTo({ top: 0 });
  try { await document.documentElement.requestFullscreen?.(); } catch { /* viewport presentation still works */ }
  state.nextPageAt = Date.now() + DashboardPages.PAGE_INTERVAL_MS; state.nextSlideAt = Date.now() + (state.data.settings.displaySeconds || 20) * 1000; renderPageBar();
}
function stopPresentation() {
  state.presenting = false; document.body.classList.remove('presenting'); $('presentation-controls').classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (state.data) { renderPageBar(); renderBoard(); }
}

document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
$('login-form').onsubmit = async event => {
  event.preventDefault(); $('login-button').disabled = true; $('login-error').textContent = '';
  try { const result = await api('/login', { method: 'POST', body: { login: $('login').value, password: $('password').value } }); state.csrf = result.csrfToken; $('password').value = ''; await loadState(true); }
  catch (error) { $('login-error').textContent = error.message; }
  finally { $('login-button').disabled = false; }
};
$('renew-password').onclick = () => {
  openModal('Renouveler mon mot de passe', `<form id="password-form" class="modal-form"><label>Identifiant<input id="password-login" autocomplete="username" value="${esc($('login').value)}" required maxlength="80"></label><label>Ancien mot de passe<input id="password-old" type="password" autocomplete="current-password" required></label><label>Nouveau mot de passe<input id="password-new" type="password" autocomplete="new-password" required maxlength="72"></label><label>Confirmer le nouveau mot de passe<input id="password-confirm" type="password" autocomplete="new-password" required maxlength="72"></label><p class="form-note">Ce mot de passe est commun à vos applications professionnelles. Votre accès PHENIX n’a pas besoin d’être activé pour le renouveler ici.</p>${buttons('Renouveler le mot de passe')}</form>`, 'VOTRE COMPTE');
  $('password-form').onsubmit = async event => {
    event.preventDefault(); const submit = event.submitter;
    if ($('password-new').value !== $('password-confirm').value) return formError(new Error('Les deux nouveaux mots de passe ne sont pas identiques.'));
    submit.disabled = true;
    try {
      const login = $('password-login').value;
      await api('/password', { method: 'POST', body: { login, oldPassword: $('password-old').value, newPassword: $('password-new').value } });
      $('login').value = login; $('password').value = ''; $('login-error').textContent = ''; closeModal(); toast('Mot de passe renouvelé. Vous pouvez vous connecter.');
    } catch (error) { formError(error); }
    finally { if (submit.isConnected) submit.disabled = false; }
  };
};
$('logout').onclick = async () => { if (state.dirty && !confirm('Se déconnecter et abandonner les modifications de la page ?')) return; try { await api('/logout', { method: 'POST', body: {} }); showLogin(); } catch (error) { toast(error.message, true); } };
$('edit-page').onclick = beginEdit; $('cancel-edit').onclick = cancelEdit; $('save-page').onclick = savePage;
$('page-tabs').addEventListener('click', event => { const id = event.target.closest('[data-page]')?.dataset.page; if (id) setCurrentPage(id); });
$('previous-page').onclick = () => setCurrentPage(DashboardPages.nextPageId(state.data.pages, state.pageId, -1));
$('next-page').onclick = () => setCurrentPage(DashboardPages.nextPageId(state.data.pages, state.pageId, 1));
$('toggle-rotation').onclick = () => { state.rotationPaused = !state.rotationPaused; state.nextPageAt = Date.now() + DashboardPages.PAGE_INTERVAL_MS; updateRotationStatus(); };
$('manage-pages').onclick = pagesManager;
$('add-block').onclick = blockPalette; $('page-settings').onclick = appearanceEditor;
$('undo').onclick = () => { const previous = state.history.pop(); if (!previous) return; Object.assign(state.data, previous); state.selected = state.data.blocks.some(item => item.id === state.selected) ? state.selected : state.data.blocks[0]?.id; dirty(); render(); };
$('close-modal').onclick = closeModal;
$('modal').addEventListener('click', event => { if (event.target.closest('[data-close]')) closeModal(); else handleAction(event).catch(error => toast(error.message, true)); });
$('modal').addEventListener('cancel', () => { modalGeneration++; abortPhotos(); });
$('board').addEventListener('click', event => { if (state.editing) { const card = event.target.closest('[data-block]'); if (card) selectBlock(card.dataset.block); } handleAction(event).catch(error => toast(error.message, true)); });
$('board').addEventListener('focusin', event => { if (state.editing && event.target.matches('[contenteditable]')) remember(); });
$('board').addEventListener('input', event => { if (!state.editing || !event.target.dataset.field) return; const block = state.data.blocks.find(item => item.id === event.target.closest('[data-block]').dataset.block); if (block) { block[event.target.dataset.field] = event.target.innerText.slice(0, event.target.dataset.field === 'title' ? 120 : 15000); dirty(); } });
$('inspector-fields').addEventListener('change', event => { const prop = event.target.dataset.prop, block = selectedBlock(); if (!prop || !block) return; change(() => { block[prop] = event.target.type === 'checkbox' ? event.target.checked : ['width', 'minHeight', 'fontSize', 'imageHeight', 'imageWidth', 'newsLimit'].includes(prop) ? Number(event.target.value) : event.target.value; if (prop === 'pageId') state.pageId = block.pageId; }); });
$('inspector-fields').addEventListener('click', event => { const action = event.target.closest('[data-inspector-action]')?.dataset.inspectorAction, block = selectedBlock(); if (!action || !block) return; if (action === 'content') editContent(block); if (action === 'duplicate') duplicateBlock(block); if (action === 'delete') removeBlock(block); });
$('board').addEventListener('pointerdown', event => { if (state.editing && event.target.closest('.drag-handle')) event.target.closest('[data-block]').draggable = true; });
$('board').addEventListener('pointerdown', event => {
  const handle = event.target.closest('.resize-handle'); if (!state.editing || !handle) return;
  event.preventDefault(); const card = handle.closest('[data-block]'); selectBlock(card.dataset.block); remember();
  const block = selectedBlock(); resizing = { id: block.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, width: block.width, height: card.getBoundingClientRect().height, boardWidth: $('board').getBoundingClientRect().width, card };
  handle.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove', event => {
  if (!resizing || event.pointerId !== resizing.pointer) return;
  const block = state.data.blocks.find(item => item.id === resizing.id); if (!block) return;
  const proposed = resizing.width + (event.clientX - resizing.x) / resizing.boardWidth * 12;
  block.width = [3, 4, 6, 8, 9, 12].reduce((best, value) => Math.abs(value - proposed) < Math.abs(best - proposed) ? value : best, 4);
  block.minHeight = Math.max(160, Math.min(1200, Math.round((resizing.height + event.clientY - resizing.y) / 20) * 20));
  resizing.card.style.setProperty('--width', block.width); resizing.card.style.setProperty('--height', block.minHeight + 'px'); dirty();
});
document.addEventListener('pointerup', event => { if (resizing && event.pointerId === resizing.pointer) { resizing = null; renderInspector(); updateSaveStatus(); } });
document.addEventListener('pointercancel', () => { if (resizing) { resizing = null; renderInspector(); } });
$('board').addEventListener('pointerup', () => document.querySelectorAll('[data-block]').forEach(node => { node.draggable = false; }));
$('board').addEventListener('dragstart', event => { if (!state.editing || !event.target.matches('[data-block]')) return event.preventDefault(); dragId = event.target.dataset.block; event.dataTransfer.setData('text/plain', dragId); event.dataTransfer.effectAllowed = 'move'; event.target.classList.add('dragging'); });
$('board').addEventListener('dragover', event => { const card = event.target.closest('[data-block]'); if (!state.editing || !dragId || !card || card.dataset.block === dragId) return; event.preventDefault(); document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); card.classList.add('drop-target'); });
$('board').addEventListener('drop', event => { const target = event.target.closest('[data-block]'); if (!state.editing || !dragId || !target) return; event.preventDefault(); const source = state.data.blocks.find(item => item.id === dragId); const destination = target.dataset.block; if (source && source.id !== destination) change(() => { state.data.blocks = state.data.blocks.filter(item => item.id !== source.id); state.data.blocks.splice(state.data.blocks.findIndex(item => item.id === destination), 0, source); }); dragId = ''; });
$('board').addEventListener('dragend', () => { dragId = ''; document.querySelectorAll('[data-block]').forEach(node => { node.draggable = false; node.classList.remove('dragging', 'drop-target'); }); });
$('present').onclick = startPresentation; $('exit-present').onclick = stopPresentation;
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.presenting) stopPresentation(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.presenting) stopPresentation(); });
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
setInterval(() => { updateClock(); rotationTick(); }, 1000);
setInterval(() => { if (state.user && !state.editing && !$('modal').open && !document.hidden) loadState().catch(() => {}); }, 30000);
loadState(true);
