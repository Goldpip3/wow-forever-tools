import { describe, expect, it } from 'vitest';

import { candidatesFor } from '../src/dps/gear';
import {
  FINALISTS, TOP_GEAR_CAP, bestLoadouts, enumerate, estimate, loadoutScore, planTopGear, swapsIn, valid, type SlotChoices,
} from '../src/dps/topgear';
import { runTopGear } from '../src/dps/client';
import { parseCharacterExport } from '../src/dps/importer';
import { SAMPLE_WARRIOR_EXPORT } from '../src/dps/sample-warrior';
import type { ItemLocation, ItemRef, Slot } from '../src/dps/export-format';
import type { Character } from '../src/dps/types';

const sample = parseCharacterExport(SAMPLE_WARRIOR_EXPORT).character!;

function ring(id: number, location: ItemLocation, over: Partial<ItemRef> = {}): ItemRef {
  return { id, name: 'Ring ' + id, equipLoc: 'INVTYPE_FINGER', quality: 3, stats: { strength: id / 10 }, location, ...over };
}
const worn = (slot: Slot): ItemLocation => ({ where: 'equipped', slot });
const bag = (index: number): ItemLocation => ({ where: 'bag', bag: 0, index });

/** The sample warrior with only the rings replaced. */
function wearing(equipped: Partial<Record<Slot, ItemRef>>, bags: ItemRef[] = []): Character {
  const source = { ...sample.source, equipped: { ...sample.source.equipped, ...equipped } };
  const others = sample.owned.filter((i) => i.equipLoc !== 'INVTYPE_FINGER');
  return { ...sample, source, owned: [...others, ...Object.values(equipped), ...bags] };
}

const pairsOf = (choices: SlotChoices[]) =>
  [...enumerate(choices)].map((l) => [l.finger1?.id ?? null, l.finger2?.id ?? null].join('/'));

describe('pairs of rings', () => {
  it('keeps the worn pair when its other arrangement is not on offer', () => {
    const r200 = ring(200, worn('finger1'));
    const r100 = ring(100, worn('finger2'));
    const choices: SlotChoices[] = [
      { slot: 'finger1', options: [r200, ring(300, bag(0))] },
      { slot: 'finger2', options: [r100, ring(300, bag(1))] },
    ];
    const pairs = pairsOf(choices);
    expect(pairs).toContain('200/100');
    expect(pairs).toContain('300/100');
    expect(pairs).toContain('200/300');
    // Two copies of 300, one per finger, are two rings.
    expect(pairs).toContain('300/300');
  });

  it('runs a pair only once when both arrangements are on offer', () => {
    const a = ring(1, bag(0));
    const b = ring(2, bag(1));
    const pairs = pairsOf([
      { slot: 'finger1', options: [null, a, b] },
      { slot: 'finger2', options: [null, a, b] },
    ]);
    expect(pairs.filter((p) => p === '1/2' || p === '2/1')).toHaveLength(1);
    // The same ring cannot go on both fingers.
    expect(pairs).not.toContain('1/1');
  });

  it('wears two copies of a ring that is not unique, and not one ring twice', () => {
    const copyA = ring(7, bag(0));
    const copyB = ring(7, bag(1));
    const character = wearing({}, [copyA, copyB]);
    delete (character.source.equipped as Partial<Record<Slot, ItemRef>>).finger1;
    delete (character.source.equipped as Partial<Record<Slot, ItemRef>>).finger2;
    const plan = planTopGear(character, { strength: 1 }, 3);
    const loadouts = [...enumerate(plan.choices)];
    // Other slots multiply the loadouts, so count the distinct finger pairs.
    const both = new Set(
      loadouts
        .filter((l) => l.finger1?.id === 7 && l.finger2?.id === 7)
        .map((l) => JSON.stringify([l.finger1!.location, l.finger2!.location])),
    );
    expect(both.size).toBe(1);
    const [first, second] = JSON.parse([...both][0]!);
    expect(first).not.toEqual(second);
  });

  it('does not offer a second copy of exactly the ring already in the slot', () => {
    const on = ring(7, worn('finger1'));
    const character = wearing({ finger1: on, finger2: ring(8, worn('finger2')) }, [ring(7, bag(0))]);
    expect(candidatesFor(character, 'finger1').some((i) => i.id === 7)).toBe(false);
    // The other finger can still take it.
    expect(candidatesFor(character, 'finger2').some((i) => i.id === 7)).toBe(true);
  });

  it('never wears a unique ring twice, even two copies', () => {
    const pairs = pairsOf([
      { slot: 'finger1', options: [null, ring(9, bag(0), { unique: true })] },
      { slot: 'finger2', options: [null, ring(9, bag(1), { unique: true })] },
    ]);
    expect(pairs).not.toContain('9/9');
  });
});

describe('what counts as a swap', () => {
  const on = ring(50, worn('finger1'), { enchant: 0, suffix: 0 });
  const character = wearing({ finger1: on });

  it('the same ring with another enchant is a swap', () => {
    expect(swapsIn(character, { finger1: { ...on, enchant: 1887, location: bag(0) } })).toHaveLength(1);
  });

  it('the same ring with another suffix is a swap', () => {
    expect(swapsIn(character, { finger1: { ...on, suffix: 1200, location: bag(0) } })).toHaveLength(1);
  });

  it('exactly what is worn is not', () => {
    expect(swapsIn(character, { finger1: on })).toHaveLength(0);
  });
});

describe('two-handers and the off hand', () => {
  const twoHander: ItemRef = {
    id: 900, name: 'Big sword', equipLoc: 'INVTYPE_2HWEAPON', quality: 4, stats: {}, location: bag(3),
  };
  const shield: ItemRef = {
    id: 901, name: 'Shield', equipLoc: 'INVTYPE_SHIELD', quality: 3, stats: {}, location: worn('offhand'),
  };
  const character = wearing({ offhand: shield });

  it('allows a two-hander with the off hand emptied on purpose', () => {
    expect(valid(character, { mainhand: twoHander, offhand: null })).toBe(true);
  });

  it('refuses a two-hander next to the off hand still worn', () => {
    expect(valid(character, { mainhand: twoHander })).toBe(false);
  });
});

describe('a bank too big to try everything', () => {
  const LOCS = [
    'INVTYPE_HEAD', 'INVTYPE_NECK', 'INVTYPE_SHOULDER', 'INVTYPE_CLOAK', 'INVTYPE_CHEST',
    'INVTYPE_WRIST', 'INVTYPE_HAND', 'INVTYPE_WAIST', 'INVTYPE_LEGS', 'INVTYPE_FEET',
    'INVTYPE_FINGER', 'INVTYPE_TRINKET',
  ];

  /** Six spare pieces for every slot but the weapons: far more loadouts than anyone could run. */
  function hoarder(): Character {
    const spares: ItemRef[] = [];
    let index = 0;
    for (const equipLoc of LOCS) {
      for (let n = 1; n <= 6; n += 1) {
        index += 1;
        spares.push({
          id: 10000 + index, name: equipLoc + ' ' + n, equipLoc, quality: 3,
          stats: { strength: n * 3 + (index % 5) }, location: { where: 'bank', bag: -1, index },
        });
      }
    }
    return { ...sample, owned: [...sample.owned, ...spares] };
  }

  it('plans quickly and says it is capped instead of walking every loadout', () => {
    const began = Date.now();
    const plan = planTopGear(hoarder(), { strength: 1 }, 5);
    expect(Date.now() - began).toBeLessThan(2000);
    expect(plan.capped).toBe(true);
    expect(plan.combinations).toBe(TOP_GEAR_CAP);
  });

  it('keeps the best-scoring loadouts, best first, with what is worn among them', () => {
    const character = hoarder();
    const weights = { strength: 1 };
    const plan = planTopGear(character, weights, 5);
    const began = Date.now();
    const best = bestLoadouts(character, plan.choices, weights, TOP_GEAR_CAP);
    expect(Date.now() - began).toBeLessThan(3000);
    expect(best).toHaveLength(TOP_GEAR_CAP);
    const scores = best.map((l) => loadoutScore(character, l, weights));
    // Worn goes last when it had to be added; everything before it is in order.
    const ranked = best.filter((l) => swapsIn(character, l).length > 0).map((l) => loadoutScore(character, l, weights));
    for (let i = 1; i < ranked.length; i += 1) expect(ranked[i - 1]!).toBeGreaterThanOrEqual(ranked[i]!);
    expect(best.some((l) => swapsIn(character, l).length === 0)).toBe(true);
    expect(Math.max(...scores)).toBe(scores[0]);
  });

  it('agrees with trying everything when everything is few enough to try', () => {
    const character = hoarder();
    const weights = { strength: 1 };
    const choices = planTopGear(character, weights, 2).choices.slice(0, 5);
    const all = [...enumerate(choices)]
      .map((l) => loadoutScore(character, l, weights))
      .sort((a, b) => b - a);
    const best = bestLoadouts(character, choices, weights, 25);
    // The last place goes to what is worn when it did not score its way in.
    const wornAdded = swapsIn(character, best[best.length - 1]!).length === 0;
    const kept = (wornAdded ? best.slice(0, -1) : best)
      .map((l) => loadoutScore(character, l, weights))
      .sort((a, b) => b - a);
    expect(kept).toEqual(all.slice(0, kept.length));
  });
});

describe('the progress bar', () => {
  it('ends exactly at its total, rerun of what is worn included', async () => {
    let last = { done: 0, total: 0 };
    await runTopGear(sample, {
      duration: 60, iterations: 50, seed: 3,
      target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
      buffs: [], debuffs: [], consumables: [],
    }, { strength: 1, attackPower: 0.5 }, {
      perSlot: 1, iterations: 50, finalIterations: 50,
      onProgress: (done, total) => (last = { done, total }),
    });
    expect(last.total).toBeGreaterThan(0);
    expect(last.done).toBe(last.total);
  });
});

describe('what is worn stays in the run as itself', () => {
  it('keeps rings worn in reversed order, and drops only their mirror, when copies of both are owned', () => {
    const r300 = ring(300, worn('finger1'));
    const r100 = ring(100, worn('finger2'));
    // A spare of each in the bags, so the mirror arrangement can really be built.
    const character = wearing({ finger1: r300, finger2: r100 }, [ring(300, bag(0)), ring(100, bag(1))]);
    const plan = planTopGear(character, { strength: 1 }, 3);
    const fingers = new Map<string, number>();
    for (const l of enumerate(plan.choices)) {
      const key = (l.finger1?.id ?? '-') + '/' + (l.finger2?.id ?? '-');
      fingers.set(key, (fingers.get(key) ?? 0) + 1);
    }
    // Other slots multiply the count; what matters is which finger pairs appear.
    expect(fingers.has('300/100')).toBe(true);
    expect(fingers.has('100/300')).toBe(false);
    const unchanged = [...enumerate(plan.choices)].filter((l) => swapsIn(character, l).length === 0);
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0]!.finger1).toBe(r300);
    expect(unchanged[0]!.finger2).toBe(r100);
  });

  it('describes a ring moved to the other finger as the two changes it is', () => {
    const r300 = ring(300, worn('finger1'));
    const r100 = ring(100, worn('finger2'));
    const character = wearing({ finger1: r300, finger2: r100 });
    const swaps = swapsIn(character, { finger1: r100, finger2: r300 });
    expect(swaps.map((s) => s.slot + ':' + s.item!.id)).toEqual(['finger1:100', 'finger2:300']);
  });

  it('tells taking an item off from leaving the slot alone', () => {
    const r300 = ring(300, worn('finger1'));
    const character = wearing({ finger1: r300 });
    expect(swapsIn(character, { finger1: null })).toEqual([{ slot: 'finger1', item: null }]);
    expect(swapsIn(character, {})).toEqual([]);
  });
});

describe('bounded preparation, honest counts and progress', () => {
  const fightFor = (iterations: number) => ({
    duration: 60, iterations, seed: 3,
    target: { level: 63, armor: 0, resistance: 0, behind: true, canParry: false, canBlock: false },
    buffs: [], debuffs: [], consumables: [],
  });

  /** Eight spares for every non-weapon slot: far past the cap. */
  function bigBank(): Character {
    const spares: ItemRef[] = [];
    const locs = ['INVTYPE_HEAD', 'INVTYPE_NECK', 'INVTYPE_SHOULDER', 'INVTYPE_CLOAK', 'INVTYPE_CHEST',
      'INVTYPE_WRIST', 'INVTYPE_HAND', 'INVTYPE_WAIST', 'INVTYPE_LEGS', 'INVTYPE_FEET', 'INVTYPE_FINGER', 'INVTYPE_TRINKET'];
    let index = 0;
    for (const equipLoc of locs) {
      for (let n = 1; n <= 8; n += 1) {
        index += 1;
        spares.push({ id: 20000 + index, name: equipLoc + n, equipLoc, quality: 3, stats: { strength: (n * 7 + index) % 23 }, location: { where: 'bank', bag: -1, index } });
      }
    }
    return { ...sample, owned: [...sample.owned, ...spares] };
  }

  it('estimates both passes as they will run, divided among the workers', () => {
    const one = estimate({ combinations: 10, first: 300, final: 1000, msPerIteration: 1, workers: 1 });
    // (1 + 10) × 300 + (1 + 5) × 1000 = 9,300 ms of work.
    expect(one.seconds).toBeCloseTo(9.3, 6);
    expect(estimate({ combinations: 10, first: 300, final: 1000, msPerIteration: 1, workers: 4 }).seconds).toBeCloseTo(9.3 / 4, 6);
    // Two loadouts have two finalists, not five.
    expect(estimate({ combinations: 2, first: 300, final: 1000, msPerIteration: 1, workers: 1 }).seconds).toBeCloseTo((3 * 300 + 3 * 1000) / 1000, 6);
    expect(FINALISTS).toBe(5);
  });

  it('picks the same capped shortlist every time', () => {
    const character = bigBank();
    const weights = { strength: 1 };
    const a = planTopGear(character, weights, 5);
    const b = planTopGear(character, weights, 5);
    expect(a.capped).toBe(true);
    const ids = (loadouts: ReturnType<typeof bestLoadouts>) =>
      loadouts.map((l) => Object.entries(l).map(([slot, item]) => slot + '=' + (item ? item.id + '@' + item.location.index : '-')).join(','));
    expect(ids(bestLoadouts(character, a.choices, weights, TOP_GEAR_CAP)))
      .toEqual(ids(bestLoadouts(character, b.choices, weights, TOP_GEAR_CAP)));
  });

  it('stops while still preparing when cancelled, well before anything is simulated', async () => {
    const character = bigBank();
    const controller = new AbortController();
    const began = Date.now();
    let progressed = false;
    const run = runTopGear(character, fightFor(50), { strength: 1 }, {
      perSlot: 5, iterations: 50, finalIterations: 50,
      signal: controller.signal,
      onProgress: () => (progressed = true),
    });
    setTimeout(() => controller.abort(), 0);
    await expect(run).rejects.toThrow('cancelled');
    expect(progressed).toBe(false);
    expect(Date.now() - began).toBeLessThan(5000);
  });

  it('never runs past 100%, and ends on it, with fewer than five finalists', async () => {
    // Only one ring to try against what is worn: two loadouts, so two finalists.
    const on = ring(1, worn('finger1'));
    const character = wearing({ finger1: on }, [ring(2, bag(0))]);
    const lone = { ...character, owned: character.owned.filter((i) => i.equipLoc === 'INVTYPE_FINGER') };
    const plan = planTopGear(lone, { strength: 1 }, 1);
    expect(plan.combinations).toBeLessThan(FINALISTS);
    const seen: Array<[number, number]> = [];
    const result = await runTopGear(lone, fightFor(40), { strength: 1 }, {
      perSlot: 1, iterations: 50, finalIterations: 60,
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen.length).toBeGreaterThan(0);
    const total = seen[0]![1];
    for (const [done, t] of seen) {
      expect(t).toBe(total);
      expect(done).toBeLessThanOrEqual(total);
    }
    expect(seen[seen.length - 1]![0]).toBe(total);
    // What is worn and every loadout at 50, then what is worn and each finalist at 60.
    expect(total).toBe((1 + result.combinations) * 50 + (1 + Math.min(FINALISTS, result.combinations)) * 60);
    expect(result.capped).toBe(false);
  });
});

describe('a capped search whose best rings and trinkets are all in the bank', () => {
  it('still fills the shortlist with wearable loadouts, instead of only what is worn', () => {
    // The best-scoring options in every paired slot are bank items the export gave no bag
    // position for. Walking the fingers one at a time spent the whole budget on wearing
    // one of them twice and came back with a single loadout.
    const spares: ItemRef[] = [];
    let id = 30000;
    const locs = ['INVTYPE_HEAD', 'INVTYPE_NECK', 'INVTYPE_SHOULDER', 'INVTYPE_CLOAK', 'INVTYPE_CHEST',
      'INVTYPE_WRIST', 'INVTYPE_HAND', 'INVTYPE_WAIST', 'INVTYPE_LEGS', 'INVTYPE_FEET', 'INVTYPE_FINGER', 'INVTYPE_TRINKET'];
    for (const equipLoc of locs) {
      for (let n = 0; n < 8; n += 1) {
        id += 1;
        spares.push({ id, name: equipLoc + n, equipLoc, quality: 3, stats: { strength: 500 + n }, location: { where: 'bank' } });
      }
    }
    const character: Character = { ...sample, owned: [...sample.owned, ...spares] };
    const weights = { strength: 1 };
    const plan = planTopGear(character, weights, 5);
    expect(plan.capped).toBe(true);
    const best = bestLoadouts(character, plan.choices, weights, TOP_GEAR_CAP);
    expect(best).toHaveLength(TOP_GEAR_CAP);
    expect(best.filter((l) => swapsIn(character, l).length === 0)).toHaveLength(1);
    for (const l of best) {
      expect(l.finger1 && l.finger1 === l.finger2).toBeFalsy();
      expect(l.trinket1 && l.trinket1 === l.trinket2).toBeFalsy();
    }
    // Two different unplaced bank rings may be worn together.
    expect(best.some((l) => l.finger1?.location.where === 'bank' && l.finger2?.location.where === 'bank')).toBe(true);
  });
});
