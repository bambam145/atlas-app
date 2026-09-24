// Hojas (modales): crear/editar hábito, tarea y meta; selector "+ Nuevo"; menú "Más" en celular.
import { state } from './store.js';
import { icon } from './icons.js';
import { esc, keyOf, today, addDays, fmtDay, DAY_LETTER, DAY_SHORT, WEEK_ORDER, ALL_DAYS } from './util.js';
import { findHabit, daysLabel, HABIT_SUGGESTIONS, EMOJIS, MOMENTS, momentOfTime } from './habits.js';
import { findTask, STATUS, CATEGORY_ICON } from './tasks.js';
import { findGoal, GOAL_SUGGESTIONS, currentOf } from './goals.js';
import { fmtAmount } from './views/metas.js';
import { levelCard } from './views/hoy.js';
import { cloud, cloudEnabled, statusLabel, licenseInfo, PLAN_LABEL } from './cloud.js';
import { BUY_URL } from './config.js';
import { APP_URL } from './share.js';
import { pushStatus, reminders } from './push.js';
import { installPlatform, canPromptInstall, APK_URL } from './install.js';

export let sheet = null;

export function openSheet(type, data = {}) {
  sheet = { type, fresh: true, emojiOpen: false, ...data };
  renderSheet();
  const focus = { habit: 'f-name', task: 'f-title', goal: 'f-title', 'goal-add': 'f-amount', login: 'f-email', password: 'f-pass', activate: 'f-redeem' }[type];
  if (focus && data.mode !== 'edit') setTimeout(() => document.getElementById(focus)?.focus({ preventScroll: true }), 320);
}

export function closeSheet() {
  sheet = null;
  renderSheet();
}

export function renderSheet() {
  const root = document.getElementById('sheet-root');
  if (!sheet) { root.innerHTML = ''; document.body.classList.remove('has-sheet'); return; }
  const scroll = root.querySelector('.sheet')?.scrollTop || 0;
  const enter = sheet.fresh ? ' enter' : '';
  sheet.fresh = false;
  document.body.classList.add('has-sheet');
  const body = { habit: habitSheet, task: taskSheet, goal: goalSheet, 'goal-add': goalAddSheet, new: newSheet, more: moreSheet, settings: settingsSheet, login: loginSheet, password: passwordSheet, activate: activateSheet, share: shareSheet, invite: inviteSheet }[sheet.type]();
  root.innerHTML = `
    <div class="backdrop${enter}" data-action="close-sheet"></div>
    <div class="sheet${enter} sheet-${sheet.type}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="handle"></div>
      <button class="icon-btn sheet-close" data-action="close-sheet" aria-label="Cerrar">${icon('x')}</button>
      ${body}
    </div>`;
  if (scroll) root.querySelector('.sheet').scrollTop = scroll;
}

const field = (lbl, html, extra = '') => `<p class="label"><span>${lbl}</span>${extra ? `<span>${extra}</span>` : ''}</p>${html}`;
const emojiPicker = (current) => (sheet.emojiOpen
  ? `<div class="emoji-grid">${EMOJIS.map((e) => `<button data-action="emoji-pick" data-e="${e}" class="${e === current ? 'is-on' : ''}">${e}</button>`).join('')}</div>`
  : '');

/* ---------- Hábito ---------- */

function habitSheet() {
  const d = sheet.draft;
  return `
    <h2 id="sheet-title">${sheet.mode === 'edit' ? 'Editar hábito' : 'Nuevo hábito. <span>Hazlo simple.</span>'}</h2>
    ${sheet.mode !== 'edit' ? field('Ideas rápidas', `<div class="chips scroll">${HABIT_SUGGESTIONS.map(([e, n], i) => `<button class="chip" data-action="habit-suggest" data-i="${i}">${e} ${n}</button>`).join('')}</div>`) : ''}
    ${field('Nombre', `<div class="field">
      <button class="emoji-btn" data-action="emoji-toggle" aria-label="Elegir emoji" aria-expanded="${sheet.emojiOpen}">${d.emoji}</button>
      <input id="f-name" class="input" data-bind="name" placeholder="Ej. Tomar agua" maxlength="40" value="${esc(d.name)}" enterkeyhint="done">
    </div>${emojiPicker(d.emoji)}`)}
    ${field('Frecuencia', `<div class="seg full">
        <button class="seg-btn${d.freq !== 'weekly' ? ' is-on' : ''}" data-action="habit-freq" data-v="days">Días fijos</button>
        <button class="seg-btn${d.freq === 'weekly' ? ' is-on' : ''}" data-action="habit-freq" data-v="weekly">Veces por semana</button>
      </div>
      ${d.freq === 'weekly'
        ? `<div class="stepper-row"><span>Quiero hacerlo</span>
            <div class="stepper"><button data-action="habit-perweek" data-v="-1" aria-label="Menos">${icon('minus')}</button><b>${d.perWeek}</b><button data-action="habit-perweek" data-v="1" aria-label="Más">${icon('plus')}</button></div>
            <span>${d.perWeek === 1 ? 'vez' : 'veces'} por semana</span></div>
           <p class="hint">Cualquier día que puedas. Ideal para gym, correr o limpiar.</p>`
        : `<div class="days" style="margin-top:10px">${WEEK_ORDER.map((i) => `<button class="day${d.days.includes(i) ? ' is-on' : ''}" data-action="habit-day" data-d="${i}" aria-pressed="${d.days.includes(i)}" aria-label="${DAY_SHORT[i]}">${DAY_LETTER[i]}</button>`).join('')}</div>
           <p class="hint">${d.days.length ? daysLabel(d.days) : 'Elige al menos un día'}</p>`}`)}
    ${field('¿Cuántas veces al día?', `<div class="stepper-row">
        <div class="stepper"><button data-action="habit-target" data-v="-1" aria-label="Menos">${icon('minus')}</button><b>${d.target}</b><button data-action="habit-target" data-v="1" aria-label="Más">${icon('plus')}</button></div>
        ${d.target > 1 ? `<input class="input unit-input" data-bind="unit" maxlength="16" placeholder="vasos, páginas…" value="${esc(d.unit || '')}">` : '<span class="hint" style="margin:0">Una vez (marcar ✓)</span>'}
      </div>
      ${d.target > 1 ? `<p class="hint">Se marca con un contador: 1/${d.target}, 2/${d.target}… Ideal para agua, vitaminas o series.</p>` : ''}`)}
    ${field('¿En qué momento?', `<div class="moment-opts">${MOMENTS.map(([id, e, t, h]) => `
      <button class="ob-opt${momentOfTime(d.time) === id ? ' is-on' : ''}" data-action="habit-moment" data-v="${id}" aria-pressed="${momentOfTime(d.time) === id}">
        <span>${e}</span><small>${t}</small>${h ? `<small class="opt-h">${h}</small>` : ''}
      </button>`).join('')}</div>
      <p class="hint">O elige una hora exacta:</p>
      <input class="input" type="time" data-bind="time" value="${esc(d.time)}">
      ${d.time && d.freq !== 'weekly' && pushStatus() !== 'nocloud' ? `<button class="toggle-row" data-action="habit-remind" aria-pressed="${d.remind}"><span>${icon('bell')} Avisarme a esta hora</span><span class="switch${d.remind ? ' is-on' : ''}"><i></i></span></button>` : ''}`)}
    <div class="sheet-actions">
      <button class="pill" data-action="save-habit">${sheet.mode === 'edit' ? 'Guardar cambios' : 'Crear hábito'}</button>
      ${sheet.mode === 'edit' ? `<button class="link-danger" data-action="delete-habit">${icon('trash')} Eliminar hábito</button>` : ''}
    </div>`;
}

export function openHabit(id) {
  const h = id ? findHabit(id) : null;
  openSheet('habit', {
    mode: h ? 'edit' : 'add',
    id: h?.id,
    draft: h
      ? { emoji: h.emoji, name: h.name, days: [...h.days], time: h.time || '', freq: h.freq || 'days', perWeek: h.perWeek || 3, target: h.target || 1, unit: h.unit || '', remind: h.remind !== false }
      : { emoji: '💧', name: '', days: [...ALL_DAYS], time: '', freq: 'days', perWeek: 3, target: 1, unit: '', remind: true },
  });
}

/* ---------- Tarea ---------- */

function taskSheet() {
  const d = sheet.draft;
  const tk = keyOf(today());
  const tm = keyOf(addDays(today(), 1));
  const custom = d.date && d.date !== tk && d.date !== tm;
  const dateChip = (val, text) => `<button class="chip${d.date === val ? ' is-on' : ''}" data-action="task-date" data-v="${val ?? ''}">${text}</button>`;
  return `
    <h2 id="sheet-title">${sheet.mode === 'edit' ? 'Editar tarea' : 'Nueva tarea'}</h2>
    ${field('Tarea', `<input id="f-title" class="input" data-bind="title" placeholder="¿Qué tienes que hacer?" maxlength="120" value="${esc(d.title)}" enterkeyhint="done">`)}
    ${field('Fecha', `<div class="chips">
      ${dateChip(tk, 'Hoy')}${dateChip(tm, 'Mañana')}
      <label class="chip date-chip${custom ? ' is-on' : ''}" data-action="pick-date">${icon('calendar')}<span>${custom ? fmtDay(d.date) : 'Elegir'}</span><input type="date" data-bind="date" value="${esc(d.date || '')}"></label>
      <button class="chip${!d.date ? ' is-on' : ''}" data-action="task-date" data-v="">Sin fecha</button>
    </div>`)}
    <div class="two-fields">
      ${field('Hora', `<input class="input" type="time" data-bind="time" value="${esc(d.time)}">`, 'opcional')}
      ${field('Duración', `<select class="input" data-bind="duration">${[15, 30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}"${+d.duration === m ? ' selected' : ''}>${m < 60 ? `${m} min` : `${m / 60} h`}</option>`).join('')}</select>`)}
    </div>
    ${field('Prioridad', `<div class="chips">
      <button class="chip toggle${d.urgent ? ' is-on' : ''}" data-action="task-flag" data-v="urgent" aria-pressed="${d.urgent}">${icon('zap')} Urgente</button>
      <button class="chip toggle${d.important ? ' is-on' : ''}" data-action="task-flag" data-v="important" aria-pressed="${d.important}">${icon('star')} Importante</button>
    </div>`)}
    ${field('Categoría', `<div class="chips">
      ${state.categories.map((c) => `<button class="chip${d.category === c ? ' is-on' : ''}" data-action="task-cat" data-v="${esc(c)}">${icon(CATEGORY_ICON[c] || 'tag')} ${esc(c)}</button>`).join('')}
      <button class="chip dashed" data-action="task-cat-new">${icon('plus')} Nueva</button>
    </div>`)}
    ${sheet.mode === 'edit' ? field('Estado', `<div class="seg full">${Object.entries(STATUS).map(([id, s]) => `<button class="seg-btn${d.status === id ? ' is-on' : ''}" data-action="task-status" data-v="${id}">${s.label}</button>`).join('')}</div>`) : ''}
    ${field('Subtareas', `<div class="subtasks">
      ${d.subtasks.map((s, i) => `<div class="subtask${s.done ? ' is-done' : ''}">
        <button class="check-btn" data-action="sub-toggle" data-i="${i}" aria-label="Completar subtarea"><span class="check square${s.done ? ' is-on' : ''}">${icon('check')}</span></button>
        <span>${esc(s.title)}</span>
        <button class="icon-btn sm" data-action="sub-del" data-i="${i}" aria-label="Quitar subtarea">${icon('x')}</button>
      </div>`).join('')}
      <div class="subtask add">${icon('plus')}<input id="f-sub" class="bare" placeholder="Agregar subtarea y Enter" enterkeyhint="enter"></div>
    </div>`, d.subtasks.length ? `${d.subtasks.filter((s) => s.done).length}/${d.subtasks.length}` : '')}
    <div class="sheet-actions">
      <button class="pill" data-action="save-task">${sheet.mode === 'edit' ? 'Guardar cambios' : 'Crear tarea'}</button>
      ${sheet.mode === 'edit' ? `<button class="link-danger" data-action="delete-task">${icon('trash')} Eliminar tarea</button>` : ''}
    </div>`;
}

export function openTask(id, preset = {}) {
  const t = id ? findTask(id) : null;
  openSheet('task', {
    mode: t ? 'edit' : 'add',
    id: t?.id,
    draft: t
      ? { title: t.title, date: t.date, time: t.time || '', duration: t.duration || 30, urgent: !!t.urgent, important: !!t.important, category: t.category || '', status: t.status, subtasks: t.subtasks.map((s) => ({ ...s })) }
      : { title: '', date: keyOf(today()), time: '', duration: 30, urgent: false, important: false, category: '', status: 'todo', subtasks: [], ...preset },
  });
}

/* ---------- Meta ---------- */

function goalSheet() {
  const d = sheet.draft;
  const units = ['veces', 'libros', 'km', 'S/', '$', 'kg', 'horas'];
  return `
    <h2 id="sheet-title">${sheet.mode === 'edit' ? 'Editar meta' : 'Nueva meta. <span>Piensa en grande.</span>'}</h2>
    ${sheet.mode !== 'edit' ? field('Ideas', `<div class="chips scroll">${GOAL_SUGGESTIONS.map((g, i) => `<button class="chip" data-action="goal-suggest" data-i="${i}">${g.emoji} ${g.title}</button>`).join('')}</div>`) : ''}
    ${field('Meta', `<div class="field">
      <button class="emoji-btn" data-action="emoji-toggle" aria-label="Elegir emoji">${d.emoji}</button>
      <input id="f-title" class="input" data-bind="title" placeholder="Ej. Leer 12 libros" maxlength="60" value="${esc(d.title)}">
    </div>${emojiPicker(d.emoji)}`)}
    <div class="two-fields">
      ${field('Objetivo', `<input class="input" type="number" inputmode="decimal" min="1" data-bind="target" value="${esc(d.target)}" placeholder="12">`)}
      ${field('Unidad', `<input class="input" data-bind="unit" list="units" value="${esc(d.unit)}" placeholder="libros"><datalist id="units">${units.map((u) => `<option value="${u}">`).join('')}</datalist>`)}
    </div>
    ${sheet.mode !== 'edit' ? field('Ya llevo', `<input class="input" type="number" inputmode="decimal" min="0" data-bind="start" value="${esc(d.start)}" placeholder="0">`, 'opcional') : ''}
    ${field('Fecha límite', `<input class="input" type="date" data-bind="deadline" value="${esc(d.deadline)}">`, 'opcional')}
    ${field('Avanza sola con un hábito', `<select class="input" data-bind="habitId">
      <option value="">No vincular</option>
      ${state.habits.map((h) => `<option value="${h.id}"${d.habitId === h.id ? ' selected' : ''}>${h.emoji} ${esc(h.name)} (+1 cada vez)</option>`).join('')}
    </select>`, 'opcional')}
    <div class="sheet-actions">
      <button class="pill" data-action="save-goal">${sheet.mode === 'edit' ? 'Guardar cambios' : 'Crear meta'}</button>
      ${sheet.mode === 'edit' ? `<button class="link-danger" data-action="delete-goal">${icon('trash')} Eliminar meta</button>` : ''}
    </div>`;
}

export function openGoal(id, suggestion) {
  const g = id ? findGoal(id) : null;
  const s = suggestion != null ? GOAL_SUGGESTIONS[suggestion] : null;
  openSheet('goal', {
    mode: g ? 'edit' : 'add',
    id: g?.id,
    draft: g
      ? { emoji: g.emoji, title: g.title, target: g.target, unit: g.unit || '', deadline: g.deadline || '', habitId: g.habitId || '', start: 0 }
      : { emoji: s?.emoji || '🎯', title: s?.title || '', target: s?.target || '', unit: s?.unit || '', deadline: '', habitId: '', start: '' },
  });
}

function goalAddSheet() {
  const g = findGoal(sheet.id);
  return `
    <h2 id="sheet-title">${g.emoji} ${esc(g.title)}</h2>
    <p class="summary">Llevas <b>${fmtAmount(currentOf(g), g.unit)}</b> de ${fmtAmount(g.target, g.unit)}.</p>
    ${field('¿Cuánto avanzaste?', `<input id="f-amount" class="input big-input" type="number" inputmode="decimal" data-bind="amount" value="${esc(sheet.amount ?? '')}" placeholder="0">
      <div class="chips">${[1, 5, 10, 50, 100].map((n) => `<button class="chip" data-action="goal-quick" data-v="${n}">+${n}</button>`).join('')}</div>`)}
    <div class="sheet-actions"><button class="pill" data-action="save-goal-add">${icon('plus')} Sumar avance</button></div>`;
}

/* ---------- "+ Nuevo" y menú "Más" ---------- */

function newSheet() {
  const opt = (action, ic, t, s) => `<button class="choice" data-action="${action}"><span class="choice-icon">${icon(ic)}</span><span><b>${t}</b><small>${s}</small></span>${icon('right')}</button>`;
  return `
    <h2 id="sheet-title">Crear <span>algo nuevo.</span></h2>
    <div class="choices">
      ${opt('new-task', 'tasks', 'Tarea', 'Algo que hacer, con fecha y prioridad')}
      ${opt('new-habit', 'flame', 'Hábito', 'Algo que repites y quieres volver racha')}
      ${opt('new-goal', 'target', 'Meta', 'Un objetivo grande con progreso')}
      ${opt('new-note', 'feather', 'Nota del día', 'Escribe cómo te fue hoy')}
    </div>`;
}

/* ---------- Cuenta ---------- */

function loginSheet() {
  const d = sheet.draft;
  const err = sheet.error ? `<p class="form-error">${icon('info')} ${esc(sheet.error)}</p>` : '';
  if (sheet.step === 'code') {
    return `
      <h2 id="sheet-title">Revisa tu correo. <span>Te enviamos un enlace.</span></h2>
      <div class="mail-steps">
        <div><span>1</span><p>Abre el correo de <b>Supabase Auth</b> que llegó a <b>${esc(d.email)}</b> (revisa también spam).</p></div>
        <div><span>2</span><p>Toca el botón del correo (<b>Confirm your mail</b> o <b>Log In</b>).</p></div>
        <div><span>3</span><p>atlas se abre con tu sesión iniciada. Esta ventana se cierra sola.</p></div>
      </div>
      <p class="hint waiting">${icon('repeat')} Esperando que abras el enlace…</p>
      ${sheet.showCode ? field('Código', `<input id="f-code" class="input big-input code-input" data-bind="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" value="${esc(d.code || '')}">`) : ''}
      ${err}
      <div class="sheet-actions">
        ${sheet.showCode
          ? `<button class="pill" data-action="verify-code" ${sheet.busy ? 'disabled' : ''}>${sheet.busy ? 'Entrando…' : 'Entrar con el código'}</button>`
          : '<button class="text-btn center" data-action="show-code">¿Tu correo trae un código de 6 dígitos?</button>'}
        <button class="text-btn center" data-action="login-back">${icon('left')} Usar otro correo o reenviar</button>
      </div>`;
  }
  return `
    <h2 id="sheet-title">Guarda todo <span>en la nube.</span></h2>
    <p class="summary">Entra con tu correo: sin contraseñas. Tus hábitos, tareas y metas quedan a salvo y sincronizados entre tu celular y tu computadora.</p>
    ${field('Correo', `<input id="f-email" class="input" type="email" data-bind="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com" value="${esc(d.email || '')}">`)}
    ${err}
    <ul class="perks">
      <li>${icon('shield')} Solo tú puedes ver tus datos</li>
      <li>${icon('repeat')} Sincroniza celular y computadora</li>
      <li>${icon('sparkles')} Si ya usabas atlas aquí, tus datos se suben solos</li>
    </ul>
    <div class="sheet-actions">
      <button class="pill" data-action="send-code" ${sheet.busy ? 'disabled' : ''}>${sheet.busy ? 'Enviando…' : 'Enviarme el enlace'}</button>
    </div>`;
}

function inviteSheet() {
  const r = sheet.ref;
  const link = r ? `${APP_URL}?ref=${r.code}` : '';
  return `
    <h2 id="sheet-title">Invita y gana. <span>Crezcan juntos.</span></h2>
    <div class="invite-perks">
      <div><span class="invite-num">+14</span><p><b>Tu amigo</b> recibe 14 días de prueba gratis (el doble).</p></div>
      <div><span class="invite-num">+7</span><p><b>Tú</b> ganas 7 días extra por cada amigo que se registre (hasta 10).</p></div>
    </div>
    ${r ? `
      ${field('Tu enlace', `<div class="invite-link"><span>${esc(link)}</span><button class="icon-btn sm" data-action="invite-copy" aria-label="Copiar enlace">${icon('copy')}</button></div>
        <p class="hint">Tu código: <b>${esc(r.code)}</b> · ${r.invited === 1 ? '1 amigo se unió' : `${r.invited} amigos se unieron`}${r.rewarded ? ` · ganaste ${r.rewarded * 7} días` : ''}</p>`)}
      <div class="sheet-actions">
        <a class="pill" href="https://wa.me/?text=${encodeURIComponent(inviteText(link))}" target="_blank" rel="noopener">${icon('send')} Invitar por WhatsApp</a>
        <div class="stack">
          <button class="pill ghost" data-action="invite-share">${icon('share')} Compartir</button>
          <button class="pill ghost" data-action="invite-copy">${icon('copy')} Copiar enlace</button>
        </div>
      </div>`
    : sheet.error ? `<p class="form-error">${icon('info')} ${esc(sheet.error)}</p>` : '<div class="share-preview"><span class="auth-spin"></span></div>'}`;
}

export const inviteText = (link) => `Estoy usando atlas para mis hábitos, tareas y metas 🔥 Únete con mi enlace y tienes 14 días gratis: ${link}`;

function shareSheet() {
  const canNative = !!(navigator.canShare && navigator.share);
  return `
    <h2 id="sheet-title">Comparte tu racha. <span>Inspira a otros.</span></h2>
    <p class="summary">Súbela a tus historias de Instagram o envíala por WhatsApp.</p>
    <div class="share-preview">${sheet.url ? `<img src="${sheet.url}" alt="Imagen de tu racha">` : '<span class="auth-spin"></span>'}</div>
    <div class="sheet-actions">
      ${canNative ? `<button class="pill" data-action="share-native" ${sheet.url ? '' : 'disabled'}>${icon('share')} Compartir</button>` : ''}
      <div class="stack">
        <button class="pill ghost" data-action="share-download" ${sheet.url ? '' : 'disabled'}>${icon('download')} Descargar</button>
        <button class="pill ghost" data-action="share-copy">${icon('copy')} Copiar texto</button>
      </div>
    </div>`;
}

function activateSheet() {
  return `
    <h2 id="sheet-title">Activa atlas. <span>Sin límites.</span></h2>
    <p class="summary">Escribe el código de activación que recibiste por correo al comprar.</p>
    ${field('Código de activación', `<input id="f-redeem" class="input code-input big" data-bind="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ATLAS-XXXX-XXXX" value="${esc(sheet.draft.code || '')}">`)}
    ${sheet.error ? `<p class="form-error">${icon('info')} ${esc(sheet.error)}</p>` : ''}
    ${BUY_URL ? `<p class="hint">${icon('zap')} ¿Aún no tienes código? <a href="${esc(BUY_URL)}" target="_blank" rel="noopener">Comprar atlas</a></p>` : ''}
    <div class="sheet-actions"><button class="pill" data-action="redeem-sheet" ${sheet.busy ? 'disabled' : ''}>${sheet.busy ? 'Activando…' : `Activar ${icon('arrowRight')}`}</button></div>`;
}

function planBlock() {
  if (!cloudEnabled || !cloud.user) return '';
  const info = licenseInfo();
  const fmt = (iso) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  let title = 'Cargando…';
  let sub = '';
  if (info.state === 'trial') { title = 'Prueba gratis'; sub = `Te ${info.daysLeft === 1 ? 'queda 1 día' : `quedan ${info.daysLeft} días`} · hasta el ${fmt(info.endsAt)}`; }
  else if (info.state === 'active') { title = `atlas ${PLAN_LABEL[info.plan] || ''}`; sub = info.expiresAt ? `Se renueva o vence el ${fmt(info.expiresAt)}` : 'Acceso para siempre ✓'; }
  const showRedeem = info.state !== 'active' || info.plan !== 'lifetime';
  return field('Tu plan', `
    <div class="account plan">
      <span class="account-avatar">${icon(info.state === 'active' ? 'crown' : 'key')}</span>
      <span class="account-body"><b>${title}</b><small>${sub}</small></span>
    </div>
    ${showRedeem ? `<button class="pill ghost" data-action="activate" style="margin-top:10px;width:100%">${icon('key')} Canjear código de activación</button>` : ''}`);
}

function passwordSheet() {
  return `
    <h2 id="sheet-title">Contraseña</h2>
    <p class="summary">Crea o cambia tu contraseña para entrar con correo y contraseña. El enlace por correo seguirá funcionando.</p>
    ${field('Nueva contraseña', `<input id="f-pass" class="input" type="password" data-bind="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres">`)}
    ${sheet.error ? `<p class="form-error">${icon('info')} ${esc(sheet.error)}</p>` : ''}
    <div class="sheet-actions"><button class="pill" data-action="save-pass" ${sheet.busy ? 'disabled' : ''}>${sheet.busy ? 'Guardando…' : 'Guardar contraseña'}</button></div>`;
}

function accountBlock() {
  if (!cloudEnabled) return '';
  if (!cloud.user) {
    return field('Cuenta', `<p class="hint">${icon('info')} Sin cuenta: tus datos solo están en este dispositivo.</p>
      <button class="pill" data-action="login" style="margin-top:12px;width:100%">${icon('user')} Crear cuenta o entrar</button>`);
  }
  const when = cloud.lastSyncAt ? ` · ${new Date(cloud.lastSyncAt).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })}` : '';
  return field('Cuenta', `
    <div class="account">
      <span class="account-avatar">${esc(cloud.user.email[0].toUpperCase())}</span>
      <span class="account-body"><b>${esc(cloud.user.email)}</b><small class="sync-${cloud.status}">${icon(cloud.status === 'synced' ? 'check' : cloud.status === 'error' || cloud.status === 'offline' ? 'info' : 'repeat')} ${statusLabel()}${cloud.status === 'synced' ? when : ''}</small></span>
    </div>
    <div class="stack">
      <button class="pill ghost" data-action="sync-now">${icon('repeat')} Sincronizar</button>
      <button class="pill ghost" data-action="change-pass">${icon('lock')} Contraseña</button>
    </div>
    <button class="link-danger left logout-link" data-action="logout">${icon('logout')} Cerrar sesión</button>`);
}

function remindersBlock() {
  const st = pushStatus();
  if (st === 'nocloud') return '';
  const r = reminders();
  const tog = (on, action, label) => `<button class="toggle-row" data-action="${action}" aria-pressed="${on}"><span>${label}</span><span class="switch${on ? ' is-on' : ''}"><i></i></span></button>`;
  let body;
  if (st === 'install') body = `<p class="hint">${icon('info')} En iPhone primero agrega atlas a tu pantalla de inicio: toca <b>Compartir</b> → <b>Agregar a inicio</b>, ábrela desde ahí y vuelve aquí.</p>`;
  else if (st === 'unsupported') body = `<p class="hint">${icon('info')} Este navegador no permite avisos. Prueba con Chrome, o instala atlas en tu celular.</p>`;
  else if (st === 'denied') body = `<p class="hint">${icon('info')} Bloqueaste las notificaciones. Actívalas en los permisos del navegador para este sitio y vuelve aquí.</p>`;
  else if (st === 'off') body = `<p class="hint">Te avisamos a la hora de cada hábito y en la noche si te falta algo.</p>
      <button class="pill" data-action="push-on" style="width:100%">${icon('bell')} Activar recordatorios</button>`;
  else body = `<div class="toggle-list">
        ${tog(r.habits, 'rem-habits', 'A la hora de cada hábito')}
        ${tog(r.summary, 'rem-summary', 'Resumen de la noche')}
        ${r.summary ? `<label class="toggle-row"><span>Hora del resumen</span><input class="input time-mini" type="time" data-rem-time value="${esc(r.summaryTime)}"></label>` : ''}
      </div>
      <div class="stack">
        <button class="pill ghost" data-action="push-test">${icon('bell')} Probar aviso</button>
        <button class="pill ghost" data-action="push-off">Desactivar en este dispositivo</button>
      </div>`;
  return field('Recordatorios', body, st === 'on' ? 'activos' : '');
}

function installBlock() {
  const p = installPlatform();
  let body;
  if (p === 'installed') body = `<p class="hint">${icon('check')} <span>Estás usando la app instalada. Tus datos se sincronizan con tus otros dispositivos.</span></p>`;
  else if (p === 'android') body = `<p class="hint"><span>Descarga la app para Android: se abre como cualquier app, con su ícono y avisos.</span></p>
      <a class="pill" href="${APK_URL}" download="atlas.apk" style="width:100%">${icon('download')} Descargar app para Android</a>
      <p class="hint"><span>Si tu celular pregunta, permite instalar apps desde tu navegador. Es segura: es la misma atlas.</span></p>`;
  else if (p === 'ios') body = `<p class="hint"><span>En iPhone se instala desde Safari:</span></p>
      <ol class="install-steps"><li>Toca <b>Compartir</b> (el cuadro con la flecha ↑)</li><li>Elige <b>Agregar a inicio</b></li><li>Abre atlas desde el nuevo ícono</li></ol>`;
  else body = canPromptInstall()
    ? `<p class="hint"><span>Instálala en esta computadora: ventana propia, ícono en el escritorio y recordatorios.</span></p>
      <button class="pill" data-action="install-app" style="width:100%">${icon('monitor')} Instalar en esta computadora</button>`
    : `<p class="hint"><span>Abre atlas en <b>Chrome</b> o <b>Edge</b> y toca el ícono de instalar <b>⊕</b> en la barra de direcciones. Si ya la instalaste, búscala en el menú Inicio.</span></p>`;
  return field('App', body);
}

function settingsSheet() {
  const counts = `${state.habits.length} hábitos · ${state.tasks.length} tareas · ${state.goals.length} metas · ${Object.keys(state.journal).length} notas`;
  return `
    <h2 id="sheet-title">Ajustes</h2>
    ${field('Tu nombre', `<div class="field"><input id="f-profile-name" class="input" maxlength="30" value="${esc(state.profile?.name || '')}" placeholder="Tu nombre"><button class="pill small" data-action="save-name">Guardar</button></div>`)}
    ${planBlock()}
    ${cloudEnabled && cloud.user ? `<button class="pill ghost" data-action="invite" style="margin-top:10px;width:100%">${icon('gift')} Invita y gana 7 días por amigo</button>` : ''}
    ${installBlock()}
    ${remindersBlock()}
    ${accountBlock()}
    ${field('Apariencia', `<div class="seg full">
      <button class="seg-btn${state.theme === 'dark' ? ' is-on' : ''}" data-action="set-theme" data-v="dark">${icon('moon')} Oscuro</button>
      <button class="seg-btn${state.theme === 'light' ? ' is-on' : ''}" data-action="set-theme" data-v="light">${icon('sun')} Claro</button>
    </div>`)}
    ${field('Respaldo', `<p class="hint">${icon('info')} Tus datos viven en este dispositivo. Descarga una copia de vez en cuando para no perderlos.</p>
      <p class="hint">${counts}</p>
      <div class="stack">
        <button class="pill ghost" data-action="export-data">${icon('download')} Descargar copia</button>
        <button class="pill ghost" data-action="pick-file">${icon('upload')} Restaurar copia</button>
      </div>
      <input type="file" id="f-import" accept="application/json,.json" data-import hidden>`)}
    ${field('Categorías de tareas', `<div class="chips">${state.categories.map((c) => `<span class="chip">${esc(c)}<button class="chip-x" data-action="del-cat" data-v="${esc(c)}" aria-label="Eliminar ${esc(c)}">${icon('x')}</button></span>`).join('')}</div>`)}
    ${field('Zona de peligro', `<button class="link-danger left" data-action="wipe-data">${icon('trash')} Borrar todos mis datos</button>`)}
    <p class="hint legal-links"><a href="terminos.html" target="_blank" rel="noopener">Términos y Condiciones</a> · <a href="privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a></p>`;
}

function moreSheet() {
  const item = (view, ic, t) => `<button class="more-item" data-action="nav" data-view="${view}">${icon(ic)}<span>${t}</span></button>`;
  return `
    <h2 id="sheet-title">Más</h2>
    ${levelCard()}
    <div class="more-grid">
      ${item('planner', 'planner', 'Planner')}
      ${item('metas', 'target', 'Metas')}
      ${item('diario', 'book', 'Diario')}
      ${item('stats', 'chart', 'Estadísticas')}
      ${item('mapa', 'network', 'Mapa')}
      ${item('logros', 'trophy', 'Logros')}
    </div>
    ${installPlatform() !== 'installed' ? `<button class="more-item row invite-row" data-action="settings">${icon(installPlatform() === 'desktop' ? 'monitor' : 'smartphone')}<span>Instalar la app en este dispositivo</span></button>` : ''}
    ${cloudEnabled ? `<button class="more-item row invite-row" data-action="invite">${icon('gift')}<span>Invita y gana · 7 días extra por amigo</span></button>` : ''}
    <div class="more-grid two">
      <button class="more-item row" data-action="settings">${icon('settings')}<span>Ajustes y respaldo</span></button>
      <button class="more-item row" data-action="theme">${icon(state.theme === 'dark' ? 'sun' : 'moon')}<span>${state.theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span></button>
    </div>`;
}
