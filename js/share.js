// Compartir la racha: genera una imagen para historias de Instagram/WhatsApp (1080×1920).
import { state } from './store.js';
import { today, keyOf, addDays, mondayOf } from './util.js';
import {
  isScheduled, statusOf, streakOf, bestOf, rateOf, isWeekly, isCounter, countOf, targetOf, freqLabel,
} from './habits.js';

export const APP_URL = 'https://bambam145.github.io/atlas-app/';

async function fontsReady() {
  try {
    await Promise.all(['300 200px Manrope', '400 60px Manrope', '600 48px Manrope', '700 40px Manrope'].map((f) => document.fonts.load(f)));
  } catch { /* si no carga, usa la fuente del sistema */ }
}

function logo(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#EFEFEF';
  ctx.beginPath(); ctx.roundRect(x, y, s, s, s * 0.28); ctx.fill();
  const c = s / 2;
  ctx.strokeStyle = '#000'; ctx.lineWidth = s * 0.065;
  ctx.beginPath(); ctx.arc(x + c, y + c, s * 0.22, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(x + c, y + c); ctx.rotate(-0.42);
  ctx.lineWidth = s * 0.05;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.375, s * 0.13, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Dibuja la imagen y devuelve un Blob PNG.
export async function renderStreakImage(h) {
  await fontsReady();
  const W = 1080;
  const H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const F = (w, px) => `${w} ${px}px Manrope, "Segoe UI", system-ui, sans-serif`;

  // Fondo negro con resplandor
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 520, 40, W / 2, 520, 900);
  g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Marca
  logo(ctx, 90, 110, 72);
  ctx.fillStyle = '#EFEFEF'; ctx.font = F(600, 46); ctx.textBaseline = 'middle';
  ctx.fillText('atlas', 184, 148);
  if (state.profile?.name) {
    ctx.fillStyle = '#7A7A7A'; ctx.font = F(400, 34); ctx.textAlign = 'right';
    ctx.fillText(state.profile.name, W - 90, 148);
    ctx.textAlign = 'left';
  }

  // Emoji + racha
  const weekly = isWeekly(h);
  const n = streakOf(h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '150px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(h.emoji, W / 2, 470);
  ctx.fillStyle = '#EFEFEF'; ctx.font = F(300, 330);
  ctx.fillText(String(n), W / 2, 820);
  ctx.font = F(400, 58); ctx.fillStyle = '#A3A3A3';
  const unit = weekly ? (n === 1 ? 'semana de constancia' : 'semanas de constancia') : (n === 1 ? 'día seguido' : 'días seguidos');
  ctx.fillText(`🔥 ${unit}`, W / 2, 920);
  ctx.fillStyle = '#EFEFEF'; ctx.font = F(600, 60);
  const name = h.name.length > 26 ? `${h.name.slice(0, 25)}…` : h.name;
  ctx.fillText(name, W / 2, 1040);
  ctx.fillStyle = '#7A7A7A'; ctx.font = F(400, 34);
  ctx.fillText(freqLabel(h), W / 2, 1100);

  // Calendario de puntos (últimas 15 semanas)
  const WEEKS = 15;
  const size = 34;
  const gap = 14;
  const gridW = WEEKS * size + (WEEKS - 1) * gap;
  const gx = (W - gridW) / 2;
  const gy = 1165;
  const t = today();
  const tk = keyOf(t);
  const start = addDays(mondayOf(t), -(WEEKS - 1) * 7);
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = addDays(start, i);
    if (d > t) continue;
    const col = Math.floor(i / 7);
    const row = i % 7;
    const cx = gx + col * (size + gap) + size / 2;
    const cy = gy + row * (size + gap) + size / 2;
    let fill = 'rgba(255,255,255,0.06)';
    let ring = null;
    if (isScheduled(h, d)) {
      const s = statusOf(h, d);
      if (s === 'done') fill = '#EFEFEF';
      else if (s === 'skip') { fill = null; ring = '#7A7A7A'; }
      else if (isCounter(h) && countOf(h, d) > 0) fill = 'rgba(239,239,239,0.45)';
      else if (!weekly && keyOf(d) !== tk) fill = 'rgba(255,255,255,0.14)';
    }
    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    if (fill) {
      if (fill === '#EFEFEF') { ctx.shadowColor = 'rgba(255,255,255,0.45)'; ctx.shadowBlur = 16; }
      ctx.fillStyle = fill; ctx.fill(); ctx.shadowBlur = 0;
    }
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 4; ctx.stroke(); }
  }

  // Estadísticas
  const rate = rateOf(h, 30);
  const stats = [[String(bestOf(h)), 'RÉCORD'], [rate === null ? '—' : `${rate}%`, 'ÚLTIMOS 30 DÍAS']];
  const sy = gy + 7 * (size + gap) + 110;
  stats.forEach(([v, l], i) => {
    const x = W / 2 + (i === 0 ? -200 : 200);
    ctx.fillStyle = '#EFEFEF'; ctx.font = F(300, 96); ctx.fillText(v, x, sy);
    ctx.fillStyle = '#7A7A7A'; ctx.font = F(600, 24); ctx.fillText(l, x, sy + 50);
  });

  // Pie
  ctx.fillStyle = '#A3A3A3'; ctx.font = F(400, 36);
  ctx.fillText('La constancia se construye día a día.', W / 2, H - 140);
  ctx.fillStyle = '#EFEFEF'; ctx.font = F(600, 34);
  ctx.fillText('Hazlo conmigo en atlas', W / 2, H - 84);

  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export function shareText(h, link) {
  const n = streakOf(h);
  const u = isWeekly(h) ? (n === 1 ? 'semana seguida' : 'semanas seguidas') : (n === 1 ? 'día seguido' : 'días seguidos');
  return `🔥 Llevo ${n} ${u} con "${h.name}" en atlas. ¿Te animas a construir tu constancia conmigo? ${link}`;
}

// Intenta abrir el menú nativo de compartir (celular). Devuelve true si se compartió.
export async function shareNative(blob, h, link) {
  const file = new File([blob], `atlas-racha-${keyOf(today())}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Mi racha en atlas', text: shareText(h, link) });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true; // el usuario cerró el menú
    }
  }
  return false;
}

