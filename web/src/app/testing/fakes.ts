import {Observable, Subject} from 'rxjs';

import {Quote, QuoteMsg, Side, Trade, TradeMsg, sym} from '../core/models';
import {FeedClient} from '../feed/feed.client';

/** Test double for the transport: tests push messages in by hand. */
export class FakeFeed<M> implements FeedClient<M> {
  readonly subject = new Subject<M>();
  readonly messages$: Observable<M> = this.subject.asObservable();
  snapshotRequests = 0;

  /** Records that a store asked for a snapshot. */
  requestSnapshot(): void {
    this.snapshotRequests++;
  }

  /**
   * Pushes messages to every subscriber, in order.
   *
   * @param msgs The messages to deliver.
   */
  push(...msgs: M[]): void {
    for (const msg of msgs) {
      this.subject.next(msg);
    }
  }
}

/** Builds a quote. */
export function quote(
  symbol: string,
  px: number,
  seq: number,
  qty = 100,
  ts?: number
): Quote {
  return {sym: sym(symbol), px, qty, seq, ts};
}

/** Builds a quote snapshot. */
export function qSnap(seq: number, ...quotes: Quote[]): QuoteMsg {
  return {kind: 'snapshot', seq, quotes};
}

/** Builds a quote delta. */
export function qDelta(seq: number, q: Quote): QuoteMsg {
  return {kind: 'delta', seq, quote: q};
}

/** Builds a trade. */
export function trade(
  seq: number,
  symbol = 'AAPL',
  side: Side = 'BUY',
  qty = 100,
  pxMicros = 10_000_000,
  account = 'ACC7'
): Trade {
  return {
    id: 'T/' + seq,
    source: 'T',
    account,
    sym: sym(symbol),
    side,
    qty,
    pxMicros,
    seq,
    ts: 1_700_000_000_000 + seq * 1000,
  };
}

/** Builds a trade snapshot (newest first, as the server sends it). */
export function tSnap(seq: number, ...trades: Trade[]): TradeMsg {
  return {kind: 'snapshot', seq, trades};
}

/** Builds a trade delta. */
export function tDelta(seq: number, t: Trade): TradeMsg {
  return {kind: 'delta', seq, trade: t};
}
