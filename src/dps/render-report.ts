/**
 * The pictures.
 *
 * Three of them, each answering a question the single damage figure cannot.
 * The spread says how much of your result is the dice. The timeline says what
 * the rotation actually did with its time, which is where an empty bar or a
 * cooldown left sitting shows up. The resource line says whether you were ever
 * short.
 *
 * Drawn as inline SVG rather than with a charting library, for the same reason
 * the rest of the site has no framework: a chart here is a few dozen rectangles
 * and a path, and a dependency to draw them would be larger than the page.
 */

import { el } from './render';
import type { SimResult } from './sim/types';
import type { TraceEvent } from './sim/trace';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function frame(width: number, height: number, cls: string): SVGSVGElement {
  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    class: cls,
    role: 'img',
  }) as SVGSVGElement;
  return root;
}

const round = (value: number, digits = 1): string => value.toFixed(digits);

/* ---------------------------------------------------------------- the spread */

/**
 * Where the runs landed.
 *
 * The mean is drawn on it because the interesting thing is usually how far it
 * sits from the tallest bar: a rotation that goes well most of the time and
 * falls apart occasionally has its mean dragged left of its peak, and no single
 * number shows that.
 */
export function renderHistogram(result: SimResult): HTMLElement | null {
  const { bins, min, max } = result.histogram;
  if (!bins.length || max <= min) return null;

  const wrap = el('div', 'dchart');
  wrap.appendChild(el('div', 'dchart__head', 'Where the runs landed'));

  const width = 640;
  const height = 130;
  const chart = frame(width, height, 'dchart__svg');

  const tallest = Math.max(...bins);
  const step = width / bins.length;

  bins.forEach((count, i) => {
    if (count <= 0) return;
    const barHeight = Math.max(1, (count / tallest) * (height - 18));
    chart.appendChild(
      svg('rect', {
        x: i * step,
        y: height - 14 - barHeight,
        width: Math.max(1, step - 1),
        height: barHeight,
        class: 'dchart__bar',
      }),
    );
  });

  // The mean, which is the number the panel prints above.
  const at = ((result.dps - min) / (max - min)) * width;
  chart.appendChild(svg('line', {
    x1: at, x2: at, y1: 0, y2: height - 14, class: 'dchart__mean',
  }));

  wrap.appendChild(chart);

  const axis = el('div', 'dchart__axis');
  axis.appendChild(el('span', '', round(min, 0)));
  axis.appendChild(el('span', 'dchart__axis-mid', 'mean ' + round(result.dps, 1)));
  axis.appendChild(el('span', '', round(max, 0)));
  wrap.appendChild(axis);

  return wrap;
}

/* --------------------------------------------------------------- the timeline */

interface Lane {
  id: string;
  name: string;
  marks: Array<{ t: number; outcome?: string }>;
}

/**
 * One fight, ability by ability.
 *
 * Every tick is something that happened: a cast, a swing, a strike. A row that
 * goes quiet is a row worth asking about, and a row of misses that all landed in
 * the same ten seconds is the dice rather than the rotation.
 */
export function renderTimeline(
  events: TraceEvent[],
  duration: number,
  names: Map<string, string>,
): HTMLElement | null {
  if (!events.length) return null;

  const lanes = new Map<string, Lane>();
  for (const event of events) {
    if (event.kind !== 'cast' && event.kind !== 'swing' && event.kind !== 'land') continue;
    // A cast is already shown by the land or swing it produces, so an ability
    // that does both would otherwise draw two rows of the same thing.
    if (event.kind === 'cast' && events.some((e) => e.id === event.id && e.kind !== 'cast')) continue;

    let lane = lanes.get(event.id);
    if (!lane) {
      lane = { id: event.id, name: names.get(event.id) ?? event.id, marks: [] };
      lanes.set(event.id, lane);
    }
    lane.marks.push(event.outcome ? { t: event.t, outcome: event.outcome } : { t: event.t });
  }

  if (!lanes.size) return null;

  const rows = [...lanes.values()].sort((a, b) => b.marks.length - a.marks.length).slice(0, 10);

  const wrap = el('div', 'dchart');
  const head = el('div', 'dchart__head', 'One run, second by second');
  head.appendChild(
    el('span', 'dchart__note', 'the run that came out closest to the middle'),
  );
  wrap.appendChild(head);

  const table = el('div', 'dtimeline');
  for (const lane of rows) {
    const row = el('div', 'dtimeline__row');
    row.appendChild(el('span', 'dtimeline__name', lane.name));

    const track = frame(640, 12, 'dtimeline__track');
    for (const mark of lane.marks) {
      const x = (mark.t / duration) * 640;
      const missed = mark.outcome === 'miss' || mark.outcome === 'dodge' || mark.outcome === 'parry';
      track.appendChild(
        svg('rect', {
          x: Math.min(638, Math.max(0, x)),
          y: missed ? 4 : 0,
          width: 2,
          height: missed ? 4 : 12,
          class: 'dtimeline__mark'
            + (mark.outcome === 'crit' ? ' dtimeline__mark--crit' : '')
            + (missed ? ' dtimeline__mark--missed' : ''),
        }),
      );
    }
    row.appendChild(track);
    table.appendChild(row);
  }
  wrap.appendChild(table);

  const axis = el('div', 'dchart__axis');
  axis.appendChild(el('span', '', '0s'));
  axis.appendChild(el('span', 'dchart__axis-mid', 'tall is a hit, short is avoided, gold is a critical strike'));
  axis.appendChild(el('span', '', round(duration, 0) + 's'));
  wrap.appendChild(axis);

  return wrap;
}

/* -------------------------------------------------------------- the resource */

/** What was in the bar, all the way through. */
export function renderResourceLine(
  events: TraceEvent[],
  duration: number,
  label: string,
): HTMLElement | null {
  const points = events.filter((e) => e.kind === 'resource' && e.value !== undefined);
  if (points.length < 2) return null;

  const top = Math.max(...points.map((p) => p.value!));
  if (top <= 0) return null;

  const width = 640;
  const height = 70;
  const wrap = el('div', 'dchart');
  wrap.appendChild(el('div', 'dchart__head', label));

  const chart = frame(width, height, 'dchart__svg');
  const path = points
    .map((point, i) => {
      const x = (point.t / duration) * width;
      const y = height - (point.value! / top) * (height - 4) - 2;
      return (i === 0 ? 'M' : 'L') + round(x, 1) + ' ' + round(y, 1);
    })
    .join(' ');
  chart.appendChild(svg('path', { d: path, class: 'dchart__line' }));
  wrap.appendChild(chart);

  const axis = el('div', 'dchart__axis');
  axis.appendChild(el('span', '', '0'));
  axis.appendChild(el('span', 'dchart__axis-mid', 'peak ' + round(top, 0)));
  axis.appendChild(el('span', '', round(duration, 0) + 's'));
  wrap.appendChild(axis);

  return wrap;
}

/* ----------------------------------------------------------------- uptimes */

/** How long each buff and debuff was up, as a share of the fight. */
export function renderUptimes(result: SimResult): HTMLElement | null {
  if (!result.auras.length) return null;

  const wrap = el('div', 'dchart');
  wrap.appendChild(el('div', 'dchart__head', 'What was up, and for how long'));

  const list = el('div', 'duptimes');
  for (const aura of result.auras) {
    const share = Math.min(1, aura.uptime / result.duration);
    const row = el('div', 'duptime');
    row.appendChild(el('span', 'duptime__name', aura.name));

    const bar = el('span', 'duptime__bar');
    const fill = el('span', 'duptime__fill');
    fill.style.width = (share * 100).toFixed(1) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);

    row.appendChild(el('span', 'duptime__value', Math.round(share * 100) + '%'));
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}
