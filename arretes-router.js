'use strict';
// ARGOS — Arrêtés municipaux. Fichier autonome généré : ne pas modifier à la main.
const __nativeRequire = require;
const __modules = {
"assets": function (module, exports, require) {
module.exports = {"indexHtml":"<!doctype html>\n<html lang=\"fr\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <meta name=\"description\" content=\"Gestion interne des arrêtés municipaux de Chalon-sur-Saône\">\n    <title>Arrêtés municipaux — ARGOS</title>\n    <link rel=\"stylesheet\" href=\"/arretes/assets/styles.css?v=3\">\n    <script src=\"/arretes/assets/app.js?v=4\" defer></script>\n  </head>\n  <body>\n    <header class=\"site-header\">\n      <img class=\"brand-mark\" src=\"/arretes/assets/logo-arretes.png?v=2\" alt=\"AM — Arrêtés municipaux\">\n      <div class=\"brand-copy\">\n        <p class=\"eyebrow\">PORTAIL ARGOS</p>\n        <h1>Arrêtés municipaux</h1>\n        <p>Police Municipale · Chalon-sur-Saône</p>\n      </div>\n      <div class=\"account\">\n        <span id=\"user-name\">Chargement…</span>\n        <small id=\"user-role\"></small>\n        <a href=\"/arretes/auth/logout\">Retour à ARGOS</a>\n      </div>\n    </header>\n\n    <nav class=\"tabs\" aria-label=\"Navigation principale\">\n      <button class=\"tab active\" type=\"button\" data-view=\"records\">Consulter</button>\n      <button class=\"tab\" type=\"button\" data-view=\"create\">Enregistrer un arrêté</button>\n      <button class=\"tab admin-only hidden\" type=\"button\" data-view=\"streets\">Voies</button>\n    </nav>\n\n    <main>\n      <section id=\"view-records\" class=\"view active\" aria-labelledby=\"records-title\">\n        <div class=\"section-heading\">\n          <div>\n            <p class=\"eyebrow\">REGISTRE</p>\n            <h2 id=\"records-title\">Rechercher un arrêté</h2>\n          </div>\n          <span id=\"record-count\" class=\"count\">0 résultat</span>\n        </div>\n\n        <form id=\"search-form\" class=\"search-panel\">\n          <label class=\"field field-wide\">\n            <span>Numéro, nom ou lieu</span>\n            <input id=\"search-query\" name=\"q\" type=\"search\" placeholder=\"Ex. 2026-145, stationnement, République\">\n          </label>\n          <label class=\"field\">\n            <span>Voie</span>\n            <select id=\"search-street\" name=\"street\">\n              <option value=\"\">Toutes les voies</option>\n            </select>\n          </label>\n          <label class=\"field\">\n            <span>Type</span>\n            <select id=\"search-status\" name=\"status\">\n              <option value=\"all\">Tous les arrêtés</option>\n              <option value=\"temporary\">Temporaires</option>\n              <option value=\"permanent\">Permanents</option>\n            </select>\n          </label>\n          <label class=\"field\">\n            <span>Autorité</span>\n            <select id=\"search-authority\" name=\"authority\">\n              <option value=\"all\">Toutes les autorités</option>\n              <option value=\"municipal\">Municipal</option>\n              <option value=\"prefectoral\">Préfectoral</option>\n              <option value=\"ministerial\">Ministériel</option>\n            </select>\n          </label>\n          <label class=\"field\">\n            <span>Du</span>\n            <input id=\"search-from\" name=\"from\" type=\"date\">\n          </label>\n          <label class=\"field\">\n            <span>Au</span>\n            <input id=\"search-to\" name=\"to\" type=\"date\">\n          </label>\n          <div class=\"search-actions\">\n            <button class=\"button primary\" type=\"submit\">Rechercher</button>\n            <button id=\"reset-search\" class=\"button secondary\" type=\"button\">Effacer</button>\n          </div>\n        </form>\n\n        <div id=\"records-loading\" class=\"state-panel\">Chargement du registre…</div>\n        <div id=\"records-empty\" class=\"state-panel hidden\">\n          <strong>Aucun arrêté trouvé</strong>\n          <span>Modifiez les critères ou enregistrez un nouvel arrêté.</span>\n        </div>\n        <div id=\"records-list\" class=\"records-list\" aria-live=\"polite\"></div>\n      </section>\n\n      <section id=\"view-create\" class=\"view\" aria-labelledby=\"create-title\">\n        <div class=\"section-heading\">\n          <div>\n            <p class=\"eyebrow\">NOUVEL ENREGISTREMENT</p>\n            <h2 id=\"create-title\">Enregistrer un arrêté</h2>\n          </div>\n        </div>\n\n        <form id=\"record-form\" class=\"record-form\" enctype=\"multipart/form-data\">\n          <div class=\"form-grid\">\n            <fieldset class=\"authority-field field-full\">\n              <legend>Autorité de l’arrêté *</legend>\n              <div class=\"radio-group\">\n                <label class=\"radio-option\">\n                  <input name=\"authority\" type=\"radio\" value=\"municipal\" checked>\n                  <span>Arrêté municipal</span>\n                </label>\n                <label class=\"radio-option\">\n                  <input name=\"authority\" type=\"radio\" value=\"prefectoral\">\n                  <span>Arrêté préfectoral</span>\n                </label>\n                <label class=\"radio-option\">\n                  <input name=\"authority\" type=\"radio\" value=\"ministerial\">\n                  <span>Arrêté ministériel</span>\n                </label>\n              </div>\n            </fieldset>\n            <label class=\"field\">\n              <span>Numéro de l’arrêté *</span>\n              <input name=\"number\" required maxlength=\"80\" autocomplete=\"off\" placeholder=\"Ex. PM-2026-0145\">\n            </label>\n            <label class=\"field\">\n              <span>Date de l’arrêté *</span>\n              <input id=\"record-date\" name=\"date\" type=\"date\" required>\n            </label>\n            <label class=\"field field-full\">\n              <span>Nom de l’arrêté *</span>\n              <input name=\"name\" required maxlength=\"220\" autocomplete=\"off\" placeholder=\"Ex. Réglementation temporaire du stationnement\">\n            </label>\n            <div class=\"field field-full\">\n              <span>Rue(s), boulevard(s), place(s) ou impasse(s) *</span>\n              <div class=\"street-picker\">\n                <div id=\"selected-streets\" class=\"chips\" aria-live=\"polite\"></div>\n                <input id=\"street-input\" type=\"search\" autocomplete=\"off\" placeholder=\"Rechercher puis sélectionner une voie\" aria-controls=\"street-suggestions\" aria-expanded=\"false\">\n                <div id=\"street-suggestions\" class=\"suggestions hidden\" role=\"listbox\"></div>\n              </div>\n              <small>Vous pouvez sélectionner plusieurs voies.</small>\n            </div>\n            <label class=\"field field-full\">\n              <span>Précisions sur le lieu</span>\n              <textarea name=\"locationDetails\" maxlength=\"500\" rows=\"3\" placeholder=\"Numéros, carrefour, portion concernée, côté de circulation…\"></textarea>\n            </label>\n            <label class=\"field field-full file-field\">\n              <span>Pièce jointe PDF *</span>\n              <input name=\"attachment\" type=\"file\" accept=\"application/pdf,.pdf\" required>\n              <small>Un seul PDF, 15 Mo maximum.</small>\n            </label>\n          </div>\n\n          <div class=\"temporary-panel\">\n            <label class=\"switch-row\">\n              <input id=\"temporary\" name=\"temporary\" type=\"checkbox\">\n              <span>\n                <strong>Arrêté temporaire</strong>\n                <small>Le dossier sera supprimé automatiquement deux jours après la date de fin.</small>\n              </span>\n            </label>\n            <div id=\"temporary-dates\" class=\"temporary-dates hidden\">\n              <label class=\"field\">\n                <span>Date de début *</span>\n                <input id=\"start-date\" name=\"startDate\" type=\"date\">\n              </label>\n              <label class=\"field\">\n                <span>Date de fin *</span>\n                <input id=\"end-date\" name=\"endDate\" type=\"date\">\n              </label>\n            </div>\n          </div>\n\n          <div id=\"form-message\" class=\"message hidden\" role=\"status\"></div>\n          <div class=\"form-actions\">\n            <button class=\"button primary\" type=\"submit\">Enregistrer l’arrêté</button>\n            <button class=\"button secondary\" type=\"reset\">Réinitialiser</button>\n          </div>\n        </form>\n      </section>\n\n      <section id=\"view-streets\" class=\"view\" aria-labelledby=\"streets-title\">\n        <div class=\"section-heading\">\n          <div>\n            <p class=\"eyebrow\">ADMINISTRATION</p>\n            <h2 id=\"streets-title\">Référentiel des voies</h2>\n          </div>\n        </div>\n        <div class=\"admin-panel\">\n          <p id=\"streets-metadata\">Le référentiel est chargé automatiquement depuis la Base Adresse Nationale.</p>\n          <div class=\"admin-actions\">\n            <button id=\"refresh-streets\" class=\"button primary\" type=\"button\">Actualiser depuis la BAN</button>\n          </div>\n          <form id=\"add-street-form\" class=\"inline-form\">\n            <label class=\"field\">\n              <span>Ajouter une voie manuellement</span>\n              <input name=\"name\" required maxlength=\"160\" placeholder=\"Nom complet de la voie\">\n            </label>\n            <button class=\"button secondary\" type=\"submit\">Ajouter</button>\n          </form>\n          <div id=\"street-admin-message\" class=\"message hidden\" role=\"status\"></div>\n        </div>\n      </section>\n    </main>\n\n    <template id=\"record-template\">\n      <article class=\"record-card\">\n        <div class=\"record-stripe\"></div>\n        <div class=\"record-main\">\n          <div class=\"record-topline\">\n            <span class=\"record-number\"></span>\n            <span class=\"record-type\"></span>\n          </div>\n          <h3 class=\"record-name\"></h3>\n          <div class=\"record-meta\"></div>\n          <div class=\"record-streets\"></div>\n          <p class=\"record-location\"></p>\n          <p class=\"record-expiry\"></p>\n          <p class=\"record-storage\"></p>\n        </div>\n        <div class=\"record-actions\">\n          <a class=\"button primary record-pdf\" target=\"_blank\" rel=\"noopener\">Ouvrir le PDF</a>\n          <button class=\"button danger record-delete admin-only hidden\" type=\"button\">Supprimer</button>\n        </div>\n      </article>\n    </template>\n  </body>\n</html>\n","appJs":"const state = {\n  csrfToken: '',\n  user: null,\n  streets: [],\n  streetsMetadata: null,\n  selectedStreets: [],\n};\n\nconst BASE_PATH = '/arretes';\n\nconst elements = {\n  tabs: [...document.querySelectorAll('.tab')],\n  views: [...document.querySelectorAll('.view')],\n  userName: document.querySelector('#user-name'),\n  userRole: document.querySelector('#user-role'),\n  searchForm: document.querySelector('#search-form'),\n  resetSearch: document.querySelector('#reset-search'),\n  recordsLoading: document.querySelector('#records-loading'),\n  recordsEmpty: document.querySelector('#records-empty'),\n  recordsList: document.querySelector('#records-list'),\n  recordCount: document.querySelector('#record-count'),\n  recordTemplate: document.querySelector('#record-template'),\n  recordForm: document.querySelector('#record-form'),\n  recordDate: document.querySelector('#record-date'),\n  temporary: document.querySelector('#temporary'),\n  temporaryDates: document.querySelector('#temporary-dates'),\n  startDate: document.querySelector('#start-date'),\n  endDate: document.querySelector('#end-date'),\n  formMessage: document.querySelector('#form-message'),\n  streetInput: document.querySelector('#street-input'),\n  selectedStreets: document.querySelector('#selected-streets'),\n  streetSuggestions: document.querySelector('#street-suggestions'),\n  searchStreet: document.querySelector('#search-street'),\n  refreshStreets: document.querySelector('#refresh-streets'),\n  addStreetForm: document.querySelector('#add-street-form'),\n  streetAdminMessage: document.querySelector('#street-admin-message'),\n  streetsMetadata: document.querySelector('#streets-metadata'),\n};\n\ndocument.addEventListener('DOMContentLoaded', initialize);\n\nasync function initialize() {\n  bindEvents();\n  elements.recordDate.value = localIsoDate();\n  try {\n    const me = await api('/api/me');\n    state.user = me.user;\n    state.csrfToken = me.csrfToken;\n    elements.userName.textContent = `Bonjour, ${me.user.name}`;\n    elements.userRole.textContent = me.user.role;\n    if (me.user.admin) document.querySelectorAll('.admin-only').forEach((item) => item.classList.remove('hidden'));\n    await loadStreets();\n    await loadRecords();\n  } catch (error) {\n    showMessage(elements.formMessage, error.message, 'error');\n    elements.recordsLoading.textContent = error.message;\n  }\n}\n\nfunction bindEvents() {\n  elements.tabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));\n  elements.searchForm.addEventListener('submit', (event) => {\n    event.preventDefault();\n    loadRecords();\n  });\n  elements.resetSearch.addEventListener('click', () => {\n    elements.searchForm.reset();\n    loadRecords();\n  });\n  elements.temporary.addEventListener('change', updateTemporaryFields);\n  elements.recordForm.addEventListener('submit', submitRecord);\n  elements.recordForm.addEventListener('reset', () => {\n    setTimeout(() => {\n      state.selectedStreets = [];\n      renderSelectedStreets();\n      elements.recordDate.value = localIsoDate();\n      updateTemporaryFields();\n      hideMessage(elements.formMessage);\n    });\n  });\n  elements.streetInput.addEventListener('input', renderStreetSuggestions);\n  elements.streetInput.addEventListener('focus', renderStreetSuggestions);\n  elements.streetInput.addEventListener('keydown', (event) => {\n    if (event.key === 'Escape') closeSuggestions();\n  });\n  document.addEventListener('click', (event) => {\n    if (!event.target.closest('.street-picker')) closeSuggestions();\n  });\n  elements.refreshStreets.addEventListener('click', refreshStreets);\n  elements.addStreetForm.addEventListener('submit', addStreet);\n}\n\nfunction switchView(name) {\n  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));\n  elements.views.forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));\n  window.scrollTo({ top: 0, behavior: 'smooth' });\n}\n\nasync function api(url, options = {}) {\n  const headers = new Headers(options.headers || {});\n  if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase()) && state.csrfToken) {\n    headers.set('x-csrf-token', state.csrfToken);\n  }\n  if (options.body && !(options.body instanceof FormData)) headers.set('content-type', 'application/json');\n  const response = await fetch(`${BASE_PATH}${url}`, { ...options, headers, credentials: 'same-origin' });\n  if (response.status === 401) {\n    window.location.reload();\n    throw new Error('Session ARGOS expirée');\n  }\n  if (response.status === 204) return null;\n  const payload = await response.json().catch(() => ({}));\n  if (!response.ok) throw new Error(payload.error || 'Une erreur est survenue');\n  return payload;\n}\n\nasync function loadStreets() {\n  const payload = await api('/api/streets');\n  state.streets = payload.streets;\n  state.streetsMetadata = payload.metadata;\n  fillStreetSelect();\n  updateStreetMetadata();\n}\n\nfunction fillStreetSelect() {\n  const selected = elements.searchStreet.value;\n  elements.searchStreet.replaceChildren(new Option('Toutes les voies', ''));\n  state.streets.forEach((street) => elements.searchStreet.add(new Option(displayStreet(street), street)));\n  elements.searchStreet.value = selected;\n}\n\nfunction updateStreetMetadata() {\n  if (!state.streetsMetadata?.updatedAt) {\n    elements.streetsMetadata.textContent = `${state.streets.length} voies disponibles. La synchronisation BAN sera lancée automatiquement.`;\n    return;\n  }\n  elements.streetsMetadata.textContent = `${state.streets.length} voies · source ${state.streetsMetadata.source} · mise à jour le ${formatDateTime(state.streetsMetadata.updatedAt)}.`;\n}\n\nasync function loadRecords() {\n  elements.recordsLoading.classList.remove('hidden');\n  elements.recordsEmpty.classList.add('hidden');\n  elements.recordsList.replaceChildren();\n  const parameters = new URLSearchParams(new FormData(elements.searchForm));\n  [...parameters.entries()].forEach(([key, value]) => !value && parameters.delete(key));\n  try {\n    const payload = await api(`/api/arretes?${parameters}`);\n    renderRecords(payload.records);\n  } catch (error) {\n    elements.recordsLoading.textContent = error.message;\n  }\n}\n\nfunction renderRecords(records) {\n  elements.recordsLoading.classList.add('hidden');\n  elements.recordCount.textContent = `${records.length} résultat${records.length > 1 ? 's' : ''}`;\n  if (!records.length) {\n    elements.recordsEmpty.classList.remove('hidden');\n    return;\n  }\n\n  records.forEach((record) => {\n    const card = elements.recordTemplate.content.firstElementChild.cloneNode(true);\n    card.classList.toggle('temporary', record.temporary);\n    card.querySelector('.record-number').textContent = `N° ${record.number}`;\n    card.querySelector('.record-type').textContent = `${authorityLabel(record.authority)} · ${record.temporary ? 'Temporaire' : 'Permanent'}`;\n    card.querySelector('.record-name').textContent = record.name;\n    card.querySelector('.record-meta').textContent = `Arrêté du ${formatDate(record.date)} · enregistré par ${record.createdBy?.name || 'ARGOS'} le ${formatDateTime(record.createdAt)}`;\n    const streetsContainer = card.querySelector('.record-streets');\n    record.streets.forEach((street) => {\n      const item = document.createElement('span');\n      item.textContent = displayStreet(street);\n      streetsContainer.append(item);\n    });\n    const location = card.querySelector('.record-location');\n    if (record.locationDetails) location.textContent = record.locationDetails;\n    else location.remove();\n    const expiry = card.querySelector('.record-expiry');\n    if (record.temporary) {\n      expiry.textContent = `Valable du ${formatDate(record.startDate)} au ${formatDate(record.endDate)} · suppression automatique le ${formatDateTime(record.deleteAt)}.`;\n    } else {\n      expiry.remove();\n    }\n    const storage = card.querySelector('.record-storage');\n    const originalSize = Number(record.attachment?.originalSize || record.attachment?.size || 0);\n    const storedSize = Number(record.attachment?.size || 0);\n    const saved = Math.max(0, originalSize - storedSize);\n    if (originalSize && saved) {\n      const percent = Math.round((saved / originalSize) * 100);\n      storage.textContent = `PDF optimisé : ${formatBytes(storedSize)} sur le disque · gain ${percent} %.`;\n    } else if (storedSize) {\n      storage.textContent = `PDF déjà optimisé : ${formatBytes(storedSize)} sur le disque.`;\n    } else {\n      storage.remove();\n    }\n    const pdf = card.querySelector('.record-pdf');\n    pdf.href = `${BASE_PATH}/api/arretes/${encodeURIComponent(record.id)}/piece-jointe`;\n    const deleteButton = card.querySelector('.record-delete');\n    if (state.user.admin) {\n      deleteButton.classList.remove('hidden');\n      deleteButton.addEventListener('click', () => deleteRecord(record));\n    }\n    elements.recordsList.append(card);\n  });\n}\n\nasync function submitRecord(event) {\n  event.preventDefault();\n  if (!state.selectedStreets.length) {\n    showMessage(elements.formMessage, 'Sélectionnez au moins une voie.', 'error');\n    elements.streetInput.focus();\n    return;\n  }\n  const submitButton = elements.recordForm.querySelector('[type=\"submit\"]');\n  submitButton.disabled = true;\n  hideMessage(elements.formMessage);\n  const body = new FormData(elements.recordForm);\n  body.set('temporary', elements.temporary.checked ? 'true' : 'false');\n  body.set('streets', JSON.stringify(state.selectedStreets));\n  try {\n    await api('/api/arretes', { method: 'POST', body });\n    elements.recordForm.reset();\n    state.selectedStreets = [];\n    renderSelectedStreets();\n    elements.recordDate.value = localIsoDate();\n    showMessage(elements.formMessage, 'L’arrêté et sa pièce jointe ont été enregistrés.', 'success');\n    await loadRecords();\n    switchView('records');\n  } catch (error) {\n    showMessage(elements.formMessage, error.message, 'error');\n  } finally {\n    submitButton.disabled = false;\n  }\n}\n\nfunction updateTemporaryFields() {\n  const enabled = elements.temporary.checked;\n  elements.temporaryDates.classList.toggle('hidden', !enabled);\n  elements.startDate.required = enabled;\n  elements.endDate.required = enabled;\n  if (!enabled) {\n    elements.startDate.value = '';\n    elements.endDate.value = '';\n  }\n}\n\nfunction renderStreetSuggestions() {\n  const query = normalize(elements.streetInput.value);\n  if (!query) return closeSuggestions();\n  const matches = state.streets\n    .filter((street) => normalize(street).includes(query) && !state.selectedStreets.includes(street))\n    .slice(0, 18);\n  elements.streetSuggestions.replaceChildren();\n  if (!matches.length) return closeSuggestions();\n  matches.forEach((street) => {\n    const button = document.createElement('button');\n    button.type = 'button';\n    button.className = 'suggestion';\n    button.role = 'option';\n    button.textContent = displayStreet(street);\n    button.addEventListener('click', () => selectStreet(street));\n    elements.streetSuggestions.append(button);\n  });\n  elements.streetSuggestions.classList.remove('hidden');\n  elements.streetInput.setAttribute('aria-expanded', 'true');\n}\n\nfunction selectStreet(street) {\n  if (!state.selectedStreets.includes(street)) state.selectedStreets.push(street);\n  elements.streetInput.value = '';\n  renderSelectedStreets();\n  closeSuggestions();\n  elements.streetInput.focus();\n}\n\nfunction renderSelectedStreets() {\n  elements.selectedStreets.replaceChildren();\n  state.selectedStreets.forEach((street) => {\n    const chip = document.createElement('span');\n    chip.className = 'chip';\n    chip.append(document.createTextNode(displayStreet(street)));\n    const remove = document.createElement('button');\n    remove.type = 'button';\n    remove.setAttribute('aria-label', `Retirer ${displayStreet(street)}`);\n    remove.textContent = '×';\n    remove.addEventListener('click', () => {\n      state.selectedStreets = state.selectedStreets.filter((item) => item !== street);\n      renderSelectedStreets();\n    });\n    chip.append(remove);\n    elements.selectedStreets.append(chip);\n  });\n}\n\nfunction closeSuggestions() {\n  elements.streetSuggestions.classList.add('hidden');\n  elements.streetInput.setAttribute('aria-expanded', 'false');\n}\n\nasync function refreshStreets() {\n  elements.refreshStreets.disabled = true;\n  showMessage(elements.streetAdminMessage, 'Actualisation en cours…');\n  try {\n    const result = await api('/api/admin/streets/refresh', { method: 'POST', body: JSON.stringify({}) });\n    await loadStreets();\n    showMessage(elements.streetAdminMessage, `${result.count} voies de Chalon-sur-Saône ont été chargées.`, 'success');\n  } catch (error) {\n    showMessage(elements.streetAdminMessage, error.message, 'error');\n  } finally {\n    elements.refreshStreets.disabled = false;\n  }\n}\n\nasync function addStreet(event) {\n  event.preventDefault();\n  const form = new FormData(elements.addStreetForm);\n  try {\n    const result = await api('/api/admin/streets', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) });\n    elements.addStreetForm.reset();\n    await loadStreets();\n    showMessage(elements.streetAdminMessage, `${displayStreet(result.street)} a été ajoutée.`, 'success');\n  } catch (error) {\n    showMessage(elements.streetAdminMessage, error.message, 'error');\n  }\n}\n\nasync function deleteRecord(record) {\n  if (!window.confirm(`Supprimer définitivement l’arrêté n° ${record.number} et son PDF ?`)) return;\n  try {\n    await api(`/api/arretes/${encodeURIComponent(record.id)}`, { method: 'DELETE', body: JSON.stringify({}) });\n    await loadRecords();\n  } catch (error) {\n    window.alert(error.message);\n  }\n}\n\nfunction showMessage(element, message, type = '') {\n  element.textContent = message;\n  element.className = `message${type ? ` ${type}` : ''}`;\n}\n\nfunction hideMessage(element) {\n  element.textContent = '';\n  element.className = 'message hidden';\n}\n\nfunction normalize(value = '') {\n  return String(value).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('fr').trim();\n}\n\nfunction displayStreet(value = '') {\n  const string = String(value);\n  return string ? string[0].toLocaleUpperCase('fr') + string.slice(1) : '';\n}\n\nfunction authorityLabel(value) {\n  return {\n    municipal: 'Municipal',\n    prefectoral: 'Préfectoral',\n    ministerial: 'Ministériel',\n  }[value] || 'Municipal';\n}\n\nfunction formatDate(value) {\n  if (!value) return '—';\n  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`));\n}\n\nfunction formatDateTime(value) {\n  if (!value) return '—';\n  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value));\n}\n\nfunction formatBytes(value) {\n  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;\n  return `${(value / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;\n}\n\nfunction localIsoDate() {\n  const parts = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());\n  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));\n  return `${values.year}-${values.month}-${values.day}`;\n}\n","stylesCss":":root {\n  --navy: #123f73;\n  --navy-deep: #0b2d52;\n  --blue: #076bc1;\n  --blue-light: #e9f3fb;\n  --red: #e3062c;\n  --text: #24384c;\n  --muted: #657585;\n  --border: #ccd8e4;\n  --surface: #ffffff;\n  --page: #f7f9fc;\n  --success: #19743a;\n  --danger-bg: #fff0f2;\n  font-family: Arial, Helvetica, sans-serif;\n  color: var(--text);\n  background: var(--page);\n  font-synthesis: none;\n}\n\n* { box-sizing: border-box; }\n\nbody { margin: 0; min-width: 320px; background: var(--page); }\n\nbutton, input, select, textarea { font: inherit; }\nbutton, a { -webkit-tap-highlight-color: transparent; }\n\n.site-header {\n  min-height: 112px;\n  display: grid;\n  grid-template-columns: auto 1fr auto;\n  align-items: center;\n  gap: 20px;\n  padding: 20px clamp(20px, 5vw, 72px);\n  color: var(--navy-deep);\n  background: white;\n  border-top: 5px solid var(--blue);\n  border-bottom: 4px solid var(--red);\n  box-shadow: 0 2px 10px rgba(25, 58, 89, .08);\n}\n\n.brand-mark {\n  width: 92px;\n  height: 92px;\n  display: block;\n  object-fit: contain;\n}\n\n.brand-copy h1 { margin: 2px 0 5px; font-size: clamp(25px, 4vw, 36px); line-height: 1.05; }\n.brand-copy p { margin: 0; color: var(--muted); }\n.eyebrow { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; color: var(--blue); }\n.site-header .eyebrow { color: var(--blue); }\n\n.account { display: grid; justify-items: end; gap: 3px; text-align: right; }\n.account span { font-weight: 700; }\n.account small { color: var(--muted); text-transform: capitalize; }\n.account a { margin-top: 5px; color: var(--blue); font-size: 14px; font-weight: 700; }\n\n.tabs {\n  display: flex;\n  gap: 0;\n  padding: 0 clamp(20px, 5vw, 72px);\n  background: #f4f8fc;\n  border-bottom: 1px solid var(--border);\n  overflow-x: auto;\n}\n\n.tab {\n  appearance: none;\n  border: 0;\n  border-bottom: 4px solid transparent;\n  padding: 17px 22px 13px;\n  color: var(--muted);\n  background: transparent;\n  font-weight: 700;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.tab:hover { color: var(--navy); background: white; }\n.tab.active { color: var(--navy); border-bottom-color: var(--blue); background: white; }\n\nmain { width: min(1180px, calc(100% - 40px)); margin: 34px auto 70px; }\n.view { display: none; }\n.view.active { display: block; }\n\n.section-heading { display: flex; justify-content: space-between; gap: 20px; align-items: end; margin-bottom: 18px; }\n.section-heading h2 { margin: 4px 0 0; color: var(--navy-deep); font-size: clamp(23px, 3vw, 30px); }\n.count { color: var(--muted); font-size: 14px; }\n\n.search-panel, .record-form, .admin-panel {\n  background: white;\n  border: 1px solid var(--border);\n  border-top: 5px solid var(--blue);\n  padding: 24px;\n}\n\n.search-panel {\n  display: grid;\n  grid-template-columns: minmax(220px, 1.6fr) repeat(5, minmax(120px, 1fr));\n  gap: 16px;\n  align-items: end;\n  margin-bottom: 24px;\n}\n\n.field { display: grid; gap: 7px; min-width: 0; }\n.field > span { color: var(--navy-deep); font-size: 14px; font-weight: 700; }\n.field small, .switch-row small { color: var(--muted); line-height: 1.4; }\n.field-full { grid-column: 1 / -1; }\n\n.authority-field {\n  margin: 0;\n  border: 1px solid var(--border);\n  padding: 15px 17px 17px;\n  background: #f8fbfe;\n}\n.authority-field legend { padding: 0 7px; color: var(--navy-deep); font-size: 14px; font-weight: 700; }\n.radio-group { display: flex; flex-wrap: wrap; gap: 10px; }\n.radio-option {\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  min-height: 44px;\n  padding: 9px 13px;\n  border: 1px solid #aebdcb;\n  background: white;\n  color: var(--navy-deep);\n  font-weight: 700;\n  cursor: pointer;\n}\n.radio-option:has(input:checked) { border-color: var(--blue); background: var(--blue-light); }\n.radio-option input { width: 18px; min-height: 18px; margin: 0; accent-color: var(--blue); }\n\ninput, select, textarea {\n  width: 100%;\n  min-height: 44px;\n  border: 1px solid #aebdcb;\n  border-radius: 2px;\n  padding: 10px 12px;\n  color: var(--text);\n  background: white;\n}\n\ntextarea { resize: vertical; line-height: 1.5; }\ninput:focus, select:focus, textarea:focus, button:focus-visible, a:focus-visible {\n  outline: 3px solid rgba(7, 107, 193, .22);\n  outline-offset: 2px;\n  border-color: var(--blue);\n}\n\n.search-actions, .form-actions, .admin-actions { display: flex; gap: 10px; align-items: center; }\n.search-actions { grid-column: 1 / -1; justify-content: flex-end; }\n\n.button {\n  display: inline-flex;\n  min-height: 42px;\n  align-items: center;\n  justify-content: center;\n  border: 1px solid transparent;\n  border-radius: 2px;\n  padding: 9px 16px;\n  font-weight: 700;\n  text-decoration: none;\n  cursor: pointer;\n}\n.button:disabled { opacity: .55; cursor: wait; }\n.button.primary { color: white; background: var(--blue); }\n.button.primary:hover { background: #055ba5; }\n.button.secondary { color: var(--navy); border-color: #9fb1c2; background: white; }\n.button.secondary:hover { background: #edf3f8; }\n.button.danger { color: #a10d27; border-color: #e4a7b2; background: var(--danger-bg); }\n\n.state-panel {\n  display: grid;\n  justify-items: center;\n  gap: 6px;\n  padding: 50px 20px;\n  color: var(--muted);\n  text-align: center;\n  background: white;\n  border: 1px solid var(--border);\n}\n\n.records-list { display: grid; gap: 12px; }\n.record-card {\n  display: grid;\n  grid-template-columns: 6px 1fr auto;\n  background: white;\n  border: 1px solid var(--border);\n  min-width: 0;\n}\n.record-stripe { background: var(--blue); }\n.record-card.temporary .record-stripe { background: var(--red); }\n.record-main { min-width: 0; padding: 20px 22px; }\n.record-topline { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 7px; }\n.record-number { color: var(--blue); font-weight: 800; letter-spacing: .02em; }\n.record-type { padding: 4px 8px; background: var(--blue-light); color: var(--navy); font-size: 12px; font-weight: 700; text-transform: uppercase; }\n.temporary .record-type { color: #9d1430; background: #ffe8ed; }\n.record-name { margin: 0 0 10px; color: var(--navy-deep); font-size: 19px; }\n.record-meta { color: var(--muted); font-size: 13px; }\n.record-streets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 13px; }\n.record-streets span, .chip { padding: 5px 9px; color: var(--navy); background: #eaf2f9; border: 1px solid #cfdeeb; font-size: 13px; }\n.record-location, .record-expiry, .record-storage { margin: 11px 0 0; color: var(--muted); font-size: 14px; line-height: 1.45; }\n.record-expiry { color: #a10d27; font-weight: 700; }\n.record-storage { color: #43637f; }\n.record-actions { display: flex; flex-direction: column; justify-content: center; gap: 9px; width: 158px; padding: 18px; border-left: 1px solid var(--border); }\n\n.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }\n.record-form { display: grid; gap: 24px; }\n.file-field { padding: 16px; background: #f6f9fc; border: 1px dashed #9eb4c8; }\n.file-field input { padding: 7px; background: white; }\n\n.street-picker { position: relative; border: 1px solid #aebdcb; background: white; padding: 7px; }\n.street-picker:focus-within { outline: 3px solid rgba(7, 107, 193, .22); border-color: var(--blue); }\n.street-picker input { border: 0; outline: 0; padding: 8px 5px; min-height: 38px; }\n.chips { display: flex; flex-wrap: wrap; gap: 6px; }\n.chip { display: inline-flex; align-items: center; gap: 7px; }\n.chip button { border: 0; padding: 0; color: #7e1730; background: transparent; font-weight: 800; cursor: pointer; }\n.suggestions {\n  position: absolute;\n  z-index: 20;\n  top: calc(100% + 3px);\n  left: -1px;\n  right: -1px;\n  max-height: 260px;\n  overflow-y: auto;\n  background: white;\n  border: 1px solid #91a8bd;\n  box-shadow: 0 10px 24px rgba(20, 49, 75, .16);\n}\n.suggestion { width: 100%; border: 0; padding: 11px 13px; text-align: left; color: var(--text); background: white; cursor: pointer; }\n.suggestion:hover, .suggestion:focus { color: var(--navy); background: var(--blue-light); }\n\n.temporary-panel { padding: 18px; background: #f6f9fc; border-left: 5px solid var(--navy); }\n.switch-row { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }\n.switch-row input { width: 20px; min-height: 20px; margin-top: 2px; accent-color: var(--blue); }\n.switch-row span { display: grid; gap: 4px; }\n.temporary-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }\n.form-actions { justify-content: flex-end; padding-top: 2px; }\n\n.message { padding: 12px 14px; border-left: 4px solid var(--blue); color: var(--navy-deep); background: var(--blue-light); }\n.message.error { color: #8c1028; background: #fff0f2; border-left-color: var(--red); }\n.message.success { color: #125e30; background: #edf8f0; border-left-color: var(--success); }\n.admin-panel { display: grid; gap: 24px; }\n.admin-panel p { margin: 0; color: var(--muted); line-height: 1.5; }\n.inline-form { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; padding-top: 20px; border-top: 1px solid var(--border); }\n\n.hidden { display: none !important; }\n\n@media (max-width: 980px) {\n  .search-panel { grid-template-columns: 1fr 1fr; }\n  .field-wide { grid-column: 1 / -1; }\n}\n\n@media (max-width: 680px) {\n  .site-header { grid-template-columns: auto 1fr; padding: 18px 20px; }\n  .brand-mark { width: 72px; height: 72px; }\n  .account { grid-column: 1 / -1; justify-items: start; text-align: left; padding-top: 12px; border-top: 1px solid var(--border); }\n  .tabs { padding: 0; }\n  main { width: min(100% - 24px, 1180px); margin-top: 24px; }\n  .search-panel, .record-form, .admin-panel { padding: 18px; }\n  .search-panel, .form-grid, .temporary-dates, .inline-form { grid-template-columns: 1fr; }\n  .radio-group { display: grid; grid-template-columns: 1fr; }\n  .field-full, .field-wide { grid-column: auto; }\n  .record-card { grid-template-columns: 5px 1fr; }\n  .record-actions { grid-column: 2; width: auto; flex-direction: row; justify-content: flex-start; border-left: 0; border-top: 1px solid var(--border); }\n  .record-actions .button { flex: 1; }\n  .section-heading { align-items: start; flex-direction: column; gap: 8px; }\n}\n","accessDeniedHtml":"<!doctype html>\n<html lang=\"fr\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <title>Accès réservé — ARGOS</title>\n    <style>\n      :root { font-family: Arial, sans-serif; color: #17375e; background: #f3f6f9; }\n      body { min-height: 100vh; display: grid; place-items: center; margin: 0; }\n      main { width: min(440px, calc(100% - 40px)); background: white; border: 1px solid #c9d5e2; border-top: 6px solid #0b65c2; padding: 32px; box-sizing: border-box; }\n      h1 { margin: 0 0 12px; font-size: 24px; }\n      p { color: #5d6b79; line-height: 1.55; margin: 0; }\n      a { display: inline-block; margin-top: 20px; padding: 10px 15px; color: white; background: #076bc1; text-decoration: none; font-weight: 700; }\n    </style>\n  </head>\n  <body>\n    <main>\n      <h1>Accès réservé</h1>\n      <p>Cette application est accessible uniquement depuis le portail ARGOS. Ouvrez la tuile « Arrêtés municipaux » dans ARGOS.</p>\n      <a href=\"/portail/\">Retour à ARGOS</a>\n    </main>\n  </body>\n</html>\n","streetsSeed":["Avenue de Paris","Avenue Jean Jaurès","Boulevard de la République","Boulevard Saint-Martin","Place de l'Hôtel de Ville","Place Saint-Vincent","Quai de la Monnaie","Quai des Messageries","Rue de Belfort","Rue de Strasbourg","Rue du Pont","Rue Général Leclerc","Rue Saint-Vincent"],"logoBase64":"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"};
},
"expiry": function (module, exports, require) {
const { DateTime } = require('luxon');

const CITY_TIME_ZONE = 'Europe/Paris';

function computeDeleteAt(endDate) {
  const parsed = DateTime.fromISO(endDate, { zone: CITY_TIME_ZONE });
  if (!parsed.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Date de fin invalide');
  }

  return parsed.endOf('day').plus({ days: 2 }).toUTC().toISO();
}

function isExpired(record, now = DateTime.utc()) {
  if (!record.temporary || !record.deleteAt) return false;
  const deleteAt = DateTime.fromISO(record.deleteAt, { zone: 'utc' });
  return deleteAt.isValid && now.toMillis() >= deleteAt.toMillis();
}

module.exports = { CITY_TIME_ZONE, computeDeleteAt, isExpired };

},
"pdfStorage": function (module, exports, require) {
const fs = require('fs/promises');
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');

function isStoredPdfName(name) {
  return /^[a-f0-9-]+\.pdf(?:\.gz)?$/i.test(String(name || ''));
}

async function optimizePdf(sourcePath) {
  const original = await fs.stat(sourcePath);
  const compressedPath = `${sourcePath}.gz`;

  try {
    await pipeline(
      createReadStream(sourcePath),
      zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
      createWriteStream(compressedPath, { mode: 0o600 }),
    );
    const compressed = await fs.stat(compressedPath);

    if (compressed.size >= original.size) {
      await fs.unlink(compressedPath);
      return {
        path: sourcePath,
        storedName: path.basename(sourcePath),
        originalSize: original.size,
        storedSize: original.size,
        encoding: null,
        savedBytes: 0,
      };
    }

    await fs.unlink(sourcePath);
    return {
      path: compressedPath,
      storedName: path.basename(compressedPath),
      originalSize: original.size,
      storedSize: compressed.size,
      encoding: 'gzip',
      savedBytes: original.size - compressed.size,
    };
  } catch (error) {
    await fs.unlink(compressedPath).catch(() => {});
    throw error;
  }
}

module.exports = { isStoredPdfName, optimizePdf };


},
"store": function (module, exports, require) {
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { DateTime } = require('luxon');
const { isExpired } = require('./expiry');
const { isStoredPdfName } = require('./pdf-storage');

class ArretesStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.recordsFile = path.join(dataDir, 'arretes.json');
    this.uploadsDir = path.join(dataDir, 'pieces-jointes');
    this.queue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    try {
      await fs.access(this.recordsFile);
    } catch {
      await this.writeRecords([]);
    }
  }

  async readRecords() {
    const raw = await fs.readFile(this.recordsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Le fichier des arrêtés est invalide');
    return parsed;
  }

  async writeRecords(records) {
    const temporary = `${this.recordsFile}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, this.recordsFile);
  }

  serialized(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async list(filters = {}) {
    const records = await this.readRecords();
    const query = normalize(filters.q);
    const street = normalize(filters.street);
    const from = filters.from ? DateTime.fromISO(filters.from) : null;
    const to = filters.to ? DateTime.fromISO(filters.to) : null;
    const status = filters.status || 'all';
    const authority = filters.authority || 'all';

    return records
      .filter((record) => {
        if (status === 'temporary' && !record.temporary) return false;
        if (status === 'permanent' && record.temporary) return false;
        if (authority !== 'all' && (record.authority || 'municipal') !== authority) return false;
        if (street && !record.streets.some((name) => normalize(name) === street)) return false;
        const date = DateTime.fromISO(record.date);
        if (from?.isValid && date < from.startOf('day')) return false;
        if (to?.isValid && date > to.endOf('day')) return false;
        if (!query) return true;
        const haystack = normalize([
          record.number,
          record.name,
          record.locationDetails,
          record.authority || 'municipal',
          record.streets.join(' '),
          record.createdBy?.name,
        ].join(' '));
        return haystack.includes(query);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id) {
    const records = await this.readRecords();
    return records.find((record) => record.id === id) || null;
  }

  async create(input) {
    return this.serialized(async () => {
      const records = await this.readRecords();
      if (records.some((record) => normalize(record.number) === normalize(input.number))) {
        const error = new Error('Ce numéro d’arrêté existe déjà');
        error.status = 409;
        throw error;
      }
      const record = {
        id: crypto.randomUUID(),
        number: input.number,
        name: input.name,
        date: input.date,
        streets: input.streets,
        locationDetails: input.locationDetails,
        authority: input.authority || 'municipal',
        temporary: input.temporary,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        deleteAt: input.deleteAt || null,
        attachment: input.attachment,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
      };
      records.push(record);
      await this.writeRecords(records);
      return record;
    });
  }

  async deleteById(id) {
    return this.serialized(async () => {
      const records = await this.readRecords();
      const record = records.find((item) => item.id === id);
      if (!record) return false;
      await this.writeRecords(records.filter((item) => item.id !== id));
      await this.deleteAttachment(record.attachment?.storedName);
      return true;
    });
  }

  async purgeExpired(now = DateTime.utc()) {
    return this.serialized(async () => {
      const records = await this.readRecords();
      const expired = records.filter((record) => isExpired(record, now));
      if (!expired.length) return [];
      await this.writeRecords(records.filter((record) => !isExpired(record, now)));
      await Promise.all(expired.map((record) => this.deleteAttachment(record.attachment?.storedName)));
      return expired.map((record) => ({ id: record.id, number: record.number }));
    });
  }

  async deleteAttachment(storedName) {
    if (!isStoredPdfName(storedName)) return;
    try {
      await fs.unlink(path.join(this.uploadsDir, storedName));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim();
}

module.exports = { ArretesStore, normalize };

},
"streets": function (module, exports, require) {
const fs = require('fs/promises');
const path = require('path');
const readline = require('readline');
const { Readable } = require('stream');
const zlib = require('zlib');
const { normalize } = require('./store');

const DEFAULT_BAN_URL = 'https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-71.csv.gz';
const CHALON_INSEE_CODE = '71076';
const SPECIAL_STREETS = ['Ville de Chalon-sur-Saône'];

class StreetsRepository {
  constructor(dataDir, seedSource) {
    this.file = path.join(dataDir, 'voies-chalon-sur-saone.json');
    this.metaFile = path.join(dataDir, 'voies-meta.json');
    this.seedSource = seedSource;
    this.refreshing = null;
  }

  async initialize() {
    try {
      await fs.access(this.file);
    } catch {
      const seed = Array.isArray(this.seedSource)
        ? this.seedSource
        : JSON.parse(await fs.readFile(this.seedSource, 'utf8'));
      await this.write(seed);
    }
  }

  async list() {
    const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  }

  async metadata() {
    try {
      return JSON.parse(await fs.readFile(this.metaFile, 'utf8'));
    } catch {
      return { source: 'liste locale de secours', updatedAt: null };
    }
  }

  async add(name) {
    const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
    if (cleaned.length < 3 || cleaned.length > 160) throw new Error('Nom de voie invalide');
    const streets = await this.list();
    if (!streets.some((street) => normalize(street) === normalize(cleaned))) streets.push(cleaned);
    await this.write(streets);
    return cleaned;
  }

  async write(streets) {
    const completeList = [...SPECIAL_STREETS, ...streets];
    const unique = [...new Map(completeList.filter(Boolean).map((street) => [normalize(street), String(street).trim()])).values()]
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    await fs.writeFile(this.file, `${JSON.stringify(unique, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return unique;
  }

  refreshFromBan() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.performRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async performRefresh() {
    const url = process.env.BAN_CSV_URL || DEFAULT_BAN_URL;
    const response = await fetch(url, { headers: { 'user-agent': 'ARGOS-Arretes-Municipaux/1.0' } });
    if (!response.ok || !response.body) throw new Error(`Téléchargement BAN impossible (${response.status})`);

    const csvStream = Readable.fromWeb(response.body).pipe(zlib.createGunzip());
    const lines = readline.createInterface({ input: csvStream, crlfDelay: Infinity });
    const streets = new Set();
    let headers = null;

    for await (const line of lines) {
      const values = parseCsvLine(line, ';');
      if (!headers) {
        headers = values.map((value) => value.replace(/^\uFEFF/, ''));
        continue;
      }
      const codeIndex = headers.indexOf('code_insee');
      const streetIndex = headers.indexOf('nom_voie');
      if (codeIndex === -1 || streetIndex === -1) throw new Error('Format BAN inattendu');
      if (values[codeIndex] === CHALON_INSEE_CODE && values[streetIndex]) streets.add(values[streetIndex].trim());
    }

    if (streets.size < 100) throw new Error(`Liste BAN incomplète (${streets.size} voies)`);
    const saved = await this.write([...streets]);
    await fs.writeFile(
      this.metaFile,
      `${JSON.stringify({ source: 'Base Adresse Nationale', inseeCode: CHALON_INSEE_CODE, updatedAt: new Date().toISOString(), count: saved.length }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    return saved;
  }
}

function parseCsvLine(line, delimiter) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  fields.push(value);
  return fields;
}

module.exports = { CHALON_INSEE_CODE, SPECIAL_STREETS, StreetsRepository, parseCsvLine };

},
"router": function (module, exports, require) {
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
const embedded = require('./embedded-assets.generated');

const PREFIX = '/arretes';
const COOKIE_NAME = 'argos_arretes_auth';
const VERSION = '1.1.0-pegase2';

function mountArretes(app, auth) {
  if (!auth || typeof auth.consumeSsoToken !== 'function' || typeof auth.issueSessionToken !== 'function' || typeof auth.verifySessionToken !== 'function') {
    throw new Error('Le raccordement ARGOS des arrêtés est incomplet');
  }

  const dataDir = path.resolve(process.env.ARRETES_DATA_DIR || '/var/data/arretes');
  const store = new ArretesStore(dataDir);
  const streets = new StreetsRepository(dataDir, embedded.streetsSeed);
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
      res.status(403).type('html').send(embedded.accessDeniedHtml);
    }
  });

  router.get('/auth/logout', (req, res) => {
    clearCookie(req, res);
    res.redirect(303, '/portail/');
  });

  router.get('/assets/styles.css', (_req, res) => res.type('css').set('Cache-Control', 'public, max-age=3600').send(embedded.stylesCss));
  router.get('/assets/app.js', (_req, res) => res.type('js').set('Cache-Control', 'public, max-age=3600').send(embedded.appJs));
  router.get('/assets/logo-arretes.png', (_req, res) => {
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(Buffer.from(embedded.logoBase64, 'base64'));
  });
  router.get('/', requireAuth, (_req, res) => res.type('html').send(embedded.indexHtml));

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
        authority: req.query.authority,
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
      return res.status(403).type('html').send(embedded.accessDeniedHtml);
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
  const authority = String(body.authority || 'municipal');
  if (!['municipal', 'prefectoral', 'ministerial'].includes(authority)) throw badRequest('Autorité de l’arrêté invalide');
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
  return { number, name, date, streets: selectedStreets, locationDetails, authority, temporary, startDate, endDate, deleteAt };
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

}
};
const __maps = {"router":{"./lib/expiry":"expiry","./lib/pdf-storage":"pdfStorage","./lib/store":"store","./lib/streets":"streets","./embedded-assets.generated":"assets"},"store":{"./expiry":"expiry","./pdf-storage":"pdfStorage"},"streets":{"./store":"store"}};
const __cache = Object.create(null);
function __load(id) {
  if (__cache[id]) return __cache[id].exports;
  if (!__modules[id]) return __nativeRequire(id);
  const module = { exports: {} };
  __cache[id] = module;
  const localRequire = (name) => __maps[id] && __maps[id][name] ? __load(__maps[id][name]) : __nativeRequire(name);
  __modules[id](module, module.exports, localRequire);
  return module.exports;
}
module.exports = __load('router');
