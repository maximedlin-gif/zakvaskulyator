/* Закваскулятор — локальная сборка отзыва */
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const getValue = selector => String($(selector).value || '').trim();

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
    setStatus('Текст вставлен из буфера.');
  } catch {
    target.focus();
    setStatus('Браузер не дал доступ к буферу. Вставьте текст вручную.');
  }
}

function init() {
  $('#fb-device').value = compactUserAgent(navigator.userAgent);
  $('#fb-build').addEventListener('click', buildIntoOutput);
  $('#fb-copy').addEventListener('click', copyOutput);
  $$('[data-paste-target]').forEach(button => {
    button.addEventListener('click', () => pasteFromClipboard(button.dataset.pasteTarget));
  });
}

init();
