// Metas: progreso manual + automático desde un hábito vinculado, y estado vs. plazo.
import { state } from './store.js';
import { keyOf, fromKey, today, daysBetween } from './util.js';

export const GOAL_SUGGESTIONS = [
  { emoji: '📚', title: 'Leer 12 libros', target: 12, unit: 'libros' },
  { emoji: '🏃', title: 'Correr 100 km', target: 100, unit: 'km' },
  { emoji: '💰', title: 'Fondo de emergencia', target: 5000, unit: 'S/' },
  { emoji: '✈️', title: 'Viaje soñado', target: 3000, unit: 'S/' },
  { emoji: '🧘', title: 'Meditar 60 veces', target: 60, unit: 'sesiones' },
];

export const findGoal = (id) => state.goals.find((g) => g.id === id);

// Veces que el hábito vinculado se cumplió desde que se creó la meta.
export function linkedCount(g) {
  if (!g.habitId) return 0;
  let n = 0;
  for (const [k, day] of Object.entries(state.log)) if (k >= g.createdAt && day[g.habitId] === 'done') n++;
  return n;
}

export const currentOf = (g) => (g.history || []).reduce((s, x) => s + x.amount, 0) + linkedCount(g);
export const pctOf = (g) => (g.target > 0 ? Math.min(1, currentOf(g) / g.target) : 0);

export function statusOfGoal(g) {
  const cur = currentOf(g);
  if (cur >= g.target) return { id: 'done', label: 'Cumplida', tone: 'good' };
  if (!g.deadline) return { id: 'none', label: 'Sin plazo', tone: 'muted' };
  const start = fromKey(g.createdAt);
  const end = fromKey(g.deadline);
  const t = today();
  if (t > end) return { id: 'late', label: 'Vencida', tone: 'bad' };
  const total = Math.max(1, daysBetween(start, end));
  const expected = (daysBetween(start, t) / total) * g.target;
  if (cur >= expected * 1.1 && cur > 0) return { id: 'ahead', label: 'Adelantada', tone: 'good' };
  if (cur >= expected * 0.9) return { id: 'ontrack', label: 'Al día', tone: 'muted' };
  return { id: 'behind', label: 'Atrasada', tone: 'warn' };
}

export function remainingLabel(g) {
  if (!g.deadline) return 'Sin fecha límite';
  const days = daysBetween(today(), fromKey(g.deadline));
  if (days < 0) return 'Plazo vencido';
  if (days === 0) return 'Vence hoy';
  if (days < 31) return `Faltan ${days} ${days === 1 ? 'día' : 'días'}`;
  const months = Math.round(days / 30);
  return `Faltan ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export const goalDoneToday = (g) => (g.history || []).some((h) => h.date === keyOf(today()));
