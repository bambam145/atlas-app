import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, addDays, mondayOf, longDate, esc, DAY_LETTER, DAY_SHORT, WEEK_ORDER, plural } from '../util.js';
import { isScheduled, statusOf, streakOf, byTime, dayStats, HABIT_SUGGESTIONS } from '../habits.js';
import { tasksOn, byTaskTime } from '../tasks.js';
import { progress } from '../xp.js';
import { pageHead, label, habitRow, taskRow, quickAdd, emptyState } from '../ui.js';
import { MOODS } from './diario.js';
import { cloud, cloudEnabled } from '../cloud.js';

export function greeting(allDone, hasItems) {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const n = state.profile?.name ? `, ${esc(state.profile.name)}` : '';
  if (!hasItems) return `${hello}${n}. <span>Hoy es día libre.</span>`;
  if (allDone) return `Diste lo mejor${n}. <span>Mañana será aún más.</span>`;
  return `${hello}${n}. <span>Un paso a la vez.</span>`;
}

export function renderHoy(ctx) {
  const t = today();
  const tk = keyOf(t);
  const themeBtn = `<button class="icon-btn theme-btn" data-action="theme" aria-label="Cambiar tema">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button>`;

  if (!state.habits.length && !state.tasks.length) {
    return pageHead({ eyebrow: longDate(), title: 'Empecemos. <span>Un hábito a la vez.</span>', right: themeBtn }) +
      emptyState('Tu primer hábito',
        'Toca una idea para agregarla al instante. Puedes cambiarla cuando quieras.',
        `<div class="chips">${HABIT_SUGGESTIONS.map(([e, n], i) => `<button class="chip" data-action="quick-habit" data-i="${i}">${e} ${n}</button>`).join('')}</div>
         <p class="hint">¿Prefieres empezar con una tarea? Escríbela abajo.</p>`) +
      quickAdd();
  }

  const habits = state.habits.filter((h) => isScheduled(h, t)).sort(byTime);
  const tasks = tasksOn(tk).sort(byTaskTime);
  const overdue = state.tasks.filter((x) => x.status !== 'done' && x.date && x.date < tk).sort(byTaskTime);

  const pending = [
    ...habits.filter((h) => !statusOf(h, t)).map((h) => ({ kind: 'h', time: h.time, item: h })),
    ...tasks.filter((x) => x.status !== 'done').map((x) => ({ kind: 't', time: x.time, item: x })),
  ].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const finished = [
    ...habits.filter((h) => statusOf(h, t)).map((h) => ({ kind: 'h', time: h.time, item: h })),
    ...tasks.filter((x) => x.status === 'done').map((x) => ({ kind: 't', time: x.time, item: x })),
  ].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

  const counted = habits.filter((h) => statusOf(h, t) !== 'skip').length + tasks.length;
  const doneCount = habits.filter((h) => statusOf(h, t) === 'done').length + tasks.filter((x) => x.status === 'done').length;
  const hasItems = habits.length + tasks.length > 0;
  const allDone = hasItems && pending.length === 0;
  const pct = counted ? Math.round((doneCount / counted) * 100) : 0;

  const row = (x) => (x.kind === 'h' ? habitRow(x.item, t, { pop: ctx.pop === x.item.id }) : taskRow(x.item, { pop: ctx.pop === x.item.id }));
  const free = state.habits.filter((h) => !isScheduled(h, t) && tk >= h.createdAt);

  const sub = hasItems
    ? `Hoy tienes <b>${plural(habits.length, 'hábito', 'hábitos')}</b> y <b>${plural(tasks.length, 'tarea', 'tareas')}</b>.`
    : 'Nada programado. Descansa o agrega algo abajo.';

  const main = `
    ${pageHead({ eyebrow: longDate(), title: greeting(allDone, hasItems), sub, right: themeBtn })}
    ${hasItems ? `<div class="progress${allDone ? ' is-full' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>` : ''}
    ${cloudBanner()}
    ${quickAdd()}
    ${overdue.length ? `<div class="group">${label('Atrasadas', overdue.length)}
      ${overdue.map((x) => taskRow(x, { showDate: true })).join('')}
      <button class="text-btn" data-action="overdue-to-today">${icon('arrowRight')} Mover todas a hoy</button></div>` : ''}
    ${pending.length ? `<div class="group">${label('Agenda', pending.length)}${pending.map(row).join('')}</div>` : ''}
    ${finished.length ? `<div class="group">${label('Completadas', finished.length)}${finished.map(row).join('')}</div>` : ''}
    ${free.length ? `<div class="group">${label('Hoy libre')}<div class="free-list">${free.map((h) => `<span class="free-chip">${h.emoji} ${esc(h.name)}</span>`).join('')}</div></div>` : ''}
    ${ideasHtml()}`;

  return `<div class="two-col"><section class="col-main">${main}</section><aside class="col-side">${sidePanels()}</aside></div>`;
}

// Aviso para crear cuenta cuando ya hay datos que proteger.
export function cloudBannerVisible() {
  return cloudEnabled && cloud.status === 'signedout' && !state.ui.cloudBannerOff &&
    state.habits.length + state.tasks.length >= 2;
}

function cloudBanner() {
  if (!cloudBannerVisible()) return '';
  return `
    <div class="banner">
      <span class="banner-icon">${icon('shield')}</span>
      <span class="banner-body"><b>Protege tu progreso</b><small>Crea tu cuenta gratis y sincroniza celular y computadora.</small></span>
      <button class="pill small" data-action="login">Crear cuenta</button>
      <button class="icon-btn sm" data-action="cloud-banner-off" aria-label="Ocultar aviso">${icon('x')}</button>
    </div>`;
}

// Mientras tengas pocos hábitos, sugerir más con un toque.
function ideasHtml() {
  if (state.habits.length >= 3) return '';
  const ideas = HABIT_SUGGESTIONS.map(([e, n], i) => ({ e, n, i })).filter((x) => !state.habits.some((h) => h.name === x.n)).slice(0, 6);
  return `<div class="group">${label('Ideas para sumar')}<div class="chips">${ideas.map((x) => `<button class="chip" data-action="quick-habit" data-i="${x.i}">${x.e} ${x.n}</button>`).join('')}</div></div>`;
}

export function levelCard(compact = false) {
  const p = progress();
  return `
    <button class="level-card${compact ? ' compact' : ''}" data-action="nav" data-view="logros" aria-label="Nivel ${p.level}, ver logros">
      <span class="level-badge">${p.level}</span>
      <span class="level-body">
        <span class="level-title">Nivel ${p.level} · ${p.title}</span>
        <span class="xp-bar"><i style="width:${Math.round(p.pct * 100)}%"></i></span>
        <span class="level-sub">${p.into} / ${p.need} XP</span>
      </span>
    </button>`;
}

function sidePanels() {
  const t = today();
  const mon = mondayOf(t);
  const bars = WEEK_ORDER.map((_, i) => {
    const d = addDays(mon, i);
    const future = d > t;
    const s = dayStats(d);
    const pct = !future && s.total ? Math.round((s.done / s.total) * 100) : 0;
    const cls = ['bar', future && 'is-future', i === (t.getDay() + 6) % 7 && 'is-today', pct === 100 && 'is-perfect'].filter(Boolean).join(' ');
    const tip = future ? `${DAY_SHORT[d.getDay()]}: —` : `${DAY_SHORT[d.getDay()]}: ${pct}% · ${s.done}/${s.total} hábitos`;
    return `<div class="${cls}" data-tip="${tip}"><div class="bar-track"><i style="height:${pct}%"></i></div><span>${DAY_LETTER[d.getDay()]}</span></div>`;
  }).join('');

  const top = state.habits.map((h) => ({ h, n: streakOf(h) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4);
  const streaks = top.length
    ? `<div class="top-list">${top.map(({ h, n }) => `<div class="top-item"><span class="item-emoji sm">${h.emoji}</span><div>${esc(h.name)}</div><b>${n}</b><span class="fire">${icon('flame')}</span></div>`).join('')}</div>`
    : '<p class="panel-note">Marca tus hábitos hoy y aquí verás crecer tus rachas.</p>';

  const entry = state.journal[keyOf(t)];
  const moods = `<div class="moods">${MOODS.map((m, i) => `<button class="mood${entry?.mood === i + 1 ? ' is-on' : ''}" data-action="mood" data-v="${i + 1}" data-tip="${m[1]}" aria-label="${m[1]}">${m[0]}</button>`).join('')}</div>`;

  return `
    <section class="panel">${label('Esta semana')}<div class="bars">${bars}</div></section>
    <section class="panel">${label('Mejores rachas')}${streaks}</section>
    <section class="panel">${label('¿Cómo te sientes hoy?')}${moods}
      <button class="text-btn" data-action="nav" data-view="diario">${icon('feather')} ${entry?.text ? 'Ver nota de hoy' : 'Escribir en el diario'}</button></section>`;
}
