import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Control characters in source have now cost two debugging sessions.
 *
 * Both times a word-boundary escape written through a shell into a code generator landed
 * in the file as a literal backspace byte, inside a regular expression. It is invisible in
 * an editor, invisible in a diff, and grep -P did not report it either. The expression
 * simply never matched and the branch never ran, while every reading of the code said it
 * should.
 *
 * The scan counts character codes rather than matching a pattern, because a pattern
 * written with escapes is exactly the thing that keeps going wrong.
 */
const ROOT = resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'dist', '.vite', 'public']);
const CHECKED = /\.(ts|tsx|js|mjs|css|html|md|json)$/;

/** Tab, newline and carriage return are the only ones that belong in source. */
const ALLOWED = new Set([9, 10, 13]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (CHECKED.test(entry)) out.push(full);
  }
  return out;
}

describe('source hygiene', () => {
  it('has no stray control characters in any source file', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = readFileSync(file, 'utf8');
      let line = 1;
      for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code === 10) line += 1;
        if (code >= 32 || ALLOWED.has(code)) continue;
        offenders.push(
          file.replace(ROOT, '.') + ':' + line + ' has character code ' + code,
        );
        break;
      }
    }
    expect(offenders).toEqual([]);
  });
});
