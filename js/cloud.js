// Nube (Supabase): cuenta con código por correo + sincronización entre dispositivos.
// Modelo "local primero": la app siempre guarda en el dispositivo y sube a la nube en segundo plano.
// Cada usuario tiene una fila en atlas_data con todos sus datos; gana el cambio más reciente.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { state, replaceState, setSaveHook, rerender } from './store.js';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const META_KEY = 'atlas:sync';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let sb = null;
let user = null;
let status = cloudEnabled ? 'loading' : 'off'; // off | loading | signedout | syncing | synced | offline | error
let lastSyncAt = null;
let pushTimer = null;
let applyingRemote = false;
let lastPull = 0;

const listeners = new Set();
export const onCloudChange = (fn) => listeners.add(fn);
const setStatus = (s) => { status = s; listeners.forEach((fn) => fn()); };

let recovery = false; // llegó desde "olvidé mi contraseña": pedir la nueva

export const cloud = {
  get user() { return user; },
  get recovery() { return recovery; },
  get status() { return status; },
  get lastSyncAt() { return lastSyncAt; },
};

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; }
}
function writeMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...m })); } catch { /* ignorar */ }
}

const hasData = (d) => Boolean(d && ((d.habits && d.habits.length) || (d.tasks && d.tasks.length) || (d.goals && d.goals.length) || Object.keys(d.journal || {}).length));

// Lo que se sincroniza: todo menos las preferencias de este dispositivo (tema y vistas).
function payload() {
  const { theme, ui, ...data } = state;
  return data;
}

async function client() {
  if (sb) return sb;
  const { createClient } = await import(LIB);
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'atlas-auth' },
  });
  return sb;
}

export async function initCloud() {
  if (!cloudEnabled) return;

  // Cada vez que se guarda algo localmente, marcar pendiente y subir en unos segundos.
  setSaveHook(() => {
    if (applyingRemote || !user) return;
    writeMeta({ dirty: true, editedAt: Date.now() });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push().catch(onError), 1500);
  });

  try {
    const c = await client();
    const { data } = await c.auth.getSession();
    user = data.session?.user || null;
    c.auth.onAuthStateChange((event, session) => {
      const prev = user?.id;
      user = session?.user || null;
      if (event === 'PASSWORD_RECOVERY') { recovery = true; setStatus(status); }
      if (!user) { setStatus('signedout'); return; }
      // No llamar a Supabase dentro del callback: diferirlo.
      if (user.id !== prev) setTimeout(() => pull().catch(onError), 0);
    });
    if (user) await pull(); else setStatus('signedout');
  } catch (e) {
    // Sin internet y sin la librería en caché: si había sesión guardada, dejar entrar en modo local.
    try { user = user || JSON.parse(localStorage.getItem('atlas-auth'))?.user || null; } catch { /* ignorar */ }
    onError(e);
  }

  window.addEventListener('online', () => { if (user) pull().catch(onError); });
  // Si el enlace del correo se abrió en otra pestaña, tomar la sesión desde ahí.
  window.addEventListener('storage', (e) => { if (e.key === 'atlas-auth') refreshSession(); });
  window.addEventListener('focus', () => { if (!user) refreshSession(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && user && Date.now() - lastPull > 20000) pull().catch(onError);
  });
}

function onError(e) {
  console.warn('[atlas nube]', e);
  setStatus(navigator.onLine ? 'error' : 'offline');
}

/* ---------- Sesión ---------- */

async function refreshSession() {
  try {
    const c = await client();
    const { data } = await c.auth.getSession();
    const next = data.session?.user || null;
    if (next && next.id !== user?.id) { user = next; await pull(); }
    else if (!next && user) { user = null; setStatus('signedout'); }
  } catch (e) { onError(e); }
}

export async function sendCode(email) {
  const c = await client();
  const { error } = await c.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname, data: refData() },
  });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const c = await client();
  const { data, error } = await c.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.user;
}

// Cerrar sesión: sube lo pendiente y limpia este dispositivo (los datos quedan en la nube).
export async function signOut() {
  const c = await client();
  if (user && readMeta().dirty) { try { await push(); } catch { /* sin conexión: se pierde lo no subido */ } }
  try { await c.auth.signOut({ scope: 'local' }); } catch { /* sin conexión: igual cerrar localmente */ }
  user = null;
  applyingRemote = true;
  replaceState({ theme: state.theme });
  applyingRemote = false;
  writeMeta({ userId: null, remoteAt: 0, dirty: false });
  setStatus('signedout');
}

// Elimina la cuenta y todos sus datos en la nube; después deja este dispositivo limpio.
export async function deleteAccount() {
  if (!user) return;
  const c = await client();
  const { error } = await c.rpc('delete_my_account');
  if (error) throw error;
  try { await c.auth.signOut({ scope: 'local' }); } catch { /* la sesión ya no existe */ }
  user = null;
  license = undefined;
  try { localStorage.removeItem(LICENSE_KEY); } catch { /* ignorar */ }
  applyingRemote = true;
  replaceState({ theme: state.theme });
  applyingRemote = false;
  writeMeta({ userId: null, remoteAt: 0, dirty: false });
  setStatus('signedout');
}

/* ---------- Recordatorios (suscripciones push de este dispositivo) ---------- */

export async function savePushSub(sub, tz) {
  if (!user || !sub?.endpoint || !sub.keys) return;
  const c = await client();
  const { error } = await c.from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, user_id: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, tz });
  if (error) throw error;
}
export async function deletePushSub(endpoint) {
  if (!user) return;
  const c = await client();
  await c.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/* ---------- Invita y gana ---------- */

const REF_KEY = 'atlas-ref';
// Guarda el código de invitación que venga en el enlace (?ref=ABC123) y limpia la URL.
export function captureRef() {
  try {
    const url = new URL(location.href);
    const ref = (url.searchParams.get('ref') || '').trim().toUpperCase();
    if (/^[A-Z0-9]{4,12}$/.test(ref)) localStorage.setItem(REF_KEY, ref);
    if (url.searchParams.has('ref')) { url.searchParams.delete('ref'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
  } catch { /* ignorar */ }
}
export const pendingRef = () => { try { return localStorage.getItem(REF_KEY) || ''; } catch { return ''; } };
const refData = () => (pendingRef() ? { ref: pendingRef() } : {});

export async function myReferral() {
  const c = await client();
  const { data, error } = await c.rpc('my_referral');
  if (error) throw error;
  return data; // { code, invited, rewarded }
}

/* ---------- Licencia (prueba, activa, vencida, suspendida) ---------- */

const LICENSE_KEY = 'atlas:license';
let license; // undefined = aún no se sabe; null = sin licencia
try { license = JSON.parse(localStorage.getItem(LICENSE_KEY)) ?? undefined; } catch { license = undefined; }

export async function fetchLicense() {
  if (!user) return;
  const c = await client();
  const { data, error } = await c.from('licenses').select('status, plan, trial_ends_at, expires_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  license = data ? { ...data, uid: user.id } : null;
  try { localStorage.setItem(LICENSE_KEY, JSON.stringify(license)); } catch { /* ignorar */ }
  setStatus(status);
}

// Estado calculado de la licencia de la sesión actual.
export function licenseInfo() {
  if (!cloudEnabled) return { ok: true, state: 'local' };
  if (license === undefined || (license && user && license.uid !== user.id)) return { ok: true, state: 'loading' };
  if (!license) return { ok: false, state: 'none' };
  const now = Date.now();
  const days = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 86400000));
  if (license.status === 'suspended') return { ok: false, state: 'suspended' };
  if (license.status === 'trial') {
    const ok = Date.parse(license.trial_ends_at) > now;
    return { ok, state: ok ? 'trial' : 'trial-ended', daysLeft: days(license.trial_ends_at), endsAt: license.trial_ends_at };
  }
  const ok = !license.expires_at || Date.parse(license.expires_at) > now;
  return { ok, state: ok ? 'active' : 'expired', plan: license.plan, expiresAt: license.expires_at, daysLeft: license.expires_at ? days(license.expires_at) : null };
}

// "atlas 7k3f 9qx2" → "ATLAS-7K3F-9QX2"
export function normalizeCode(raw) {
  let s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('ATLAS')) s = s.slice(5);
  s = s.slice(0, 8);
  return s.length === 8 ? `ATLAS-${s.slice(0, 4)}-${s.slice(4)}` : '';
}

export async function redeemCode(raw) {
  const code = normalizeCode(raw);
  if (!code) throw new Error('format');
  const c = await client();
  const { data, error } = await c.rpc('redeem_code', { p_code: code });
  if (error) throw new Error(/used_code/.test(error.message) ? 'used' : /invalid_code/.test(error.message) ? 'invalid' : error.message);
  await fetchLicense();
  if (readMeta().dirty) push().catch(onError);
  return data;
}

export const PLAN_LABEL = { lifetime: 'De por vida', monthly: 'Mensual', yearly: 'Anual' };

/* ---------- Correo + contraseña ---------- */

const redirect = () => location.origin + location.pathname;

export async function signInPassword(email, password) {
  const c = await client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Devuelve true si hace falta confirmar el correo antes de entrar.
export async function signUp(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirect(), data: refData() } });
  if (error) throw error;
  // Correo ya registrado: Supabase responde "ok" sin enviar nada y sin identidades.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('User already registered');
  }
  return !data.session;
}

export async function resetPassword(email) {
  const c = await client();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
  if (error) throw error;
}

export async function updatePassword(password) {
  const c = await client();
  const { error } = await c.auth.updateUser({ password });
  if (error) throw error;
  recovery = false;
  setStatus(status);
}

export async function resendConfirmation(email) {
  const c = await client();
  const { error } = await c.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect() } });
  if (error) throw error;
}

// Mensajes de error de Supabase → español claro.
export function authError(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Primero confirma tu correo: revisa tu bandeja (y spam).';
  if (/already registered|already exists/i.test(m)) return 'Ese correo ya tiene cuenta. Entra con un enlace al correo o usa "¿Olvidaste tu contraseña?".';
  if (/rate limit|seconds|too many/i.test(m)) return 'Demasiados intentos. Espera un minuto y vuelve a intentar.';
  if (/password.*(at least|short|weak)|weak/i.test(m)) return 'La contraseña es muy débil: usa al menos 8 caracteres.';
  if (/same password|different from the old/i.test(m)) return 'La nueva contraseña debe ser distinta a la anterior.';
  if (/fetch|network|failed to/i.test(m) || !navigator.onLine) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  return 'Algo salió mal. Inténtalo de nuevo.';
}

/* ---------- Sincronización ---------- */

function applyRemote(data, remoteAt) {
  applyingRemote = true;
  replaceState({ ...data, theme: state.theme, ui: state.ui });
  applyingRemote = false;
  writeMeta({ userId: user.id, remoteAt, dirty: false, editedAt: remoteAt });
  rerender();
}

export async function pull() {
  if (!user) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  lastPull = Date.now();
  setStatus('syncing');
  const c = await client();
  await fetchLicense();
  const { data: row, error } = await c.from('atlas_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;

  const meta = readMeta();
  const sameUser = meta.userId === user.id;

  // Cuenta nueva (nube vacía): subir lo de este dispositivo.
  if (!row) { await push(); return; }

  const remoteAt = Date.parse(row.updated_at);
  if (!sameUser) {
    // Primera vez con esta cuenta en este dispositivo.
    let useRemote = hasData(row.data) || !hasData(state);
    if (hasData(state) && hasData(row.data)) {
      useRemote = confirm('Tu cuenta ya tiene datos guardados en la nube.\n\nAceptar → usar los datos de la nube (recomendado).\nCancelar → reemplazar la nube con los datos de este dispositivo.');
    }
    if (useRemote) applyRemote(row.data, remoteAt);
    else { await push(); return; }
  } else if (remoteAt > (meta.remoteAt || 0)) {
    // Otro dispositivo guardó algo más nuevo.
    if (meta.dirty && (meta.editedAt || 0) > remoteAt) { await push(); return; }
    applyRemote(row.data, remoteAt);
  } else if (meta.dirty) {
    await push();
    return;
  }
  lastSyncAt = Date.now();
  setStatus('synced');
}

export async function push() {
  if (!user) return;
  clearTimeout(pushTimer);
  if (!navigator.onLine) { setStatus('offline'); return; }
  setStatus('syncing');
  const c = await client();
  const { data: row, error } = await c
    .from('atlas_data')
    .upsert({ user_id: user.id, data: payload(), updated_at: new Date().toISOString() })
    .select('updated_at')
    .single();
  if (error) {
    // Sin licencia vigente la base de datos rechaza guardar: actualizar el estado de la licencia.
    if (error.code === '42501' || /row-level security/i.test(error.message)) { await fetchLicense(); setStatus('synced'); return; }
    throw error;
  }
  writeMeta({ userId: user.id, remoteAt: Date.parse(row.updated_at), dirty: false });
  lastSyncAt = Date.now();
  setStatus('synced');
}

export function statusLabel() {
  switch (status) {
    case 'synced': return 'Sincronizado';
    case 'syncing': return 'Sincronizando…';
    case 'offline': return 'Sin conexión · se subirá luego';
    case 'error': return 'No se pudo sincronizar';
    case 'loading': return 'Conectando…';
    case 'signedout': return 'Sin cuenta · solo en este dispositivo';
    default: return 'Solo en este dispositivo';
  }
}
