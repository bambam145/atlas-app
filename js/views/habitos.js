import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, fromKey, addDays, mondayOf, esc, fmtTime, DAY_LETTER, WEEK_ORDER, MONTHS } from '../util.js';

const fmtShort = (k) => { const d = fromKey(k); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
import {
  isScheduled, statusOf, streakOf, bestOf, rateOf, skipsThisWeek, freqLabel, byTime, SKIPS_PER_WEEK,
  isCounter, isWeekly, countOf, targetOf, weekCount, perWeekOf, isChoice, isSleep, choiceLabelOf, sleepOf, sleepMinutes, fmtDuration,
  isQuit, challengeOf, CHALLENGES, HABIT_SUGGESTIONS, activePause, activeHabits,
} from '../habits.js';
import { pageHead, emptyState, label } from '../ui.js';

const GRID_WEEKS = 20;

function gridHtml(h) {
  const t = today();
  const tk = keyOf(t);
  const start = addDays(mondayOf(t), -(GRID_WEEKS - 1) * 7);
  const counter = isCounter(h);
  const weekly = isWeekly(h);
  const toned = isChoice(h) || isSleep(h) || isQuit(h);
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
      if (toned && (s === 'done' || s === 'meh' || s === 'none')) { c += ` ${TONE[s]}`; tip = `${label}: ${toneTip(h, d, s)}`; }
      else if (s === 'done') { c += ' done'; tip = `${label}: ${counter ? `${n} ${h.unit || 'veces'}` : 'cumplido'}`; }
      else if (s === 'skip') { c += ' skip'; tip = `${label}: descanso`; }
      else if (counter && n > 0) { c += ' part'; tip = `${label}: ${n}/${targetOf(h)}`; }
      else if (weekly) { c += ' off'; tip = `${label}: —`; } // en semanales, no hacerlo un día no es fallar
      else if (k === tk) { c += ' pending'; tip = `${label}: pendiente`; }
      else { c += ' miss'; tip = `${label}: no cumplido`; }
    }
    const editable = d <= t && isScheduled(h, d);
    out += `<i class="${c}"${tip ? ` data-tip="${tip}"` : ''}${editable ? ` data-action="day-edit" data-id="${h.id}" data-date="${k}"` : ''}></i>`;
  }
  return `<div class="grid">${out}</div>`;
}

const TONE = { done: 'good', meh: 'meh', none: 'none' };
function toneTip(h, d, s) {
  if (isQuit(h)) return s === 'none' ? 'recaída' : 'limpio';
  if (isSleep(h)) { const m = sleepMinutes(sleepOf(d)); return m === null ? 'registrado' : fmtDuration(m); }
  return choiceLabelOf(h, s);
}

function weekHtml(h) {
  const t = today();
  const mon = mondayOf(t);
  return `<div class="week">${WEEK_ORDER.map((_, i) => {
    const d = addDays(mon, i);
    let c = 'wd';
    if (!isWeekly(h) && !h.days.includes(d.getDay())) c += ' off';
    else {
      const s = statusOf(h, d);
      if ((isChoice(h) || isSleep(h) || isQuit(h)) && TONE[s]) c += ` ${TONE[s]}`;
      else if (s === 'done') c += ' done';
      else if (s === 'skip') c += ' skip';
    }
    if (keyOf(d) === keyOf(t)) c += ' today';
    const editable = d <= t && isScheduled(h, d);
    return editable
      ? `<button class="${c}" data-action="day-edit" data-id="${h.id}" data-date="${keyOf(d)}" aria-label="Editar ${DAY_LETTER[d.getDay()]} ${d.getDate()}">${DAY_LETTER[d.getDay()]}</button>`
      : `<span class="${c}">${DAY_LETTER[d.getDay()]}</span>`;
  }).join('')}</div>`;
}

function cardHtml(h) {
  const t = today();
  const s = statusOf(h, t);
  const scheduled = isScheduled(h, t);
  const rate = rateOf(h, 30);
  const weekly = isWeekly(h);
  const counter = isCounter(h);
  const canSkip = !weekly && !isQuit(h) && scheduled && s !== 'done' && (s === 'skip' || skipsThisWeek(h) < SKIPS_PER_WEEK);

  let main;
  if (!scheduled) main = `<button class="pill soft" disabled>Hoy libre</button>`;
  else if (counter && s !== 'skip') {
    main = `<button class="pill" data-action="toggle-habit" data-id="${h.id}">${icon('plus')} Sumar 1 · ${countOf(h, t)}/${targetOf(h)}</button>`;
  } else if (isQuit(h)) {
    main = `<button class="pill${s === 'none' ? ' soft' : ''}" data-action="toggle-habit" data-id="${h.id}">${s === 'none' ? 'Recaíste hoy' : `<i class="tone-dot good"></i> Limpio hoy`}</button>`;
  } else if (isChoice(h) && s !== 'skip') {
    main = `<button class="pill${s ? ' soft' : ''}" data-action="toggle-habit" data-id="${h.id}">${s ? `<i class="tone-dot ${TONE[s]}"></i> ${esc(choiceLabelOf(h, s))}` : `${icon('check')} Registrar hoy`}</button>`;
  } else if (isSleep(h)) {
    const m = sleepMinutes(sleepOf(t));
    main = `<button class="pill${m !== null ? ' soft' : ''}" data-action="toggle-habit" data-id="${h.id}">${icon('moon')} ${m !== null ? fmtDuration(m) : 'Registrar sueño'}</button>`;
  } else if (s === 'done') main = `<button class="pill soft" data-action="toggle-habit" data-id="${h.id}">${icon('check')} Hecho</button>`;
  else main = `<button class="pill" data-action="toggle-habit" data-id="${h.id}">${icon('check')} Hecho hoy</button>`;

  const skipBtn = canSkip || (s === 'skip' && !weekly)
    ? `<button class="pill ghost small" data-action="skip-habit" data-id="${h.id}" ${canSkip ? '' : 'disabled'} data-tip="1 descanso por semana sin romper la racha">${icon('moon')}<span class="lbl">${s === 'skip' ? 'Quitar' : 'Descansar'}</span></button>`
    : '';
  const shareBtn = `<button class="pill ghost small" data-action="share-habit" data-id="${h.id}" aria-label="Compartir mi racha" data-tip="Compartir mi racha">${icon('share')}</button>`;
  const unitLabel = weekly ? 'Semanas' : isQuit(h) ? 'Días limpio' : 'Racha';
  const ch = challengeOf(h);
  const reto = ch ? `<div class="reto${ch.complete ? ' is-done' : ''}">
      <div class="reto-top"><span>${ch.complete ? '🏅 Reto cumplido' : `${icon('target')} Reto de ${ch.days} días`}</span><b>${ch.done}/${ch.days}</b>
        <button class="icon-btn sm" data-action="challenge-stop" data-id="${h.id}" aria-label="Dejar el reto">${icon('x')}</button></div>
      <span class="sum-bar"><i class="${ch.complete ? 'good' : 'done'}" style="width:${(ch.done / ch.days) * 100}%"></i></span>
    </div>` : '';

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
      ${reto}
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
    sub: state.habits.length ? `Cada punto es un día: tócalo para marcar o corregir ese día. <b>Blanco</b> = cumplido, <b>anillo</b> = descanso.${state.habits.some((h) => isChoice(h) || isSleep(h)) ? ' En comidas y sueño: <b class="tone-text good">verde</b> bien, <b class="tone-text meh">lavanda</b> a medias, <b class="tone-text none">gris</b> no lo hiciste.' : ''}` : '',
    right: `<div class="head-btns"><button class="pill ghost small head-btn" data-action="pause" aria-label="Pausa">${icon('moon')}<span class="lbl">${activePause() ? 'En pausa' : 'Pausa'}</span></button><button class="pill small head-btn" data-action="new-habit">${icon('plus')} Nuevo hábito</button></div>`,
  });
  if (!activeHabits().length && !state.habits.length) {
    return head + emptyState('Aún no tienes hábitos', 'Aquí verás tus rachas y tu calendario de constancia.',
      `<button class="pill" data-action="new-habit">${icon('plus')} Crear hábito</button>`);
  }
  const archived = state.habits.filter((h) => h.archivedAt);
  const arch = archived.length ? `<div class="group archived">
      <button class="text-btn" data-action="toggle-archived">${icon(state.ui.showArchived ? 'up' : 'down')} Archivados (${archived.length})</button>
      ${state.ui.showArchived ? `<div class="archived-list">${archived.map((h) => `
        <div class="archived-row"><span class="item-emoji sm">${h.emoji}</span><span class="archived-name">${esc(h.name)}<small>Récord ${bestOf(h)} · archivado ${fmtShort(h.archivedAt)}</small></span>
          <button class="pill ghost small" data-action="unarchive-habit" data-id="${h.id}">Reactivar</button>
          <button class="icon-btn sm" data-action="edit-habit" data-id="${h.id}" aria-label="Editar ${esc(h.name)}">${icon('more')}</button></div>`).join('')}</div>` : ''}
    </div>` : '';
  return head + retosHtml() + `<div class="cards">${activeHabits().sort(byTime).map(cardHtml).join('')}</div>${arch}`;
}

// Retos listos para empezar (los que ya están en curso no se repiten).
function retosHtml() {
  const busy = new Set(state.habits.filter((h) => challengeOf(h) && !challengeOf(h).complete).map((h) => h.name));
  const list = CHALLENGES.map((c, i) => ({ c, i })).filter(({ c }) => !busy.has(HABIT_SUGGESTIONS[c[3]][1]));
  if (!list.length) return '';
  return `<div class="group retos">${label('Empieza un reto')}<div class="chips scroll">${list.map(({ c: [e, t], i }) =>
    `<button class="chip" data-action="challenge-start" data-i="${i}">${e} ${t}</button>`).join('')}</div></div>`;
}
