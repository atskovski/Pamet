'use strict';
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const expected = pkg.version;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const main = fs.readFileSync('js/main.js','utf8');
const authenticated = fs.readFileSync('js/authenticated-features.js','utf8');
const insights = fs.readFileSync('js/insights.js','utf8');
const insightsChartingLoader = fs.readFileSync('js/insights-charting-loader.js','utf8');
const insightsCharting = fs.readFileSync('js/insights-charting.js','utf8');
const insightsController = fs.readFileSync('js/interaction-controller.js','utf8');
const experience = fs.readFileSync('js/experience.js','utf8');
const icons = fs.readFileSync('js/icons.js','utf8');
const css = fs.readFileSync('css/design-system.css','utf8');
const cssMain = fs.readFileSync('css/main.css','utf8');
const authenticatedCss = fs.readFileSync('css/authenticated.css','utf8');
const insightsCss = fs.readFileSync('css/insights-overhaul.css','utf8');
const insightsChartingCss = fs.readFileSync('css/insights-charting.css','utf8');
const darkMode = fs.readFileSync('css/dark-mode.css','utf8');

check(main.includes(`const PAMET_VERSION = '${expected}'`), `Pamet browser release must identify the current ${expected} product-system line.`);
check(
  main.includes('./icons.js') &&
  authenticated.includes('./insights.js') &&
  authenticated.includes('./insights-charting-loader.js') &&
  !authenticated.includes('import "./insights-charting.js"') &&
  authenticated.includes('./interaction-controller.js') &&
  authenticated.includes('./experience.js') &&
  !main.includes('import "./insights.js"'),
  'Insights chart rendering must stay out of the critical authenticated bundle while its loader, controller, and experience layers remain deferred.'
);
check(
  insightsChartingLoader.includes('/dist/pamet.insights-charting.min.js') &&
  insightsChartingLoader.includes('PametInsightsCharts') &&
  insightsChartingLoader.includes('PametInsightsController?.render?.()'),
  'Patterns must lazy-load the chart engine and re-render Insights when the deferred asset is ready.'
);
check(cssMain.includes('@import "./design-system.css";'), 'Formal design system must remain loaded.');
check(cssMain.trim().endsWith('@import "./dark-mode.css";') && authenticatedCss.trim().endsWith('@import "./dark-mode.css";'), 'Unified dark mode must remain the final visual override layer for both full and deferred styles.');
check(authenticatedCss.includes('@import "./insights-overhaul.css";') && authenticatedCss.includes('@import "./insights-charting.css";') && insightsCss.includes('.tracking-quality-card') && insightsCss.includes('.insights-window-kpis') && insightsChartingCss.includes('.insights-chart-card') && insightsChartingCss.includes('.advanced-comparison-grid'), 'Redesigned Insights and charting surfaces must remain in the deferred authenticated stylesheet.');
check(darkMode.includes('.insights-empty') && darkMode.includes('--text-primary: #F2F5F4'), 'Dark-mode Insights surfaces and readable foreground hierarchy must remain enforced.');
check(experience.includes("title.textContent = 'Visit Brief'") && experience.includes('Email visit brief'), 'Doctor Report must remain renamed to Visit Brief in the active product UI.');
check(insightsController.includes("[['all','All'],['symptom','Symptoms'],['lifestyle','Lifestyle'],['medication','Medications'],['sleepstress','Sleep / Stress']]"), 'Insights must expose all approved observation categories.');
check(insightsController.includes('[7, 14, 30, 60, 90, 180, 360]'), 'Insights must support every approved history window from 7 through 360 days.');
check(insightsCharting.includes('bucketWidthFor') && insightsCharting.includes('Missing days remain missing') && insightsCharting.includes('three-period rolling trend') && insightsCharting.includes('sleepHours') && insightsCharting.includes('stressLevel') && insightsCharting.includes('waterGlasses'), 'Insights charts must adapt bucket size by window, preserve missingness, and expose native-unit factor trends.');
check(insightsController.includes("label: 'Advanced charting'") && insightsController.includes("feature: 'correlations'") && insightsCharting.includes('data-chart-mode="advanced"') && insightsCharting.includes("' · Pro+'"), 'Advanced charting must remain plan-gated while basic charting stays available.');
check(insightsController.includes('First seen') && insightsController.includes('Last seen') && insights.includes('More frequent recently') && insights.includes('Less frequent recently'), 'Observation history and trend direction must be visible.');
check(insightsController.includes('Why am I seeing this?') && insightsController.includes('Why Pamet surfaced this'), 'Evidence expansion must be available.');
check(insightsController.includes('Tracking quality') && insightsController.includes('Tracking consistency') && insightsController.includes('Entry detail') && insightsController.includes('Baseline mix') && insightsController.includes('Most useful next step'), 'Insights must explain tracking quality with distinct, actionable signals.');
check(insightsController.includes('pamet_archived_observations') && insightsController.includes('Your journal entries stay unchanged'), 'Archive must be view-only state and never delete health entries.');
check(insights.includes('topSymptom?.[1] >= 2'), 'Symptom findings must require repeat evidence instead of surfacing a one-entry pattern.');
check(insights.includes('does not establish') && insights.includes('does not infer') && insightsController.includes('does not diagnose') && insightsCharting.includes('does not establish') && !/(?:\bcauses\b|\bcaused by\b|\bleads to\b|→)/i.test(insights + insightsController + insightsCharting), 'Insights language must remain observational and non-causal.');
check(icons.includes('window.PametIcons') && icons.includes('stroke-width="1.8"') && icons.includes('aria-hidden="true"'), 'Central icon registry must standardize stroke and accessibility semantics.');
check(css.includes('--pamet-type-meta') && css.includes('--pamet-type-helper') && css.includes('--pamet-type-body') && css.includes('--pamet-type-control') && css.includes('--pamet-type-section') && css.includes('--pamet-type-page'), 'Formal type scale must define all approved roles.');
check(css.includes('--pamet-primary:#0f3d3e') && css.includes('--pamet-sage') && css.includes('--pamet-amber') && css.includes('--pamet-rose'), 'Semantic production colors must use teal plus health-state sage/amber/rose.');
check(!/#(?:6d28d9|7c3aed|8b5cf6|a855f7|9333ea)/i.test(css), 'Production design layer must not introduce admin purple.');
check(experience.includes('data-calendar-today') && experience.includes('Search health history') && experience.includes('Filter by symptom'), 'Calendar must include Today, history search, and symptom filtering.');
check(experience.includes('pamet-skip-link') && experience.includes("event.key === 'Escape'") && css.includes(':focus-visible') && css.includes('prefers-reduced-motion'), 'Accessibility layer must include skip navigation, Escape handling, focus visibility, and reduced motion.');
console.log(`Pamet ${expected} Insights/design-system checks passed with deferred product-system loading.`);