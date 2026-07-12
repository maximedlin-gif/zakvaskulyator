/* Закваскулятор — локальная сборка отзыва */
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const getValue = selector => String($(selector).value || '').trim();
const draftKey = 'zk_feedback_draft';
const draftFields = ['#fb-area', '#fb-done', '#fb-problem', '#fb-calc', '#fb-journal', '#fb-device', '#fb-contact'];

function compactUserAgent(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function buildFeedbackText() {
  const area = getValue('#fb-area');
  const done = getValue('#fb-done') || '—';
  const problem = getValue('#fb-problem') || '—';
  const calc = getValue('#fb-calc');
  const journal = getValue('#fb-journal');
  const device = getValue('#fb-device') || '—';
  const contact = getValue('#fb-contact') || '—';

  const lines = [
    'Отзыв о Закваскуляторе',
    '',
    `Раздел: ${area}`,
    `Что получилось: ${done}`,
    `Что непонятно или сломалось: ${problem}`,
  ];

  if (calc) lines.push('', 'Скопированный расчёт:', calc);
  if (journal) lines.push('', 'Скопированный журнал:', journal);

  lines.push(
    '',
    `Устройство и браузер: ${device}`,
    `Контакт: ${contact}`,
    `Страница: ${location.href}`,
  );

  return lines.join('\n');
}

function setStatus(text) {
  const status = $('#fb-status');
  status.textContent = text;
  status.classList.remove('hidden');
}

function saveDraft() {
  const draft = Object.fromEntries(draftFields.map(selector => [selector, $(selector).value]));
  try {
    localStorage.setItem(draftKey, JSON.stringify(draft));
  } catch {}
}

function restoreDraft() {
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch {}
  if (!draft || typeof draft !== 'object') return false;
  draftFields.forEach(selector => {
    if (typeof draft[selector] === 'string') $(selector).value = draft[selector];
  });
  return true;
}

function clearDraft() {
  if (!window.confirm('Очистить черновик отзыва с этого устройства? Это действие нельзя отменить.')) return;
  try { localStorage.removeItem(draftKey); } catch {}
  draftFields.forEach(selector => { $(selector).value = selector === '#fb-area' ? $(selector).options[0].value : ''; });
  $('#fb-output').value = '';
  $('#fb-status').classList.add('hidden');
}

function buildIntoOutput() {
  const output = $('#fb-output');
  output.value = buildFeedbackText();
  output.focus();
  output.select();
  setStatus('Текст собран. Его можно скопировать и отправить.');
}

async function copyOutput() {
  const output = $('#fb-output');
  if (!output.value.trim()) buildIntoOutput();

  try {
    await navigator.clipboard.writeText(output.value);
  } catch {
    output.focus();
    output.select();
    document.execCommand('copy');
  }

  setStatus('Отзыв скопирован.');
}

async function pasteFromClipboard(targetSelector) {
  const target = $(targetSelector);
  if (!target) return;

  try {
    target.value = await navigator.clipboard.readText();
    target.focus();
    saveDraft();
    setStatus('Текст вставлен из буфера.');
  } catch {
    target.focus();
    setStatus('Браузер не дал доступ к буферу. Вставьте текст вручную.');
  }
}

function init() {
  if (!restoreDraft()) $('#fb-device').value = compactUserAgent(navigator.userAgent);
  draftFields.forEach(selector => {
    $(selector).addEventListener(selector === '#fb-area' ? 'change' : 'input', saveDraft);
  });
  $('#fb-build').addEventListener('click', buildIntoOutput);
  $('#fb-copy').addEventListener('click', copyOutput);
  $('#fb-clear').addEventListener('click', clearDraft);
  $$('[data-paste-target]').forEach(button => {
    button.addEventListener('click', () => pasteFromClipboard(button.dataset.pasteTarget));
  });
}

init();
