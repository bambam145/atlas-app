// Piezas de interfaz reutilizables (devuelven HTML).
import { icon } from './icons.js';
import { esc, fmtTime, fmtDay, today, addDays } from './util.js';
import { statusOf, streakOf, streakText, isCounter, isWeekly, countOf, targetOf, weekCount, perWeekOf,
  isChoice, isSleep, isQuit, choiceLabelOf, timeOf, isGlasses, litersText, sleepOf, sleepMinutes, fmtDuration, sleepGoalOf, challengeOf, bestOf,
  savedOf, moneyText } from './habits.js';
import { taskMeta, CATEGORY_ICON, isOverdue, repeatLabel } from './tasks.js';

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

// Anillo de progreso para hábitos con contador (3/8). Pasada la meta muestra "+2".
export function counterRing(count, target) {
  const pct = Math.min(100, Math.round((count / target) * 100));
  const inner = count > target ? `<b>+${count - target}</b>` : count === target ? icon('check') : `<b>${count}</b>`;
  return `<span class="ring${count >= target ? ' is-on' : ''}" style="--p:${pct}" aria-hidden="true">${inner}</span>`;
}

// Círculo de estado con color: verde = bien, lavanda = a medias, gris = no lo hice.
export const TONE = { done: 'good', meh: 'meh', none: 'none' };
const toneCheck = (s) => `<span class="check tone ${TONE[s] || ''}${s && s !== 'skip' ? ' is-on' : ''}" aria-hidden="true">${s === 'none' ? icon('minus') : icon('check')}</span>`;

// Texto corto del registro: "Sano · 8:15 am", "7 h 30 min", "10 de 8 vasos · 2,5 L".
function registeredInfo(h, d, s) {
  const at = timeOf(h, d);
  const when = at ? ` · ${fmtTime(at)}` : '';
  if (isSleep(h)) {
    const rec = sleepOf(d);
    const min = sleepMinutes(rec);
    const night = isToday(d) && new Date().getHours() >= 18 && !sleepOf(addDays(d, 1))?.bed ? `<span>${icon('moon')} Toca al acostarte</span>` : '';
    if (min !== null) return `<span class="tone-text ${TONE[s]}">${fmtDuration(min)}</span><span>${fmtTime(rec.bed)} → ${fmtTime(rec.wake)}</span>${night}`;
    if (rec?.bed) return `<span>${icon('moon')} Te acostaste ${fmtTime(rec.bed)} · toca al despertar</span>`;
    return `<span>${icon('moon')} Meta ${String(sleepGoalOf(h)).replace('.', ',')} h · toca para registrar</span>`;
  }
  if (isQuit(h)) {
    const saved = savedOf(h);
    return s === 'none' ? `<span class="tone-text none">Recaíste · mañana empiezas de nuevo</span>`
      : `<span class="tone-text good">Limpio hoy</span>${saved ? `<span>Ahorraste ${moneyText(h, saved)}</span>` : `<span>Récord ${bestOf(h)}</span>`}`;
  }
  if (isChoice(h)) return s ? `<span class="tone-text ${TONE[s]}">${esc(choiceLabelOf(h, s))}${when}</span>` : `<span>${icon('repeat')} Toca para registrar</span>`;
  if (s === 'done') return `<span>${icon('check')} Hecho${when}</span>`;
  return `<span>${icon('repeat')} Hábito</span>`;
}

// Fila de hábito para Hoy / Agenda.
export function habitRow(h, d, { pop } = {}) {
  const s = statusOf(h, d);
  const counter = isCounter(h);
  const weekly = isWeekly(h);
  const toned = isChoice(h) || isSleep(h) || isQuit(h);
  const count = counter ? countOf(h, d) : 0;
  const cls = s === 'skip' ? ' is-skip' : s ? ' is-done' : '';
  const n = streakOf(h);
  let info;
  if (s === 'skip') info = `<span>${icon('moon')} Descanso · racha a salvo</span>`;
  else if (weekly) info = `<span>${icon('repeat')} ${weekCount(h, d)} de ${perWeekOf(h)} esta semana</span>`;
  else if (counter) {
    const extra = count > targetOf(h) ? ` · +${count - targetOf(h)} 🎉` : '';
    info = `<span>${icon('repeat')} ${count} de ${targetOf(h)} ${esc(h.unit || 'veces')}${isGlasses(h) && count ? ` · ${litersText(count)}` : ''}${extra}</span>`;
  } else info = registeredInfo(h, d, s);
  const ch = challengeOf(h);
  const reto = ch ? `<span class="reto-tag${ch.complete ? ' is-done' : ''}">${ch.complete ? '🏅' : icon('target')} Reto ${ch.done}/${ch.days}</span>` : '';
  const meta = `${info}${s === 'skip' ? '' : `<span class="${n ? 'fire' : ''}">${icon('flame')} ${streakText(n, h)}</span>`}${reto}`;
  return `
    <div class="item${cls}${toned ? ' is-toned' : ''}${pop ? ' pop' : ''}${counter ? ' is-counter' : ''}" data-action="toggle-habit" data-id="${h.id}" role="button" tabindex="0" aria-pressed="${s === 'done'}"${counter ? ` aria-label="${esc(h.name)}: ${count} de ${targetOf(h)}. Toca para sumar uno."` : ''}>
      ${timeCol(h.time)}
      <div class="item-card">
        ${counter ? counterRing(count, targetOf(h)) : toned ? toneCheck(s) : checkbox(s === 'done')}
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
  if (t.repeat) meta.push(`<span>${icon('repeat')} ${repeatLabel(t)}</span>`);
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
// undo: función que revierte lo que se acaba de hacer (muestra el botón "Deshacer").
export function toast(msg, undo) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('has-undo', !!undo);
  if (undo) {
    const b = document.createElement('button');
    b.className = 'toast-undo';
    b.textContent = 'Deshacer';
    b.onclick = () => { el.classList.remove('is-on'); undo(); };
    el.append(b);
  }
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), undo ? 5000 : 2600);
}

// Cola de avisos (logros + nivel) para que no se pisen.
export function toastQueue(msgs) {
  msgs.forEach((m, i) => setTimeout(() => toast(m), i * 2800));
}

export const isToday = (d) => d.getTime() === today().getTime();
