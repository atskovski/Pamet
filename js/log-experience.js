/* Pamet log experience — plan-aware custom fields, richer context, summaries, and logging milestones. */
(() => {
  'use strict';

  const S = window.PametStore;
  const Engine = window.PametObservationEngine;
  if (!S || !Engine) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const CATEGORY = Object.freeze({
    symptoms: Object.freeze({ add: '#addSymptomPlus', settingsAdd: '#addSymptomBtn', singular: 'symptom', plural: 'symptoms' }),
    moods: Object.freeze({ add: '#addMoodPlus', singular: 'mood', plural: 'moods' }),
    activities: Object.freeze({ add: '#addActivityPlus', singular: 'activity', plural: 'activities' }),
    meds: Object.freeze({ add: '#addMedPlus', singular: 'medication', plural: 'medications' })
  });

  const CONTEXT_TAGS = Object.freeze([
    'Skipped meal',
    'More caffeine',
    'Alcohol',
    'Travel / schedule change',
    'Weather change',
    'Allergy / irritant exposure',
    'Hormonal change',
    'Unusual routine'
  ]);

  const state = {
    bypassCustomIntercept: false,
    symptomOnset: '',
    sleepQuality: '',
    contextTags: new Set()
  };

  const MEDAL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"></circle><path d="M12 6.5v5M9.5 9h5"></path><path d="M8.5 14.5 7 21l5-3 5 3-1.5-6.5"></path></svg>';

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function comparePlans() {
    const plan = S.settings?.plan || 'free';
    if (window.PametPlanComparison?.open) window.PametPlanComparison.open(plan);
    else $('#upgradeBtn')?.click();
  }

  function closeDialog() {
    $('#pametLogPlanDialog')?.remove();
  }

  function planUsageText(policy, config) {
    if (policy.plan === 'free' && policy.category === 'meds') {
      return 'Free plan · Standard medication categories are included. Specific medication names are available with Pro and Ultra.';
    }
    if (policy.unlimited) return `${policy.planName} plan · Unlimited custom ${config.plural}.`;
    return `${policy.planName} plan · ${policy.count} of ${policy.limit} custom ${config.plural} used.`;
  }

  function limitDialogCopy(category, policy) {
    const config = CATEGORY[category];
    if (category === 'meds' && policy.plan === 'free') {
      return {
        title: 'Add specific medications with Pro or Ultra',
        body: 'Free includes the standard medication categories. Pro and Ultra let you add specific prescription names, over-the-counter medicines, vitamins, or supplements that are useful in your own journal.'
      };
    }
    if (policy.plan === 'pro') {
      return {
        title: `You’ve reached the Pro limit for custom ${config.plural}`,
        body: `Pro includes up to ${policy.limit} custom ${config.plural}. Your existing choices stay available. Ultra removes the custom-field limit if you need a larger personal list.`
      };
    }
    return {
      title: `You’ve reached the Free limit for custom ${config.plural}`,
      body: `Free includes up to ${policy.limit} custom ${config.plural}. Your existing choices stay available. Compare plans if you need more custom tracking options.`
    };
  }

  function showLimitDialog(category) {
    closeDialog();
    const policy = S.customFieldPolicy(category);
    const copy = limitDialogCopy(category, policy);
    const root = document.createElement('div');
    root.id = 'pametLogPlanDialog';
    root.className = 'pamet-log-dialog-backdrop';
    root.innerHTML = `<section class="pamet-log-dialog" role="dialog" aria-modal="true" aria-labelledby="pametLogPlanTitle">
      <div class="pamet-log-dialog-head"><div><p class="pamet-log-dialog-kicker">${escapeHtml(policy.planName)} PLAN</p><h3 id="pametLogPlanTitle">${escapeHtml(copy.title)}</h3></div><button type="button" class="pamet-log-dialog-close" data-log-dialog-close aria-label="Close">×</button></div>
      <p>${escapeHtml(copy.body)}</p>
      <div class="pamet-log-dialog-actions"><button type="button" class="btn btn-primary" data-log-compare-plans>Compare plans</button><button type="button" class="btn btn-ghost" data-log-dialog-close>Not now</button></div>
    </section>`;
    document.body.appendChild(root);
    root.querySelectorAll('[data-log-dialog-close]').forEach((button) => button.addEventListener('click', closeDialog));
    root.querySelector('[data-log-compare-plans]')?.addEventListener('click', () => { closeDialog(); comparePlans(); });
    root.addEventListener('click', (event) => { if (event.target === root) closeDialog(); });
    root.querySelector('[data-log-compare-plans]')?.focus();
  }

  function submitThroughExistingHandler(category, value) {
    const config = CATEGORY[category];
    const addButton = $(config.add);
    if (!addButton) return;
    const originalPrompt = window.prompt;
    state.bypassCustomIntercept = true;
    try {
      window.prompt = () => value;
      addButton.click();
    } finally {
      window.prompt = originalPrompt;
      state.bypassCustomIntercept = false;
    }
    queueMicrotask(renderPlanHints);
  }

  function showAddDialog(category) {
    const policy = S.customFieldPolicy(category);
    if (!policy.canAdd) {
      showLimitDialog(category);
      return;
    }

    closeDialog();
    const config = CATEGORY[category];
    const root = document.createElement('div');
    root.id = 'pametLogPlanDialog';
    root.className = 'pamet-log-dialog-backdrop';
    root.innerHTML = `<section class="pamet-log-dialog" role="dialog" aria-modal="true" aria-labelledby="pametLogAddTitle">
      <div class="pamet-log-dialog-head"><div><p class="pamet-log-dialog-kicker">${escapeHtml(policy.planName)} PLAN</p><h3 id="pametLogAddTitle">Add a custom ${escapeHtml(config.singular)}</h3></div><button type="button" class="pamet-log-dialog-close" data-log-dialog-close aria-label="Close">×</button></div>
      <p>${escapeHtml(planUsageText(policy, config))}</p>
      <label class="pamet-log-dialog-field"><span>${escapeHtml(config.singular[0].toUpperCase() + config.singular.slice(1))} name</span><input type="text" maxlength="80" autocomplete="off" data-log-custom-input /></label>
      <p class="pamet-log-dialog-help">Keep the label short and recognizable so it stays useful in trends and Visit Briefs.</p>
      <div class="pamet-log-dialog-actions"><button type="button" class="btn btn-primary" data-log-custom-save>Add ${escapeHtml(config.singular)}</button><button type="button" class="btn btn-ghost" data-log-dialog-close>Cancel</button></div>
    </section>`;
    document.body.appendChild(root);
    const input = root.querySelector('[data-log-custom-input]');
    const save = () => {
      const value = String(input?.value || '').trim();
      if (!value) { input?.focus(); return; }
      closeDialog();
      submitThroughExistingHandler(category, value);
    };
    root.querySelectorAll('[data-log-dialog-close]').forEach((button) => button.addEventListener('click', closeDialog));
    root.querySelector('[data-log-custom-save]')?.addEventListener('click', save);
    input?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } });
    root.addEventListener('click', (event) => { if (event.target === root) closeDialog(); });
    input?.focus();
  }

  function categoryFromButton(button) {
    return Object.entries(CATEGORY).find(([, config]) => button.matches(config.add) || (config.settingsAdd && button.matches(config.settingsAdd)))?.[0] || null;
  }

  function interceptCustomAdds(event) {
    if (state.bypassCustomIntercept) return;
    const button = event.target?.closest?.('#addSymptomPlus,#addMoodPlus,#addActivityPlus,#addMedPlus,#addSymptomBtn');
    if (!button) return;
    const category = categoryFromButton(button);
    if (!category) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showAddDialog(category);
  }

  function ensureHelper(section, key, text) {
    if (!section || section.querySelector(`[data-log-helper="${key}"]`)) return;
    const helper = document.createElement('p');
    helper.className = 'log-field-helper';
    helper.dataset.logHelper = key;
    helper.textContent = text;
    const row = section.querySelector('.kicker-row');
    const kicker = section.querySelector('.section-kicker');
    (row || kicker)?.insertAdjacentElement('afterend', helper);
  }

  function findSectionByKicker(text) {
    return $$('.sheet-scroll .section-card').find((section) => section.querySelector('.section-kicker')?.textContent.trim() === text) || null;
  }

  function enhanceLabels() {
    const symptoms = $('#addSymptomPlus')?.closest('.section-card');
    ensureHelper(symptoms, 'symptoms', 'Select all that apply. Choose “No symptoms today” when you are logging an ordinary day.');

    const severity = findSectionByKicker('Overall severity') || findSectionByKicker('How intense are your symptoms overall?');
    const severityKicker = severity?.querySelector('.section-kicker');
    if (severityKicker) severityKicker.textContent = 'How intense are your symptoms overall?';
    ensureHelper(severity, 'severity', 'Rate the overall intensity of the symptoms you selected, from 0 (none) to 10 (very severe).');
    const scale = severity?.querySelectorAll('.range-scale span');
    if (scale?.[0]) scale[0].textContent = 'None';
    if (scale?.[1]) scale[1].textContent = 'Very severe';

    const context = findSectionByKicker('Context — helps Pamet find patterns') || findSectionByKicker('Context that may help Pamet compare days');
    const contextKicker = context?.querySelector('.section-kicker');
    if (contextKicker) contextKicker.textContent = 'Context that may help Pamet compare days';
    ensureHelper(context, 'context', 'These details help Pamet compare similar days and look for repeated changes over time.');

    const moods = $('#addMoodPlus')?.closest('.section-card');
    ensureHelper(moods, 'moods', 'Choose the option that best matches how you feel right now.');

    const activities = $('#addActivityPlus')?.closest('.section-card');
    ensureHelper(activities, 'activities', 'Choose the main activity that best describes your day.');

    const meds = $('#addMedPlus')?.closest('.section-card');
    ensureHelper(meds, 'meds', 'Select all that apply. Pro and Ultra can also add specific prescription, over-the-counter, vitamin, or supplement names.');
  }

  function planHintFor(category) {
    const config = CATEGORY[category];
    const button = $(config.add);
    const section = button?.closest('.section-card');
    if (!section) return null;
    let hint = section.querySelector(`[data-plan-limit="${category}"]`);
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'plan-limit-row';
      hint.dataset.planLimit = category;
      const helper = section.querySelector(`[data-log-helper="${category}"]`);
      (helper || section.querySelector('.kicker-row'))?.insertAdjacentElement('afterend', hint);
    }
    return hint;
  }

  function renderPlanHints() {
    Object.entries(CATEGORY).forEach(([category, config]) => {
      const hint = planHintFor(category);
      if (!hint) return;
      const policy = S.customFieldPolicy(category);
      hint.replaceChildren();
      const text = document.createElement('span');
      text.className = `plan-limit-text${policy.canAdd ? '' : ' is-limit'}`;
      text.textContent = planUsageText(policy, config);
      hint.appendChild(text);
      if (!policy.canAdd) {
        const compare = document.createElement('button');
        compare.type = 'button';
        compare.className = 'plan-limit-compare';
        compare.textContent = 'Compare plans';
        compare.addEventListener('click', comparePlans);
        hint.appendChild(compare);
      }
    });
  }

  function createChoiceButton(group, value, mode) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-choice';
    button.dataset.contextValue = value;
    button.dataset.contextMode = mode;
    button.textContent = value;
    group.appendChild(button);
    return button;
  }

  function ensureStructuredContext() {
    if ($('#pametStructuredContext')) return;
    const contextSection = findSectionByKicker('Context that may help Pamet compare days') || findSectionByKicker('Context — helps Pamet find patterns');
    if (!contextSection) return;
    const block = document.createElement('div');
    block.id = 'pametStructuredContext';
    block.className = 'structured-context';

    const intro = document.createElement('p');
    intro.className = 'structured-context-intro';
    intro.textContent = 'Optional details below add useful comparison points without making the log feel like a questionnaire.';
    block.appendChild(intro);

    const sleepGroup = document.createElement('div');
    sleepGroup.className = 'context-mini-group';
    sleepGroup.innerHTML = '<p class="context-mini-label">Sleep quality last night <span>optional</span></p><div class="context-choice-row" data-context-group="sleepQuality"></div>';
    block.appendChild(sleepGroup);
    const sleepChoices = sleepGroup.querySelector('[data-context-group="sleepQuality"]');
    ['Restful', 'Okay', 'Poor'].forEach((value) => createChoiceButton(sleepChoices, value, 'sleepQuality'));

    const onsetGroup = document.createElement('div');
    onsetGroup.className = 'context-mini-group';
    onsetGroup.innerHTML = '<p class="context-mini-label">When did the symptoms start? <span>optional</span></p><div class="context-choice-row" data-context-group="symptomOnset"></div>';
    block.appendChild(onsetGroup);
    const onsetChoices = onsetGroup.querySelector('[data-context-group="symptomOnset"]');
    ['Morning', 'Afternoon', 'Evening', 'Overnight', 'Not sure'].forEach((value) => createChoiceButton(onsetChoices, value, 'symptomOnset'));

    const tagsGroup = document.createElement('div');
    tagsGroup.className = 'context-mini-group';
    tagsGroup.innerHTML = '<p class="context-mini-label">Anything unusual today? <span>select any that apply</span></p><div class="context-choice-row" data-context-group="tags"></div>';
    block.appendChild(tagsGroup);
    const tagChoices = tagsGroup.querySelector('[data-context-group="tags"]');
    CONTEXT_TAGS.forEach((value) => createChoiceButton(tagChoices, value, 'tag'));

    contextSection.appendChild(block);
  }

  function chooseContext(event) {
    const button = event.target?.closest?.('.context-choice[data-context-mode]');
    if (!button) return;
    const value = button.dataset.contextValue || '';
    const mode = button.dataset.contextMode;
    if (mode === 'tag') {
      if (state.contextTags.has(value)) state.contextTags.delete(value);
      else state.contextTags.add(value);
      button.classList.toggle('selected', state.contextTags.has(value));
      return;
    }
    const key = mode === 'sleepQuality' ? 'sleepQuality' : 'symptomOnset';
    const group = button.closest('.context-choice-row');
    const selected = state[key] === value;
    state[key] = selected ? '' : value;
    $$('.context-choice', group).forEach((choice) => choice.classList.toggle('selected', !selected && choice === button));
  }

  function selectedTexts(selector) {
    return $$(selector).map((element) => element.textContent.trim()).filter(Boolean);
  }

  function autoSummaryText() {
    const symptomSelections = selectedTexts('#symptomGrid .sym-btn.selected');
    const symptomFree = symptomSelections.includes('No symptoms today');
    const symptoms = symptomSelections.filter((value) => value !== 'No symptoms today');
    const severity = Number($('#severityRange')?.value || 0);
    const sleep = Number($('[data-field="sleepHours"]')?.value || 0);
    const stress = Number($('[data-field="stressLevel"]')?.value || 0);
    const water = Number($('[data-field="waterGlasses"]')?.value || 0);
    const energy = Number($('[data-field="energyLevel"]')?.value || 0);
    const mood = selectedTexts('#moodFlow .chip.selected')[0] || '';
    const activity = selectedTexts('#activityFlow .chip.selected')[0] || '';
    const meds = selectedTexts('#medFlow .chip.selected').filter((value) => value !== 'None');

    const parts = [];
    if (symptomFree) parts.push('Today I logged no symptoms.');
    else if (symptoms.length) parts.push(`Today I logged ${symptoms.join(', ')}, with overall intensity ${Math.round(severity)}/10.`);
    else parts.push('I have not selected symptoms yet.');

    parts.push(`Context: ${sleep} hours of sleep, stress ${stress}/10, ${water} glasses of water, and energy ${energy}/10.`);
    if (state.sleepQuality) parts.push(`Sleep quality was ${state.sleepQuality.toLowerCase()}.`);
    if (state.symptomOnset && !symptomFree) parts.push(`Symptoms started: ${state.symptomOnset.toLowerCase()}.`);
    if (mood) parts.push(`Emotionally I felt ${mood}.`);
    if (activity) parts.push(`My main activity was ${activity}.`);
    if (meds.length) parts.push(`Medications or supplements recorded: ${meds.join(', ')}.`);
    else parts.push('No medication was selected.');
    if (state.contextTags.size) parts.push(`Other context: ${[...state.contextTags].join(', ')}.`);
    return parts.join(' ');
  }

  function ensureAutoSummary() {
    const notes = $('#notesInput');
    const section = notes?.closest('.section-card');
    const kicker = section?.querySelector('.section-kicker');
    if (!notes || !section || !kicker) return;

    let row = kicker.parentElement;
    if (!row?.classList.contains('kicker-row')) {
      row = document.createElement('div');
      row.className = 'kicker-row';
      kicker.replaceWith(row);
      row.appendChild(kicker);
    }

    if (!$('#pametAutoSummary')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'pametAutoSummary';
      button.className = 'log-auto-summary';
      button.textContent = 'Auto-summarize';
      button.setAttribute('aria-label', 'Auto-summarize the selections in this log into notes');
      row.appendChild(button);
      button.addEventListener('click', () => {
        const summary = autoSummaryText();
        const existing = notes.value.trim();
        if (existing && notes.dataset.pametAutoSummary !== 'true') notes.value = `${summary}\n\nAdditional notes: ${existing}`;
        else notes.value = summary;
        notes.dataset.pametAutoSummary = 'true';
        notes.dispatchEvent(new Event('input', { bubbles: true }));
        notes.focus();
      });
      notes.addEventListener('input', (event) => { if (event.isTrusted) delete notes.dataset.pametAutoSummary; });
    }
  }

  function ensureRewardCard() {
    let card = $('#pametRewardCard');
    if (card) return card;
    const anchor = $('#streakCard') || $('#homeEmptyState');
    if (!anchor) return null;
    card = document.createElement('section');
    card.id = 'pametRewardCard';
    card.className = 'logging-milestone-card';
    card.setAttribute('aria-labelledby', 'pametRewardTitle');
    card.innerHTML = `<div class="logging-milestone-head"><div><p class="home-dashboard-kicker">LOGGING MILESTONES</p><h2 id="pametRewardTitle"><span id="pametRewardDays">0</span> days logged</h2><p>Each unique day you log adds context to your health history.</p></div><div class="logging-current-tier" id="pametCurrentTier"></div></div>
      <div class="logging-progress-wrap"><progress id="pametTierProgress" max="1" value="0" aria-label="Progress to next logging milestone"></progress><span id="pametTierProgressText">Bronze begins with your first logged day.</span></div>
      <div class="logging-tier-row" id="pametTierRow" aria-label="Logging milestone tiers"></div>`;
    anchor.insertAdjacentElement('afterend', card);
    const row = $('#pametTierRow', card);
    Engine.tiers.forEach((tier) => {
      const item = document.createElement('div');
      item.className = `logging-tier tier-${tier.key}`;
      item.dataset.tierKey = tier.key;
      item.innerHTML = `<span class="logging-tier-icon">${MEDAL_ICON}</span><span><strong>${escapeHtml(tier.name)}</strong><small>${tier.minDays} day${tier.minDays === 1 ? '' : 's'}</small></span>`;
      row.appendChild(item);
    });
    return card;
  }

  function renderRewards() {
    const card = ensureRewardCard();
    if (!card) return;
    const days = Engine.totalDaysLogged(S._entries || S.entries || []);
    const tier = Engine.tierFor(days);
    const next = Engine.nextTier(days);
    $('#pametRewardDays', card).textContent = String(days);

    const current = $('#pametCurrentTier', card);
    current.replaceChildren();
    const badge = document.createElement('span');
    badge.className = `logging-current-badge ${tier ? `tier-${tier.key}` : 'tier-start'}`;
    badge.innerHTML = `<span class="logging-tier-icon">${MEDAL_ICON}</span><span>${tier ? escapeHtml(tier.name) : 'Start'}</span>`;
    current.appendChild(badge);

    const progress = $('#pametTierProgress', card);
    const progressText = $('#pametTierProgressText', card);
    if (next) {
      progress.max = next.minDays;
      progress.value = Math.min(days, next.minDays);
      const remaining = next.minDays - days;
      progressText.textContent = days === 0 ? 'Bronze begins with your first logged day.' : `${remaining} more logged day${remaining === 1 ? '' : 's'} to ${next.name}.`;
    } else {
      progress.max = Engine.tiers[Engine.tiers.length - 1].minDays;
      progress.value = progress.max;
      progressText.textContent = 'Beast is the top logging milestone. Keep logging when it is useful to you.';
    }

    $$('.logging-tier', card).forEach((item) => {
      const target = Engine.tiers.find((candidate) => candidate.key === item.dataset.tierKey);
      item.classList.toggle('is-earned', !!target && days >= target.minDays);
      item.classList.toggle('is-current', !!tier && item.dataset.tierKey === tier.key);
    });
  }

  function renderHomeObservation() {
    const banner = $('#insightBanner');
    const text = $('#insightText');
    if (!banner || !text) return;
    const entries = Array.isArray(S.entries) ? S.entries : [];
    if (!entries.length || S.settings?.showInsight === false) {
      banner.hidden = true;
      return;
    }
    const observation = Engine.homeObservation(entries);
    if (!observation) {
      banner.hidden = true;
      return;
    }
    const kicker = banner.querySelector('.insight-kicker');
    if (kicker) kicker.textContent = 'PAMET OBSERVATION — BASED ON YOUR LOGS';
    text.textContent = observation.text;
    banner.hidden = false;
  }

  function enrichEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    entry.logSchemaVersion = 2;
    entry.symptomOnset = state.symptomOnset || '';
    entry.sleepQuality = state.sleepQuality || '';
    entry.contextTags = [...state.contextTags];
    entry.structuredContext = {
      symptomOnset: entry.symptomOnset,
      sleepQuality: entry.sleepQuality,
      tags: [...entry.contextTags]
    };
    entry.loggedLocalHour = new Date().getHours();
    return entry;
  }

  function installEntryEnrichment() {
    if (S.addEntry?.__pametLogIntelligence) return;
    const original = S.addEntry.bind(S);
    const wrapped = function addEnrichedEntry(entry) {
      return original(enrichEntry(entry));
    };
    try { Object.defineProperty(wrapped, '__pametLogIntelligence', { value: true }); } catch {}
    S.addEntry = wrapped;
  }

  function resetStructuredContext() {
    state.symptomOnset = '';
    state.sleepQuality = '';
    state.contextTags.clear();
    $$('.context-choice.selected').forEach((button) => button.classList.remove('selected'));
    const notes = $('#notesInput');
    if (notes) delete notes.dataset.pametAutoSummary;
  }

  function scheduleHomeRefresh() {
    queueMicrotask(() => {
      renderRewards();
      renderHomeObservation();
    });
    requestAnimationFrame(() => {
      renderRewards();
      renderHomeObservation();
    });
  }

  function boot() {
    enhanceLabels();
    ensureStructuredContext();
    ensureAutoSummary();
    renderPlanHints();
    installEntryEnrichment();
    renderRewards();
    renderHomeObservation();

    document.addEventListener('click', interceptCustomAdds, true);
    document.addEventListener('click', chooseContext);
    document.addEventListener('change', (event) => {
      if (event.target?.matches?.('#setShowInsight')) scheduleHomeRefresh();
    });
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-tab="home"]')) scheduleHomeRefresh();
    }, true);
    document.addEventListener('pamet:settings-rendered', () => { renderPlanHints(); scheduleHomeRefresh(); });
    window.addEventListener('pamet:entry-saved', () => {
      queueMicrotask(() => { resetStructuredContext(); renderPlanHints(); scheduleHomeRefresh(); });
    });
    window.addEventListener('pamet:login', scheduleHomeRefresh);
    window.addEventListener('pamet:registered', scheduleHomeRefresh);
    window.addEventListener('pamet:profile-updated', scheduleHomeRefresh);
    window.addEventListener('pageshow', scheduleHomeRefresh);

    ['#symptomGrid', '#moodFlow', '#activityFlow', '#medFlow'].forEach((selector) => {
      const target = $(selector);
      if (target) new MutationObserver(() => queueMicrotask(renderPlanHints)).observe(target, { childList: true });
    });
    const planText = $('#planLineText');
    if (planText) new MutationObserver(() => queueMicrotask(renderPlanHints)).observe(planText, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
