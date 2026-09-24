// Pantalla cuando la prueba terminó, la suscripción venció o la cuenta está suspendida.
import { icon, logo } from '../icons.js';
import { esc } from '../util.js';
import { cloud, licenseInfo } from '../cloud.js';
import { BUY_URL, SUPPORT_EMAIL, PRICES, PRICE_BEFORE } from '../config.js';

export const pw = { code: '', busy: false, error: '' };

const COPY = {
  'trial-ended': ['Tu prueba de 7 días terminó.', 'Activa atlas para seguir.', 'Tus hábitos, tareas y todo tu progreso siguen guardados. Activa tu cuenta y continúa justo donde lo dejaste.'],
  expired: ['Tu suscripción venció.', 'Renuévala para seguir.', 'Tu progreso sigue guardado. Canjea un código nuevo o renueva tu plan para continuar.'],
  suspended: ['Tu cuenta está suspendida.', 'Escríbenos para resolverlo.', 'Si crees que es un error, contáctanos y lo revisamos.'],
  none: ['Activa tu cuenta.', 'Solo falta un paso.', 'Canjea tu código de activación para empezar a usar atlas.'],
};

const money = (n) => `$${Number(n).toFixed(2)}`;

// Tarjetas de planes (el anual destacado)
export function planCards() {
  if (!PRICES?.yearly) return '';
  const card = (id, name, per, note, best) => {
    const before = PRICE_BEFORE?.[id];
    return `<div class="plan-card${best ? ' is-best' : ''}">
      ${best ? '<span class="plan-tag">Más elegido</span>' : ''}
      ${before ? '<span class="plan-tag soft">Lanzamiento</span>' : ''}
      <span class="plan-name">${name}</span>
      <span class="plan-price">${before ? `<s>${money(before)}</s>` : ''}${money(PRICES[id])}<small>${per}</small></span>
      <span class="plan-note">${note}</span>
    </div>`;
  };
  const monthsFree = Math.round(12 - PRICES.yearly / PRICES.monthly);
  return `<div class="plans">
    ${card('yearly', 'Anual', '/año', `≈ ${money(PRICES.yearly / 12)} al mes · ahorras ${monthsFree} meses`, true)}
    ${card('lifetime', 'De por vida', 'una vez', PRICE_BEFORE?.lifetime ? 'Pago único · solo primeros 100' : 'Pago único, para siempre')}
    ${card('monthly', 'Mensual', '/mes', 'Cancela cuando quieras')}
  </div>
  <p class="hint plans-hint">Precios en dólares (USD).</p>`;
}

export function renderPaywall() {
  const info = licenseInfo();
  const [t1, t2, p] = COPY[info.state] || COPY.none;
  const err = pw.error ? `<p class="form-error">${icon('info')} ${esc(pw.error)}</p>` : '';
  return `
    <div class="ob paywall">
      <div class="ob-card">
        <div class="ob-head">${logo(34)}<span class="pw-mail">${esc(cloud.user?.email || '')}</span></div>
        <h1 class="ob-title">${t1} <span>${t2}</span></h1>
        <p class="auth-p">${p}</p>
        ${info.state !== 'suspended' ? planCards() : ''}

        ${info.state !== 'suspended' ? `
        <form class="auth-form" data-form="redeem" novalidate>
          <label class="auth-field"><span>Código de activación</span>
            <input class="input code-input big" id="pw-code" data-pw="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ATLAS-XXXX-XXXX" value="${esc(pw.code)}">
          </label>
          ${err}
          <button class="pill" type="submit" ${pw.busy ? 'disabled' : ''}>${pw.busy ? 'Activando…' : `Activar atlas ${icon('arrowRight')}`}</button>
        </form>
        ${BUY_URL ? `<a class="pill ghost pw-buy" href="${esc(BUY_URL)}" target="_blank" rel="noopener">${icon('zap')} Comprar atlas</a>` : ''}
        <p class="hint">${icon('info')} Al comprar, te enviamos tu código al correo. Revisa también spam.</p>` : ''}

        ${SUPPORT_EMAIL ? `<p class="hint">¿Necesitas ayuda? Escríbenos a <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a></p>` : ''}

        <div class="pw-foot">
          <button class="text-btn" data-action="export-data">${icon('download')} Descargar mis datos</button>
          <button class="text-btn" data-action="pw-logout">${icon('logout')} Cerrar sesión</button>
        </div>
      </div>
    </div>`;
}
