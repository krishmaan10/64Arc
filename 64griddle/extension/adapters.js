(function (root) {
  'use strict';
  const BLOCKS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE']);
  const EDITORS =
    'textarea,input,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';
  const isTextControl = (el) => ['TEXTAREA', 'INPUT'].includes(el.tagName);
  function ancestors(el) {
    const nodes = [];
    while (el instanceof Element) {
      nodes.push(el);
      el = el.parentElement || el.getRootNode().host;
    }
    return nodes;
  }
  function isEditable(el) {
    if (!(el instanceof HTMLElement) || !el.isConnected) return false;
    if (el.tagName === 'INPUT' && !['text', 'search'].includes(el.type)) return false;
    if (!isTextControl(el) && !el.isContentEditable) return false;
    if (el.disabled || el.readOnly || el.matches(':disabled')) return false;
    if (
      ancestors(el).some((node) =>
        node.matches(
          '[data-promptline-ui],[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"],[aria-readonly="true"],[contenteditable="false"]',
        ),
      )
    )
      return false;
    // Inspect field metadata, never its value, to exclude credentials and payment fields.
    const metadata = ['id', 'name', 'autocomplete', 'aria-label', 'placeholder']
      .map((name) => el.getAttribute(name) || '')
      .join(' ');
    return !/(?:password|passcode|one.time.code|\botp\b|\bcvv\b|\bcvc\b|credit.card|card.number|\bcc-|api[\s_-]?key|secret[\s_-]?key|social.security|\bssn\b|username|email.address)/i.test(
      metadata,
    );
  }
  function isVisible(el) {
    if (!isEditable(el)) return false;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      box.width >= 120 &&
      box.height >= 20 &&
      style.visibility === 'visible' &&
      style.opacity !== '0'
    );
  }
  function editableFrom(el) {
    if (!(el instanceof Element)) return null;
    if (el.closest('[contenteditable="false"]')) return null;
    let candidate = el.closest(EDITORS);
    if (!isEditable(candidate)) return null;
    while (candidate.parentElement?.isContentEditable) candidate = candidate.parentElement;
    return candidate;
  }
  function fromEvent(event) {
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) continue;
      // Do not ascend out of a non-editable island into its editable parent.
      return editableFrom(node);
    }
    return null;
  }
  function focused() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return editableFrom(el);
  }
  function candidates(root = document) {
    const found = new Set();
    function visit(scope) {
      for (const node of scope.querySelectorAll(EDITORS)) {
        const editor = editableFrom(node);
        if (isVisible(editor)) found.add(editor);
      }
      for (const node of scope.querySelectorAll('*')) {
        if (node.shadowRoot && !node.hasAttribute('data-promptline-ui')) visit(node.shadowRoot);
      }
    }
    visit(root);
    return [...found];
  }
  function snapshot(el) {
    if (isTextControl(el)) return { text: el.value, segments: [], complex: false };
    let text = '';
    const segments = [];
    function newline() {
      if (text && !text.endsWith('\n')) text += '\n';
    }
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const start = text.length;
        text += node.data;
        segments.push({ node, start, end: text.length });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'BR') {
        text += '\n';
        return;
      }
      if (['SCRIPT', 'STYLE'].includes(node.tagName)) return;
      const block = BLOCKS.has(node.tagName);
      if (block) newline();
      for (const child of node.childNodes) walk(child);
      if (block) newline();
    }
    for (const child of el.childNodes) walk(child);
    text = text.replace(/\n$/, '');
    return {
      text,
      segments,
      complex: !!el.querySelector('[contenteditable="false"],img,video,table'),
    };
  }
  function point(snap, offset, preferEnd = false) {
    // At a formatting boundary, start inside the next text node and end inside
    // the previous one. Crossing a bold span unnecessarily can alter spaces.
    const exact = snap.segments.find((s) =>
      preferEnd ? offset > s.start && offset <= s.end : offset >= s.start && offset < s.end,
    );
    if (exact) return { node: exact.node, offset: offset - exact.start };
    const next = snap.segments.find((s) => s.start > offset);
    const prev = snap.segments.filter((s) => s.end <= offset).at(-1);
    if (preferEnd && prev) return { node: prev.node, offset: prev.node.length };
    if (next) return { node: next.node, offset: 0 };
    if (prev) return { node: prev.node, offset: prev.node.length };
    return null;
  }
  function range(el, start, end, snap = snapshot(el)) {
    const a = point(snap, start),
      b = point(snap, end, true);
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }
  function replace(el, base, edit) {
    if (!isVisible(el))
      throw new Error('This field is no longer editable. Focus the current prompt box.');
    if (el.tagName === 'INPUT' && /[\r\n]/.test(edit.replacement))
      throw new Error(
        'This is a single-line field. Remove line breaks in the preview before replacing the draft.',
      );
    // Native editing in collapsing-whitespace rich fields can introduce NBSPs
    // outside the selected range. Refuse before mutation instead of normalizing
    // the user's text or modifying the host's styles to force a transaction.
    if (
      !isTextControl(el) &&
      !['pre', 'pre-wrap', 'break-spaces'].includes(getComputedStyle(el).whiteSpace)
    )
      throw new Error(
        'This rich-text field does not preserve spaces during edits. Copy your preview instead.',
      );
    const snap = snapshot(el);
    if (snap.text !== base)
      throw new Error('Your draft changed. Review the refreshed suggestions.');
    if (snap.complex)
      throw new Error('This field contains embedded content. Copy your preview instead.');
    const expected = PromptlineEngine.applyEdit(base, edit);
    const scroll = { top: el.scrollTop, left: el.scrollLeft };
    el.focus({ preventScroll: true });
    if (!isVisible(el) || focused() !== el)
      throw new Error('The active editor changed. Focus the current prompt box and try again.');
    if (isTextControl(el)) el.setSelectionRange(edit.start, edit.end);
    else {
      const r = range(el, edit.start, edit.end, snap);
      if (!r && base.length)
        throw new Error('Could not locate this text safely. Copy your preview instead.');
      const selection = window.getSelection();
      selection.removeAllRanges();
      if (r) selection.addRange(r);
      else {
        const empty = document.createRange();
        empty.selectNodeContents(el);
        empty.collapse(false);
        selection.addRange(empty);
      }
    }
    const before = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: edit.replacement,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    if (!el.dispatchEvent(before))
      throw new Error('This editor declined the change. Copy your preview instead.');
    if (!isVisible(el) || focused() !== el)
      throw new Error('The active editor changed. Focus the current prompt box and try again.');
    if (snapshot(el).text !== base)
      throw new Error('The editor changed your draft. Review fresh suggestions.');
    // execCommand is intentionally used for native editing transactions and undo.
    // Rich editors without support fail closed; we never replace their innerHTML.
    let performed = false;
    try {
      if (!isTextControl(el) && edit.replacement.includes('\n')) {
        if (el.getAttribute('contenteditable') === 'plaintext-only') {
          const lines = edit.replacement.split('\n');
          performed = document.execCommand('insertText', false, lines.shift());
          for (const line of lines) {
            performed = document.execCommand('insertLineBreak') && performed;
            if (line) performed = document.execCommand('insertText', false, line) && performed;
          }
        } else {
          // A single native transaction avoids Chromium's extra blank DIVs.
          // All user text is escaped; the only generated markup is a line break.
          const html = edit.replacement
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
          performed = document.execCommand('insertHTML', false, html);
        }
      } else performed = document.execCommand('insertText', false, edit.replacement);
    } catch {}
    if (!performed && snapshot(el).text === base && isTextControl(el)) {
      el.setRangeText(edit.replacement, edit.start, edit.end, 'end');
      el.dispatchEvent(
        new InputEvent('input', {
          inputType: 'insertText',
          data: edit.replacement,
          bubbles: true,
          composed: true,
        }),
      );
    }
    const actual = snapshot(el).text;
    if (actual !== expected)
      throw new Error(
        'This editor did not apply the change as expected. Check your draft before continuing.',
      );
    el.scrollTop = scroll.top;
    el.scrollLeft = scroll.left;
    return {
      before: base,
      after: actual,
      edit,
      inverse: {
        start: edit.start,
        end: edit.start + edit.replacement.length,
        expected: edit.replacement,
        replacement: base.slice(edit.start, edit.end),
      },
    };
  }
  function rectangles(el, start, end, mirror) {
    if (!isTextControl(el)) {
      const r = range(el, start, end);
      return r ? [...r.getClientRects()] : [];
    }
    const box = el.getBoundingClientRect(),
      cs = getComputedStyle(el);
    const props = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'lineHeight',
      'letterSpacing',
      'textTransform',
      'textIndent',
      'tabSize',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'boxSizing',
      'wordSpacing',
    ];
    mirror.style.cssText =
      'position:fixed;pointer-events:none;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;border-style:solid;';
    for (const p of props) mirror.style[p] = cs[p];
    if (el.tagName === 'INPUT') mirror.style.whiteSpace = 'pre';
    mirror.style.width = box.width + 'px';
    mirror.style.left = box.left - el.scrollLeft + 'px';
    mirror.style.top = box.top - el.scrollTop + 'px';
    mirror.textContent = el.value || ' ';
    const r = document.createRange();
    r.setStart(mirror.firstChild, start);
    r.setEnd(mirror.firstChild, end);
    return [...r.getClientRects()];
  }
  root.PromptlineAdapter = {
    snapshot,
    range,
    replace,
    rectangles,
    isEditable,
    isVisible,
    editableFrom,
    fromEvent,
    focused,
    candidates,
  };
})(globalThis);
