/* Lightweight loader keeps chart rendering off the authenticated critical bundle until Patterns is opened. */
(function (global) {
  'use strict';

  if (global.PametInsightsChartingLoader) return;
  let pending = null;

  function load() {
    if (global.PametInsightsCharts) return Promise.resolve(global.PametInsightsCharts);
    if (pending) return pending;

    pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/dist/pamet.insights-charting.min.js?v=1695';
      script.async = true;
      script.addEventListener('load', () => {
        if (global.PametInsightsCharts) resolve(global.PametInsightsCharts);
        else reject(new Error('Insights charting did not initialize.'));
      }, { once:true });
      script.addEventListener('error', () => reject(new Error('Insights charting could not be loaded.')), { once:true });
      document.head.appendChild(script);
    }).catch((error) => {
      pending = null;
      throw error;
    });

    return pending;
  }

  global.PametInsightsChartingLoader = Object.freeze({ load });
})(window);