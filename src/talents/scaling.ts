/**
 * Which number in a talent's sentence moves when you spend another point.
 *
 * Both tables below are empty, and that is the finished state rather than a stub.
 *
 * The demo showed one rank of each talent and no more. Where that rank's text carried a
 * single number there was nothing to work out, and `build.ts` scaled it. Where the
 * sentence carried two or more, the data did not say which one moved, so the calculator
 * showed rank 1's text at every rank: Restorative Totems read "Mana Spring by 5% and
 * Healing Stream by 10%" whether you had one point in it or five. This file answered that
 * question for 59 talents and admitted defeat on 6 more.
 *
 * Build 1.60.1.69876 carries real text for every rank of all 359 multi-rank talents, so
 * nothing consults either table any more and no tooltip is an estimate. The entries were
 * removed rather than left to rot, because a curated index that disagrees with the game is
 * worse than none.
 *
 * The machinery in `build.ts` is deliberately left in place. Talents have moved between
 * beta builds, and if a later one goes back to shipping a single rank, filling these
 * tables in again is the whole fix.
 *
 * Indices count the numbers in the rank-1 text in the order they appear, from zero, the
 * same as the upstream `scaleIdx`. Upstream `scaleIdx` always wins over anything here.
 */

/** Keyed by `Class|Talent name`. Empty while the data carries every rank. */
export const SCALE_INDICES: Record<string, number[]> = {};

/**
 * Talents left alone on purpose, with why.
 *
 * Empty for the same reason as the table above. The six that used to sit here — Warrior
 * Dual Wield Specialization and Master of Defense, Shaman Improved Stormstrike, Warlock
 * Soul Harvesting and Decimation, and Druid Primal Fury — are now read from the game
 * rather than guessed at.
 */
export const AMBIGUOUS: Record<string, string> = {};
