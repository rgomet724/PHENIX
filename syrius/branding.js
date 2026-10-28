'use strict';
(() => {
  let signature = '';
  const asset = (url, kind) => typeof url === 'string' && new RegExp(`^/syrius/branding/${kind}\\?v=[a-f0-9]{16}$`).test(url) ? url : '';
  window.applySyriusAppearance = appearance => {
    if (!appearance) return;
    const current = JSON.stringify(appearance); if (signature === current) return; signature = current;
    const root = document.documentElement;
    for (const [key, property] of [['primaryColor', '--navy'], ['accentColor', '--blue'], ['backgroundColor', '--page-bg']]) {
      if (/^#[0-9a-f]{6}$/i.test(appearance[key] || '')) root.style.setProperty(property, appearance[key]);
    }
    root.style.setProperty('--rail', 'var(--navy)');
    const logo = asset(appearance.logoUrl, 'logo'), favicon = asset(appearance.faviconUrl, 'favicon'), background = asset(appearance.backgroundUrl, 'background');
    root.style.setProperty('--brand-background', background ? `url("${background}")` : 'none');
    document.querySelectorAll('[data-brand-logo]').forEach(node => {
      node.hidden = !logo; if (logo) node.setAttribute('src', logo); else node.removeAttribute('src');
    });
    document.querySelectorAll('[data-default-brand]').forEach(node => { node.hidden = Boolean(logo); });
    document.querySelectorAll('.wordmark').forEach(node => { node.textContent = appearance.title === 'SYRIUS' ? 'syrius' : appearance.title || 'syrius'; });
    document.querySelectorAll('[data-brand-subtitle]').forEach(node => { node.textContent = appearance.subtitle || 'Communications radio'; node.title = appearance.subtitle || ''; });
    const icon = document.getElementById('site-favicon');
    icon.setAttribute('href', favicon || '/syrius/favicon.svg'); icon.removeAttribute('type');
    document.querySelector('link[rel="apple-touch-icon"]').setAttribute('href', favicon || logo || '/syrius/icon-192.png');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', appearance.primaryColor || '#253d91');
    document.title = `${appearance.title || 'SYRIUS'} · Radio PHENIX`;
  };
})();
