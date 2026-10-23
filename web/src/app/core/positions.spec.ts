import {Trade, sym} from './models';
import {
  applyFill,
  avgPriceMicros,
  bookFill,
  bookFromTape,
  positionKey,
  unrealizedMicros,
} from './positions';

const fill = (side: 'BUY' | 'SELL', qty: number, pxMicros: number) => ({
  account: 'ACC',
  sym: 'AAPL',
  side,
  qty,
  pxMicros,
});

describe('positions (average cost, exact)', () => {
  it('opens and adds to a long', () => {
    let p = applyFill(undefined, fill('BUY', 100, 10_000_000));
    p = applyFill(p, fill('BUY', 100, 12_000_000));
    expect(p.netQty).toBe(200);
    expect(p.costMicros).toBe(2_200_000_000n);
    expect(avgPriceMicros(p)).toBe(11_000_000n);
    expect(p.boughtQty).toBe(200);
    expect(p.fills).toBe(2);
  });

  it('realises profit when reducing, at the average cost', () => {
    let p = applyFill(undefined, fill('BUY', 100, 10_000_000));
    p = applyFill(p, fill('SELL', 40, 12_000_000));
    expect(p.netQty).toBe(60);
    expect(p.realizedMicros).toBe(80_000_000n);
    expect(p.costMicros).toBe(600_000_000n);
  });

  it('realises profit on a short that is bought back lower', () => {
    let p = applyFill(undefined, fill('SELL', 100, 10_000_000));
    p = applyFill(p, fill('BUY', 40, 8_000_000));
    expect(p.netQty).toBe(-60);
    expect(p.realizedMicros).toBe(80_000_000n);
  });

  it('closes completely: cost resets to zero', () => {
    let p = applyFill(undefined, fill('BUY', 100, 10_000_000));
    p = applyFill(p, fill('SELL', 100, 9_000_000));
    expect(p.netQty).toBe(0);
    expect(p.costMicros).toBe(0n);
    expect(p.realizedMicros).toBe(-100_000_000n);
    expect(avgPriceMicros(p)).toBeNull();
  });

  it('flips through zero: old side closed, new side opens at the fill price', () => {
    let p = applyFill(undefined, fill('BUY', 100, 10_000_000));
    p = applyFill(p, fill('SELL', 150, 12_000_000));
    expect(p.netQty).toBe(-50);
    expect(p.realizedMicros).toBe(200_000_000n);
    expect(p.costMicros).toBe(-600_000_000n);
    expect(avgPriceMicros(p)).toBe(12_000_000n);
  });

  it('computes unrealised profit against a mark', () => {
    const long = applyFill(undefined, fill('BUY', 100, 10_000_000));
    expect(unrealizedMicros(long, 11_000_000n)).toBe(100_000_000n);
    const short = applyFill(undefined, fill('SELL', 100, 10_000_000));
    expect(unrealizedMicros(short, 11_000_000n)).toBe(-100_000_000n);
  });

  it('total profit is independent of how fills are grouped', () => {
    let a = applyFill(undefined, fill('BUY', 100, 10_000_000));
    a = applyFill(a, fill('SELL', 100, 11_000_000));
    let b = applyFill(undefined, fill('BUY', 50, 10_000_000));
    b = applyFill(b, fill('BUY', 50, 10_000_000));
    b = applyFill(b, fill('SELL', 100, 11_000_000));
    expect(a.realizedMicros).toBe(b.realizedMicros);
  });

  it('bookFromTape equals folding the same fills incrementally', () => {
    const mk = (
      seq: number,
      side: 'BUY' | 'SELL',
      qty: number,
      px: number
    ): Trade => ({
      id: 't' + seq,
      source: 's',
      account: 'ACC',
      sym: sym('AAPL'),
      side,
      qty,
      pxMicros: px,
      seq,
      ts: seq,
    });
    const oldestFirst = [
      mk(1, 'BUY', 100, 10_000_000),
      mk(2, 'SELL', 30, 11_000_000),
      mk(3, 'BUY', 5, 9_000_000),
    ];
    let incremental = new Map();
    for (const t of oldestFirst) {
      incremental = new Map(bookFill(incremental, t));
    }
    const fromTape = bookFromTape([...oldestFirst].reverse());
    expect(fromTape.get(positionKey('ACC', 'AAPL'))).toEqual(
      incremental.get(positionKey('ACC', 'AAPL'))
    );
  });

  it('keys positions per account and symbol', () => {
    expect(positionKey('A', 'X')).toBe('A|X');
  });
});
