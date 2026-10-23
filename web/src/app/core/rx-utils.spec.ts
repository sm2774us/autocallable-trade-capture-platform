import {Observable, of} from 'rxjs';
import {TestScheduler} from 'rxjs/testing';

import {Quote, sym} from './models';
import {
  backoffMs,
  conflateBySymbol,
  frameBatch,
  resilient,
  retryWithBackoff,
} from './rx-utils';

const quote = (s: string, px: number, seq: number): Quote => ({
  sym: sym(s),
  px,
  qty: 100,
  seq,
});
const newScheduler = (): TestScheduler =>
  new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });

describe('rx utils (marble tests, virtual time)', () => {
  it('conflates a burst: last write wins per symbol per frame', () => {
    const scheduler = newScheduler();
    const seen: Array<Array<[string, number]>> = [];
    scheduler.run(({cold, flush}) => {
      const source = cold<Quote>('a-b-c-------|', {
        a: quote('A', 1, 1),
        b: quote('A', 2, 2),
        c: quote('B', 9, 3),
      });
      source.pipe(conflateBySymbol(5, scheduler)).subscribe(frame => {
        seen.push(
          [...frame.values()].map(v => [v.sym, v.px] as [string, number])
        );
      });
      flush();
    });
    expect(seen).toEqual([
      [
        ['A', 2],
        ['B', 9],
      ],
    ]);
  });

  it('frameBatch groups per frame and loses nothing', () => {
    const scheduler = newScheduler();
    const seen: number[][] = [];
    scheduler.run(({cold, flush}) => {
      cold<number>('a-b-c-----d-|', {a: 1, b: 2, c: 3, d: 4})
        .pipe(frameBatch<number>(5, scheduler))
        .subscribe(batch => seen.push(batch));
      flush();
    });
    expect(seen.flat()).toEqual([1, 2, 3, 4]);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('frameBatch with a zero frame passes messages one by one', () => {
    const seen: number[][] = [];
    of(1, 2, 3)
      .pipe(frameBatch<number>(0))
      .subscribe(batch => seen.push(batch));
    expect(seen).toEqual([[1], [2], [3]]);
  });

  it('computes back-off with a cap and jitter', () => {
    const cfg = {baseMs: 10, capMs: 40, maxAttempts: 9, jitter: () => 1};
    expect([1, 2, 3, 4, 5].map(n => backoffMs(cfg, n))).toEqual([
      10, 20, 40, 40, 40,
    ]);
    expect(backoffMs({...cfg, jitter: () => 0.5}, 2)).toBe(10);
  });

  it('retries with exponential back-off, then propagates the error', () => {
    let attempts = 0;
    let failed = false;
    newScheduler().run(({flush}) => {
      new Observable<number>(subscriber => {
        attempts++;
        subscriber.error(new Error('x'));
      })
        .pipe(
          retryWithBackoff({
            baseMs: 10,
            capMs: 40,
            maxAttempts: 3,
            jitter: () => 1,
          })
        )
        .subscribe({
          error: () => {
            failed = true;
          },
        });
      flush();
    });
    expect(attempts).toBe(4);
    expect(failed).toBe(true);
  });

  it('resilient resubscribes after a CLEAN completion (finding F-11)', () => {
    vi.useFakeTimers();
    try {
      let subscriptions = 0;
      const received: number[] = [];
      const source = new Observable<number>(subscriber => {
        subscriptions++;
        subscriber.next(subscriptions);
        subscriber.complete(); // the server closed the socket normally
      });
      const sub = source
        .pipe(
          resilient({baseMs: 100, capMs: 1000, maxAttempts: 5, jitter: () => 1})
        )
        .subscribe(v => received.push(v));
      expect(received).toEqual([1]);
      vi.advanceTimersByTime(100);
      expect(received).toEqual([1, 2]);
      vi.advanceTimersByTime(200);
      expect(received).toEqual([1, 2, 3]);
      sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resilient also retries errors and keeps going', () => {
    vi.useFakeTimers();
    try {
      let subscriptions = 0;
      const received: number[] = [];
      const source = new Observable<number>(subscriber => {
        subscriptions++;
        if (subscriptions < 3) {
          subscriber.error(new Error('down'));
        } else {
          subscriber.next(subscriptions);
        }
      });
      const sub = source
        .pipe(
          resilient({
            baseMs: 100,
            capMs: 1000,
            maxAttempts: 10,
            jitter: () => 1,
          })
        )
        .subscribe(v => received.push(v));
      vi.advanceTimersByTime(100); // first retry
      vi.advanceTimersByTime(200); // second retry succeeds
      expect(received).toEqual([3]);
      sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });
});
