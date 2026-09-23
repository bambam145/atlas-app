import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, fromKey, addDays, mondayOf, esc, fmtTime, toMinutes, fromMinutes, DAY_SHORT, MONTHS } from '../util.js';
import { isScheduled, statusOf } from '../habits.js';
import { pageHead, segmented } from '../ui.js';

export const START_H = 6;
export const END_H = 24;
export const HOUR_PX = 56;

// Tono suave por categoría (estilo D). Sin categoría → pastilla gris (estilo B).
const TONES = ['blue', 'teal', 'violet', 'amber', 'rose', 'slate'];
const FIXED_TONE = { Trabajo: 'blue', Personal: 'teal', Estudio: 'violet', Salud: 'rose', Casa: 'amber' };
export function toneOf(category) {
  if (!category || state.ui.plannerColors === false) return '';
  if (FIXED_TONE[category]) return FIXED_TONE[category];
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export const isDesktop = () => window.matchMedia('(min-width: 960px)').matches;
export const plannerMode = () => state.ui.plannerMode || (isDesktop() ? 'semana' : 'dia');
export const plannerAnchor = () => (state.ui.plannerAnchor ? fromKey(state.ui.plannerAnchor) : today());

function rangeLabel(days) {
  const a = days[0];
  const b = days[days.length - 1];
  if (days.length === 1) return `${DAY_SHORT[a.getDay()]} ${a.getDate()} de ${MONTHS[a.getMonth()]}`;
  const ma = MONTHS[a.getMonth()].slice(0, 3);
  const mb = MONTHS[b.getMonth()].slice(0, 3);
  return ma === mb ? `${a.getDate()} – ${b.getDate()} ${mb}` : `${a.getDate()} ${ma} – ${b.getDate()} ${mb}`;
}

// Reparte bloques que se cruzan en carriles lado a lado.
function layout(items) {
  items.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) {
      let lane = lanes.findIndex((end) => end <= it.start);
      if (lane === -1) { lane = lanes.length; lanes.push(it.end); } else lanes[lane] = it.end;
      it.lane = lane;
    }
    for (const it of cluster) { it.lanes = lanes.length; out.push(it); }
    cluster = [];
  };
  for (const it of items) {
    if (it.start >= clusterEnd && cluster.length) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

function dayItems(d) {
  const k = keyOf(d);
  const items = [];
  for (const t of state.tasks) {
    if (t.date !== k || !t.time) continue;
    const start = toMinutes(t.time);
    items.push({ kind: 't', id: t.id, title: t.title, start, end: start + Math.max(15, t.duration || 30), done: t.status === 'done', doing: t.status === 'doing', tone: toneOf(t.category) });
  }
  for (const h of state.habits) {
    if (!h.time || !isScheduled(h, d)) continue;
    const start = toMinutes(h.time);
    items.push({ kind: 'h', id: h.id, title: `${h.emoji} ${h.name}`, start, end: start + 30, done: statusOf(h, d) === 'done' });
  }
  return layout(items);
}

export function renderPlanner() {
  const mode = plannerMode();
  const anchor = plannerAnchor();
  const days = mode === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)) : [anchor];
  const tk = keyOf(today());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const head = pageHead({ eyebrow: 'Planner', title: 'Toda tu rutina <span>en una línea de tiempo.</span>' });
  const toolbar = `
    <div class="toolbar planner-bar">
      <div class="nav-group">
        <button class="icon-btn boxed" data-action="planner-move" data-v="-1" aria-label="Anterior">${icon('left')}</button>
        <button class="chip" data-action="planner-today">Hoy</button>
        <button class="icon-btn boxed" data-action="planner-move" data-v="1" aria-label="Siguiente">${icon('right')}</button>
        <span class="range">${rangeLabel(days)}</span>
      </div>
      <div class="nav-group">
        <button class="chip toggle${state.ui.plannerColors !== false ? ' is-on' : ''}" data-action="planner-colors" aria-pressed="${state.ui.plannerColors !== false}">
          <span class="tone-dots"><i class="t-blue"></i><i class="t-teal"></i><i class="t-violet"></i></span>Colores
        </button>
        ${segmented([['dia', 'Día'], ['semana', 'Semana']], mode, 'planner-mode')}
      </div>
    </div>`;

  const hours = [];
  for (let h = START_H; h < END_H; h++) hours.push(`<span style="top:${(h - START_H) * HOUR_PX}px">${fmtTime(`${String(h).padStart(2, '0')}:00`).replace(':00', '')}</span>`);

  const heads = days.map((d) => `
    <div class="pl-day-head${keyOf(d) === tk ? ' is-today' : ''}">
      <span>${DAY_SHORT[d.getDay()]}</span><b>${d.getDate()}</b>
    </div>`).join('');

  const allDay = days.map((d) => {
    const k = keyOf(d);
    const list = state.tasks.filter((t) => t.date === k && !t.time);
    return `<div class="pl-allday-cell">${list.map((t) => `<button class="pl-chip${toneOf(t.category) ? ` tone t-${toneOf(t.category)}` : ''}${t.status === 'done' ? ' is-done' : ''}" data-action="edit-task" data-id="${t.id}" data-tip="${esc(t.title)}">${esc(t.title)}</button>`).join('')}</div>`;
  }).join('');

  const cols = days.map((d) => {
    const k = keyOf(d);
    const blocks = dayItems(d).map((it) => {
      const top = ((it.start - START_H * 60) / 60) * HOUR_PX;
      const height = Math.max(22, ((it.end - it.start) / 60) * HOUR_PX - 2);
      if (it.end <= START_H * 60) return '';
      const w = 100 / it.lanes;
      const action = it.kind === 't' ? 'edit-task' : 'edit-habit';
      const cls = ['pl-block', it.kind === 'h' ? 'is-habit' : '', it.tone ? `tone t-${it.tone}` : '', it.done ? 'is-done' : ''].join(' ');
      // Cuántas líneas del título caben, dejando espacio para la hora.
      const showTime = height >= 44;
      const lines = Math.max(1, Math.floor((height - 12 - (showTime ? 15 : 0)) / 15));
      const range = `${fmtTime(fromMinutes(it.start))} – ${fmtTime(fromMinutes(it.end))}`;
      return `<button class="${cls}" data-action="${action}" data-id="${it.id}" data-tip="${esc(it.title)} · ${range}" style="top:${top + 1}px;height:${height}px;left:calc(${it.lane * w}% + 3px);width:calc(${w}% - 6px);--lines:${lines}">
        <span class="pl-block-title">${esc(it.title)}</span>
        ${showTime ? `<span class="pl-block-time">${it.kind === 'h' ? 'Hábito' : range}${it.doing ? ' · Haciendo' : ''}</span>` : ''}
      </button>`;
    }).join('');
    const nowLine = k === tk && nowMin >= START_H * 60 ? `<div class="pl-now" style="top:${((nowMin - START_H * 60) / 60) * HOUR_PX}px"></div>` : '';
    return `<div class="pl-col${k === tk ? ' is-today' : ''}" data-action="planner-slot" data-date="${k}">${blocks}${nowLine}</div>`;
  }).join('');

  return `${head}${toolbar}
    <p class="hint planner-hint">${icon('info')} Toca un espacio vacío para agregar una tarea a esa hora.</p>
    <div class="planner" style="--cols:${days.length};--hour:${HOUR_PX}px;--hours:${END_H - START_H}">
      <div class="pl-row pl-heads"><div class="pl-gutter"></div>${heads}</div>
      <div class="pl-row pl-allday"><div class="pl-gutter">Sin hora</div>${allDay}</div>
      <div class="pl-row pl-body"><div class="pl-gutter pl-hours">${hours.join('')}</div>${cols}</div>
    </div>`;
}
