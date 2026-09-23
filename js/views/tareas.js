import { state } from '../store.js';
import { icon } from '../icons.js';
import { esc, fmtTime, fmtDay } from '../util.js';
import { groupTasks, STATUS, QUADRANTS, taskMeta, CATEGORY_ICON, isOverdue, byTaskTime } from '../tasks.js';
import { pageHead, label, taskRow, quickAdd, segmented, emptyState, checkbox } from '../ui.js';

const VIEWS = [['lista', 'Lista', 'list'], ['kanban', 'Kanban', 'kanban'], ['eisenhower', 'Eisenhower', 'matrix']];

export function renderTareas(ctx) {
  const v = state.ui.tasksView;
  const open = state.tasks.filter((t) => t.status !== 'done').length;
  const head = pageHead({
    eyebrow: 'Tareas',
    title: 'Visualiza tu flujo <span>y ejecuta.</span>',
    sub: state.tasks.length ? `Tienes <b>${open} ${open === 1 ? 'tarea pendiente' : 'tareas pendientes'}</b>.` : '',
  });
  const body = !state.tasks.length
    ? emptyState('Sin tareas todavía',
      'Escribe como hablas: <b>“Pagar la luz mañana 9am #casa !”</b>. Entiendo fechas (hoy, mañana, el viernes, el 29), horas (3pm, a las 15:30), categorías (#trabajo) y prioridad (! importante, !! urgente).')
    : v === 'kanban' ? kanban(ctx) : v === 'eisenhower' ? matrix(ctx) : lista(ctx);
  return `${head}<div class="toolbar">${segmented(VIEWS, v, 'tasks-view')}</div>${quickAdd()}${body}`;
}

function lista(ctx) {
  const g = groupTasks();
  const sec = (key, title, opts = {}) => (g[key].length
    ? `<div class="group">${label(title, g[key].length)}${g[key].slice(0, opts.limit || 999).map((t) => taskRow(t, { showDate: opts.date, pop: ctx.pop === t.id })).join('')}</div>`
    : '');
  return [
    sec('overdue', 'Atrasadas', { date: true }),
    sec('today', 'Hoy'),
    sec('tomorrow', 'Mañana'),
    sec('week', 'Próximos 7 días', { date: true }),
    sec('later', 'Más adelante', { date: true }),
    sec('nodate', 'Sin fecha'),
    sec('done', 'Completadas', { date: true, limit: 15 }),
  ].join('');
}

function kanbanCard(t) {
  const meta = [];
  if (t.category) meta.push(`<span>${icon(CATEGORY_ICON[t.category] || 'tag')} ${esc(t.category)}</span>`);
  for (const m of taskMeta(t)) meta.push(`<span>${icon('star')} ${m}</span>`);
  if (t.date && t.status !== 'done') meta.push(`<span class="${isOverdue(t) ? 'bad' : ''}">${icon('calendar')} ${fmtDay(t.date)}</span>`);
  return `
    <div class="kcard${t.status === 'done' ? ' is-done' : ''}" draggable="true" data-drag-id="${t.id}" data-action="edit-task" data-id="${t.id}" role="button" tabindex="0">
      <div class="kcard-top">
        <button class="check-btn" data-action="toggle-task" data-id="${t.id}" aria-label="Completar ${esc(t.title)}">${checkbox(t.status === 'done', 'square')}</button>
        <span class="item-title">${esc(t.title)}</span>
        ${t.time ? `<span class="kcard-time">${fmtTime(t.time)}</span>` : ''}
      </div>
      ${meta.length ? `<div class="item-meta">${meta.join('')}</div>` : ''}
      ${t.status !== 'done' ? `<button class="kcard-next" data-action="advance-task" data-id="${t.id}" aria-label="Mover a la siguiente columna">${t.status === 'todo' ? 'Empezar' : 'Terminar'} ${icon('arrowRight')}</button>` : ''}
    </div>`;
}

function kanban() {
  const cols = Object.entries(STATUS).map(([id, s]) => {
    let list = state.tasks.filter((t) => t.status === id);
    list = id === 'done' ? list.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 20) : list.sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || byTaskTime(a, b));
    return `
      <section class="kcol" data-drop="status:${id}">
        <header class="kcol-head tone-${s.tone}"><span>${s.label}</span><span>${state.tasks.filter((t) => t.status === id).length}</span></header>
        <div class="kcol-body">${list.map(kanbanCard).join('') || '<p class="kcol-empty">Arrastra tareas aquí</p>'}</div>
      </section>`;
  }).join('');
  return `<div class="kanban">${cols}</div>`;
}

function matrix() {
  const quads = QUADRANTS.map((q) => {
    const list = state.tasks.filter((t) => t.status !== 'done' && !!t.urgent === q.urgent && !!t.important === q.important).sort(byTaskTime);
    return `
      <section class="quad quad-${q.id}" data-drop="quad:${q.id}">
        <header class="quad-head"><div><b>${q.title}</b><span>${q.sub}</span></div><span class="quad-count">${list.length}</span></header>
        <div class="quad-body">${list.map((t) => `
          <div class="qitem" draggable="true" data-drag-id="${t.id}" data-action="edit-task" data-id="${t.id}" role="button" tabindex="0">
            <button class="check-btn" data-action="toggle-task" data-id="${t.id}" aria-label="Completar ${esc(t.title)}">${checkbox(false, 'square')}</button>
            <span class="item-title">${esc(t.title)}</span>
            ${t.date ? `<span class="qitem-date${isOverdue(t) ? ' bad' : ''}">${fmtDay(t.date)}</span>` : ''}
          </div>`).join('') || '<p class="kcol-empty">Nada aquí</p>'}</div>
      </section>`;
  }).join('');
  return `<p class="hint matrix-hint">${icon('info')} Arrastra las tareas entre cuadrantes, o edítalas para cambiar su prioridad.</p><div class="matrix">${quads}</div>`;
}
