/**
 * The simulator's clock: a binary heap of things that happen later.
 *
 * Two events at the same instant come out in the order they went in, which is
 * what stops a damage-over-time tick and a cast landing on the same tenth of a
 * second from swapping places between runs.
 */

export interface QueuedEvent<T> {
  time: number;
  /** Insertion order, the tie-break that keeps equal times stable. */
  seq: number;
  data: T;
}

function before<T>(a: QueuedEvent<T>, b: QueuedEvent<T>): boolean {
  return a.time === b.time ? a.seq < b.seq : a.time < b.time;
}

export class EventQueue<T> {
  private heap: Array<QueuedEvent<T>> = [];
  private nextSeq = 0;

  get size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap.length = 0;
    this.nextSeq = 0;
  }

  push(time: number, data: T): void {
    const node: QueuedEvent<T> = { time, seq: this.nextSeq, data };
    this.nextSeq += 1;
    this.heap.push(node);

    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(this.heap[i]!, this.heap[parent]!)) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent]!, this.heap[i]!];
      i = parent;
    }
  }

  peek(): QueuedEvent<T> | undefined {
    return this.heap[0];
  }

  pop(): QueuedEvent<T> | undefined {
    const top = this.heap[0];
    if (top === undefined) return undefined;
    const last = this.heap.pop()!;
    if (this.heap.length === 0) return top;

    this.heap[0] = last;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let best = i;
      if (left < this.heap.length && before(this.heap[left]!, this.heap[best]!)) best = left;
      if (right < this.heap.length && before(this.heap[right]!, this.heap[best]!)) best = right;
      if (best === i) break;
      [this.heap[i], this.heap[best]] = [this.heap[best]!, this.heap[i]!];
      i = best;
    }
    return top;
  }
}
