'use strict';
const $ = id => document.getElementById(id);
let state;
let selected = 'understand';
let busy = false;
let savedOnly = false;
let review = null;
let chatMode = 'understand';
let chatSignature = '';
let pendingChatTurns = [];
const chatModes = ['understand', 'plan', 'question', 'sources'];
const words = text => (text.match(/[\p{L}\p{N}']+/gu) || []).length;
const nameOf = id => state.modes.find(mode => mode.id === id)?.name || id;
const writingMode = () => ['improve', 'rephrase'].includes(selected);
const allowed = id => state?.assignment.modes.includes(id) && state.previewModes.includes(id);
const descriptions = {
  understand: ['?', 'Unpack the task and understand what is expected.'],
  plan: ['▤', 'Find manageable steps. Decide how to spend your time.'],
  question: ['◎', 'Test your thinking with questions you can explore.'],
  improve: ['Aa', 'Review small grammar edits or practise a clearer tone.'],
  rephrase: ['↔', 'Practise restating your own ideas in your own words.'],
  sources: ['▧', 'Explore two curated references and evaluate the evidence.'],
};
const taken = { produce: 'asked for the work itself', extend: 'asked for a piece of the work', answer: 'asked for the answer to a set question', disguise: 'asked for the work with a reason attached', override: 'tried to change the rules', pressure: 'pushed after a refusal', evade: 'asked to hide where writing came from', offTask: 'not about the assignment', grading: 'asked for a mark', wellbeing: 'about the student, not the work', redirect: 'help, in a different mode', modeNotAllowed: 'a kind of help the teacher paused', needsText: 'needs saved writing first' };
const steps = ['Understand the task and choose a position', 'Read and evaluate two sources', 'Write an argument in your own words', 'Review your evidence, citations and writing'];
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notice(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
async function api(url, body) {
  // The browser pilot answers in the page; otherwise the local preview server answers over HTTP.
  const response = window.PathWayPilot ? await window.PathWayPilot.fetch(url, body) : await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Start the local preview server to use this workspace.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not complete this action. Try again.');
  return data;
}
function controls() {
  document.querySelectorAll('[data-lock]').forEach(node => { node.disabled = busy || !state || node.dataset.unavailable === 'true'; });
  $('save-draft').disabled = busy || !state || $('draft-text').value === state.draft;
  $('download-draft').disabled = !state?.draft;
  $('export-activity').disabled = !state?.activity.length;
  $('ask').disabled = busy || !selected || !state;
  $('ask').textContent = busy ? 'Checking…' : 'Ask for guidance ↗';
  const chatPaused = !allowed(chatMode);
  $('chat-input').disabled = busy || !state || chatPaused;
  $('chat-mode').disabled = busy || !state || !chatModes.some(allowed);
  $('chat-send').disabled = busy || !state || chatPaused || !$('chat-input').value.trim();
  $('chat-send').textContent = busy ? '…' : '↑';
  $('chat-transcript').setAttribute('aria-busy', String(busy));
  document.querySelectorAll('[data-chat-mode]').forEach(node => { node.disabled = busy || !allowed(node.dataset.chatMode); });
  $('request-text').disabled = busy || !selected || !state;
}
function lockable(node, unavailable = false) {
  node.dataset.lock = 'true'; node.dataset.unavailable = String(unavailable);
  node.disabled = busy || unavailable || !state;
  return node;
}
async function action(work) {
  if (busy || !state) return;
  busy = true; controls();
  try { await work(); }
  catch (error) { notice(error.message || 'Connection lost. Try again.', true); }
  finally { busy = false; controls(); }
}
async function refresh() {
  state = await api('/api/state');
  pendingChatTurns = [];
  renderAll();
}
function draftStatus() {
  $('word-count').textContent = `${words($('draft-text').value)} words / 500 target`;
  $('save-state').textContent = $('draft-text').value !== state.draft ? 'Unsaved changes' : state.draft ? 'Saved in this session' : 'No draft saved';
  $('home-draft-state').textContent = state.draft ? 'Draft in progress' : 'Ready to start';
  controls();
}
function route(focus = true) {
  const pages = { chat: 'Learning chat', home: 'Overview', workspace: 'My assignment', sources: 'Source library', activity: 'Learning activity', boundaries: 'Learning boundaries', teacher: 'Teacher preview' };
  const page = Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'chat';
  document.querySelectorAll('.page').forEach(node => { node.hidden = node.id !== `page-${page}`; });
  document.querySelectorAll('[data-page]').forEach(node => {
    if (node.dataset.page === page) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  $('page-label').textContent = pages[page];
  document.body.classList.toggle('chat-active', page === 'chat');
  $('teacher-view').textContent = page === 'teacher' ? 'Student workspace' : 'Teacher preview';
  document.title = `PathWay AI · ${pages[page]}`;
  if (focus) {
    $('main').focus();
    if (page === 'chat' && !$('chat-transcript').hidden) latestTurn(); else window.scrollTo(0, 0);
  }
}
function latestTurn() { $('chat-transcript').lastElementChild?.scrollIntoView?.({ block: 'end' }); }
function chooseMode(id) {
  if (!allowed(id) || busy) return;
  selected = id; review = null;
  $('response').hidden = true; $('writing-response').hidden = true;
  renderModes(); location.hash = 'workspace';
}
function renderModes() {
  if (!allowed(selected)) selected = state.assignment.modes.find(allowed) || '';
  $('permission-list').replaceChildren(); $('mode-picker').replaceChildren(); $('policy-options').replaceChildren(); $('home-tools').replaceChildren();
  for (const [index, mode] of state.modes.entries()) {
    const available = state.previewModes.includes(mode.id);
    const permitted = allowed(mode.id);
    const purpose = descriptions[mode.id]?.[1] || mode.purpose;
    const li = element('li', undefined, permitted ? '' : 'unavailable');
    li.append(element('span', permitted ? '✓' : '—', 'permission-icon'), element('span', `${mode.name}${!available ? ' · Coming later' : !permitted ? ' · Paused' : ''}`));
    $('permission-list').append(li);
    const button = lockable(element('button', undefined, 'mode-choice'), !permitted);
    button.type = 'button'; button.setAttribute('aria-pressed', String(selected === mode.id));
    button.append(element('span', String(index + 1).padStart(2, '0'), 'number'), element('span', mode.name + (permitted ? '' : ' · Paused')));
    button.addEventListener('click', () => { chooseMode(mode.id); if (!writingMode()) $('request-text').focus(); });
    $('mode-picker').append(button);
    const tool = lockable(element('button', undefined, 'tool-card'), !permitted);
    tool.append(element('span', descriptions[mode.id]?.[0] || '✳', 'tool-icon'), element('strong', mode.name), element('p', permitted ? purpose : 'This assistance is paused for the assignment.'), element('span', '↗', 'arrow'));
    tool.addEventListener('click', () => chooseMode(mode.id)); $('home-tools').append(tool);
    const label = element('label', undefined, 'policy-option');
    const checkbox = lockable(element('input'), !available);
    checkbox.type = 'checkbox'; checkbox.name = 'modes'; checkbox.value = mode.id; checkbox.checked = Boolean(permitted);
    const description = element('span', mode.name); description.append(element('small', purpose));
    label.append(checkbox, description); $('policy-options').append(label);
  }
  $('mode-title').textContent = selected ? nameOf(selected) : 'Help is paused for this assignment';
  $('mode-purpose').textContent = selected ? descriptions[selected][1] : 'You can keep writing and saving your draft. Your teacher has turned off all help modes.';
  $('request-form').hidden = writingMode(); $('writing-tools').hidden = !writingMode();
  $('writing-title').textContent = selected === 'rephrase' ? 'Practise your paraphrase' : 'Review your writing';
  $('writing-options').hidden = selected === 'rephrase'; $('rephrase-action').hidden = selected !== 'rephrase';
  document.querySelectorAll('[data-mode]').forEach(node => lockable(node, !allowed(node.dataset.mode)));
  $('assignment-help-state').textContent = state.assignment.modes.length ? 'Assignment help enabled' : 'Assistant help paused';
  controls();
}
function renderChecklist() {
  $('task-checklist').replaceChildren();
  steps.forEach((text, index) => {
    const label = element('label', undefined, 'check-row'); const input = lockable(element('input'));
    input.type = 'checkbox'; input.checked = state.checklist.includes(index);
    input.addEventListener('change', () => action(async () => {
      const checked = [...$('task-checklist').querySelectorAll('input')].flatMap((node, i) => node.checked ? [i] : []);
      try { await api('/api/checklist', { checked }); await refresh(); notice('Progress saved in this session.'); }
      catch (error) { renderChecklist(); throw error; }
    }));
    label.append(input, element('span', text)); $('task-checklist').append(label);
  });
  $('home-progress').value = state.checklist.length;
  $('home-progress-label').textContent = `${state.checklist.length} of 4 steps checked`;
  $('home-progress-percent').textContent = `${state.checklist.length * 25}%`;
}
function detail(parent, title, text) {
  const node = element('details'); node.append(element('summary', title), element('p', text)); parent.append(node);
}
function renderActivity() {
  const filter = $('activity-filter').value;
  const events = state.activity.filter(event => filter === 'all' || event.type === filter || filter === 'writing' && ['review', 'edit'].includes(event.type));
  $('activity-count').textContent = `${events.length} of ${state.activity.length} events`;
  $('activity-list').replaceChildren();
  if (!events.length) $('activity-list').append(element('li', state.activity.length ? 'No activity matches this filter.' : 'Your learning story starts here. Save a draft or ask for guidance to begin.', 'empty-state'));
  for (const event of [...events].reverse()) {
    const li = element('li'); const heading = element('div', undefined, 'event-heading');
    const titles = { draft: `Draft saved · ${event.words} words`, policy: 'Assignment permissions updated', review: `${event.kind} review · ${event.count} suggestions`, edit: `Writing suggestion ${event.action === 'accept' ? 'accepted' : 'rejected'}` };
    const time = element('time', new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    time.dateTime = new Date(event.at).toISOString(); heading.append(element('strong', titles[event.type] || nameOf(event.mode)));
    if (event.type === 'request') { const chip = element('span', event.outcome, 'outcome-chip'); chip.dataset.outcome = event.outcome; heading.append(chip); }
    heading.append(time); li.append(heading);
    if (event.type === 'draft') detail(li, 'Read saved draft', event.text || '(Empty draft)');
    if (event.type === 'policy') li.append(element('p', event.modes.length ? `Allowed: ${event.modes.map(nameOf).join(', ')}` : 'All assistant help is paused.'));
    if (event.type === 'review') li.append(element('p', event.guide));
    if (event.type === 'edit') li.append(element('p', `${event.before} → ${event.after}\n${event.reason}`));
    if (event.type === 'request') {
      li.append(element('p', event.asked));
      li.append(element('p', `Taken as: ${event.category ? taken[event.category] || event.category : 'help, answered'}${event.again ? ' · asked again' : ''}${event.read ? ` · reader: ${event.read.name || event.read.label} (${Math.round(event.read.confidence * 100)}%)` : ''}`, 'small muted'));
      detail(li, 'Read what the student saw', event.shown.text || [event.shown.reason, event.shown.explain, ...(event.shown.offer || []).map(offer => offer.name)].filter(Boolean).join('\n\n'));
      detail(li, 'Permissions at the time', event.policy.length ? event.policy.map(nameOf).join(', ') : 'All help paused');
    }
    $('activity-list').append(li);
  }
}
function renderObservations() {
  const observations = state.summary?.observations || [];
  $('observations').replaceChildren();
  $('observations-count').textContent = observations.length ? `${observations.length} ${observations.length === 1 ? 'note' : 'notes'}` : 'Nothing yet';
  if (!observations.length) $('observations').append(element('li', 'Nothing to note. Requests and saved drafts so far look like ordinary work.', 'empty-state'));
  for (const o of observations) $('observations').append(element('li', o.note));
  // The teacher page shows the same notes, so setting the terms and reading the sequence sit together.
  $('teacher-observations').replaceChildren(...(observations.length ? observations.map(o => element('li', o.note)) : [element('li', 'Nothing to note yet.', 'empty-state')]));
}
function renderSources() {
  const query = $('source-search').value.trim().toLowerCase();
  const sources = state.sources.filter(source => (!savedOnly || state.savedSources.includes(source.id)) && `${source.title} ${source.publisher} ${source.type}`.toLowerCase().includes(query));
  $('source-list').replaceChildren(); $('saved-count').textContent = state.savedSources.length;
  $('saved-filter').setAttribute('aria-pressed', String(savedOnly));
  for (const source of sources) {
    const card = element('article', undefined, 'source-card card');
    card.append(element('span', source.type, 'eyebrow'), element('h2', source.title), element('p', source.publisher, 'source-publisher'), element('p', source.note));
    const actions = element('div', undefined, 'source-actions'); const link = element('a', 'Read source ↗', 'button');
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Read ${source.title} (opens in a new tab)`);
    const saved = state.savedSources.includes(source.id);
    const bookmark = lockable(element('button', saved ? '✓ Saved' : 'Save reference'));
    bookmark.setAttribute('aria-pressed', String(saved));
    bookmark.addEventListener('click', () => action(async () => { await api('/api/source', { id: source.id, saved: !saved }); await refresh(); notice(saved ? 'Reference removed from saved list.' : 'Reference saved in this session.'); }));
    actions.append(link, bookmark); card.append(actions); detail(card, 'View citation', `${source.citation}\n${source.url}`); $('source-list').append(card);
  }
  if (!sources.length) $('source-list').append(element('p', savedOnly ? 'No saved references match. Turn off “Saved only” or clear your search.' : 'No references match. Try a title or publisher, or clear your search.', 'empty-state card'));
}
function renderResponse(shown, modeId) {
  const response = $('response'); response.replaceChildren(); response.hidden = false;
  const headings = { redirect: 'Try a different kind of help', withheld: 'A reply was withheld', decline: 'Not this, but here is what I can do', support: 'A person can help with this' };
  response.append(element('h3', shown.kind === 'reply' ? `${nameOf(modeId)} · Sample guidance` : headings[shown.kind] || 'Let’s keep the work yours'));
  response.append(element('p', shown.text || [shown.reason, shown.explain].filter(Boolean).join('\n\n')));
  for (const offer of shown.offer || []) {
    if (!allowed(offer.mode)) continue;
    const button = lockable(element('button', offer.name));
    button.addEventListener('click', () => chooseMode(offer.mode)); response.append(button);
  }
  if (modeId === 'sources' && shown.kind === 'reply') { const link = element('a', 'Open source library →', 'button'); link.href = '#sources'; response.append(link); }
  response.focus();
}
function renderReview() {
  const panel = $('writing-response'); panel.replaceChildren(); panel.hidden = false;
  panel.append(element('h3', 'Your writing, under review'), element('p', review.guide));
  if (!review.suggestions.length && review.kind === 'grammar') panel.append(element('p', 'Nothing found. This checker looks at spelling, apostrophes, agreement, confusable words and punctuation; it does not read for meaning, so it can miss things. Read your draft through yourself too.'));
  review.suggestions.forEach((suggestion, index) => {
    const card = element('div', undefined, 'suggestion'); const change = element('p', undefined, 'edit-text');
    change.append(element('del', suggestion.before), document.createTextNode(' → '), element('ins', suggestion.after));
    card.append(change, element('p', suggestion.reason));
    for (const decision of ['accept', 'reject']) {
      const button = lockable(element('button', decision === 'accept' ? 'Accept edit' : 'Keep mine'));
      button.addEventListener('click', () => action(async () => {
        if ($('draft-text').value !== state.draft) throw new Error('Your draft has unsaved changes. Save it and run a new review.');
        const text = $('draft-text').value;
        // Freeze typing while applying an explicit edit so a late response cannot erase new words.
        $('draft-text').readOnly = true;
        try {
          const result = await api('/api/edit', { reviewId: review.id, index, action: decision, text });
          if (decision === 'accept') {
            $('draft-text').value = result.draft; review = null;
            panel.replaceChildren(element('p', 'Edit accepted and saved. Run the checker again to review the updated draft.'));
          } else { card.replaceChildren(change, element('p', 'Kept your original wording.')); }
          await refresh(); notice(decision === 'accept' ? 'Your chosen edit was saved and recorded.' : 'Suggestion rejected and recorded.');
        } finally { $('draft-text').readOnly = false; }
      })); card.append(button);
    }
    panel.append(card);
  });
  panel.focus();
}
function renderAll() { renderChat(); renderModes(); renderChecklist(); renderSources(); renderActivity(); renderObservations(); draftStatus(); }
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = element('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let lastOffers = '';
function appendChatTurn(event) {
  const turn = element('article', undefined, 'chat-turn');
  const user = element('div', undefined, 'chat-user');
  user.append(element('span', 'You', 'sr-only'), element('p', event.asked));
  const reply = element('div', undefined, 'chat-reply');
  const shown = event.shown;
  const labels = { reply: 'Sample guidance', redirect: 'Try another kind of help', refusal: 'Let’s keep the work yours', decline: 'Not this, but here is what I can do', support: 'A person can help with this', withheld: 'Reply withheld', error: 'Reply unavailable' };
  reply.append(element('div', '✳  PathWay AI', 'reply-author'), element('span', labels[shown.kind] || 'Learning boundary', `reply-label kind-${shown.kind} ${shown.kind === 'reply' ? '' : 'boundary-label'}`), element('p', shown.text || [shown.reason, shown.explain].filter(Boolean).join('\n\n')));
  const actions = element('div', undefined, 'reply-actions');
  const offers = (shown.offer || []).filter(offer => allowed(offer.mode));
  const offerKey = offers.map(offer => offer.mode).join();
  // The same row of options under three refusals in a row is noise; say once that they still apply.
  const repeated = offers.length > 1 && offerKey === lastOffers;
  lastOffers = offers.length ? offerKey : '';
  if (repeated) actions.append(element('span', 'The same options as above still apply.', 'small muted'));
  for (const offer of repeated ? [] : offers) {
    const button = lockable(element('button', offer.name));
    button.type = 'button';
    button.addEventListener('click', () => {
      if (busy || !allowed(offer.mode)) return;
      if (!chatModes.includes(offer.mode)) { chooseMode(offer.mode); return; }
      chatMode = offer.mode; renderChat(); controls();
      // A redirect is the same request in a different mode: carry the words across, and let the student send.
      if (shown.kind === 'redirect' && event.asked) {
        $('chat-input').value = event.asked; $('chat-input').dispatchEvent(new Event('input'));
        $('chat-feedback').textContent = `Your message is ready to send in ${nameOf(offer.mode)}. Nothing has been sent yet.`;
      } else {
        $('chat-feedback').textContent = `Now in ${nameOf(offer.mode)}. Ask here.`;
      }
      $('chat-input').focus();
    });
    actions.append(button);
  }
  if (event.mode === 'sources' && shown.kind === 'reply') {
    const link = element('a', 'Open source library ↗'); link.href = '#sources'; actions.append(link);
  }
  reply.append(actions); turn.append(user, reply); $('chat-transcript').append(turn);
}
function renderChat() {
  if (!allowed(chatMode)) chatMode = chatModes.find(allowed) || '';
  $('chat-mode').replaceChildren();
  for (const id of chatModes) {
    const option = element('option', `${nameOf(id)}${allowed(id) ? '' : ' · Paused'}`);
    option.value = id; option.disabled = !allowed(id); $('chat-mode').append(option);
  }
  if (!chatMode) { const option = element('option', 'Chat assistance paused'); option.value = ''; $('chat-mode').append(option); }
  $('chat-mode').value = chatMode;
  $('chat-assignment').textContent = state.assignment.title;
  $('chat-brief').textContent = state.assignment.brief;
  $('chat-policy').textContent = chatMode ? '◇  Guidance within assignment boundaries · You write the final work' : 'Chat assistance is paused. You can still write and save your draft.';
  const turns = [...state.activity.filter(event => event.type === 'request'), ...pendingChatTurns];
  const signature = JSON.stringify([turns, state.assignment.modes]);
  if (signature !== chatSignature) {
    lastOffers = '';
    $('chat-transcript').replaceChildren(); turns.forEach(appendChatTurn); chatSignature = signature;
    if (turns.length && (location.hash === '#chat' || !location.hash)) latestTurn();
  }
  $('chat-welcome').hidden = turns.length > 0;
  $('chat-transcript').hidden = turns.length === 0;
  $('page-chat').classList.toggle('is-empty', turns.length === 0);
}
$('chat-input').addEventListener('input', () => {
  $('chat-count').textContent = `${$('chat-input').value.length.toLocaleString()} / 2,000`; controls();
});
$('chat-mode').addEventListener('change', () => { chatMode = $('chat-mode').value; controls(); });
document.querySelectorAll('[data-chat-mode]').forEach(button => button.addEventListener('click', () => {
  if (busy || !allowed(button.dataset.chatMode)) return;
  chatMode = button.dataset.chatMode; $('chat-mode').value = chatMode;
  $('chat-input').value = button.dataset.prompt;
  $('chat-input').dispatchEvent(new Event('input')); $('chat-input').focus();
}));
$('chat-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!$('chat-send').disabled) $('chat-form').requestSubmit();
  }
});
$('chat-form').addEventListener('submit', event => {
  event.preventDefault();
  const message = $('chat-input').value.trim(); const modeId = chatMode;
  if (busy || !state || !allowed(modeId) || !message) return;
  if (message.length > 2000) { $('chat-feedback').textContent = 'Keep your message within 2,000 characters.'; return; }
  action(async () => {
    $('chat-feedback').textContent = 'Checking your request against the assignment boundaries…';
    try {
      const shown = await api('/api/turn', { message, modeId });
      // A successful POST must not be retried just because the subsequent history fetch fails.
      pendingChatTurns.push({ asked: message, mode: modeId, shown });
      $('chat-input').value = ''; $('chat-count').textContent = '0 / 2,000';
      renderChat();
      try { await refresh(); $('chat-feedback').textContent = 'Response received. Request and reply recorded in shared activity.'; }
      catch { $('chat-feedback').textContent = 'Response received and recorded. Activity could not refresh; reload to sync. Do not resend this message.'; }
      $('chat-transcript').lastElementChild?.scrollIntoView?.({ block: 'nearest' });
    } catch (error) {
      $('chat-feedback').textContent = `${error.message} Your message is still here. Try sending again.`;
    }
  }).then(() => { if (location.hash === '#chat' || !location.hash) $('chat-input').focus(); });
});
window.addEventListener('hashchange', () => { notice(''); route(); });
$('teacher-view').addEventListener('click', () => { location.hash = location.hash === '#teacher' ? 'workspace' : 'teacher'; });
document.querySelectorAll('[data-mode]').forEach(node => node.addEventListener('click', () => chooseMode(node.dataset.mode)));
$('draft-text').addEventListener('input', () => { if (state) draftStatus(); });
window.addEventListener('beforeunload', event => { if (state && $('draft-text').value !== state.draft) { event.preventDefault(); event.returnValue = ''; } });
$('save-draft').addEventListener('click', () => action(async () => {
  const text = $('draft-text').value;
  await api('/api/draft', { text }); state.draft = text; review = null; $('writing-response').hidden = true;
  await refresh(); notice('Draft saved in this demo session and added to the shared record.');
}));
$('policy-form').addEventListener('submit', event => {
  event.preventDefault();
  // Capture before the mutation lock disables the checkboxes (disabled inputs are omitted by FormData).
  const modes = [...new FormData(event.currentTarget).getAll('modes')];
  action(async () => {
    await api('/api/policy', { modes }); review = null; $('response').hidden = true; $('writing-response').hidden = true;
    await refresh(); notice('Permissions saved. They apply to the next student request.');
  });
});
$('request-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!selected || writingMode()) return;
  const message = $('request-text').value.trim(); const modeId = selected;
  if (!message) { notice('Enter what you would like help with.', true); return; }
  action(async () => { const shown = await api('/api/turn', { message, modeId }); await refresh(); renderResponse(shown, modeId); notice('Request and outcome added to the shared activity record.'); });
});
document.querySelectorAll('[data-review]').forEach(button => {
  lockable(button);
  button.addEventListener('click', () => action(async () => {
    const kind = button.dataset.review;
    review = { ...await api('/api/review', { kind, text: $('draft-text').value }), kind };
    await refresh(); renderReview(); notice('Writing review added to your activity. You choose each change.');
  }));
});
$('source-search').addEventListener('input', () => { if (state) renderSources(); });
$('saved-filter').addEventListener('click', () => { if (state) { savedOnly = !savedOnly; renderSources(); } });
$('activity-filter').addEventListener('change', () => { if (state) renderActivity(); });
$('download-draft').addEventListener('click', () => { if (state?.draft) download('my-saved-draft.txt', state.draft, 'text/plain'); });
$('export-activity').addEventListener('click', () => { if (state) download('learning-activity.json', JSON.stringify({ assignment: state.assignment.title, activity: state.activity }, null, 2), 'application/json'); });
$('pilot-reset').addEventListener('click', () => { if (window.PathWayPilot && window.confirm('Start again? This clears the practice record kept in this browser.')) window.PathWayPilot.reset(); });
lockable($('policy-form').querySelector('button'));
async function init() {
  controls(); route(false); $('draft-text').disabled = true;
  try {
    state = await api('/api/state');
    $('product-name').textContent = 'PathWay AI';
    // In the browser pilot the record lives in this browser, so a visitor can start again.
    $('pilot-reset').hidden = !window.PathWayPilot;
    $('assignment-title').textContent = state.assignment.title; $('subject').textContent = state.assignment.subject; $('brief').textContent = state.assignment.brief;
    $('skills').replaceChildren(...state.assignment.skills.map(skill => element('span', skill)));
    $('draft-text').value = state.draft; $('draft-text').disabled = false;
    renderAll(); route(false);
  } catch (error) { notice(`${error.message} Reload the page to reconnect.`, true); }
}
init();
