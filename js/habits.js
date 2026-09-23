// Lógica de hábitos: programación, estado del día, rachas y constancia.
import { state, save } from './store.js';
import { keyOf, fromKey, today, addDays, mondayOf, DAY_SHORT, WEEK_ORDER } from './util.js';

export const SKIPS_PER_WEEK = 1;

// Momentos del día: atajos de hora para hábitos que dependen del horario (comidas, rutinas…).
export const MOMENTS = [
  ['manana', '🌅', 'Mañana', '07:00'],
  ['mediodia', '☀️', 'Mediodía', '12:30'],
  ['tarde', '🌇', 'Tarde', '17:00'],
  ['noche', '🌙', 'Noche', '20:30'],
  ['libre', '🕊️', 'Libre', ''],
];
export const momentTime = (id) => (MOMENTS.find((m) => m[0] === id) || [])[3] || '';
export const momentOfTime = (time) => (MOMENTS.find((m) => m[3] === time) || [])[0] || (time ? '' : 'libre');

// [emoji, nombre, momento sugerido]
export const HABIT_SUGGESTIONS = [
  ['💧', 'Tomar 2 L de agua', 'libre'],
  ['📚', 'Leer 10 páginas', 'noche'],
  ['🧘', 'Meditar 5 min', 'manana'],
  ['🏃', 'Caminar 20 min', 'tarde'],
  ['🏋️', 'Entrenar', 'tarde'],
  ['🍳', 'Desayunar sano', 'manana'],
  ['🥗', 'Almuerzo balanceado', 'mediodia'],
  ['🍽️', 'Cenar ligero', 'noche'],
  ['😴', 'Dormir 8 horas', 'noche'],
  ['📵', '1 hora sin redes', 'noche'],
  ['✍️', 'Escribir mi diario', 'noche'],
  ['🙏', 'Agradecer 3 cosas', 'manana'],
];

export const EMOJIS = [
  '💧', '📚', '🧘', '🏃', '🏋️', '😴', '🥗', '📵',
  '✍️', '🙏', '🍎', '💊', '🧹', '🪥', '🚭', '🍷',
  '💰', '📝', '🧠', '🎯', '🎸', '🎨', '💻', '🗣️',
  '🌅', '🚶', '🚴', '🏊', '⚽', '🤸', '☕', '🌱',
  '🐶', '🛏️', '🧺', '🎧', '📖', '❤️', '⭐', '🔥',
];

export const findHabit = (id) => state.habits.find((h) => h.id === id);
export const isScheduled = (h, d) => h.days.includes(d.getDay()) && keyOf(d) >= h.createdAt;

export function statusOf(h, d) {
  const day = state.log[keyOf(d)];
  return (day && day[h.id]) || null; // 'done' | 'skip' | null
}

export function setStatus(h, d, value) {
  const k = keyOf(d);
  const day = state.log[k] || (state.log[k] = {});
  if (value) day[h.id] = value;
  else {
    delete day[h.id];
    if (!Object.keys(day).length) delete state.log[k];
  }
  save();
}

// Días seguidos cumplidos. Hoy pendiente no rompe la racha; un descanso tampoco.
export function streakOf(h) {
  const created = fromKey(h.createdAt);
  let d = today();
  if (isScheduled(h, d) && !statusOf(h, d)) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 3660 && d >= created; i++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    const s = statusOf(h, d);
    if (s === 'done') n++;
    else if (s !== 'skip') break;
  }
  return n;
}

export function bestOf(h) {
  const t = today();
  const tk = keyOf(t);
  let best = 0;
  let run = 0;
  for (let d = fromKey(h.createdAt); d <= t; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    const s = statusOf(h, d);
    if (s === 'done') { run++; best = Math.max(best, run); }
    else if (!s && keyOf(d) !== tk) run = 0;
  }
  return best;
}

// % cumplido en los últimos N días (hoy pendiente no cuenta en contra).
export function rateOf(h, days = 30) {
  const t = today();
  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(t, -i);
    if (!isScheduled(h, d)) continue;
    const s = statusOf(h, d);
    if (s === 'skip' || (i === 0 && !s)) continue;
    scheduled++;
    if (s === 'done') done++;
  }
  return scheduled ? Math.round((done / scheduled) * 100) : null;
}

export function skipsThisWeek(h) {
  const t = today();
  let n = 0;
  for (let d = mondayOf(t); d <= t; d = addDays(d, 1)) if (statusOf(h, d) === 'skip') n++;
  return n;
}

// Resumen de un día para todos los hábitos: {total, done} (los descansos no cuentan).
export function dayStats(d) {
  let total = 0;
  let done = 0;
  for (const h of state.habits) {
    if (!isScheduled(h, d)) continue;
    const s = statusOf(h, d);
    if (s === 'skip') continue;
    total++;
    if (s === 'done') done++;
  }
  return { total, done, pct: total ? done / total : null };
}

export const isPerfectDay = (d) => { const s = dayStats(d); return s.total > 0 && s.done === s.total; };

export function earliestHabitDate() {
  if (!state.habits.length) return null;
  return state.habits.map((h) => h.createdAt).sort()[0];
}

export function daysLabel(days) {
  const s = [...days].sort().join(',');
  if (days.length === 7) return 'Todos los días';
  if (s === '1,2,3,4,5') return 'Entre semana';
  if (s === '0,6') return 'Fines de semana';
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(', ');
}

export const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.createdAt.localeCompare(b.createdAt);
export const streakText = (n) => (n > 0 ? `${n} ${n === 1 ? 'día' : 'días'}` : 'Empieza hoy');
