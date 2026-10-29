'use strict';

// Ce script est chargé après le script intégré de PHENIX.
// La navigation reste disponible même si le chargement de l'apparence échoue.
window.openArgosPortal = function openArgosPortal() {
  window.open('/', '_blank', 'noopener,noreferrer');
};
window.openCentralAdmin = function openCentralAdmin() {
  window.open('/portail/administration/', '_blank', 'noopener,noreferrer');
};

(async function applyCentralPhenixTheme() {
  try {
    const response = await fetch('/portail/administration/api/public/appearance/phenix', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const appearance = data.appearance;
    if (!appearance) return;

    document.documentElement.style.setProperty('--b', appearance.primaryColor || '#0758b6');
    document.documentElement.style.setProperty('--g', appearance.accentColor || '#3b82f6');
    document.title = appearance.title || 'PHENIX';

    document.querySelectorAll('.brand h1,.phenixLoadingTitle').forEach(node => { node.textContent = appearance.title || 'PHENIX'; });
    document.querySelectorAll('.brand .tag').forEach(node => { node.textContent = appearance.subtitle || 'Plateforme Hiérarchisée des Engagements et des Interventions'; });
    if (appearance.logoData) document.querySelectorAll('img.logo,img.phenixLoadingLogo').forEach(image => { image.src = appearance.logoData; });

    if (appearance.faviconData) {
      let icon = document.querySelector('link[rel="icon"]');
      if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
      icon.href = appearance.faviconData;
    }

    const style = document.createElement('style');
    const primary = appearance.primaryColor || '#0758b6';
    const accent = appearance.accentColor || '#3b82f6';
    const background = appearance.backgroundColor || '#07111f';
    style.textContent = `
      .top,body.lightMode .top{background:${primary}!important}
      body.lightMode aside{background:#fff!important;border-right:1px solid #dbe2ec!important;box-shadow:2px 0 14px rgba(15,23,42,.06)!important}
      body.lightMode .nav button{background:#fff!important;color:#10243e!important;border:1px solid #d4dce7!important;box-shadow:0 4px 12px rgba(25,48,79,.08)!important}
      body.lightMode .nav button:hover{background:#f3f7fc!important;color:${primary}!important;border-color:#a9c7e8!important}
      body.lightMode .nav button.activeNav{background:${primary}!important;color:#fff!important;border-color:${primary}!important;box-shadow:0 5px 15px rgba(7,88,182,.22)!important}
      body.lightMode .nav button.activeNav .navIcon{background:rgba(255,255,255,.18)!important;color:#fff!important;border-color:rgba(255,255,255,.45)!important}
      body.lightMode .nav button.activeNav .navIcon svg,body.lightMode .nav button.activeNav .navIcon svg *{color:#fff!important;stroke:#fff!important}
      .primary{border-color:${accent}!important}
      html,body{background-color:${background}}
      ${appearance.backgroundData ? `.login::before{background-image:linear-gradient(rgba(5,15,28,.62),rgba(5,15,28,.72)),url(${JSON.stringify(appearance.backgroundData)})!important;background-position:center!important;background-size:cover!important}` : ''}
    `;
    document.head.appendChild(style);
  } catch (error) {
    console.warn('[PHENIX] Apparence centrale indisponible:', error.message);
  }
})();

