// Pixel de Meta (Facebook/Instagram Ads): mide visitas, registros y compras para optimizar anuncios.
// Solo se carga si PIXEL_ID está configurado en js/config.js.
import { PIXEL_ID, PRICES, CURRENCY } from './config.js';

let ready = false;

export function initPixel() {
  if (!PIXEL_ID || ready) return;
  ready = true;
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
}

export function track(event, params) {
  if (!ready || !window.fbq) return;
  try { window.fbq('track', event, params || {}); } catch { /* ignorar */ }
}

// Eventos de negocio de atlas
export const trackRegistration = () => { track('CompleteRegistration', { content_name: 'atlas' }); track('StartTrial', { value: 0, currency: CURRENCY }); };
export function trackPurchase(plan) {
  const value = Number(PRICES?.[plan]) || 0;
  if (value > 0) track('Purchase', { value, currency: CURRENCY, content_name: `atlas ${plan}` });
  else track('Subscribe', { content_name: `atlas ${plan}` });
}
