import {toCandles} from './ohlc';

const tick = (sec: number, px: number) => ({t: sec * 1000 + 250, px});

describe('toCandles', () => {
  it('aggregates ticks into open/high/low/close per bucket', () => {
    const candles = toCandles(
      [tick(10, 5), tick(10, 7), tick(10, 4), tick(10, 6), tick(11, 6.5)],
      1
    );
    expect(candles).toEqual([
      {time: 10, open: 5, high: 7, low: 4, close: 6},
      {time: 11, open: 6.5, high: 6.5, low: 6.5, close: 6.5},
    ]);
  });

  it('buckets by width and leaves gaps empty', () => {
    const candles = toCandles([tick(3, 1), tick(7, 2), tick(31, 3)], 5);
    expect(candles.map(c => c.time)).toEqual([0, 5, 30]);
  });

  it('drops ticks older than the last bucket and keeps times unique ascending', () => {
    const candles = toCandles([tick(20, 1), tick(10, 99), tick(21, 2)], 1);
    expect(candles.map(c => c.time)).toEqual([20, 21]);
    expect(candles[0].high).toBe(1);
  });

  it('returns nothing for no ticks', () => {
    expect(toCandles([], 1)).toEqual([]);
  });
});
