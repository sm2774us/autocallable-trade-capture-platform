import {Trade} from './models';

/**
 * Average-cost position for one account and symbol, in exact integers.
 *
 * `costMicros` is the signed cost basis of the open quantity: the sum of
 * signed quantity times price. `realizedMicros` accumulates profit from closed
 * quantity.
 */
export interface Position {
  readonly key: string;
  readonly account: string;
  readonly sym: string;
  /** Signed net quantity: positive long, negative short. */
  readonly netQty: number;
  readonly boughtQty: number;
  readonly soldQty: number;
  readonly costMicros: bigint;
  readonly realizedMicros: bigint;
  readonly fills: number;
}

/** All positions, keyed by `account|symbol`. */
export type PositionBook = ReadonlyMap<string, Position>;

/**
 * Builds the key of a position.
 *
 * @param account Booking account.
 * @param symbol Instrument.
 * @return The map key.
 */
export function positionKey(account: string, symbol: string): string {
  return account + '|' + symbol;
}

/**
 * Applies one fill to a position using the average-cost method. Reducing a
 * position realises profit at the average cost; crossing through zero closes
 * the old side completely and opens the new side at the fill price.
 *
 * @param position The current position, or undefined if flat and new.
 * @param trade The fill.
 * @return The new position (a new object).
 */
export function applyFill(
  position: Position | undefined,
  trade: Pick<Trade, 'account' | 'side' | 'qty' | 'pxMicros'> & {
    readonly sym: string;
  }
): Position {
  const base: Position = position ?? {
    key: positionKey(trade.account, trade.sym),
    account: trade.account,
    sym: trade.sym,
    netQty: 0,
    boughtQty: 0,
    soldQty: 0,
    costMicros: 0n,
    realizedMicros: 0n,
    fills: 0,
  };
  const direction = trade.side === 'BUY' ? 1 : -1;
  const signedQty = direction * trade.qty;
  const price = BigInt(trade.pxMicros);
  const net = base.netQty;
  let nextNet = net;
  let cost = base.costMicros;
  let realized = base.realizedMicros;

  if (net === 0 || Math.sign(net) === direction) {
    nextNet = net + signedQty;
    cost += BigInt(signedQty) * price;
  } else {
    const closing = Math.min(Math.abs(net), trade.qty);
    const costClosed = (cost * BigInt(closing)) / BigInt(Math.abs(net));
    const proceeds = BigInt(Math.sign(net) * closing) * price;
    realized += proceeds - costClosed;
    cost -= costClosed;
    nextNet = net + direction * closing;
    const remaining = trade.qty - closing;
    if (remaining > 0) {
      nextNet = direction * remaining;
      cost = BigInt(direction * remaining) * price;
    }
  }
  return {
    ...base,
    netQty: nextNet,
    boughtQty: base.boughtQty + (direction === 1 ? trade.qty : 0),
    soldQty: base.soldQty + (direction === -1 ? trade.qty : 0),
    costMicros: nextNet === 0 ? 0n : cost,
    realizedMicros: realized,
    fills: base.fills + 1,
  };
}

/**
 * Adds a fill to a book, returning a new book.
 *
 * @param book The current positions.
 * @param trade The fill.
 * @return A new map; the input is untouched.
 */
export function bookFill(book: PositionBook, trade: Trade): PositionBook {
  const next = new Map(book);
  const key = positionKey(trade.account, trade.sym);
  next.set(key, applyFill(book.get(key), trade));
  return next;
}

/**
 * Rebuilds positions from a tape (newest first) by replaying oldest to newest.
 *
 * @param tape Trades, newest first.
 * @return The resulting positions.
 */
export function bookFromTape(tape: readonly Trade[]): PositionBook {
  const next = new Map<string, Position>();
  for (let i = tape.length - 1; i >= 0; i--) {
    const trade = tape[i];
    const key = positionKey(trade.account, trade.sym);
    next.set(key, applyFill(next.get(key), trade));
  }
  return next;
}

/**
 * Average open price of a position.
 *
 * @param position The position.
 * @return Average cost per unit in micros, or null when flat.
 */
export function avgPriceMicros(position: Position): bigint | null {
  if (position.netQty === 0) {
    return null;
  }
  const quantity = BigInt(Math.abs(position.netQty));
  const value =
    position.costMicros < 0n ? -position.costMicros : position.costMicros;
  return (value * 2n + quantity) / (quantity * 2n);
}

/**
 * Unrealised profit against a mark price.
 *
 * @param position The position.
 * @param markMicros Last price in micros.
 * @return Net quantity times mark minus cost, in micros.
 */
export function unrealizedMicros(
  position: Position,
  markMicros: bigint
): bigint {
  return BigInt(position.netQty) * markMicros - position.costMicros;
}
