'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DashboardPages = api;
})(globalThis, function createPageTools() {
  const PAGE_INTERVAL_MS = 60000;
  const DEFAULT_PAGES = [{ id: 'page-informations', title: 'Informations' }, { id: 'page-publications', title: 'Vie du service' }];

  function migrateDashboard(data) {
    const legacy = data.schemaVersion === 1 && !data.pages?.length;
    if (legacy) {
      data.pages = DEFAULT_PAGES.map(page => ({ ...page }));
      for (const block of data.blocks) block.pageId = block.kind === 'news' ? DEFAULT_PAGES[1].id : DEFAULT_PAGES[0].id;
      if (!data.blocks.some(block => block.kind === 'duty')) {
        let id = 'duty-direction', index = 1;
        while (data.blocks.some(block => block.id === id)) id = `duty-direction-${++index}`;
        data.blocks.unshift({ id, kind: 'duty', pageId: DEFAULT_PAGES[0].id, title: data.duty.label || 'ASTREINTE DIRECTION', width: 3, minHeight: 180, background: '#123b53', color: '#ffffff', hidden: false, fontSize: 16, align: 'left', bold: false, italic: false, body: '', image: '', caption: '', items: [] });
      }
    }
    for (const block of data.blocks) {
      if (block.newsLimit === undefined) block.newsLimit = 1;
      if (block.imageHeight === undefined) block.imageHeight = 120;
      if (block.imageWidth === undefined) block.imageWidth = 100;
      if (block.imageFit === undefined) block.imageFit = 'contain';
      if (block.postId === undefined) block.postId = '';
      if (block.fixedHeight === undefined) block.fixedHeight = ['news', 'image'].includes(block.kind);
    }
    data.schemaVersion = 2;
    data.settings.pageSeconds = PAGE_INTERVAL_MS / 1000;
    return data;
  }

  function nextPageId(pages, currentId, offset = 1) {
    if (!pages.length) return '';
    const index = Math.max(0, pages.findIndex(page => page.id === currentId));
    return pages[((index + offset) % pages.length + pages.length) % pages.length].id;
  }

  function pageBlocks(data, pageId, includeHidden = false) {
    return data.blocks.filter(block => block.pageId === pageId && (includeHidden || !block.hidden));
  }

  function rotationStep(pages, pageId, nextAt, now, paused = false) {
    const current = pages.some(page => page.id === pageId) ? pageId : pages[0]?.id || '';
    if (paused || pages.length < 2 || !nextAt || current !== pageId) return { pageId: current, nextAt: now + PAGE_INTERVAL_MS, changed: current !== pageId };
    if (now < nextAt) return { pageId: current, nextAt, changed: false };
    return { pageId: nextPageId(pages, current), nextAt: now + PAGE_INTERVAL_MS, changed: true };
  }

  function moveBlock(data, id, offset) {
    const block = data.blocks.find(item => item.id === id);
    if (!block) return false;
    const blocks = pageBlocks(data, block.pageId, true), index = blocks.indexOf(block), target = blocks[index + offset];
    if (!target) return false;
    data.blocks.splice(data.blocks.indexOf(block), 1);
    data.blocks.splice(data.blocks.indexOf(target) + (offset > 0 ? 1 : 0), 0, block);
    return true;
  }

  return { PAGE_INTERVAL_MS, migrateDashboard, nextPageId, pageBlocks, rotationStep, moveBlock };
});
