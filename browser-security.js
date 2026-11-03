'use strict';

// Protection des interfaces déjà compatibles avec une CSP sans JavaScript inline.
// Les pages PHENIX historiques gardent leur stratégie existante jusqu'à la
// migration de leurs scripts et gestionnaires d'événements intégrés au HTML.
const PORTAL_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  'upgrade-insecure-requests'
].join('; ');

// L'administration comporte encore quelques attributs style= dans son HTML.
// Ils seront à remplacer par des classes avant de supprimer cette exception.
const ADMIN_CSP = PORTAL_CSP.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");

function isSameOrigin(req, origin) {
  try {
    const supplied = new URL(origin);
    const expected = new URL(`${req.protocol}://${req.get('host')}`);
    return (supplied.protocol === 'http:' || supplied.protocol === 'https:') &&
      supplied.origin === expected.origin;
  } catch {
    return false;
  }
}

function isPortalPage(pathname) {
  return pathname === '/' || /^\/(?:portail|dashboard)(?:\/|$)/.test(pathname);
}

function browserSecurity(req, res, next) {
  // Origin est vérifié avec son schéma, pas uniquement avec l'hôte.
  // Sec-Fetch-Site protège également les requêtes mutantes sans Origin.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.get('sec-fetch-site') === 'cross-site' ||
        (req.get('origin') && !isSameOrigin(req, req.get('origin')))) {
      return res.status(403).json({ error: 'Origine de la requête refusée.' });
    }
  }

  if (isPortalPage(req.path)) {
    res.set('Content-Security-Policy',
      req.path.startsWith('/portail/administration') ? ADMIN_CSP : PORTAL_CSP);
  }
  next();
}

module.exports = { browserSecurity, isSameOrigin, PORTAL_CSP, ADMIN_CSP };
