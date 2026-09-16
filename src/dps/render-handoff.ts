/**
 * The panel for a player sent over from the raid planner.
 *
 * It says what came across and what the gear page would do with it, and does nothing until
 * the button is pressed. What the simulator cannot model is listed by name rather than
 * dropped, so a raid that looks well buffed in the planner is not quietly less buffed here.
 */

import { CLASSES, specById, type ClassId } from '../shared/classes';
import { el } from './render';
import { buffById } from './data/buffs';
import type { HandoffPlan, PlannerHandoff } from './handoff';

export interface HandoffView {
  handoff: PlannerHandoff;
  /** Null until a character is loaded. */
  plan: HandoffPlan | null;
  /** The loaded character's spec, to say when it is not the planner's. */
  loadedSpecId: number | null;
  loadedClassId: string | null;
  /** 'melee' or 'caster', for saying who the left-out buffs are for. */
  role: string | null;
  applied: boolean;
  /** A character kept on this device that could be opened for it. */
  hasDraft: boolean;
}

export interface HandoffHandlers {
  onApply(): void;
  onDismiss(): void;
  onUseDraft(): void;
}

const ROLE_WORDS: Record<string, string> = { melee: 'a melee character', caster: 'a caster', '': 'this character' };

function specLabel(classId: string, specId: number): string {
  const cls = CLASSES[classId as ClassId];
  const spec = specById(specId);
  return (spec ? spec.name + ' ' : '') + (cls?.name ?? classId);
}

function listLine(label: string, names: string[]): HTMLElement {
  const p = el('p', 'drawer__hint');
  p.appendChild(el('strong', '', label + ' '));
  p.appendChild(document.createTextNode(names.join(', ') + '.'));
  return p;
}

export function renderHandoffPanel(view: HandoffView, h: HandoffHandlers): HTMLElement {
  const { handoff, plan } = view;
  const panel = el('section', 'panel');
  panel.appendChild(el('div', 'panel__head', 'From the raid planner'));
  const body = el('div', 'panel__body');

  body.appendChild(
    el(
      'p',
      '',
      // A planner player keeps its spec as its name until someone renames it; say it once.
      (handoff.name === specLabel(handoff.classId, handoff.specId)
        ? handoff.name
        : handoff.name + ', ' + specLabel(handoff.classId, handoff.specId)) + ', group ' + handoff.group + '.',
    ),
  );

  if (!plan) {
    body.appendChild(
      el('p', 'drawer__hint', 'Load a character below to see which of this raid’s buffs the simulator can use.'),
    );
    if (view.hasDraft) {
      const use = el('button', 'btn', 'Use your last character');
      use.addEventListener('click', h.onUseDraft);
      body.appendChild(use);
    }
  } else {
    if (view.loadedSpecId !== null && view.loadedSpecId !== handoff.specId) {
      body.appendChild(
        el(
          'p',
          'drawer__hint',
          'The planner has this player as ' + specLabel(handoff.classId, handoff.specId) +
            '. The character loaded is ' + specLabel(view.loadedClassId ?? handoff.classId, view.loadedSpecId) +
            ', and that is what is simulated.',
        ),
      );
    }
    const ticks = [...plan.apply.buffs, ...plan.apply.debuffs];
    if (ticks.length) body.appendChild(listLine('Would tick:', ticks.map(nameOf)));
    else body.appendChild(el('p', 'drawer__hint', 'Nothing this raid gives the player is something the simulator reads.'));
    if (plan.notForRole.length) {
      body.appendChild(listLine('Does nothing for ' + ROLE_WORDS[view.role ?? ''] + ', so stays off:', plan.notForRole));
    }
    if (plan.notSimulated.length) {
      body.appendChild(listLine('Not simulated, so left out of the figure:', plan.notSimulated));
    }
  }

  if (handoff.build) {
    body.appendChild(
      el(
        'p',
        'drawer__hint',
        'The talent link from the planner is not applied. The sheet your export carries was measured ' +
          'with the talents you have, so those are the talents simulated.',
      ),
    );
  }

  const actions = el('div', 'spec-picker');
  if (plan) {
    const apply = el('button', 'btn btn--gold', view.applied ? 'Ticked' : 'Tick these buffs');
    if (view.applied || !(plan.apply.buffs.length + plan.apply.debuffs.length)) apply.setAttribute('disabled', '');
    apply.title = 'Replaces the raid buffs and debuffs ticked below. Consumables stay as they are.';
    apply.addEventListener('click', h.onApply);
    actions.appendChild(apply);
  }
  const dismiss = el('button', 'btn', 'Dismiss');
  dismiss.addEventListener('click', h.onDismiss);
  actions.appendChild(dismiss);
  body.appendChild(actions);

  if (view.applied) {
    body.appendChild(
      el(
        'p',
        'drawer__hint',
        'Ticked. A buff that was already up when you exported is in the sheet, and is not added a second time.',
      ),
    );
  }

  panel.appendChild(body);
  return panel;
}


function nameOf(id: string): string {
  return buffById(id)?.name ?? id;
}
