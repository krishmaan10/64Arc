(function () {
  'use strict';
  if (globalThis.PromptlineController) {
    globalThis.PromptlineController.open();
    return;
  }
  const E = globalThis.PromptlineEngine,
    A = globalThis.PromptlineAdapter;
  if (!E || !A) return;
  const boot = globalThis.PromptlineConfig || {};
  const demo = !!boot.demo;
  const host = document.createElement('promptline-assistant');
  host.dataset.promptlineUi = 'true';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = demo ? 'extension/panel.css' : chrome.runtime.getURL('panel.css');
  const logoUrl = demo
    ? 'extension/brand/64arcs-logo.png'
    : chrome.runtime.getURL('brand/64arcs-logo.png');
  shadow.append(style);
  const markUrl = demo ? 'extension/icons/48.png' : chrome.runtime.getURL('icons/48.png');
  const brandMark = `<img class="brand-mark" src="${markUrl}" alt="" aria-hidden="true" />`;
  const panel = document.createElement('section');
  panel.className = 'panel ' + (demo ? 'embedded' : 'floating removed');
  panel.setAttribute('aria-label', '64Griddle prompt review');
  const badge = document.createElement('button');
  badge.className = 'badge removed';
  badge.title = 'Review this prompt with 64Griddle';
  badge.setAttribute('aria-label', 'Open 64Griddle prompt review');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const mirror = document.createElement('div');
  shadow.append(overlay, mirror, badge, panel);
  const parent = demo ? document.querySelector(boot.mount) : document.documentElement;
  if (!parent) return;
  parent.append(host);
  let config = { agent: 'auto', goal: 'balanced', task: 'auto' },
    target = null,
    analysis = null,
    dismissed = new Set(),
    timer = null,
    lastUndo = null,
    composing = false,
    paused = false,
    siteDisabled = false,
    preferencesReady = demo,
    opened = demo,
    view = 'suggestions',
    preview = null,
    updateFrame = 0,
    drafts = new Map(),
    selected = new Set(),
    expanded = new Set(),
    disclosureInitialized = false,
    preferencesOpen = false;
  const escape = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const effectiveAgent = () =>
    config.agent === 'auto' ? E.detectAgent(location.hostname) : config.agent;
  const options = (obj, value) =>
    Object.entries(obj)
      .map(
        ([id, v]) =>
          `<option value="${id}" ${id === value ? 'selected' : ''}>${escape(v.name)}</option>`,
      )
      .join('');
  const activeSuggestions = () => analysis?.suggestions.filter((s) => !dismissed.has(s.key)) || [];
  function tell(message) {
    const n = panel.querySelector('.feedback');
    if (n) n.textContent = message;
  }
  function savePreferences() {
    if (!demo)
      chrome.storage.local
        .set({ promptlinePreferences: { agent: config.agent, goal: config.goal } })
        .catch(() => {});
  }
  function setConfig(next) {
    config = {
      agent: E.AGENTS[next.agent] ? next.agent : config.agent,
      goal: E.GOALS[next.goal] ? next.goal : config.goal,
      task: E.TASKS[next.task] ? next.task : config.task,
    };
    dismissed.clear();
    selected.clear();
    expanded.clear();
    disclosureInitialized = false;
    preview = null;
    view = 'suggestions';
    savePreferences();
    run();
  }
  function use(el) {
    if (
      paused ||
      siteDisabled ||
      !preferencesReady ||
      !A.isVisible(el) ||
      (demo && !el.matches('[data-promptline-target]'))
    )
      return;
    if (target !== el) {
      retire();
      target = el;
      dismissed.clear();
      selected.clear();
      lastUndo = null;
      drafts.clear();
      preview = null;
      view = 'suggestions';
      config.task = 'auto';
      resize.disconnect();
      resize.observe(el);
      editorMutation.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }
    if (!paused) run();
  }
  function retire() {
    clearTimeout(timer);
    target = analysis = lastUndo = preview = null;
    selected.clear();
    drafts.clear();
    expanded.clear();
    disclosureInitialized = false;
    dismissed.clear();
    composing = false;
    view = 'suggestions';
    resize.disconnect();
    editorMutation.disconnect();
    overlay.replaceChildren();
    if (!demo) panel.replaceChildren();
    badge.classList.add('removed');
    if (!demo) panel.classList.add('removed');
  }
  function chooseTarget() {
    const focused = A.focused();
    if (A.isVisible(focused)) return focused;
    const fields = A.candidates();
    if (fields.length === 1) return fields[0];
    // Prefer an unambiguous prompt-labelled field, not a search or title box.
    const prompts = fields.filter((el) =>
      /(?:prompt|ask-input|message|chat with)/i.test(
        [
          el.id,
          el.getAttribute('aria-label'),
          el.getAttribute('placeholder'),
          el.getAttribute('data-placeholder'),
        ].join(' '),
      ),
    );
    return prompts.length === 1 ? prompts[0] : null;
  }
  function run() {
    clearTimeout(timer);
    if (paused || siteDisabled || !preferencesReady || !A.isVisible(target)) {
      retire();
      return;
    }
    const text = A.snapshot(target).text;
    const next = E.analyze(text, { ...config, agent: effectiveAgent() });
    if (analysis && analysis.text !== text) {
      // The draft moved on. Keep the details the user typed and the choices they made, and drop only
      // the entries whose suggestion is no longer offered. Losing typed work to the next keystroke
      // would make the panel unusable for anything that takes more than one answer.
      const live = new Set(next.suggestions.map((entry) => entry.key));
      // What the user typed, skipped and opened still applies to whatever advice survives the edit.
      for (const store of [drafts, dismissed, expanded])
        for (const key of [...store.keys()]) if (!live.has(key)) store.delete(key);
      // Choosing an edit is a decision about one draft, so a changed draft starts with none chosen.
      selected.clear();
      if (!next.suggestions.length) disclosureInitialized = false;
    }
    analysis = next;
    if (lastUndo && text !== lastUndo.after) lastUndo = null;
    if (preview && preview.base !== text) {
      preview = null;
      view = 'suggestions';
    }
    render();
    layout();
    // Only the bundled playground listens for this. Dispatching it on a host page would hand that
    // page a running description of the user's draft, so it stays inside the demo.
    if (demo)
      document.dispatchEvent(
        new CustomEvent('promptline:analysis', {
          detail: {
            words: analysis.words,
            tokens: analysis.tokens,
            task: analysis.task,
            suggestions: activeSuggestions().length,
            goal: config.goal,
            agent: config.agent,
          },
        }),
      );
  }
  function card(s, index) {
    const detail = s.kind === 'detail';
    const value = drafts.get(s.key) || '';
    const source = E.SOURCES[s.basis.source];
    return `<article class="card" data-category="${escape(s.category)}" data-card="${index}">
      <details class="suggestion" data-expand="${index}" ${expanded.has(s.key) ? 'open' : ''}>
      <summary><div class="card-meta"><span class="cat">${escape(s.category)}</span><span class="edit-state">${selected.has(s.key) ? 'Selected' : detail ? 'Optional detail' : 'Optional edit'}</span></div><h3>${escape(s.title)}</h3></summary>
      ${!detail ? `<p>${escape(s.explanation)}</p>` : ''}
      ${detail ? `<label class="question" for="detail-${index}">${escape(s.question)}</label><textarea class="detail" id="detail-${index}" data-detail="${index}" placeholder="${escape(s.placeholder)}">${escape(value)}</textarea>` : `<div class="change">${s.kind === 'replace' ? `<del>${escape(s.original)}</del>${s.replacement ? '<br>' + escape(s.replacement) : ' → remove'}` : escape(s.replacement.trim())}</div>`}
      <label class="include"><input type="checkbox" data-include="${index}" ${selected.has(s.key) ? 'checked' : ''} ${detail && !value.trim() ? 'disabled' : ''}>Include in preview</label>
      <div class="actions"><button class="apply" data-apply="${index}" ${detail && !value.trim() ? 'disabled' : ''}>${detail ? 'Apply your detail' : s.kind === 'replace' ? 'Apply edit' : 'Add instruction'}</button><button class="dismiss" data-dismiss="${index}">Skip</button></div>
      <details class="evidence"><summary>Why this suggestion?</summary>${detail ? `<p>${escape(s.explanation)}</p>` : ''}<p class="observation">${escape(s.observation)}</p><p>${escape(s.basis.principle)}</p>${source ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(source.publisher)} · ${escape(source.title)} ↗</a><small>Guidance reviewed ${escape(s.reviewedOn)}. The source supports the principle; this local check may miss context or misread your task.</small>` : '<small>Local text comparison. This is optional; it does not establish token savings or better results.</small>'}</details>
      </details>
    </article>`;
  }
  function render() {
    // Native details toggle events are queued. Read the live state before replacing markup.
    preferencesOpen = panel.querySelector('.profile-help')?.open ?? preferencesOpen;
    const focused = shadow.activeElement;
    const focusId = focused?.id;
    const focusView = focused?.dataset.view;
    const suggestions = activeSuggestions();
    if (!disclosureInitialized && suggestions.length) {
      if (suggestions.length === 1) expanded.add(suggestions[0].key);
      disclosureInitialized = true;
    }
    const detectedTaskNames = {
      coding: 'Software',
      debugging: 'Debugging',
      research: 'Research',
      writing: 'Writing',
      summarizing: 'Summary',
      analysis: 'Data analysis',
      general: 'General task',
    };
    const taskOptions = {
      ...E.TASKS,
      auto: {
        name:
          analysis?.status === 'ready'
            ? 'Auto: ' + detectedTaskNames[analysis.task]
            : 'Detect from prompt',
      },
    };
    const isEmpty = !analysis || analysis.status === 'empty';
    const tooLong = analysis?.status === 'too-long';
    const summaryText = analysis?.referencesPriorContext
      ? 'This request refers to an earlier agreement. Its details are not visible here, so setup questions are withheld. Check that the agent has that context.'
      : suggestions.length
        ? 'Expand a suggestion. Add only what fits, then preview your changes.'
        : // The checks are written for English. Saying so here saves the reader guessing why a
          // perfectly ordinary draft in another language comes back with nothing.
          (/[^\u0000-\u024f]|\b(?:une?|le|la|les|des|pour|avec|mein|eine|und|für|el|los|las|para|con|por|que)\b/i.test(
            analysis?.text || '',
          )
            ? 'The checks are written for English, so a draft in another language often returns nothing. '
            : '') +
          'This is not a guarantee of completeness. Try the prompt and check the result against your requirements.';
    panel.innerHTML = `<div class="panel-head"><div class="mark" aria-hidden="true">${brandMark}</div><div class="heading">${demo ? '' : '<span class="eyebrow">64Griddle</span>'}Prompt review</div>${demo ? '<span class="live-label">Live review</span>' : '<span class="local">Local</span>'}${!demo ? '<button class="icon" data-close aria-label="Close prompt review">×</button>' : ''}</div>
      <div class="product-credit"><span>Product of</span><img src="${logoUrl}" alt="64ARCS" width="108" height="46"></div>
      ${!demo && target ? `<div class="field-note">${escape(E.AGENTS[effectiveAgent()].name)} · Reviewing: ${escape((target.getAttribute('aria-label') || target.getAttribute('placeholder') || 'selected text box').slice(0, 90))}</div>` : ''}
      <div class="controls"><label>Task type<select id="pl-task">${options(taskOptions, config.task)}</select></label><label>Your priority<select aria-label="Your priority" id="pl-goal">${options(E.GOALS, config.goal)}</select></label></div>
      <details class="profile-help" ${preferencesOpen ? 'open' : ''}><summary>Review settings</summary><div class="goal-note">${config.task === 'auto' && analysis?.status === 'ready' ? 'Detected: ' + escape(E.TASKS[analysis.task].name) + ' · ' : ''}${escape(E.GOALS[config.goal].description)}</div><label for="pl-agent">Agent profile</label><select aria-label="Agent profile" id="pl-agent">${options(E.AGENTS, config.agent)}</select><p>${escape(E.profileNote(effectiveAgent()))}</p><p>Only this textbox is reviewed. Earlier messages and attachments may already answer these questions. Skip advice that does not fit. Sources support the prompting principles; no result improvement has been measured.</p></details>
      <div class="tabs"><button class="tab ${view === 'suggestions' ? 'active' : ''}" aria-pressed="${view === 'suggestions'}" data-view="suggestions">Suggestions <span class="counter">${suggestions.length}</span></button><button class="tab ${view === 'preview' ? 'active' : ''}" aria-pressed="${view === 'preview'}" data-view="preview">Prompt preview</button><span class="selection-count" aria-live="polite">${selected.size} selected</span></div>
      <div class="feedback" role="status" aria-live="polite"></div><div class="body">
      ${view === 'preview' ? previewMarkup() : isEmpty ? '<div class="empty"><span class="empty-label">PROMPT REVIEW</span><h3>Your review starts here.</h3><p>Write at least three words in the draft to see suggestions for your task.</p><div class="empty-guide"><span>01 <b>Write your request</b></span><span>02 <b>Review relevant suggestions</b></span><span>03 <b>Preview and use your edits</b></span></div></div>' : tooLong ? '<div class="empty"><h3>This prompt exceeds the review limit.</h3><p>Review up to 30,000 characters at a time. Your text has not been shortened or changed.</p></div>' : `<div class="summary ${suggestions.length ? 'has-suggestions' : ''} ${analysis?.referencesPriorContext ? 'prior-context' : ''}"><strong>${suggestions.length ? 'Choose the details that matter.' : 'No suggestions from the local checks.'}</strong><p>${summaryText}</p></div>${suggestions.length ? suggestions.map(card).join('') : ''}`}
      </div>${view === 'preview' && preview && analysis?.status === 'ready' ? previewActionsMarkup() : analysis?.status === 'ready' ? `<div class="review-actions"><button class="primary" data-review>${selected.size ? 'Preview selected changes (' + selected.size + ')' : 'Preview prompt'}</button><small>No changes are applied automatically.</small></div>` : ''}<div class="footer"><span>Local checks · Draft only</span>${lastUndo ? '<button data-undo>Undo last edit</button>' : ''}${dismissed.size ? '<button data-reset>Restore skipped</button>' : ''}${!demo ? '<button data-pause>Pause on this page</button>' : ''}</div>`;
    panel.querySelector('.profile-help').addEventListener('toggle', (event) => {
      if (event.target.isConnected) preferencesOpen = event.target.open;
    });
    panel.querySelectorAll('[data-expand]').forEach((node) =>
      node.addEventListener('toggle', () => {
        if (!node.isConnected) return;
        const key = suggestions[Number(node.dataset.expand)]?.key;
        if (node.open) expanded.add(key);
        else expanded.delete(key);
      }),
    );
    panel.querySelector('[data-review]')?.addEventListener('click', () => {
      view = 'preview';
      makePreview();
      render();
      layout();
      panel.querySelector('.preview-area')?.focus();
    });
    panel
      .querySelector('#pl-agent')
      .addEventListener('change', (e) => setConfig({ agent: e.target.value }));
    panel
      .querySelector('#pl-goal')
      .addEventListener('change', (e) => setConfig({ goal: e.target.value }));
    panel
      .querySelector('#pl-task')
      .addEventListener('change', (e) => setConfig({ task: e.target.value }));
    panel.querySelectorAll('[data-view]').forEach((b) =>
      b.addEventListener('click', () => {
        view = b.dataset.view;
        if (view === 'preview') makePreview();
        render();
        layout();
      }),
    );
    panel.querySelector('[data-close]')?.addEventListener('click', () => {
      opened = false;
      panel.classList.add('removed');
      layout();
    });
    panel.querySelector('[data-pause]')?.addEventListener('click', () => {
      paused = true;
      opened = false;
      retire();
    });
    panel.querySelector('[data-reset]')?.addEventListener('click', () => {
      dismissed.clear();
      run();
    });
    panel.querySelectorAll('[data-detail]').forEach((input) =>
      input.addEventListener('input', () => {
        const s = suggestions[Number(input.dataset.detail)];
        drafts.set(s.key, input.value);
        const ready = !!input.value.trim();
        input.closest('.card').querySelector('.apply').disabled = !ready;
        const include = input.closest('.card').querySelector('[data-include]');
        include.disabled = !ready;
        // Writing a detail is an explicit choice; the user can deselect it.
        if (ready) selected.add(s.key);
        else selected.delete(s.key);
        include.checked = ready;
        updateSelectionCount();
        preview = null;
      }),
    );
    panel.querySelectorAll('[data-include]').forEach((input) =>
      input.addEventListener('change', () => {
        const s = suggestions[Number(input.dataset.include)];
        if (input.checked) selected.add(s.key);
        else selected.delete(s.key);
        preview = null;
        updateSelectionCount();
      }),
    );
    panel.querySelectorAll('[data-dismiss]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = suggestions[Number(b.dataset.dismiss)].key;
        dismissed.add(key);
        selected.delete(key);
        preview = null;
        render();
        layout();
      }),
    );
    panel
      .querySelectorAll('[data-apply]')
      .forEach((b) =>
        b.addEventListener('click', () => apply(suggestions[Number(b.dataset.apply)])),
      );
    panel.querySelector('[data-undo]')?.addEventListener('click', undo);
    panel.querySelector('[data-copy]')?.addEventListener('click', copyPreview);
    panel.querySelector('[data-replace]')?.addEventListener('click', replacePreview);
    // HTML parsing strips the first newline inside textarea and pre elements.
    // Assign their values as text to preserve the user's exact leading whitespace.
    const previewArea = panel.querySelector('.preview-area');
    if (previewArea && preview) previewArea.value = preview.text;
    const originalText = panel.querySelector('.original pre');
    if (originalText && preview) originalText.textContent = preview.base;
    previewArea?.addEventListener('input', (e) => {
      preview.text = e.target.value;
      updateComparison();
    });
    badge.innerHTML = `${brandMark}${suggestions.length ? `<span>${suggestions.length}</span>` : ''}`;
    // Config changes replace panel markup; keep keyboard focus on the control.
    if (focusId) panel.querySelector(`#${focusId}`)?.focus({ preventScroll: true });
    else if (focusView)
      panel.querySelector(`[data-view="${focusView}"]`)?.focus({ preventScroll: true });
  }
  function updateSelectionCount() {
    const n = panel.querySelector('.selection-count');
    if (n) n.textContent = `${selected.size} selected`;
    const button = panel.querySelector('[data-review]');
    if (button)
      button.textContent = `${selected.size ? 'Preview selected changes (' + selected.size + ')' : 'Preview prompt'}`;
    panel.querySelectorAll('[data-card]').forEach((node) => {
      const s = activeSuggestions()[Number(node.dataset.card)];
      node.querySelector('.edit-state').textContent = selected.has(s.key)
        ? 'Selected'
        : s.kind === 'detail'
          ? 'Optional detail'
          : 'Optional edit';
    });
  }
  function apply(s) {
    if (!analysis || composing) return;
    try {
      const edit = E.editFor(analysis.text, s, drafts.get(s.key) || '');
      lastUndo = A.replace(target, analysis.text, edit);
      drafts.delete(s.key);
      preview = null;
      run();
      tell('Applied to your draft. Undo is available below.');
      // Frameworks may reconcile on a later tick; refresh from their actual state.
      setTimeout(() => {
        if (target && lastUndo && A.snapshot(target).text !== lastUndo.after) {
          lastUndo = null;
          run();
          tell('The editor changed the result. Review the draft before continuing.');
        }
      }, 80);
    } catch (error) {
      run();
      tell(error.message);
    }
  }
  function undo() {
    if (!lastUndo) return;
    try {
      const edit = lastUndo;
      A.replace(target, edit.after, edit.inverse);
      lastUndo = null;
      run();
      tell('Last 64Griddle edit undone.');
    } catch (error) {
      run();
      tell(error.message);
    }
  }
  function makePreview() {
    if (preview || !analysis) return;
    try {
      preview = E.buildPreview(analysis.text, activeSuggestions(), selected, drafts);
    } catch (error) {
      preview = {
        base: analysis.text,
        text: analysis.text,
        applied: 0,
        missing: 0,
        error: error.message,
      };
    }
  }
  function previewMarkup() {
    if (analysis?.status === 'too-long')
      return '<div class="empty"><h3>This prompt exceeds the review limit.</h3><p>Review up to 30,000 characters. Your draft is unchanged.</p></div>';
    if (!analysis || analysis.status !== 'ready')
      return '<div class="empty"><h3>Write a prompt first.</h3><p>Your reviewed prompt will appear here.</p></div>';
    if (!preview) makePreview();
    return `<details class="original"><summary>View original prompt</summary><pre>${escape(preview.base)}</pre></details><div class="preview-label">Proposed prompt · editable</div><textarea class="preview-area" aria-label="Proposed prompt">${escape(preview.text)}</textarea><div class="comparison" aria-live="polite">${comparisonMarkup()}</div><p class="preview-note">${preview.error ? escape(preview.error) : `${preview.applied} selected ${preview.applied === 1 ? 'change' : 'changes'} included. ${preview.missing ? preview.missing + ' suggestions still need your details and are not included. ' : ''}${preview.applied ? '' : 'Select suggestions or edit the preview directly. '}`}Copy and replace use the exact text above.</p>`;
  }
  function previewActionsMarkup() {
    return `<div class="preview-actions"><button class="primary" data-replace ${preview.text === preview.base ? 'disabled' : ''}>Replace draft</button><button class="secondary" data-copy>Copy prompt</button></div>`;
  }
  function comparisonMarkup() {
    const c = E.compareText(preview.base, preview.text);
    return `<span>${c.beforeWords} → ${c.afterWords} words</span><span>~${c.beforeTokens} → ~${c.afterTokens} tokens</span><small>Rough character-based estimate; actual token use varies by model.</small>`;
  }
  function updateComparison() {
    panel.querySelector('.comparison').innerHTML = comparisonMarkup();
    panel.querySelector('[data-replace]').disabled = preview.text === preview.base;
  }
  async function copyPreview() {
    if (!preview) return tell('The draft changed. Open a fresh preview.');
    if (!target || A.snapshot(target).text !== preview.base) {
      run();
      return tell('The draft changed. Open a fresh preview.');
    }
    try {
      await navigator.clipboard.writeText(preview.text);
      tell('Prompt copied.');
    } catch {
      tell('Clipboard unavailable. Select and copy the preview text.');
    }
  }
  function replacePreview() {
    if (!preview || composing) return;
    try {
      lastUndo = A.replace(target, preview.base, {
        start: 0,
        end: preview.base.length,
        expected: preview.base,
        replacement: preview.text,
      });
      preview = null;
      view = 'suggestions';
      run();
      tell('Reviewed prompt inserted. It has not been sent.');
    } catch (error) {
      run();
      tell(error.message);
    }
  }
  function layout() {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      overlay.replaceChildren();
      if (!A.isVisible(target) || paused || siteDisabled) {
        if (target) retire();
        return;
      }
      const box = target.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight || box.width === 0) {
        badge.classList.add('removed');
        if (!demo) panel.classList.add('removed');
        return;
      }
      if (!demo) {
        badge.classList.toggle('removed', opened);
        // Anchor outside the editor when space allows, away from its send controls.
        const badgeLeft =
          box.right + 8 + 60 < innerWidth
            ? box.right + 8
            : box.left - 68 >= 8
              ? box.left - 68
              : box.left;
        const badgeTop =
          badgeLeft === box.left ? (box.top >= 48 ? box.top - 40 : box.bottom + 8) : box.top;
        badge.style.left = Math.max(8, Math.min(innerWidth - 70, badgeLeft)) + 'px';
        badge.style.top = Math.max(8, Math.min(innerHeight - 40, badgeTop)) + 'px';
        panel.classList.toggle('removed', !opened);
        if (opened) {
          const width = Math.min(390, innerWidth - 24);
          const height = panel.getBoundingClientRect().height;
          const fitsRight = box.right + width + 24 <= innerWidth;
          const fitsLeft = box.left - width - 24 >= 0;
          const left = fitsRight ? box.right + 12 : fitsLeft ? box.left - width - 12 : box.left;
          const top =
            fitsRight || fitsLeft
              ? box.top
              : box.top >= height + 24
                ? box.top - height - 12
                : box.bottom + 12;
          panel.style.left = Math.max(12, Math.min(innerWidth - width - 12, left)) + 'px';
          panel.style.top = Math.max(12, Math.min(innerHeight - height - 12, top)) + 'px';
        }
      }
      if (composing || !analysis || A.snapshot(target).text !== analysis.text) return;
      const clip = {
        left: Math.max(0, box.left),
        right: Math.min(innerWidth, box.right),
        top: Math.max(0, box.top),
        bottom: Math.min(innerHeight, box.bottom),
      };
      for (const s of activeSuggestions()
        .filter((s) => Number.isInteger(s.start))
        .slice(0, 6)) {
        try {
          for (const r of A.rectangles(target, s.start, s.end, mirror).slice(0, 12)) {
            const left = Math.max(r.left, clip.left),
              right = Math.min(r.right, clip.right),
              top = r.bottom - 2;
            if (right <= left || top < clip.top || top > clip.bottom - 2) continue;
            const line = document.createElement('div');
            line.className = 'underline';
            line.style.cssText = `left:${left}px;top:${top}px;width:${right - left}px`;
            overlay.append(line);
          }
        } catch {}
      }
    });
  }
  badge.addEventListener('click', () => {
    opened = !opened;
    render();
    layout();
  });
  document.addEventListener(
    'focusin',
    (e) => {
      if (e.composedPath().includes(host)) return;
      const editor = A.fromEvent(e);
      if (editor) use(editor);
      else if (
        e
          .composedPath()
          .some(
            (node) =>
              node instanceof Element && node.matches('input,textarea,[contenteditable="false"]'),
          )
      )
        retire();
    },
    true,
  );
  document.addEventListener(
    'input',
    (e) => {
      if (e.composedPath().includes(host) || paused) return;
      const el = A.fromEvent(e);
      if (el === target) {
        // The draft changed, so a preview built on the old text is stale. What the user typed and
        // chose is not: run() keeps every answer whose suggestion still applies.
        preview = null;
        if (view === 'preview') view = 'suggestions';
        overlay.replaceChildren();
        clearTimeout(timer);
        if (!composing) timer = setTimeout(run, 220);
      } else if (el) use(el);
    },
    true,
  );
  document.addEventListener(
    'compositionstart',
    (e) => {
      if (A.fromEvent(e) === target) {
        composing = true;
        clearTimeout(timer);
        overlay.replaceChildren();
      }
    },
    true,
  );
  document.addEventListener(
    'compositionend',
    (e) => {
      if (A.fromEvent(e) === target) {
        composing = false;
        timer = setTimeout(run, 220);
      }
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !demo) {
        opened = false;
        panel.classList.add('removed');
        layout();
      }
    },
    true,
  );
  document.addEventListener('scroll', layout, true);
  window.addEventListener('resize', layout);
  const resize = new ResizeObserver(layout);
  const editorMutation = new MutationObserver(() => {
    if (!A.isVisible(target)) return retire();
    if (!composing) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (target && A.snapshot(target).text !== analysis?.text) run();
        else layout();
      }, 220);
    }
  });
  const mutation = new MutationObserver(() => {
    if (target && !target.isConnected) {
      retire();
      use(A.focused());
    }
    if (target && !A.isVisible(target)) retire();
    if (!target) use(A.focused());
  });
  mutation.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'hidden',
      'inert',
      'aria-hidden',
      'aria-disabled',
      'aria-readonly',
      'disabled',
      'readonly',
      'contenteditable',
    ],
  });
  document.addEventListener('reset', () => setTimeout(run, 0), true);
  globalThis.PromptlineController = {
    setConfig,
    refresh: run,
    open() {
      if (siteDisabled || !preferencesReady) return;
      paused = false;
      opened = true;
      if (!target) {
        use(chooseTarget());
      }
      run();
    },
    review() {
      view = 'suggestions';
      run();
      panel.querySelector('#pl-task')?.focus();
    },
    preview() {
      view = 'preview';
      makePreview();
      render();
      layout();
    },
    getState() {
      return { config: { ...config }, analysis, paused, opened };
    },
  };
  if (!demo && typeof chrome !== 'undefined') {
    const ready = chrome.storage.local
      .get(['promptlinePreferences', 'promptlineDisabledSites'])
      .then(({ promptlinePreferences, promptlineDisabledSites = [] }) => {
        siteDisabled = promptlineDisabledSites.includes(location.origin);
        preferencesReady = true;
        if (promptlinePreferences) setConfig(promptlinePreferences);
        use(A.focused());
      })
      .catch(() => {
        preferencesReady = true;
        use(A.focused());
      });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.promptlineDisabledSites) {
        siteDisabled = (changes.promptlineDisabledSites.newValue || []).includes(location.origin);
        if (siteDisabled) retire();
      }
    });
    chrome.runtime.onMessage.addListener((msg, _, reply) => {
      if (msg.type === 'promptline-open') {
        ready.then(() => {
          globalThis.PromptlineController.open();
          reply({ ok: !siteDisabled, found: !!target });
        });
        return true;
      }
      if (
        msg.type === 'promptline-access-removed' &&
        msg.origins?.includes(`${location.protocol}//${location.hostname}/*`)
      ) {
        paused = true;
        retire();
        reply({ ok: true });
      }
      if (msg.type === 'promptline-config') {
        setConfig(msg.config);
        reply({ ok: true });
      }
    });
  }
  if (demo) use(document.querySelector(boot.target));
  else use(A.focused());
  if (!analysis) render();
})();
