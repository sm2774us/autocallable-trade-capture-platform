import {
  DEFAULT_LAYOUT,
  PANEL_IDS,
  normalizeSizes,
  parseLayout,
  swapPanels,
} from './layout';

describe('layout persistence', () => {
  it('falls back to the default for missing or corrupt storage', () => {
    expect(parseLayout(null)).toBe(DEFAULT_LAYOUT);
    expect(parseLayout('{not json')).toBe(DEFAULT_LAYOUT);
    expect(parseLayout('42')).toBe(DEFAULT_LAYOUT);
    expect(parseLayout('null')).toBe(DEFAULT_LAYOUT);
  });

  it('round-trips a valid layout', () => {
    const saved = {
      ...DEFAULT_LAYOUT,
      theme: 'light',
      density: 'cozy',
      sym: 'MSFT',
      chartKind: 'area',
      frameSec: 15,
    };
    const parsed = parseLayout(JSON.stringify(saved));
    expect(parsed.theme).toBe('light');
    expect(parsed.density).toBe('cozy');
    expect(parsed.sym).toBe('MSFT');
    expect(parsed.chartKind).toBe('area');
    expect(parsed.frameSec).toBe(15);
  });

  it('repairs each bad field independently', () => {
    const parsed = parseLayout(
      JSON.stringify({
        order: ['quotes', 'quotes'],
        cols: [1, 2],
        rows: 'x',
        theme: 'neon',
        frameSec: 7,
        sym: 5,
      })
    );
    expect(parsed.order).toEqual(DEFAULT_LAYOUT.order);
    expect(parsed.cols).toEqual(DEFAULT_LAYOUT.cols);
    expect(parsed.rows).toEqual(DEFAULT_LAYOUT.rows);
    expect(parsed.theme).toBe('dark');
    expect(parsed.frameSec).toBe(1);
    expect(parsed.sym).toBeNull();
  });

  it('accepts a permutation of the panels', () => {
    const order = [...PANEL_IDS].reverse();
    expect(parseLayout(JSON.stringify({order})).order).toEqual(order);
  });

  it('normalises sizes to 100 and rejects junk', () => {
    expect(normalizeSizes([1, 1], 2, [50, 50])).toEqual([50, 50]);
    const [a, b, c] = normalizeSizes([20, 30, 50], 3, [1, 1, 1]);
    expect(a + b + c).toBeCloseTo(100);
    expect(normalizeSizes([1, -1], 2, [60, 40])).toEqual([60, 40]);
    expect(normalizeSizes([1, 2, 3], 2, [60, 40])).toEqual([60, 40]);
    expect(normalizeSizes([NaN, 1], 2, [60, 40])).toEqual([60, 40]);
  });

  it('swaps two panels and ignores nonsense', () => {
    const next = swapPanels(DEFAULT_LAYOUT.order, 'quotes', 'ticket');
    expect(next[0]).toBe('ticket');
    expect(next[4]).toBe('quotes');
    expect(DEFAULT_LAYOUT.order[0]).toBe('quotes');
    expect(swapPanels(DEFAULT_LAYOUT.order, 'quotes', 'quotes')).toBe(
      DEFAULT_LAYOUT.order
    );
    expect(swapPanels(DEFAULT_LAYOUT.order, 'quotes', 'nope' as never)).toBe(
      DEFAULT_LAYOUT.order
    );
  });
});
