/**
 * The Camp panel: every camp object, which class buff it stands in for, and whether this raid
 * needs it. Ticking one tells the planner the raid will sit at a fire with that object on it.
 */

import type { Coverage, Roster } from './types';
import type { RaidHandlers } from './render';
import { CAMP_INSTANCE_NOTE } from './render';
import { iconImg } from '../shared/icons';
import { effectById } from './effects/index';
import {
  BASIC_CAMPFIRE_SLOTS,
  CAMP_EXCLUSIVE_QUOTE,
  CAMP_OBJECTS,
  CAMP_SOURCE,
  UPGRADED_CAMPFIRE_SLOTS,
  campSkillLabel,
  campSuggestions,
  cleanCampPicks,
  withArticle,
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
  const suggestions = coverage.playerCount ? campSuggestions(coverage) : [];
  const open = campOpen ?? (picks.size > 0 || suggestions.length > 0);

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
      'Tick what your raid will put down at the fire. Each one stands in for a class buff nobody here brings.',
    ),
  );

  if (suggestions.length) {
    const list = el('ul', 'camp__suggest');
    for (const s of suggestions) {
      const object = withArticle(s.object.name) + ' (' + campSkillLabel(s.object) + ')';
      const text =
        s.state === 'missing'
          ? 'Nobody brings ' + s.effect.effect.name + '. ' + object + ' covers it at camp.'
          : s.effect.effect.name + ' is not assigned. ' +
            s.effect.possibleBy.map((p) => p.name).slice(0, 2).join(' or ') +
            ' could switch to it, or ' + object.charAt(0).toLowerCase() + object.slice(1) + ' covers it at camp.';
      list.appendChild(el('li', '', text));
    }
    body.appendChild(list);
  }

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
