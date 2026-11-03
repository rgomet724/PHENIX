'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browserSecurity, isSameOrigin, PORTAL_CSP, ADMIN_CSP } = require('../browser-security');

function response() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    set(name, value) { headers[name.toLowerCase()] = value; return this; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; }
  };
}

function request(pathname, method = 'GET', extra = {}) {
  const headers = extra.headers || {};
  return {
    path: pathname,
    method,
    protocol: extra.protocol || 'https',
    get(name) {
      return name === 'host' ? 'phenix.example.fr' : headers[name.toLowerCase()];
    }
  };
}

function run(req) {
  const res = response();
  let nextCalled = false;
  browserSecurity(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('Politique navigateur stricte pour les pages auditées', () => {
  assert.match(PORTAL_CSP, /script-src 'self'; script-src-attr 'none'/);
  assert.match(PORTAL_CSP, /frame-ancestors 'none'/);
  assert.doesNotMatch(PORTAL_CSP, /unsafe-inline|unsafe-eval/);
  for (const pathname of ['/', '/portail/', '/portail/index.html', '/dashboard/', '/dashboard/index.html']) {
    const { res, nextCalled } = run(request(pathname));
    assert.equal(nextCalled, true);
    assert.equal(res.headers['content-security-policy'], PORTAL_CSP);
  }
});

test('L administration conserve temporairement les styles intégrés, mais pas les scripts inline', () => {
  assert.match(ADMIN_CSP, /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(ADMIN_CSP, /script-src [^;]*unsafe-inline/);
  const { res } = run(request('/portail/administration/'));
  assert.equal(res.headers['content-security-policy'], ADMIN_CSP);
});

test('Ne pas appliquer la CSP stricte à une application héritée non vérifiée', () => {
  for (const pathname of ['/phenix/', '/portail/atlas/', '/syrius/']) {
    const { res } = run(request(pathname));
    assert.equal(res.headers['content-security-policy'], undefined);
  }
});

test('Les mutations cross-site sont refusées même sans Origin', () => {
  const req = request('/portail/api/admin/apps', 'POST', {
    headers: { 'sec-fetch-site': 'cross-site' }
  });
  const { res, nextCalled } = run(req);
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('Le schéma fait partie de la vérification d origine', () => {
  assert.equal(isSameOrigin(request('/'), 'https://phenix.example.fr'), true);
  assert.equal(isSameOrigin(request('/'), 'http://phenix.example.fr'), false);
  assert.equal(isSameOrigin(request('/'), 'https://evil.example.fr'), false);
  assert.equal(isSameOrigin(request('/'), 'null'), false);
});

test('Les mutations à origine externe sont refusées, l origine identique reste autorisée', () => {
  const denied = run(request('/dashboard/api/board', 'PUT', { headers: { origin: 'https://evil.example.fr' } }));
  assert.equal(denied.res.statusCode, 403);
  const allowed = run(request('/dashboard/api/board', 'PUT', { headers: { origin: 'https://phenix.example.fr', 'sec-fetch-site': 'same-origin' } }));
  assert.equal(allowed.nextCalled, true);
});
