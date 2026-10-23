import {DestroyRef, computed, inject} from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';

import {TapeBook, initialTape, reduceTrades} from '../core/feed.reducer';
import {FeedStatus, Side, Trade, TradeMsg} from '../core/models';
import {notionalMicros} from '../core/money';
import {frameBatch} from '../core/rx-utils';
import {FLUSH_MS, NOW, STALE_MS, TRADE_FEED_CLIENT} from '../feed/feed.client';
import {createFeedHealth} from './feed-health';

/** Side filter of the tape. */
export type SideFilter = 'ALL' | Side;

/** Session totals shown in the tape header. */
export interface TapeStats {
  readonly count: number;
  readonly buyQty: number;
  readonly sellQty: number;
  readonly notionalMicros: bigint;
}

interface TradesState {
  book: TapeBook;
  side: SideFilter;
  /** Symbol the tape is narrowed to, or null for all. */
  onlySym: string | null;
}

/** Signal store for the trade feed: tape, positions, side filter. */
export const TradesStore = signalStore(
  {providedIn: 'root'},
  withState<TradesState>({book: initialTape, side: 'ALL', onlySym: null}),
  withProps(store => {
    const now = inject(NOW);
    return {
      feed: inject(TRADE_FEED_CLIENT),
      health: createFeedHealth(
        now,
        inject(STALE_MS),
        () => store.book().needsResync
      ),
    };
  }),
  withComputed(store => ({
    status: computed<FeedStatus>(() => store.health.status()),
    lastSeq: computed(() => store.book().lastSeq),
    positions: computed(() => [...store.book().positions.values()]),
    visible: computed<readonly Trade[]>(() => {
      const side = store.side();
      const only = store.onlySym();
      return store
        .book()
        .trades.filter(
          t => (side === 'ALL' || t.side === side) && (!only || t.sym === only)
        );
    }),
    stats: computed<TapeStats>(() => {
      let buyQty = 0;
      let sellQty = 0;
      let notional = 0n;
      const trades = store.book().trades;
      for (const trade of trades) {
        if (trade.side === 'BUY') {
          buyQty += trade.qty;
        } else {
          sellQty += trade.qty;
        }
        notional += notionalMicros(trade.qty, trade.pxMicros);
      }
      return {count: trades.length, buyQty, sellQty, notionalMicros: notional};
    }),
  })),
  withMethods(store => ({
    /**
     * Applies a batch of feed messages; asks for a snapshot on a fresh gap.
     *
     * @param batch Messages in arrival order.
     */
    applyBatch(batch: readonly TradeMsg[]): void {
      const before = store.book();
      const after = reduceTrades(before, batch);
      store.health.noteMessages(batch.length);
      if (after !== before) {
        patchState(store, {book: after});
      }
      if (after.needsResync && !before.needsResync) {
        store.feed.requestSnapshot();
      }
    },
    /** Sets the side filter. */
    setSide(side: SideFilter): void {
      patchState(store, {side});
    },
    /** Narrows the tape to one symbol, or clears with null. */
    setOnlySym(symbol: string | null): void {
      patchState(store, {onlySym: symbol});
    },
  })),
  withHooks({
    onInit(store) {
      const flushMs = inject(FLUSH_MS);
      const subscription = store.feed.messages$
        .pipe(frameBatch<TradeMsg>(flushMs))
        .subscribe(batch => {
          store.applyBatch(batch);
        });
      const timer = setInterval(() => {
        store.health.tick();
      }, 1000);
      inject(DestroyRef).onDestroy(() => {
        subscription.unsubscribe();
        clearInterval(timer);
      });
    },
  })
);
