'use strict';
(() => {
  const searchable = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  const node = (tag, className, text) => {
    const value = document.createElement(tag); value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  };
  class SyriusMemberPicker {
    constructor({ list, search, summary, empty, clear }) {
      this.list = list; this.search = search; this.summary = summary; this.empty = empty;
      this.users = []; this.selected = new Set(); this.initial = new Set(); this.signature = '';
      search.addEventListener('input', () => this.render());
      search.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      clear.addEventListener('click', () => { this.selected.clear(); this.render(); });
    }
    open(users, memberIds) {
      this.selected = new Set(memberIds); this.initial = new Set(memberIds); this.search.value = '';
      this.users = users; this.signature = JSON.stringify(users); this.render();
    }
    refresh(users) {
      const signature = JSON.stringify(users); if (signature === this.signature) return;
      this.users = users; this.signature = signature; this.render();
    }
    get memberIds() { return [...this.selected]; }
    updateSummary() {
      const count = this.selected.size;
      this.summary.textContent = count ? `${count} agent${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}` : 'Aucun agent sélectionné : seuls les administrateurs auront accès.';
    }
    render() {
      const query = searchable(this.search.value.trim());
      const users = [...this.users];
      for (const id of this.initial) if (!users.some(user => user.id === id)) users.push({ id, name: 'Compte supprimé', login: '', enabled: false });
      users.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      const visible = users.filter(user => searchable(`${user.name} ${user.login || ''}`).includes(query));
      this.list.replaceChildren(...visible.map(user => {
        const label = node('label', 'member-choice'), input = node('input', '');
        input.type = 'checkbox'; input.value = user.id; input.checked = this.selected.has(user.id);
        input.disabled = user.enabled === false && !input.checked && !this.initial.has(user.id);
        const copy = node('span', 'member-choice-copy'); copy.append(node('strong', '', user.name));
        if (user.login) copy.append(node('small', '', user.login));
        const status = user.enabled === false ? 'Accès SYRIUS désactivé' : user.role === 'admin' ? 'Administrateur · accès automatique' : 'Agent';
        const detail = node('small', 'member-choice-status', status);
        label.classList.toggle('member-unavailable', user.enabled === false);
        label.append(input, copy, detail);
        input.addEventListener('change', () => {
          if (input.checked) this.selected.add(user.id); else this.selected.delete(user.id);
          this.updateSummary();
        });
        return label;
      }));
      this.empty.hidden = visible.length !== 0;
      this.empty.textContent = this.users.length ? 'Aucun agent ne correspond à cette recherche.' : 'Aucun compte disponible. Créez les agents dans l’administration centrale.';
      this.updateSummary();
    }
  }
  window.SyriusMemberPicker = SyriusMemberPicker;
})();
