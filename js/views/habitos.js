import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, addDays, mondayOf, esc, fmtTime, DAY_LETTER, WEEK_ORDER } from '../util.js';
import {
  isScheduled, statusOf, streakOf, bestOf, rateOf, skipsThisWeek, freqLabel, byTime, SKIPS_PER_WEEK,
  isCounter, isWeekly, countOf, targetOf, weekCount, perWeekOf,
} from '../habits.js';
import { pageHead, emptyState } from '../ui.js';

const GRID_WEEKS = 20;

function gridHtml(h) {
  const t = today();
  const tk = keyOf(t);
  const start = addDays(mondayOf(t), -(GRID_WEEKS - 1) * 7);
  const counter = isCounter(h);
  const weekly = isWeekly(h);
  let out = '';
  for (let i = 0; i < GRID_WEEKS * 7; i++) {
    const d = addDays(start, i);
    const k = keyOf(d);
    let c = 'dot';
    let tip = '';
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    if (d > t) c += ' future';
    else if (isScheduled(h, d)) {
      const s = statusOf(h, d);
      const n = counter ? countOf(h, d) : 0;
      if (s === 'done') { c += ' done'; tip = `${label}: cumplido`; }
      else if (s === 'skip') { c += ' skip'; tip = `${label}: descanso`; }
      else if (counter && n > 0) { c += ' part'; tip = `${label}: ${n}/${targetOf(h)}`; }
      else if (weekly) { c += ' off'; tip = `${label}: —`; } // en semanales, no hacerlo un día no es fallar
      else if (k === tk) { c += ' pending'; tip = `${label}: pendiente`; }
      else { c += ' miss'; tip = `${label}: no cumplido`; }
    }
    out += `<i class="${c}"${tip ? ` data-tip="${tip}"` : ''}></i>`;
  }
  return `<div class="grid">${out}</div>`;
}

function weekHtml(h) {
  const t = today();
  const mon = mondayOf(t);
  return `<div class="week">${WEEK_ORDER.map((_, i) => {
    const d = addDays(mon, i);
    let c = 'wd';
    if (!isWeekly(h) && !h.days.includes(d.getDay())) c += ' off';
    else if (statusOf(h, d) === 'done') c += ' done';
    else if (statusOf(h, d) === 'skip') c += ' skip';
    if (keyOf(d) === keyOf(t)) c += ' today';
    return `<span class="${c}">${DAY_LETTER[d.getDay()]}</span>`;
  }).join('')}</div>`;
}

function cardHtml(h) {
  const t = today();
  const s = statusOf(h, t);
  const scheduled = isScheduled(h, t);
  const rate = rateOf(h, 30);
  const weekly = isWeekly(h);
  const counter = isCounter(h);
  const canSkip = !weekly && scheduled && s !== 'done' && (s === 'skip' || skipsThisWeek(h) < SKIPS_PER_WEEK);

  let main;
  if (!scheduled) main = `<button class="pill soft" disabled>Hoy libre</button>`;
  else if (counter && s !== 'done') {
    main = `<button class="pill" data-action="toggle-habit" data-id="${h.id}">${icon('plus')} Sumar 1 · ${countOf(h, t)}/${targetOf(h)}</button>`;
  } else if (s === 'done') main = `<button class="pill soft" data-action="toggle-habit" data-id="${h.id}">${icon('check')} Hecho</button>`;
  else main = `<button class="pill" data-action="toggle-habit" data-id="${h.id}">${icon('check')} Hecho hoy</button>`;

  const skipBtn = canSkip || (s === 'skip' && !weekly)
    ? `<button class="pill ghost small" data-action="skip-habit" data-id="${h.id}" ${canSkip ? '' : 'disabled'} data-tip="1 descanso por semana sin romper la racha">${icon('moon')}${s === 'skip' ? 'Quitar' : 'Descansar'}</button>`
    : '';
  const shareBtn = `<button class="pill ghost small" data-action="share-habit" data-id="${h.id}" aria-label="Compartir mi racha" data-tip="Compartir mi racha">${icon('share')}</button>`;
  const unitLabel = weekly ? 'Semanas' : 'Racha';

  return `
    <article class="card">
      <header class="card-head">
        <span class="item-emoji" aria-hidden="true">${h.emoji}</span>
        <div><h3>${esc(h.name)}</h3><p>${icon('repeat')} ${esc(freqLabel(h))}${h.time ? ` · ${fmtTime(h.time)}` : ''}</p></div>
        <button class="icon-btn" data-action="edit-habit" data-id="${h.id}" aria-label="Editar ${esc(h.name)}">${icon('more')}</button>
      </header>
      <div class="stats">
        <div class="stat"><b>${streakOf(h)}</b><span>${icon('flame')} ${unitLabel}</span></div>
        <div class="stat"><b>${bestOf(h)}</b><span>${icon('trophy')} Récord</span></div>
        <div class="stat"><b>${rate === null ? '—' : rate + '%'}</b><span>${icon('chart')} 30 días</span></div>
      </div>
      ${weekly ? `<p class="week-goal">${icon('target')} Esta semana: <b>${weekCount(h, t)} de ${perWeekOf(h)}</b>${weekCount(h, t) >= perWeekOf(h) ? ' · ¡meta cumplida! 🎉' : ''}</p>` : ''}
      ${gridHtml(h)}
      ${weekHtml(h)}
      <div class="actions">${main}${skipBtn}${shareBtn}</div>
    </article>`;
}

export function renderHabitos() {
  const head = pageHead({
    eyebrow: 'Hábitos',
    title: 'La constancia <span>se construye día a día.</span>',
    sub: state.habits.length ? 'Cada punto es un día. <b>Blanco</b> = cumplido, <b>anillo</b> = descanso.' : '',
    right: `<button class="pill small head-btn" data-action="new-habit">${icon('plus')} Nuevo hábito</button>`,
  });
  if (!state.habits.length) {
    return head + emptyState('Aún no tienes hábitos', 'Aquí verás tus rachas y tu calendario de constancia.',
      `<button class="pill" data-action="new-habit">${icon('plus')} Crear hábito</button>`);
  }
  return head + `<div class="cards">${[...state.habits].sort(byTime).map(cardHtml).join('')}</div>`;
}
