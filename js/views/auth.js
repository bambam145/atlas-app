// Pantalla de entrada (cuenta obligatoria): entrar, crear cuenta, enlace por correo y recuperar contraseña.
import { icon, logo } from '../icons.js';
import { esc } from '../util.js';

// Estado del formulario (vive solo mientras se muestra la pantalla).
export const auth = {
  mode: 'login', // login | signup | forgot | link | sent-link | sent-confirm | sent-reset | newpass
  email: '',
  password: '',
  showPass: false,
  busy: false,
  error: '',
};

export const resetAuth = (mode = 'login') => Object.assign(auth, { mode, password: '', busy: false, error: '', showPass: false });

const WORDS = ['constante', 'disciplinado', 'imparable', 'productivo'];

// Fuerza de la contraseña: 0 vacía, 1 débil, 2 media, 3 fuerte.
export function passStrength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return p.length < 8 ? 1 : s <= 2 ? 1 : s <= 3 ? 2 : 3;
}
export const STRENGTH_LABEL = ['', 'Débil', 'Media', 'Fuerte'];

// Animación del título: cambia la última palabra cada pocos segundos.
let rotTimer = null;
export function mountAuthFx() {
  if (rotTimer) return;
  let i = 0;
  rotTimer = setInterval(() => {
    const el = document.querySelector('.rot-word');
    if (!el) { clearInterval(rotTimer); rotTimer = null; return; }
    el.classList.add('out');
    setTimeout(() => {
      i = (i + 1) % WORDS.length;
      el.textContent = WORDS[i];
      el.classList.remove('out');
    }, 350);
  }, 2600);
}

const FEATURES = [
  ['flame', 'Hábitos con rachas y calendario de constancia'],
  ['tasks', 'Tareas, Kanban, Eisenhower y planner semanal'],
  ['target', 'Metas, diario, estadísticas y logros'],
  ['repeat', 'Sincronizado entre tu celular y tu computadora'],
];

// Vista previa decorativa de la app (solo en pantallas grandes).
function preview() {
  const rows = [
    ['💧', 'Tomar 2 L de agua', '13 días', true],
    ['🧘', 'Meditar 5 min', '8 días', true],
    ['📚', 'Leer 10 páginas', '9 días', false],
    ['🏋️', 'Entrenar', '4 días', false],
  ];
  // Constancia que mejora con el tiempo: semanas antiguas con huecos, recientes casi llenas.
  const WEEKS = 15;
  const rand = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const dots = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const w = Math.floor(i / 7);
    if (i >= WEEKS * 7 - 3) return '<i class="f"></i>';
    return `<i class="${rand(i + 3) < 0.3 + (w / (WEEKS - 1)) * 0.65 ? 'on' : ''}" style="--d:${i}"></i>`;
  }).join('');
  return `
    <div class="auth-preview" aria-hidden="true">
      <span class="ap-chip ap-chip-streak">${icon('flame')} 13 días de racha</span>
      <span class="ap-chip ap-chip-level"><b>12</b> Nivel · Imparable</span>
      <div class="ap-card ap-today">
        <div class="ap-head"><span>Hoy</span><b>2 de 4 hábitos</b></div>
        <div class="ap-bar"><i></i></div>
        ${rows.map(([e, n, s, d]) => `
          <div class="ap-row${d ? ' done' : ''}">
            <span class="ap-check">${d ? icon('check') : ''}</span>
            <span class="ap-emoji">${e}</span>
            <span class="ap-name">${n}</span>
            <span class="ap-streak">${icon('flame')} ${s}</span>
          </div>`).join('')}
      </div>
      <div class="ap-card ap-grid">
        <div class="ap-head"><span>Constancia</span><b>87%</b></div>
        <div class="ap-dots" style="--weeks:${WEEKS}">${dots}</div>
        <div class="ap-legend"><span>Hace 15 semanas</span><span>Hoy</span></div>
      </div>
    </div>`;
}

export function renderSplash() {
  return `<div class="auth-splash">${logo(52)}<span class="auth-spin"></span></div>`;
}

export function renderAuth() {
  return `
    <div class="auth">
      <section class="auth-brand">
        <div class="auth-logo">${logo(34)}<span>atlas</span></div>
        <div class="auth-hero">
          <div class="auth-copy">
            <h1 class="auth-title">Solo necesitas <b>un sistema</b> <span>para ser <em class="rot-word">${WORDS[0]}</em>.</span></h1>
            <ul class="auth-features">${FEATURES.map(([ic, t]) => `<li>${icon(ic)}<span>${t}</span></li>`).join('')}</ul>
          </div>
          ${preview()}
        </div>
        <p class="auth-foot">Hábitos · Tareas · Metas · Diario — todo en un solo lugar.</p>
      </section>
      <section class="auth-panel">
        <div class="auth-top">${auth.mode === 'signup'
          ? `¿Ya tienes cuenta? <button class="inline-link" data-action="auth-mode" data-v="login">Entrar</button>`
          : `¿Nuevo en atlas? <button class="inline-link" data-action="auth-mode" data-v="signup">Crear cuenta</button>`}</div>
        <div class="auth-card" aria-live="polite">${form()}</div>
        <div class="auth-bottom">${icon('shield')} Tus datos están protegidos y solo tú puedes verlos</div>
      </section>
    </div>`;
}

const errorHtml = () => (auth.error ? `<p class="form-error">${icon('info')} ${esc(auth.error)}</p>` : '');
const emailField = (autofocus = false) => `
  <label class="auth-field"><span>Correo</span>
    <input class="input" id="a-email" type="email" data-auth="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com" value="${esc(auth.email)}"${autofocus ? ' autofocus' : ''}>
  </label>`;
const passField = (label, auto) => `
  <label class="auth-field"><span>${label}</span>
    <span class="pass-wrap">
      <input class="input" id="a-pass" type="${auth.showPass ? 'text' : 'password'}" data-auth="password" autocomplete="${auto}" placeholder="Mínimo 8 caracteres" value="${esc(auth.password)}">
      <button type="button" class="icon-btn sm pass-eye" data-action="auth-eye" aria-label="${auth.showPass ? 'Ocultar' : 'Mostrar'} contraseña">${icon(auth.showPass ? 'eyeOff' : 'eye')}</button>
    </span>
  </label>`;
export const meter = () => {
  const s = passStrength(auth.password);
  return `<div class="pw-meter" data-level="${s}"><i></i><i></i><i></i><span>${STRENGTH_LABEL[s]}</span></div>`;
};
const submit = (text, busyText) => `<button class="pill" type="submit" ${auth.busy ? 'disabled' : ''}>${auth.busy ? busyText : text}</button>`;

function form() {
  switch (auth.mode) {
    case 'signup':
      return `
        ${tabs()}
        <form class="auth-form" data-form="auth" novalidate>
          ${emailField()}${passField('Crea una contraseña', 'new-password')}
          ${meter()}
          ${errorHtml()}
          ${submit('Crear cuenta', 'Creando…')}
        </form>
        <p class="auth-legal">Al crear tu cuenta aceptas guardar tus datos de forma segura en la nube de atlas.</p>`;

    case 'forgot':
      return `
        <button class="text-btn" data-action="auth-mode" data-v="login">${icon('left')} Volver</button>
        <h2 class="auth-h">Recupera tu contraseña</h2>
        <p class="auth-p">Te enviaremos un enlace para crear una nueva.</p>
        <form class="auth-form" data-form="auth" novalidate>
          ${emailField(true)}${errorHtml()}
          ${submit('Enviar enlace', 'Enviando…')}
        </form>`;

    case 'link':
      return `
        <button class="text-btn" data-action="auth-mode" data-v="login">${icon('left')} Volver</button>
        <h2 class="auth-h">Entra sin contraseña</h2>
        <p class="auth-p">Te enviamos un enlace a tu correo: lo tocas y entras.</p>
        <form class="auth-form" data-form="auth" novalidate>
          ${emailField(true)}${errorHtml()}
          ${submit('Enviarme el enlace', 'Enviando…')}
        </form>`;

    case 'sent-link':
    case 'sent-confirm':
    case 'sent-reset': {
      const what = { 'sent-link': ['Revisa tu correo', 'Toca el botón <b>Log In</b> del correo para entrar.'],
        'sent-confirm': ['Confirma tu correo', 'Toca el botón <b>Confirm your mail</b> para activar tu cuenta y entrar.'],
        'sent-reset': ['Revisa tu correo', 'Toca el botón <b>Reset Password</b> para crear una contraseña nueva.'] }[auth.mode];
      return `
        <div class="auth-sent">
          <span class="auth-sent-icon">${icon('send')}</span>
          <h2 class="auth-h">${what[0]}</h2>
          <p class="auth-p">Enviamos un correo de <b>Supabase Auth</b> a <b>${esc(auth.email)}</b>. ${what[1]}</p>
          <p class="hint waiting">${icon('repeat')} Esperando… esta pantalla avanza sola. Revisa también spam.</p>
          ${errorHtml()}
          ${auth.mode === 'sent-confirm' ? `<button class="pill ghost" data-action="auth-resend" ${auth.busy ? 'disabled' : ''}>${icon('send')} Reenviar correo</button>` : ''}
          <button class="text-btn" data-action="auth-mode" data-v="login">${icon('left')} Volver a entrar</button>
        </div>`;
    }

    case 'newpass':
      return `
        <h2 class="auth-h">Crea tu nueva contraseña</h2>
        <p class="auth-p">Úsala desde ahora para entrar a atlas.</p>
        <form class="auth-form" data-form="auth" novalidate>
          ${passField('Nueva contraseña', 'new-password')}${meter()}${errorHtml()}
          ${submit('Guardar y entrar', 'Guardando…')}
        </form>`;

    default:
      return `
        ${tabs()}
        <form class="auth-form" data-form="auth" novalidate>
          ${emailField()}${passField('Contraseña', 'current-password')}
          <button type="button" class="text-btn forgot" data-action="auth-mode" data-v="forgot">¿Olvidaste tu contraseña?</button>
          ${errorHtml()}
          ${submit('Entrar', 'Entrando…')}
        </form>
        <div class="auth-or"><span>o</span></div>
        <button class="pill ghost" data-action="auth-mode" data-v="link">${icon('send')} Entrar con un enlace al correo</button>`;
  }
}

function tabs() {
  const t = (mode, text) => `<button class="seg-btn${auth.mode === mode ? ' is-on' : ''}" data-action="auth-mode" data-v="${mode}">${text}</button>`;
  return `
    <div class="auth-mobile-logo">${logo(40)}</div>
    <h2 class="auth-h">${auth.mode === 'signup' ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}</h2>
    <p class="auth-p">${auth.mode === 'signup' ? 'Empieza gratis en segundos.' : 'Entra para ver tu día.'}</p>
    <div class="seg full auth-tabs">${t('login', 'Entrar')}${t('signup', 'Crear cuenta')}</div>`;
}
