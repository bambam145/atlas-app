import { state } from '../store.js';
import { icon } from '../icons.js';
import { today, keyOf, fromKey, addDays, esc, DAY_LONG, MONTHS, DAY_SHORT } from '../util.js';
import { dayStats, isScheduled, statusOf } from '../habits.js';
import { pageHead, label } from '../ui.js';
import { MOODS, insightsHtml } from './resumen.js';

export { MOODS };

const PROMPTS = [
  '¿Qué salió bien hoy?',
  '¿Qué aprendiste hoy?',
  '¿Por qué 3 cosas estás agradecido?',
  '¿Qué harías distinto mañana?',
  '¿Qué te dio energía hoy?',
];

export let diaryDate = null; // clave del día abierto en el diario
export const setDiaryDate = (k) => { diaryDate = k; };

export function renderDiario() {
  const tk = keyOf(today());
  const k = diaryDate || tk;
  const d = fromKey(k);
  const entry = state.journal[k] || {};
  const prompt = PROMPTS[d.getDate() % PROMPTS.length];
  const s = dayStats(d);
  const tasksDone = state.tasks.filter((t) => t.doneAt === k).length;
  const habitsDone = state.habits.filter((h) => isScheduled(h, d) && statusOf(h, d) === 'done');

  const head = pageHead({ eyebrow: 'Diario', title: 'Escribe tu día. <span>Mira tu evolución.</span>' });

  const nav = `
    <div class="toolbar">
      <div class="nav-group">
        <button class="icon-btn boxed" data-action="diary-move" data-v="-1" aria-label="Día anterior">${icon('left')}</button>
        <span class="range">${k === tk ? 'Hoy' : `${DAY_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`}</span>
        <button class="icon-btn boxed" data-action="diary-move" data-v="1" aria-label="Día siguiente" ${k >= tk ? 'disabled' : ''}>${icon('right')}</button>
      </div>
    </div>`;

  const editor = `
    <section class="panel journal">
      <p class="label"><span>¿Cómo te sentiste?</span></p>
      <div class="moods big">${MOODS.map((m, i) => `<button class="mood${entry.mood === i + 1 ? ' is-on' : ''}" data-action="mood" data-v="${i + 1}" data-date="${k}" aria-label="${m[1]}"><span>${m[0]}</span><small>${m[1]}</small></button>`).join('')}</div>
      ${entry.mood ? `<input class="input note-input" data-note="${k}" maxlength="140" placeholder="¿Por qué te sentiste así? (opcional)" value="${esc(entry.note || '')}">` : ''}
      <p class="label"><span>${prompt}</span></p>
      <textarea class="input area" data-journal="${k}" placeholder="Escribe libremente… se guarda solo." rows="7">${esc(entry.text || '')}</textarea>
      <p class="hint">${icon('network')} Escribe <b>[[Nombre]]</b> para conectar con un hábito, meta o tarea en tu <button class="inline-link" data-action="nav" data-view="mapa">Mapa</button>.</p>
      <div class="day-summary">
        <span>${icon('repeat')} ${s.done}/${s.total} hábitos</span>
        <span>${icon('check')} ${tasksDone} ${tasksDone === 1 ? 'tarea' : 'tareas'}</span>
        ${habitsDone.slice(0, 6).map((h) => `<span>${h.emoji} ${esc(h.name)}</span>`).join('')}
      </div>
    </section>`;

  const past = [];
  for (let i = 1; i <= 60 && past.length < 12; i++) {
    const pk = keyOf(addDays(today(), -i));
    const e = state.journal[pk];
    if (e && ((e.text && e.text.trim()) || e.mood)) past.push([pk, e]);
  }
  const list = past.length
    ? `<div class="group">${label('Entradas anteriores', past.length)}<div class="entries">${past.map(([pk, e]) => {
      const pd = fromKey(pk);
      return `<button class="entry" data-action="diary-open" data-date="${pk}">
        <span class="entry-date"><b>${pd.getDate()}</b>${DAY_SHORT[pd.getDay()]}</span>
        <span class="entry-body"><span class="entry-mood">${e.mood ? MOODS[e.mood - 1].join(' ') : ''}</span><span class="entry-text">${esc((e.text || e.note || '').slice(0, 140)) || '<i>Sin texto</i>'}</span></span>
      </button>`;
    }).join('')}</div></div>`
    : '';

  const helps = `<section class="panel">${label('Lo que te hace bien')}${insightsHtml()}</section>`;
  return `${head}${nav}<div class="narrow">${editor}${k === tk ? memory() : ''}${helps}${list}</div>`;
}

// "Hace un mes escribiste…": una nota vieja para ver cuánto has cambiado.
function memory() {
  for (const [days, when] of [[365, 'Hace un año'], [30, 'Hace un mes'], [7, 'Hace una semana']]) {
    const pk = keyOf(addDays(today(), -days));
    const e = state.journal[pk];
    const text = (e?.text || e?.note || '').trim();
    if (!text) continue;
    return `<button class="panel memory" data-action="diary-open" data-date="${pk}">
      ${label(`${when} escribiste`)}
      <p>${e.mood ? `${MOODS[e.mood - 1][0]} ` : ''}${esc(text.slice(0, 180))}${text.length > 180 ? '…' : ''}</p>
    </button>`;
  }
  return '';
}
