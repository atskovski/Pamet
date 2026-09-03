/* Pamet 1.5.0 — centralized, accessible icon registry. */
(() => {
  'use strict';
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z"/><path d="M9 21v-6h6v6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    insights: '<path d="M4 18V9M10 18V5M16 18v-7M22 18H2"/><path d="m5 7 4-3 5 4 5-5"/>',
    brief: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h7M9 16h7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
    profiles: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.8 2.9-5.7 6-5.7s5.2 1.9 6 5.7"/><circle cx="18" cy="9" r="2.2"/><path d="M15.8 14.4c2.8-.4 4.6 1 5.2 4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><circle cx="12" cy="15" r="2.2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    archive: '<path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6"/>',
    restore: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    chevronDown: '<path d="m7 9 5 5 5-5"/>',
    chevronRight: '<path d="m9 7 5 5-5 5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  };

  function svg(name, options = {}) {
    const body = paths[name];
    if (!body) return '';
    const label = String(options.label || '').trim();
    const classes = ['pamet-icon', options.className || ''].filter(Boolean).join(' ');
    return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"'}>${body}</svg>`;
  }

  function replaceIcon(target, name) {
    if (!target || !paths[name]) return;
    const existing = target.querySelector('svg');
    const template = document.createElement('template');
    template.innerHTML = svg(name);
    if (existing) existing.replaceWith(template.content.firstElementChild);
    else target.prepend(template.content.firstElementChild);
  }

  function hydrate() {
    document.querySelectorAll('[data-pamet-icon]').forEach((node) => {
      if (node.dataset.pametIconHydrated === 'true') return;
      node.innerHTML = svg(node.dataset.pametIcon, { label: node.dataset.iconLabel || '' });
      node.dataset.pametIconHydrated = 'true';
    });
    const navMap = { home: 'home', calendar: 'calendar', patterns: 'insights', report: 'brief', settings: 'settings' };
    Object.entries(navMap).forEach(([tab, icon]) => replaceIcon(document.querySelector(`[data-tab="${tab}"]`), icon));
    replaceIcon(document.getElementById('themeToggle'), 'moon');
    replaceIcon(document.getElementById('quickProfileButton'), 'profiles');
    replaceIcon(document.getElementById('emailReport'), 'mail');
    replaceIcon(document.getElementById('downloadPdf'), 'download');
  }

  window.PametIcons = Object.freeze({ svg, replaceIcon, hydrate, names: Object.freeze(Object.keys(paths)) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate, { once: true });
  else hydrate();
  new MutationObserver(() => requestAnimationFrame(hydrate)).observe(document.documentElement, { childList: true, subtree: true });
})();
