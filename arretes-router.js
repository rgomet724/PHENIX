'use strict';
// ARGOS — Arrêtés municipaux. Fichier autonome généré : ne pas modifier à la main.
const __nativeRequire = require;
const __modules = {
"assets": function (module, exports, require) {
module.exports = {"indexHtml":"<!doctype html>\n<html lang=\"fr\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <meta name=\"description\" content=\"Gestion interne des arrêtés municipaux de Chalon-sur-Saône\">\n    <title>Arrêtés municipaux — ARGOS</title>\n    <link rel=\"stylesheet\" href=\"/arretes/assets/styles.css\">\n    <script src=\"/arretes/assets/app.js\" defer></script>\n  </head>\n  <body>\n    <header class=\"site-header\">\n      <div class=\"brand-mark\" aria-hidden=\"true\">AM</div>\n      <div class=\"brand-copy\">\n        <p class=\"eyebrow\">PORTAIL ARGOS</p>\n        <h1>Arrêtés municipaux</h1>\n        <p>Police Municipale · Chalon-sur-Saône</p>\n      </div>\n      <div class=\"account\">\n        <span id=\"user-name\">Chargement…</span>\n        <small id=\"user-role\"></small>\n        <a href=\"/arretes/auth/logout\">Retour à ARGOS</a>\n      </div>\n    </header>\n\n    <nav class=\"tabs\" aria-label=\"Navigation principale\">\n      <button class=\"tab active\" type=\"button\" data-view=\"records\">Consulter</button>\n      <button class=\"tab\" type=\"button\" data-view=\"create\">Enregistrer un arrêté</button>\n      <button class=\"tab admin-only hidden\" type=\"button\" data-view=\"streets\">Voies</button>\n    </nav>\n\n    <main>\n      <section id=\"view-records\" class=\"view active\" aria-labelledby=\"records-title\">\n        <div class=\"section-heading\">\n          <div>\n            <p class=\"eyebrow\">REGISTRE</p>\n            <h2 id=\"records-title\">Rechercher un arrêté</h2>\n          </div>\n          <span id=\"record-count\" class=\"count\">0 résultat</span>\n        </div>\n\n        <form id=\"search-form\" class=\"search-panel\">\n          <label class=\"field field-wide\">\n            <span>Numéro, nom ou lieu</span>\n            <input id=\"search-query\" name=\"q\" type=\"search\" placeholder=\"Ex. 2026-145, stationnement, République\">\n          </label>\n          <label class=\"field\">\n            <span>Voie</span>\n            <select id=\"search-street\" name=\"street\">\n              <option value=\"\">Toutes les voies</option>\n            </select>\n          </label>\n          <label class=\"field\">\n            <span>Type</span>\n            <select id=\"search-status\" name=\"status\">\n              <option value=\"all\">Tous les arrêtés</option>\n              <option value=\"temporary\">Temporaires</option>\n              <option value=\"permanent\">Permanents</option>\n            </select>\n          </label>\n          <label class=\"field\">\n            <span>Du</span>\n            <input id=\"search-from\" name=\"from\" type=\"date\">\n          </label>\n          <label class=\"field\">\n            <span>Au</span>\n            <input id=\"search-to\" name=\"to\" type=\"date\">\n          </label>\n          <div class=\"search-actions\">\n            <button class=\"button primary\" type=\"submit\">Rechercher</button>\n            <button id=\"reset-search\" class=\"button secondary\" type=\"button\">Effacer</button>\n          </div>\n        </form>\n\n        <div id=\"records-loading\" class=\"state-panel\">Chargement du registre…</div>\n        <div id=\"records-empty\" class=\"state-panel hidden\">\n          <strong>Aucun arrêté trouvé</strong>\n          <span>Modifiez les critères ou enregistrez un nouvel arrêté.</span>\n        </div>\n        <div id=\"records-list\" class=\"records-list\" aria-live=\"polite\"></div>\n      </section>\n\n      <section id=\"view-create\" class=\"view\" aria-labelledby=\"create-title\">\n        <div class=\"section-heading\">\n          <div>\n            <p class=\"eyebrow\">NOUVEL ENREGISTREMENT</p>\n            <h2 id=\"create-title\">Enregistrer un arrêté</h2>\n          </div>\n        </div>\n\n        <form id=\"record-form\" class=\"record-form\" enctype=\"multipart/form-data\">\n          <div class=\"form-grid\">\n            <label class=\"field\">\n              <span>Numéro de l’arrêté *</span>\n              <input name=\"number\" required maxlength=\"80\" autocomplete=\"off\" placeholder=\"Ex. PM-2026-0145\">\n            </label>\n            <label class=\"field\">\n              <span>Date de l’arrêté *</span>\n              <input id=\"record-date\" name=\"date\" type=\"date\" required>\n            </label>\n            <label class=\"field field-full\">\n              <span>Nom de l’arrêté *</span>\n              <input name=\"name\" required maxlength=\"220\" autocomplete=\"off\" placeholder=\"Ex. Réglementation temporaire du stationnement\">\n            </label>\n            <div class=\"field field-full\">\n              <span>Rue(s), boulevard(s), place(s) ou impasse(s) *</span>\n              <div class=\"street-picker\">\n                <div id=\"selected-streets\" class=\"chips\" aria-live=\"polite\"></div>\n                <input id=\"street-input\" type=\"search\" autocomplete=\"off\" placeholder=\"Rechercher puis sélectionner une voie\" aria-controls=\"street-suggestions\" aria-expanded=\"false\">\n                <div id=\"street-suggestions\" class=\"suggestions hidden\" role=\"listbox\"></div>\n              </div>\n              <small>Vous pouvez sélectionner plusieurs voies.</small>\n            </div>\n            <label class=\"field field-full\">\n              <span>Précisions sur le lieu</span>\n              <textarea name=\"locationDetails\" maxlength=\"500\" rows=\"3\" placeholder=\"Numéros, carrefour, portion concernée, côté de circulation…\"></textarea>\n            </label>\n            <label class=\"field field-full file-field\">\n              <span>Pièce jointe PDF *</span>\n              <input name=\"attachment\" type=\"file\" accept=\"application/pdf,.pdf\" required>\n              <small>Un seul PDF, 15 Mo maximum.</small>\n            </label>\n          </div>\n\n          <div class=\"temporary-panel\">\n            <label class=\"switch-row\">\n              <input id=\"temporary\" name=\"temporary\" type=\"checkbox\">\n              <span>\n                <strong>Arrêté temporaire</strong>\n                <small>Le dossier sera supprimé automatiquement deux jours après la date de fin.</small>\n              </span>\n            </label>\n            <div id=\"temporary-dates\" class=\"temporary-dates hidden\">\n              <label class=\"field\">\n                <span>Date de début *</span>\n                <input id=\"start-date\" name=\"startDate\" type=\"date\">\n              </label>\n              <label class=\"field\">\n                <span>Date de fin *</span>\n                <input id=\"end-date\" name=\"endDate\" type=\"date\">\n              </label>\n            </div>\n          </div>\n\n          <div id=\"form-message\" class=\"message hidden\" role=\"status\"></div>\n          <div class=\"form-actions\">\n            <button class=\"button primary\" type=\"submit\">Enregistrer l’arrêté</button>\n            <button class=\"button secondary\" type=\"reset\">Réinitialiser</button>\n          </div>\n        </form>\n      </section>\n\n      <section id=\"view-streets\" class=\"view\" aria-labelledby=\"streets-title\">\n        <div class=\"section-heading\">\n          <div>\n            <p class=\"eyebrow\">ADMINISTRATION</p>\n            <h2 id=\"streets-title\">Référentiel des voies</h2>\n          </div>\n        </div>\n        <div class=\"admin-panel\">\n          <p id=\"streets-metadata\">Le référentiel est chargé automatiquement depuis la Base Adresse Nationale.</p>\n          <div class=\"admin-actions\">\n            <button id=\"refresh-streets\" class=\"button primary\" type=\"button\">Actualiser depuis la BAN</button>\n          </div>\n          <form id=\"add-street-form\" class=\"inline-form\">\n            <label class=\"field\">\n              <span>Ajouter une voie manuellement</span>\n              <input name=\"name\" required maxlength=\"160\" placeholder=\"Nom complet de la voie\">\n            </label>\n            <button class=\"button secondary\" type=\"submit\">Ajouter</button>\n          </form>\n          <div id=\"street-admin-message\" class=\"message hidden\" role=\"status\"></div>\n        </div>\n      </section>\n    </main>\n\n    <template id=\"record-template\">\n      <article class=\"record-card\">\n        <div class=\"record-stripe\"></div>\n        <div class=\"record-main\">\n          <div class=\"record-topline\">\n            <span class=\"record-number\"></span>\n            <span class=\"record-type\"></span>\n          </div>\n          <h3 class=\"record-name\"></h3>\n          <div class=\"record-meta\"></div>\n          <div class=\"record-streets\"></div>\n          <p class=\"record-location\"></p>\n          <p class=\"record-expiry\"></p>\n          <p class=\"record-storage\"></p>\n        </div>\n        <div class=\"record-actions\">\n          <a class=\"button primary record-pdf\" target=\"_blank\" rel=\"noopener\">Ouvrir le PDF</a>\n          <button class=\"button danger record-delete admin-only hidden\" type=\"button\">Supprimer</button>\n        </div>\n      </article>\n    </template>\n  </body>\n</html>\n","appJs":"const state = {\n  csrfToken: '',\n  user: null,\n  streets: [],\n  streetsMetadata: null,\n  selectedStreets: [],\n};\n\nconst BASE_PATH = '/arretes';\n\nconst elements = {\n  tabs: [...document.querySelectorAll('.tab')],\n  views: [...document.querySelectorAll('.view')],\n  userName: document.querySelector('#user-name'),\n  userRole: document.querySelector('#user-role'),\n  searchForm: document.querySelector('#search-form'),\n  resetSearch: document.querySelector('#reset-search'),\n  recordsLoading: document.querySelector('#records-loading'),\n  recordsEmpty: document.querySelector('#records-empty'),\n  recordsList: document.querySelector('#records-list'),\n  recordCount: document.querySelector('#record-count'),\n  recordTemplate: document.querySelector('#record-template'),\n  recordForm: document.querySelector('#record-form'),\n  recordDate: document.querySelector('#record-date'),\n  temporary: document.querySelector('#temporary'),\n  temporaryDates: document.querySelector('#temporary-dates'),\n  startDate: document.querySelector('#start-date'),\n  endDate: document.querySelector('#end-date'),\n  formMessage: document.querySelector('#form-message'),\n  streetInput: document.querySelector('#street-input'),\n  selectedStreets: document.querySelector('#selected-streets'),\n  streetSuggestions: document.querySelector('#street-suggestions'),\n  searchStreet: document.querySelector('#search-street'),\n  refreshStreets: document.querySelector('#refresh-streets'),\n  addStreetForm: document.querySelector('#add-street-form'),\n  streetAdminMessage: document.querySelector('#street-admin-message'),\n  streetsMetadata: document.querySelector('#streets-metadata'),\n};\n\ndocument.addEventListener('DOMContentLoaded', initialize);\n\nasync function initialize() {\n  bindEvents();\n  elements.recordDate.value = localIsoDate();\n  try {\n    const me = await api('/api/me');\n    state.user = me.user;\n    state.csrfToken = me.csrfToken;\n    elements.userName.textContent = me.user.name;\n    elements.userRole.textContent = me.user.role;\n    if (me.user.admin) document.querySelectorAll('.admin-only').forEach((item) => item.classList.remove('hidden'));\n    await loadStreets();\n    await loadRecords();\n  } catch (error) {\n    showMessage(elements.formMessage, error.message, 'error');\n    elements.recordsLoading.textContent = error.message;\n  }\n}\n\nfunction bindEvents() {\n  elements.tabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));\n  elements.searchForm.addEventListener('submit', (event) => {\n    event.preventDefault();\n    loadRecords();\n  });\n  elements.resetSearch.addEventListener('click', () => {\n    elements.searchForm.reset();\n    loadRecords();\n  });\n  elements.temporary.addEventListener('change', updateTemporaryFields);\n  elements.recordForm.addEventListener('submit', submitRecord);\n  elements.recordForm.addEventListener('reset', () => {\n    setTimeout(() => {\n      state.selectedStreets = [];\n      renderSelectedStreets();\n      elements.recordDate.value = localIsoDate();\n      updateTemporaryFields();\n      hideMessage(elements.formMessage);\n    });\n  });\n  elements.streetInput.addEventListener('input', renderStreetSuggestions);\n  elements.streetInput.addEventListener('focus', renderStreetSuggestions);\n  elements.streetInput.addEventListener('keydown', (event) => {\n    if (event.key === 'Escape') closeSuggestions();\n  });\n  document.addEventListener('click', (event) => {\n    if (!event.target.closest('.street-picker')) closeSuggestions();\n  });\n  elements.refreshStreets.addEventListener('click', refreshStreets);\n  elements.addStreetForm.addEventListener('submit', addStreet);\n}\n\nfunction switchView(name) {\n  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));\n  elements.views.forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));\n  window.scrollTo({ top: 0, behavior: 'smooth' });\n}\n\nasync function api(url, options = {}) {\n  const headers = new Headers(options.headers || {});\n  if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase()) && state.csrfToken) {\n    headers.set('x-csrf-token', state.csrfToken);\n  }\n  if (options.body && !(options.body instanceof FormData)) headers.set('content-type', 'application/json');\n  const response = await fetch(`${BASE_PATH}${url}`, { ...options, headers, credentials: 'same-origin' });\n  if (response.status === 401) {\n    window.location.reload();\n    throw new Error('Session ARGOS expirée');\n  }\n  if (response.status === 204) return null;\n  const payload = await response.json().catch(() => ({}));\n  if (!response.ok) throw new Error(payload.error || 'Une erreur est survenue');\n  return payload;\n}\n\nasync function loadStreets() {\n  const payload = await api('/api/streets');\n  state.streets = payload.streets;\n  state.streetsMetadata = payload.metadata;\n  fillStreetSelect();\n  updateStreetMetadata();\n}\n\nfunction fillStreetSelect() {\n  const selected = elements.searchStreet.value;\n  elements.searchStreet.replaceChildren(new Option('Toutes les voies', ''));\n  state.streets.forEach((street) => elements.searchStreet.add(new Option(displayStreet(street), street)));\n  elements.searchStreet.value = selected;\n}\n\nfunction updateStreetMetadata() {\n  if (!state.streetsMetadata?.updatedAt) {\n    elements.streetsMetadata.textContent = `${state.streets.length} voies disponibles. La synchronisation BAN sera lancée automatiquement.`;\n    return;\n  }\n  elements.streetsMetadata.textContent = `${state.streets.length} voies · source ${state.streetsMetadata.source} · mise à jour le ${formatDateTime(state.streetsMetadata.updatedAt)}.`;\n}\n\nasync function loadRecords() {\n  elements.recordsLoading.classList.remove('hidden');\n  elements.recordsEmpty.classList.add('hidden');\n  elements.recordsList.replaceChildren();\n  const parameters = new URLSearchParams(new FormData(elements.searchForm));\n  [...parameters.entries()].forEach(([key, value]) => !value && parameters.delete(key));\n  try {\n    const payload = await api(`/api/arretes?${parameters}`);\n    renderRecords(payload.records);\n  } catch (error) {\n    elements.recordsLoading.textContent = error.message;\n  }\n}\n\nfunction renderRecords(records) {\n  elements.recordsLoading.classList.add('hidden');\n  elements.recordCount.textContent = `${records.length} résultat${records.length > 1 ? 's' : ''}`;\n  if (!records.length) {\n    elements.recordsEmpty.classList.remove('hidden');\n    return;\n  }\n\n  records.forEach((record) => {\n    const card = elements.recordTemplate.content.firstElementChild.cloneNode(true);\n    card.classList.toggle('temporary', record.temporary);\n    card.querySelector('.record-number').textContent = `N° ${record.number}`;\n    card.querySelector('.record-type').textContent = record.temporary ? 'Temporaire' : 'Permanent';\n    card.querySelector('.record-name').textContent = record.name;\n    card.querySelector('.record-meta').textContent = `Arrêté du ${formatDate(record.date)} · enregistré par ${record.createdBy?.name || 'ARGOS'} le ${formatDateTime(record.createdAt)}`;\n    const streetsContainer = card.querySelector('.record-streets');\n    record.streets.forEach((street) => {\n      const item = document.createElement('span');\n      item.textContent = displayStreet(street);\n      streetsContainer.append(item);\n    });\n    const location = card.querySelector('.record-location');\n    if (record.locationDetails) location.textContent = record.locationDetails;\n    else location.remove();\n    const expiry = card.querySelector('.record-expiry');\n    if (record.temporary) {\n      expiry.textContent = `Valable du ${formatDate(record.startDate)} au ${formatDate(record.endDate)} · suppression automatique le ${formatDateTime(record.deleteAt)}.`;\n    } else {\n      expiry.remove();\n    }\n    const storage = card.querySelector('.record-storage');\n    const originalSize = Number(record.attachment?.originalSize || record.attachment?.size || 0);\n    const storedSize = Number(record.attachment?.size || 0);\n    const saved = Math.max(0, originalSize - storedSize);\n    if (originalSize && saved) {\n      const percent = Math.round((saved / originalSize) * 100);\n      storage.textContent = `PDF optimisé : ${formatBytes(storedSize)} sur le disque · gain ${percent} %.`;\n    } else if (storedSize) {\n      storage.textContent = `PDF déjà optimisé : ${formatBytes(storedSize)} sur le disque.`;\n    } else {\n      storage.remove();\n    }\n    const pdf = card.querySelector('.record-pdf');\n    pdf.href = `${BASE_PATH}/api/arretes/${encodeURIComponent(record.id)}/piece-jointe`;\n    const deleteButton = card.querySelector('.record-delete');\n    if (state.user.admin) {\n      deleteButton.classList.remove('hidden');\n      deleteButton.addEventListener('click', () => deleteRecord(record));\n    }\n    elements.recordsList.append(card);\n  });\n}\n\nasync function submitRecord(event) {\n  event.preventDefault();\n  if (!state.selectedStreets.length) {\n    showMessage(elements.formMessage, 'Sélectionnez au moins une voie.', 'error');\n    elements.streetInput.focus();\n    return;\n  }\n  const submitButton = elements.recordForm.querySelector('[type=\"submit\"]');\n  submitButton.disabled = true;\n  hideMessage(elements.formMessage);\n  const body = new FormData(elements.recordForm);\n  body.set('temporary', elements.temporary.checked ? 'true' : 'false');\n  body.set('streets', JSON.stringify(state.selectedStreets));\n  try {\n    await api('/api/arretes', { method: 'POST', body });\n    elements.recordForm.reset();\n    state.selectedStreets = [];\n    renderSelectedStreets();\n    elements.recordDate.value = localIsoDate();\n    showMessage(elements.formMessage, 'L’arrêté et sa pièce jointe ont été enregistrés.', 'success');\n    await loadRecords();\n    switchView('records');\n  } catch (error) {\n    showMessage(elements.formMessage, error.message, 'error');\n  } finally {\n    submitButton.disabled = false;\n  }\n}\n\nfunction updateTemporaryFields() {\n  const enabled = elements.temporary.checked;\n  elements.temporaryDates.classList.toggle('hidden', !enabled);\n  elements.startDate.required = enabled;\n  elements.endDate.required = enabled;\n  if (!enabled) {\n    elements.startDate.value = '';\n    elements.endDate.value = '';\n  }\n}\n\nfunction renderStreetSuggestions() {\n  const query = normalize(elements.streetInput.value);\n  if (!query) return closeSuggestions();\n  const matches = state.streets\n    .filter((street) => normalize(street).includes(query) && !state.selectedStreets.includes(street))\n    .slice(0, 18);\n  elements.streetSuggestions.replaceChildren();\n  if (!matches.length) return closeSuggestions();\n  matches.forEach((street) => {\n    const button = document.createElement('button');\n    button.type = 'button';\n    button.className = 'suggestion';\n    button.role = 'option';\n    button.textContent = displayStreet(street);\n    button.addEventListener('click', () => selectStreet(street));\n    elements.streetSuggestions.append(button);\n  });\n  elements.streetSuggestions.classList.remove('hidden');\n  elements.streetInput.setAttribute('aria-expanded', 'true');\n}\n\nfunction selectStreet(street) {\n  if (!state.selectedStreets.includes(street)) state.selectedStreets.push(street);\n  elements.streetInput.value = '';\n  renderSelectedStreets();\n  closeSuggestions();\n  elements.streetInput.focus();\n}\n\nfunction renderSelectedStreets() {\n  elements.selectedStreets.replaceChildren();\n  state.selectedStreets.forEach((street) => {\n    const chip = document.createElement('span');\n    chip.className = 'chip';\n    chip.append(document.createTextNode(displayStreet(street)));\n    const remove = document.createElement('button');\n    remove.type = 'button';\n    remove.setAttribute('aria-label', `Retirer ${displayStreet(street)}`);\n    remove.textContent = '×';\n    remove.addEventListener('click', () => {\n      state.selectedStreets = state.selectedStreets.filter((item) => item !== street);\n      renderSelectedStreets();\n    });\n    chip.append(remove);\n    elements.selectedStreets.append(chip);\n  });\n}\n\nfunction closeSuggestions() {\n  elements.streetSuggestions.classList.add('hidden');\n  elements.streetInput.setAttribute('aria-expanded', 'false');\n}\n\nasync function refreshStreets() {\n  elements.refreshStreets.disabled = true;\n  showMessage(elements.streetAdminMessage, 'Actualisation en cours…');\n  try {\n    const result = await api('/api/admin/streets/refresh', { method: 'POST', body: JSON.stringify({}) });\n    await loadStreets();\n    showMessage(elements.streetAdminMessage, `${result.count} voies de Chalon-sur-Saône ont été chargées.`, 'success');\n  } catch (error) {\n    showMessage(elements.streetAdminMessage, error.message, 'error');\n  } finally {\n    elements.refreshStreets.disabled = false;\n  }\n}\n\nasync function addStreet(event) {\n  event.preventDefault();\n  const form = new FormData(elements.addStreetForm);\n  try {\n    const result = await api('/api/admin/streets', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) });\n    elements.addStreetForm.reset();\n    await loadStreets();\n    showMessage(elements.streetAdminMessage, `${displayStreet(result.street)} a été ajoutée.`, 'success');\n  } catch (error) {\n    showMessage(elements.streetAdminMessage, error.message, 'error');\n  }\n}\n\nasync function deleteRecord(record) {\n  if (!window.confirm(`Supprimer définitivement l’arrêté n° ${record.number} et son PDF ?`)) return;\n  try {\n    await api(`/api/arretes/${encodeURIComponent(record.id)}`, { method: 'DELETE', body: JSON.stringify({}) });\n    await loadRecords();\n  } catch (error) {\n    window.alert(error.message);\n  }\n}\n\nfunction showMessage(element, message, type = '') {\n  element.textContent = message;\n  element.className = `message${type ? ` ${type}` : ''}`;\n}\n\nfunction hideMessage(element) {\n  element.textContent = '';\n  element.className = 'message hidden';\n}\n\nfunction normalize(value = '') {\n  return String(value).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('fr').trim();\n}\n\nfunction displayStreet(value = '') {\n  const string = String(value);\n  return string ? string[0].toLocaleUpperCase('fr') + string.slice(1) : '';\n}\n\nfunction formatDate(value) {\n  if (!value) return '—';\n  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`));\n}\n\nfunction formatDateTime(value) {\n  if (!value) return '—';\n  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value));\n}\n\nfunction formatBytes(value) {\n  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;\n  return `${(value / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;\n}\n\nfunction localIsoDate() {\n  const parts = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());\n  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));\n  return `${values.year}-${values.month}-${values.day}`;\n}\n","stylesCss":":root {\n  --navy: #123f73;\n  --navy-deep: #0b2d52;\n  --blue: #076bc1;\n  --blue-light: #e9f3fb;\n  --red: #e3062c;\n  --text: #24384c;\n  --muted: #657585;\n  --border: #ccd8e4;\n  --surface: #ffffff;\n  --page: #f7f9fc;\n  --success: #19743a;\n  --danger-bg: #fff0f2;\n  font-family: Arial, Helvetica, sans-serif;\n  color: var(--text);\n  background: var(--page);\n  font-synthesis: none;\n}\n\n* { box-sizing: border-box; }\n\nbody { margin: 0; min-width: 320px; background: var(--page); }\n\nbutton, input, select, textarea { font: inherit; }\nbutton, a { -webkit-tap-highlight-color: transparent; }\n\n.site-header {\n  min-height: 112px;\n  display: grid;\n  grid-template-columns: auto 1fr auto;\n  align-items: center;\n  gap: 20px;\n  padding: 20px clamp(20px, 5vw, 72px);\n  color: var(--navy-deep);\n  background: white;\n  border-top: 5px solid var(--blue);\n  border-bottom: 4px solid var(--red);\n  box-shadow: 0 2px 10px rgba(25, 58, 89, .08);\n}\n\n.brand-mark {\n  width: 68px;\n  height: 68px;\n  display: grid;\n  place-items: center;\n  border: 2px solid #a9c8e4;\n  color: var(--blue);\n  background: #eef6fc;\n  font-size: 25px;\n  font-weight: 800;\n  letter-spacing: -.04em;\n}\n\n.brand-copy h1 { margin: 2px 0 5px; font-size: clamp(25px, 4vw, 36px); line-height: 1.05; }\n.brand-copy p { margin: 0; color: var(--muted); }\n.eyebrow { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; color: var(--blue); }\n.site-header .eyebrow { color: var(--blue); }\n\n.account { display: grid; justify-items: end; gap: 3px; text-align: right; }\n.account span { font-weight: 700; }\n.account small { color: var(--muted); text-transform: capitalize; }\n.account a { margin-top: 5px; color: var(--blue); font-size: 14px; font-weight: 700; }\n\n.tabs {\n  display: flex;\n  gap: 0;\n  padding: 0 clamp(20px, 5vw, 72px);\n  background: #f4f8fc;\n  border-bottom: 1px solid var(--border);\n  overflow-x: auto;\n}\n\n.tab {\n  appearance: none;\n  border: 0;\n  border-bottom: 4px solid transparent;\n  padding: 17px 22px 13px;\n  color: var(--muted);\n  background: transparent;\n  font-weight: 700;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.tab:hover { color: var(--navy); background: white; }\n.tab.active { color: var(--navy); border-bottom-color: var(--blue); background: white; }\n\nmain { width: min(1180px, calc(100% - 40px)); margin: 34px auto 70px; }\n.view { display: none; }\n.view.active { display: block; }\n\n.section-heading { display: flex; justify-content: space-between; gap: 20px; align-items: end; margin-bottom: 18px; }\n.section-heading h2 { margin: 4px 0 0; color: var(--navy-deep); font-size: clamp(23px, 3vw, 30px); }\n.count { color: var(--muted); font-size: 14px; }\n\n.search-panel, .record-form, .admin-panel {\n  background: white;\n  border: 1px solid var(--border);\n  border-top: 5px solid var(--blue);\n  padding: 24px;\n}\n\n.search-panel {\n  display: grid;\n  grid-template-columns: minmax(220px, 1.6fr) repeat(4, minmax(130px, 1fr));\n  gap: 16px;\n  align-items: end;\n  margin-bottom: 24px;\n}\n\n.field { display: grid; gap: 7px; min-width: 0; }\n.field > span { color: var(--navy-deep); font-size: 14px; font-weight: 700; }\n.field small, .switch-row small { color: var(--muted); line-height: 1.4; }\n.field-full { grid-column: 1 / -1; }\n\ninput, select, textarea {\n  width: 100%;\n  min-height: 44px;\n  border: 1px solid #aebdcb;\n  border-radius: 2px;\n  padding: 10px 12px;\n  color: var(--text);\n  background: white;\n}\n\ntextarea { resize: vertical; line-height: 1.5; }\ninput:focus, select:focus, textarea:focus, button:focus-visible, a:focus-visible {\n  outline: 3px solid rgba(7, 107, 193, .22);\n  outline-offset: 2px;\n  border-color: var(--blue);\n}\n\n.search-actions, .form-actions, .admin-actions { display: flex; gap: 10px; align-items: center; }\n.search-actions { grid-column: 1 / -1; justify-content: flex-end; }\n\n.button {\n  display: inline-flex;\n  min-height: 42px;\n  align-items: center;\n  justify-content: center;\n  border: 1px solid transparent;\n  border-radius: 2px;\n  padding: 9px 16px;\n  font-weight: 700;\n  text-decoration: none;\n  cursor: pointer;\n}\n.button:disabled { opacity: .55; cursor: wait; }\n.button.primary { color: white; background: var(--blue); }\n.button.primary:hover { background: #055ba5; }\n.button.secondary { color: var(--navy); border-color: #9fb1c2; background: white; }\n.button.secondary:hover { background: #edf3f8; }\n.button.danger { color: #a10d27; border-color: #e4a7b2; background: var(--danger-bg); }\n\n.state-panel {\n  display: grid;\n  justify-items: center;\n  gap: 6px;\n  padding: 50px 20px;\n  color: var(--muted);\n  text-align: center;\n  background: white;\n  border: 1px solid var(--border);\n}\n\n.records-list { display: grid; gap: 12px; }\n.record-card {\n  display: grid;\n  grid-template-columns: 6px 1fr auto;\n  background: white;\n  border: 1px solid var(--border);\n  min-width: 0;\n}\n.record-stripe { background: var(--blue); }\n.record-card.temporary .record-stripe { background: var(--red); }\n.record-main { min-width: 0; padding: 20px 22px; }\n.record-topline { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 7px; }\n.record-number { color: var(--blue); font-weight: 800; letter-spacing: .02em; }\n.record-type { padding: 4px 8px; background: var(--blue-light); color: var(--navy); font-size: 12px; font-weight: 700; text-transform: uppercase; }\n.temporary .record-type { color: #9d1430; background: #ffe8ed; }\n.record-name { margin: 0 0 10px; color: var(--navy-deep); font-size: 19px; }\n.record-meta { color: var(--muted); font-size: 13px; }\n.record-streets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 13px; }\n.record-streets span, .chip { padding: 5px 9px; color: var(--navy); background: #eaf2f9; border: 1px solid #cfdeeb; font-size: 13px; }\n.record-location, .record-expiry, .record-storage { margin: 11px 0 0; color: var(--muted); font-size: 14px; line-height: 1.45; }\n.record-expiry { color: #a10d27; font-weight: 700; }\n.record-storage { color: #43637f; }\n.record-actions { display: flex; flex-direction: column; justify-content: center; gap: 9px; width: 158px; padding: 18px; border-left: 1px solid var(--border); }\n\n.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }\n.record-form { display: grid; gap: 24px; }\n.file-field { padding: 16px; background: #f6f9fc; border: 1px dashed #9eb4c8; }\n.file-field input { padding: 7px; background: white; }\n\n.street-picker { position: relative; border: 1px solid #aebdcb; background: white; padding: 7px; }\n.street-picker:focus-within { outline: 3px solid rgba(7, 107, 193, .22); border-color: var(--blue); }\n.street-picker input { border: 0; outline: 0; padding: 8px 5px; min-height: 38px; }\n.chips { display: flex; flex-wrap: wrap; gap: 6px; }\n.chip { display: inline-flex; align-items: center; gap: 7px; }\n.chip button { border: 0; padding: 0; color: #7e1730; background: transparent; font-weight: 800; cursor: pointer; }\n.suggestions {\n  position: absolute;\n  z-index: 20;\n  top: calc(100% + 3px);\n  left: -1px;\n  right: -1px;\n  max-height: 260px;\n  overflow-y: auto;\n  background: white;\n  border: 1px solid #91a8bd;\n  box-shadow: 0 10px 24px rgba(20, 49, 75, .16);\n}\n.suggestion { width: 100%; border: 0; padding: 11px 13px; text-align: left; color: var(--text); background: white; cursor: pointer; }\n.suggestion:hover, .suggestion:focus { color: var(--navy); background: var(--blue-light); }\n\n.temporary-panel { padding: 18px; background: #f6f9fc; border-left: 5px solid var(--navy); }\n.switch-row { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }\n.switch-row input { width: 20px; min-height: 20px; margin-top: 2px; accent-color: var(--blue); }\n.switch-row span { display: grid; gap: 4px; }\n.temporary-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }\n.form-actions { justify-content: flex-end; padding-top: 2px; }\n\n.message { padding: 12px 14px; border-left: 4px solid var(--blue); color: var(--navy-deep); background: var(--blue-light); }\n.message.error { color: #8c1028; background: #fff0f2; border-left-color: var(--red); }\n.message.success { color: #125e30; background: #edf8f0; border-left-color: var(--success); }\n.admin-panel { display: grid; gap: 24px; }\n.admin-panel p { margin: 0; color: var(--muted); line-height: 1.5; }\n.inline-form { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; padding-top: 20px; border-top: 1px solid var(--border); }\n\n.hidden { display: none !important; }\n\n@media (max-width: 980px) {\n  .search-panel { grid-template-columns: 1fr 1fr; }\n  .field-wide { grid-column: 1 / -1; }\n}\n\n@media (max-width: 680px) {\n  .site-header { grid-template-columns: auto 1fr; padding: 18px 20px; }\n  .brand-mark { width: 55px; height: 55px; }\n  .account { grid-column: 1 / -1; justify-items: start; text-align: left; padding-top: 12px; border-top: 1px solid var(--border); }\n  .tabs { padding: 0; }\n  main { width: min(100% - 24px, 1180px); margin-top: 24px; }\n  .search-panel, .record-form, .admin-panel { padding: 18px; }\n  .search-panel, .form-grid, .temporary-dates, .inline-form { grid-template-columns: 1fr; }\n  .field-full, .field-wide { grid-column: auto; }\n  .record-card { grid-template-columns: 5px 1fr; }\n  .record-actions { grid-column: 2; width: auto; flex-direction: row; justify-content: flex-start; border-left: 0; border-top: 1px solid var(--border); }\n  .record-actions .button { flex: 1; }\n  .section-heading { align-items: start; flex-direction: column; gap: 8px; }\n}\n","accessDeniedHtml":"<!doctype html>\n<html lang=\"fr\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <title>Accès réservé — ARGOS</title>\n    <style>\n      :root { font-family: Arial, sans-serif; color: #17375e; background: #f3f6f9; }\n      body { min-height: 100vh; display: grid; place-items: center; margin: 0; }\n      main { width: min(440px, calc(100% - 40px)); background: white; border: 1px solid #c9d5e2; border-top: 6px solid #0b65c2; padding: 32px; box-sizing: border-box; }\n      h1 { margin: 0 0 12px; font-size: 24px; }\n      p { color: #5d6b79; line-height: 1.55; margin: 0; }\n      a { display: inline-block; margin-top: 20px; padding: 10px 15px; color: white; background: #076bc1; text-decoration: none; font-weight: 700; }\n    </style>\n  </head>\n  <body>\n    <main>\n      <h1>Accès réservé</h1>\n      <p>Cette application est accessible uniquement depuis le portail ARGOS. Ouvrez la tuile « Arrêtés municipaux » dans ARGOS.</p>\n      <a href=\"/portail/\">Retour à ARGOS</a>\n    </main>\n  </body>\n</html>\n","streetsSeed":["Avenue de Paris","Avenue Jean Jaurès","Boulevard de la République","Boulevard Saint-Martin","Place de l'Hôtel de Ville","Place Saint-Vincent","Quai de la Monnaie","Quai des Messageries","Rue de Belfort","Rue de Strasbourg","Rue du Pont","Rue Général Leclerc","Rue Saint-Vincent"]};
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

    return records
      .filter((record) => {
        if (status === 'temporary' && !record.temporary) return false;
        if (status === 'permanent' && record.temporary) return false;
        if (street && !record.streets.some((name) => normalize(name) === street)) return false;
        const date = DateTime.fromISO(record.date);
        if (from?.isValid && date < from.startOf('day')) return false;
        if (to?.isValid && date > to.endOf('day')) return false;
        if (!query) return true;
        const haystack = normalize([
          record.number,
          record.name,
          record.locationDetails,
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
    const unique = [...new Map(streets.filter(Boolean).map((street) => [normalize(street), String(street).trim()])).values()]
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

module.exports = { CHALON_INSEE_CODE, StreetsRepository, parseCsvLine };

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
  return { number, name, date, streets: selectedStreets, locationDetails, temporary, startDate, endDate, deleteAt };
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
