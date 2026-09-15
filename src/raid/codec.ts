import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Player, Roster, RaidSize } from './types';
import { GROUP_COUNT, GROUP_SIZE } from './types';
import { DEFAULT_DEBUFF_CAP, emptyRoster } from './engine';
import { CLASS_IDS, specById, type Archetype, type ClassId } from '../shared/classes';
import { defaultLoadout, defaultTalentToggles } from './loadout';

/**
 * Rosters travel in the URL hash as compressed JSON. The compact shape keeps the
 * link short: players are tuples rather than objects.
 *
 *   [ version, size, debuffCap, slots[], bench[] ]
 *   slot  = null | [ groupIndex, slotIndex, ...player ]
 *   player = [ name, classId, specId, loadoutPairs, talentIds, unused, role? ]
 */

type PackedPlayer = [string, string, number, Array<[string, string[]]>, string[], string[], string?];
type PackedSlot = [number, number, ...PackedPlayer];
type Packed = [number, number, number, PackedSlot[], PackedPlayer[]];

const VERSION = 1;

function packPlayer(player: Player): PackedPlayer {
  const loadout: Array<[string, string[]]> = Object.entries(player.loadout)
    .filter(([, ids]) => ids.length > 0)
    .map(([group, ids]) => [group, ids]);
  const talents = Object.entries(player.talentToggles)
    .filter(([, on]) => on)
    .map(([id]) => id);
  // Slot 5 held damage-over-time picks, which are gone. It stays so links made
  // before that change still parse, with role in slot 6.
  const packed: PackedPlayer = [player.name, player.classId, player.specId, loadout, talents, []];
  if (player.role) packed[6] = player.role;
  return packed;
}

let unpackSeq = 0;

function unpackPlayer(packed: PackedPlayer): Player | null {
  const [name, classId, specId, loadout, talents, , role] = packed;
  if (!CLASS_IDS.includes(classId as ClassId)) return null;
  if (!specById(specId)) return null;
  unpackSeq += 1;
  const loadoutMap: Record<string, string[]> = {};
  for (const [group, ids] of loadout ?? []) loadoutMap[group] = [...ids];
  const toggles: Record<string, boolean> = {};
  for (const id of talents ?? []) toggles[id] = true;
  const ROLES = ['tank', 'melee', 'ranged-physical', 'caster', 'healer'];
  return {
    id: 'u' + Date.now().toString(36) + unpackSeq.toString(36),
    name: String(name ?? ''),
    classId: classId as ClassId,
    specId,
    ...(role && ROLES.includes(role) ? { role: role as Archetype } : {}),
    loadout: loadoutMap,
    talentToggles: toggles,
  };
}

export function packRoster(roster: Roster): Packed {
  const slots: PackedSlot[] = [];
  roster.groups.forEach((group, g) => {
    group.forEach((player, s) => {
      if (player) slots.push([g, s, ...packPlayer(player)]);
    });
  });
  return [
    VERSION,
    roster.size,
    roster.settings.debuffCap ?? DEFAULT_DEBUFF_CAP,
    slots,
    roster.bench.map(packPlayer),
  ];
}

export function unpackRoster(packed: Packed): Roster {
  const [, size, cap, slots, bench] = packed;
  const validSize: RaidSize = size === 10 || size === 20 ? size : 40;
  const roster = emptyRoster(validSize);
  roster.settings.debuffCap = Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DEBUFF_CAP;

  for (const slot of slots ?? []) {
    const [g, s, ...rest] = slot;
    if (g < 0 || g >= GROUP_COUNT || s < 0 || s >= GROUP_SIZE) continue;
    const player = unpackPlayer(rest as PackedPlayer);
    if (player) roster.groups[g]![s] = player;
  }
  for (const packedPlayer of bench ?? []) {
    const player = unpackPlayer(packedPlayer);
    if (player) roster.bench.push(player);
  }
  return roster;
}

export function encodeRoster(roster: Roster): string {
  return compressToEncodedURIComponent(JSON.stringify(packRoster(roster)));
}

export function decodeRoster(text: string): Roster | null {
  const clean = (text ?? '').replace(/^#/, '').trim();
  if (!clean) return null;
  try {
    const json = decompressFromEncodedURIComponent(clean);
    if (!json) return null;
    const parsed = JSON.parse(json) as Packed;
    if (!Array.isArray(parsed) || parsed[0] !== VERSION) return null;
    return unpackRoster(parsed);
  } catch {
    return null;
  }
}

/** Whether a roster has anyone in it, so an empty one can keep the URL clean. */
export function isEmptyRoster(roster: Roster): boolean {
  return roster.groups.every((g) => g.every((p) => !p)) && roster.bench.length === 0;
}

/** Reapplies the defaults for a spec, used when a player changes spec. */
export function resetPlayerToSpec(player: Player, specId: number): void {
  player.specId = specId;
  player.loadout = defaultLoadout(specId);
  player.talentToggles = defaultTalentToggles(specId);
}
