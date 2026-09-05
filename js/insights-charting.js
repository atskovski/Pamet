/* Pamet Insights charting engine — transparent, window-aware observational charts. */
(() => {
  'use strict';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[character]));
  const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));
  const average = (values) => {
    const valid = values.filter(finite).map(Number);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };
  const percent = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 100) : 0;
  const parseDate = (value) => new Date(value);
  const dayKey = (value) => {
    const date = parseDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };
  const distinctDays = (entries) => new Set(entries.map((entry) => dayKey(entry.date)).filter(Boolean)).size;
  const plural = (count, singular, pluralValue = `${singular}s`) => `${count} ${count === 1 ? singular : pluralValue}`;

  const METRICS = Object.freeze({
    frequency: Object.freeze({
      label:'Symptom frequency',
      short:'Frequency',
      unit:'%',
      min:0,
      max:100,
      decimals:0,
      field:null
    }),
    severity: Object.freeze({
      label:'Recorded symptom severity',
      short:'Severity',
      unit:' / 10',
      min:0,
      max:10,
      decimals:1,
      field:'severity'
    }),
    sleep: Object.freeze({
      label:'Recorded sleep',
      short:'Sleep',
      unit:' h',
      min:0,
      max:null,
      decimals:1,
      field:'sleepHours'
    }),
    stress: Object.freeze({
      label:'Recorded stress',
      short:'Stress',
      unit:' / 10',
      min:0,
      max:10,
      decimals:1,
      field:'stressLevel'
    }),
    hydration: Object.freeze({
      label:'Recorded hydration',
      short:'Hydration',
      unit:' glasses',
      min:0,
      max:null,
      decimals:1,
      field:'waterGlasses'
    })
  });

  function bucketWidthFor(days) {
    if (days <= 14) return 1;
    if (days <= 30) return 3;
    if (days <= 60) return 7;
    if (days <= 90) return 10;
    if (days <= 180) return 14;
    return 30;
  }

  function matchesSymptom(entry, symptom) {
    const symptoms = Array.isArray(entry?.symptoms) ? entry.symptoms : [];
    return symptom && symptom !== 'all' ? symptoms.includes(symptom) : symptoms.length > 0;
  }

  function symptomLabel(symptom) {
    return symptom && symptom !== 'all' ? symptom : 'Any symptom';
  }

  function symptomOptions(entries) {
    const counts = new Map();
    entries.forEach((entry) => (entry.symptoms || []).forEach((symptom) => {
      const label = String(symptom || '').trim();
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    }));
    return [...counts.entries()]
      .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0,10)
      .map(([name,count]) => ({ name, count }));
  }

  function formatDateLabel(date, days) {
    return date.toLocaleDateString(
      'en-US',
      days >= 180 ? { month:'short', year:'2-digit' } : { month:'short', day:'numeric' }
    );
  }

  function formatRangeLabel(start, end, days) {
    if (dayKey(start) === dayKey(end)) return formatDateLabel(start, days);
    const startLabel = start.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    const endLabel = end.toLocaleDateString(
      'en-US',
      days >= 180 ? { month:'short', day:'numeric', year:'2-digit' } : { month:'short', day:'numeric' }
    );
    return `${startLabel}–${endLabel}`;
  }

  function bucketize(entries, days, symptom = 'all') {
    const width = bucketWidthFor(days);
    const end = new Date();
    end.setHours(23,59,59,999);
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    start.setHours(0,0,0,0);
    const bucketCount = Math.ceil(days / width);
    const buckets = [];

    for (let index = 0; index < bucketCount; index += 1) {
      const bucketStart = new Date(start);
      bucketStart.setDate(bucketStart.getDate() + index * width);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketEnd.getDate() + width - 1);
      bucketEnd.setHours(23,59,59,999);
      if (bucketEnd > end) bucketEnd.setTime(end.getTime());

      const pool = entries.filter((entry) => {
        const date = parseDate(entry?.date);
        return !Number.isNaN(date.getTime()) && date >= bucketStart && date <= bucketEnd;
      });
      const symptomPool = pool.filter((entry) => matchesSymptom(entry, symptom));
      const loggedDays = distinctDays(pool);
      const symptomDays = distinctDays(symptomPool);
      const bucketStartDay = new Date(bucketStart);
      const bucketEndDay = new Date(bucketEnd);
      bucketStartDay.setHours(0,0,0,0);
      bucketEndDay.setHours(0,0,0,0);
      const bucketCalendarDays = Math.max(
        1,
        Math.round((bucketEndDay - bucketStartDay) / 86400000) + 1
      );
      const factorAverage = (field, source = pool) => average(source.map((entry) => entry?.[field]));

      buckets.push({
        index,
        start:new Date(bucketStart),
        end:new Date(bucketEnd),
        label:formatRangeLabel(bucketStart, bucketEnd, days),
        calendarDays:bucketCalendarDays,
        loggedDays,
        symptomDays,
        coverage:percent(loggedDays, bucketCalendarDays),
        frequency:loggedDays ? percent(symptomDays, loggedDays) : null,
        severity:factorAverage('severity', symptomPool),
        sleep:factorAverage('sleepHours'),
        sleepSymptom:factorAverage('sleepHours', symptomPool),
        stress:factorAverage('stressLevel'),
        stressSymptom:factorAverage('stressLevel', symptomPool),
        hydration:factorAverage('waterGlasses'),
        hydrationSymptom:factorAverage('waterGlasses', symptomPool)
      });
    }
    return { width, buckets, start, end };
  }

  function rolling(values, span = 3) {
    return values.map((value, index) => {
      if (!finite(value)) return null;
      const from = Math.max(0, index - span + 1);
      const pool = values.slice(from, index + 1).filter(finite).map(Number);
      return pool.length ? average(pool) : null;
    });
  }

  function averageByDay(entries, field) {
    const byDay = new Map();
    entries.forEach((entry) => {
      if (!finite(entry?.[field])) return;
      const key = dayKey(entry.date);
      if (!key) return;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(Number(entry[field]));
    });
    return average([...byDay.values()].map((values) => average(values)).filter(finite));
  }

  function comparison(entries, symptom) {
    const selected = entries.filter((entry) => matchesSymptom(entry, symptom));
    const baseline = symptom && symptom !== 'all'
      ? entries.filter((entry) => !matchesSymptom(entry, symptom))
      : entries.filter((entry) => Array.isArray(entry.symptoms) && entry.symptoms.length === 0);
    const selectedDays = distinctDays(selected);
    const baselineDays = distinctDays(baseline);
    const factors = [
      { key:'sleep', label:'Sleep', field:'sleepHours', unit:'h', max:12 },
      { key:'stress', label:'Stress', field:'stressLevel', unit:'/10', max:10 },
      { key:'hydration', label:'Hydration', field:'waterGlasses', unit:'glasses', max:12 }
    ].map((item) => ({
      ...item,
      selected:averageByDay(selected,item.field),
      baseline:averageByDay(baseline,item.field)
    }));
    return {
      selectedDays,
      baselineDays,
      factors,
      sufficient:selectedDays >= 2 && baselineDays >= 2
    };
  }

  function metricValues(buckets, metric, symptom) {
    if (metric === 'frequency') {
      return { primary:buckets.map((bucket) => bucket.frequency), comparison:null };
    }
    if (metric === 'severity') {
      return { primary:buckets.map((bucket) => bucket.severity), comparison:null };
    }
    const suffix = metric === 'sleep'
      ? 'sleepSymptom'
      : metric === 'stress' ? 'stressSymptom' : 'hydrationSymptom';
    return {
      primary:buckets.map((bucket) => bucket[metric]),
      comparison:buckets.map((bucket) => bucket[suffix]),
      comparisonLabel:`${symptomLabel(symptom)} days`
    };
  }

  function metricMax(metric, values) {
    const def = METRICS[metric] || METRICS.frequency;
    if (finite(def.max)) return Number(def.max);
    const valid = values.flat().filter(finite).map(Number);
    if (!valid.length) return metric === 'sleep' ? 10 : 8;
    const observed = Math.max(...valid);
    return Math.max(metric === 'sleep' ? 8 : 6, Math.ceil(observed * 1.18));
  }

  function formatMetric(metric, value) {
    if (!finite(value)) return 'No data';
    const def = METRICS[metric] || METRICS.frequency;
    return `${Number(value).toFixed(def.decimals)}${def.unit}`;
  }

  function pathFor(values, xAt, yAt) {
    let path = '';
    let open = false;
    values.forEach((value, index) => {
      if (!finite(value)) {
        open = false;
        return;
      }
      const point = `${xAt(index).toFixed(1)} ${yAt(Number(value)).toFixed(1)}`;
      path += `${open ? ' L' : 'M'}${point}`;
      open = true;
    });
    return path;
  }

  function gridMarkup(metric, def, yMax, yAt, pad, width) {
    const tickCount = 5;
    return Array.from({ length:tickCount }, (_, index) => {
      const value = yMax - (yMax / (tickCount - 1)) * index;
      const y = yAt(value);
      const label = metric === 'frequency' ? Math.round(value) : value.toFixed(def.decimals);
      return `<g class="chart-grid-line">
        <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width-pad.right}" y2="${y.toFixed(1)}"/>
        <text x="${pad.left-10}" y="${(y+4).toFixed(1)}" text-anchor="end">${label}</text>
      </g>`;
    }).join('');
  }

  function xLabelMarkup(buckets, xAt, height) {
    const maxLabels = buckets.length <= 7 ? buckets.length : 6;
    const indexes = new Set(Array.from({ length:maxLabels }, (_, index) => (
      Math.round(index * (buckets.length - 1) / Math.max(1, maxLabels - 1))
    )));
    return buckets.map((bucket,index) => indexes.has(index)
      ? `<text class="chart-x-label" x="${xAt(index).toFixed(1)}" y="${height-16}" text-anchor="middle">${escapeHtml(bucket.label)}</text>`
      : ''
    ).join('');
  }

  function pointMarkup(values, buckets, metric, xAt, yAt, className = '') {
    return values.map((value,index) => {
      if (!finite(value)) return '';
      const title = `${buckets[index].label}: ${formatMetric(metric,value)}; ${plural(buckets[index].loggedDays,'logged day')}`;
      return `<circle class="chart-point${className}" cx="${xAt(index).toFixed(1)}" cy="${yAt(Number(value)).toFixed(1)}" r="4">
        <title>${escapeHtml(title)}</title>
      </circle>`;
    }).join('');
  }

  function secondaryPointMarkup(values, buckets, metric, comparisonLabel, xAt, yAt) {
    return values.map((value,index) => {
      if (!finite(value)) return '';
      const title = `${buckets[index].label} — ${comparisonLabel}: ${formatMetric(metric,value)}`;
      return `<circle class="chart-point comparison" cx="${xAt(index).toFixed(1)}" cy="${yAt(Number(value)).toFixed(1)}" r="3.5">
        <title>${escapeHtml(title)}</title>
      </circle>`;
    }).join('');
  }

  function chartSvg(buckets, metric, symptom, advanced) {
    const def = METRICS[metric] || METRICS.frequency;
    const { primary, comparison:secondary, comparisonLabel } = metricValues(buckets, metric, symptom);
    const trend = rolling(primary, 3);
    const allSeries = secondary ? [primary,secondary,trend] : [primary,trend];
    const yMax = metricMax(metric, allSeries);
    const width = 940;
    const height = 330;
    const pad = { left:60, right:22, top:22, bottom:48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const xAt = (index) => pad.left + (
      buckets.length <= 1 ? plotW / 2 : (index / (buckets.length - 1)) * plotW
    );
    const yAt = (value) => pad.top + plotH - (clamp(value,0,yMax) / yMax) * plotH;
    const primaryPath = pathFor(primary,xAt,yAt);
    const trendPath = pathFor(trend,xAt,yAt);
    const secondaryPath = secondary ? pathFor(secondary,xAt,yAt) : '';
    const secondaryPoints = advanced && secondary
      ? secondaryPointMarkup(secondary,buckets,metric,comparisonLabel,xAt,yAt)
      : '';

    return `<div class="insights-chart-svg-wrap">
      <svg class="insights-chart-svg" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="${escapeHtml(def.label)} over the selected ${buckets.length} chart periods">
        <g>${gridMarkup(metric,def,yMax,yAt,pad,width)}</g>
        <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top+plotH}"/>
        <line class="chart-axis" x1="${pad.left}" y1="${pad.top+plotH}" x2="${width-pad.right}" y2="${pad.top+plotH}"/>
        ${secondaryPath ? `<path class="chart-series-secondary" d="${secondaryPath}"/>` : ''}
        <path class="chart-series-primary" d="${primaryPath}"/>
        <path class="chart-series-trend" d="${trendPath}"/>
        ${pointMarkup(primary,buckets,metric,xAt,yAt)}
        ${secondaryPoints}
        ${xLabelMarkup(buckets,xAt,height)}
      </svg>
    </div>`;
  }

  function coverageStrip(buckets) {
    const cells = buckets.map((bucket) => `<div class="coverage-cell">
      <progress max="100" value="${bucket.coverage}"
        aria-label="${escapeHtml(bucket.label)} logging coverage ${bucket.coverage}%"></progress>
      <span>${bucket.loggedDays}/${bucket.calendarDays}</span>
    </div>`).join('');
    return `<div class="chart-coverage" aria-label="Logging coverage by chart period">
      <div class="chart-coverage-head">
        <span>Logging coverage</span>
        <span>Logged days / calendar days</span>
      </div>
      <div class="chart-coverage-grid">${cells}</div>
    </div>`;
  }

  function frequencySummary(entries, buckets, symptom) {
    const logged = distinctDays(entries);
    const symptomDays = distinctDays(entries.filter((entry) => matchesSymptom(entry,symptom)));
    const frequency = percent(symptomDays,logged);
    const severity = average(
      entries.filter((entry) => matchesSymptom(entry,symptom)).map((entry) => entry.severity)
    );
    const populated = buckets.filter((bucket) => bucket.loggedDays > 0 && finite(bucket.frequency));
    const betterSupported = populated.filter((bucket) => bucket.loggedDays >= Math.min(2,bucket.calendarDays));
    const peakPool = betterSupported.length ? betterSupported : populated;
    const peak = peakPool.length
      ? [...peakPool].sort((a,b) => Number(b.frequency)-Number(a.frequency) || b.loggedDays-a.loggedDays)[0]
      : null;
    const midpoint = Math.floor(buckets.length/2);
    const combine = (pool) => {
      const logCount = pool.reduce((sum,bucket) => sum + bucket.loggedDays,0);
      const symptomCount = pool.reduce((sum,bucket) => sum + bucket.symptomDays,0);
      return logCount ? percent(symptomCount,logCount) : null;
    };
    const earlier = combine(buckets.slice(0,midpoint));
    const recent = combine(buckets.slice(midpoint));
    const delta = finite(earlier) && finite(recent) ? Math.round(recent-earlier) : null;
    const trendText = !finite(delta)
      ? 'More logged history is needed to compare the earlier and recent halves.'
      : Math.abs(delta) < 10
        ? 'Recorded frequency is broadly similar between the earlier and recent halves.'
        : `Recorded frequency is ${Math.abs(delta)} percentage points ${delta > 0 ? 'higher' : 'lower'} in the recent half.`;
    return { logged, symptomDays, frequency, severity, peak, trendText };
  }

  function comparisonCard(item, comparisonData, symptom) {
    const selected = item.selected;
    const baseline = item.baseline;
    const difference = finite(selected) && finite(baseline) ? Number(selected)-Number(baseline) : null;
    const selectedLabel = symptom && symptom !== 'all' ? `${symptom} days` : 'Symptom days';
    const baselineLabel = symptom && symptom !== 'all' ? 'Other logged days' : 'Symptom-free days';
    const value = (number) => finite(number) ? `${Number(number).toFixed(1)} ${item.unit}` : '—';
    const differenceCopy = finite(difference)
      ? `${difference >= 0 ? '+' : ''}${difference.toFixed(1)} ${item.unit} difference`
      : 'Not enough comparable data';
    const note = comparisonData.sufficient
      ? 'Observed averages only; this does not establish cause or effect.'
      : `Needs at least 2 days in each group. Current baseline: ${comparisonData.selectedDays} / ${comparisonData.baselineDays} days.`;

    return `<div class="advanced-comparison-card" data-comparison="${item.key}">
      <div class="advanced-comparison-title">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(differenceCopy)}</strong>
      </div>
      <div class="advanced-comparison-pair">
        <div>
          <span>${escapeHtml(selectedLabel)}</span>
          <strong>${escapeHtml(value(selected))}</strong>
          <progress max="${item.max}" value="${finite(selected) ? clamp(selected,0,item.max) : 0}"></progress>
        </div>
        <div>
          <span>${escapeHtml(baselineLabel)}</span>
          <strong>${escapeHtml(value(baseline))}</strong>
          <progress max="${item.max}" value="${finite(baseline) ? clamp(baseline,0,item.max) : 0}"></progress>
        </div>
      </div>
      <small>${escapeHtml(note)}</small>
    </div>`;
  }

  function basicSummaryMarkup(summary) {
    return `<div class="chart-summary-grid">
      <div>
        <span>Recorded frequency</span>
        <strong>${summary.logged ? `${summary.frequency}%` : '—'}</strong>
        <small>${summary.symptomDays} of ${summary.logged} logged days</small>
      </div>
      <div>
        <span>Average severity</span>
        <strong>${finite(summary.severity) ? `${summary.severity.toFixed(1)} / 10` : '—'}</strong>
        <small>on selected symptom entries</small>
      </div>
      <div>
        <span>Highest recorded period</span>
        <strong>${summary.peak ? escapeHtml(summary.peak.label) : '—'}</strong>
        <small>${summary.peak ? `${summary.peak.frequency}% of logged days in that period` : 'No populated period yet'}</small>
      </div>
      <div>
        <span>Recent vs earlier</span>
        <strong>${escapeHtml(summary.trendText)}</strong>
      </div>
    </div>`;
  }

  function metricButtonsMarkup(activeMetric) {
    return Object.entries(METRICS).map(([key,def]) => (
      `<button type="button" class="chart-metric-btn${activeMetric===key ? ' active' : ''}"
        data-chart-metric="${key}" aria-pressed="${activeMetric===key}">${escapeHtml(def.short)}</button>`
    )).join('');
  }

  function symptomSelectMarkup(options, validSymptom) {
    const optionMarkup = options.map((item) => (
      `<option value="${escapeHtml(item.name)}"${validSymptom===item.name?' selected':''}>
        ${escapeHtml(item.name)} (${item.count})
      </option>`
    )).join('');
    return `<label class="chart-symptom-select">
      <span>Chart symptom</span>
      <select data-chart-symptom aria-label="Chart symptom">
        <option value="all"${validSymptom==='all'?' selected':''}>Any symptom</option>
        ${optionMarkup}
      </select>
    </label>`;
  }

  function advancedControlsMarkup(activeMetric, metricDef, series, loggedBuckets, validSymptom) {
    const factorOverlay = ['sleep','stress','hydration'].includes(activeMetric);
    return `<div class="advanced-chart-controls">
      <div>
        <span>Chart measure</span>
        <div class="chart-metric-group" role="group" aria-label="Advanced chart measure">
          ${metricButtonsMarkup(activeMetric)}
        </div>
      </div>
      <div class="advanced-chart-context">
        <span>${series.width === 1 ? 'Daily' : `${series.width}-day`} buckets</span>
        <span>${loggedBuckets} of ${series.buckets.length} periods contain logs</span>
        <span>3-period rolling trend</span>
      </div>
    </div>
    <div class="chart-legend">
      <span class="legend-primary">${escapeHtml(metricDef.label)}${factorOverlay ? ' — all logged days' : ''}</span>
      ${factorOverlay ? `<span class="legend-secondary">${escapeHtml(symptomLabel(validSymptom))} days</span>` : ''}
      <span class="legend-trend">Rolling trend</span>
    </div>`;
  }

  function advancedComparisonMarkup(comparisonData, validSymptom, days) {
    const heading = validSymptom === 'all'
      ? 'Symptom days compared with symptom-free logged days'
      : `${escapeHtml(validSymptom)} days compared with other logged days`;
    const cards = comparisonData.factors.map((item) => (
      comparisonCard(item,comparisonData,validSymptom)
    )).join('');
    return `<div class="advanced-comparison">
      <div class="advanced-comparison-head">
        <div>
          <span class="pamet-eyebrow">Same-window comparison</span>
          <h4>${heading}</h4>
        </div>
        <p>${comparisonData.selectedDays} selected days · ${comparisonData.baselineDays} comparison days.
          Values are observational averages from this ${days}-day window.</p>
      </div>
      <div class="advanced-comparison-grid">${cards}</div>
    </div>`;
  }

  function emptyMarkup() {
    return `<div class="insights-chart-empty">
      <strong>No chart data in this window yet</strong>
      <p>Log at least one day and this chart will populate automatically.
        Pamet does not draw values across days you did not record.</p>
    </div>`;
  }

  function render({
    entries = [],
    days = 7,
    mode = 'basic',
    metric = 'frequency',
    symptom = 'all',
    advancedEnabled = false
  } = {}) {
    const normalizedMode = advancedEnabled && mode === 'advanced' ? 'advanced' : 'basic';
    const normalizedMetric = METRICS[metric] ? metric : 'frequency';
    const options = symptomOptions(entries);
    const validSymptom = symptom === 'all' || options.some((item) => item.name === symptom)
      ? symptom
      : 'all';
    const series = bucketize(entries,days,validSymptom);
    const summary = frequencySummary(entries,series.buckets,validSymptom);
    const comparisonData = comparison(entries,validSymptom);
    const metricDef = METRICS[normalizedMode === 'basic' ? 'frequency' : normalizedMetric];
    const activeMetric = normalizedMode === 'basic' ? 'frequency' : normalizedMetric;
    const loggedBuckets = series.buckets.filter((bucket) => bucket.loggedDays > 0).length;
    const chartHeading = normalizedMode === 'basic'
      ? `${symptomLabel(validSymptom)} frequency over time`
      : metricDef.label;
    const modeCopy = normalizedMode === 'basic'
      ? 'A simple view of how often the selected symptom was recorded on the days you logged.'
      : 'A deeper view using raw bucket averages, a three-period rolling trend, and symptom-day comparisons in the original units you recorded.';
    const advancedPanel = normalizedMode === 'advanced'
      ? advancedControlsMarkup(activeMetric,metricDef,series,loggedBuckets,validSymptom)
      : '';
    const comparisons = normalizedMode === 'advanced'
      ? advancedComparisonMarkup(comparisonData,validSymptom,days)
      : '';
    const chartBody = summary.logged === 0
      ? emptyMarkup()
      : chartSvg(series.buckets,activeMetric,validSymptom,normalizedMode === 'advanced');
    const summaryMarkup = normalizedMode === 'basic'
      ? basicSummaryMarkup(summary)
      : comparisons;

    return `<section class="insights-chart-card" aria-labelledby="insightsChartTitle"
      data-chart-mode-current="${normalizedMode}" data-chart-window="${days}"
      data-chart-bucket-days="${series.width}">
      <div class="insights-chart-head">
        <div>
          <span class="pamet-eyebrow">Dynamic chart · ${days}-day window</span>
          <h3 id="insightsChartTitle">${escapeHtml(chartHeading)}</h3>
          <p>${escapeHtml(modeCopy)}</p>
        </div>
        <div class="chart-mode-switch" role="group" aria-label="Chart detail">
          <button type="button" data-chart-mode="basic" class="${normalizedMode==='basic'?'active':''}"
            aria-pressed="${normalizedMode==='basic'}">Basic</button>
          <button type="button" data-chart-mode="advanced"
            class="${normalizedMode==='advanced'?'active':''}${advancedEnabled?'':' chart-locked'}"
            aria-pressed="${normalizedMode==='advanced'}">Advanced${advancedEnabled?'':' · Pro+'}</button>
        </div>
      </div>
      <div class="chart-primary-controls">
        ${symptomSelectMarkup(options,validSymptom)}
        <div class="chart-window-explain">
          <strong>${series.width === 1 ? 'Daily view' : `${series.width}-day grouped view`}</strong>
          <span>Automatically adjusted for readability at ${days} days.</span>
        </div>
      </div>
      ${advancedPanel}
      ${chartBody}
      ${coverageStrip(series.buckets)}
      ${summaryMarkup}
      <p class="chart-method-note">Charts summarize what you recorded. Missing days remain missing,
        values are not interpolated, and associations do not establish medical cause, diagnosis,
        or treatment effect.</p>
    </section>`;
  }

  window.PametInsightsCharts = Object.freeze({
    render,
    bucketize,
    comparison,
    metrics:() => Object.keys(METRICS),
    bucketWidthFor
  });
})();