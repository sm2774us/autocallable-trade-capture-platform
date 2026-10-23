import {Quote, QuoteMsg, Sym, Trade, TradeMsg, assertNever} from './models';
import {PositionBook, bookFill, bookFromTape} from './positions';

/** What to do with a sequenced message, given the last applied sequence. */
export type Gate = 'apply' | 'ignore' | 'gap';

/**
 * The heart of every sequenced feed, shared by quotes and trades:
 *
 * - waiting for a snapshot: ignore deltas
 * - seq <= last: duplicate or late, ignore (idempotent)
 * - seq == last + 1: apply
 * - seq > last + 1: gap, do not apply, ask for a snapshot
 *
 * @param lastSeq Sequence of the last applied message.
 * @param needsResync True while waiting for a snapshot.
 * @param seq Sequence of the incoming delta.
 * @return The decision.
 */
export function gate(lastSeq: number, needsResync: boolean, seq: number): Gate {
  if (needsResync || seq <= lastSeq) {
    return 'ignore';
  }
  return seq === lastSeq + 1 ? 'apply' : 'gap';
}

/** One point of a symbol's price history. */
export interface Tick {
  /** Time in epoch milliseconds. */
  readonly t: number;
  readonly px: number;
}

/** Most ticks kept per symbol (about 20 minutes of a busy name). */
export const TICKS_MAX = 600;

/** State of the quote feed: latest quotes plus the history the UI needs. */
export interface QuoteBook {
  /** Sequence number of the last applied message. */
  readonly lastSeq: number;
  /** True while waiting for a snapshot after a gap or at start-up. */
  readonly needsResync: boolean;
  /** Latest quote per symbol. */
  readonly quotes: ReadonlyMap<Sym, Quote>;
  /** Price before the latest change, to colour the flash. */
  readonly prev: ReadonlyMap<Sym, number>;
  /** First price seen this session, the baseline for the change column. */
  readonly open: ReadonlyMap<Sym, number>;
  /** Recent ticks per symbol, oldest first. */
  readonly ticks: ReadonlyMap<Sym, readonly Tick[]>;
  /** Deltas applied since the page opened. */
  readonly applied: number;
}

/** Initial state: empty, and waiting for a snapshot. */
export const initialBook: QuoteBook = {
  lastSeq: -1,
  needsResync: true,
  quotes: new Map(),
  prev: new Map(),
  open: new Map(),
  ticks: new Map(),
  applied: 0,
};

/** Mutable working copy used inside one batch. */
interface Work {
  lastSeq: number;
  needsResync: boolean;
  quotes: Map<Sym, Quote>;
  prev: Map<Sym, number>;
  open: Map<Sym, number>;
  ticks: Map<Sym, Tick[]>;
  applied: number;
}

/**
 * Applies a batch of messages to a quote book with a single copy of the maps.
 * Pure: the input is never mutated, and the same reference comes back when
 * nothing changed.
 *
 * @param book The current book.
 * @param msgs Messages in arrival order.
 * @param now Fallback timestamp for quotes without a server time.
 * @return The next book.
 */
export function reduceQuotes(
  book: QuoteBook,
  msgs: readonly QuoteMsg[],
  now: number
): QuoteBook {
  const holder: {work: Work | null} = {work: null};
  const ensure = (): Work =>
    (holder.work ??= {
      lastSeq: book.lastSeq,
      needsResync: book.needsResync,
      quotes: new Map(book.quotes),
      prev: new Map(book.prev),
      open: new Map(book.open),
      ticks: new Map(book.ticks as Map<Sym, Tick[]>),
      applied: book.applied,
    });
  const lastSeq = (): number => holder.work?.lastSeq ?? book.lastSeq;
  const resync = (): boolean => holder.work?.needsResync ?? book.needsResync;

  for (const msg of msgs) {
    switch (msg.kind) {
      case 'snapshot': {
        const w = ensure();
        w.lastSeq = msg.seq;
        w.needsResync = false;
        const quotes = new Map<Sym, Quote>();
        for (const quote of msg.quotes) {
          quotes.set(quote.sym, quote);
          if (!w.open.has(quote.sym)) {
            w.open.set(quote.sym, quote.px);
          }
          const old = w.quotes.get(quote.sym);
          w.prev.set(quote.sym, old ? old.px : quote.px);
          const history = w.ticks.get(quote.sym);
          if (!history || history[history.length - 1].px !== quote.px) {
            w.ticks.set(quote.sym, pushTick(history, quote, now));
          }
        }
        w.quotes = quotes;
        break;
      }
      case 'delta': {
        const verdict = gate(lastSeq(), resync(), msg.seq);
        if (verdict === 'ignore') {
          break;
        }
        const w = ensure();
        if (verdict === 'gap') {
          w.needsResync = true;
          break;
        }
        const quote = msg.quote;
        const old = w.quotes.get(quote.sym);
        w.prev.set(quote.sym, old ? old.px : quote.px);
        if (!w.open.has(quote.sym)) {
          w.open.set(quote.sym, quote.px);
        }
        w.quotes.set(quote.sym, quote);
        w.ticks.set(quote.sym, pushTick(w.ticks.get(quote.sym), quote, now));
        w.lastSeq = msg.seq;
        w.applied += 1;
        break;
      }
      case 'heartbeat':
        if (msg.seq > lastSeq() && !resync()) {
          // The server is ahead of us and no delta explained it: a delta was lost.
          ensure().needsResync = true;
        }
        break;
      default:
        return assertNever(msg);
    }
  }
  return holder.work ? freezeQuotes(holder.work) : book;
}

/** Appends a tick, copying the array and trimming to {@link TICKS_MAX}. */
function pushTick(
  history: readonly Tick[] | undefined,
  quote: Quote,
  now: number
): Tick[] {
  const tick: Tick = {t: quote.ts ?? now, px: quote.px};
  if (!history) {
    return [tick];
  }
  const start =
    history.length >= TICKS_MAX ? history.length - TICKS_MAX + 1 : 0;
  return [...history.slice(start), tick];
}

/** Turns the working copy into an immutable book. */
function freezeQuotes(work: Work): QuoteBook {
  return {
    lastSeq: work.lastSeq,
    needsResync: work.needsResync,
    quotes: work.quotes,
    prev: work.prev,
    open: work.open,
    ticks: work.ticks,
    applied: work.applied,
  };
}

/**
 * Single-message convenience wrapper around {@link reduceQuotes}.
 *
 * @param book The current book.
 * @param msg One message.
 * @param now Fallback timestamp.
 * @return The next book.
 */
export function reduceQuote(
  book: QuoteBook,
  msg: QuoteMsg,
  now = 0
): QuoteBook {
  return reduceQuotes(book, [msg], now);
}

/** Most trades kept on the client tape; matches the server's capacity. */
export const TAPE_MAX = 500;

/** State of the trade feed. */
export interface TapeBook {
  readonly lastSeq: number;
  readonly needsResync: boolean;
  /** Newest first. */
  readonly trades: readonly Trade[];
  /** Positions folded from every fill applied since the last snapshot. */
  readonly positions: PositionBook;
  /** Fills applied since the page opened. */
  readonly applied: number;
}

/** Initial tape: empty, waiting for a snapshot. */
export const initialTape: TapeBook = {
  lastSeq: -1,
  needsResync: true,
  trades: [],
  positions: new Map(),
  applied: 0,
};

/**
 * Applies a batch of trade-feed messages.
 *
 * @param tape The current tape.
 * @param msgs Messages in arrival order.
 * @return The next tape; the same reference if nothing changed.
 */
export function reduceTrades(
  tape: TapeBook,
  msgs: readonly TradeMsg[]
): TapeBook {
  let state = tape;
  let fresh: Trade[] = [];
  const flush = (): void => {
    if (fresh.length) {
      // `fresh` is oldest first; the tape is newest first.
      const merged = [...fresh.reverse(), ...state.trades].slice(0, TAPE_MAX);
      state = {...state, trades: merged};
      fresh = [];
    }
  };
  for (const msg of msgs) {
    switch (msg.kind) {
      case 'snapshot':
        fresh = [];
        state = {
          lastSeq: msg.seq,
          needsResync: false,
          trades: msg.trades.slice(0, TAPE_MAX),
          positions: bookFromTape(msg.trades),
          applied: state.applied,
        };
        break;
      case 'delta': {
        const verdict = gate(state.lastSeq, state.needsResync, msg.seq);
        if (verdict === 'ignore') {
          break;
        }
        if (verdict === 'gap') {
          flush();
          state = {...state, needsResync: true};
          break;
        }
        fresh.push(msg.trade);
        state = {
          ...state,
          lastSeq: msg.seq,
          positions: bookFill(state.positions, msg.trade),
          applied: state.applied + 1,
        };
        break;
      }
      case 'heartbeat':
        if (msg.seq > state.lastSeq && !state.needsResync) {
          state = {...state, needsResync: true};
        }
        break;
      default:
        return assertNever(msg);
    }
  }
  flush();
  return state;
}
