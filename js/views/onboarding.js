// Bienvenida después de crear la cuenta: nombre → hábitos para empezar → momento del día.
import { state } from '../store.js';
import { icon, logo } from '../icons.js';
import { esc } from '../util.js';
import { HABIT_SUGGESTIONS } from '../habits.js';

export const MOMENTS = [
  ['manana', '🌅', 'Mañana', '07:00'],
  ['tarde', '☀️', 'Tarde', '13:00'],
  ['noche', '🌙', 'Noche', '20:00'],
  ['libre', '🕊️', 'Sin hora fija', ''],
];

export const ob = { step: 0, name: '', picks: [], moment: 'manana', error: '' };

// Si ya tienes hábitos, solo falta el nombre.
export const obSteps = () => (state.habits.length ? ['name'] : ['name', 'habits', 'moment']);

export function renderOnboarding() {
  const steps = obSteps();
  const key = steps[ob.step] || 'name';
  const last = ob.step === steps.length - 1;
  const dots = steps.length > 1 ? `<div class="ob-dots">${steps.map((_, i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>` : '';
  const err = ob.error ? `<p class="form-error">${icon('info')} ${esc(ob.error)}</p>` : '';

  let body = '';
  if (key === 'name') {
    body = `
      <h1 class="ob-title">Bienvenido a atlas. <span>¿Cómo te llamas?</span></h1>
      <p class="auth-p">Lo usaremos para saludarte cada día.</p>
      <form data-form="ob" novalidate>
        <input class="input big-input" id="ob-name" data-ob="name" autocomplete="given-name" maxlength="30" placeholder="Tu nombre" value="${esc(ob.name)}">
        ${err}
        <button class="pill" type="submit">${last ? 'Empezar' : 'Continuar'} ${icon('arrowRight')}</button>
      </form>`;
  } else if (key === 'habits') {
    body = `
      <h1 class="ob-title">Hola, ${esc(ob.name)}. <span>Elige con qué empezar.</span></h1>
      <p class="auth-p">Recomendamos <b>3 hábitos</b>: pocos y fáciles ganan. Podrás cambiarlos cuando quieras.</p>
      <div class="ob-grid">${HABIT_SUGGESTIONS.map(([e, n], i) => `
        <button class="ob-pick${ob.picks.includes(i) ? ' is-on' : ''}" data-action="ob-pick" data-i="${i}" aria-pressed="${ob.picks.includes(i)}">
          <span class="ob-emoji">${e}</span><span>${n}</span><span class="ob-tick">${icon('check')}</span>
        </button>`).join('')}</div>
      ${err}
      <div class="ob-actions">
        <button class="text-btn" data-action="ob-back">${icon('left')} Atrás</button>
        <button class="pill" data-action="ob-next">${ob.picks.length ? `Continuar con ${ob.picks.length}` : 'Continuar'} ${icon('arrowRight')}</button>
      </div>`;
  } else {
    body = `
      <h1 class="ob-title">¿Cuándo prefieres <span>hacer tus hábitos?</span></h1>
      <p class="auth-p">Los ordenamos en tu día a esa hora. Puedes ajustar cada uno después.</p>
      <div class="ob-moments">${MOMENTS.map(([id, e, t, h]) => `
        <button class="ob-moment${ob.moment === id ? ' is-on' : ''}" data-action="ob-moment" data-v="${id}" aria-pressed="${ob.moment === id}">
          <span class="ob-emoji">${e}</span><b>${t}</b><small>${h ? h.replace(':00', ':00 h') : 'Cuando puedas'}</small>
        </button>`).join('')}</div>
      <div class="ob-actions">
        <button class="text-btn" data-action="ob-back">${icon('left')} Atrás</button>
        <button class="pill" data-action="ob-finish">Armar mi sistema ${icon('sparkles')}</button>
      </div>`;
  }

  return `
    <div class="ob">
      <div class="ob-card">
        <div class="ob-head">${logo(34)}${dots}</div>
        ${body}
      </div>
    </div>`;
}
