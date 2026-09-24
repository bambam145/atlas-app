// Lógica de hábitos: programación, estado del día, contador, frecuencia semanal, rachas y constancia.
//
// Modelo de un hábito:
//   { id, emoji, name, days:[0..6], time, createdAt,
//     target?: veces por día (1 = marcar una vez; 8 = contador 0/8),
//     unit?:   "vasos", "páginas"… (solo para contador),
//     freq?:   'days' (días fijos, por defecto) | 'weekly' (N veces por semana, cualquier día),
//     perWeek?: N para freq 'weekly',
//     kind?:   'check' | 'counter' | 'choice' (bien / a medias / no lo hice) | 'sleep' (horas de sueño)
//              | 'quit' (dejar algo: cada día sin recaer cuenta; la recaída se guarda como 'none'),
//     challenge?: { days: 21|30|66, start: 'YYYY-MM-DD' } (reto: cumplirlo N días),
//     labels?: [bien, a medias, no] para 'choice',
//     sleepGoal?: horas para 'sleep' }
// Registro diario (state.log[fecha][id]): 'done' | 'skip' | 'meh' | 'none' | número (avance del contador).
//   'meh' = lo hiciste, pero no del todo (comí no sano, dormí menos). 'none' = no lo hiciste.
// Hora en que se registró: state.times[fecha][id] = 'HH:MM'. Sueño: state.sleep[día en que despiertas] = { bed, wake }.
// Pausas (vacaciones / enfermo): state.pauses = [{ from, to|null, reason }]; esos días no cuentan para nada.
import { state, save } from './store.js';
import { keyOf, fromKey, today, addDays, mondayOf, pad, toMinutes, DAY_SHORT, WEEK_ORDER } from './util.js';

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
  ['🍳', 'Desayunar sano', 'manana', { kind: 'choice', labels: ['Sano', 'Comí, pero no sano', 'No desayuné'] }],
  ['🥗', 'Almuerzo balanceado', 'mediodia', { kind: 'choice', labels: ['Balanceado', 'Comí, pero no sano', 'No almorcé'] }],
  ['🍽️', 'Cenar ligero', 'noche', { kind: 'choice', labels: ['Ligero', 'Pesado', 'No cené'] }],
  ['😴', 'Dormir 8 horas', 'noche', { kind: 'sleep', sleepGoal: 8 }],
  ['📵', '1 hora sin redes', 'noche'],
  ['✍️', 'Escribir mi diario', 'noche'],
  ['🙏', 'Agradecer 3 cosas', 'manana'],
  ['🚭', 'No fumar', 'libre', { kind: 'quit' }],
  ['🍬', 'Cero azúcar', 'libre', { kind: 'quit' }],
];

// Retos listos para empezar: [emoji, título, días, índice de la sugerencia].
export const CHALLENGES = [
  ['💧', '30 días tomando agua', 30, 0],
  ['🍳', '21 días desayunando sano', 21, 5],
  ['🚭', '30 días sin fumar', 30, 12],
  ['🏃', '21 días caminando', 21, 3],
  ['📚', '30 días leyendo', 30, 1],
  ['🍬', '21 días sin azúcar', 21, 13],
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
export const kindOf = (h) => h.kind || (targetOf(h) > 1 ? 'counter' : 'check');
export const isCounter = (h) => kindOf(h) === 'counter' && targetOf(h) > 1;
export const isChoice = (h) => kindOf(h) === 'choice';
export const isSleep = (h) => kindOf(h) === 'sleep';
export const isQuit = (h) => kindOf(h) === 'quit';

/* ---------- Pausa (vacaciones / enfermo) ---------- */

export const PAUSE_REASONS = { vacaciones: ['🏖️', 'Vacaciones'], enfermo: ['🤒', 'Enfermo'], descanso: ['🧘', 'Descanso'] };
export const isPaused = (d) => { const k = keyOf(d); return (state.pauses || []).some((p) => k >= p.from && (!p.to || k <= p.to)); };
export const activePause = () => { const k = keyOf(today()); return (state.pauses || []).find((p) => k >= p.from && (!p.to || k <= p.to)) || null; };

// Opciones: el registro guarda 'done' (bien), 'meh' (a medias) o 'none' (no lo hice).
export const CHOICE_VALUES = ['done', 'meh', 'none'];
export const CHOICE_DEFAULT = ['Bien', 'A medias', 'No lo hice'];
export const choiceLabels = (h) => CHOICE_DEFAULT.map((d, i) => (h.labels && h.labels[i]) || d);
export const choiceLabelOf = (h, s) => choiceLabels(h)[CHOICE_VALUES.indexOf(s)] || '';

// Hábitos creados antes de los tipos: las comidas pasan a "opciones" y dormir a "sueño".
export function migrateHabits() {
  let changed = false;
  for (const h of state.habits) {
    if (h.kind || targetOf(h) > 1) continue;
    const n = h.name.toLowerCase();
    let extra = null;
    if (/desayun/.test(n)) extra = { kind: 'choice', labels: ['Sano', 'Comí, pero no sano', 'No desayuné'] };
    else if (/almuer/.test(n)) extra = { kind: 'choice', labels: [/balance/.test(n) ? 'Balanceado' : 'Sano', 'Comí, pero no sano', 'No almorcé'] };
    else if (/\bcen(a|ar)\b/.test(n)) extra = { kind: 'choice', labels: [/liger/.test(n) ? 'Ligero' : 'Sano', 'Pesado', 'No cené'] };
    else if (/dormir|sueño/.test(n)) {
      const num = parseFloat((n.match(/\d+([.,]\d)?/) || ['8'])[0].replace(',', '.'));
      extra = { kind: 'sleep', sleepGoal: Math.min(12, Math.max(4, num)) };
    }
    if (extra) { Object.assign(h, extra); changed = true; }
  }
  if (changed) save();
}

// Vasos estándar de 250 ml.
export const GLASS_ML = 250;
export const isGlasses = (h) => /vaso/i.test(h.unit || '');
export const litersText = (n) => `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format((n * GLASS_ML) / 1000)} L`;

/* ---------- Sueño ---------- */

export const sleepGoalOf = (h) => h.sleepGoal || 8;
// Minutos dormidos entre la hora de acostarse y la de despertar (cruza la medianoche).
export function sleepMinutes(rec) {
  if (!rec || !rec.bed || !rec.wake) return null;
  let m = toMinutes(rec.wake) - toMinutes(rec.bed);
  if (m <= 0) m += 1440;
  return m;
}
export const fmtDuration = (min) => `${Math.floor(min / 60)} h${Math.round(min % 60) ? ` ${pad(Math.round(min % 60))} min` : ''}`;
export const sleepOf = (d) => (state.sleep || {})[keyOf(d)];

// El sueño se guarda en el día en que despiertas. Meta cumplida = 'done'; menos horas = 'meh'.
export function setSleep(h, d, rec) {
  const k = keyOf(d);
  const all = state.sleep || (state.sleep = {});
  if (!rec || (!rec.bed && !rec.wake)) delete all[k];
  else all[k] = { bed: rec.bed || '', wake: rec.wake || '' };
  const min = sleepMinutes(all[k]);
  if (min === null) writeRaw(h, d, null);
  else writeRaw(h, d, min >= sleepGoalOf(h) * 60 - 15 ? 'done' : 'meh', all[k].wake);
}
export const isWeekly = (h) => h.freq === 'weekly';
export const perWeekOf = (h) => Math.min(7, Math.max(1, h.perWeek || 3));

// ¿Se puede hacer este día? (semanales: cualquier día)
// Archivado: desde h.archivedAt ya no cuenta; si se reactivó, esos días quedan en h.gaps (no rompen la racha).
const inGap = (h, k) => (h.archivedAt && k >= h.archivedAt) || (h.gaps || []).some((g) => k >= g.from && k <= g.to);
export const isArchived = (h) => !!h.archivedAt;
export const activeHabits = () => state.habits.filter((h) => !h.archivedAt);
export const isScheduled = (h, d) => {
  const k = keyOf(d);
  return (isWeekly(h) || h.days.includes(d.getDay())) && k >= h.createdAt && !isPaused(d) && !inGap(h, k);
};

const rawOf = (h, d) => { const day = state.log[keyOf(d)]; return day ? day[h.id] : undefined; };

// ¿Este valor del registro cuenta como cumplido?
export const isDoneValue = (h, v) => v === 'done' || (typeof v === 'number' && v >= targetOf(h));

export function statusOf(h, d) {
  const v = rawOf(h, d);
  if (v === 'skip' || v === 'meh' || v === 'none') return v;
  // Dejar algo: cada día sin recaída (hasta hoy) cuenta como cumplido.
  if (isQuit(h)) return d <= today() && isScheduled(h, d) ? 'done' : null;
  return isDoneValue(h, v) ? 'done' : null; // 'done' | 'skip' | 'meh' | 'none' | null
}

// Hora en que se registró ('HH:MM') o ''.
export const timeOf = (h, d) => (state.times?.[keyOf(d)] || {})[h.id] || '';

// Avance del contador en un día (0..target).
export function countOf(h, d) {
  const v = rawOf(h, d);
  if (v === 'done') return targetOf(h);
  return typeof v === 'number' ? v : 0;
}

const nowHM = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; };

// Escribe el registro del día y guarda la hora (la de ahora, si es hoy).
function writeRaw(h, d, value, at) {
  const k = keyOf(d);
  const day = state.log[k] || (state.log[k] = {});
  const times = state.times || (state.times = {});
  if (value === null || value === undefined || value === 0) {
    delete day[h.id];
    if (!Object.keys(day).length) delete state.log[k];
    if (times[k]) { delete times[k][h.id]; if (!Object.keys(times[k]).length) delete times[k]; }
  } else {
    day[h.id] = value;
    const hm = at || (k === keyOf(today()) ? nowHM() : '');
    if (value === 'skip') { if (times[k]) delete times[k][h.id]; } else if (hm) (times[k] || (times[k] = {}))[h.id] = hm;
  }
  save();
}

export function setStatus(h, d, value) {
  // Para contadores, "hecho" guarda el total para conservar el avance.
  writeRaw(h, d, value === 'done' && isCounter(h) ? targetOf(h) : value);
}

// Sin tope: la meta es la meta, pero puedes pasarte (10/8 vasos).
export function setCount(h, d, n) {
  writeRaw(h, d, Math.max(0, Math.min(99, n)));
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
// Los días en pausa bajan la meta de la semana (vacaciones no rompen la racha semanal).
export function weekMet(h, anyDay) {
  const mon = mondayOf(anyDay);
  let paused = 0;
  for (let i = 0; i < 7; i++) if (isPaused(addDays(mon, i))) paused++;
  return weekCount(h, anyDay) >= Math.max(0, perWeekOf(h) - paused);
}

/* ---------- Retos ---------- */

// Progreso del reto: cuántos días lo cumpliste desde que empezó (no hace falta que sean seguidos).
export function challengeOf(h) {
  const c = h.challenge;
  if (!c || !c.days) return null;
  const t = today();
  let done = 0;
  for (let d = fromKey(c.start); d <= t; d = addDays(d, 1)) if (statusOf(h, d) === 'done') done++;
  return { days: c.days, start: c.start, done: Math.min(done, c.days), complete: done >= c.days };
}

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
    else if (s !== 'skip' && !(s === null && keyOf(d) === tk)) run = 0;
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
  if (isSleep(h)) return `Meta ${String(sleepGoalOf(h)).replace('.', ',')} h · ${base}`;
  if (isQuit(h)) return 'Cada día sin recaer suma';
  return isCounter(h) ? `${targetOf(h)} ${h.unit || 'veces'} al día · ${base}` : base;
}

export const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.createdAt.localeCompare(b.createdAt);
export const streakText = (n, h) => {
  if (h && isWeekly(h)) return n > 0 ? `${n} ${n === 1 ? 'semana' : 'semanas'}` : 'Empieza esta semana';
  if (h && isQuit(h)) return `${n} ${n === 1 ? 'día' : 'días'} limpio`;
  return n > 0 ? `${n} ${n === 1 ? 'día' : 'días'}` : 'Empieza hoy';
};

// Crear un hábito a partir de una sugerencia.
export function habitFromSuggestion(i, time, uidFn) {
  const [emoji, name, , extra = {}] = HABIT_SUGGESTIONS[i];
  return { id: uidFn(), emoji, name, days: [0, 1, 2, 3, 4, 5, 6], time, createdAt: keyOf(today()), ...structuredClone(extra) };
}
