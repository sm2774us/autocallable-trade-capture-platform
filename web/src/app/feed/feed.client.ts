import {InjectionToken} from '@angular/core';
import {Observable} from 'rxjs';

import {QuoteMsg, TradeMsg} from '../core/models';

/**
 * Abstraction over the transport so stores and components are testable without
 * a real WebSocket.
 */
export interface FeedClient<M> {
  /** Stream of feed messages. */
  readonly messages$: Observable<M>;

  /** Asks the server for a fresh snapshot after a gap. */
  requestSnapshot(): void;
}

/** Injection token for the quote feed (`/ws/quotes`). */
export const FEED_CLIENT = new InjectionToken<FeedClient<QuoteMsg>>(
  'FEED_CLIENT'
);

/** Injection token for the trade feed (`/ws/trades`). */
export const TRADE_FEED_CLIENT = new InjectionToken<FeedClient<TradeMsg>>(
  'TRADE_FEED_CLIENT'
);

/** Milliseconds over which incoming messages are grouped into one UI update. */
export const FLUSH_MS = new InjectionToken<number>('FLUSH_MS', {
  providedIn: 'root',
  factory: () => 50,
});

/** Silence (no delta, no heartbeat) after which a feed is called stale. */
export const STALE_MS = new InjectionToken<number>('STALE_MS', {
  providedIn: 'root',
  factory: () => 4000,
});

/** Clock seam: tests replace it to control time. */
export const NOW = new InjectionToken<() => number>('NOW', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});
