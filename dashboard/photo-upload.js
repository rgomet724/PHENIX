'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DashboardPhotos = api;
})(globalThis, function createPhotoTools() {
  const MAX_BYTES = 2 * 1024 * 1024;
  const DIRECT_BYTES = 1024 * 1024;
  const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const abortError = () => Object.assign(new Error('Envoi de la photo annulé.'), { name: 'AbortError' });
  const timeoutError = message => Object.assign(new Error(message), { name: 'TimeoutError' });
  function environment(overrides = {}) {
    return { Image: globalThis.Image, URL: globalThis.URL, document: globalThis.document, XMLHttpRequest: globalThis.XMLHttpRequest, setTimeout, clearTimeout, ...overrides };
  }
  function bounded(work, options, env) {
    return new Promise((resolve, reject) => {
      let settled = false, timer;
      const finish = (error, result) => {
        if (settled) return;
        settled = true; env.clearTimeout(timer); options.signal?.removeEventListener('abort', cancel);
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => finish(abortError());
      if (options.signal?.aborted) return cancel();
      options.signal?.addEventListener('abort', cancel, { once: true });
      timer = env.setTimeout(() => finish(timeoutError('La préparation de cette photo prend trop de temps. Essayez une photo plus petite.')), options.prepareTimeout || 10000);
      Promise.resolve().then(work).then(value => finish(null, value), error => finish(error));
    });
  }
  async function preparePhoto(file, options = {}) {
    if (!file || !TYPES.has(file.type)) throw new Error('Choisissez une photo JPEG, PNG ou WebP.');
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('La photo d’origine doit faire moins de 20 Mo.');
    if (options.signal?.aborted) throw abortError();
    // Les petites images sont envoyées sans décodage ni réencodage sur le téléphone.
    if (file.size <= DIRECT_BYTES) return file;
    const env = environment(options.environment);
    let url, image, active = true;
    try {
      return await bounded(async () => {
        if (options.signal?.aborted) throw abortError();
        url = env.URL.createObjectURL(file); image = new env.Image(); image.decoding = 'async';
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('Cette photo ne peut pas être lue. Choisissez une autre image.'));
          image.src = url;
        });
        if (!active || options.signal?.aborted) throw abortError();
        const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
        if (!width || !height || width * height > 100000000) throw new Error('Les dimensions de cette photo ne sont pas prises en charge.');
        const canvas = env.document.createElement('canvas'), context = canvas.getContext('2d');
        if (!context) throw new Error('Votre navigateur ne peut pas préparer cette photo.');
        const encode = size => {
          const ratio = Math.min(1, size / Math.max(width, height));
          canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
          const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
          if (type === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          // JPEG évite le coût de l’encodage WebP ; PNG conserve la transparence des PNG/WebP.
          return new Promise(resolve => canvas.toBlob(resolve, type, .8));
        };
        let blob = await encode(file.type === 'image/jpeg' ? 1280 : 960);
        if (!active || options.signal?.aborted) throw abortError();
        if (blob?.size > MAX_BYTES) blob = await encode(640);
        if (!blob || !blob.size || blob.size > MAX_BYTES) throw new Error('Cette photo reste trop volumineuse. Choisissez une image plus petite.');
        return blob;
      }, options, env);
    } catch (error) {
      if (error.name !== 'AbortError' && file.size <= MAX_BYTES) return file;
      throw error;
    } finally {
      active = false;
      if (image) { image.onload = null; image.onerror = null; image.src = ''; }
      if (url) env.URL.revokeObjectURL(url);
    }
  }
  async function uploadPhoto(file, options = {}) {
    options.onStatus?.({ stage: file?.size <= DIRECT_BYTES ? 'upload' : 'prepare' });
    const blob = await preparePhoto(file, options);
    if (options.signal?.aborted) throw abortError();
    options.onStatus?.({ stage: 'upload', percent: 0 });
    const env = environment(options.environment);
    return new Promise((resolve, reject) => {
      const xhr = new env.XMLHttpRequest(), duration = options.requestTimeout || 30000;
      let done = false, watchdog;
      const finish = (error, result) => {
        if (done) return;
        done = true; env.clearTimeout(watchdog); options.signal?.removeEventListener('abort', cancel);
        xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
        if (xhr.upload) xhr.upload.onprogress = null;
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => { finish(abortError()); xhr.abort(); };
      const timedOut = () => { finish(timeoutError('Le serveur ne répond pas à l’envoi de la photo. Réessayez dans un instant.')); xhr.abort(); };
      if (options.signal?.aborted) return finish(abortError());
      options.signal?.addEventListener('abort', cancel, { once: true });
      try {
        xhr.open('POST', '/dashboard/api/media'); xhr.withCredentials = true; xhr.timeout = duration;
        xhr.setRequestHeader('Content-Type', blob.type); xhr.setRequestHeader('X-CSRF-Token', options.csrf || '');
        xhr.onload = () => {
          let result;
          try { const parsed = JSON.parse(xhr.responseText); result = parsed && typeof parsed === 'object' ? parsed : {}; } catch { result = {}; }
          if (xhr.status < 200 || xhr.status >= 300) return finish(Object.assign(new Error(result.error || result.message || 'La photo n’a pas pu être envoyée.'), { status: xhr.status, code: result.code }));
          if (!/^\/dashboard\/media\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(result.url || '')) return finish(new Error('Le serveur n’a pas confirmé l’envoi de la photo. Réessayez.'));
          options.onStatus?.({ stage: 'done', percent: 100 }); finish(null, result);
        };
        xhr.onerror = () => finish(new Error('Connexion interrompue pendant l’envoi. Vérifiez votre connexion puis réessayez.'));
        xhr.ontimeout = timedOut; xhr.onabort = () => finish(abortError());
        if (xhr.upload) xhr.upload.onprogress = event => {
          if (event.lengthComputable) options.onStatus?.({ stage: event.loaded >= event.total ? 'saving' : 'upload', percent: Math.min(100, Math.round(event.loaded / event.total * 100)) });
        };
        watchdog = env.setTimeout(timedOut, duration); xhr.send(blob);
      } catch (error) { finish(error); }
    });
  }
  return { preparePhoto, uploadPhoto };
});
