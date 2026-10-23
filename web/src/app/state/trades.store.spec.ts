import {TestBed} from '@angular/core/testing';

import {TradeMsg} from '../core/models';
import {FLUSH_MS, NOW, STALE_MS, TRADE_FEED_CLIENT} from '../feed/feed.client';
import {FakeFeed, tDelta, tSnap, trade} from '../testing/fakes';
import {TradesStore} from './trades.store';

describe('TradesStore', () => {
  let feed: FakeFeed<TradeMsg>;

  beforeEach(() => {
    vi.useFakeTimers();
    feed = new FakeFeed<TradeMsg>();
    TestBed.configureTestingModule({
      providers: [
        {provide: TRADE_FEED_CLIENT, useValue: feed},
        {provide: FLUSH_MS, useValue: 0},
        {provide: STALE_MS, useValue: 4000},
        {provide: NOW, useValue: () => 1_000_000},
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds the tape and positions from a snapshot then deltas', () => {
    const store = TestBed.inject(TradesStore);
    feed.push(
      tSnap(
        2,
        trade(2, 'AAPL', 'SELL', 40, 12_000_000),
        trade(1, 'AAPL', 'BUY', 100, 10_000_000)
      )
    );
    feed.push(tDelta(3, trade(3, 'MSFT', 'BUY', 10, 5_000_000)));
    expect(store.status()).toBe('live');
    expect(store.book().trades.map(t => t.seq)).toEqual([3, 2, 1]);
    expect(
      store
        .positions()
        .map(p => p.sym)
        .sort()
    ).toEqual(['AAPL', 'MSFT']);
  });

  it('filters the tape by side and symbol without touching the book', () => {
    const store = TestBed.inject(TradesStore);
    feed.push(
      tSnap(
        3,
        trade(3, 'MSFT', 'SELL'),
        trade(2, 'AAPL', 'SELL'),
        trade(1, 'AAPL', 'BUY')
      )
    );
    store.setSide('SELL');
    expect(store.visible().map(t => t.seq)).toEqual([3, 2]);
    store.setOnlySym('AAPL');
    expect(store.visible().map(t => t.seq)).toEqual([2]);
    store.setSide('ALL');
    store.setOnlySym(null);
    expect(store.visible().length).toBe(3);
    expect(store.book().trades.length).toBe(3);
  });

  it('computes tape statistics exactly', () => {
    const store = TestBed.inject(TradesStore);
    feed.push(
      tSnap(
        2,
        trade(2, 'A', 'SELL', 50, 2_000_000),
        trade(1, 'A', 'BUY', 100, 1_000_000)
      )
    );
    const stats = store.stats();
    expect(stats.count).toBe(2);
    expect(stats.buyQty).toBe(100);
    expect(stats.sellQty).toBe(50);
    expect(stats.notionalMicros).toBe(200_000_000n);
  });

  it('requests a snapshot once on a gap and recovers', () => {
    const store = TestBed.inject(TradesStore);
    feed.push(tSnap(1, trade(1)), tDelta(9, trade(9)), tDelta(10, trade(10)));
    expect(store.status()).toBe('resync');
    expect(feed.snapshotRequests).toBe(1);
    feed.push(tSnap(10, trade(10), trade(1)));
    expect(store.status()).toBe('live');
    expect(store.book().trades.length).toBe(2);
  });
});
