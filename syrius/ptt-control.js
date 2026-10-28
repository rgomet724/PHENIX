'use strict';

(() => {
  // Safari possède un geste d’appui long distinct des Pointer Events. Annuler
  // touchstart sur la seule surface PTT bloque sa loupe et la sélection, même
  // quand le poste n’est pas encore prêt. Les messages restent sélectionnables.
  window.bindSyriusPtt = ({ button, surface, canStart, start, stop }) => {
    let pointerId = null, touchId = null;
    const prevent = event => { if (event.cancelable !== false) event.preventDefault(); };
    const clearSelection = () => {
      const selection = window.getSelection?.();
      if (selection && (surface.contains(selection.anchorNode) || surface.contains(selection.focusNode))) selection.removeAllRanges();
    };
    const begin = () => { clearSelection(); if (canStart()) start(); };
    surface.addEventListener('touchstart', event => {
      prevent(event);
      if (touchId !== null || event.touches.length !== 1) return;
      touchId = event.changedTouches[0].identifier; begin();
    }, { passive: false });
    surface.addEventListener('touchmove', event => { if (touchId !== null) prevent(event); }, { passive: false });
    const endTouch = event => {
      if (touchId === null || (event.type !== 'touchcancel' && !Array.from(event.changedTouches || []).some(touch => touch.identifier === touchId))) return;
      prevent(event); touchId = null; stop();
    };
    document.addEventListener('touchend', endTouch, { passive: false });
    document.addEventListener('touchcancel', endTouch, { passive: false });
    surface.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0 || pointerId !== null) return;
      prevent(event); pointerId = event.pointerId;
      surface.setPointerCapture?.(pointerId); begin();
    });
    const endPointer = event => {
      if (pointerId !== event.pointerId) return;
      pointerId = null; stop();
    };
    window.addEventListener('pointerup', endPointer); window.addEventListener('pointercancel', endPointer);
    surface.addEventListener('lostpointercapture', endPointer);
    for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart']) surface.addEventListener(type, prevent, { passive: false });
    button.addEventListener('click', prevent);
    window.addEventListener('blur', () => { pointerId = null; touchId = null; stop(); });
  };
})();
