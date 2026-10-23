/**
 * Branded primitive: a symbol is not just any string. Compile-time only, zero
 * runtime cost.
 */
export type Sym = string & {readonly brand: 'Sym'};

/**
 * Normalises raw text into a symbol.
 *
 * @param raw Untrimmed, any-case text.
 * @return The trimmed, upper-cased symbol.
 */
export function sym(raw: string): Sym {
  return raw.trim().toUpperCase() as Sym;
}

/** Last price and cumulative traded quantity for one symbol. */
export interface Quote {
  readonly sym: Sym;
  /** Last traded price as a decimal (display only; accounting uses micros). */
  readonly px: number;
  /** Cumulative traded quantity since the server started. */
  readonly qty: number;
  /** Quote-feed sequence number of the delta that last changed this row. */
  readonly seq: number;
  /** Server time of that change, epoch milliseconds (absent on old servers). */
  readonly ts?: number;
}

/** Buy or sell, as sent by the server. */
export type Side = 'BUY' | 'SELL';

/** One captured fill on the trade tape. Prices stay in integer micros. */
export interface Trade {
  /** Source-qualified trade id, unique on the tape. */
  readonly id: string;
  readonly source: string;
  readonly account: string;
  readonly sym: Sym;
  readonly side: Side;
  readonly qty: number;
  /** Execution price in millionths of the currency unit. */
  readonly pxMicros: number;
  /** Trade-feed sequence number. */
  readonly seq: number;
  /** Execution time, epoch milliseconds. */
  readonly ts: number;
}

/**
 * Discriminated union mirrors a Java sealed interface: the `kind` tag drives
 * exhaustive narrowing. This is the `/ws/quotes` contract.
 */
export type QuoteMsg =
  | {
      readonly kind: 'snapshot';
      readonly seq: number;
      readonly quotes: readonly Quote[];
    }
  | {readonly kind: 'delta'; readonly seq: number; readonly quote: Quote}
  | {readonly kind: 'heartbeat'; readonly seq: number};

/** The `/ws/trades` contract; the tape in a snapshot is newest first. */
export type TradeMsg =
  | {
      readonly kind: 'snapshot';
      readonly seq: number;
      readonly trades: readonly Trade[];
    }
  | {readonly kind: 'delta'; readonly seq: number; readonly trade: Trade}
  | {readonly kind: 'heartbeat'; readonly seq: number};

/** Kept for readability where the feed type does not matter. */
export type Msg = QuoteMsg;

/**
 * Compile-time exhaustiveness check: fails to type-check if a union variant is
 * unhandled.
 *
 * @param value A value that must have type `never` once every case is handled.
 * @return Never returns.
 * @throws Error Always, if reached at runtime.
 */
export function assertNever(value: never): never {
  throw new Error('Unhandled variant: ' + JSON.stringify(value));
}

/**
 * Connection health shown to the user.
 *
 * - connecting: nothing received yet
 * - live: in sequence and recent
 * - resync: a gap was detected, waiting for a snapshot
 * - stale: nothing (not even a heartbeat) for too long
 */
export type FeedStatus = 'connecting' | 'live' | 'resync' | 'stale';
