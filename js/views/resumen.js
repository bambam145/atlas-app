// Resumen semanal / mensual: cómo te fue con cada hábito, tu sueño, tu agua y tu ánimo.
import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, addDays, mondayOf, esc, fmtTime, pad, toMinutes, MONTHS } from '../util.js';
import {
  isScheduled, statusOf, isWeekly, isCounter, isChoice, isSleep, countOf, targetOf, timeOf, choiceLabels, CHOICE_VALUES,
  sleepMinutes, sleepGoalOf, fmtDuration, isGlasses, litersText, perWeekOf, dayStats, isPerfectDay, byTime,
} from '../habits.js';
import { label } from '../ui.js';

export const MOODS = [['😞', 'Mal'], ['😕', 'Regular'], ['😐', 'Normal'], ['🙂', 'Bien'], ['😄', 'Excelente']];
const TONE = { done: 'good', meh: 'meh', none: 'none' };
const fmt1 = (n) => new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(n);
const moodOf = (avg) => MOODS[Math.min(4, Math.max(0, Math.round(avg) - 1))];

// Periodo elegido: semana o mes, con desplazamiento hacia atrás.
export function period() {
  const mode = state.ui.sumMode === 'mes' ? 'mes' : 'semana';
  const off = Math.min(0, state.ui.sumOffset || 0);
  const t = today();
  let start;
  let end;
  if (mode === 'semana') {
    start = addDays(mondayOf(t), off * 7);
    end = addDays(start, 6);
  } else {
    start = new Date(t.getFullYear(), t.getMonth() + off, 1);
    end = new Date(t.getFullYear(), t.getMonth() + off + 1, 0);
  }
  const days = [];
  for (let d = new Date(start); d <= end && d <= t; d = addDays(d, 1)) days.push(new Date(d));
  let title;
  if (mode === 'mes') title = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  else if (off === 0) title = 'Esta semana';
  else if (off === -1) title = 'Semana pasada';
  else title = `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`;
  if (mode === 'mes' && off === 0) title = 'Este mes';
  return { mode, off, start, end, days, title };
}

// Promedio de horas del reloj. Para la hora de dormir, lo de madrugada cuenta como "después de medianoche".
function avgClock(list, night = false) {
  if (!list.length) return '';
  const mins = list.map((t) => { const m = toMinutes(t); return night && m < 12 * 60 ? m + 1440 : m; });
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) % 1440;
  return `${pad(Math.floor(avg / 60))}:${pad(avg % 60)}`;
}

const tk = () => keyOf(today());
// Días del periodo que cuentan para el hábito (hoy solo si ya lo registraste).
const daysFor = (h, days) => days.filter((d) => isScheduled(h, d) && statusOf(h, d) !== 'skip' && (keyOf(d) !== tk() || statusOf(h, d)));

function bar(parts, total) {
  if (!total) return '<span class="sum-bar"></span>';
  return `<span class="sum-bar">${parts.filter(([n]) => n > 0).map(([n, cls]) => `<i class="${cls}" style="width:${(n / total) * 100}%"></i>`).join('')}</span>`;
}

function habitSummary(h, days) {
  const ds = daysFor(h, days);
  const times = ds.map((d) => timeOf(h, d)).filter(Boolean);
  const avgT = avgClock(times);
  const at = avgT ? ` · hora promedio ${fmtTime(avgT)}` : '';

  if (isWeekly(h)) {
    const n = days.filter((d) => statusOf(h, d) === 'done').length;
    return { big: `${n}`, unit: n === 1 ? 'vez' : 'veces', bar: bar([[n, 'done']], Math.max(n, perWeekOf(h))), text: `Tu meta: ${perWeekOf(h)} por semana${at}` };
  }
  if (isSleep(h)) {
    const recs = ds.map((d) => (state.sleep || {})[keyOf(d)]).filter((r) => sleepMinutes(r) !== null);
    if (!recs.length) return { big: '—', unit: '', bar: bar([], 0), text: 'Aún no registras tu sueño en este periodo' };
    const avg = recs.reduce((a, r) => a + sleepMinutes(r), 0) / recs.length;
    const ok = recs.filter((r) => sleepMinutes(r) >= sleepGoalOf(h) * 60 - 15).length;
    return {
      big: fmtDuration(Math.round(avg)), unit: 'promedio',
      bar: bar([[ok, 'good'], [recs.length - ok, 'meh']], recs.length),
      text: `${ok} de ${recs.length} ${recs.length === 1 ? 'noche' : 'noches'} con tu meta de ${fmt1(sleepGoalOf(h))} h · te acostaste ~${fmtTime(avgClock(recs.map((r) => r.bed), true))} · despertaste ~${fmtTime(avgClock(recs.map((r) => r.wake)))}`,
    };
  }
  if (isChoice(h)) {
    const labels = choiceLabels(h);
    const n = CHOICE_VALUES.map((v) => ds.filter((d) => statusOf(h, d) === v).length);
    const none = ds.length - n[0] - n[1] - n[2];
    const parts = CHOICE_VALUES.map((v, i) => (n[i] ? `<span class="tone-text ${TONE[v]}">${n[i]} ${esc(labels[i].toLowerCase())}</span>` : '')).filter(Boolean);
    if (none > 0) parts.push(`<span>${none} sin registrar</span>`);
    return {
      big: `${n[0]}/${ds.length}`, unit: esc(labels[0].toLowerCase()),
      bar: bar([[n[0], 'good'], [n[1], 'meh'], [n[2], 'none']], ds.length),
      text: `${parts.join(' · ') || 'Sin registros'}${at}`,
    };
  }
  if (isCounter(h)) {
    const total = ds.reduce((a, d) => a + countOf(h, d), 0);
    const met = ds.filter((d) => countOf(h, d) >= targetOf(h)).length;
    const avg = ds.length ? total / ds.length : 0;
    const unit = h.unit || 'veces';
    const liters = isGlasses(h);
    return {
      big: fmt1(avg), unit: `${esc(unit)} al día`,
      bar: bar([[met, 'done']], ds.length),
      text: `${total} ${esc(unit)}${liters ? ` (${litersText(total)})` : ''} en total · ${liters ? `≈ ${litersText(avg)} al día · ` : ''}meta cumplida ${met} de ${ds.length} días`,
    };
  }
  const done = ds.filter((d) => statusOf(h, d) === 'done').length;
  return { big: `${done}/${ds.length}`, unit: 'días', bar: bar([[done, 'done']], ds.length), text: `${ds.length ? Math.round((done / ds.length) * 100) : 0}% de constancia${at}` };
}

function moodStrip(p) {
  const cells = [];
  const t = today();
  for (let d = new Date(p.start); d <= p.end; d = addDays(d, 1)) {
    const e = state.journal[keyOf(d)];
    const m = e?.mood;
    const tip = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}: ${m ? MOODS[m - 1].join(' ') : 'sin registro'}`;
    cells.push(`<span class="mood-col${d > t ? ' future' : ''}" data-tip="${tip}"><i class="m${m || 0}" style="height:${m ? 20 + m * 16 : 6}%"></i>${p.mode === 'semana' ? `<small>${'DLMMJVS'[d.getDay()]}</small>` : ''}</span>`);
  }
  return `<div class="mood-strip${p.mode === 'mes' ? ' month' : ''}">${cells.join('')}</div>`;
}

// ¿Qué hábitos van de la mano con sentirte mejor? Compara tu ánimo los días que cumples y los que no (últimos 60 días).
export function moodInsights(max = 3) {
  const t = today();
  const out = [];
  for (const h of state.habits) {
    if (isWeekly(h)) continue;
    const yes = [];
    const no = [];
    for (let i = 0; i < 60; i++) {
      const d = addDays(t, -i);
      const m = state.journal[keyOf(d)]?.mood;
      if (!m || !isScheduled(h, d)) continue;
      const s = statusOf(h, d);
      if (s === 'skip' || (i === 0 && !s)) continue;
      (s === 'done' ? yes : no).push(m);
    }
    if (yes.length < 3 || no.length < 3) continue;
    const a = yes.reduce((x, y) => x + y, 0) / yes.length;
    const b = no.reduce((x, y) => x + y, 0) / no.length;
    if (a - b >= 0.4) out.push({ h, a, b, diff: a - b });
  }
  return out.sort((x, y) => y.diff - x.diff).slice(0, max).map(({ h, a, b }) => {
    const what = isSleep(h) ? `duermes ${fmt1(sleepGoalOf(h))} h o más`
      : isChoice(h) ? `registras ${h.emoji} ${esc(h.name)} como “${esc(choiceLabels(h)[0])}”`
        : `cumples ${h.emoji} ${esc(h.name)}`;
    return `<li><span class="ins-emoji">${moodOf(a)[0]}</span><span>Los días que ${what}, tu ánimo promedio es <b>${moodOf(a)[1]}</b> (${fmt1(a)}). Cuando no, <b>${moodOf(b)[1]}</b> (${fmt1(b)}).</span></li>`;
  });
}

export function insightsHtml() {
  const list = moodInsights();
  if (list.length) return `<ul class="insights">${list.join('')}</ul>`;
  const logged = Object.values(state.journal).filter((e) => e.mood).length;
  return `<p class="panel-note">${logged < 7
    ? `Marca cómo te sientes cada día (${logged}/7) y aquí verás qué hábitos te hacen sentir mejor.`
    : 'Aún no hay una relación clara entre tus hábitos y tu ánimo. Sigue registrando y aparecerá aquí.'}</p>`;
}

export function renderSummary() {
  const p = period();
  const habits = [...state.habits].filter((h) => keyOf(p.end) >= h.createdAt).sort(byTime);
  let done = 0;
  let total = 0;
  let perfect = 0;
  for (const d of p.days) {
    const s = dayStats(d);
    if (keyOf(d) === tk() && s.done < s.total) continue;
    done += s.done; total += s.total;
    if (isPerfectDay(d)) perfect++;
  }
  const moods = p.days.map((d) => state.journal[keyOf(d)]?.mood).filter(Boolean);
  const moodAvg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;

  const rows = habits.map((h) => {
    const r = habitSummary(h, p.days);
    return `<div class="sum-row">
      <span class="item-emoji sm" aria-hidden="true">${h.emoji}</span>
      <div class="sum-body">
        <div class="sum-top"><b class="sum-name">${esc(h.name)}</b><span class="sum-big">${r.big} <small>${r.unit}</small></span></div>
        ${r.bar}
        <p class="sum-text">${r.text}</p>
      </div>
    </div>`;
  }).join('');

  return `
    <section class="panel summary">
      <div class="sum-head">
        ${label('Resumen')}
        <div class="seg">
          <button class="seg-btn${p.mode === 'semana' ? ' is-on' : ''}" data-action="sum-mode" data-v="semana">Semana</button>
          <button class="seg-btn${p.mode === 'mes' ? ' is-on' : ''}" data-action="sum-mode" data-v="mes">Mes</button>
        </div>
      </div>
      <div class="nav-group sum-nav">
        <button class="icon-btn boxed" data-action="sum-move" data-v="-1" aria-label="Periodo anterior">${icon('left')}</button>
        <span class="range">${p.title}</span>
        <button class="icon-btn boxed" data-action="sum-move" data-v="1" aria-label="Periodo siguiente" ${p.off >= 0 ? 'disabled' : ''}>${icon('right')}</button>
      </div>
      <div class="sum-kpis">
        <div><b>${total ? `${Math.round((done / total) * 100)}%` : '—'}</b><span>Constancia</span></div>
        <div><b>${perfect}</b><span>Días perfectos</span></div>
        <div><b>${moodAvg ? moodOf(moodAvg)[0] : '—'}</b><span>${moodAvg ? `Ánimo · ${moodOf(moodAvg)[1]}` : 'Ánimo'}</span></div>
      </div>
      ${rows ? `<div class="sum-list">${rows}</div>` : '<p class="panel-note">No hay hábitos en este periodo.</p>'}
      <div class="sum-mood">
        ${label('Tu ánimo', moods.length ? `${moods.length} ${moods.length === 1 ? 'día' : 'días'}` : '')}
        ${moodStrip(p)}
        ${label('Lo que te hace bien')}
        ${insightsHtml()}
      </div>
    </section>`;
}
