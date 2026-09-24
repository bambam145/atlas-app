// Estado global, persistencia local y disparador de render.

const STORE_KEY = 'atlas:v1';
const LEGACY_KEY = 'racha:v1';

export const DEFAULT_CATEGORIES = ['Personal', 'Trabajo', 'Estudio', 'Salud'];

function empty() {
  return {
    habits: [],
    log: {},
    tasks: [],
    goals: [],
    journal: {},
    categories: [...DEFAULT_CATEGORIES],
    profile: null, // { name, onboarded }
    refCode: null, // tu código de invitado (Invita y gana)
    reminders: null, // { habits, summary, summaryTime } — null = valores por defecto
    seenBadges: null, // null = primera carga: no anunciar logros ya ganados
    lastLevel: null,
    theme: 'dark',
    ui: { tasksView: 'lista', plannerMode: null, plannerAnchor: null },
  };
}

function load() {
  const base = empty();
  try {
    const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...base, ...s, ui: { ...base.ui, ...(s.ui || {}) }, categories: s.categories || base.categories };
    }
  } catch (e) { /* almacenamiento no disponible */ }
  return base;
}

export const state = load();

let saveHook = () => {};
export const setSaveHook = (fn) => { saveHook = fn; };

export function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ }
  saveHook();
}

// Reemplaza todos los datos (restaurar copia / borrar todo).
export function replaceState(data) {
  const base = empty();
  const next = data ? { ...base, ...data, ui: { ...base.ui, ...(data.ui || {}) } } : base;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  save();
}

// Una copia válida debe tener al menos las listas principales.
export function isValidBackup(d) {
  return d && typeof d === 'object' && Array.isArray(d.habits) && Array.isArray(d.tasks) && typeof d.log === 'object';
}

let renderFn = () => {};
export const setRenderer = (fn) => { renderFn = fn; };
export const rerender = () => renderFn();
