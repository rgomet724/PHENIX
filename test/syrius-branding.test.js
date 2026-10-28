'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('L’apparence centrale applique couleurs, logo, fond et icône puis restaure les éléments d’origine', () => {
  const makeNode = () => ({ attrs: {}, hidden: false, setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; } });
  const logo = makeNode(), star = makeNode(), word = makeNode(), subtitle = makeNode(), icon = makeNode(), apple = makeNode(), theme = makeNode();
  const properties = {};
  const document = {
    documentElement: { style: { setProperty: (key, value) => { properties[key] = value; } } },
    querySelectorAll: query => ({ '[data-brand-logo]': [logo], '[data-default-brand]': [star], '.wordmark': [word], '[data-brand-subtitle]': [subtitle] }[query] || []),
    getElementById: () => icon, querySelector: query => query.startsWith('link') ? apple : theme
  }, window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../syrius/branding.js'), 'utf8'), { window, document });
  const appearance = { title: 'Radio locale', subtitle: 'Équipe test', primaryColor: '#112233', accentColor: '#ad2765', backgroundColor: '#eeeeee',
    logoUrl: '/syrius/branding/logo?v=0123456789abcdef', faviconUrl: '/syrius/branding/favicon?v=0123456789abcdef', backgroundUrl: '/syrius/branding/background?v=0123456789abcdef' };
  window.applySyriusAppearance(appearance);
  assert.equal(properties['--blue'], '#ad2765'); assert.equal(properties['--navy'], '#112233'); assert.equal(properties['--page-bg'], '#eeeeee');
  assert.equal(logo.hidden, false); assert.equal(star.hidden, true); assert.equal(logo.attrs.src, appearance.logoUrl);
  assert.equal(icon.attrs.href, appearance.faviconUrl); assert.equal(word.textContent, 'Radio locale'); assert.equal(subtitle.textContent, 'Équipe test');
  assert.match(properties['--brand-background'], /\/branding\/background/);
  window.applySyriusAppearance({ ...appearance, logoUrl: '', faviconUrl: '', backgroundUrl: '' });
  assert.equal(logo.hidden, true); assert.equal(star.hidden, false); assert.equal(icon.attrs.href, '/syrius/favicon.svg'); assert.equal(properties['--brand-background'], 'none');
});
