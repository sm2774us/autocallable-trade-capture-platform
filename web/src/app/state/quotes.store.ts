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
import type {SortingState, Updater} from '@tanstack/angular-table';

import {QuoteBook, initialBook, reduceQuotes} from '../core/feed.reducer';
import {FeedStatus, QuoteMsg, Sym} from '../core/models';
import {frameBatch} from '../core/rx-utils';
import {FEED_CLIENT, FLUSH_MS, NOW, STALE_MS} from '../feed/feed.client';
import {createFeedHealth} from './feed-health';

/** One row of the quote board, derived from the book. */
export interface QuoteRow {
  readonly id: Sym;
  readonly sym: Sym;
  readonly px: number;
  readonly prev: number;
  /** Change since the first price seen this session, in percent. */
  readonly chgPct: number;
  readonly qty: number;
  readonly ts: number;
  readonly seq: number;
  /** Recent prices for the sparkline, oldest first. */
  readonly spark: readonly number[];
}

/** Persisted-free UI state of the quote board. */
interface QuotesState {
  book: QuoteBook;
  filter: string;
  sorting: SortingState;
}

/** Sparkline length in ticks. */
export const SPARK_POINTS = 48;

/**
 * Signal store for the quote feed: the sequenced book, the filter text and the
 * sorting state. Rows are derived (memoised), never stored twice.
 */
export const QuotesStore = signalStore(
  {providedIn: 'root'},
  withState<QuotesState>({
    book: initialBook,
    filter: '',
    sorting: [{id: 'sym', desc: false}],
  }),
  withProps(store => {
    const now = inject(NOW);
    return {
      feed: inject(FEED_CLIENT),
      now,
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
    symbols: computed(() => [...store.book().quotes.keys()].sort(), {
      equal: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
    }),
    /** Largest cumulative volume, to scale the data bars. */
    maxQty: computed(() => {
      let max = 0;
      for (const quote of store.book().quotes.values()) {
        max = Math.max(max, quote.qty);
      }
      return max;
    }),
    rows: computed<readonly QuoteRow[]>(() => {
      const book = store.book();
      const out: QuoteRow[] = [];
      for (const quote of book.quotes.values()) {
        const open = book.open.get(quote.sym) ?? quote.px;
        const ticks = book.ticks.get(quote.sym) ?? [];
        out.push({
          id: quote.sym,
          sym: quote.sym,
          px: quote.px,
          prev: book.prev.get(quote.sym) ?? quote.px,
          chgPct: open ? ((quote.px - open) / open) * 100 : 0,
          qty: quote.qty,
          ts: quote.ts ?? 0,
          seq: quote.seq,
          spark: ticks.slice(-SPARK_POINTS).map(t => t.px),
        });
      }
      return out;
    }),
  })),
  withMethods(store => ({
    /**
     * Applies a batch of feed messages and asks for a snapshot when a gap was
     * just detected.
     *
     * @param batch Messages in arrival order.
     */
    applyBatch(batch: readonly QuoteMsg[]): void {
      const before = store.book();
      const after = reduceQuotes(before, batch, store.now());
      store.health.noteMessages(batch.length);
      if (after !== before) {
        patchState(store, {book: after});
      }
      if (after.needsResync && !before.needsResync) {
        store.feed.requestSnapshot();
      }
    },
    /** Sets the symbol filter (case-insensitive substring). */
    setFilter(text: string): void {
      patchState(store, {filter: text});
    },
    /** TanStack-style updater for the sorting state. */
    setSorting(updater: Updater<SortingState>): void {
      patchState(store, {
        sorting:
          typeof updater === 'function' ? updater(store.sorting()) : updater,
      });
    },
    /**
     * Latest tick history for a symbol.
     *
     * @param symbol The symbol.
     * @return Ticks, oldest first.
     */
    ticksFor(symbol: string) {
      return store.book().ticks.get(symbol as Sym) ?? [];
    },
  })),
  withHooks({
    onInit(store) {
      const flushMs = inject(FLUSH_MS);
      const subscription = store.feed.messages$
        .pipe(frameBatch<QuoteMsg>(flushMs))
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
