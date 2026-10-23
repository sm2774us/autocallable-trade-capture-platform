import {
  TAPE_MAX,
  TICKS_MAX,
  gate,
  initialBook,
  initialTape,
  reduceQuote,
  reduceQuotes,
  reduceTrades,
} from './feed.reducer';
import {Quote, QuoteMsg, Side, Trade, TradeMsg, sym} from './models';

const quote = (
  symbol: string,
  px: number,
  seq: number,
  qty = 100,
  ts?: number
): Quote => ({
  sym: sym(symbol),
  px,
  qty,
  seq,
  ts,
});
const snap = (seq: number, ...quotes: Quote[]): QuoteMsg => ({
  kind: 'snapshot',
  seq,
  quotes,
});
const delta = (seq: number, q: Quote): QuoteMsg => ({
  kind: 'delta',
  seq,
  quote: q,
});

const trade = (
  seq: number,
  symbol = 'AAPL',
  side: Side = 'BUY',
  qty = 100,
  pxMicros = 10_000_000
): Trade => ({
  id: 'T/' + seq,
  source: 'T',
  account: 'ACC',
  sym: sym(symbol),
  side,
  qty,
  pxMicros,
  seq,
  ts: 1000 + seq,
});
const tsnap = (seq: number, ...trades: Trade[]): TradeMsg => ({
  kind: 'snapshot',
  seq,
  trades,
});
const tdelta = (seq: number, t: Trade): TradeMsg => ({
  kind: 'delta',
  seq,
  trade: t,
});

describe('gate', () => {
  it('decides apply / ignore / gap', () => {
    expect(gate(10, false, 11)).toBe('apply');
    expect(gate(10, false, 10)).toBe('ignore');
    expect(gate(10, false, 3)).toBe('ignore');
    expect(gate(10, false, 13)).toBe('gap');
    expect(gate(10, true, 11)).toBe('ignore');
  });
});

describe('quote reducer', () => {
  it('applies a snapshot then in-order deltas', () => {
    let book = reduceQuote(initialBook, snap(10, quote('aapl', 1, 10)));
    book = reduceQuote(book, delta(11, quote('msft', 2, 11)));
    expect(book.lastSeq).toBe(11);
    expect(book.quotes.size).toBe(2);
    expect(book.needsResync).toBe(false);
    expect(book.applied).toBe(1);
  });

  it('ignores duplicates idempotently (same reference)', () => {
    const book = reduceQuote(initialBook, snap(10, quote('aapl', 1, 10)));
    expect(reduceQuote(book, delta(10, quote('aapl', 99, 10)))).toBe(book);
  });

  it('flags a gap and refuses to apply the out-of-order delta', () => {
    const book = reduceQuote(initialBook, snap(10, quote('aapl', 1, 10)));
    const gapped = reduceQuote(book, delta(13, quote('aapl', 5, 13)));
    expect(gapped.needsResync).toBe(true);
    expect(gapped.quotes.get(sym('aapl'))!.px).toBe(1);
    expect(gapped.lastSeq).toBe(10);
  });

  it('ignores deltas while waiting for a snapshot', () => {
    const book = reduceQuote(initialBook, delta(1, quote('x', 1, 1)));
    expect(book).toBe(initialBook);
    expect(book.quotes.size).toBe(0);
  });

  it('a snapshot clears the resync flag and replaces the quotes', () => {
    let book = reduceQuote(
      initialBook,
      snap(10, quote('a', 1, 10), quote('b', 2, 10))
    );
    book = reduceQuote(book, delta(20, quote('a', 9, 20)));
    expect(book.needsResync).toBe(true);
    book = reduceQuote(book, snap(30, quote('a', 7, 30)));
    expect(book.needsResync).toBe(false);
    expect(book.quotes.size).toBe(1);
    expect(book.lastSeq).toBe(30);
  });

  it('a heartbeat ahead of us means a lost delta', () => {
    const book = reduceQuote(initialBook, snap(10, quote('a', 1, 10)));
    expect(reduceQuote(book, {kind: 'heartbeat', seq: 10})).toBe(book);
    expect(reduceQuote(book, {kind: 'heartbeat', seq: 11}).needsResync).toBe(
      true
    );
  });

  it('tracks previous price, session open and tick history', () => {
    let book = reduceQuote(
      initialBook,
      snap(1, quote('a', 100, 1, 1, 1000)),
      0
    );
    book = reduceQuote(book, delta(2, quote('a', 101, 2, 1, 2000)));
    book = reduceQuote(book, delta(3, quote('a', 99, 3, 1, 3000)));
    expect(book.prev.get(sym('a'))).toBe(101);
    expect(book.open.get(sym('a'))).toBe(100);
    expect(book.ticks.get(sym('a'))!.map(t => t.px)).toEqual([100, 101, 99]);
    expect(book.ticks.get(sym('a'))![2].t).toBe(3000);
  });

  it('uses the fallback clock when a quote has no server time', () => {
    const book = reduceQuotes(initialBook, [snap(1, quote('a', 5, 1))], 777);
    expect(book.ticks.get(sym('a'))![0].t).toBe(777);
  });

  it('caps the tick history', () => {
    let book = reduceQuote(initialBook, snap(0, quote('a', 0, 0)));
    const msgs: QuoteMsg[] = [];
    for (let i = 1; i <= TICKS_MAX + 50; i++) {
      msgs.push(delta(i, quote('a', i, i)));
    }
    book = reduceQuotes(book, msgs, 0);
    expect(book.ticks.get(sym('a'))!.length).toBe(TICKS_MAX);
    expect(book.ticks.get(sym('a'))!.at(-1)!.px).toBe(TICKS_MAX + 50);
  });

  it('a batch equals applying the messages one by one', () => {
    const msgs = [
      snap(5, quote('a', 1, 5), quote('b', 2, 5)),
      delta(6, quote('a', 3, 6)),
      delta(7, quote('b', 4, 7)),
      delta(7, quote('b', 99, 7)),
      delta(8, quote('a', 5, 8)),
    ];
    const batch = reduceQuotes(initialBook, msgs, 0);
    let single = initialBook;
    for (const msg of msgs) {
      single = reduceQuote(single, msg, 0);
    }
    expect([...batch.quotes]).toEqual([...single.quotes]);
    expect(batch.lastSeq).toBe(single.lastSeq);
    expect(batch.applied).toBe(3);
  });

  it('never mutates the previous book', () => {
    const before = reduceQuote(initialBook, snap(1, quote('a', 1, 1)));
    const quotes = new Map(before.quotes);
    reduceQuote(before, delta(2, quote('a', 2, 2)));
    expect([...before.quotes]).toEqual([...quotes]);
  });
});

describe('trade reducer', () => {
  it('keeps the tape newest first and folds positions', () => {
    let tape = reduceTrades(initialTape, [
      tsnap(
        2,
        trade(2, 'AAPL', 'SELL', 40, 12_000_000),
        trade(1, 'AAPL', 'BUY', 100, 10_000_000)
      ),
    ]);
    expect(tape.trades.map(t => t.seq)).toEqual([2, 1]);
    const position = tape.positions.get('ACC|AAPL')!;
    expect(position.netQty).toBe(60);
    expect(position.realizedMicros).toBe(80_000_000n);
    tape = reduceTrades(tape, [
      tdelta(3, trade(3, 'AAPL', 'BUY', 10, 11_000_000)),
    ]);
    expect(tape.trades.map(t => t.seq)).toEqual([3, 2, 1]);
    expect(tape.positions.get('ACC|AAPL')!.netQty).toBe(70);
    expect(tape.applied).toBe(1);
  });

  it('a batch of deltas lands newest first', () => {
    const base = reduceTrades(initialTape, [tsnap(0)]);
    const tape = reduceTrades(base, [
      tdelta(1, trade(1)),
      tdelta(2, trade(2)),
      tdelta(3, trade(3)),
    ]);
    expect(tape.trades.map(t => t.seq)).toEqual([3, 2, 1]);
  });

  it('ignores duplicates, flags gaps, ignores while waiting', () => {
    const base = reduceTrades(initialTape, [tsnap(5, trade(5))]);
    expect(reduceTrades(base, [tdelta(5, trade(5))])).toBe(base);
    const gapped = reduceTrades(base, [tdelta(9, trade(9))]);
    expect(gapped.needsResync).toBe(true);
    expect(gapped.trades.length).toBe(1);
    expect(reduceTrades(initialTape, [tdelta(1, trade(1))])).toBe(initialTape);
  });

  it('a gap in the middle of a batch keeps what was applied before it', () => {
    const base = reduceTrades(initialTape, [tsnap(0)]);
    const tape = reduceTrades(base, [
      tdelta(1, trade(1)),
      tdelta(5, trade(5)),
      tdelta(2, trade(2)),
    ]);
    expect(tape.trades.map(t => t.seq)).toEqual([1]);
    expect(tape.needsResync).toBe(true);
  });

  it('bounds the tape', () => {
    const base = reduceTrades(initialTape, [tsnap(0)]);
    const msgs: TradeMsg[] = [];
    for (let i = 1; i <= TAPE_MAX + 20; i++) {
      msgs.push(tdelta(i, trade(i)));
    }
    const tape = reduceTrades(base, msgs);
    expect(tape.trades.length).toBe(TAPE_MAX);
    expect(tape.trades[0].seq).toBe(TAPE_MAX + 20);
  });

  it('heartbeat ahead means a lost delta', () => {
    const base = reduceTrades(initialTape, [tsnap(3)]);
    expect(reduceTrades(base, [{kind: 'heartbeat', seq: 3}])).toBe(base);
    expect(reduceTrades(base, [{kind: 'heartbeat', seq: 4}]).needsResync).toBe(
      true
    );
  });
});
