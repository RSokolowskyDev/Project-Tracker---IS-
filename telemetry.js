(() => {
  const events = [];
  const currentSessionId = crypto.randomUUID();
  function loadQueue() { return events; }
  function sessionId() { return currentSessionId; }
  function elementName(el) {
    if (!el) return 'unknown';
    const data = el.dataset || {};
    return data.nav || data.go || data.role || data.openRole || data.openProject || data.ticketId || data.itemCardId || data.projectCardId || data.projectStatus || data.itemStatus || data.availableTask || el.id || el.getAttribute('name') || el.getAttribute('aria-label') || el.tagName.toLowerCase();
  }
  function cleanMeta(meta = {}) {
    const out = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string') out[k] = v.slice(0, 180);
      else if (['number','boolean'].includes(typeof v)) out[k] = v;
    }
    return out;
  }

  let currentView = 'dashboard';
  let viewStartedAt = Date.now();
  let maxScroll = 0;
  let scrollStartedAt = null;
  let scrollActiveMs = 0;
  let scrollStopTimer = null;

  function track(type, meta = {}) {
    events.push({
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      sessionId: sessionId(),
      type,
      view: currentView,
      meta: cleanMeta(meta)
    });
    if (events.length > 3000) events.shift();
    window.WorkNavDataDirty?.();
  }

  function finishView(reason = 'navigate') {
    track('view_summary', {
      reason,
      view: currentView,
      activeSeconds: Math.max(0, Math.round((Date.now() - viewStartedAt) / 1000)),
      maxScrollPercent: Math.round(maxScroll),
      scrollingSeconds: Math.round(scrollActiveMs / 1000)
    });
    viewStartedAt = Date.now();
    maxScroll = 0;
    scrollStartedAt = null;
    scrollActiveMs = 0;
  }

  function setView(view, meta = {}) {
    if (view !== currentView) finishView('navigate');
    currentView = view || 'unknown';
    viewStartedAt = Date.now();
    maxScroll = 0;
    scrollActiveMs = 0;
    track('page_view', meta);
  }

  function flush() {
    return Promise.resolve(false);
  }

  // Events remain in memory for this page session and are summarized into
  // privacy-safe tracker_records rows only when the user downloads the tables.

  document.addEventListener('click', e => {
    const target = e.target.closest('button,a,[data-open-project],[data-open-role],[data-ticket-id],[data-item-card-id],summary');
    if (!target) return;
    track('click', {element: elementName(target), tag: target.tagName.toLowerCase()});
  }, true);

  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.matches('select,input[type="checkbox"],input[type="radio"]')) return;
    track('control_change', {control: elementName(el), inputType: el.type || el.tagName.toLowerCase()});
  }, true);

  document.addEventListener('dragstart', e => {
    const el = e.target.closest('[draggable="true"]');
    if (el) track('drag_start', {element: elementName(el)});
  }, true);

  document.addEventListener('drop', e => {
    const el = e.target.closest('[data-project-status],[data-item-status],#schedule-list,#available-work,.available-role-group,.available-project-group');
    track('drop', {target: elementName(el || e.target)});
  }, true);

  function noteScroll(target) {
    let depth = 0;
    let container = 'page';
    if (target === document || target === document.documentElement || target === document.body) {
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      depth = (window.scrollY / scrollable) * 100;
    } else if (target && target.scrollHeight) {
      const scrollable = Math.max(1, target.scrollHeight - target.clientHeight);
      depth = (target.scrollTop / scrollable) * 100;
      container = target.id || Array.from(target.classList || []).slice(0, 2).join('.') || target.tagName?.toLowerCase() || 'container';
    }
    maxScroll = Math.max(maxScroll, depth);
    if (!scrollStartedAt) scrollStartedAt = Date.now();
    clearTimeout(scrollStopTimer);
    scrollStopTimer = setTimeout(() => {
      if (scrollStartedAt) scrollActiveMs += Date.now() - scrollStartedAt;
      scrollStartedAt = null;
      track('scroll_summary', {container, depthPercent: Math.round(depth)});
    }, 220);
  }
  window.addEventListener('scroll', () => noteScroll(document), {passive:true});
  document.addEventListener('scroll', e => { if (e.target !== document) noteScroll(e.target); }, {capture:true, passive:true});

  document.addEventListener('toggle', e => {
    if (e.target.tagName === 'DETAILS') track('details_toggle', {element: elementName(e.target.querySelector('summary')), open: e.target.open});
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      finishView('hidden');
      flush();
    } else {
      viewStartedAt = Date.now();
      track('visible');
    }
  });
  window.addEventListener('pagehide', () => { finishView('pagehide'); flush(); });

  track('session_start', {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    language: navigator.language,
    touch: navigator.maxTouchPoints > 0
  });

  window.WorkNavTelemetry = {
    track,
    setView,
    flush,
    getQueue: loadQueue,
    getStats() {
      const q = loadQueue();
      return {
        queuedEvents: q.length,
        sessionId: sessionId(),
        pageViews: q.filter(x => x.type === 'page_view').length,
        clicks: q.filter(x => x.type === 'click').length,
        dragDrops: q.filter(x => x.type === 'drop').length
      };
    },
    getSummary() {
      const eventCounts = {}, viewCounts = {}, activeSecondsByView = {}, scrollingSecondsByView = {};
      for (const event of events) {
        eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
        if (event.view) viewCounts[event.view] = (viewCounts[event.view] || 0) + 1;
        if (event.type === 'view_summary') {
          activeSecondsByView[event.view] = (activeSecondsByView[event.view] || 0) + (Number(event.meta.activeSeconds) || 0);
          scrollingSecondsByView[event.view] = (scrollingSecondsByView[event.view] || 0) + (Number(event.meta.scrollingSeconds) || 0);
        }
      }
      return {totalEvents:events.length,eventCounts,viewCounts,activeSecondsByView,scrollingSecondsByView};
    }
  };
})();
