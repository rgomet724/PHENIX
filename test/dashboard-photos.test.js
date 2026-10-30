'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparePhoto, uploadPhoto } = require('../dashboard/photo-upload');
const mediaUrl = '/dashboard/media/00000000-0000-4000-8000-000000000000.jpg';
const small = () => new Blob(['photo-test'], { type: 'image/jpeg' });
const large = type => new Blob([new Uint8Array(3 * 1024 * 1024)], { type: type || 'image/jpeg' });

function imageEnvironment(options = {}) {
  const calls = { urls: [], revoked: [], encoded: [], fills: 0, image: null };
  const environment = {
    URL: { createObjectURL: () => { calls.urls.push('blob:test'); return 'blob:test'; }, revokeObjectURL: url => calls.revoked.push(url) },
    Image: class {
      constructor() { this.naturalWidth = 4000; this.naturalHeight = 3000; calls.image = this; }
      set src(value) { this.value = value; if (value && options.load !== false) queueMicrotask(() => this.onload?.()); }
      get src() { return this.value; }
    },
    document: { createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: () => calls.fills++, drawImage: () => {} }),
        toBlob: (callback, type, quality) => {
          calls.encoded.push({ type, quality, width: canvas.width, height: canvas.height });
          if (options.encode !== false) queueMicrotask(() => callback(new Blob([new Uint8Array(options.oversizeFirst && calls.encoded.length === 1 ? 3 * 1024 * 1024 : 80000)], { type })));
        }
      };
      return canvas;
    } }
  };
  return { environment, calls };
}

function requestEnvironment(action) {
  const calls = { xhr: null, body: null };
  class Request {
    constructor() { calls.xhr = this; this.upload = {}; this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { calls.body = body; action?.(this); }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  return { environment: { XMLHttpRequest: Request }, calls };
}

test('Une petite photo est envoyée sans décodage ni compression', async () => {
  const photo = small();
  assert.equal(await preparePhoto(photo, { environment: { Image: class { constructor() { throw new Error('Décodage inutile'); } } } }), photo);
});

test('Une grande photo est réduite et encodée en JPEG plutôt qu’en WebP', async () => {
  const mock = imageEnvironment();
  const prepared = await preparePhoto(large(), mock);
  assert.equal(prepared.type, 'image/jpeg'); assert.ok(prepared.size < 2 * 1024 * 1024);
  assert.deepEqual(mock.calls.encoded, [{ type: 'image/jpeg', quality: .8, width: 1280, height: 960 }]);
  assert.deepEqual(mock.calls.revoked, ['blob:test']);
  assert.equal(mock.calls.image.onload, null); assert.equal(mock.calls.image.src, '');
});

test('Les PNG et WebP conservent leur transparence et peuvent être réduits une seconde fois', async () => {
  for (const type of ['image/png', 'image/webp']) {
    const mock = imageEnvironment({ oversizeFirst: true });
    const prepared = await preparePhoto(large(type), mock);
    assert.equal(prepared.type, 'image/png'); assert.equal(mock.calls.fills, 0);
    assert.deepEqual(mock.calls.encoded.map(item => item.width), [960, 640]);
  }
});

test('Un décodage qui ne se termine jamais produit une erreur et libère la photo', async () => {
  const mock = imageEnvironment({ load: false });
  await assert.rejects(preparePhoto(large(), { ...mock, prepareTimeout: 12 }), error => error.name === 'TimeoutError');
  assert.deepEqual(mock.calls.revoked, ['blob:test']); assert.equal(mock.calls.image.onload, null);
});

test('Un encodage qui ne rappelle jamais son callback ne bloque pas indéfiniment', async () => {
  const mock = imageEnvironment({ encode: false });
  await assert.rejects(preparePhoto(large(), { ...mock, prepareTimeout: 12 }), error => error.name === 'TimeoutError');
  assert.deepEqual(mock.calls.revoked, ['blob:test']);
});

test('Une image déjà acceptée par le serveur reste utilisable si le navigateur ne sait pas la réencoder', async () => {
  const photo = new Blob([new Uint8Array(1500000)], { type: 'image/jpeg' });
  assert.equal(await preparePhoto(photo, { ...imageEnvironment({ load: false }), prepareTimeout: 12 }), photo);
});

test('La fermeture de la fenêtre annule une préparation en cours', async () => {
  const mock = imageEnvironment({ load: false }), controller = new AbortController();
  const pending = preparePhoto(large(), { ...mock, signal: controller.signal });
  queueMicrotask(() => controller.abort());
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.deepEqual(mock.calls.revoked, ['blob:test']);
});

test('L’envoi transmet les cookies et le jeton CSRF et expose la progression réelle', async () => {
  const stages = [], photo = small();
  const mock = requestEnvironment(xhr => queueMicrotask(() => {
    xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.status = 201; xhr.responseText = JSON.stringify({ url: mediaUrl }); xhr.onload();
  }));
  const result = await uploadPhoto(photo, { ...mock, csrf: 'test-csrf', onStatus: stage => stages.push(stage) });
  assert.equal(result.url, mediaUrl); assert.equal(mock.calls.body, photo);
  assert.equal(mock.calls.xhr.url, '/dashboard/api/media'); assert.equal(mock.calls.xhr.withCredentials, true);
  assert.equal(mock.calls.xhr.headers['X-CSRF-Token'], 'test-csrf');
  assert.equal(mock.calls.xhr.headers['Content-Type'], 'image/jpeg');
  assert.ok(stages.some(stage => stage.stage === 'upload' && stage.percent === 50));
  assert.ok(stages.some(stage => stage.stage === 'saving')); assert.equal(stages.at(-1).stage, 'done');
});

test('Un serveur qui ne répond pas est interrompu avec une erreur explicite', async () => {
  const mock = requestEnvironment();
  await assert.rejects(uploadPhoto(small(), { ...mock, requestTimeout: 12 }), error => error.name === 'TimeoutError');
  assert.equal(mock.calls.xhr.aborted, true); assert.equal(mock.calls.xhr.upload.onprogress, null);
});

test('Une coupure réseau est signalée sans laisser une attente active', async () => {
  const mock = requestEnvironment(xhr => queueMicrotask(() => xhr.onerror()));
  await assert.rejects(uploadPhoto(small(), mock), /Connexion interrompue/);
  assert.equal(mock.calls.xhr.onload, null);
});

test('La fermeture de la fenêtre interrompt aussi un envoi en cours', async () => {
  const controller = new AbortController();
  const mock = requestEnvironment(() => queueMicrotask(() => controller.abort()));
  await assert.rejects(uploadPhoto(small(), { ...mock, signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(mock.calls.xhr.aborted, true);
});

test('Les erreurs du serveur sont conservées et les réponses incomplètes sont refusées', async () => {
  for (const [status, body] of [[413, '{"error":"Photo trop volumineuse"}'], [200, '<html>Chargement</html>'], [200, 'null'], [200, '{"url":"https://example.org/photo.jpg"}']]) {
    const mock = requestEnvironment(xhr => queueMicrotask(() => { xhr.status = status; xhr.responseText = body; xhr.onload(); }));
    await assert.rejects(uploadPhoto(small(), mock), error => status === 413 ? error.status === 413 && error.message === 'Photo trop volumineuse' : /confirmé/.test(error.message));
  }
});

test('Les fichiers non pris en charge sont rejetés avant toute requête', async () => {
  const mock = requestEnvironment();
  await assert.rejects(uploadPhoto(new Blob(['svg'], { type: 'image/svg+xml' }), mock), /JPEG, PNG ou WebP/);
  assert.equal(mock.calls.xhr, null);
});
