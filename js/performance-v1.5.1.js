/* Pamet v1.5.1 runtime performance guard.
   Broad document MutationObservers are coalesced to one callback per frame.
   Targeted observers keep native microtask timing. */
(() => {
  'use strict';
  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver || window.__pametMutationObserverGuard) return;
  window.__pametMutationObserverGuard = true;

  class PametMutationObserver {
    constructor(callback) {
      if (typeof callback !== 'function') throw new TypeError('MutationObserver callback must be a function');
      this.callback = callback;
      this.pending = [];
      this.frame = 0;
      this.broad = false;
      this.active = true;
      this.native = new NativeMutationObserver((mutations, observer) => {
        if (!this.active) return;
        if (!this.broad) {
          this.callback(mutations, this);
          return;
        }
        this.pending.push(...mutations);
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          if (!this.active || !this.pending.length) return;
          const batch = this.pending.splice(0);
          this.callback(batch, this);
        });
      });
    }

    observe(target, options) {
      const opts = options || {};
      if ((target === document.body || target === document.documentElement) && opts.childList && opts.subtree) {
        this.broad = true;
      }
      this.active = true;
      return this.native.observe(target, opts);
    }

    disconnect() {
      this.active = false;
      this.pending.length = 0;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      return this.native.disconnect();
    }

    takeRecords() {
      const records = this.native.takeRecords();
      if (this.pending.length) records.unshift(...this.pending.splice(0));
      return records;
    }
  }

  Object.defineProperty(PametMutationObserver, 'name', { value: 'MutationObserver' });
  window.MutationObserver = PametMutationObserver;
})();
