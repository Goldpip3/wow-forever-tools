/**
 * What the reader has to know before trusting the number.
 *
 * Every note on the results panel is assembled here, in one order, so a new
 * spec cannot quietly forget to mention what it left out. A note exists only
 * when something is missing or estimated: there is no line saying everything
 * went fine, because that is what no note means.
 */

import * as K from '../data/combat-constants';
import { buffById } from '../data/buffs';
import type { SpecModule } from './spec';
import type { SimConfig, TargetState } from './types';

export function buildNotes(
  config: SimConfig,
  spec: SpecModule,
  target: TargetState,
): string[] {
  const notes: string[] = [K.BASELINE_NOTE];

  for (const note of spec.notes ?? []) notes.push(note);
  if (spec.forever.note) notes.push(spec.forever.note);

  // Talents the character actually took that the spec does not model. A build
  // is never quietly worth more than the number says.
  const missed: string[] = [];
  for (const [name, why] of Object.entries(spec.unmodelledTalents ?? {})) {
    if ((config.talents[name] ?? 0) > 0) missed.push(name + ': ' + why);
  }
  for (const line of missed) notes.push(line);

  // Anything ticked in the fight settings that pays out nothing.
  const inert: string[] = [];
  for (const id of [...config.fight.buffs, ...config.fight.consumables, ...config.fight.debuffs]) {
    const buff = buffById(id);
    if (!buff) continue;
    const hasStats = Object.keys(buff.stats).length > 0;
    const hasMultiplier = !!buff.multipliers || !!buff.damageTaken || !!buff.targetArmor;
    if (!hasStats && !hasMultiplier && buff.forever.note) inert.push(buff.name);
  }
  if (inert.length) {
    notes.push(
      inert.join(' and ') + ' ' + (inert.length === 1 ? 'is' : 'are') +
        ' ticked but changes nothing here. The reason is on the checkbox.',
    );
  }

  if (config.fight.targets && config.fight.targets > 1) {
    notes.push(
      'Extra targets only reach abilities that say they hit more than one, and they are ' +
        'assumed to be standing in range for the whole fight.',
    );
  }

  if (target.armor > 0 && spec.resource === 'rage') {
    notes.push(
      'The boss is carrying ' + Math.round(target.armor) + ' armor after the debuffs you ticked, ' +
        'which is a guess unless you set it yourself.',
    );
  }

  if (spec.spells.some((s) => s.execute)) {
    notes.push(
      'The boss loses health evenly over the fight, so Execute range is the last fifth of it. ' +
        'A real pull does not go down at a steady rate.',
    );
  }

  if (config.fight.incoming?.damagePerSecond) {
    notes.push(
      'Rage from damage taken assumes ' + Math.round(config.fight.incoming.damagePerSecond) +
        ' arriving every second and nothing avoided.',
    );
  }

  // Keep the first of each, so a spec repeating the baseline note cannot make
  // the panel say the same thing twice.
  return [...new Set(notes)];
}
