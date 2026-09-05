/* Lightweight loader keeps chart rendering off the authenticated critical bundle until Patterns is opened. */
(function (global) {
  'use strict';

  if (global.PametInsightsChartingLoader) return;
  let pending = null;
  let engine = null;

  function bucketWidthFor(days) {
    if (days <= 14) return 1;
    if (days <= 30) return 3;
    if (days <= 60) return 7;
    if (days <= 90) return 10;
    if (days <= 180) return 14;
    return 30;
  }

  function loadingMarkup(options = {}) {
    const days = Number(options.days || 7);
    return `<section class="insights-chart-card insights-chart-loading"
      data-chart-mode-current="basic" data-chart-window="${days}"
      data-chart-bucket-days="${bucketWidthFor(days)}" aria-busy="true">
      <div class="insights-chart-head">
        <div>
          <span class="pamet-eyebrow">Dynamic chart · ${days}-day window</span>
          <h3>Preparing your chart</h3>
          <p>Pamet is loading the chart view only when you open Patterns.</p>
        </div>
      </div>
    </section>`;
  }

  function loadStyles() {
    const existing = document.querySelector('link[data-pamet-insights-charting]');
    if (existing?.dataset.loaded === 'true') return Promise.resolve();
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
      });
    }
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/dist/pamet.insights-charting.min.css?v=1695';
      link.dataset.pametInsightsCharting = 'true';
      link.addEventListener('load', () => {
        link.dataset.loaded = 'true';
        resolve();
      }, { once:true });
      link.addEventListener('error', () => reject(new Error('Insights chart styles could not be loaded.')), { once:true });
      document.head.appendChild(link);
    });
  }

  function loadScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/dist/pamet.insights-charting.min.js?v=1695';
      script.async = true;
      script.addEventListener('load', () => {
        const loaded = global.PametInsightsCharts;
        if (!loaded || loaded === proxy || typeof loaded.render !== 'function') {
          reject(new Error('Insights charting did not initialize.'));
          return;
        }
        engine = loaded;
        global.PametInsightsCharts = proxy;
        resolve();
      }, { once:true });
      script.addEventListener('error', () => reject(new Error('Insights charting could not be loaded.')), { once:true });
      document.head.appendChild(script);
    });
  }

  function load() {
    if (engine) return Promise.resolve(proxy);
    if (pending) return pending;
    pending = Promise.all([loadStyles(), loadScript()])
      .then(() => {
        requestAnimationFrame(() => global.PametInsightsController?.render?.());
        return proxy;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
    return pending;
  }

  const proxy = Object.freeze({
    render(options) {
      if (engine) return engine.render(options);
      load().catch(() => {});
      return loadingMarkup(options);
    },
    bucketize(...args) {
      return engine?.bucketize?.(...args) || { width:bucketWidthFor(Number(args[1] || 7)), buckets:[] };
    },
    comparison(...args) {
      return engine?.comparison?.(...args) || { selectedDays:0, baselineDays:0, factors:[], sufficient:false };
    },
    metrics() {
      return engine?.metrics?.() || ['frequency','severity','sleep','stress','hydration'];
    },
    bucketWidthFor(days) {
      return engine?.bucketWidthFor?.(days) || bucketWidthFor(Number(days || 7));
    }
  });

  global.PametInsightsCharts = proxy;
  global.PametInsightsChartingLoader = Object.freeze({ load });
})(window);