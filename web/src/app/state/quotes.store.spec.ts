import {TestBed} from '@angular/core/testing';

import {QuoteMsg} from '../core/models';
import {FEED_CLIENT, FLUSH_MS, NOW, STALE_MS} from '../feed/feed.client';
import {FakeFeed, qDelta, qSnap, quote} from '../testing/fakes';
import {QuotesStore} from './quotes.store';

describe('QuotesStore', () => {
  let feed: FakeFeed<QuoteMsg>;
  let clock: {now: number};

  beforeEach(() => {
    vi.useFakeTimers();
    feed = new FakeFeed<QuoteMsg>();
    clock = {now: 1_000_000};
    TestBed.configureTestingModule({
      providers: [
        {provide: FEED_CLIENT, useValue: feed},
        {provide: FLUSH_MS, useValue: 0},
        {provide: STALE_MS, useValue: 4000},
        {provide: NOW, useValue: () => clock.now},
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts connecting and goes live on the first snapshot', () => {
    const store = TestBed.inject(QuotesStore);
    expect(store.status()).toBe('connecting');
    feed.push(qSnap(10, quote('AAPL', 100, 10, 500, 1000)));
    expect(store.status()).toBe('live');
    expect(store.lastSeq()).toBe(10);
    expect(store.rows().map(r => r.sym)).toEqual(['AAPL']);
  });

  it('derives rows: change since open, previous price, volume, sparkline', () => {
    const store = TestBed.inject(QuotesStore);
    feed.push(
      qSnap(1, quote('AAPL', 100, 1, 10, 1000)),
      qDelta(2, quote('AAPL', 101, 2, 20, 2000)),
      qDelta(3, quote('AAPL', 102, 3, 30, 3000))
    );
    const row = store.rows()[0];
    expect(row.px).toBe(102);
    expect(row.prev).toBe(101);
    expect(row.chgPct).toBeCloseTo(2);
    expect(row.qty).toBe(30);
    expect(row.spark).toEqual([100, 101, 102]);
    expect(store.maxQty()).toBe(30);
  });

  it('asks for exactly one snapshot when a gap appears', () => {
    const store = TestBed.inject(QuotesStore);
    feed.push(
      qSnap(1, quote('A', 1, 1)),
      qDelta(5, quote('A', 2, 5)),
      qDelta(6, quote('A', 3, 6))
    );
    expect(store.status()).toBe('resync');
    expect(feed.snapshotRequests).toBe(1);
    feed.push(qSnap(7, quote('A', 3, 7)));
    expect(store.status()).toBe('live');
    expect(store.rows()[0].px).toBe(3);
  });

  it('goes stale after silence and recovers on the next message', () => {
    const store = TestBed.inject(QuotesStore);
    feed.push(qSnap(1, quote('A', 1, 1)));
    clock.now += 5000;
    vi.advanceTimersByTime(1000);
    expect(store.status()).toBe('stale');
    feed.push({kind: 'heartbeat', seq: 1});
    expect(store.status()).toBe('live');
  });

  it('measures messages per second', () => {
    const store = TestBed.inject(QuotesStore);
    feed.push(
      qSnap(1, quote('A', 1, 1)),
      qDelta(2, quote('A', 2, 2)),
      qDelta(3, quote('A', 3, 3))
    );
    vi.advanceTimersByTime(1000);
    expect(store.health.perSec()).toBe(3);
    vi.advanceTimersByTime(1000);
    expect(store.health.perSec()).toBe(0);
  });

  it('keeps the symbols array reference while the set of symbols is unchanged', () => {
    const store = TestBed.inject(QuotesStore);
    feed.push(qSnap(1, quote('B', 1, 1), quote('A', 1, 1)));
    const first = store.symbols();
    feed.push(qDelta(2, quote('A', 2, 2)));
    expect(store.symbols()).toBe(first);
    expect(first).toEqual(['A', 'B']);
    feed.push(qDelta(3, quote('C', 2, 3)));
    expect(store.symbols()).toEqual(['A', 'B', 'C']);
  });

  it('stores filter and sorting for the grid, and accepts TanStack updaters', () => {
    const store = TestBed.inject(QuotesStore);
    store.setFilter('aa');
    expect(store.filter()).toBe('aa');
    store.setSorting([{id: 'px', desc: true}]);
    expect(store.sorting()).toEqual([{id: 'px', desc: true}]);
    store.setSorting(old => old.map(s => ({...s, desc: !s.desc})));
    expect(store.sorting()).toEqual([{id: 'px', desc: false}]);
  });

  it('exposes tick history for charts', () => {
    const store = TestBed.inject(QuotesStore);
    feed.push(
      qSnap(1, quote('A', 1, 1, 1, 1000)),
      qDelta(2, quote('A', 2, 2, 1, 2000))
    );
    expect(store.ticksFor('A').map(t => t.px)).toEqual([1, 2]);
    expect(store.ticksFor('ZZZ')).toEqual([]);
  });
});
