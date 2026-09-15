import type { Coverage, Roster } from './types';
import { activeGroupCount, playersInRaid, specLabel } from './engine';
import { encodeRoster } from './codec';
import { ROLE_LABEL, ROLE_ORDER, CLASSES, roleOf } from '../shared/classes';
import { overview, profileGroups, raidScore, suggestSwaps } from './suggestions';
import { CATEGORIES } from './categories';

/**
 * A stable, machine-readable view of a roster. This is the shape a Discord bot
 * or any other tool should consume: it never changes shape as the UI does, and
 * every id here matches the ids in src/raid/effects.
 */
export interface RosterExport {
  version: 1;
  generated: string;
  /** Paste into the planner to reopen this exact roster. */
  link: string;
  code: string;
  size: number;
  players: Array<{
    name: string;
    class: string;
    spec: string;
    role: string;
    group: number;
    loadout: Record<string, string[]>;
  }>;
  roles: Record<string, number>;
  buffs: {
    covered: Array<{ id: string; name: string; scope: string; providers: string[] }>;
    missing: Array<{ id: string; name: string; scope: string }>;
  };
  debuffs: {
    used: number;
    cap: number;
    onBoss: Array<{ id: string; name: string; providers: string[] }>;
  };
  categories: Array<{ id: string; name: string; meta: string; providers: number }>;
  warnings: Array<{ level: string; title: string; detail: string }>;
  suggestions: Array<{ kind: string; title: string; detail: string; gain: number }>;
  score: number;
}

export function buildExport(roster: Roster, coverage: Coverage, origin?: string): RosterExport {
  const code = encodeRoster(roster);
  const base = origin ?? (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  const view = overview(roster);
  const profiles = profileGroups(roster, coverage);

  const players = playersInRaid(roster).map((p) => {
    const group = roster.groups.findIndex((g) => g.some((slot) => slot?.id === p.id));
    return {
      name: p.name,
      class: CLASSES[p.classId].name,
      spec: specLabel(p),
      role: ROLE_LABEL[roleOf(p)],
      group: group + 1,
      loadout: p.loadout,
    };
  });

  const covered: RosterExport['buffs']['covered'] = [];
  const missing: RosterExport['buffs']['missing'] = [];
  const onBoss: RosterExport['debuffs']['onBoss'] = [];

  for (const cov of coverage.byEffect.values()) {
    const row = {
      id: cov.effect.id,
      name: cov.effect.name,
      scope: cov.effect.scope,
      providers: cov.providers.map((p) => p.name),
    };
    if (cov.effect.scope === 'target' && cov.covered) {
      onBoss.push({ id: row.id, name: row.name, providers: row.providers });
    }
    if (cov.effect.kind === 'buff' || cov.effect.kind === 'debuff') {
      if (cov.covered) covered.push(row);
      else missing.push({ id: row.id, name: row.name, scope: row.scope });
    }
  }

  const roles: Record<string, number> = {};
  for (const bucket of ROLE_ORDER) roles[ROLE_LABEL[bucket]] = view.counts[bucket];

  return {
    version: 1,
    generated: new Date().toISOString(),
    link: base + '#' + code,
    code,
    size: roster.size,
    players,
    roles,
    buffs: { covered, missing },
    debuffs: { used: coverage.debuffSlotsUsed, cap: coverage.debuffCap, onBoss },
    categories: CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      meta: c.meta,
      providers: coverage.categoryCounts.get(c.id) ?? 0,
    })),
    warnings: coverage.warnings.map((w) => ({ level: w.level, title: w.title, detail: w.detail })),
    suggestions: suggestSwaps(roster, coverage, 5).map((s) => ({
      kind: s.kind,
      title: s.title,
      detail: s.detail,
      gain: s.gain,
    })),
    score: raidScore(roster, profiles),
  };
}

/** A compact block that reads well pasted into Discord. */
export function asDiscordMessage(roster: Roster, coverage: Coverage, origin?: string): string {
  const data = buildExport(roster, coverage, origin);
  const lines: string[] = [];
  const active = activeGroupCount(roster.size);

  lines.push('**WoW Forever raid composition**');
  lines.push(
    data.players.length + '/' + roster.size + ' seats  ·  ' +
      Object.entries(data.roles)
        .filter(([, n]) => n > 0)
        .map(([role, n]) => n + ' ' + role)
        .join(', '),
  );
  lines.push('');

  for (let g = 0; g < active; g += 1) {
    const members = (roster.groups[g] ?? [])
      .filter(Boolean)
      .map((p) => p!.name + ' (' + specLabel(p!) + ')');
    if (!members.length) continue;
    lines.push('**Group ' + (g + 1) + '**  ' + members.join(', '));
  }

  lines.push('');
  lines.push(
    data.debuffs.cap > 0
      ? '**Debuffs on the target** ' + data.debuffs.used + '/' + data.debuffs.cap
      : '**Debuffs on the target** ' + data.debuffs.used,
  );

  const missingBuffs = data.buffs.missing.filter((b) => b.scope === 'raid' || b.scope === 'party');
  if (missingBuffs.length) {
    lines.push(
      '**Missing** ' + missingBuffs.slice(0, 12).map((b) => b.name).join(', ') +
        (missingBuffs.length > 12 ? ' and ' + (missingBuffs.length - 12) + ' more' : ''),
    );
  }

  const errors = data.warnings.filter((w) => w.level !== 'info');
  if (errors.length) {
    lines.push('');
    lines.push('**Fix first**');
    for (const w of errors.slice(0, 5)) lines.push('• ' + w.title);
  }

  if (data.suggestions.length) {
    lines.push('');
    lines.push('**Suggested moves**');
    for (const s of data.suggestions.slice(0, 3)) lines.push('• ' + s.title);
  }

  lines.push('');
  lines.push(data.link);
  return lines.join('\n');
}
