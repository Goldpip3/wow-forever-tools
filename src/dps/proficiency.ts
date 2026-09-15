/**
 * What each class can actually wear and swing, so the gear list does not offer a
 * mage a breastplate it found in the bank.
 *
 * These are the Classic level-60 proficiencies. Forever has not confirmed any
 * changes, so treat the table as unverified: if a class picks up a new weapon
 * line, this is the only file that needs editing.
 */

import type { ClassId } from '../shared/classes';
import type { ItemRef } from './export-format';
import { slotsFor } from './export-format';

/** Armor subtypes, as GetItemInfo reports them. */
const ARMOR: Record<ClassId, string[]> = {
  warrior: ['cloth', 'leather', 'mail', 'plate', 'shields'],
  paladin: ['cloth', 'leather', 'mail', 'plate', 'shields', 'librams'],
  hunter: ['cloth', 'leather', 'mail'],
  rogue: ['cloth', 'leather'],
  priest: ['cloth'],
  shaman: ['cloth', 'leather', 'mail', 'shields', 'totems'],
  mage: ['cloth'],
  warlock: ['cloth'],
  druid: ['cloth', 'leather', 'idols'],
};

/** Weapon subtypes, as GetItemInfo reports them. */
const WEAPONS: Record<ClassId, string[]> = {
  warrior: [
    'one-handed axes', 'two-handed axes', 'one-handed maces', 'two-handed maces',
    'one-handed swords', 'two-handed swords', 'polearms', 'staves', 'daggers',
    'fist weapons', 'bows', 'crossbows', 'guns', 'thrown',
  ],
  paladin: [
    'one-handed axes', 'two-handed axes', 'one-handed maces', 'two-handed maces',
    'one-handed swords', 'two-handed swords', 'polearms',
  ],
  hunter: [
    'one-handed axes', 'two-handed axes', 'one-handed swords', 'two-handed swords',
    'polearms', 'staves', 'daggers', 'fist weapons', 'bows', 'crossbows', 'guns', 'thrown',
  ],
  rogue: [
    'daggers', 'fist weapons', 'one-handed maces', 'one-handed swords',
    'bows', 'crossbows', 'guns', 'thrown',
  ],
  priest: ['daggers', 'one-handed maces', 'staves', 'wands'],
  shaman: [
    'one-handed axes', 'two-handed axes', 'one-handed maces', 'two-handed maces',
    'staves', 'daggers', 'fist weapons',
  ],
  mage: ['daggers', 'one-handed swords', 'staves', 'wands'],
  warlock: ['daggers', 'one-handed swords', 'staves', 'wands'],
  druid: ['daggers', 'fist weapons', 'one-handed maces', 'two-handed maces', 'staves', 'polearms'],
};

/**
 * Slots whose items are not armor at all. In Classic a cloak reports the Cloth
 * subtype and a ring reports Miscellaneous, so neither can be judged by subtype.
 */
const NOT_ARMOR = new Set(['neck', 'finger1', 'finger2', 'trinket1', 'trinket2', 'back']);

const WEAPON_EQUIP_LOCS = new Set([
  'INVTYPE_WEAPON', 'INVTYPE_2HWEAPON', 'INVTYPE_WEAPONMAINHAND',
  'INVTYPE_WEAPONOFFHAND', 'INVTYPE_RANGED', 'INVTYPE_RANGEDRIGHT', 'INVTYPE_THROWN',
]);

export interface ProficiencyVerdict {
  usable: boolean;
  /** Why not, in the words the skipped list shows. */
  reason?: string;
}

/**
 * Whether a class can equip an item. Anything the table cannot judge is allowed
 * through: a wrong keep is easier to spot in the gear list than a silent drop.
 */
export function canUse(classId: ClassId, item: ItemRef): ProficiencyVerdict {
  const slots = slotsFor(item.equipLoc);
  if (!slots.length) return { usable: false, reason: 'not a gear slot the site tracks' };

  const loc = (item.equipLoc ?? '').toUpperCase();
  const subType = (item.subType ?? '').trim().toLowerCase();
  if (!subType) return { usable: true };

  if (WEAPON_EQUIP_LOCS.has(loc)) {
    if (!WEAPONS[classId].includes(subType)) {
      return { usable: false, reason: 'a ' + classId + ' cannot use ' + (item.subType ?? subType) };
    }
    return { usable: true };
  }

  // Held-in-off-hand items and shields share a slot but not a rule.
  if (loc === 'INVTYPE_SHIELD') {
    if (!ARMOR[classId].includes('shields')) {
      return { usable: false, reason: 'a ' + classId + ' cannot use shields' };
    }
    return { usable: true };
  }
  if (loc === 'INVTYPE_HOLDABLE') return { usable: true };

  if (slots.every((slot) => NOT_ARMOR.has(slot))) return { usable: true };

  if (!ARMOR[classId].includes(subType)) {
    return { usable: false, reason: 'a ' + classId + ' cannot wear ' + (item.subType ?? subType) };
  }
  return { usable: true };
}
