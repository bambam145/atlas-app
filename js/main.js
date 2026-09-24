// atlas — punto de entrada: navegación, render y acciones.
import { state, save, setRenderer, replaceState, isValidBackup } from './store.js';
import { icon, logo, wordmark } from './icons.js';
import { today, keyOf, fromKey, addDays, fromMinutes, uid, fmtDay, fmtTime, pad, ALL_DAYS } from './util.js';
import { findHabit, isScheduled, statusOf, setStatus, streakOf, skipsThisWeek, SKIPS_PER_WEEK, HABIT_SUGGESTIONS, momentTime,
  isCounter, isWeekly, targetOf, countOf, setCount, weekCount, perWeekOf, habitFromSuggestion,
  isChoice, isSleep, choiceLabels, CHOICE_VALUES, setSleep, sleepMinutes, sleepGoalOf, fmtDuration, isGlasses, litersText, migrateHabits,
  isQuit, challengeOf, CHALLENGES, activePause, PAUSE_REASONS } from './habits.js';
import { findTask, newTask, setTaskStatus, parseTask, QUADRANTS, ensureRecurrence, repeatLabel } from './tasks.js';
import { findGoal, GOAL_SUGGESTIONS } from './goals.js';
import { checkRewards } from './xp.js';
import { toast, toastQueue } from './ui.js';
import { sheet, openSheet, closeSheet, renderSheet, openHabit, openTask, openGoal, inviteText, openSleep } from './sheets.js';
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
  signInPassword, signUp, resetPassword, updatePassword, resendConfirmation, authError,
  licenseInfo, redeemCode, fetchLicense, PLAN_LABEL, captureRef, myReferral, deleteAccount } from './cloud.js';
import { auth, resetAuth, renderAuth, renderSplash, mountAuthFx, passStrength, STRENGTH_LABEL } from './views/auth.js';
import { ob, obSteps, obMoment, renderOnboarding } from './views/onboarding.js';
import { pw, renderPaywall } from './views/paywall.js';
import { renderStreakImage, shareNative, shareText, APP_URL } from './share.js';
import { initPixel, trackRegistration, trackPurchase } from './pixel.js';
import { enablePush, disablePush, forgetPush, refreshPush, reminders } from './push.js';
import { initInstall, promptInstall, canPromptInstall, installPlatform } from './install.js';

// Enlace para compartir: incluye tu código de invitado si ya lo tienes.
const shareLink = () => (state.refCode ? `${APP_URL}?ref=${state.refCode}` : APP_URL);

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
{
  const v = new URLSearchParams(location.search).get('v');
  if (v && VIEWS[v]) { view = v; history.replaceState(null, '', location.pathname); }
}
let authShownAt = 0;
let lastView = null;
let pop = null;

/* ---------- Render ---------- */

// Cuenta obligatoria: sin sesión se muestra la pantalla de entrada.
function gate() {
  if (cloudEnabled) {
    if (cloud.status === 'loading') return 'splash';
    if (cloud.recovery) return 'newpass';
    if (!cloud.user) return 'auth';
    // Primera sincronización en este dispositivo: esperar los datos de la nube antes de decidir.
    if (cloud.status === 'syncing' && !state.profile) return 'splash';
    if (!licenseInfo().ok) return 'paywall';
  }
  if (!state.profile?.onboarded) return 'onboarding';
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
    if (g === 'paywall') {
      app.innerHTML = renderPaywall();
      lastView = null;
      return;
    }
    if (g === 'onboarding') {
      if (!ob.name && cloud.user?.user_metadata?.name) ob.name = cloud.user.user_metadata.name;
      app.innerHTML = renderOnboarding();
      lastView = null;
      return;
    }
    app.innerHTML = g === 'splash' ? renderSplash() : renderAuth();
    // Animaciones de entrada solo al aparecer la pantalla (no al cambiar de pestaña).
    if (g !== 'splash' && !authShownAt) authShownAt = Date.now();
    app.querySelector('.auth')?.classList.toggle('intro', Date.now() - authShownAt < 1500);
    if (g !== 'splash') mountAuthFx();
    lastView = null;
    return;
  }
  migrateHabits();
  ensureRecurrence();
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
  const news = [...challengeNews(), ...checkRewards()];
  if (news.length) toastQueue(news);
}

// Un reto recién cumplido se celebra una sola vez.
function challengeNews() {
  const out = [];
  for (const h of state.habits) {
    const c = challengeOf(h);
    if (c?.complete && !h.challenge.doneAt) {
      h.challenge.doneAt = keyOf(today());
      out.push(`🏅 ¡Reto cumplido! ${h.emoji} ${c.days} días de ${h.name}`);
    }
  }
  if (out.length) save();
  return out;
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

// Deshacer: guarda una foto de tus datos y la restaura si tocas "Deshacer".
const DATA_KEYS = ['habits', 'log', 'tasks', 'goals', 'journal', 'times', 'sleep', 'pauses'];
function snapshot() {
  const snap = JSON.stringify(Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]])));
  return () => { Object.assign(state, JSON.parse(snap)); save(); render(); toast('Listo, se deshizo'); };
}

function toggleHabit(id) {
  const h = findHabit(id);
  const t = today();
  if (!h) return;
  if (!isScheduled(h, t)) { toast('Hoy no toca este hábito'); return; }
  // Opciones (comidas) y sueño se registran en una hoja.
  if (isChoice(h)) { openSheet('choice', { id }); return; }
  if (isQuit(h)) { openSheet('day', { id, day: keyOf(t) }); return; }
  if (isSleep(h)) { openSleep(h); return; }
  const wasDone = statusOf(h, t) === 'done';
  if (isCounter(h)) {
    // Contador: cada toque suma uno, sin tope. La meta se cumple al llegar a la meta.
    const n = countOf(h, t) + 1;
    setCount(h, t, n);
    pop = id;
    if (navigator.vibrate) navigator.vibrate(12);
    const liters = isGlasses(h) ? ` · ${litersText(n)}` : '';
    if (n !== targetOf(h)) {
      toast(n > targetOf(h) ? `${h.emoji} ${n} ${h.unit || 'veces'}${liters} · +${n - targetOf(h)} sobre tu meta 🎉` : `${h.emoji} ${n}/${targetOf(h)} ${h.unit || ''}${liters}`.trim());
      render(); return;
    }
  } else {
    const undo = snapshot();
    setStatus(h, t, wasDone ? null : 'done');
    if (wasDone) { toast(`${h.emoji} Desmarcado`, undo); render(); return; }
  }
  if (!wasDone) {
    pop = id;
    if (navigator.vibrate) navigator.vibrate(12);
    const pending = state.habits.some((x) => !isWeekly(x) && isScheduled(x, t) && !statusOf(x, t));
    if (isWeekly(h)) {
      const wc = weekCount(h, t);
      toast(wc >= perWeekOf(h) ? `🎉 ¡Meta semanal cumplida! ${h.emoji} ${wc}/${perWeekOf(h)}` : `${h.emoji} ${wc}/${perWeekOf(h)} esta semana · +10 XP`);
    } else {
      toast(pending ? `${h.emoji} ${streakOf(h)} 🔥 · +10 XP` : '🔥 ¡Día perfecto! +20 XP extra');
    }
  }
  render();
}

const nowTime = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; };

// Registrar una opción (sano / no sano / no comí).
function pickChoice(id, v) {
  const h = findHabit(id);
  const t = today();
  if (!h) return;
  setStatus(h, t, v);
  closeSheet();
  pop = id;
  if (navigator.vibrate) navigator.vibrate(12);
  const lbl = choiceLabels(h)[CHOICE_VALUES.indexOf(v)];
  if (v === 'done') {
    const pending = state.habits.some((x) => !isWeekly(x) && isScheduled(x, t) && !statusOf(x, t));
    toast(pending ? `${h.emoji} ${lbl} · ${streakOf(h)} 🔥 · +10 XP` : `🔥 ¡Día completo! ${h.emoji} ${lbl}`);
  } else toast(`${h.emoji} ${lbl} · registrado`);
  render();
}

// Guardar sueño: con las dos horas se calcula cuánto dormiste; solo con la de acostarte queda pendiente.
function saveSleep() {
  const h = findHabit(sheet.id);
  const { bed, wake } = sheet.draft;
  if (!bed) { toast('Pon la hora en que te acostaste'); return; }
  const d = fromKey(sheet.day);
  setSleep(h, d, { bed, wake });
  closeSheet();
  if (!wake) toast('🌙 Buenas noches. Mañana toca al despertar');
  else {
    const min = sleepMinutes({ bed, wake });
    pop = h.id;
    toast(min >= sleepGoalOf(h) * 60 - 15 ? `☀️ Dormiste ${fmtDuration(min)} · meta cumplida` : `☀️ Dormiste ${fmtDuration(min)} · meta ${String(sleepGoalOf(h)).replace('.', ',')} h`);
  }
  render();
}

function decHabit(id) {
  const h = findHabit(id);
  const t = today();
  if (!h) return;
  setCount(h, t, countOf(h, t) - 1);
  render();
}

function toggleTask(id) {
  const t = findTask(id);
  if (!t) return;
  const undo = snapshot();
  const done = t.status === 'done';
  setTaskStatus(t, done ? 'todo' : 'done');
  if (!done) {
    pop = id; if (navigator.vibrate) navigator.vibrate(12);
    toast(t.repeat ? `✓ Hecha · la próxima ya está en tu lista` : '✓ Tarea completada · +5 XP', undo);
  }
  render();
}

function saveHabit() {
  const d = sheet.draft;
  const name = d.name.trim();
  if (!name) { toast('Escribe un nombre para tu hábito'); document.getElementById('f-name')?.focus(); return; }
  if (d.freq !== 'weekly' && !d.days.length && d.kind !== 'quit') { toast('Elige al menos un día'); return; }
  const quit = d.kind === 'quit';
  const tk = keyOf(today());
  const since = quit && d.since && d.since <= tk ? d.since : null;
  const old = sheet.mode === 'edit' ? findHabit(sheet.id).challenge : null;
  const challenge = d.challenge ? (old && old.days === d.challenge ? old : { days: d.challenge, start: since && sheet.mode === 'add' ? since : tk }) : undefined;
  const fields = {
    emoji: d.emoji, name, days: d.freq === 'weekly' ? [...ALL_DAYS] : [...d.days].sort(), time: d.time,
    freq: d.freq, perWeek: d.perWeek, target: d.kind === 'counter' ? Math.max(2, d.target) : 1,
    unit: d.kind === 'counter' ? (d.unit || '').trim() : '',
    remind: d.remind !== false, kind: d.kind,
    labels: d.kind === 'choice' ? d.labels.map((x) => (x || '').trim()) : undefined,
    sleepGoal: d.kind === 'sleep' ? d.sleepGoal : undefined,
    challenge,
  };
  // Dejar algo: todos los días, sin hora ni recordatorio; empieza desde el día que lo dejaste.
  if (quit) Object.assign(fields, { days: [...ALL_DAYS], freq: 'days', time: '', remind: false });
  if (since) fields.createdAt = since;
  if (sheet.mode === 'add') {
    state.habits.push({ id: uid(), createdAt: tk, ...fields });
    toast(`${d.emoji} Hábito creado`);
  } else {
    Object.assign(findHabit(sheet.id), fields);
    toast('Cambios guardados');
  }
  save(); closeSheet(); render();
}

function deleteHabit() {
  const h = findHabit(sheet.id);
  if (!h || !confirm(`¿Eliminar "${h.name}"? También se borrará su historial.\n\nSi solo quieres dejarlo por un tiempo, usa "Archivar": se guarda todo.`)) return;
  const undo = snapshot();
  state.habits = state.habits.filter((x) => x.id !== h.id);
  for (const k of Object.keys(state.log)) {
    delete state.log[k][h.id];
    if (!Object.keys(state.log[k]).length) delete state.log[k];
  }
  for (const g of state.goals) if (g.habitId === h.id) g.habitId = '';
  save(); closeSheet(); toast('Hábito eliminado', undo); render();
}

function saveTask() {
  const d = sheet.draft;
  const title = d.title.trim();
  if (!title) { toast('Escribe la tarea'); document.getElementById('f-title')?.focus(); return; }
  const pendingSub = document.getElementById('f-sub')?.value.trim();
  if (pendingSub) d.subtasks.push({ id: uid(), title: pendingSub, done: false });
  if (d.repeat && !d.date) d.date = keyOf(today()); // una tarea que se repite necesita fecha de inicio
  const fields = {
    title, date: d.date || null, time: d.time, duration: +d.duration || 30, urgent: d.urgent, important: d.important, category: d.category, subtasks: d.subtasks,
    repeat: d.repeat || '', repeatDays: d.repeat === 'week' ? [...d.repeatDays].sort() : [], remind: d.remind !== false,
  };
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
  if (!t) return;
  const undo = snapshot();
  state.tasks = state.tasks.filter((x) => x.id !== t.id);
  save(); closeSheet(); toast('Tarea eliminada', undo); render();
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
  if (!g) return;
  const undo = snapshot();
  state.goals = state.goals.filter((x) => x.id !== g.id);
  save(); closeSheet(); toast('Meta eliminada', undo); render();
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
  nav: (el) => { if (el.dataset.view === 'diario') setDiaryDate(null); go(el.dataset.view); }, // el diario abre siempre en hoy
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
    await forgetPush(); await signOut(); resetAuth('login'); view = 'hoy'; authShownAt = 0; render(); toast('Sesión cerrada');
  },
  'change-pass': () => openSheet('password', { draft: { password: '' } }),
  'save-pass': async () => {
    const pw = sheet.draft.password || '';
    if (pw.length < 8) { sheet.error = 'Usa al menos 8 caracteres'; renderSheet(); return; }
    Object.assign(sheet, { busy: true, error: '' }); renderSheet();
    try { await updatePassword(pw); closeSheet(); toast('✓ Contraseña guardada'); }
    catch (e) { Object.assign(sheet, { busy: false, error: authError(e) }); renderSheet(); }
  },

  // Invita y gana
  invite: async () => {
    openSheet('invite', { ref: null, error: '' });
    try {
      const r = await myReferral();
      if (state.refCode !== r.code) { state.refCode = r.code; save(); }
      if (sheet?.type === 'invite') { sheet.ref = r; renderSheet(); }
    } catch {
      if (sheet?.type === 'invite') { sheet.error = 'No se pudo cargar tu enlace. Revisa tu conexión.'; renderSheet(); }
    }
  },
  'invite-copy': async () => {
    try { await navigator.clipboard.writeText(`${APP_URL}?ref=${sheet.ref.code}`); toast('✓ Enlace copiado'); } catch { toast('No se pudo copiar'); }
  },
  'invite-share': async () => {
    const link = `${APP_URL}?ref=${sheet.ref.code}`;
    if (navigator.share) { try { await navigator.share({ title: 'atlas', text: inviteText(link), url: link }); } catch { /* cancelado */ } }
    else { try { await navigator.clipboard.writeText(inviteText(link)); toast('✓ Mensaje copiado · pégalo donde quieras'); } catch { /* ignorar */ } }
  },

  // Compartir racha
  'share-habit': async (el) => {
    const h = findHabit(el.dataset.id);
    if (!h) return;
    openSheet('share', { id: h.id, url: '', blob: null });
    const blob = await renderStreakImage(h);
    if (sheet?.type !== 'share') return;
    Object.assign(sheet, { blob, url: URL.createObjectURL(blob) });
    renderSheet();
  },
  'share-native': async () => {
    const h = findHabit(sheet.id);
    if (sheet.blob && !(await shareNative(sheet.blob, h, shareLink()))) toast('Tu dispositivo no permite compartir directo: usa Descargar');
  },
  'share-download': () => {
    const a = document.createElement('a');
    a.href = sheet.url; a.download = `atlas-racha-${keyOf(today())}.png`; a.click();
    toast('✓ Imagen descargada · súbela a tus historias');
  },
  'share-copy': async () => {
    const h = findHabit(sheet.id);
    try { await navigator.clipboard.writeText(shareText(h, shareLink())); toast('✓ Texto copiado'); } catch { toast('No se pudo copiar'); }
  },

  // Licencia y códigos
  activate: () => openSheet('activate', { draft: { code: '' } }),
  'redeem-sheet': async () => {
    Object.assign(sheet, { busy: true, error: '' }); renderSheet();
    const msg = await tryRedeem(sheet.draft.code);
    if (msg) { Object.assign(sheet, { busy: false, error: msg }); renderSheet(); } else closeSheet();
  },
  'pw-logout': async () => { await forgetPush(); await signOut(); resetAuth('login'); authShownAt = 0; view = 'hoy'; render(); },

  // Bienvenida
  'ob-next': () => obNext(),
  'ob-back': () => { ob.step = Math.max(0, ob.step - 1); ob.error = ''; render(); },
  'ob-pick': (el) => {
    const i = +el.dataset.i;
    ob.picks = ob.picks.includes(i) ? ob.picks.filter((x) => x !== i) : [...ob.picks, i];
    ob.error = ''; render();
  },
  'ob-moment': (el) => { ob.times[+el.dataset.i] = el.dataset.v; render(); },
  'ob-finish': () => finishOnboarding(),
  'save-name': () => {
    const v = (document.getElementById('f-profile-name')?.value || '').trim();
    if (!v) { toast('Escribe tu nombre'); return; }
    state.profile = { ...(state.profile || {}), name: v, onboarded: true };
    save(); render(); toast('✓ Nombre guardado');
  },

  // Pantalla de entrada
  'auth-mode': (el) => { resetAuth(el.dataset.v); render(); setTimeout(() => document.getElementById('a-email')?.focus(), 30); },
  'auth-other': () => { Object.assign(auth, { useOther: true, email: '', error: '' }); render(); document.getElementById('a-email')?.focus(); },
  'auth-eye': () => { auth.showPass = !auth.showPass; render(); document.getElementById('a-pass')?.focus(); },
  'auth-resend': async () => {
    Object.assign(auth, { busy: true, error: '' }); render();
    try { await resendConfirmation(auth.email); toast('Correo reenviado'); } catch (e) { auth.error = authError(e); }
    auth.busy = false; render();
  },
  'sync-now': () => pull().then(() => toast('✓ Sincronizado')).catch(() => toast('No se pudo sincronizar. Revisa tu conexión.')),
  'cloud-banner-off': () => { state.ui.cloudBannerOff = true; save(); render(); },

  // Ajustes y respaldo
  settings: () => { openSheet('settings'); refreshPush().then(() => { if (sheet?.type === 'settings') renderSheet(); }); },
  // Recordatorios
  'push-on': async () => {
    try { await enablePush(); toast('🔔 Recordatorios activados'); }
    catch (e) { toast(e.message === 'denied' ? 'Bloqueaste las notificaciones en este navegador' : e.message === 'dismissed' ? 'Necesitamos tu permiso para avisarte' : 'No se pudo activar. Revisa tu conexión'); }
    renderSheet();
  },
  'push-off': async () => { await disablePush(); renderSheet(); toast('Recordatorios desactivados en este dispositivo'); },
  'push-test': async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('⏰ Así te avisaremos', { body: 'A la hora de tus hábitos y en la noche si te falta algo.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'atlas-test' });
    } catch { toast('No se pudo mostrar el aviso'); }
  },
  'rem-habits': () => { state.reminders = { ...reminders(), habits: !reminders().habits }; save(); renderSheet(); },
  'rem-summary': () => { state.reminders = { ...reminders(), summary: !reminders().summary }; save(); renderSheet(); },
  'rem-tasks': () => { state.reminders = { ...reminders(), tasks: !reminders().tasks }; save(); renderSheet(); },
  'rem-weekly': () => { state.reminders = { ...reminders(), weekly: !reminders().weekly }; save(); renderSheet(); },
  'install-app': async () => {
    if (!canPromptInstall()) { openSheet('settings'); return; }
    const ok = await promptInstall();
    if (ok) toast('✓ atlas se está instalando');
    paintInstall();
    if (sheet?.type === 'settings') renderSheet();
  },
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
  'delete-account': async () => {
    if (!confirm('¿Eliminar tu cuenta de atlas?\n\nSe borran para siempre tus hábitos, tareas, metas, diario y tu plan (también si pagaste). Esto no se puede deshacer.')) return;
    const typed = prompt('Para confirmar, escribe ELIMINAR');
    if ((typed || '').trim().toUpperCase() !== 'ELIMINAR') { toast('No se eliminó nada'); return; }
    try {
      await forgetPush();
      await deleteAccount();
      closeSheet(); resetAuth('login'); authShownAt = 0; view = 'hoy'; render();
      toast('Tu cuenta y tus datos fueron eliminados');
    } catch (e) { toast(authError(e)); }
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
    const i = +el.dataset.i;
    const h = habitFromSuggestion(i, momentTime(HABIT_SUGGESTIONS[i][2]), uid);
    state.habits.push(h);
    save(); toast(`${h.emoji} ${h.name} agregado`); render();
  },
  'new-habit': () => openHabit(),
  'edit-habit': (el) => openHabit(el.dataset.id),
  'habit-suggest': (el) => {
    const [emoji, name, m, extra = {}] = HABIT_SUGGESTIONS[+el.dataset.i];
    Object.assign(sheet.draft, { emoji, name, time: momentTime(m), freq: 'days', perWeek: 3, target: 1, unit: '', kind: 'check', labels: ['', '', ''], sleepGoal: 8, days: [...ALL_DAYS], ...structuredClone(extra) });
    if (!extra.kind) sheet.draft.kind = sheet.draft.target > 1 ? 'counter' : 'check';
    renderSheet();
  },
  'habit-remind': () => { sheet.draft.remind = !sheet.draft.remind; renderSheet(); },
  'habit-freq': (el) => { sheet.draft.freq = el.dataset.v; renderSheet(); },
  'habit-perweek': (el) => { sheet.draft.perWeek = Math.min(6, Math.max(1, sheet.draft.perWeek + +el.dataset.v)); renderSheet(); },
  'habit-target': (el) => { sheet.draft.target = Math.min(30, Math.max(2, sheet.draft.target + +el.dataset.v)); renderSheet(); },
  'habit-dec': (el) => decHabit(el.dataset.id),
  'habit-kind': (el) => {
    const d = sheet.draft;
    d.kind = el.dataset.v;
    if (d.kind === 'counter' && d.target < 2) { d.target = 8; d.unit = d.unit || 'vasos'; }
    if (d.kind !== 'counter') d.target = 1;
    renderSheet();
  },
  'habit-challenge': (el) => { sheet.draft.challenge = +el.dataset.v; renderSheet(); },
  // Retos listos: usa el hábito si ya lo tienes, si no lo crea.
  'challenge-start': (el) => {
    const [, title, days, i] = CHALLENGES[+el.dataset.i];
    const name = HABIT_SUGGESTIONS[i][1];
    let h = state.habits.find((x) => x.name === name);
    if (!h) { h = habitFromSuggestion(i, momentTime(HABIT_SUGGESTIONS[i][2]), uid); state.habits.push(h); }
    h.challenge = { days, start: keyOf(today()) };
    save(); toast(`🎯 ¡Reto empezado! ${title}`); render();
  },
  'challenge-stop': (el) => {
    const h = findHabit(el.dataset.id);
    if (!h || !confirm(`¿Dejar el reto de ${h.name}? Tu hábito y tu historial se quedan.`)) return;
    delete h.challenge; save(); render();
  },
  // Pausa: vacaciones / enfermo
  pause: () => openSheet('pause', { draft: { reason: 'vacaciones', len: 7 } }),
  'pause-reason': (el) => { sheet.draft.reason = el.dataset.v; renderSheet(); },
  'pause-len': (el) => { sheet.draft.len = +el.dataset.v; renderSheet(); },
  'pause-start': () => {
    const { reason, len } = sheet.draft;
    const from = keyOf(today());
    const to = len ? keyOf(addDays(today(), len - 1)) : null;
    state.pauses = [...(state.pauses || []), { from, to, reason }];
    save(); closeSheet();
    toast(`${PAUSE_REASONS[reason][0]} Pausa activada · tus rachas están a salvo`); render();
  },
  'pause-end': () => {
    const p = activePause();
    if (!p) return;
    const tk = keyOf(today());
    if (p.from === tk) state.pauses = state.pauses.filter((x) => x !== p);
    else p.to = keyOf(addDays(today(), -1));
    save(); if (sheet) closeSheet(); toast('¡Bienvenido de vuelta! 💪'); render();
  },
  'habit-sleepgoal': (el) => { sheet.draft.sleepGoal = Math.min(12, Math.max(4, sheet.draft.sleepGoal + +el.dataset.v)); renderSheet(); },
  'choice-pick': (el) => pickChoice(sheet.id, el.dataset.v),
  'choice-clear': () => { const h = findHabit(sheet.id); setStatus(h, today(), null); closeSheet(); render(); },
  'sleep-now': (el) => { sheet.draft[el.dataset.v] = nowTime(); renderSheet(); },
  'sleep-save': saveSleep,
  // Marcar o corregir cualquier día (desde la cuadrícula o la semana)
  'day-edit': (el) => {
    const h = findHabit(el.dataset.id);
    if (!h) return;
    if (isSleep(h)) openSleep(h, el.dataset.date);
    else openSheet('day', { id: h.id, day: el.dataset.date });
  },
  'day-move': (el) => { sheet.day = el.dataset.v; renderSheet(); },
  'day-set': (el) => {
    const h = findHabit(sheet.id);
    const d = fromKey(sheet.day);
    const v = el.dataset.v || null;
    setStatus(h, d, statusOf(h, d) === v ? null : v);
    render();
  },
  'day-count': (el) => {
    const h = findHabit(sheet.id);
    const d = fromKey(sheet.day);
    setCount(h, d, countOf(h, d) + +el.dataset.v);
    render();
  },
  'sleep-day': (el) => openSleep(findHabit(sheet.id), el.dataset.v),
  'sleep-clear': () => { const h = findHabit(sheet.id); setSleep(h, fromKey(sheet.day), null); closeSheet(); toast('Registro de sueño borrado'); render(); },
  'habit-moment': (el) => { sheet.draft.time = momentTime(el.dataset.v); renderSheet(); },
  'habit-day': (el) => {
    const d = +el.dataset.d;
    const days = sheet.draft.days;
    sheet.draft.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    renderSheet();
  },
  'emoji-toggle': () => { sheet.emojiOpen = !sheet.emojiOpen; renderSheet(); },
  'emoji-pick': (el) => { sheet.draft.emoji = el.dataset.e; sheet.emojiOpen = false; renderSheet(); },
  'save-habit': saveHabit,
  'archive-habit': () => {
    const h = findHabit(sheet.id);
    if (!h) return;
    const undo = snapshot();
    h.archivedAt = keyOf(today());
    save(); closeSheet(); toast(`${h.emoji} Archivado · lo encuentras al final de Hábitos`, undo); render();
  },
  'unarchive-habit': (el) => {
    const h = findHabit(el.dataset.id);
    if (!h) return;
    const tk = keyOf(today());
    // Los días que estuvo archivado no cuentan como fallados.
    if (h.archivedAt < tk) h.gaps = [...(h.gaps || []), { from: h.archivedAt, to: keyOf(addDays(today(), -1)) }];
    delete h.archivedAt;
    save(); toast(`${h.emoji} ${h.name} está de vuelta`); render();
  },
  'toggle-archived': () => { state.ui.showArchived = !state.ui.showArchived; render(); },
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
  'task-repeat': (el) => {
    const d = sheet.draft;
    d.repeat = el.dataset.v;
    if (d.repeat === 'week' && !d.repeatDays.length) d.repeatDays = [fromKey(d.date || keyOf(today())).getDay()];
    renderSheet();
  },
  'task-repeat-day': (el) => {
    const d = sheet.draft;
    const n = +el.dataset.d;
    d.repeatDays = d.repeatDays.includes(n) ? d.repeatDays.filter((x) => x !== n) : [...d.repeatDays, n];
    if (!d.repeatDays.length) d.repeatDays = [n];
    renderSheet();
  },
  'task-remind': () => { sheet.draft.remind = !sheet.draft.remind; renderSheet(); },
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

  // Resumen (Estadísticas)
  'sum-mode': (el) => { state.ui.sumMode = el.dataset.v; state.ui.sumOffset = 0; save(); render(); },
  'sum-move': (el) => { state.ui.sumOffset = Math.min(0, (state.ui.sumOffset || 0) + +el.dataset.v); render(); },

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

/* ---------- Códigos de activación ---------- */

// Devuelve un mensaje de error, o '' si se activó.
async function tryRedeem(raw) {
  try {
    const r = await redeemCode(raw);
    trackPurchase(r?.plan);
    toast(`🎉 ¡atlas activado! Plan: ${PLAN_LABEL[r?.plan] || 'activo'}`);
    render();
    return '';
  } catch (e) {
    if (e.message === 'format') return 'El código tiene este formato: ATLAS-XXXX-XXXX';
    if (e.message === 'invalid') return 'Ese código no existe. Revisa que esté bien escrito.';
    if (e.message === 'used') return 'Ese código ya fue usado.';
    return authError(e);
  }
}

async function submitRedeem() {
  Object.assign(pw, { busy: true, error: '' });
  render();
  const msg = await tryRedeem(pw.code);
  Object.assign(pw, { busy: false, error: msg, code: msg ? pw.code : '' });
  render();
}

/* ---------- Bienvenida ---------- */

function obNext() {
  const steps = obSteps();
  const key = steps[ob.step];
  if (key === 'name') {
    ob.name = ob.name.trim();
    if (!ob.name) { ob.error = 'Escribe tu nombre para continuar'; render(); document.getElementById('ob-name')?.focus(); return; }
  }
  if (key === 'habits' && !ob.picks.length) { ob.error = 'Elige al menos un hábito (luego puedes crear los tuyos)'; render(); return; }
  ob.error = '';
  if (ob.step >= steps.length - 1) { finishOnboarding(); return; }
  ob.step++;
  render();
}

function finishOnboarding() {
  for (const i of ob.picks) {
    if (!state.habits.some((h) => h.name === HABIT_SUGGESTIONS[i][1])) {
      state.habits.push(habitFromSuggestion(i, momentTime(obMoment(i)), uid));
    }
  }
  state.profile = { name: ob.name.trim(), onboarded: true };
  save();
  trackRegistration();
  view = 'hoy';
  render();
  toast(`🚀 ¡Listo, ${state.profile.name}! Tu sistema está armado`);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const markLoginPending = () => { try { localStorage.setItem('atlas-login-pending', '1'); } catch { /* ignorar */ } };

async function submitAuth() {
  const mode = auth.mode;
  const email = auth.email.trim().toLowerCase();
  const fail = (msg) => { auth.error = msg; render(); };
  if (['login', 'signup', 'forgot', 'link'].includes(mode) && !EMAIL_RE.test(email)) return fail('Escribe un correo válido.');
  if (mode === 'login' && !auth.password) return fail('Escribe tu contraseña.');
  if (mode === 'sent-link' || mode === 'sent-confirm') {
    const code = (auth.code || '').replace(/\D/g, '');
    if (code.length < 6 || code.length > 10) return fail('Escribe el código completo que llegó a tu correo.');
    Object.assign(auth, { busy: true, error: '' });
    render();
    try { markLoginPending(); await verifyCode(auth.email, code); auth.code = ''; }
    catch { auth.error = 'Código incorrecto o vencido. Revisa el correo o pide otro.'; }
    auth.busy = false;
    render();
    return;
  }
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

// Aviso de mayúsculas activadas en los campos de contraseña.
const capsCheck = (e) => {
  if (!e.target.matches?.('#a-pass') || typeof e.getModifierState !== 'function') return;
  const hint = e.target.closest('.auth-field')?.querySelector('.caps-hint');
  if (hint) hint.hidden = !e.getModifierState('CapsLock');
};
document.addEventListener('keyup', capsCheck);

// Accesibilidad: Enter / Espacio en elementos con role="button".
document.addEventListener('keydown', (e) => {
  capsCheck(e);
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
    else if (t.id === 'f-redeem') { e.preventDefault(); actions['redeem-sheet'](); }
  }
});

let journalTimer;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.pw) { pw[t.dataset.pw] = t.value; if (pw.error) { pw.error = ''; t.closest('form')?.querySelector('.form-error')?.remove(); } return; }
  if (t.dataset.ob) { ob[t.dataset.ob] = t.value; if (ob.error) { ob.error = ''; t.parentElement.querySelector('.form-error')?.remove(); } return; }
  if (t.dataset.auth) {
    auth[t.dataset.auth] = t.value;
    if (auth.error) { auth.error = ''; t.closest('.auth-card')?.querySelector('.form-error')?.remove(); }
    const m = document.querySelector('.pw-meter');
    if (m && t.dataset.auth === 'password') { const s = passStrength(t.value); m.dataset.level = s; m.querySelector('span').textContent = STRENGTH_LABEL[s]; }
    return;
  }
  if (sheet && t.dataset.bindLabel) sheet.draft.labels[+t.dataset.bindLabel] = t.value;
  if (sheet && t.dataset.bind) {
    if (sheet.type === 'goal-add') sheet[t.dataset.bind] = t.value;
    else sheet.draft[t.dataset.bind] = t.value;
  }
  if (t.dataset.note) {
    const e = state.journal[t.dataset.note] || (state.journal[t.dataset.note] = { text: '', mood: null });
    e.note = t.value;
    clearTimeout(journalTimer);
    journalTimer = setTimeout(save, 500);
    return;
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
  if (sheet?.type === 'sleep' && e.target.dataset.bind) renderSheet(); // recalcula las horas dormidas
  if (e.target.matches('[data-import]')) importBackup(e.target);
  if (e.target.matches('[data-rem-time]') && /^\d{2}:\d{2}$/.test(e.target.value)) { state.reminders = { ...reminders(), summaryTime: e.target.value }; save(); toast(`✓ Resumen a las ${e.target.value}`); }
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
  if (e.target.closest('[data-form="ob"]')) { e.preventDefault(); obNext(); return; }
  if (e.target.closest('[data-form="redeem"]')) { e.preventDefault(); submitRedeem(); return; }
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

document.getElementById('side-brand').innerHTML = `${logo(30)}${wordmark()}`;
captureRef();
initPixel();

// Botón "Instalar app" de la barra lateral (solo cuando el navegador lo permite)
function paintInstall() {
  const b = document.getElementById('side-install');
  if (b) b.hidden = !(canPromptInstall() && installPlatform() === 'desktop');
}
initInstall((installed) => {
  paintInstall();
  if (sheet?.type === 'settings' || sheet?.type === 'more') renderSheet();
  if (installed) toast('✓ atlas quedó instalada');
});
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
    try { localStorage.setItem('atlas-last-email', cloud.user.email); } catch { /* ignorar */ }
    auth.useOther = false;
    refreshPush().then(() => { if (sheet?.type === 'settings') renderSheet(); });
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
  // Registraste algo desde un botón del aviso: bajar el cambio de la nube.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'atlas-pull' && cloud.user) pull().catch(() => {});
  });
}
