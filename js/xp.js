// Niveles (XP) y logros. Todo se calcula a partir del historial: no hay nada que "hacer trampa".
import { state, save } from './store.js';
import { fromKey, today, addDays, keyOf } from './util.js';
import { bestOf, isPerfectDay, earliestHabitDate, rateOf } from './habits.js';
import { currentOf } from './goals.js';

export const XP = { habit: 10, task: 5, perfect: 20, goal: 100, journal: 5 };

export const LEVEL_TITLES = [
  [1, 'Novato'], [3, 'Aprendiz'], [5, 'Constante'], [8, 'Disciplinado'],
  [12, 'Imparable'], [17, 'Titán'], [25, 'Atlas'],
];

// XP total necesaria para llegar al nivel L: 50·L·(L−1) → 0, 100, 300, 600, 1000…
export const xpForLevel = (L) => 50 * L * (L - 1);

function counts() {
  let habitsDone = 0;
  for (const day of Object.values(state.log)) for (const v of Object.values(day)) if (v === 'done') habitsDone++;
  const tasksDone = state.tasks.filter((t) => t.status === 'done').length;
  const goalsDone = state.goals.filter((g) => currentOf(g) >= g.target).length;
  const journalDays = Object.values(state.journal).filter((j) => (j.text && j.text.trim()) || j.mood).length;

  let perfectDays = 0;
  const start = earliestHabitDate();
  if (start) {
    const t = today();
    for (let d = fromKey(start); d <= t; d = addDays(d, 1)) if (isPerfectDay(d)) perfectDays++;
  }
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, bestOf(h)), 0);
  return { habitsDone, tasksDone, goalsDone, journalDays, perfectDays, bestStreak };
}

export function progress() {
  const c = counts();
  const xp = c.habitsDone * XP.habit + c.tasksDone * XP.task + c.perfectDays * XP.perfect + c.goalsDone * XP.goal + c.journalDays * XP.journal;
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const title = [...LEVEL_TITLES].reverse().find(([l]) => level >= l)[1];
  return { ...c, xp, level, title, into: xp - floor, need: next - floor, pct: (xp - floor) / (next - floor) };
}

export const BADGES = [
  { id: 'first', icon: 'sparkles', name: 'Primer paso', desc: 'Cumple tu primer hábito', test: (c) => c.habitsDone >= 1 },
  { id: 's3', icon: 'flame', name: 'Encendido', desc: 'Racha de 3 días', test: (c) => c.bestStreak >= 3 },
  { id: 's7', icon: 'flame', name: 'Semana completa', desc: 'Racha de 7 días', test: (c) => c.bestStreak >= 7 },
  { id: 's21', icon: 'zap', name: 'Hábito formado', desc: 'Racha de 21 días', test: (c) => c.bestStreak >= 21 },
  { id: 's66', icon: 'shield', name: 'Automático', desc: 'Racha de 66 días', test: (c) => c.bestStreak >= 66 },
  { id: 's100', icon: 'crown', name: 'Centurión', desc: 'Racha de 100 días', test: (c) => c.bestStreak >= 100 },
  { id: 'p1', icon: 'sunrise', name: 'Día perfecto', desc: 'Cumple todos tus hábitos en un día', test: (c) => c.perfectDays >= 1 },
  { id: 'p10', icon: 'gem', name: 'Diez perfectos', desc: '10 días perfectos', test: (c) => c.perfectDays >= 10 },
  { id: 't10', icon: 'check', name: 'Ejecutor', desc: 'Completa 10 tareas', test: (c) => c.tasksDone >= 10 },
  { id: 't100', icon: 'rocket', name: 'Máquina', desc: 'Completa 100 tareas', test: (c) => c.tasksDone >= 100 },
  { id: 'g1', icon: 'target', name: 'Visionario', desc: 'Crea tu primera meta', test: () => state.goals.length >= 1 },
  { id: 'gdone', icon: 'mountain', name: 'Cima', desc: 'Cumple una meta', test: (c) => c.goalsDone >= 1 },
  { id: 'j7', icon: 'feather', name: 'Escritor', desc: '7 días escribiendo tu diario', test: (c) => c.journalDays >= 7 },
  { id: 'c80', icon: 'award', name: 'Constancia', desc: '80% o más en un hábito (30 días)', test: () => state.habits.some((h) => (rateOf(h, 30) ?? 0) >= 80 && h.createdAt <= keyOf(addDays(today(), -13))) },
];

export function badgeState() {
  const p = progress();
  return { p, badges: BADGES.map((b) => ({ ...b, unlocked: b.test(p) })) };
}

// Devuelve mensajes de lo nuevo (subida de nivel / logros) desde la última vez.
export function checkRewards() {
  const { p, badges } = badgeState();
  const unlocked = badges.filter((b) => b.unlocked).map((b) => b.id);
  const news = [];
  if (state.seenBadges === null || state.lastLevel === null) {
    state.seenBadges = unlocked;
    state.lastLevel = p.level;
    save();
    return news;
  }
  for (const b of badges) if (b.unlocked && !state.seenBadges.includes(b.id)) news.push(`🏅 Logro desbloqueado: ${b.name}`);
  if (p.level > state.lastLevel) news.push(`⬆️ ¡Subiste a nivel ${p.level}! · ${p.title}`);
  state.seenBadges = unlocked;
  state.lastLevel = p.level;
  if (news.length) save();
  return news;
}
