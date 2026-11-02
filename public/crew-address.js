'use strict';

(function enhanceCrewInterventionAddress() {
  const preview = document.getElementById('indispoPreview');
  if (!preview) return;

  const field = document.createElement('div');
  field.className = 'field';
  field.innerHTML = '<label>Adresse de l’intervention</label><div class="addressAutocomplete"><input id="indispoAddress" type="search" autocomplete="off" maxlength="220" placeholder="Tapez le début de l’adresse…" aria-autocomplete="list" aria-controls="indispoAddressSuggestions" aria-expanded="false"><div id="indispoAddressSuggestions" class="addressSuggestions hidden" role="listbox"></div></div><small class="mut">Tapez au moins 2 lettres : la recherche interroge la Base Adresse Nationale. Une saisie manuelle reste possible.</small>';
  preview.replaceWith(field);
  const codeHelp = document.querySelector('#indispoCode + small');
  if (codeHelp) codeHelp.textContent = 'Saisissez le code puis choisissez le motif. Le code 00 supprime immédiatement l’équipage.';

  const addressInput = document.getElementById('indispoAddress');
  const suggestionBox = document.getElementById('indispoAddressSuggestions');
  let searchTimer = 0, searchController = null, suggestionIndex = -1;

  function hideSuggestions() {
    suggestionBox.classList.add('hidden');
    suggestionBox.replaceChildren();
    addressInput.setAttribute('aria-expanded', 'false');
    suggestionIndex = -1;
  }

  function chooseAddress(label) {
    addressInput.value = label;
    hideSuggestions();
  }

  function paintSuggestionFocus() {
    const rows = [...suggestionBox.querySelectorAll('.addressSuggestion')];
    rows.forEach((row, index) => row.classList.toggle('active', index === suggestionIndex));
    rows[suggestionIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function renderSuggestions(addresses, message = '') {
    suggestionBox.replaceChildren();
    suggestionIndex = -1;
    if (addresses.length) {
      for (const item of addresses) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'addressSuggestion'; button.role = 'option';
        button.dataset.address = item.label; button.textContent = item.label;
        suggestionBox.append(button);
      }
    } else {
      const state = document.createElement('div');
      state.className = 'addressSearchState';
      state.textContent = message || 'Aucune adresse trouvée. Vous pouvez poursuivre la saisie manuellement.';
      suggestionBox.append(state);
    }
    suggestionBox.classList.remove('hidden');
    addressInput.setAttribute('aria-expanded', 'true');
  }

  async function searchAddresses() {
    const query = addressInput.value.trim();
    if (query.length < 2) return hideSuggestions();
    searchController?.abort(); searchController = new AbortController();
    renderSuggestions([], 'Recherche dans la Base Adresse Nationale…');
    try {
      const response = await fetch('/api/addresses?q=' + encodeURIComponent(query), { credentials: 'same-origin', cache: 'no-store', signal: searchController.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Recherche indisponible');
      if (addressInput.value.trim() !== query) return;
      renderSuggestions(Array.isArray(data.addresses) ? data.addresses : []);
    } catch (error) {
      if (error.name !== 'AbortError') renderSuggestions([], error.message + ' Vous pouvez saisir l’adresse manuellement.');
    }
  }

  const originalRenderCrews = window.renderCrews;
  window.renderCrews = function renderCrewsWithAddresses() {
    originalRenderCrews();
    const rows = document.querySelectorAll('#crewRows tr');
    (S.crews || []).forEach((crew, index) => {
      if (!crew.interventionAddress || !rows[index]?.cells[3]) return;
      const address = document.createElement('div');
      address.className = 'crewInterventionAddress';
      address.textContent = crew.interventionAddress;
      rows[index].cells[3].append(address);
    });
  };

  window.updateIndispoPreview = function syncInterventionNature() {
    const code = String(document.getElementById('indispoCode')?.value || '').trim().toUpperCase();
    const option = [...document.getElementById('indispoSelect').options].find(item => item.dataset.code === code);
    if (option) document.getElementById('indispoSelect').value = option.value;
  };

  const originalOpenIndispo = window.openIndispo;
  window.openIndispo = function openIndispoWithAddress(id) {
    originalOpenIndispo(id);
    addressInput.value = '';
    hideSuggestions();
  };

  window.setIndispo = async function setIndispoWithAddress() {
    try {
      const id = document.getElementById('indispoId').value;
      const typed = String(document.getElementById('indispoCode').value || '').trim().toUpperCase();
      if (typed === '00') {
        await api('/api/crew/' + id, { method: 'DELETE' });
        closeModal('indispoModal'); await refresh(); return;
      }
      const found = findChoiceByCode(typed);
      const nature = parseInterventionLine(document.getElementById('indispoSelect').value || '');
      const payload = found
        ? { status: 'INDISPO', code: found.code, intervention: found.intervention, address: addressInput.value.trim(), source: 'nature', eventId: '' }
        : { status: 'INDISPO', code: typed || nature.code, intervention: nature.label || 'Intervention', address: addressInput.value.trim(), source: 'nature', eventId: '' };
      await api('/api/crew/' + id + '/status', { method: 'POST', body: JSON.stringify(payload) });
      closeModal('indispoModal'); await refresh();
    } catch (error) {
      alert('Impossible de modifier le statut : ' + error.message);
    }
  };

  document.addEventListener('keydown', event => {
    if (event.target?.id === 'indispoCode' && event.key === 'Enter') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (String(event.target.value || '').trim() === '00') window.setIndispo();
      else { window.updateIndispoPreview(); addressInput.focus(); }
      return;
    }
    if (event.target !== addressInput || !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
    const rows = [...suggestionBox.querySelectorAll('.addressSuggestion')];
    if (event.key === 'Escape') return hideSuggestions();
    if (!rows.length) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') suggestionIndex = (suggestionIndex + 1) % rows.length;
    if (event.key === 'ArrowUp') suggestionIndex = (suggestionIndex - 1 + rows.length) % rows.length;
    if (event.key === 'Enter') return chooseAddress(rows[Math.max(0, suggestionIndex)].dataset.address);
    paintSuggestionFocus();
  }, true);

  addressInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchAddresses, 280);
  });
  suggestionBox.addEventListener('click', event => {
    const suggestion = event.target.closest('.addressSuggestion');
    if (suggestion) chooseAddress(suggestion.dataset.address);
  });
  document.addEventListener('click', event => { if (!event.target.closest?.('.addressAutocomplete')) hideSuggestions(); });
})();
