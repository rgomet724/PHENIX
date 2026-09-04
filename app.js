const state = {
  csrfToken: '',
  user: null,
  streets: [],
  streetsMetadata: null,
  selectedStreets: [],
};

const BASE_PATH = '/arretes';

const elements = {
  tabs: [...document.querySelectorAll('.tab')],
  views: [...document.querySelectorAll('.view')],
  userName: document.querySelector('#user-name'),
  userRole: document.querySelector('#user-role'),
  searchForm: document.querySelector('#search-form'),
  resetSearch: document.querySelector('#reset-search'),
  recordsLoading: document.querySelector('#records-loading'),
  recordsEmpty: document.querySelector('#records-empty'),
  recordsList: document.querySelector('#records-list'),
  recordCount: document.querySelector('#record-count'),
  recordTemplate: document.querySelector('#record-template'),
  recordForm: document.querySelector('#record-form'),
  recordDate: document.querySelector('#record-date'),
  temporary: document.querySelector('#temporary'),
  temporaryDates: document.querySelector('#temporary-dates'),
  startDate: document.querySelector('#start-date'),
  endDate: document.querySelector('#end-date'),
  formMessage: document.querySelector('#form-message'),
  streetInput: document.querySelector('#street-input'),
  selectedStreets: document.querySelector('#selected-streets'),
  streetSuggestions: document.querySelector('#street-suggestions'),
  searchStreet: document.querySelector('#search-street'),
  refreshStreets: document.querySelector('#refresh-streets'),
  addStreetForm: document.querySelector('#add-street-form'),
  streetAdminMessage: document.querySelector('#street-admin-message'),
  streetsMetadata: document.querySelector('#streets-metadata'),
};

document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  bindEvents();
  elements.recordDate.value = localIsoDate();
  try {
    const me = await api('/api/me');
    state.user = me.user;
    state.csrfToken = me.csrfToken;
    elements.userName.textContent = me.user.name;
    elements.userRole.textContent = me.user.role;
    if (me.user.admin) document.querySelectorAll('.admin-only').forEach((item) => item.classList.remove('hidden'));
    await loadStreets();
    await loadRecords();
  } catch (error) {
    showMessage(elements.formMessage, error.message, 'error');
    elements.recordsLoading.textContent = error.message;
  }
}

function bindEvents() {
  elements.tabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));
  elements.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadRecords();
  });
  elements.resetSearch.addEventListener('click', () => {
    elements.searchForm.reset();
    loadRecords();
  });
  elements.temporary.addEventListener('change', updateTemporaryFields);
  elements.recordForm.addEventListener('submit', submitRecord);
  elements.recordForm.addEventListener('reset', () => {
    setTimeout(() => {
      state.selectedStreets = [];
      renderSelectedStreets();
      elements.recordDate.value = localIsoDate();
      updateTemporaryFields();
      hideMessage(elements.formMessage);
    });
  });
  elements.streetInput.addEventListener('input', renderStreetSuggestions);
  elements.streetInput.addEventListener('focus', renderStreetSuggestions);
  elements.streetInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSuggestions();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.street-picker')) closeSuggestions();
  });
  elements.refreshStreets.addEventListener('click', refreshStreets);
  elements.addStreetForm.addEventListener('submit', addStreet);
}

function switchView(name) {
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));
  elements.views.forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase()) && state.csrfToken) {
    headers.set('x-csrf-token', state.csrfToken);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await fetch(`${BASE_PATH}${url}`, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) {
    window.location.reload();
    throw new Error('Session ARGOS expirée');
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Une erreur est survenue');
  return payload;
}

async function loadStreets() {
  const payload = await api('/api/streets');
  state.streets = payload.streets;
  state.streetsMetadata = payload.metadata;
  fillStreetSelect();
  updateStreetMetadata();
}

function fillStreetSelect() {
  const selected = elements.searchStreet.value;
  elements.searchStreet.replaceChildren(new Option('Toutes les voies', ''));
  state.streets.forEach((street) => elements.searchStreet.add(new Option(displayStreet(street), street)));
  elements.searchStreet.value = selected;
}

function updateStreetMetadata() {
  if (!state.streetsMetadata?.updatedAt) {
    elements.streetsMetadata.textContent = `${state.streets.length} voies disponibles. La synchronisation BAN sera lancée automatiquement.`;
    return;
  }
  elements.streetsMetadata.textContent = `${state.streets.length} voies · source ${state.streetsMetadata.source} · mise à jour le ${formatDateTime(state.streetsMetadata.updatedAt)}.`;
}

async function loadRecords() {
  elements.recordsLoading.classList.remove('hidden');
  elements.recordsEmpty.classList.add('hidden');
  elements.recordsList.replaceChildren();
  const parameters = new URLSearchParams(new FormData(elements.searchForm));
  [...parameters.entries()].forEach(([key, value]) => !value && parameters.delete(key));
  try {
    const payload = await api(`/api/arretes?${parameters}`);
    renderRecords(payload.records);
  } catch (error) {
    elements.recordsLoading.textContent = error.message;
  }
}

function renderRecords(records) {
  elements.recordsLoading.classList.add('hidden');
  elements.recordCount.textContent = `${records.length} résultat${records.length > 1 ? 's' : ''}`;
  if (!records.length) {
    elements.recordsEmpty.classList.remove('hidden');
    return;
  }

  records.forEach((record) => {
    const card = elements.recordTemplate.content.firstElementChild.cloneNode(true);
    card.classList.toggle('temporary', record.temporary);
    card.querySelector('.record-number').textContent = `N° ${record.number}`;
    card.querySelector('.record-type').textContent = record.temporary ? 'Temporaire' : 'Permanent';
    card.querySelector('.record-name').textContent = record.name;
    card.querySelector('.record-meta').textContent = `Arrêté du ${formatDate(record.date)} · enregistré par ${record.createdBy?.name || 'ARGOS'} le ${formatDateTime(record.createdAt)}`;
    const streetsContainer = card.querySelector('.record-streets');
    record.streets.forEach((street) => {
      const item = document.createElement('span');
      item.textContent = displayStreet(street);
      streetsContainer.append(item);
    });
    const location = card.querySelector('.record-location');
    if (record.locationDetails) location.textContent = record.locationDetails;
    else location.remove();
    const expiry = card.querySelector('.record-expiry');
    if (record.temporary) {
      expiry.textContent = `Valable du ${formatDate(record.startDate)} au ${formatDate(record.endDate)} · suppression automatique le ${formatDateTime(record.deleteAt)}.`;
    } else {
      expiry.remove();
    }
    const storage = card.querySelector('.record-storage');
    const originalSize = Number(record.attachment?.originalSize || record.attachment?.size || 0);
    const storedSize = Number(record.attachment?.size || 0);
    const saved = Math.max(0, originalSize - storedSize);
    if (originalSize && saved) {
      const percent = Math.round((saved / originalSize) * 100);
      storage.textContent = `PDF optimisé : ${formatBytes(storedSize)} sur le disque · gain ${percent} %.`;
    } else if (storedSize) {
      storage.textContent = `PDF déjà optimisé : ${formatBytes(storedSize)} sur le disque.`;
    } else {
      storage.remove();
    }
    const pdf = card.querySelector('.record-pdf');
    pdf.href = `${BASE_PATH}/api/arretes/${encodeURIComponent(record.id)}/piece-jointe`;
    const deleteButton = card.querySelector('.record-delete');
    if (state.user.admin) {
      deleteButton.classList.remove('hidden');
      deleteButton.addEventListener('click', () => deleteRecord(record));
    }
    elements.recordsList.append(card);
  });
}

async function submitRecord(event) {
  event.preventDefault();
  if (!state.selectedStreets.length) {
    showMessage(elements.formMessage, 'Sélectionnez au moins une voie.', 'error');
    elements.streetInput.focus();
    return;
  }
  const submitButton = elements.recordForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  hideMessage(elements.formMessage);
  const body = new FormData(elements.recordForm);
  body.set('temporary', elements.temporary.checked ? 'true' : 'false');
  body.set('streets', JSON.stringify(state.selectedStreets));
  try {
    await api('/api/arretes', { method: 'POST', body });
    elements.recordForm.reset();
    state.selectedStreets = [];
    renderSelectedStreets();
    elements.recordDate.value = localIsoDate();
    showMessage(elements.formMessage, 'L’arrêté et sa pièce jointe ont été enregistrés.', 'success');
    await loadRecords();
    switchView('records');
  } catch (error) {
    showMessage(elements.formMessage, error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
}

function updateTemporaryFields() {
  const enabled = elements.temporary.checked;
  elements.temporaryDates.classList.toggle('hidden', !enabled);
  elements.startDate.required = enabled;
  elements.endDate.required = enabled;
  if (!enabled) {
    elements.startDate.value = '';
    elements.endDate.value = '';
  }
}

function renderStreetSuggestions() {
  const query = normalize(elements.streetInput.value);
  if (!query) return closeSuggestions();
  const matches = state.streets
    .filter((street) => normalize(street).includes(query) && !state.selectedStreets.includes(street))
    .slice(0, 18);
  elements.streetSuggestions.replaceChildren();
  if (!matches.length) return closeSuggestions();
  matches.forEach((street) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.role = 'option';
    button.textContent = displayStreet(street);
    button.addEventListener('click', () => selectStreet(street));
    elements.streetSuggestions.append(button);
  });
  elements.streetSuggestions.classList.remove('hidden');
  elements.streetInput.setAttribute('aria-expanded', 'true');
}

function selectStreet(street) {
  if (!state.selectedStreets.includes(street)) state.selectedStreets.push(street);
  elements.streetInput.value = '';
  renderSelectedStreets();
  closeSuggestions();
  elements.streetInput.focus();
}

function renderSelectedStreets() {
  elements.selectedStreets.replaceChildren();
  state.selectedStreets.forEach((street) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(document.createTextNode(displayStreet(street)));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Retirer ${displayStreet(street)}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.selectedStreets = state.selectedStreets.filter((item) => item !== street);
      renderSelectedStreets();
    });
    chip.append(remove);
    elements.selectedStreets.append(chip);
  });
}

function closeSuggestions() {
  elements.streetSuggestions.classList.add('hidden');
  elements.streetInput.setAttribute('aria-expanded', 'false');
}

async function refreshStreets() {
  elements.refreshStreets.disabled = true;
  showMessage(elements.streetAdminMessage, 'Actualisation en cours…');
  try {
    const result = await api('/api/admin/streets/refresh', { method: 'POST', body: JSON.stringify({}) });
    await loadStreets();
    showMessage(elements.streetAdminMessage, `${result.count} voies de Chalon-sur-Saône ont été chargées.`, 'success');
  } catch (error) {
    showMessage(elements.streetAdminMessage, error.message, 'error');
  } finally {
    elements.refreshStreets.disabled = false;
  }
}

async function addStreet(event) {
  event.preventDefault();
  const form = new FormData(elements.addStreetForm);
  try {
    const result = await api('/api/admin/streets', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) });
    elements.addStreetForm.reset();
    await loadStreets();
    showMessage(elements.streetAdminMessage, `${displayStreet(result.street)} a été ajoutée.`, 'success');
  } catch (error) {
    showMessage(elements.streetAdminMessage, error.message, 'error');
  }
}

async function deleteRecord(record) {
  if (!window.confirm(`Supprimer définitivement l’arrêté n° ${record.number} et son PDF ?`)) return;
  try {
    await api(`/api/arretes/${encodeURIComponent(record.id)}`, { method: 'DELETE', body: JSON.stringify({}) });
    await loadRecords();
  } catch (error) {
    window.alert(error.message);
  }
}

function showMessage(element, message, type = '') {
  element.textContent = message;
  element.className = `message${type ? ` ${type}` : ''}`;
}

function hideMessage(element) {
  element.textContent = '';
  element.className = 'message hidden';
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
}

function displayStreet(value = '') {
  const string = String(value);
  return string ? string[0].toLocaleUpperCase('fr') + string.slice(1) : '';
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value));
}

function formatBytes(value) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;
  return `${(value / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

function localIsoDate() {
  const parts = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
