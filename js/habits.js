// Lógica de hábitos: programación, estado del día, contador, frecuencia semanal, rachas y constancia.
//
// Modelo de un hábito:
//   { id, emoji, name, days:[0..6], time, createdAt,
//     target?: veces por día (1 = marcar una vez; 8 = contador 0/8),
//     unit?:   "vasos", "páginas"… (solo para contador),
//     freq?:   'days' (días fijos, por defecto) | 'weekly' (N veces por semana, cualquier día),
//     perWeek?: N para freq 'weekly' }
// Registro diario (state.log[fecha][id]): 'done' | 'skip' | número (avance del contador).
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

// [emoji, nombre, momento sugerido, extras opcionales]
export const HABIT_SUGGESTIONS = [
  ['💧', 'Tomar 8 vasos de agua', 'libre', { target: 8, unit: 'vasos' }],
  ['📚', 'Leer 10 páginas', 'noche'],
  ['🧘', 'Meditar 5 min', 'manana'],
  ['🏃', 'Caminar 20 min', 'tarde'],
  ['🏋️', 'Entrenar', 'tarde', { freq: 'weekly', perWeek: 3 }],
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
export const targetOf = (h) => Math.max(1, h.target || 1);
export const isCounter = (h) => targetOf(h) > 1;
export const isWeekly = (h) => h.freq === 'weekly';
export const perWeekOf = (h) => Math.min(7, Math.max(1, h.perWeek || 3));

// ¿Se puede hacer este día? (semanales: cualquier día)
export const isScheduled = (h, d) => (isWeekly(h) || h.days.includes(d.getDay())) && keyOf(d) >= h.createdAt;

const rawOf = (h, d) => { const day = state.log[keyOf(d)]; return day ? day[h.id] : undefined; };

// ¿Este valor del registro cuenta como cumplido?
export const isDoneValue = (h, v) => v === 'done' || (typeof v === 'number' && v >= targetOf(h));

export function statusOf(h, d) {
  const v = rawOf(h, d);
  if (v === 'skip') return 'skip';
  return isDoneValue(h, v) ? 'done' : null; // 'done' | 'skip' | null
}

// Avance del contador en un día (0..target).
export function countOf(h, d) {
  const v = rawOf(h, d);
  if (v === 'done') return targetOf(h);
  return typeof v === 'number' ? v : 0;
}

function writeRaw(h, d, value) {
  const k = keyOf(d);
  const day = state.log[k] || (state.log[k] = {});
  if (value === null || value === undefined || value === 0) {
    delete day[h.id];
    if (!Object.keys(day).length) delete state.log[k];
  } else day[h.id] = value;
  save();
}

export function setStatus(h, d, value) {
  // Para contadores, "hecho" guarda el total para conservar el avance.
  writeRaw(h, d, value === 'done' && isCounter(h) ? targetOf(h) : value);
}

export function setCount(h, d, n) {
  writeRaw(h, d, Math.max(0, Math.min(targetOf(h), n)));
}

/* ---------- Semanales ---------- */

export function weekCount(h, anyDay) {
  let n = 0;
  const mon = mondayOf(anyDay);
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    if (d > today()) break;
    if (statusOf(h, d) === 'done') n++;
  }
  return n;
}
export const weekMet = (h, anyDay) => weekCount(h, anyDay) >= perWeekOf(h);

function weeklyStreak(h) {
  const created = mondayOf(fromKey(h.createdAt));
  let mon = mondayOf(today());
  let n = 0;
  if (weekMet(h, mon)) n++; // semana actual: suma si ya cumplió, si no, aún está en curso
  for (mon = addDays(mon, -7); mon >= created; mon = addDays(mon, -7)) {
    if (weekMet(h, mon)) n++;
    else break;
  }
  return n;
}

function weeklyBest(h) {
  let best = 0;
  let run = 0;
  const cur = mondayOf(today());
  for (let mon = mondayOf(fromKey(h.createdAt)); mon <= cur; mon = addDays(mon, 7)) {
    if (weekMet(h, mon)) { run++; best = Math.max(best, run); }
    else if (mon < cur) run = 0;
  }
  return best;
}

/* ---------- Rachas y constancia ---------- */

// Diarios: días seguidos (hoy pendiente y descansos no rompen). Semanales: semanas seguidas.
export function streakOf(h) {
  if (isWeekly(h)) return weeklyStreak(h);
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
  if (isWeekly(h)) return weeklyBest(h);
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

// % cumplido en los últimos N días (hoy pendiente no cuenta en contra). Semanales: % de semanas cumplidas.
export function rateOf(h, days = 30) {
  if (isWeekly(h)) {
    const created = mondayOf(fromKey(h.createdAt));
    let total = 0;
    let met = 0;
    for (let w = 0; w < Math.ceil(days / 7); w++) {
      const mon = addDays(mondayOf(today()), -7 * w);
      if (mon < created) break;
      const ok = weekMet(h, mon);
      if (w === 0 && !ok) continue; // semana en curso
      total++;
      if (ok) met++;
    }
    return total ? Math.round((met / total) * 100) : null;
  }
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

// Resumen de un día (solo hábitos diarios obligatorios; los semanales son flexibles).
export function dayStats(d) {
  let total = 0;
  let done = 0;
  for (const h of state.habits) {
    if (isWeekly(h) || !isScheduled(h, d)) continue;
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

// "Todos los días", "3 veces por semana", "8 vasos · Entre semana"…
export function freqLabel(h) {
  const base = isWeekly(h) ? `${perWeekOf(h)} ${perWeekOf(h) === 1 ? 'vez' : 'veces'} por semana` : daysLabel(h.days);
  return isCounter(h) ? `${targetOf(h)} ${h.unit || 'veces'} al día · ${base}` : base;
}

export const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.createdAt.localeCompare(b.createdAt);
export const streakText = (n, h) => {
  if (h && isWeekly(h)) return n > 0 ? `${n} ${n === 1 ? 'semana' : 'semanas'}` : 'Empieza esta semana';
  return n > 0 ? `${n} ${n === 1 ? 'día' : 'días'}` : 'Empieza hoy';
};

// Crear un hábito a partir de una sugerencia.
export function habitFromSuggestion(i, time, uidFn) {
  const [emoji, name, , extra = {}] = HABIT_SUGGESTIONS[i];
  return { id: uidFn(), emoji, name, days: [0, 1, 2, 3, 4, 5, 6], time, createdAt: keyOf(today()), ...extra };
}
