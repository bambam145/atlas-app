// atlas — punto de entrada: navegación, render y acciones.
import { state, save, setRenderer, replaceState, isValidBackup } from './store.js';
import { icon, logo } from './icons.js';
import { today, keyOf, fromKey, addDays, fromMinutes, uid, fmtDay, fmtTime, ALL_DAYS } from './util.js';
import { findHabit, isScheduled, statusOf, setStatus, streakOf, skipsThisWeek, SKIPS_PER_WEEK, HABIT_SUGGESTIONS } from './habits.js';
import { findTask, newTask, setTaskStatus, parseTask, QUADRANTS } from './tasks.js';
import { findGoal, GOAL_SUGGESTIONS } from './goals.js';
import { checkRewards } from './xp.js';
import { toast, toastQueue } from './ui.js';
import { sheet, openSheet, closeSheet, renderSheet, openHabit, openTask, openGoal } from './sheets.js';
import { renderHoy, levelCard, cloudBannerVisible } from './views/hoy.js';
import { renderTareas } from './views/tareas.js';
import { renderPlanner, plannerMode, plannerAnchor, START_H, HOUR_PX } from './views/planner.js';
import { renderHabitos } from './views/habitos.js';
import { renderMetas } from './views/metas.js';
import { renderDiario, diaryDate, setDiaryDate } from './views/diario.js';
import { renderStats } from './views/stats.js';
import { renderLogros } from './views/logros.js';
import { renderMapa, mountMapa, toggleKind, zoomMapa } from './views/mapa.js';
import { cloud, cloudEnabled, initCloud, onCloudChange, sendCode, verifyCode, signOut, pull, statusLabel,
  signInPassword, signUp, resetPassword, updatePassword, resendConfirmation, authError } from './cloud.js';
import { auth, resetAuth, renderAuth, renderSplash, mountAuthFx, passStrength, STRENGTH_LABEL } from './views/auth.js';

const VIEWS = {
  hoy: renderHoy, tareas: renderTareas, planner: renderPlanner, habitos: renderHabitos,
  metas: renderMetas, diario: renderDiario, stats: renderStats, logros: renderLogros, mapa: renderMapa,
};

// Tocar un punto del mapa abre lo que representa.
function openFromMap(n) {
  if (n.kind === 'habit') openHabit(n.ref);
  else if (n.kind === 'goal') openGoal(n.ref);
  else if (n.kind === 'task') openTask(n.ref);
  else if (n.kind === 'journal') { setDiaryDate(n.ref); go('diario'); }
  else if (n.kind === 'category' || n.id === 'hub:task') go('tareas');
  else if (n.id === 'hub:habit') go('habitos');
  else if (n.id === 'hub:goal') go('metas');
  else if (n.id === 'hub:journal') go('diario');
}
const DOCK_MAIN = ['hoy', 'tareas', 'habitos'];

let view = 'hoy';
let authShownAt = 0;
let lastView = null;
let pop = null;

/* ---------- Render ---------- */

// Cuenta obligatoria: sin sesión se muestra la pantalla de entrada.
function gate() {
  if (!cloudEnabled) return null;
  if (cloud.status === 'loading') return 'splash';
  if (cloud.recovery) return 'newpass';
  if (!cloud.user) return 'auth';
  return null;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]').content = state.theme === 'light' ? '#F5F5F5' : '#000000';

  const app = document.getElementById('app');
  const g = gate();
  document.body.classList.toggle('auth-mode', !!g);
  if (g) {
    if (sheet) closeSheet();
    if (g === 'newpass' && auth.mode !== 'newpass') resetAuth('newpass');
    app.innerHTML = g === 'splash' ? renderSplash() : renderAuth();
    // Animaciones de entrada solo al aparecer la pantalla (no al cambiar de pestaña).
    if (g !== 'splash' && !authShownAt) authShownAt = Date.now();
    app.querySelector('.auth')?.classList.toggle('intro', Date.now() - authShownAt < 1500);
    if (g !== 'splash') mountAuthFx();
    lastView = null;
    return;
  }
  app.dataset.view = view;
  app.innerHTML = VIEWS[view]({ pop });
  pop = null;
  if (view === 'mapa') mountMapa(openFromMap);
  if (lastView !== view) {
    app.classList.remove('view-enter');
    void app.offsetWidth;
    app.classList.add('view-enter');
    window.scrollTo(0, 0);
    if (view === 'planner') scrollPlannerToNow();
    lastView = view;
  }

  document.getElementById('side-level').innerHTML = levelCard(true);
  document.getElementById('side-theme').innerHTML = `${icon(state.theme === 'dark' ? 'sun' : 'moon')}<span>${state.theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>`;
  document.querySelectorAll('.side [data-view]').forEach((b) => setActive(b, b.dataset.view === view));
  document.querySelectorAll('.dock [data-view]').forEach((b) => setActive(b, b.dataset.view === view));
  setActive(document.querySelector('.dock [data-action="more"]'), !DOCK_MAIN.includes(view));

  if (sheet) renderSheet();
  const news = checkRewards();
  if (news.length) toastQueue(news);
}

function paintSyncBadge() {
  if (!cloudEnabled) return;
  const btn = document.querySelector('.side-foot [data-action="settings"]');
  btn.dataset.sync = cloud.user ? cloud.status : 'signedout';
  btn.dataset.tip = cloud.user ? `${statusLabel()} · ${cloud.user.email}` : 'Ajustes · sin cuenta';
}

function setActive(el, on) {
  el.classList.toggle('is-active', on);
  if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
}

function scrollPlannerToNow() {
  const now = new Date();
  const y = Math.max(0, (now.getHours() - START_H - 1) * HOUR_PX);
  const body = document.querySelector('.pl-body');
  if (body) window.scrollTo(0, body.getBoundingClientRect().top + window.scrollY + y - 180);
}

setRenderer(render);

function go(v) {
  view = v;
  if (sheet) closeSheet();
  render();
}

/* ---------- Acciones ---------- */

function toggleHabit(id) {
  const h = findHabit(id);
  const t = today();
  if (!h) return;
  if (!isScheduled(h, t)) { toast('Hoy no toca este hábito'); return; }
  const wasDone = statusOf(h, t) === 'done';
  setStatus(h, t, wasDone ? null : 'done');
  if (!wasDone) {
    pop = id;
    if (navigator.vibrate) navigator.vibrate(12);
    const pending = state.habits.some((x) => isScheduled(x, t) && !statusOf(x, t));
    toast(pending ? `${h.emoji} ${streakOf(h)} 🔥 · +10 XP` : '🔥 ¡Día perfecto! +20 XP extra');
  }
  render();
}

function toggleTask(id) {
  const t = findTask(id);
  if (!t) return;
  const done = t.status === 'done';
  setTaskStatus(t, done ? 'todo' : 'done');
  if (!done) { pop = id; if (navigator.vibrate) navigator.vibrate(12); toast('✓ Tarea completada · +5 XP'); }
  render();
}

function saveHabit() {
  const d = sheet.draft;
  const name = d.name.trim();
  if (!name) { toast('Escribe un nombre para tu hábito'); document.getElementById('f-name')?.focus(); return; }
  if (!d.days.length) { toast('Elige al menos un día'); return; }
  if (sheet.mode === 'add') {
    state.habits.push({ id: uid(), emoji: d.emoji, name, days: [...d.days].sort(), time: d.time, createdAt: keyOf(today()) });
    toast(`${d.emoji} Hábito creado`);
  } else {
    Object.assign(findHabit(sheet.id), { emoji: d.emoji, name, days: [...d.days].sort(), time: d.time });
    toast('Cambios guardados');
  }
  save(); closeSheet(); render();
}

function deleteHabit() {
  const h = findHabit(sheet.id);
  if (!h || !confirm(`¿Eliminar "${h.name}"? También se borrará su historial.`)) return;
  state.habits = state.habits.filter((x) => x.id !== h.id);
  for (const k of Object.keys(state.log)) {
    delete state.log[k][h.id];
    if (!Object.keys(state.log[k]).length) delete state.log[k];
  }
  for (const g of state.goals) if (g.habitId === h.id) g.habitId = '';
  save(); closeSheet(); toast('Hábito eliminado'); render();
}

function saveTask() {
  const d = sheet.draft;
  const title = d.title.trim();
  if (!title) { toast('Escribe la tarea'); document.getElementById('f-title')?.focus(); return; }
  const pendingSub = document.getElementById('f-sub')?.value.trim();
  if (pendingSub) d.subtasks.push({ id: uid(), title: pendingSub, done: false });
  const fields = { title, date: d.date || null, time: d.time, duration: +d.duration || 30, urgent: d.urgent, important: d.important, category: d.category, subtasks: d.subtasks };
  if (sheet.mode === 'add') {
    state.tasks.push(newTask(fields));
    toast('✓ Tarea creada');
  } else {
    const t = findTask(sheet.id);
    Object.assign(t, fields);
    if (t.status !== d.status) setTaskStatus(t, d.status);
    toast('Cambios guardados');
  }
  save(); closeSheet(); render();
}

function deleteTask() {
  const t = findTask(sheet.id);
  if (!t || !confirm(`¿Eliminar "${t.title}"?`)) return;
  state.tasks = state.tasks.filter((x) => x.id !== t.id);
  save(); closeSheet(); toast('Tarea eliminada'); render();
}

function saveGoal() {
  const d = sheet.draft;
  const title = d.title.trim();
  const target = parseFloat(d.target);
  if (!title) { toast('Escribe tu meta'); return; }
  if (!(target > 0)) { toast('Pon un número objetivo mayor a 0'); return; }
  const fields = { emoji: d.emoji, title, target, unit: d.unit.trim(), deadline: d.deadline || '', habitId: d.habitId || '' };
  if (sheet.mode === 'add') {
    const start = parseFloat(d.start) || 0;
    state.goals.push({ id: uid(), createdAt: keyOf(today()), history: start ? [{ date: keyOf(today()), amount: start }] : [], ...fields });
    toast(`${d.emoji} Meta creada`);
  } else {
    Object.assign(findGoal(sheet.id), fields);
    toast('Cambios guardados');
  }
  save(); closeSheet(); render();
}

function deleteGoal() {
  const g = findGoal(sheet.id);
  if (!g || !confirm(`¿Eliminar la meta "${g.title}"?`)) return;
  state.goals = state.goals.filter((x) => x.id !== g.id);
  save(); closeSheet(); toast('Meta eliminada'); render();
}

function saveGoalAdd() {
  const amount = parseFloat(sheet.amount);
  if (!amount) { toast('Escribe cuánto avanzaste'); return; }
  const g = findGoal(sheet.id);
  (g.history || (g.history = [])).push({ date: keyOf(today()), amount });
  save(); closeSheet(); toast(`${g.emoji} +${amount} sumado`); render();
}

function setMood(v, k = keyOf(today())) {
  const e = state.journal[k] || (state.journal[k] = { text: '', mood: null });
  e.mood = e.mood === v ? null : v;
  save(); render();
}

const actions = {
  nav: (el) => go(el.dataset.view),
  theme: () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); render(); },
  new: () => openSheet('new'),
  more: () => openSheet('more'),

  // Cuenta y nube
  login: () => openSheet('login', { step: 'email', draft: { email: cloud.user?.email || '', code: '' } }),
  'send-code': sendLoginCode,
  'verify-code': verifyLoginCode,
  'show-code': () => { sheet.showCode = true; renderSheet(); setTimeout(() => document.getElementById('f-code')?.focus(), 50); },
  'login-back': () => { Object.assign(sheet, { step: 'email', error: '', busy: false }); renderSheet(); },
  logout: async () => {
    if (!confirm('¿Cerrar sesión? Tus datos quedan guardados en la nube.')) return;
    await signOut(); resetAuth('login'); view = 'hoy'; authShownAt = 0; render(); toast('Sesión cerrada');
  },
  'change-pass': () => openSheet('password', { draft: { password: '' } }),
  'save-pass': async () => {
    const pw = sheet.draft.password || '';
    if (pw.length < 8) { sheet.error = 'Usa al menos 8 caracteres'; renderSheet(); return; }
    Object.assign(sheet, { busy: true, error: '' }); renderSheet();
    try { await updatePassword(pw); closeSheet(); toast('✓ Contraseña guardada'); }
    catch (e) { Object.assign(sheet, { busy: false, error: authError(e) }); renderSheet(); }
  },

  // Pantalla de entrada
  'auth-mode': (el) => { resetAuth(el.dataset.v); render(); setTimeout(() => document.getElementById('a-email')?.focus(), 30); },
  'auth-eye': () => { auth.showPass = !auth.showPass; render(); document.getElementById('a-pass')?.focus(); },
  'auth-resend': async () => {
    Object.assign(auth, { busy: true, error: '' }); render();
    try { await resendConfirmation(auth.email); toast('Correo reenviado'); } catch (e) { auth.error = authError(e); }
    auth.busy = false; render();
  },
  'sync-now': () => pull().then(() => toast('✓ Sincronizado')).catch(() => toast('No se pudo sincronizar. Revisa tu conexión.')),
  'cloud-banner-off': () => { state.ui.cloudBannerOff = true; save(); render(); },

  // Ajustes y respaldo
  settings: () => openSheet('settings'),
  'set-theme': (el) => { state.theme = el.dataset.v; save(); render(); },
  'export-data': () => {
    const blob = new Blob([JSON.stringify({ app: 'atlas', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atlas-respaldo-${keyOf(today())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('✓ Copia descargada');
  },
  'pick-file': () => document.getElementById('f-import')?.click(),
  'del-cat': (el) => {
    const c = el.dataset.v;
    const used = state.tasks.filter((t) => t.category === c).length;
    if (!confirm(`¿Eliminar la categoría "${c}"?${used ? ` ${used} ${used === 1 ? 'tarea quedará' : 'tareas quedarán'} sin categoría.` : ''}`)) return;
    state.categories = state.categories.filter((x) => x !== c);
    for (const t of state.tasks) if (t.category === c) t.category = '';
    save(); render();
  },
  'wipe-data': () => {
    if (!confirm(`¿Borrar TODOS tus hábitos, tareas, metas y notas${cloud.user ? ' (también de la nube)' : ''}? Esto no se puede deshacer.`)) return;
    if (!confirm('Última confirmación: ¿seguro? Te recomendamos descargar una copia antes.')) return;
    replaceState(null);
    closeSheet(); go('hoy'); toast('Datos borrados');
  },
  'close-sheet': () => closeSheet(),

  // Hábitos
  'toggle-habit': (el) => toggleHabit(el.dataset.id),
  'skip-habit': (el) => {
    const h = findHabit(el.dataset.id);
    const t = today();
    if (statusOf(h, t) === 'skip') { setStatus(h, t, null); render(); return; }
    if (skipsThisWeek(h) >= SKIPS_PER_WEEK) { toast('Ya usaste tu descanso de esta semana'); return; }
    setStatus(h, t, 'skip'); toast('🌙 Descanso registrado. Tu racha está a salvo'); render();
  },
  'quick-habit': (el) => {
    const [emoji, name] = HABIT_SUGGESTIONS[+el.dataset.i];
    state.habits.push({ id: uid(), emoji, name, days: [...ALL_DAYS], time: '', createdAt: keyOf(today()) });
    save(); toast(`${emoji} ${name} agregado`); render();
  },
  'new-habit': () => openHabit(),
  'edit-habit': (el) => openHabit(el.dataset.id),
  'habit-suggest': (el) => { const [emoji, name] = HABIT_SUGGESTIONS[+el.dataset.i]; Object.assign(sheet.draft, { emoji, name }); renderSheet(); },
  'habit-day': (el) => {
    const d = +el.dataset.d;
    const days = sheet.draft.days;
    sheet.draft.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    renderSheet();
  },
  'emoji-toggle': () => { sheet.emojiOpen = !sheet.emojiOpen; renderSheet(); },
  'emoji-pick': (el) => { sheet.draft.emoji = el.dataset.e; sheet.emojiOpen = false; renderSheet(); },
  'save-habit': saveHabit,
  'delete-habit': deleteHabit,

  // Tareas
  'toggle-task': (el) => toggleTask(el.dataset.id),
  'new-task': () => openTask(),
  'edit-task': (el) => openTask(el.dataset.id),
  'advance-task': (el) => {
    const t = findTask(el.dataset.id);
    setTaskStatus(t, t.status === 'todo' ? 'doing' : 'done');
    if (t.status === 'done') toast('✓ Tarea completada · +5 XP');
    render();
  },
  'pick-date': (el) => { const i = el.querySelector('input'); try { i.showPicker(); } catch { i.focus(); } },
  'task-date': (el) => { sheet.draft.date = el.dataset.v || null; renderSheet(); },
  'task-flag': (el) => { sheet.draft[el.dataset.v] = !sheet.draft[el.dataset.v]; renderSheet(); },
  'task-cat': (el) => { sheet.draft.category = sheet.draft.category === el.dataset.v ? '' : el.dataset.v; renderSheet(); },
  'task-cat-new': () => {
    const name = (prompt('Nombre de la nueva categoría') || '').trim();
    if (!name) return;
    const c = name[0].toUpperCase() + name.slice(1);
    if (!state.categories.includes(c)) { state.categories.push(c); save(); }
    sheet.draft.category = c; renderSheet();
  },
  'task-status': (el) => { sheet.draft.status = el.dataset.v; renderSheet(); },
  'sub-toggle': (el) => { const s = sheet.draft.subtasks[+el.dataset.i]; s.done = !s.done; renderSheet(); },
  'sub-del': (el) => { sheet.draft.subtasks.splice(+el.dataset.i, 1); renderSheet(); },
  'save-task': saveTask,
  'delete-task': deleteTask,
  'overdue-to-today': () => {
    const tk = keyOf(today());
    let n = 0;
    for (const t of state.tasks) if (t.status !== 'done' && t.date && t.date < tk) { t.date = tk; n++; }
    save(); toast(`${n} ${n === 1 ? 'tarea movida' : 'tareas movidas'} a hoy`); render();
  },
  'tasks-view': (el) => { state.ui.tasksView = el.dataset.v; save(); render(); },

  // Planner
  'planner-move': (el) => {
    const step = plannerMode() === 'semana' ? 7 : 1;
    state.ui.plannerAnchor = keyOf(addDays(plannerAnchor(), +el.dataset.v * step));
    render();
  },
  'planner-today': () => { state.ui.plannerAnchor = null; render(); scrollPlannerToNow(); },
  'planner-colors': () => { state.ui.plannerColors = state.ui.plannerColors === false; save(); render(); },
  'planner-mode': (el) => { state.ui.plannerMode = el.dataset.v; save(); render(); },
  'planner-slot': (el, e) => {
    const rect = el.getBoundingClientRect();
    const min = START_H * 60 + Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30;
    openTask(null, { date: el.dataset.date, time: fromMinutes(Math.min(min, 23 * 60 + 30)), duration: 60 });
  },

  // Metas
  'new-goal': (el) => openGoal(null, el.dataset.i != null ? +el.dataset.i : null),
  'edit-goal': (el) => openGoal(el.dataset.id),
  'goal-suggest': (el) => {
    const s = GOAL_SUGGESTIONS[+el.dataset.i];
    Object.assign(sheet.draft, { emoji: s.emoji, title: s.title, target: s.target, unit: s.unit });
    renderSheet();
  },
  'save-goal': saveGoal,
  'delete-goal': deleteGoal,
  'goal-add': (el) => openSheet('goal-add', { id: el.dataset.id, amount: '' }),
  'goal-quick': (el) => { sheet.amount = (parseFloat(sheet.amount) || 0) + +el.dataset.v; renderSheet(); },
  'save-goal-add': saveGoalAdd,

  // Mapa
  'map-toggle': (el) => { toggleKind(el.dataset.v); render(); },
  'map-zoom': (el) => zoomMapa(+el.dataset.v),

  // Diario
  mood: (el) => setMood(+el.dataset.v, el.dataset.date),
  'diary-move': (el) => {
    const cur = diaryDate ? fromKey(diaryDate) : today();
    const next = addDays(cur, +el.dataset.v);
    if (next > today()) return;
    setDiaryDate(keyOf(next)); render();
  },
  'diary-open': (el) => { setDiaryDate(el.dataset.date); render(); window.scrollTo(0, 0); },
  'new-note': () => { setDiaryDate(null); go('diario'); setTimeout(() => document.querySelector('[data-journal]')?.focus(), 350); },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const markLoginPending = () => { try { localStorage.setItem('atlas-login-pending', '1'); } catch { /* ignorar */ } };

async function submitAuth() {
  const mode = auth.mode;
  const email = auth.email.trim().toLowerCase();
  const fail = (msg) => { auth.error = msg; render(); };
  if (['login', 'signup', 'forgot', 'link'].includes(mode) && !EMAIL_RE.test(email)) return fail('Escribe un correo válido.');
  if (mode === 'login' && !auth.password) return fail('Escribe tu contraseña.');
  if ((mode === 'signup' || mode === 'newpass') && auth.password.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.');

  Object.assign(auth, { email, busy: true, error: '' });
  render();
  try {
    if (mode === 'login') { markLoginPending(); await signInPassword(email, auth.password); }
    else if (mode === 'signup') {
      markLoginPending();
      const mustConfirm = await signUp(email, auth.password);
      if (mustConfirm) resetAuth('sent-confirm');
    }
    else if (mode === 'forgot') { await resetPassword(email); resetAuth('sent-reset'); }
    else if (mode === 'link') { markLoginPending(); await sendCode(email); resetAuth('sent-link'); }
    else if (mode === 'newpass') { await updatePassword(auth.password); resetAuth('login'); toast('✓ Contraseña guardada'); }
  } catch (e) {
    auth.error = authError(e);
  }
  auth.busy = false;
  render();
}

async function sendLoginCode() {
  const email = (sheet.draft.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) { sheet.error = 'Escribe un correo válido'; renderSheet(); return; }
  Object.assign(sheet, { busy: true, error: '' });
  sheet.draft.email = email;
  renderSheet();
  try {
    await sendCode(email);
    try { localStorage.setItem('atlas-login-pending', '1'); } catch { /* ignorar */ }
    Object.assign(sheet, { step: 'code', busy: false, showCode: false });
    renderSheet();
  } catch (e) {
    const msg = /rate|seconds/i.test(e.message || '') ? 'Espera un minuto antes de pedir otro código' : 'No se pudo enviar el código. Revisa tu conexión e inténtalo de nuevo.';
    Object.assign(sheet, { busy: false, error: msg });
    renderSheet();
  }
}

async function verifyLoginCode() {
  const code = (sheet.draft.code || '').replace(/\D/g, '');
  if (code.length < 6) { sheet.error = 'El código tiene 6 dígitos'; renderSheet(); return; }
  Object.assign(sheet, { busy: true, error: '' });
  renderSheet();
  try {
    await verifyCode(sheet.draft.email, code);
  } catch {
    Object.assign(sheet, { busy: false, error: 'Código incorrecto o vencido. Revisa el correo o pide otro.' });
    renderSheet();
  }
}

/* ---------- Eventos ---------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || el.hasAttribute('disabled')) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

// Accesibilidad: Enter / Espacio en elementos con role="button".
document.addEventListener('keydown', (e) => {
  if (sheet && e.key === 'Escape') { closeSheet(); return; }
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.matches('[role="button"][data-action]')) { e.preventDefault(); t.click(); return; }
  if (e.key === 'Enter' && sheet) {
    if (t.id === 'f-sub') {
      e.preventDefault();
      const v = t.value.trim();
      if (!v) return;
      sheet.draft.subtasks.push({ id: uid(), title: v, done: false });
      renderSheet();
      document.getElementById('f-sub')?.focus();
    } else if (t.id === 'f-name') { e.preventDefault(); saveHabit(); }
    else if (t.id === 'f-title' && sheet.type === 'task') { e.preventDefault(); saveTask(); }
    else if (t.id === 'f-amount') { e.preventDefault(); saveGoalAdd(); }
    else if (t.id === 'f-email') { e.preventDefault(); sendLoginCode(); }
    else if (t.id === 'f-code') { e.preventDefault(); verifyLoginCode(); }
    else if (t.id === 'f-pass') { e.preventDefault(); actions['save-pass'](); }
  }
});

let journalTimer;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.auth) {
    auth[t.dataset.auth] = t.value;
    if (auth.error) { auth.error = ''; t.closest('.auth-card')?.querySelector('.form-error')?.remove(); }
    const m = document.querySelector('.pw-meter');
    if (m && t.dataset.auth === 'password') { const s = passStrength(t.value); m.dataset.level = s; m.querySelector('span').textContent = STRENGTH_LABEL[s]; }
    return;
  }
  if (sheet && t.dataset.bind) {
    if (sheet.type === 'goal-add') sheet[t.dataset.bind] = t.value;
    else sheet.draft[t.dataset.bind] = t.value;
  }
  if (t.dataset.journal) {
    const k = t.dataset.journal;
    const entry = state.journal[k] || (state.journal[k] = { text: '', mood: null });
    entry.text = t.value;
    clearTimeout(journalTimer);
    journalTimer = setTimeout(() => { save(); const news = checkRewards(); if (news.length) toastQueue(news); }, 500);
  }
});

document.addEventListener('change', (e) => {
  if (sheet && e.target.dataset.bind === 'date') renderSheet();
  if (e.target.matches('[data-import]')) importBackup(e.target);
});

async function importBackup(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!isValidBackup(data)) throw new Error('formato');
    const summary = `${data.habits.length} hábitos, ${data.tasks.length} tareas y ${(data.goals || []).length} metas`;
    if (!confirm(`Restaurar copia con ${summary}? Reemplazará los datos actuales.`)) return;
    delete data.app; delete data.version; delete data.exportedAt;
    replaceState(data);
    closeSheet(); go('hoy'); toast('✓ Copia restaurada');
  } catch {
    toast('Ese archivo no es una copia válida de atlas');
  }
}

document.addEventListener('submit', (e) => {
  if (e.target.closest('[data-form="auth"]')) { e.preventDefault(); submitAuth(); return; }
  const form = e.target.closest('[data-form="quick-task"]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input');
  const raw = input.value.trim();
  if (!raw) return;
  const p = parseTask(raw);
  if (!p.title) { toast('Escribe qué tienes que hacer'); return; }
  const task = newTask({ title: p.title, date: p.date === undefined ? keyOf(today()) : p.date, time: p.time, urgent: p.urgent, important: p.important, category: p.category });
  if (p.category && !state.categories.includes(p.category)) state.categories.push(p.category);
  state.tasks.push(task);
  save();
  toast(`✓ ${task.title} · ${fmtDay(task.date)}${task.time ? ` ${fmtTime(task.time)}` : ''}`);
  render();
  document.querySelector('.quick-input')?.focus();
});

// Arrastrar y soltar (Kanban / Eisenhower, en computadora).
document.addEventListener('dragstart', (e) => {
  const card = e.target.closest('[data-drag-id]');
  if (!card) return;
  e.dataTransfer.setData('text/plain', card.dataset.dragId);
  e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
document.addEventListener('dragend', (e) => e.target.closest?.('[data-drag-id]')?.classList.remove('dragging'));
document.addEventListener('dragover', (e) => {
  const zone = e.target.closest('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  document.querySelectorAll('.is-over').forEach((z) => z !== zone && z.classList.remove('is-over'));
  zone.classList.add('is-over');
});
document.addEventListener('dragleave', (e) => {
  const zone = e.target.closest('[data-drop]');
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
});
document.addEventListener('drop', (e) => {
  const zone = e.target.closest('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  const t = findTask(e.dataTransfer.getData('text/plain'));
  if (!t) return;
  const [kind, val] = zone.dataset.drop.split(':');
  if (kind === 'status') {
    setTaskStatus(t, val);
    if (val === 'done') toast('✓ Tarea completada · +5 XP');
  } else {
    const q = QUADRANTS.find((x) => x.id === val);
    t.urgent = q.urgent; t.important = q.important; save();
  }
  render();
});

// Tooltip para gráficos y calendarios (solo con mouse).
const tip = document.getElementById('tip');
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.classList.remove('is-on'); return; }
  tip.textContent = el.dataset.tip;
  const r = el.getBoundingClientRect();
  tip.classList.add('is-on');
  const w = tip.offsetWidth;
  tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
});
document.addEventListener('scroll', () => tip.classList.remove('is-on'), { passive: true });

// Si cambia el día con la app abierta, refrescar al volver.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !gate()) render(); });

document.getElementById('side-brand').innerHTML = `${logo(30)}<span>atlas</span>`;
render();

// Nube: al cambiar el estado, actualizar el indicador y la hoja de ajustes abierta.
let bannerWas = cloudBannerVisible();
let userWas = null;
let gateWas = gate();
onCloudChange(() => {
  paintSyncBadge();
  const g = gate();
  if (g !== gateWas) { gateWas = g; render(); }
  // Recién inició sesión (por enlace o por código): cerrar la espera y avisar.
  const uid = cloud.user?.id || null;
  if (uid && uid !== userWas) {
    if (sheet?.type === 'login') closeSheet();
    let pending = false;
    try { pending = !!localStorage.getItem('atlas-login-pending'); localStorage.removeItem('atlas-login-pending'); } catch { /* ignorar */ }
    if (pending) toast('✓ Sesión iniciada · tus datos se guardan en la nube');
  }
  userWas = uid;
  if (sheet?.type === 'settings') renderSheet();
  const now = cloudBannerVisible();
  if (now !== bannerWas && view === 'hoy' && !gate()) render();
  bannerWas = now;
});
initCloud();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
