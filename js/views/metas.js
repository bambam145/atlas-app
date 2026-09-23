import { state } from '../store.js';
import { icon } from '../icons.js';
import { esc, fmtNum, fromKey, DAY_SHORT, MONTHS } from '../util.js';
import { currentOf, pctOf, statusOfGoal, remainingLabel, GOAL_SUGGESTIONS } from '../goals.js';
import { findHabit } from '../habits.js';
import { pageHead, emptyState, pillTag } from '../ui.js';

const money = (unit) => /^(s\/|\$|€|usd|pen|mxn|cop|clp|ars)$/i.test(unit || '');
export const fmtAmount = (n, unit) => (money(unit) ? `${unit} ${fmtNum(n)}` : `${fmtNum(n)}${unit ? ` ${unit}` : ''}`);

function goalCard(g) {
  const cur = currentOf(g);
  const st = statusOfGoal(g);
  const pct = Math.round(pctOf(g) * 100);
  const habit = g.habitId ? findHabit(g.habitId) : null;
  const deadline = g.deadline ? fromKey(g.deadline) : null;
  return `
    <article class="card goal${st.id === 'done' ? ' is-complete' : ''}">
      <header class="card-head">
        <span class="item-emoji" aria-hidden="true">${g.emoji}</span>
        <div><h3>${esc(g.title)}</h3><p>${icon('clock')} ${remainingLabel(g)}${deadline ? ` · ${DAY_SHORT[deadline.getDay()]} ${deadline.getDate()} ${MONTHS[deadline.getMonth()].slice(0, 3)}` : ''}</p></div>
        <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Editar ${esc(g.title)}">${icon('more')}</button>
      </header>
      <div class="goal-numbers">
        <b>${fmtAmount(cur, money(g.unit) ? g.unit : '')}</b>
        <span>/ ${fmtAmount(g.target, g.unit)}</span>
        ${pillTag(st.label, st.tone)}
      </div>
      <div class="progress thick${st.id === 'done' ? ' is-full' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="goal-foot">
        <span>${pct}%</span>
        ${habit ? `<span class="linked">${icon('repeat')} Suma con ${habit.emoji} ${esc(habit.name)}</span>` : ''}
      </div>
      ${st.id !== 'done' ? `<div class="actions"><button class="pill ghost" data-action="goal-add" data-id="${g.id}">${icon('plus')} Añadir avance</button></div>` : `<p class="goal-win">${icon('trophy')} ¡Meta cumplida! +100 XP</p>`}
    </article>`;
}

export function renderMetas() {
  const head = pageHead({
    eyebrow: 'Metas',
    title: 'Cada meta <span>a su ritmo.</span>',
    sub: state.goals.length ? 'atlas mide tu avance y te dice si vas al día con el plazo.' : '',
    right: `<button class="pill small head-btn" data-action="new-goal">${icon('plus')} Nueva meta</button>`,
  });
  if (!state.goals.length) {
    return head + emptyState('Define a dónde vas',
      'Ahorrar, leer más, correr una maratón… Elige una idea o crea la tuya. Puedes vincularla a un hábito para que avance sola.',
      `<div class="chips">${GOAL_SUGGESTIONS.map((g, i) => `<button class="chip" data-action="new-goal" data-i="${i}">${g.emoji} ${g.title}</button>`).join('')}</div>
       <button class="pill" data-action="new-goal">${icon('plus')} Crear meta</button>`);
  }
  const order = { behind: 0, late: 1, ontrack: 2, ahead: 3, none: 4, done: 5 };
  const goals = [...state.goals].sort((a, b) => order[statusOfGoal(a).id] - order[statusOfGoal(b).id]);
  const active = goals.filter((g) => statusOfGoal(g).id !== 'done').length;
  const avg = Math.round((goals.reduce((s, g) => s + pctOf(g), 0) / goals.length) * 100);
  return head + `
    <section class="panel summary-panel">
      <div><span class="eyebrow">Metas activas</span><b>${active}</b></div>
      <div><span class="eyebrow">Progreso promedio</span><b>${avg}%</b></div>
      <div><span class="eyebrow">Cumplidas</span><b>${goals.length - active}</b></div>
    </section>
    <div class="cards">${goals.map(goalCard).join('')}</div>`;
}
