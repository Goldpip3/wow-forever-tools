import type { ClassicStatus, Talent } from './types';
import { rankText } from './build';

export const STATUS_LABEL: Record<ClassicStatus | 'removed', string> = {
  same: 'Unchanged from Classic',
  changed: 'Changed',
  moved: 'Moved',
  new: 'New in Forever',
  removed: 'Removed in Forever',
};

export const STATUS_SHORT: Record<ClassicStatus | 'removed', string> = {
  same: 'same',
  changed: 'changed',
  moved: 'moved',
  new: 'new',
  removed: 'removed',
};

export function statusOf(talent: Talent): ClassicStatus {
  return talent.classic?.status ?? 'same';
}

export function pill(status: ClassicStatus | 'removed'): HTMLElement {
  const el = document.createElement('span');
  el.className = 'pill pill--' + status;
  el.textContent = STATUS_SHORT[status];
  el.title = STATUS_LABEL[status];
  return el;
}

function line(cls: string, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return el;
}

export interface TipOptions {
  talent: Talent;
  rank: number;
  compare: boolean;
  /** Why the talent cannot take a point right now. */
  blocked?: string;
}

export function buildTalentTip(opts: TipOptions): HTMLElement {
  const { talent, rank, compare, blocked } = opts;
  const frag = document.createElement('div');

  frag.appendChild(line('tip__name', talent.name));

  const meta = document.createElement('div');
  meta.className = 'tip__rank';
  meta.textContent = 'Rank ' + Math.max(rank, 0) + '/' + talent.max;
  frag.appendChild(meta);

  if (talent.cost) frag.appendChild(line('tip__meta', talent.cost));
  if (talent.passive) frag.appendChild(line('tip__meta', 'Passive'));
  if (talent.reqText) frag.appendChild(line('tip__meta', talent.reqText));

  const shown = rank > 0 ? rank : 1;
  const current = rankText(talent, shown);
  const body = line('tip__body', current.text);
  if (rank === 0) body.classList.add('tip__body--preview');
  frag.appendChild(body);

  if (rank > 0 && rank < talent.max) {
    const next = rankText(talent, rank + 1);
    frag.appendChild(line('tip__next', 'Next rank: ' + next.text));
  }

  if (talent.complete === false) {
    frag.appendChild(
      line(
        'tip__est',
        'Estimated: the demo only showed some ranks, the rest were scaled from those.',
      ),
    );
  }

  if (blocked) frag.appendChild(line('tip__req', blocked));

  if (compare && talent.classic) {
    frag.appendChild(document.createElement('div')).className = 'tip__hr';
    const label = document.createElement('div');
    label.className = 'tip__classic-label';
    const span = document.createElement('span');
    span.textContent = 'In Classic';
    label.append(span, pill(talent.classic.status));
    frag.appendChild(label);

    if (talent.classic.renamed) {
      frag.appendChild(line('tip__note', 'Was called ' + talent.classic.renamed));
    }
    if (talent.classic.status === 'new') {
      frag.appendChild(line('tip__classic-text', 'This talent did not exist in Classic.'));
    } else {
      if (talent.classic.text) frag.appendChild(line('tip__classic-text', talent.classic.text));
      if (talent.classic.max && talent.classic.max !== talent.max) {
        frag.appendChild(line('tip__note', 'Classic maximum was ' + talent.classic.max + ' ranks.'));
      }
      if (talent.classic.moved || talent.classic.status === 'moved') {
        const from =
          talent.classic.tree && talent.classic.row
            ? talent.classic.tree + ' row ' + talent.classic.row
            : 'a different spot';
        frag.appendChild(line('tip__note', 'Moved here from ' + from + '.'));
      }
    }
  }

  return frag;
}
