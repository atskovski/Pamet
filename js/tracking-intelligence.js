/* Pamet 1.6.6 — plan-aware logging UX, richer context capture, rewards, and Home observation glue. */
(() => {
  'use strict';

  const S = window.PametStore;
  const Analytics = window.PametAnalytics;
  if (!S) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  const CUSTOM_KEYS = Object.freeze({ symptoms: 'customSymptoms', moods: 'customMoods', activities: 'customActivities', meds: 'customMeds' });
  const CATEGORY_LABEL = Object.freeze({ symptoms: 'symptom', moods: 'mood', activities: 'activity', meds: 'medication' });
  const CATEGORY_PLURAL = Object.freeze({ symptoms: 'symptoms', moods: 'moods', activities: 'activities', meds: 'medications' });
  const CUSTOM_LIMITS = Object.freeze({
    free: Object.freeze({ symptoms: 3, moods: 3, activities: 3, meds: 0 }),
    pro: Object.freeze({ symptoms: 10, moods: 10, activities: 10, meds: 10 }),
    ultra: Object.freeze({ symptoms: Infinity, moods: Infinity, activities: Infinity, meds: Infinity })
  });

  const MEDICATION_OPTIONS = Object.freeze([
    'None',
    'Prescription medication',
    'Ibuprofen',
    'Acetaminophen',
    'Aspirin',
    'Antihistamine',
    'Decongestant',
    'Antacid / reflux medication',
    'Migraine medication',
    'Inhaler / respiratory medication',
    'Sleep aid',
    'Vitamin / supplement',
    'Topical medication'
  ]);

  const TIER_LEVELS = Object.freeze([
    { key: 'bronze', name: 'Bronze', minDays: 1, color: '#B8784E', icon: 'medal' },
    { key: 'silver', name: 'Silver', minDays: 7, color: '#8C9AA3', icon: 'medal' },
    { key: 'gold', name: 'Gold', minDays: 30, color: '#C9972F', icon: 'medal' },
    { key: 'platinum', name: 'Platinum', minDays: 90, color: '#7B929F', icon: 'shield' },
    { key: 'diamond', name: 'Diamond', minDays: 180, color: '#4D86A8', icon: 'diamond' },
    { key: 'beast', name: 'Beast', minDays: 365, color: '#7C5CBF', icon: 'flame' }
  ]);

  const mirror = { symptoms: new Set(), mood: '', activity: '', meds: new Set() };
  let contextState = { sleepQuality: null, caffeineServings: null, mealsSkipped: null, tags: new Set() };
  let flowObserver = null;
  let analyticsCardTimer = null;

  function currentPlan() {
    const value = String(S.settings?.plan || 'free');
    return ['free', 'pro', 'ultra'].includes(value) ? value : 'free';
  }

  function planName(key = currentPlan()) {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function customLimit(category, plan = currentPlan()) {
    return CUSTOM_LIMITS[plan]?.[category] ?? 0;
  }

  function customCount(category) {
    const key = CUSTOM_KEYS[category];
    return key ? (S.settings?.[key] || []).length : 0;
  }

  function canonicalItems(category) {
    if (category === 'symptoms') return [...(S.SYMPTOMS || [])];
    if (category === 'moods') return [...(S.MOODS || [])];
    if (category === 'activities') return [...(S.ACTIVITIES || [])];
    if (category === 'meds') return [...MEDICATION_OPTIONS];
    return [];
  }

  function installPlanPolicy() {
    S.CUSTOM_LIMITS_BY_PLAN = CUSTOM_LIMITS;
    S.MEDS = [...MEDICATION_OPTIONS];
    S.allMeds = () => [...MEDICATION_OPTIONS, ...(S.settings.customMeds || [])];
    S.customLimit = (category) => customLimit(category);
    S.customPolicy = (category) => ({
      plan: currentPlan(),
      limit: customLimit(category),
      used: customCount(category),
      remaining: Number.isFinite(customLimit(category)) ? Math.max(0, customLimit(category) - customCount(category)) : Infinity
    });
    S.addCustomField = (category, rawName) => {
      const key = CUSTOM_KEYS[category];
      if (!key) return false;
      const name = String(rawName || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!name) return false;
      const list = S.settings[key] || [];
      const normalized = name.toLocaleLowerCase();
      const duplicate = [...canonicalItems(category), ...list].some((item) => String(item).toLocaleLowerCase() === normalized);
      if (duplicate || list.length >= customLimit(category)) return false;
      list.push(name);
      S.settings[key] = list;
      S.persistSettings();
      return true;
    };
  }

  function tierFor(days) {
    let tier = null;
    TIER_LEVELS.forEach((candidate) => { if (days >= candidate.minDays) tier = candidate; });
    return tier;
  }

  function nextTierFor(days) {
    return TIER_LEVELS.find((candidate) => days < candidate.minDays) || null;
  }

  function installRewardsPolicy() {
    S.TIERS = [...TIER_LEVELS].reverse();
    S.tier = () => tierFor(S.totalDaysLogged());
    S.nextTier = () => nextTierFor(S.totalDaysLogged());
  }

  function helper(text, key) {
    const node = document.createElement('p');
    node.className = 'field-helper';
    if (key) node.dataset.logHelper = key;
    node.textContent = text;
    return node;
  }

  function ensureLogCopy() {
    const symptomCard = $('#addSymptomPlus')?.closest('.section-card');
    const symptomKicker = symptomCard?.querySelector('.section-kicker');
    if (symptomKicker) symptomKicker.textContent = 'What are you feeling?';
    if (symptomCard && !symptomCard.querySelector('[data-log-helper="symptoms"]')) {
      symptomCard.querySelector('.kicker-row')?.insertAdjacentElement('afterend', helper('Select all that apply. You can also choose “No symptoms today.”', 'symptoms'));
    }

    const severityCard = $('#severityRange')?.closest('.section-card');
    const severityKicker = severityCard?.querySelector('.section-kicker');
    if (severityKicker) severityKicker.textContent = 'How intense are your symptoms right now?';
    if (severityCard && !severityCard.querySelector('[data-log-helper="severity"]')) {
      severityKicker?.insertAdjacentElement('afterend', helper('Rate the overall intensity of the symptoms you selected. 0 means none; 10 means as severe as you can imagine.', 'severity'));
      const scale = severityCard.querySelector('.range-scale');
      if (scale?.children?.length >= 2) {
        scale.children[0].textContent = '0 — None';
        scale.children[1].textContent = '10 — Very severe';
      }
    }

    const contextCard = $('[data-field="sleepHours"]')?.closest('.section-card');
    const contextKicker = contextCard?.querySelector('.section-kicker');
    if (contextKicker) contextKicker.textContent = 'Context that may help Pamet compare days';
    if (contextCard && !contextCard.querySelector('[data-log-helper="context"]')) {
      contextKicker?.insertAdjacentElement('afterend', helper('Optional context helps Pamet compare your recorded days. It supports observations, not claims about medical cause.', 'context'));
    }

    const moodCard = $('#addMoodPlus')?.closest('.section-card');
    if (moodCard && !moodCard.querySelector('[data-log-helper="moods"]')) {
      moodCard.querySelector('.kicker-row')?.insertAdjacentElement('afterend', helper('Choose the closest match for this check-in.', 'moods'));
    }

    const activityCard = $('#addActivityPlus')?.closest('.section-card');
    if (activityCard && !activityCard.querySelector('[data-log-helper="activities"]')) {
      activityCard.querySelector('.kicker-row')?.insertAdjacentElement('afterend', helper('Choose the activity that best represents today.', 'activities'));
    }

    const medCard = $('#addMedPlus')?.closest('.section-card');
    if (medCard && !medCard.querySelector('[data-log-helper="meds"]')) {
      medCard.querySelector('.kicker-row')?.insertAdjacentElement('afterend', helper('Select all that apply. Pro and Ultra can save specific medication names as custom options.', 'meds'));
    }
  }

  function planCapText(category) {
    const plan = currentPlan();
    const limit = customLimit(category, plan);
    const used = customCount(category);
    if (!Number.isFinite(limit)) return `${planName(plan)} · Unlimited custom ${CATEGORY_PLURAL[category]}`;
    if (limit === 0) return `${planName(plan)} · Built-in ${CATEGORY_PLURAL[category]} only`;
    return `${planName(plan)} · ${used} of ${limit} custom ${CATEGORY_PLURAL[category]}`;
  }

  function refreshPlanCaps() {
    [['symptoms', '#addSymptomPlus'], ['moods', '#addMoodPlus'], ['activities', '#addActivityPlus'], ['meds', '#addMedPlus']].forEach(([category, selector]) => {
      const row = $(selector)?.closest('.section-card')?.querySelector('.kicker-row');
      if (!row) return;
      let cap = row.querySelector(`[data-plan-cap="${category}"]`);
      if (!cap) {
        cap = document.createElement('span');
        cap.className = 'field-plan-cap';
        cap.dataset.planCap = category;
        row.appendChild(cap);
      }
      cap.textContent = planCapText(category);
      const limit = customLimit(category);
      cap.classList.toggle('is-limit', Number.isFinite(limit) && customCount(category) >= limit);
    });
  }

  function ensurePlanDialog() {
    let dialog = $('#customFieldPlanDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'customFieldPlanDialog';
    dialog.className = 'custom-plan-dialog';
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    return dialog;
  }

  function showPlanDialog(category, atLimit = false) {
    const dialog = ensurePlanDialog();
    const plan = currentPlan();
    const limit = customLimit(category, plan);
    const used = customCount(category);
    const label = CATEGORY_LABEL[category];
    let title = `${planName(plan)} plan · Custom ${label}s`;
    let body = '';
    let canContinue = !atLimit && limit > used;

    if (plan === 'free' && category === 'meds') {
      title = 'Custom medication names are a paid feature';
      body = 'Free includes the built-in medication list. Pro lets you save up to 10 specific medication names, and Ultra removes the custom-field limit.';
      canContinue = false;
    } else if (atLimit && plan === 'free') {
      body = `You’ve reached the Free plan limit of ${limit} custom ${CATEGORY_PLURAL[category]}. You can keep using every built-in option. Compare plans if you want to add more custom ${CATEGORY_PLURAL[category]}.`;
      canContinue = false;
    } else if (atLimit && plan === 'pro') {
      body = `You’ve reached the Pro plan limit of ${limit} custom ${CATEGORY_PLURAL[category]}. Ultra includes unlimited custom ${CATEGORY_PLURAL[category]}.`;
      canContinue = false;
    } else if (!Number.isFinite(limit)) {
      body = `Your Ultra plan includes unlimited custom ${CATEGORY_PLURAL[category]}.`;
    } else {
      body = `Your ${planName(plan)} plan includes up to ${limit} custom ${CATEGORY_PLURAL[category]}. You’re currently using ${used} of ${limit}.`;
    }

    dialog.innerHTML = `<div class="custom-plan-dialog-shell"><p class="custom-plan-kicker">CURRENT PLAN</p><h3>${esc(title)}</h3><p>${esc(body)}</p><div class="custom-plan-actions"><button type="button" class="btn btn-ghost" data-custom-plan-compare>Compare plans</button>${canContinue ? '<button type="button" class="btn btn-primary" data-custom-plan-continue>Continue to add</button>' : '<button type="button" class="btn btn-primary" data-custom-plan-close>Got it</button>'}</div></div>`;
    dialog.querySelector('[data-custom-plan-compare]')?.addEventListener('click', () => { dialog.close(); window.PametPlanComparison?.open?.(plan); });
    dialog.querySelector('[data-custom-plan-close]')?.addEventListener('click', () => dialog.close());
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');

    return new Promise((resolve) => {
      const continueButton = dialog.querySelector('[data-custom-plan-continue]');
      if (!continueButton) { resolve(false); return; }
      let resolved = false;
      const finish = (value) => { if (resolved) return; resolved = true; resolve(value); };
      continueButton.addEventListener('click', () => { dialog.close(); finish(true); }, { once: true });
      dialog.addEventListener('close', () => finish(false), { once: true });
    });
  }

  function shouldExplain(category) {
    const key = `pamet_custom_plan_explained_${currentPlan()}_${category}`;
    try {
      if (sessionStorage.getItem(key) === '1') return false;
      sessionStorage.setItem(key, '1');
    } catch (_) { /* session storage is optional */ }
    return true;
  }

  async function interceptAddButton(event, category, target) {
    const limit = customLimit(category);
    const used = customCount(category);
    if (used >= limit) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      await showPlanDialog(category, true);
      return;
    }
    if (!shouldExplain(category)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const proceed = await showPlanDialog(category, false);
    if (proceed) {
      target.dataset.planBypass = '1';
      target.click();
    }
  }

  function wirePlanAwareAdders() {
    const mapping = { addSymptomPlus: 'symptoms', addMoodPlus: 'moods', addActivityPlus: 'activities', addMedPlus: 'meds', addSymptomBtn: 'symptoms' };
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('#addSymptomPlus,#addMoodPlus,#addActivityPlus,#addMedPlus,#addSymptomBtn');
      if (!target) return;
      const category = mapping[target.id];
      if (!category) return;
      if (target.dataset.planBypass === '1') { delete target.dataset.planBypass; return; }
      interceptAddButton(event, category, target);
    }, true);
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('#addSymptomPlus,#addMoodPlus,#addActivityPlus,#addMedPlus,#addSymptomBtn')) setTimeout(refreshPlanCaps, 0);
    });
  }

  function createChoiceGroup(title, key, options) {
    const group = document.createElement('div');
    group.className = 'optional-context-group';
    group.dataset.contextGroup = key;
    group.innerHTML = `<p class="optional-context-label">${esc(title)}</p><div class="optional-context-options">${options.map(([value, label]) => `<button type="button" class="context-choice" data-context-value="${esc(value)}">${esc(label)}</button>`).join('')}</div>`;
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-context-value]');
      if (!button) return;
      const selected = button.classList.contains('selected');
      group.querySelectorAll('[data-context-value]').forEach((item) => item.classList.remove('selected'));
      if (selected) contextState[key] = null;
      else {
        button.classList.add('selected');
        contextState[key] = Number(button.dataset.contextValue);
      }
    });
    return group;
  }

  function ensureExtraContext() {
    const card = $('[data-field="sleepHours"]')?.closest('.section-card');
    if (!card || $('#pametExtraContext', card)) return;
    const details = document.createElement('details');
    details.id = 'pametExtraContext';
    details.className = 'optional-context';
    details.innerHTML = '<summary>More optional context</summary><p class="field-helper">Add only what feels relevant. These details can improve comparisons later without making the check-in feel mandatory.</p>';
    details.appendChild(createChoiceGroup('Sleep quality', 'sleepQuality', [['3', 'Poor'], ['5', 'Fair'], ['8', 'Good'], ['10', 'Restful']]));
    details.appendChild(createChoiceGroup('Caffeine today', 'caffeineServings', [['0', 'None'], ['1', '1 serving'], ['2', '2 servings'], ['3', '3+ servings']]));
    details.appendChild(createChoiceGroup('Meals skipped', 'mealsSkipped', [['0', 'None'], ['1', '1 meal'], ['2', '2+ meals']]));

    const tags = document.createElement('div');
    tags.className = 'optional-context-group';
    tags.dataset.contextTags = '1';
    tags.innerHTML = '<p class="optional-context-label">Anything different about today?</p><div class="optional-context-options context-tags">' + [
      'Travel / routine change',
      'Long screen time',
      'Heat / outdoors',
      'Sick / recovering',
      'Busy / demanding day',
      'Rest / recovery day'
    ].map((label) => `<button type="button" class="context-choice" data-context-tag="${esc(label)}">${esc(label)}</button>`).join('') + '</div>';
    tags.addEventListener('click', (event) => {
      const button = event.target.closest('[data-context-tag]');
      if (!button) return;
      const label = button.dataset.contextTag;
      if (contextState.tags.has(label)) {
        contextState.tags.delete(label);
        button.classList.remove('selected');
      } else {
        contextState.tags.add(label);
        button.classList.add('selected');
      }
    });
    details.appendChild(tags);
    card.appendChild(details);
  }

  function ensureAutoSummary() {
    const notes = $('#notesInput');
    const card = notes?.closest('.section-card');
    if (!card || $('#autoSummarizeLog')) return;
    const kicker = card.querySelector('.section-kicker');
    if (!kicker) return;
    const row = document.createElement('div');
    row.className = 'kicker-row notes-kicker-row';
    kicker.replaceWith(row);
    row.appendChild(kicker);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-summary-btn';
    button.id = 'autoSummarizeLog';
    button.textContent = 'Auto-summarize';
    button.setAttribute('aria-label', 'Auto-summarize this check-in into the Notes field');
    row.appendChild(button);
    row.insertAdjacentElement('afterend', helper('Notes stay blank until you type or choose Auto-summarize. You can edit the generated wording before saving.', 'notes'));
    button.addEventListener('click', buildNoteSummary);
  }

  function selectedText(selector) {
    return $$(selector).filter((node) => node.classList.contains('selected')).map((node) => node.textContent.trim());
  }

  function sliderValue(field) {
    const range = $(`.range[data-field="${field}"]`);
    return range ? Number(range.value) : null;
  }

  function buildNoteText() {
    const symptoms = mirror.symptoms.size ? [...mirror.symptoms] : selectedText('#symptomGrid .sym-btn');
    const symptomFree = symptoms.includes('No symptoms today');
    const severity = Number($('#severityRange')?.value || 0);
    const mood = mirror.mood || selectedText('#moodFlow .chip')[0] || '';
    const activity = mirror.activity || selectedText('#activityFlow .chip')[0] || '';
    const meds = mirror.meds.size ? [...mirror.meds] : selectedText('#medFlow .chip').filter((item) => item !== 'None');
    const sentences = [];

    if (symptomFree) sentences.push('I recorded no symptoms today.');
    else if (symptoms.length) sentences.push(`I recorded ${symptoms.join(', ')} with an overall symptom intensity of ${severity}/10.`);
    else sentences.push(`I have not selected symptoms yet; the current symptom-intensity setting is ${severity}/10.`);

    const context = [];
    const sleep = sliderValue('sleepHours');
    const stress = sliderValue('stressLevel');
    const water = sliderValue('waterGlasses');
    const energy = sliderValue('energyLevel');
    if (sleep !== null) context.push(`${sleep} hours of sleep`);
    if (stress !== null) context.push(`stress ${stress}/10`);
    if (water !== null) context.push(`${water} glasses of water`);
    if (energy !== null) context.push(`energy ${energy}/10`);
    if (context.length) sentences.push(`Context recorded: ${context.join(', ')}.`);

    const extra = [];
    if (contextState.sleepQuality !== null) extra.push(`sleep quality ${contextState.sleepQuality}/10`);
    if (contextState.caffeineServings !== null) extra.push(`${contextState.caffeineServings >= 3 ? '3+' : contextState.caffeineServings} caffeine serving${contextState.caffeineServings === 1 ? '' : 's'}`);
    if (contextState.mealsSkipped !== null) extra.push(`${contextState.mealsSkipped >= 2 ? '2+' : contextState.mealsSkipped} meal${contextState.mealsSkipped === 1 ? '' : 's'} skipped`);
    if (contextState.tags.size) extra.push(...[...contextState.tags]);
    if (extra.length) sentences.push(`Additional context: ${extra.join(', ')}.`);

    if (mood) sentences.push(`Emotionally, I selected ${mood}.`);
    if (activity) sentences.push(`Physical activity: ${activity}.`);
    if (meds.length) sentences.push(`Medications recorded: ${meds.join(', ')}.`);
    else sentences.push('No medication was selected for this check-in.');
    return sentences.join(' ');
  }

  function buildNoteSummary() {
    const notes = $('#notesInput');
    if (!notes) return;
    if (notes.value.trim() && !window.confirm('Replace your current Notes text with an auto-summary of this check-in?')) return;
    notes.value = buildNoteText();
    notes.dispatchEvent(new Event('input', { bubbles: true }));
    notes.focus();
  }

  function resetExtraContext() {
    contextState = { sleepQuality: null, caffeineServings: null, mealsSkipped: null, tags: new Set() };
    $$('#pametExtraContext .context-choice.selected').forEach((button) => button.classList.remove('selected'));
    const details = $('#pametExtraContext');
    if (details) details.open = false;
    mirror.symptoms.clear();
    mirror.mood = '';
    mirror.activity = '';
    mirror.meds.clear();
  }

  function captureExtraContext(event) {
    const entry = event.detail?.entry;
    if (!entry) return;
    entry.context = {
      sleepQuality: contextState.sleepQuality,
      caffeineServings: contextState.caffeineServings,
      mealsSkipped: contextState.mealsSkipped,
      tags: [...contextState.tags]
    };
    entry.schemaVersion = 2;
    S.persistEntries();
    queueMicrotask(resetExtraContext);
  }

  function mirrorLogSelections() {
    document.addEventListener('click', (event) => {
      const symptom = event.target?.closest?.('#symptomGrid .sym-btn');
      if (symptom) {
        const label = symptom.textContent.trim();
        if (label === 'No symptoms today') {
          mirror.symptoms.clear();
          mirror.symptoms.add(label);
        } else {
          mirror.symptoms.delete('No symptoms today');
          if (mirror.symptoms.has(label)) mirror.symptoms.delete(label);
          else mirror.symptoms.add(label);
        }
      }
      const mood = event.target?.closest?.('#moodFlow .chip');
      if (mood) mirror.mood = mood.classList.contains('selected') ? mood.textContent.trim() : '';
      const activity = event.target?.closest?.('#activityFlow .chip');
      if (activity) mirror.activity = activity.classList.contains('selected') ? activity.textContent.trim() : '';
      const med = event.target?.closest?.('#medFlow .chip');
      if (med) {
        const label = med.textContent.trim();
        if (label === 'None') mirror.meds.clear();
        else if (med.classList.contains('selected')) mirror.meds.add(label);
        else mirror.meds.delete(label);
      }
    });

    const reapply = () => {
      $$('#moodFlow .chip').forEach((chip) => chip.classList.toggle('selected', mirror.mood === chip.textContent.trim()));
      $$('#activityFlow .chip').forEach((chip) => chip.classList.toggle('selected', mirror.activity === chip.textContent.trim()));
      $$('#medFlow .chip').forEach((chip) => chip.classList.toggle('selected', mirror.meds.has(chip.textContent.trim())));
    };
    const host = $('#logBackdrop');
    if (host && !flowObserver) {
      flowObserver = new MutationObserver(() => queueMicrotask(reapply));
      flowObserver.observe(host, { childList: true, subtree: true });
    }
  }

  function rewardIcon(tier) {
    if (tier.icon === 'diamond') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8l3-4h8l3 4-7 12zM5 8h14M8 4l4 16 4-16"/></svg>';
    if (tier.icon === 'flame') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2c1 4-3 5-3 9 0 2 1 3 2 4-1-4 4-5 4-9 3 3 4 6 3 9a7 7 0 1 1-13-5c0 3 2 4 3 4-1-5 2-8 4-12z"/></svg>';
    if (tier.icon === 'shield') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-5"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/></svg>';
  }

  function ensureRewards() {
    const streak = $('#streakCard');
    if (!streak) return null;
    let rewards = $('#homeRewards', streak);
    if (!rewards) {
      rewards = document.createElement('div');
      rewards.id = 'homeRewards';
      rewards.className = 'home-rewards';
      streak.appendChild(rewards);
    }
    return rewards;
  }

  function renderRewards() {
    const rewards = ensureRewards();
    if (!rewards) return;
    const days = S.totalDaysLogged();
    const current = tierFor(days);
    const next = nextTierFor(days);
    const status = current ? `${current.name} · ${days} day${days === 1 ? '' : 's'} logged` : 'Start with Bronze';
    const daysToNext = next ? Math.max(1, next.minDays - days) : 0;
    const progress = next ? `${daysToNext} day${daysToNext === 1 ? '' : 's'} to ${next.name}` : 'Top tier reached';
    const markup = `<div class="home-rewards-copy"><strong>${esc(status)}</strong><span>${esc(current ? progress : 'Log your first day to earn Bronze.')}</span></div><div class="home-reward-levels" aria-label="Pamet logging rewards">${TIER_LEVELS.map((tier) => `<span class="home-reward-level tier-${tier.key}${days >= tier.minDays ? ' earned' : ''}" title="${esc(tier.name)} · ${tier.minDays}+ logged days"><span class="home-reward-icon">${rewardIcon(tier)}</span><span>${esc(tier.name)}</span></span>`).join('')}</div>`;
    if (rewards.innerHTML !== markup) rewards.innerHTML = markup;
  }

  function renderHomeObservation() {
    const banner = $('#insightBanner');
    const text = $('#insightText');
    if (!banner || !text) return;
    if (S.settings.showInsight === false || !S.entries.length) {
      banner.hidden = true;
      return;
    }
    const result = Analytics?.analyze?.([...S.entries], { days: 30, plan: currentPlan() }) || S.analytics?.(30);
    const observation = result?.topObservation;
    const kicker = $('.insight-kicker', banner);
    if (kicker) kicker.textContent = 'PAMET OBSERVATION — BASED ON YOUR LOGS';
    if (observation) text.textContent = observation.summary;
    else {
      const days = result?.loggedDays || S.totalDaysLogged();
      text.textContent = `${days} logged day${days === 1 ? '' : 's'} recorded. Keep including ordinary days as well as symptom days so Pamet can compare changes more reliably.`;
    }
    banner.hidden = false;
  }

  function homeSync() {
    ensureLogCopy();
    ensureExtraContext();
    ensureAutoSummary();
    refreshPlanCaps();
    renderRewards();
    renderHomeObservation();
  }

  function renderAnalyticsSummary() {
    clearTimeout(analyticsCardTimer);
    analyticsCardTimer = setTimeout(() => {
      const screen = $('#screen-patterns');
      const host = screen?.querySelector('.content-col');
      if (!host) return;
      const result = Analytics?.analyze?.([...S.entries], { days: 90, plan: currentPlan() });
      if (!result) return;
      let card = $('#pametAnalysisQuality', host);
      if (!card) {
        card = document.createElement('details');
        card.id = 'pametAnalysisQuality';
        card.className = 'analysis-quality-card';
        const title = host.querySelector('.screen-title');
        if (title) title.insertAdjacentElement('afterend', card);
        else host.prepend(card);
      }
      const tips = [];
      if (result.completeness.notes < 35) tips.push('Add notes when timing or circumstances matter.');
      if (result.completeness.extraContext < 35) tips.push('Use optional context occasionally when a day is different from usual.');
      if (result.loggedDays < 7) tips.push('Include ordinary days, not only difficult symptom days.');
      if (!tips.length) tips.push('Your entries are detailed enough for broader comparisons; keep logging consistently.');
      card.innerHTML = `<summary><span>Analysis quality</span><strong>${esc(result.readiness)}</strong></summary><div class="analysis-quality-body"><div class="analysis-quality-stats"><span><strong>${result.loggedDays}</strong> logged days</span><span><strong>${result.completeness.overall}%</strong> field coverage</span><span><strong>${result.observations.length}</strong> surfaced observations</span></div><p>${esc(result.readinessDetail)}</p><p class="analysis-quality-tip">${esc(tips[0])}</p><p class="analysis-quality-disclaimer">Pamet compares what you recorded. It does not diagnose, predict disease, or determine why a change happened.</p></div>`;
    }, 60);
  }

  function installEvents() {
    window.addEventListener('pamet:entry-saved', (event) => {
      captureExtraContext(event);
      setTimeout(() => { homeSync(); renderAnalyticsSummary(); }, 0);
    });
    window.addEventListener('pamet:home-synced', () => setTimeout(homeSync, 0));
    window.addEventListener('pamet:login', () => setTimeout(homeSync, 0));
    window.addEventListener('pamet:registered', () => setTimeout(homeSync, 0));
    window.addEventListener('pamet:profile-updated', () => setTimeout(() => { homeSync(); renderAnalyticsSummary(); }, 0));
    window.addEventListener('pageshow', () => setTimeout(homeSync, 0));
    window.addEventListener('storage', () => setTimeout(homeSync, 0));
    document.addEventListener('pamet:settings-rendered', () => setTimeout(homeSync, 0));
    document.addEventListener('change', (event) => {
      if (event.target?.matches?.('#setShowInsight,#setShowStreak')) {
        queueMicrotask(homeSync);
        requestAnimationFrame(homeSync);
        setTimeout(homeSync, 80);
      }
    });
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-tab="home"]')) setTimeout(homeSync, 0);
      if (event.target?.closest?.('[data-tab="patterns"],[data-nav="patterns"]')) renderAnalyticsSummary();
    }, true);
  }

  installPlanPolicy();
  installRewardsPolicy();
  wirePlanAwareAdders();
  mirrorLogSelections();
  installEvents();
  homeSync();
})();
