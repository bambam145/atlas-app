// Bienvenida después de crear la cuenta: nombre → hábitos para empezar → momento del día.
import { state } from '../store.js';
import { icon, logo } from '../icons.js';
import { esc } from '../util.js';
import { HABIT_SUGGESTIONS, MOMENTS } from '../habits.js';

export { MOMENTS };

// times: momento elegido para cada hábito (índice → id de momento)
export const ob = { step: 0, name: '', picks: [], times: {}, error: '' };
export const obMoment = (i) => ob.times[i] || HABIT_SUGGESTIONS[i][2] || 'libre';

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
      <h1 class="ob-title">¿En qué momento <span>haces cada uno?</span></h1>
      <p class="auth-p">Ya los acomodamos según lo usual: cambia lo que quieras. Así tu día queda en orden (desayuno temprano, almuerzo al mediodía, cena en la noche…).</p>
      <div class="ob-times">${ob.picks.map((i) => {
        const [e, n] = HABIT_SUGGESTIONS[i];
        const cur = obMoment(i);
        return `
        <div class="ob-time-row">
          <span class="ob-emoji">${e}</span>
          <span class="ob-time-name">${n}</span>
          <div class="ob-time-opts" role="radiogroup" aria-label="Momento para ${n}">${MOMENTS.map(([id, me, t, h]) => `
            <button class="ob-opt${cur === id ? ' is-on' : ''}" data-action="ob-moment" data-i="${i}" data-v="${id}" role="radio" aria-checked="${cur === id}" data-tip="${h ? `${t} · ${h}` : 'Sin hora fija'}">
              <span>${me}</span><small>${t}</small>
            </button>`).join('')}</div>
        </div>`;
      }).join('')}</div>
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
