/**
 * A small language for saying when to press something.
 *
 * `rage > 45`. `buff.flurry.up and target_health_pct < 0.2`. That is the whole
 * of it: compare a variable to a number, join them with and, or and not, and
 * use brackets when the order matters.
 *
 * It is deliberately not SimulationCraft. Action lists, variables, pooling and
 * call_action_list cover the last tenth of what a rotation can express and cost
 * ten times the code, and every one of them can arrive later as another
 * variable or another kind of entry without changing anything written before.
 * What this buys is the part people actually want: moving a line up, changing
 * the number on it, and seeing what that did.
 *
 * A name that does not exist is an error that says what does, because the
 * difference between a rotation that is wrong and a rotation that silently
 * never fires is the difference between a tool and a trap.
 */

import type { RotationCtx } from './rotation';

/* ------------------------------------------------------------------ tokens */

type Token =
  | { kind: 'name'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; text: string }
  | { kind: 'punct'; text: '(' | ')' };

const OPERATORS = ['>=', '<=', '!=', '>', '<', '='];

export class AplError extends Error {}

function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;

  while (at < text.length) {
    const char = text[at]!;

    if (/\s/.test(char)) {
      at += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ kind: 'punct', text: char });
      at += 1;
      continue;
    }

    const operator = OPERATORS.find((op) => text.startsWith(op, at));
    if (operator) {
      tokens.push({ kind: 'op', text: operator });
      at += operator.length;
      continue;
    }

    const number = /^\d+(\.\d+)?/.exec(text.slice(at));
    if (number) {
      tokens.push({ kind: 'number', value: Number(number[0]) });
      at += number[0].length;
      continue;
    }

    const name = /^[a-zA-Z_][a-zA-Z0-9_.-]*/.exec(text.slice(at));
    if (name) {
      tokens.push({ kind: 'name', text: name[0] });
      at += name[0].length;
      continue;
    }

    throw new AplError('I do not know what to do with "' + char + '" here.');
  }

  return tokens;
}

/* ------------------------------------------------------------------- shape */

export type Cond =
  | { kind: 'compare'; name: string; op: string; value: number }
  | { kind: 'truthy'; name: string }
  | { kind: 'and'; left: Cond; right: Cond }
  | { kind: 'or'; left: Cond; right: Cond }
  | { kind: 'not'; inner: Cond };

/** Reads a condition, or says why it could not. */
export function parse(text: string): Cond {
  const tokens = tokenise(text);
  if (!tokens.length) throw new AplError('There is no condition here.');

  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];

  function expression(): Cond {
    let left = conjunction();
    while (peek()?.kind === 'name' && (peek() as { text: string }).text === 'or') {
      take();
      left = { kind: 'or', left, right: conjunction() };
    }
    return left;
  }

  function conjunction(): Cond {
    let left = unary();
    while (peek()?.kind === 'name' && (peek() as { text: string }).text === 'and') {
      take();
      left = { kind: 'and', left, right: unary() };
    }
    return left;
  }

  function unary(): Cond {
    const next = peek();
    if (next?.kind === 'name' && next.text === 'not') {
      take();
      return { kind: 'not', inner: unary() };
    }
    return primary();
  }

  function primary(): Cond {
    const next = take();
    if (!next) throw new AplError('The condition stops before it says anything.');

    if (next.kind === 'punct' && next.text === '(') {
      const inner = expression();
      const close = take();
      if (!close || close.kind !== 'punct' || close.text !== ')') {
        throw new AplError('A bracket was opened and never closed.');
      }
      return inner;
    }

    if (next.kind !== 'name') {
      throw new AplError('A condition starts with something to look at, not a number.');
    }

    const operator = peek();
    if (operator?.kind === 'op') {
      take();
      const value = take();
      if (!value || value.kind !== 'number') {
        throw new AplError('"' + next.text + ' ' + operator.text + '" needs a number after it.');
      }
      return { kind: 'compare', name: next.text, op: operator.text, value: value.value };
    }

    return { kind: 'truthy', name: next.text };
  }

  const condition = expression();
  if (at < tokens.length) {
    throw new AplError('There is something after the end of the condition that I cannot read.');
  }
  return condition;
}

/* --------------------------------------------------------------- variables */

export type Reader = (ctx: RotationCtx) => number;

/** Everything a condition may look at, other than the ones with a name in them. */
export function plainVariables(): Record<string, Reader> {
  return {
    rage: (ctx) => ctx.rage,
    energy: (ctx) => ctx.energy,
    combo: (ctx) => ctx.comboPoints,
    mana_pct: (ctx) => ctx.manaPct,
    time: (ctx) => ctx.now,
    time_left: (ctx) => ctx.timeLeft,
    target_health_pct: (ctx) => ctx.targetHealthPct,
    targets: (ctx) => ctx.targets,
  };
}

/** The names a reader can be built for, for an error that helps. */
export function variableNames(): string[] {
  return [
    ...Object.keys(plainVariables()),
    'buff.<name>.up', 'buff.<name>.remains', 'buff.<name>.stacks',
    'debuff.<name>.up', 'debuff.<name>.remains', 'debuff.<name>.stacks',
    'cooldown.<name>.ready', 'cooldown.<name>.remains',
    'swing.main.remains', 'swing.off.remains',
    'talent.<name>',
  ];
}

export interface CompileOptions {
  /** Talent name to rank, for talent.<name>. */
  talents?: Record<string, number>;
}

/** Turns one name into something that reads a number out of the fight. */
function readerFor(name: string, opts: CompileOptions): Reader {
  const plain = plainVariables()[name];
  if (plain) return plain;

  const parts = name.split('.');

  if (parts[0] === 'buff' && parts.length === 3) {
    const id = parts[1]!;
    if (parts[2] === 'up') return (ctx) => (ctx.has(id) ? 1 : 0);
    if (parts[2] === 'down') return (ctx) => (ctx.has(id) ? 0 : 1);
    if (parts[2] === 'remains') return (ctx) => ctx.remaining(id);
    if (parts[2] === 'stacks') return (ctx) => ctx.stacks(id);
  }

  if (parts[0] === 'debuff' && parts.length === 3) {
    const id = parts[1]!;
    if (parts[2] === 'up') return (ctx) => (ctx.onTarget(id) ? 1 : 0);
    if (parts[2] === 'down') return (ctx) => (ctx.onTarget(id) ? 0 : 1);
    if (parts[2] === 'remains') return (ctx) => ctx.remainingOnTarget(id);
    if (parts[2] === 'stacks') return (ctx) => ctx.targetStacks(id);
  }

  if (parts[0] === 'cooldown' && parts.length === 3) {
    const id = parts[1]!;
    if (parts[2] === 'ready') return (ctx) => (ctx.cooldownLeft(id) <= 0 ? 1 : 0);
    if (parts[2] === 'remains') return (ctx) => ctx.cooldownLeft(id);
  }

  if (parts[0] === 'swing' && parts.length === 3 && parts[2] === 'remains') {
    const hand = parts[1] === 'off' ? 'off' : 'main';
    return (ctx) => {
      const left = ctx.swingIn(hand);
      return Number.isFinite(left) ? left : 999;
    };
  }

  if (parts[0] === 'talent' && parts.length === 2) {
    // Talents are known when the rotation is built and never change after, so
    // this is a number rather than something read every time round the loop.
    const rank = rankOf(parts[1]!, opts.talents ?? {});
    return () => rank;
  }

  throw new AplError(
    '"' + name + '" is not something I can look at. What there is: ' + variableNames().join(', ') + '.',
  );
}

/** Matches a talent by its name with the dashes and the case taken out. */
function rankOf(name: string, talents: Record<string, number>): number {
  const wanted = name.replace(/[-_]/g, ' ').toLowerCase();
  for (const [talent, rank] of Object.entries(talents)) {
    if (talent.toLowerCase() === wanted) return rank;
  }
  return 0;
}

/**
 * Turns a condition into a closure, once, before the fight starts.
 *
 * The hot loop calls the closure and never sees the text again, which is the
 * only reason a language here is affordable at all.
 */
export function compile(cond: Cond, opts: CompileOptions = {}): (ctx: RotationCtx) => boolean {
  switch (cond.kind) {
    case 'and': {
      const left = compile(cond.left, opts);
      const right = compile(cond.right, opts);
      return (ctx) => left(ctx) && right(ctx);
    }
    case 'or': {
      const left = compile(cond.left, opts);
      const right = compile(cond.right, opts);
      return (ctx) => left(ctx) || right(ctx);
    }
    case 'not': {
      const inner = compile(cond.inner, opts);
      return (ctx) => !inner(ctx);
    }
    case 'truthy': {
      const read = readerFor(cond.name, opts);
      return (ctx) => read(ctx) > 0;
    }
    case 'compare': {
      const read = readerFor(cond.name, opts);
      const value = cond.value;
      switch (cond.op) {
        case '>': return (ctx) => read(ctx) > value;
        case '<': return (ctx) => read(ctx) < value;
        case '>=': return (ctx) => read(ctx) >= value;
        case '<=': return (ctx) => read(ctx) <= value;
        case '=': return (ctx) => read(ctx) === value;
        case '!=': return (ctx) => read(ctx) !== value;
        default: throw new AplError('I do not know the comparison "' + cond.op + '".');
      }
    }
  }
}

/** Reads and compiles in one go, which is what a rotation actually wants. */
export function condition(
  text: string,
  opts: CompileOptions = {},
): (ctx: RotationCtx) => boolean {
  return compile(parse(text), opts);
}

/** Whether a line reads, and what is wrong with it if not. */
export function check(text: string, opts: CompileOptions = {}): string | null {
  if (!text.trim()) return null;
  try {
    condition(text, opts);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
