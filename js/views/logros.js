import { icon } from '../icons.js';
import { badgeState, XP, LEVEL_TITLES, xpForLevel } from '../xp.js';
import { pageHead, label } from '../ui.js';

export function renderLogros() {
  const { p, badges } = badgeState();
  const unlocked = badges.filter((b) => b.unlocked).length;
  const head = pageHead({ eyebrow: 'Logros', title: 'Cada avance <span>es una conquista.</span>' });

  const hero = `
    <section class="panel level-hero">
      <div class="level-ring" style="--p:${Math.round(p.pct * 100)}">
        <span><b>${p.level}</b><small>Nivel</small></span>
      </div>
      <div class="level-info">
        <span class="eyebrow">Tu rango</span>
        <h2>${p.title}</h2>
        <p>${p.xp} XP en total · faltan <b>${p.need - p.into} XP</b> para el nivel ${p.level + 1}</p>
        <div class="xp-bar big"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
      </div>
    </section>`;

  const earn = `
    <section class="panel">${label('Cómo ganar XP')}
      <ul class="earn">
        <li>${icon('repeat')} Cumplir un hábito <b>+${XP.habit}</b></li>
        <li>${icon('check')} Completar una tarea <b>+${XP.task}</b></li>
        <li>${icon('sunrise')} Día perfecto <b>+${XP.perfect}</b></li>
        <li>${icon('feather')} Escribir en el diario <b>+${XP.journal}</b></li>
        <li>${icon('mountain')} Cumplir una meta <b>+${XP.goal}</b></li>
      </ul>
    </section>`;

  const ranks = `
    <section class="panel">${label('Rangos')}
      <ol class="ranks">${LEVEL_TITLES.map(([l, t]) => `<li class="${p.level >= l ? 'is-on' : ''}"><span>Nv. ${l}</span><b>${t}</b><small>${xpForLevel(l)} XP</small></li>`).join('')}</ol>
    </section>`;

  const grid = `
    <div class="group">${label('Insignias', `${unlocked}/${badges.length}`)}
      <div class="badges">${badges.map((b) => `
        <div class="badge${b.unlocked ? ' is-on' : ''}">
          <span class="badge-icon">${icon(b.unlocked ? b.icon : 'lock')}</span>
          <b>${b.name}</b><small>${b.desc}</small>
        </div>`).join('')}</div>
    </div>`;

  return `${head}${hero}<div class="stats-grid">${earn}${ranks}</div>${grid}`;
}
