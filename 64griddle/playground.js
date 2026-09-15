const editor = document.querySelector('#prompt-editor');
const adapter = PromptlineAdapter;
const examples = {
  build:
    'I would like you to build a modern task management app for my team. Make it professional and easy to use.',
  debugging: 'Fix the crash in our login form.',
  research:
    'Research the best approach for moving our customer support team to a four-day workweek. Compare the options and help us decide what to do.',
  writing:
    'I would like you to draft a professional email announcing our new onboarding process. Make it engaging and explain everything clearly so people know what to do next.',
  summarizing: 'Summarize the attached project report.',
  analysis: 'Analyze our sales data.',
  complete:
    'In the existing React repository, inspect the relevant files and build only a task list. Success criteria: users can add and complete a task. Preserve unrelated code. Run relevant tests. Return the patch and a concise summary.',
  simple: 'Explain recursion in two sentences.',
};
// Start with the user's own task. Examples are explicitly selected.
editor.textContent = '';

// A single session-only backup prevents Clear and example switches from
// discarding work. DOM clones preserve rich formatting in this owned editor.
let previousDraft = null;
const restoreButton = document.querySelector('#restore-draft');
const feedback = document.querySelector('#draft-feedback');
function snapshotDraft() {
  return [...editor.childNodes].map((node) => node.cloneNode(true));
}
function notifyDraftChanged() {
  editor.focus({ preventScroll: true });
  editor.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }),
  );
  PromptlineController.refresh();
  updateDraftInfo();
}
function setDraft(text) {
  // Replacing a draft keeps the one it replaced. An empty editor is not work, and neither is an
  // example the user never edited, so neither of those overwrites a real draft the user still has.
  const current = adapter.snapshot(editor).text;
  const worthKeeping = current.trim() && !Object.values(examples).includes(current);
  if (worthKeeping || !previousDraft) {
    previousDraft = snapshotDraft();
    restoreButton.disabled = !previousDraft.length;
  }
  editor.textContent = text;
  notifyDraftChanged();
  feedback.textContent = worthKeeping
    ? 'Previous draft kept in this tab. Use “Previous draft” to restore it.'
    : 'Your last edited draft is still available with “Previous draft”.';
}
function updateDraftInfo() {
  const text = adapter.snapshot(editor).text;
  const counts = PromptlineEngine.compareText(text, text);
  document.querySelector('#counts').textContent =
    `${counts.afterWords} words · ~${counts.afterTokens} tokens`;
  const chosen = Object.keys(examples).find((name) => examples[name] === text);
  document.querySelector('#draft-status').textContent = !text.trim()
    ? 'Empty draft'
    : chosen
      ? 'Example draft'
      : 'Your draft · in this tab';
  // The selector names the example on screen. Once the draft is your own, or cleared, it goes back
  // to its prompt, so the same example can be chosen again.
  document.querySelector('#example').value = chosen || '';
  for (const id of ['copy-draft', 'download-draft', 'review'])
    document.getElementById(id).disabled = !text.trim();
}
document.querySelector('#example').addEventListener('change', (event) => {
  if (examples[event.target.value]) setDraft(examples[event.target.value]);
});
document.querySelector('#clear').addEventListener('click', () => setDraft(''));
restoreButton.addEventListener('click', () => {
  if (!previousDraft) return;
  const current = snapshotDraft();
  editor.replaceChildren(...previousDraft);
  previousDraft = current;
  notifyDraftChanged();
  feedback.textContent =
    'Previous draft restored. Your other draft is still available with the same button.';
});
document.querySelector('#review').addEventListener('click', () => {
  editor.focus({ preventScroll: true });
  PromptlineController.review();
});
function openPreview() {
  // Return focus to the owned draft before opening its preview.
  editor.focus({ preventScroll: true });
  PromptlineController.preview();
  document
    .querySelector('promptline-assistant')
    ?.shadowRoot.querySelector('.preview-area')
    ?.focus();
}
document.querySelector('#copy-draft').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(adapter.snapshot(editor).text);
    feedback.textContent = 'Draft copied.';
  } catch {
    feedback.textContent = 'Clipboard unavailable. Select and copy your draft manually.';
  }
});
document.querySelector('#download-draft').addEventListener('click', () => {
  const blob = new Blob([adapter.snapshot(editor).text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '64griddle-draft.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback.textContent = 'Draft download started. The file contains only your current prompt.';
});
editor.addEventListener('input', () => {
  feedback.textContent = '';
  updateDraftInfo();
});
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
    event.preventDefault();
    if (adapter.snapshot(editor).text.trim()) openPreview();
  }
});
document.addEventListener('promptline:analysis', updateDraftInfo);
function wireDialog(id, openId, closeId) {
  const dialog = document.getElementById(id);
  document.getElementById(openId).addEventListener('click', () => dialog.showModal());
  document.getElementById(closeId).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  });
  return dialog;
}
const guide = wireDialog('guide', 'guide-open', 'guide-close');
wireDialog('install', 'install-open', 'install-close');
wireDialog('method', 'method-open', 'method-close');
for (const source of Object.values(PromptlineEngine.SOURCES)) {
  const link = document.createElement('a');
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  link.textContent = `${source.publisher} · ${source.title} ↗`;
  document.querySelector('#method-sources').append(link);
}
document.querySelector('#guide-done').addEventListener('click', () => {
  guide.close();
  editor.focus();
});
PromptlineController.setConfig({ agent: 'general', goal: 'balanced' });
updateDraftInfo();
