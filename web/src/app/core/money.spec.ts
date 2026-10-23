import {
  MICROS,
  compact,
  fmtClock,
  fmtMicros,
  fmtQty,
  fmtSigned,
  microsToNumber,
  notionalMicros,
  toMicros,
  vwapMicros,
} from './money';

describe('money (fixed point)', () => {
  it('converts a decimal price to integer micros', () => {
    expect(toMicros(187.25)).toBe(187_250_000n);
    expect(toMicros(0.000001)).toBe(1n);
    // 0.1 + 0.2 is the classic float trap; micros do not care.
    expect(toMicros(0.1 + 0.2)).toBe(300_000n);
  });

  it('formats micros with exact rounding, half away from zero', () => {
    expect(fmtMicros(187_250_000n)).toBe('187.25');
    expect(fmtMicros(1_005_000n, 2)).toBe('1.01');
    expect(fmtMicros(1_004_999n, 2)).toBe('1.00');
    expect(fmtMicros(-1_005_000n, 2)).toBe('-1.01');
    expect(fmtMicros(1_234_567_890_000n, 2)).toBe('1,234,567.89');
    expect(fmtMicros(1_500_000n, 0)).toBe('2');
    expect(fmtMicros(1_234_567n, 6)).toBe('1.234567');
  });

  it('never prints a negative zero', () => {
    expect(fmtMicros(-4_000n, 2)).toBe('0.00');
  });

  it('accepts a plain number of micros too', () => {
    expect(fmtMicros(2_500_000, 1)).toBe('2.5');
  });

  it('formats signed P&L', () => {
    expect(fmtSigned(12_500_000n)).toBe('+12.50');
    expect(fmtSigned(-3_000_000n)).toBe('-3.00');
    expect(fmtSigned(0n)).toBe('0.00');
    expect(fmtSigned(1_000n)).toBe('0.00');
  });

  it('formats quantities', () => {
    expect(fmtQty(12500)).toBe('12,500');
    expect(fmtQty(-1234567)).toBe('-1,234,567');
    expect(fmtQty(7)).toBe('7');
  });

  it('computes exact notional and VWAP', () => {
    expect(notionalMicros(100, 187_250_000)).toBe(18_725_000_000n);
    const vwap = vwapMicros([
      {qty: 100, pxMicros: 10_000_000},
      {qty: 300, pxMicros: 20_000_000},
    ]);
    expect(vwap).toBe(17_500_000n);
    expect(vwapMicros([])).toBeNull();
  });

  it('rounds VWAP half up', () => {
    // (1 * 1 + 1 * 2) / 2 = 1.5 micros, rounds to 2.
    expect(
      vwapMicros([
        {qty: 1, pxMicros: 1},
        {qty: 1, pxMicros: 2},
      ])
    ).toBe(2n);
  });

  it('formats compactly', () => {
    expect([
      compact(1_250_000),
      compact(-3_000),
      compact(999),
      compact(2_000_000_000),
      compact(null),
      compact(NaN),
    ]).toEqual(['1.25M', '-3K', '999', '2B', '—', '—']);
  });

  it('formats UTC clock text with milliseconds', () => {
    expect(fmtClock(Date.UTC(2026, 0, 1, 7, 42, 11, 382))).toBe('07:42:11.382');
  });

  it('exposes the scale and a chart-only conversion', () => {
    expect(MICROS).toBe(1_000_000);
    expect(microsToNumber(1_500_000n)).toBe(1.5);
  });
});
