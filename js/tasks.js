// Tareas: modelo, agrupación y lectura de lenguaje natural ("llamar a mamá mañana 3pm #trabajo !").
import { state, save } from './store.js';
import { keyOf, fromKey, today, addDays, daysBetween, pad, uid, cap } from './util.js';

export const STATUS = {
  todo: { label: 'Por hacer', tone: 'muted' },
  doing: { label: 'Haciendo', tone: 'strong' },
  done: { label: 'Hecho', tone: 'good' },
};

export const QUADRANTS = [
  { id: 'ui', urgent: true, important: true, title: 'Hazlo ya', sub: 'Urgente · Importante' },
  { id: 'i', urgent: false, important: true, title: 'Planifícalo', sub: 'Importante' },
  { id: 'u', urgent: true, important: false, title: 'Delégalo', sub: 'Urgente' },
  { id: 'n', urgent: false, important: false, title: 'Después', sub: 'Ni urgente ni importante' },
];

export const CATEGORY_ICON = { Personal: 'user', Trabajo: 'briefcase', Estudio: 'graduation', Salud: 'heart', Casa: 'home2' };

export const findTask = (id) => state.tasks.find((t) => t.id === id);

export function newTask(fields = {}) {
  return {
    id: uid(),
    title: '',
    date: keyOf(today()),
    time: '',
    duration: 30,
    urgent: false,
    important: false,
    category: '',
    status: 'todo',
    subtasks: [],
    createdAt: keyOf(today()),
    doneAt: null,
    ...fields,
  };
}

export function setTaskStatus(t, status) {
  t.status = status;
  t.doneAt = status === 'done' ? keyOf(today()) : null;
  save();
}

export const isOverdue = (t) => t.status !== 'done' && t.date && t.date < keyOf(today());
export const tasksOn = (k) => state.tasks.filter((t) => t.date === k);

export const byTaskTime = (a, b) =>
  (a.time || '99').localeCompare(b.time || '99') ||
  Number(b.urgent && b.important) - Number(a.urgent && a.important) ||
  a.createdAt.localeCompare(b.createdAt);

// Grupos para la vista lista.
export function groupTasks() {
  const t = today();
  const tk = keyOf(t);
  const tomorrow = keyOf(addDays(t, 1));
  const week = keyOf(addDays(t, 7));
  const g = { overdue: [], today: [], tomorrow: [], week: [], later: [], nodate: [], done: [] };
  for (const task of state.tasks) {
    if (task.status === 'done') { g.done.push(task); continue; }
    if (!task.date) g.nodate.push(task);
    else if (task.date < tk) g.overdue.push(task);
    else if (task.date === tk) g.today.push(task);
    else if (task.date === tomorrow) g.tomorrow.push(task);
    else if (task.date <= week) g.week.push(task);
    else g.later.push(task);
  }
  for (const k of Object.keys(g)) g[k].sort(k === 'done' ? (a, b) => (b.doneAt || '').localeCompare(a.doneAt || '') : (a, b) => (a.date || '').localeCompare(b.date || '') || byTaskTime(a, b));
  return g;
}

/* ---------- Lenguaje natural ---------- */

const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6 };
const MONTHS = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };

export function parseTask(input) {
  let text = ` ${input.trim()} `;
  const t = today();
  const out = { date: undefined, time: '', urgent: false, important: false, category: '' };
  const cut = (re) => { text = text.replace(re, ' '); };

  // Prioridad: "!!" = urgente e importante, "!" = importante.
  if (/\s!!(\s|$)/.test(text)) { out.urgent = true; out.important = true; cut(/\s!!(?=\s|$)/); }
  else if (/\s!(\s|$)/.test(text)) { out.important = true; cut(/\s!(?=\s|$)/); }

  // Categoría: #trabajo
  const cat = text.match(/\s#([\p{L}\d_-]+)/u);
  if (cat) {
    const name = cap(cat[1].toLowerCase());
    out.category = state.categories.find((c) => c.toLowerCase() === name.toLowerCase()) || name;
    cut(/\s#[\p{L}\d_-]+/u);
  }

  // Hora
  let m;
  if ((m = text.match(/\s(?:a\s+las|a\s+la)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.\s?m\.|p\.\s?m\.|de la mañana|de la tarde|de la noche|hrs?|h)?(?=\s|$)/i))) {
    out.time = toHHMM(+m[1], +(m[2] || 0), m[3], true);
    cut(m[0]);
  } else if ((m = text.match(/\s(\d{1,2}):(\d{2})\s*(am|pm)?(?=\s|$)/i))) {
    out.time = toHHMM(+m[1], +m[2], m[3], false);
    cut(m[0]);
  } else if ((m = text.match(/\s(\d{1,2})\s*(am|pm|hrs?|h)(?=\s|$)/i))) {
    out.time = toHHMM(+m[1], 0, m[2], false);
    cut(m[0]);
  }

  // Fecha
  if ((m = text.match(/\spasado\s+mañana(?=\s|$)/i))) { out.date = keyOf(addDays(t, 2)); cut(m[0]); }
  else if ((m = text.match(/\s(?:para\s+)?mañana(?=\s|$)/i))) { out.date = keyOf(addDays(t, 1)); cut(m[0]); }
  else if ((m = text.match(/\s(?:para\s+)?hoy(?=\s|$)/i))) { out.date = keyOf(t); cut(m[0]); }
  else if ((m = text.match(/\s(?:sin\s+fecha|algún\s+día|algun\s+dia)(?=\s|$)/i))) { out.date = null; cut(m[0]); }
  else if ((m = text.match(/\s(?:el\s+|este\s+|próximo\s+|proximo\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)(?=\s|$)/i))) {
    const target = WEEKDAYS[m[1].toLowerCase()];
    let diff = (target - t.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    out.date = keyOf(addDays(t, diff));
    cut(m[0]);
  } else if ((m = text.match(/\s(?:el\s+)?(\d{1,2})\s+de\s+([a-zé]+)(?=\s|$)/i)) && MONTHS[m[2].toLowerCase()] !== undefined) {
    let d = new Date(t.getFullYear(), MONTHS[m[2].toLowerCase()], +m[1]);
    if (d < t) d = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
    out.date = keyOf(d);
    cut(m[0]);
  } else if ((m = text.match(/\s(?:el\s+)(\d{1,2})(?=\s|$)/i)) || (m = text.match(/\s(\d{1,2})\/(\d{1,2})(?=\s|$)/))) {
    const day = +m[1];
    const month = m[2] ? +m[2] - 1 : t.getMonth();
    let d = new Date(t.getFullYear(), month, day);
    if (!m[2] && d < t) d = new Date(t.getFullYear(), t.getMonth() + 1, day);
    if (m[2] && d < t) d = new Date(t.getFullYear() + 1, month, day);
    if (day >= 1 && day <= 31) { out.date = keyOf(d); cut(m[0]); }
  }

  out.title = cap(text.replace(/\s+/g, ' ').trim());
  return out;
}

function toHHMM(h, min, suffix, loose) {
  const s = (suffix || '').toLowerCase().replace(/[\s.]/g, '');
  if ((s === 'pm' || s.includes('tarde') || s.includes('noche')) && h < 12) h += 12;
  if ((s === 'am' || s.includes('mañana')) && h === 12) h = 0;
  if (!s && loose && h >= 1 && h <= 7) h += 12; // "a las 3" → 15:00
  if (h > 23 || min > 59) return '';
  return `${pad(h)}:${pad(min)}`;
}

export function taskMeta(t) {
  const parts = [];
  if (t.urgent && t.important) parts.push('Urgente · Importante');
  else if (t.urgent) parts.push('Urgente');
  else if (t.important) parts.push('Importante');
  return parts;
}

export function dueLabel(t) {
  if (!t.date) return '';
  const diff = daysBetween(today(), fromKey(t.date));
  if (diff < 0) return `Venció hace ${-diff} ${diff === -1 ? 'día' : 'días'}`;
  return '';
}
