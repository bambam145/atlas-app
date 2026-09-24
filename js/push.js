// Recordatorios en el celular (Web Push). El servidor (supabase/functions/send-reminders) envía los avisos;
// aquí solo pedimos permiso y guardamos la suscripción de este dispositivo.
import { VAPID_PUBLIC_KEY } from './config.js';
import { cloud, cloudEnabled, savePushSub, deletePushSub } from './cloud.js';
import { state } from './store.js';

export const REMINDER_DEFAULTS = { habits: true, summary: true, summaryTime: '21:00' };
export const reminders = () => ({ ...REMINDER_DEFAULTS, ...(state.reminders || {}) });

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let current = null; // suscripción de este dispositivo
let checked = false;

// 'off' | 'on' | 'denied' | 'install' (iPhone: primero instalar en inicio) | 'unsupported' | 'nocloud'
export function pushStatus() {
  if (!cloudEnabled || !VAPID_PUBLIC_KEY || !cloud.user) return 'nocloud';
  if (isIOS() && !standalone()) return 'install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return current ? 'on' : 'off';
}

// Lee si este dispositivo ya está suscrito (y refresca el guardado en la nube)
export async function refreshPush() {
  if (!supported() || !cloud.user || !VAPID_PUBLIC_KEY) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    current = await reg.pushManager.getSubscription();
    if (current && Notification.permission === 'granted') await savePushSub(current.toJSON(), tz());
  } catch { /* ignorar */ }
  checked = true;
}
export const pushChecked = () => checked;

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima'; } catch { return 'America/Lima'; } };

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : 'dismissed');
  const reg = await navigator.serviceWorker.ready;
  current = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  await savePushSub(current.toJSON(), tz());
  return current;
}

export async function disablePush() {
  const sub = current;
  current = null;
  if (!sub) return;
  try { await deletePushSub(sub.endpoint); } catch { /* ignorar */ }
  try { await sub.unsubscribe(); } catch { /* ignorar */ }
}

// Al cerrar sesión: este dispositivo deja de recibir avisos de esa cuenta
export async function forgetPush() {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) { try { await deletePushSub(sub.endpoint); } catch { /* ignorar */ } await sub.unsubscribe(); }
  } catch { /* ignorar */ }
  current = null;
}
