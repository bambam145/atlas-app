// Utilidades compartidas: fechas, texto, formato.

export const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const todayKey = () => keyOf(today());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);

export const DAY_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // índice = getDay()
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// "15:30" -> "3:30 pm"
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMinutes = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

// "2026-09-24" -> "Mañana", "Hoy", "Ayer", "Jue 24 sep"
export function fmtDay(k) {
  if (!k) return 'Sin fecha';
  const d = fromKey(k);
  const diff = daysBetween(today(), d);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export const fmtNum = (n) => new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(n);

export function longDate(d = new Date()) {
  return `${DAY_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}
