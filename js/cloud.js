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

export const cloud = {
  get user() { return user; },
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
    c.auth.onAuthStateChange((_event, session) => {
      const prev = user?.id;
      user = session?.user || null;
      if (!user) { setStatus('signedout'); return; }
      // No llamar a Supabase dentro del callback: diferirlo.
      if (user.id !== prev) setTimeout(() => pull().catch(onError), 0);
    });
    if (user) await pull(); else setStatus('signedout');
  } catch (e) {
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
    options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const c = await client();
  const { data, error } = await c.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const c = await client();
  await c.auth.signOut();
  user = null;
  writeMeta({ userId: null, remoteAt: 0, dirty: false });
  setStatus('signedout');
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
  if (error) throw error;
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
