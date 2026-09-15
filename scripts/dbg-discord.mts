import { emptyRoster, computeCoverage } from '../src/raid/engine';
import { createPlayer } from '../src/raid/loadout';
import { asDiscordMessage } from '../src/raid/export';
import type { ClassId } from '../src/shared/classes';

const roster = emptyRoster(40);
const comp: Array<[ClassId, number]> = [
  ['warrior', 163], ['paladin', 383], ['druid', 281], ['rogue', 181], ['rogue', 181],
  ['warrior', 163], ['warrior', 161], ['warrior', 164], ['shaman', 263], ['rogue', 182],
  ['hunter', 363], ['hunter', 361], ['mage', 61], ['mage', 61], ['priest', 201],
  ['priest', 202], ['priest', 202], ['druid', 282], ['shaman', 262], ['paladin', 382],
];
comp.forEach(([c, s], i) => { roster.groups[Math.floor(i / 5)]![i % 5] = createPlayer(c, s); });

console.log(asDiscordMessage(roster, computeCoverage(roster), 'https://example.test/raid.html'));
