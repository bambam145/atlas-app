import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, addDays, mondayOf, esc, DAY_SHORT, WEEK_ORDER, MONTHS } from '../util.js';
import { dayStats, streakOf, bestOf, rateOf, isPerfectDay, byTime } from '../habits.js';
import { progress } from '../xp.js';
import { pageHead, label, emptyState } from '../ui.js';

// Serie única y monocroma: la intensidad (no el color) codifica la magnitud.

function weeklyBars() {
  const t = today();
  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const mon = addDays(mondayOf(t), -w * 7);
    let total = 0;
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i);
      if (d > t) break;
      const s = dayStats(d);
      total += s.total; done += s.done;
    }
    weeks.push({ mon, pct: total ? Math.round((done / total) * 100) : null, done, total });
  }
  return `<div class="vbars" role="img" aria-label="Constancia semanal de las últimas 12 semanas">${weeks.map((w, i) => `
    <div class="vbar${i === weeks.length - 1 ? ' is-current' : ''}" data-tip="Semana del ${w.mon.getDate()} ${MONTHS[w.mon.getMonth()].slice(0, 3)}: ${w.pct === null ? 'sin datos' : `${w.pct}% · ${w.done}/${w.total}`}">
      <div class="vbar-track"><i style="height:${w.pct ?? 0}%"></i></div>
      <span>${i % 2 === weeks.length % 2 || i === weeks.length - 1 ? `${w.mon.getDate()}/${w.mon.getMonth() + 1}` : ''}</span>
    </div>`).join('')}</div>`;
}

function weekdayBars() {
  const t = today();
  const acc = Array.from({ length: 7 }, () => ({ done: 0, total: 0 }));
  for (let i = 0; i < 90; i++) {
    const d = addDays(t, -i);
    const s = dayStats(d);
    if (i === 0 && s.done < s.total) continue;
    acc[d.getDay()].done += s.done;
    acc[d.getDay()].total += s.total;
  }
  const rows = WEEK_ORDER.map((i) => ({ i, pct: acc[i].total ? Math.round((acc[i].done / acc[i].total) * 100) : 0 }));
  const best = rows.reduce((m, r) => (r.pct > m.pct ? r : m), rows[0]);
  return {
    best,
    html: `<div class="hbars">${rows.map((r) => `
      <div class="hbar${r.i === best.i && best.pct > 0 ? ' is-best' : ''}" data-tip="${DAY_SHORT[r.i]}: ${r.pct}% de constancia (90 días)">
        <span class="hbar-label">${DAY_SHORT[r.i]}</span>
        <div class="hbar-track"><i style="width:${r.pct}%"></i></div>
        <span class="hbar-val">${r.pct}%</span>
      </div>`).join('')}</div>`,
  };
}

function yearHeatmap() {
  const t = today();
  const start = addDays(mondayOf(t), -52 * 7);
  let cells = '';
  for (let i = 0; i < 53 * 7; i++) {
    const d = addDays(start, i);
    if (d > t) { cells += '<i class="hm future"></i>'; continue; }
    const s = dayStats(d);
    const lvl = !s.total ? 0 : s.done === s.total ? 4 : Math.ceil((s.done / s.total) * 3);
    cells += `<i class="hm l${lvl}" data-tip="${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}: ${s.total ? `${s.done}/${s.total} hábitos` : 'sin hábitos'}"></i>`;
  }
  return `<div class="heatmap-wrap"><div class="heatmap">${cells}</div></div>
    <div class="legend"><span>Menos</span><i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i><span>Más</span></div>`;
}

export function renderStats() {
  const head = pageHead({ eyebrow: 'Estadísticas', title: 'Tus números <span>no mienten.</span>' });
  if (!state.habits.length && !state.tasks.length) {
    return head + emptyState('Aún no hay datos', 'Cuando empieces a marcar hábitos y tareas, aquí verás tu evolución.');
  }
  const t = today();
  const p = progress();
  let done30 = 0; let total30 = 0; let perfect30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(t, -i);
    const s = dayStats(d);
    if (i === 0 && s.done < s.total) continue;
    done30 += s.done; total30 += s.total;
    if (isPerfectDay(d)) perfect30++;
  }
  const since = keyOf(addDays(t, -29));
  const tasks30 = state.tasks.filter((x) => x.doneAt && x.doneAt >= since).length;
  const bestActive = state.habits.reduce((m, h) => Math.max(m, streakOf(h)), 0);
  const wd = weekdayBars();

  const kpi = (v, l, ic) => `<div class="kpi"><span class="kpi-label">${icon(ic)} ${l}</span><b>${v}</b></div>`;
  const table = state.habits.length ? `
    <section class="panel">${label('Por hábito')}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Hábito</th><th>30 días</th><th>Racha</th><th>Récord</th></tr></thead>
        <tbody>${[...state.habits].sort(byTime).map((h) => {
          const r = rateOf(h, 30);
          return `<tr><td>${h.emoji} ${esc(h.name)}</td><td><span class="mini-bar"><i style="width:${r ?? 0}%"></i></span>${r === null ? '—' : `${r}%`}</td><td>${streakOf(h)}</td><td>${bestOf(h)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>` : '';

  return head + `
    <div class="kpis">
      ${kpi(total30 ? `${Math.round((done30 / total30) * 100)}%` : '—', 'Constancia 30 días', 'chart')}
      ${kpi(done30, 'Hábitos cumplidos', 'repeat')}
      ${kpi(tasks30, 'Tareas hechas', 'check')}
      ${kpi(perfect30, 'Días perfectos', 'sunrise')}
      ${kpi(bestActive, 'Mejor racha activa', 'flame')}
      ${kpi(p.level, `Nivel · ${p.title}`, 'crown')}
    </div>
    <div class="stats-grid">
      <section class="panel">${label('Constancia por semana')}${weeklyBars()}</section>
      <section class="panel">${label('Tu mejor día')}${wd.best.pct > 0 ? `<p class="panel-note">Cumples más los <b>${DAY_SHORT[wd.best.i].toLowerCase()}</b> (${wd.best.pct}%).</p>` : ''}${wd.html}</section>
    </div>
    <section class="panel">${label('Tu año en hábitos')}${yearHeatmap()}</section>
    ${table}`;
}
