/**
 * The Camp panel: every camp object, which class buff it stands in for, and whether this raid
 * needs it. Ticking one tells the planner the raid will sit at a fire with that object on it.
 */

import type { Coverage, Roster } from './types';
import type { RaidHandlers } from './render';
import { CAMP_INSTANCE_NOTE } from './render';
import { iconImg } from '../shared/icons';
import type { Archetype } from '../shared/classes';

/** One and many, in the words a raid leader uses. */
const KIND: Record<Archetype, [string, string]> = {
  tank: ['tank', 'tanks'],
  melee: ['melee', 'melee'],
  'ranged-physical': ['hunter', 'hunters'],
  caster: ['caster', 'casters'],
  healer: ['healer', 'healers'],
};
import { bestCampObjects, type CampPick } from './suggestions';
import { effectById } from './effects/index';
import {
  BASIC_CAMPFIRE_SLOTS,
  CAMP_EXCLUSIVE_QUOTE,
  CAMP_OBJECTS,
  CAMP_SOURCE,
  UPGRADED_CAMPFIRE_SLOTS,
  campSkillLabel,
  cleanCampPicks,
  type CampObject,
} from './camp';

/* Module state first: the planner draws during bootstrap. */
/** Null until somebody opens or closes it; then their choice sticks for the page. */
let campOpen: boolean | null = null;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface CampPanelView {
  roster: Roster;
  coverage: Coverage;
  canEdit: boolean;
}

/** "6 melee, 2 tanks". */
function helpsLine(pick: CampPick): string {
  return pick.helps
    .map((h) => h.n + ' ' + KIND[h.archetype][h.n === 1 ? 0 : 1])
    .join(', ');
}

/** The best objects for this raid, numbered, with one button to tick them all. */
function renderBest(best: CampPick[], picks: Set<string>, canEdit: boolean, h: RaidHandlers): HTMLElement {
  const box = el('div', 'camp-best');
  box.appendChild(el('div', 'section-label', 'Best ' + (best.length === 1 ? 'pick' : best.length) + ' for this raid'));

  const list = el('ol', 'camp-best__list');
  for (const pick of best) {
    const li = el('li', 'camp-best__item' + (picks.has(pick.object.id) ? ' camp-best__item--on' : ''));
    li.appendChild(iconImg(pick.object.icon, '', 'camp__icon'));
    const text = el('div', 'camp-best__text');
    const top = el('div', 'camp-best__top');
    top.appendChild(el('span', 'camp__name', pick.object.name));
    top.appendChild(el('span', 'tag', campSkillLabel(pick.object)));
    if (picks.has(pick.object.id)) top.appendChild(el('span', 'camp-best__ticked', 'Ticked'));
    text.appendChild(top);
    const others = pick.effect.possibleBy.map((p) => p.name);
    text.appendChild(
      el(
        'div',
        'camp__partner',
        'Stands in for ' + pick.effect.effect.name + '. Helps ' + helpsLine(pick) + '.' +
          (others.length ? ' ' + others.slice(0, 2).join(' or ') + ' could bring the class buff instead.' : ''),
      ),
    );
    li.appendChild(text);
    list.appendChild(li);
  }
  box.appendChild(list);

  const ids = best.map((p) => p.object.id);
  const already = ids.length === picks.size && ids.every((id) => picks.has(id));
  if (!already && canEdit && h.onSetCamp) {
    const tick = el('button', 'btn btn--sm btn--gold', best.length === 1 ? 'Tick it' : 'Tick these ' + best.length);
    tick.title = 'Replaces what is ticked now';
    tick.addEventListener('click', () => h.onSetCamp?.(ids));
    box.appendChild(tick);
  }
  box.appendChild(
    el('p', 'drawer__hint', 'Ranked by who is in the raid, with the same rough weights the planner uses for seating.'),
  );
  return box;
}

/** What one object would do for this raid, in a sentence. */
function partnerLine(object: CampObject, coverage: Coverage, picked: boolean): { text: string; cls: string } {
  if (!object.replaces) {
    return object.id === 'camp-tent'
      ? { text: 'Rested experience. No class buff does this.', cls: 'camp__partner' }
      : { text: 'A vendor. No buff.', cls: 'camp__partner' };
  }
  const name = effectById(object.replaces)?.name ?? object.replaces;
  const cov = coverage.byEffect.get(object.replaces);
  if (cov && cov.providers.length) {
    const who = cov.providers.map((p) => p.name).join(', ');
    return {
      text: (picked ? 'Wasted: ' : 'Not needed: ') + who + (cov.providers.length === 1 ? ' brings ' : ' bring ') + name + '.',
      cls: 'camp__partner camp__partner--wasted',
    };
  }
  if (picked) return { text: 'Covers ' + name + ' for the whole raid.', cls: 'camp__partner camp__partner--covers' };
  return { text: 'Stands in for ' + name + '. Nobody here brings it.', cls: 'camp__partner camp__partner--gap' };
}

export function renderCampPanel(view: CampPanelView, h: RaidHandlers): HTMLElement {
  const { coverage } = view;
  const picks = new Set(cleanCampPicks(view.roster.settings.camp));
  const best = bestCampObjects(view.roster, coverage, BASIC_CAMPFIRE_SLOTS);
  const open = campOpen ?? (picks.size > 0 || best.length > 0);

  const panel = el('section', 'panel camp-panel');

  const head = el('button', 'panel__head camp-panel__head');
  head.setAttribute('aria-expanded', String(open));
  head.appendChild(el('span', '', 'Camp'));
  const count = el('span', 'panel__count');
  const over = picks.size > BASIC_CAMPFIRE_SLOTS;
  count.appendChild(
    el(
      'span',
      'tally' + (over ? ' tally--error' : picks.size ? ' tally--camp' : ''),
      picks.size + ' of ' + BASIC_CAMPFIRE_SLOTS,
    ),
  );
  head.appendChild(count);
  head.appendChild(el('span', 'camp-panel__chev', open ? '▾' : '▸'));
  panel.appendChild(head);

  const body = el('div', 'panel__body camp-panel__body');
  body.hidden = !open;
  head.addEventListener('click', () => {
    campOpen = body.hidden;
    body.hidden = !body.hidden;
    head.setAttribute('aria-expanded', String(!body.hidden));
    const chev = head.querySelector('.camp-panel__chev');
    if (chev) chev.textContent = body.hidden ? '▸' : '▾';
  });

  body.appendChild(
    el(
      'p',
      'drawer__hint',
      'A Basic Campfire holds three objects. Each one stands in for a class buff, and does nothing where a player already brings it.',
    ),
  );

  if (best.length) {
    body.appendChild(renderBest(best, picks, view.canEdit, h));
  } else if (coverage.playerCount) {
    body.appendChild(
      el('p', 'drawer__hint', 'Your classes already bring every buff a camp object stands in for. A Camp Tent or a Reagent Bot is all a fire adds.'),
    );
  }

  body.appendChild(el('div', 'section-label camp__all', 'Every camp object'));

  for (const object of CAMP_OBJECTS) {
    const picked = picks.has(object.id);
    const row = el('label', 'camp' + (picked ? ' camp--on' : ''));
    row.dataset.camp = object.id;

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = picked;
    box.disabled = !view.canEdit || !h.onToggleCamp;
    box.setAttribute('aria-label', object.name);
    box.addEventListener('change', () => h.onToggleCamp?.(object.id, box.checked));
    row.appendChild(box);

    row.appendChild(iconImg(object.icon, '', 'camp__icon'));

    const mid = el('div', 'camp__mid');
    const top = el('div', 'camp__top');
    top.appendChild(el('span', 'camp__name', object.name));
    top.appendChild(el('span', 'tag', campSkillLabel(object)));
    mid.appendChild(top);

    const partner = partnerLine(object, coverage, picked);
    mid.appendChild(el('div', partner.cls, partner.text));

    if (object.text) mid.appendChild(el('div', 'buff__blurb camp__text', object.text));
    if (object.estimate) {
      const est = el(
        'div',
        'camp__est',
        (object.text ? 'At level 60 it gives ' : 'Not in Blizzard\'s list. Fan sites reading the beta client say ') +
          object.estimate.text + '. Not verified.',
      );
      est.title = 'Source: ' + object.estimate.source;
      mid.appendChild(est);
    }
    row.appendChild(mid);
    body.appendChild(row);
  }

  const foot = el('div', 'camp__foot');
  foot.appendChild(
    el(
      'p',
      'drawer__hint',
      'Anyone who sits at the fire for a minute gets every object\'s buff for an hour. All camp objects share one 1-hour cooldown. A Basic Campfire holds ' +
        BASIC_CAMPFIRE_SLOTS + ' objects, and cooks can build fires for ' + UPGRADED_CAMPFIRE_SLOTS.join(' and ') +
        '. The skill 140 and 300 objects go over the first one and keep its buff.',
    ),
  );
  const quote = el('p', 'drawer__hint');
  quote.append('Blizzard: "' + CAMP_EXCLUSIVE_QUOTE + '" ');
  const link = document.createElement('a');
  link.href = CAMP_SOURCE.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Recipe text from the 21 October post.';
  quote.appendChild(link);
  foot.appendChild(quote);
  foot.appendChild(
    el(
      'p',
      'drawer__hint camp__warn',
      CAMP_INSTANCE_NOTE + ' Classic world buffs in Forever say "No effect while in a raid instance", and nobody has checked camp buffs either way.',
    ),
  );
  body.appendChild(foot);

  panel.appendChild(body);
  return panel;
}
