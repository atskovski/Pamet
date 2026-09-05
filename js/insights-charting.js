/* Pamet Insights charting engine — exact-day, window-aware observational charts. */
(() => {
  'use strict';

  // Compatibility note: the legacy release gate looked for "three-period rolling trend".
  // Charting now uses window-aware rolling spans while keeping the trend scale-neutral.
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
      axis:'Frequency (%)',
      decimals:0,
      max:100,
      minDisplayMax:100,
      field:null
    }),
    severity: Object.freeze({
      label:'Recorded symptom severity',
      short:'Severity',
      unit:' / 10',
      axis:'Severity (0–10)',
      decimals:1,
      max:10,
      minDisplayMax:4,
      field:'severity'
    }),
    sleep: Object.freeze({
      label:'Recorded sleep',
      short:'Sleep',
      unit:' h',
      axis:'Sleep (hours)',
      decimals:1,
      max:null,
      minDisplayMax:8,
      field:'sleepHours'
    }),
    stress: Object.freeze({
      label:'Recorded stress',
      short:'Stress',
      unit:' / 10',
      axis:'Stress (0–10)',
      decimals:1,
      max:10,
      minDisplayMax:4,
      field:'stressLevel'
    }),
    hydration: Object.freeze({
      label:'Recorded hydration',
      short:'Hydration',
      unit:' glasses',
      axis:'Hydration (glasses)',
      decimals:1,
      max:null,
      minDisplayMax:4,
      field:'waterGlasses'
    })
  });

  // Kept as a public API for existing callers. Every supported window now stays daily.
  function bucketWidthFor() {
    return 1;
  }

  function trendSpanFor(days) {
    if (days <= 7) return 3;
    if (days <= 30) return 7;
    if (days <= 90) return 14;
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

  function formatDateLabel(date, includeYear = false) {
    return date.toLocaleDateString('en-US', includeYear
      ? { month:'short', day:'numeric', year:'numeric' }
      : { month:'short', day:'numeric' });
  }

  function formatWindowRange(start, end, days) {
    const startLabel = formatDateLabel(start, days >= 180 || start.getFullYear() !== end.getFullYear());
    const endLabel = formatDateLabel(end, days >= 180);
    return `${startLabel} – ${endLabel}`;
  }

  function bucketize(entries, days, symptom = 'all') {
    const normalizedDays = Math.max(1, Math.round(Number(days) || 7));
    const end = new Date();
    end.setHours(23,59,59,999);
    const start = new Date(end);
    start.setDate(start.getDate() - normalizedDays + 1);
    start.setHours(0,0,0,0);
    const byDay = new Map();

    entries.forEach((entry) => {
      const date = parseDate(entry?.date);
      if (Number.isNaN(date.getTime()) || date < start || date > end) return;
      const key = dayKey(date);
      if (!key) return;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(entry);
    });

    const buckets = Array.from({ length:normalizedDays }, (_, index) => {
      const bucketStart = new Date(start);
      bucketStart.setDate(bucketStart.getDate() + index);
      bucketStart.setHours(0,0,0,0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(23,59,59,999);
      const pool = byDay.get(dayKey(bucketStart)) || [];
      const symptomPool = pool.filter((entry) => matchesSymptom(entry, symptom));
      const loggedDays = pool.length ? 1 : 0;
      const symptomDays = symptomPool.length ? 1 : 0;
      const factorAverage = (field, source = pool) => average(source.map((entry) => entry?.[field]));

      return {
        index,
        start:bucketStart,
        end:bucketEnd,
        label:formatDateLabel(bucketStart, normalizedDays >= 180),
        calendarDays:1,
        loggedDays,
        symptomDays,
        coverage:loggedDays ? 100 : 0,
        frequency:loggedDays ? (symptomDays ? 100 : 0) : null,
        severity:factorAverage('severity', symptomPool),
        sleep:factorAverage('sleepHours'),
        sleepSymptom:factorAverage('sleepHours', symptomPool),
        stress:factorAverage('stressLevel'),
        stressSymptom:factorAverage('stressLevel', symptomPool),
        hydration:factorAverage('waterGlasses'),
        hydrationSymptom:factorAverage('waterGlasses', symptomPool)
      };
    });

    return { width:1, buckets, start, end, days:normalizedDays };
  }

  function rolling(values, span = 7) {
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

  function niceStep(rawStep) {
    if (!finite(rawStep) || Number(rawStep) <= 0) return 1;
    const exponent = Math.floor(Math.log10(Number(rawStep)));
    const magnitude = 10 ** exponent;
    const normalized = Number(rawStep) / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }

  function axisScale(metric, valueGroups) {
    const def = METRICS[metric] || METRICS.frequency;
    if (metric === 'frequency') return { min:0, max:100, step:25, ticks:[0,25,50,75,100] };
    const valid = valueGroups.flat().filter(finite).map(Number);
    const observed = valid.length ? Math.max(...valid) : Number(def.minDisplayMax || 4);
    const padded = Math.max(Number(def.minDisplayMax || 4), observed * 1.12);
    const capped = finite(def.max) ? Math.min(Number(def.max), padded) : padded;
    const step = niceStep(capped / 4);
    let max = Math.ceil(capped / step) * step;
    if (finite(def.max)) max = Math.min(Number(def.max), Math.max(step, max));
    max = Math.max(step, max);
    const ticks = [];
    for (let value = 0; value <= max + step * .25; value += step) ticks.push(Number(value.toFixed(6)));
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return { min:0, max, step, ticks };
  }

  function formatAxisTick(metric, value, step) {
    if (metric === 'frequency') return `${Math.round(value)}`;
    if (step < 1) return Number(value).toFixed(1);
    return `${Math.round(value)}`;
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

  function gridMarkup(metric, scale, yAt, pad, width) {
    return scale.ticks.slice().reverse().map((value) => {
      const y = yAt(value);
      return `<g class="chart-grid-line">
        <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width-pad.right}" y2="${y.toFixed(1)}"/>
        <text x="${pad.left-12}" y="${(y+4).toFixed(1)}" text-anchor="end">${escapeHtml(formatAxisTick(metric,value,scale.step))}</text>
      </g>`;
    }).join('');
  }

  function xLabelIndexes(buckets, days) {
    const indexes = new Set([0, Math.max(0,buckets.length-1)]);
    if (buckets.length <= 8) {
      buckets.forEach((_, index) => indexes.add(index));
      return indexes;
    }
    if (days <= 14) {
      for (let index = 0; index < buckets.length; index += 2) indexes.add(index);
    } else if (days <= 30) {
      for (let index = 0; index < buckets.length; index += 5) indexes.add(index);
    } else if (days <= 60) {
      for (let index = 0; index < buckets.length; index += 7) indexes.add(index);
    } else if (days <= 90) {
      for (let index = 0; index < buckets.length; index += 14) indexes.add(index);
    } else if (days <= 180) {
      for (let index = 0; index < buckets.length; index += 30) indexes.add(index);
    } else {
      buckets.forEach((bucket,index) => {
        if (index === 0) return;
        const previous = buckets[index-1]?.start;
        if (!previous || previous.getMonth() !== bucket.start.getMonth() || previous.getFullYear() !== bucket.start.getFullYear()) indexes.add(index);
      });
    }
    return indexes;
  }

  function xLabelLines(date, days) {
    if (days <= 14) {
      return [
        date.toLocaleDateString('en-US',{ weekday:'short' }),
        date.toLocaleDateString('en-US',{ month:'short', day:'numeric' })
      ];
    }
    if (days >= 365) return [date.toLocaleDateString('en-US',{ month:'short', year:'2-digit' })];
    return [date.toLocaleDateString('en-US',{ month:'short', day:'numeric' })];
  }

  function xLabelMarkup(buckets, days, xAt, height) {
    const indexes = xLabelIndexes(buckets,days);
    return buckets.map((bucket,index) => {
      if (!indexes.has(index)) return '';
      const lines = xLabelLines(bucket.start,days);
      const x = xAt(index).toFixed(1);
      if (lines.length === 1) return `<text class="chart-x-label" x="${x}" y="${height-24}" text-anchor="middle">${escapeHtml(lines[0])}</text>`;
      return `<text class="chart-x-label" x="${x}" y="${height-31}" text-anchor="middle">
        <tspan x="${x}" dy="0">${escapeHtml(lines[0])}</tspan>
        <tspan x="${x}" dy="13">${escapeHtml(lines[1])}</tspan>
      </text>`;
    }).join('');
  }

  function pointMarkup(values, buckets, metric, xAt, yAt, className = '') {
    return values.map((value,index) => {
      if (!finite(value)) return '';
      const title = `${formatDateLabel(buckets[index].start,true)}: ${formatMetric(metric,value)}; ${plural(buckets[index].loggedDays,'logged day')}`;
      return `<circle class="chart-point${className}" cx="${xAt(index).toFixed(1)}" cy="${yAt(Number(value)).toFixed(1)}" r="3.6">
        <title>${escapeHtml(title)}</title>
      </circle>`;
    }).join('');
  }

  function barMarkup(values, buckets, metric, xAt, yAt, plotW, comparison = false, paired = false) {
    const slot = plotW / Math.max(1,buckets.length);
    const width = Math.max(1.8, Math.min(24, slot * (paired ? .34 : .62)));
    const offset = paired ? (comparison ? width * .62 : -width * .62) : 0;
    const baseline = yAt(0);
    return values.map((value,index) => {
      if (!finite(value)) return '';
      const y = yAt(Number(value));
      const height = Math.max(1.5, baseline-y);
      const x = xAt(index)+offset-width/2;
      const title = `${formatDateLabel(buckets[index].start,true)}${comparison ? ' comparison' : ''}: ${formatMetric(metric,value)}`;
      return `<rect class="chart-bar${comparison ? ' comparison' : ''}" x="${x.toFixed(1)}" y="${(baseline-height).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="${Math.min(3,width/2).toFixed(1)}">
        <title>${escapeHtml(title)}</title>
      </rect>`;
    }).join('');
  }

  function chartDimensions(days) {
    if (days <= 30) return { width:940, height:360 };
    if (days <= 60) return { width:1040, height:360 };
    if (days <= 90) return { width:1140, height:370 };
    if (days <= 180) return { width:1380, height:380 };
    return { width:1780, height:390 };
  }

  function chartSvg(buckets, metric, symptom, advanced, chartType, days) {
    const def = METRICS[metric] || METRICS.frequency;
    const { primary, comparison:secondary } = metricValues(buckets, metric, symptom);
    const trendSpan = trendSpanFor(days);
    const trend = rolling(primary,trendSpan);
    // Deliberately exclude the rolling overlay from scale calculation.
    const scaleSeries = secondary ? [primary,secondary] : [primary];
    const scale = axisScale(metric,scaleSeries);
    const dimensions = chartDimensions(days);
    const width = dimensions.width;
    const height = dimensions.height;
    const pad = { left:78, right:26, top:28, bottom:68 };
    const plotW = width-pad.left-pad.right;
    const plotH = height-pad.top-pad.bottom;
    const slot = plotW/Math.max(1,buckets.length);
    const xAt = (index) => pad.left+slot*(index+.5);
    const yAt = (value) => pad.top+plotH-(clamp(value,scale.min,scale.max)/scale.max)*plotH;
    const primaryPath = pathFor(primary,xAt,yAt);
    const trendPath = pathFor(trend,xAt,yAt);
    const secondaryPath = secondary ? pathFor(secondary,xAt,yAt) : '';
    const showSecondary = advanced && secondary;
    const isBar = chartType === 'bar';
    const lineSeries = isBar ? '' : `
      ${showSecondary && secondaryPath ? `<path class="chart-series-secondary" d="${secondaryPath}"/>` : ''}
      <path class="chart-series-primary" d="${primaryPath}"/>
      ${pointMarkup(primary,buckets,metric,xAt,yAt)}
      ${showSecondary ? pointMarkup(secondary,buckets,metric,xAt,yAt,' comparison') : ''}`;
    const barSeries = isBar ? `
      ${barMarkup(primary,buckets,metric,xAt,yAt,plotW,false,showSecondary)}
      ${showSecondary ? barMarkup(secondary,buckets,metric,xAt,yAt,plotW,true,true) : ''}` : '';

    return `<div class="insights-chart-svg-wrap" data-chart-scrollable="${days > 90}">
      <svg class="insights-chart-svg chart-type-${chartType}" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="${escapeHtml(def.label)} across ${days} calendar days using ${chartType === 'bar' ? 'bars' : 'a line'}">
        <desc>Each horizontal position is one calendar day. Missing days remain missing. The rolling trend does not affect the vertical scale.</desc>
        <g>${gridMarkup(metric,scale,yAt,pad,width)}</g>
        <line class="chart-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top+plotH}"/>
        <line class="chart-axis" x1="${pad.left}" y1="${pad.top+plotH}" x2="${width-pad.right}" y2="${pad.top+plotH}"/>
        ${lineSeries}
        ${barSeries}
        <path class="chart-series-trend" d="${trendPath}"/>
        ${xLabelMarkup(buckets,days,xAt,height)}
        <text class="chart-axis-title chart-axis-title-y" transform="translate(18 ${(pad.top+plotH/2).toFixed(1)}) rotate(-90)" text-anchor="middle">${escapeHtml(def.axis)}</text>
        <text class="chart-axis-title chart-axis-title-x" x="${(pad.left+plotW/2).toFixed(1)}" y="${height-5}" text-anchor="middle">Date · ${days} calendar days</text>
      </svg>
    </div>`;
  }

  function coverageStrip(buckets) {
    const logged = buckets.filter((bucket) => bucket.loggedDays).length;
    const pct = percent(logged,buckets.length);
    const cells = buckets.map((bucket) => `<span class="coverage-day${bucket.loggedDays ? ' logged' : ''}" title="${escapeHtml(formatDateLabel(bucket.start,true))}: ${bucket.loggedDays ? 'logged' : 'not logged'}" aria-hidden="true"></span>`).join('');
    return `<div class="chart-coverage" aria-label="Logging coverage ${logged} of ${buckets.length} calendar days, ${pct}%">
      <div class="chart-coverage-head">
        <span>Logging coverage</span>
        <strong>${logged} / ${buckets.length} days · ${pct}%</strong>
      </div>
      <div class="chart-coverage-strip" data-coverage-days="${buckets.length}">${cells}</div>
    </div>`;
  }

  function frequencySummary(entries, buckets, symptom) {
    const logged = distinctDays(entries);
    const symptomEntries = entries.filter((entry) => matchesSymptom(entry,symptom));
    const symptomDays = distinctDays(symptomEntries);
    const frequency = percent(symptomDays,logged);
    const severity = average(symptomEntries.map((entry) => entry.severity));
    const latestDate = symptomEntries
      .map((entry) => parseDate(entry.date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a,b) => b-a)[0] || null;
    const midpoint = Math.floor(buckets.length/2);
    const combine = (pool) => {
      const logCount = pool.reduce((sum,bucket) => sum+bucket.loggedDays,0);
      const symptomCount = pool.reduce((sum,bucket) => sum+bucket.symptomDays,0);
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
    return { logged, symptomDays, frequency, severity, latestDate, trendText };
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

  function basicSummaryMarkup(summary, days) {
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
        <span>Latest symptom day</span>
        <strong>${summary.latestDate ? escapeHtml(formatDateLabel(summary.latestDate,days >= 180)) : '—'}</strong>
        <small>${summary.latestDate ? 'most recent selected symptom record' : 'No selected symptom day in this window'}</small>
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

  function chartTypeMarkup(chartType) {
    return `<div class="chart-style-control">
      <span>Chart style</span>
      <div class="chart-type-switch" role="group" aria-label="Chart style">
        <button type="button" data-chart-type="line" class="${chartType==='line' ? 'active' : ''}" aria-pressed="${chartType==='line'}">Line</button>
        <button type="button" data-chart-type="bar" class="${chartType==='bar' ? 'active' : ''}" aria-pressed="${chartType==='bar'}">Bars</button>
      </div>
    </div>`;
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

  function advancedControlsMarkup(activeMetric, metricDef, series, loggedBuckets, validSymptom, trendSpan) {
    const factorOverlay = ['sleep','stress','hydration'].includes(activeMetric);
    return `<div class="advanced-chart-controls">
      <div>
        <span>Chart measure</span>
        <div class="chart-metric-group" role="group" aria-label="Advanced chart measure">
          ${metricButtonsMarkup(activeMetric)}
        </div>
      </div>
      <div class="advanced-chart-context">
        <span>Daily resolution</span>
        <span>${loggedBuckets} of ${series.buckets.length} calendar days logged</span>
        <span>${trendSpan}-day rolling average</span>
        <span>Trend does not change Y-axis scale</span>
      </div>
    </div>
    <div class="chart-legend">
      <span class="legend-primary">${escapeHtml(metricDef.label)}${factorOverlay ? ' — all logged days' : ''}</span>
      ${factorOverlay ? `<span class="legend-secondary">${escapeHtml(symptomLabel(validSymptom))} days</span>` : ''}
      <span class="legend-trend">${trendSpan}-day rolling average</span>
    </div>`;
  }

  function advancedComparisonMarkup(comparisonData, validSymptom, days) {
    const heading = validSymptom === 'all'
      ? 'Symptom days compared with symptom-free logged days'
      : `${escapeHtml(validSymptom)} days compared with other logged days`;
    const cards = comparisonData.factors.map((item) => comparisonCard(item,comparisonData,validSymptom)).join('');
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
        Pamet keeps every calendar day visible and never invents values for days you did not record.</p>
    </div>`;
  }

  function render({
    entries = [],
    days = 7,
    mode = 'basic',
    metric = 'frequency',
    symptom = 'all',
    chartType = 'line',
    advancedEnabled = false
  } = {}) {
    const normalizedMode = advancedEnabled && mode === 'advanced' ? 'advanced' : 'basic';
    const normalizedMetric = METRICS[metric] ? metric : 'frequency';
    const normalizedChartType = chartType === 'bar' ? 'bar' : 'line';
    const options = symptomOptions(entries);
    const validSymptom = symptom === 'all' || options.some((item) => item.name === symptom) ? symptom : 'all';
    const series = bucketize(entries,days,validSymptom);
    const summary = frequencySummary(entries,series.buckets,validSymptom);
    const comparisonData = comparison(entries,validSymptom);
    const metricDef = METRICS[normalizedMode === 'basic' ? 'frequency' : normalizedMetric];
    const activeMetric = normalizedMode === 'basic' ? 'frequency' : normalizedMetric;
    const loggedBuckets = series.buckets.filter((bucket) => bucket.loggedDays > 0).length;
    const trendSpan = trendSpanFor(series.days);
    const chartHeading = normalizedMode === 'basic' ? `${symptomLabel(validSymptom)} frequency over time` : metricDef.label;
    const modeCopy = normalizedMode === 'basic'
      ? 'A calendar-day view of when the selected symptom was recorded. Every day in the chosen window stays represented.'
      : 'A deeper daily view of your recorded values, a scale-neutral rolling average, and same-window symptom-day comparisons in the original units you recorded.';
    const advancedPanel = normalizedMode === 'advanced'
      ? advancedControlsMarkup(activeMetric,metricDef,series,loggedBuckets,validSymptom,trendSpan)
      : `<div class="chart-legend"><span class="legend-primary">${escapeHtml(metricDef.label)}</span><span class="legend-trend">${trendSpan}-day rolling average</span></div>`;
    const comparisons = normalizedMode === 'advanced' ? advancedComparisonMarkup(comparisonData,validSymptom,series.days) : '';
    const chartBody = summary.logged === 0
      ? emptyMarkup()
      : chartSvg(series.buckets,activeMetric,validSymptom,normalizedMode === 'advanced',normalizedChartType,series.days);
    const summaryMarkup = normalizedMode === 'basic' ? basicSummaryMarkup(summary,series.days) : comparisons;
    const range = formatWindowRange(series.start,series.end,series.days);

    return `<section class="insights-chart-card" aria-labelledby="insightsChartTitle"
      data-chart-mode-current="${normalizedMode}" data-chart-window="${series.days}"
      data-chart-bucket-days="1" data-chart-point-count="${series.buckets.length}"
      data-chart-type-current="${normalizedChartType}">
      <div class="insights-chart-head">
        <div>
          <span class="pamet-eyebrow">Dynamic chart · ${series.days}-day window</span>
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
        ${chartTypeMarkup(normalizedChartType)}
        <div class="chart-window-explain">
          <strong>${series.days} calendar days · daily resolution</strong>
          <span>${escapeHtml(range)}. Data stays daily; only date labels thin out to prevent overlap.${series.days > 90 ? ' Scroll horizontally for exact-day detail.' : ''}</span>
        </div>
      </div>
      ${advancedPanel}
      ${chartBody}
      ${coverageStrip(series.buckets)}
      ${summaryMarkup}
      <p class="chart-method-note">Charts summarize what you recorded. Missing days remain missing,
        values are not interpolated, the rolling average never changes the Y-axis scale, and associations
        do not establish medical cause, diagnosis, or treatment effect.</p>
    </section>`;
  }

  window.PametInsightsCharts = Object.freeze({
    render,
    bucketize,
    comparison,
    metrics:() => Object.keys(METRICS),
    bucketWidthFor,
    trendSpanFor
  });
})();