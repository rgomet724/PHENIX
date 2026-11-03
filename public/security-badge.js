'use strict';

// Badge facultatif commun à PHENIX et aux applications ARGOS.
// La décision d'affichage provient du paramétrage central, sans données privées.
(() => {
  const BADGE_ID = 'phenix-anssi-badge';
  const STYLES_ID = 'phenix-anssi-badge-styles';
  const SETTINGS_URL = '/portail/administration/api/public/security-badge';
  let sequence = 0;

  async function refresh() {
    const requestNumber = ++sequence;
    let enabled = false;
    try {
      const response = await fetch(SETTINGS_URL, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (response.ok) {
        const settings = await response.json();
        enabled = settings.showAnssiBadge === true;
      }
    } catch {
      // En cas de panne ou de réponse non vérifiable, ne pas afficher le badge.
    }

    if (requestNumber !== sequence || !document.body) return;
    const previous = document.getElementById(BADGE_ID);
    if (!enabled) {
      if (previous) previous.remove();
      return;
    }
    if (previous) return;

    if (!document.getElementById(STYLES_ID)) {
      const styles = document.createElement('link');
      styles.id = STYLES_ID;
      styles.rel = 'stylesheet';
      styles.href = '/security-badge.css';
      document.head.appendChild(styles);
    }

    const badge = document.createElement('aside');
    badge.id = BADGE_ID;
    badge.className = 'phenix-anssi-badge';
    badge.setAttribute('role', 'note');
    badge.setAttribute('aria-label', 'Référence au guide de sécurité ANSSI-PA-009');
    badge.title = 'Référence au guide ANSSI-PA-009. Cette mention ne constitue pas une certification délivrée par l’ANSSI.';

    const image = document.createElement('img');
    image.src = '/security-badge.webp';
    image.width = 240;
    image.height = 135;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = 'Visuel ANSSI-PA-009 fourni pour PHENIX';

    const caption = document.createElement('span');
    caption.textContent = 'Référentiel ANSSI-PA-009';

    badge.append(image, caption);
    document.body.appendChild(badge);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh, { once: true });
  } else {
    refresh();
  }
  window.addEventListener('phenix:security-badge-updated', refresh);
})();
