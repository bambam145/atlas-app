// Piezas de interfaz reutilizables (devuelven HTML).
import { icon } from './icons.js';
import { esc, fmtTime, fmtDay, today } from './util.js';
import { statusOf, streakOf, streakText, isCounter, isWeekly, countOf, targetOf, weekCount, perWeekOf } from './habits.js';
import { taskMeta, CATEGORY_ICON, isOverdue } from './tasks.js';

export function pageHead({ eyebrow, title, sub = '', right = '' }) {
  return `
    <header class="page-head">
      <div class="top"><span class="eyebrow">${eyebrow}</span>${right}</div>
      <h1 class="title">${title}</h1>
      ${sub ? `<p class="summary">${sub}</p>` : ''}
    </header>`;
}

export const label = (text, count = '') =>
  `<p class="label"><span>${text}</span>${count !== '' ? `<span>${count}</span>` : ''}</p>`;

export const checkbox = (on, cls = '') => `<span class="check ${cls}${on ? ' is-on' : ''}" aria-hidden="true">${icon('check')}</span>`;

export const pillTag = (text, tone = '') => `<span class="tag${tone ? ` tag-${tone}` : ''}">${text}</span>`;

// Anillo de progreso para hábitos con contador (3/8).
export function counterRing(count, target) {
  const pct = Math.round((count / target) * 100);
  return `<span class="ring${count >= target ? ' is-on' : ''}" style="--p:${pct}" aria-hidden="true">${count >= target ? icon('check') : `<b>${count}</b>`}</span>`;
}

// Fila de hábito para Hoy / Agenda.
export function habitRow(h, d, { pop } = {}) {
  const s = statusOf(h, d);
  const counter = isCounter(h);
  const weekly = isWeekly(h);
  const count = counter ? countOf(h, d) : 0;
  const cls = s === 'done' ? ' is-done' : s === 'skip' ? ' is-skip' : '';
  const n = streakOf(h);
  let info;
  if (s === 'skip') info = `<span>${icon('moon')} Descanso · racha a salvo</span>`;
  else if (weekly) info = `<span>${icon('repeat')} ${weekCount(h, d)} de ${perWeekOf(h)} esta semana</span>`;
  else if (counter) info = `<span>${icon('repeat')} ${count} de ${targetOf(h)} ${esc(h.unit || 'veces')}</span>`;
  else info = `<span>${icon('repeat')} Hábito</span>`;
  const meta = `${info}${s === 'skip' ? '' : `<span class="${n ? 'fire' : ''}">${icon('flame')} ${streakText(n, h)}</span>`}`;
  return `
    <div class="item${cls}${pop ? ' pop' : ''}${counter ? ' is-counter' : ''}" data-action="toggle-habit" data-id="${h.id}" role="button" tabindex="0" aria-pressed="${s === 'done'}"${counter ? ` aria-label="${esc(h.name)}: ${count} de ${targetOf(h)}. Toca para sumar uno."` : ''}>
      ${timeCol(h.time)}
      <div class="item-card">
        ${counter ? counterRing(count, targetOf(h)) : checkbox(s === 'done')}
        <span class="item-emoji" aria-hidden="true">${h.emoji}</span>
        <span class="item-body">
          <span class="item-title">${esc(h.name)}</span>
          <span class="item-meta">${meta}</span>
        </span>
        ${counter && count > 0 ? `<button class="icon-btn sm counter-dec" data-action="habit-dec" data-id="${h.id}" aria-label="Restar uno">${icon('minus')}</button>` : ''}
      </div>
    </div>`;
}

// Fila de tarea (lista / hoy).
export function taskRow(t, { showDate = false, pop = false } = {}) {
  const done = t.status === 'done';
  const meta = [];
  if (t.category) meta.push(`<span>${icon(CATEGORY_ICON[t.category] || 'tag')} ${esc(t.category)}</span>`);
  for (const m of taskMeta(t)) meta.push(`<span>${icon('star')} ${m}</span>`);
  if (showDate && t.date) meta.push(`<span class="${isOverdue(t) ? 'bad' : ''}">${icon('calendar')} ${fmtDay(t.date)}</span>`);
  if (t.status === 'doing') meta.push(`<span class="warn">${icon('zap')} Haciendo</span>`);
  if (t.subtasks?.length) meta.push(`<span>${icon('subtask')} ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}</span>`);
  return `
    <div class="item${done ? ' is-done' : ''}${pop ? ' pop' : ''}">
      ${timeCol(t.time)}
      <div class="item-card" data-action="edit-task" data-id="${t.id}" role="button" tabindex="0">
        <button class="check-btn" data-action="toggle-task" data-id="${t.id}" aria-label="${done ? 'Marcar como pendiente' : 'Completar'} ${esc(t.title)}">${checkbox(done, 'square')}</button>
        <span class="item-body">
          <span class="item-title">${esc(t.title)}</span>
          ${meta.length ? `<span class="item-meta">${meta.join('')}</span>` : ''}
        </span>
      </div>
    </div>`;
}

function timeCol(time) {
  if (!time) return '<span class="item-time"></span>';
  const [hm, ap] = fmtTime(time).split(' ');
  return `<span class="item-time">${hm}<small>${ap}</small></span>`;
}

export function quickAdd(placeholder = (innerWidth < 480 ? 'Nueva tarea… ej: Gym 7am' : 'Agregar tarea… ej: Llamar a mamá mañana 3pm')) {
  return `
    <form class="quick" data-form="quick-task" autocomplete="off">
      ${icon('plus')}
      <input name="q" class="quick-input" placeholder="${placeholder}" aria-label="Agregar tarea" enterkeyhint="send">
      <button class="quick-send" aria-label="Agregar">${icon('arrowRight')}</button>
    </form>`;
}

export function segmented(items, active, action) {
  return `<div class="seg" role="tablist">${items.map(([id, text, ic]) =>
    `<button class="seg-btn${id === active ? ' is-on' : ''}" role="tab" aria-selected="${id === active}" data-action="${action}" data-v="${id}">${ic ? icon(ic) : ''}${text}</button>`).join('')}</div>`;
}

export function emptyState(title, text, actions = '') {
  return `<section class="empty"><h3>${title}</h3><p>${text}</p>${actions}</section>`;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// Cola de avisos (logros + nivel) para que no se pisen.
export function toastQueue(msgs) {
  msgs.forEach((m, i) => setTimeout(() => toast(m), i * 2800));
}

export const isToday = (d) => d.getTime() === today().getTime();
