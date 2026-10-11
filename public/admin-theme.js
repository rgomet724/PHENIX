'use strict';

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
      body.lightMode aside{background:${primary}!important}
      .primary,.nav button.activeNav,body.lightMode .nav button.activeNav{border-color:${accent}!important}
      html,body{background-color:${background}}
      ${appearance.backgroundData ? `.login::before{background-image:linear-gradient(rgba(5,15,28,.62),rgba(5,15,28,.72)),url(${JSON.stringify(appearance.backgroundData)})!important;background-position:center!important;background-size:cover!important}` : ''}
    `;
    document.head.appendChild(style);
  } catch (error) {
    console.warn('[PHENIX] Apparence centrale indisponible:', error.message);
  }
})();
