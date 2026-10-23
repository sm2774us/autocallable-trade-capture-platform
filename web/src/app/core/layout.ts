/** Identifiers of the six workspace panels. */
export const PANEL_IDS = [
  'quotes',
  'tape',
  'chart',
  'positions',
  'ticket',
  'notes',
] as const;

/** One panel. */
export type PanelId = (typeof PANEL_IDS)[number];

/** Human titles. */
export const PANEL_TITLES: Readonly<Record<PanelId, string>> = {
  quotes: 'Quote Board',
  tape: 'Trade Tape',
  chart: 'Chart',
  positions: 'Positions & P&L',
  ticket: 'Note Ticket',
  notes: 'Booked Notes',
};

/** Colour theme. */
export type Theme = 'dark' | 'light';

/** Row density. */
export type Density = 'compact' | 'cozy';

/** Chart style. */
export type ChartKind = 'candles' | 'area';

/** Everything the workspace remembers between sessions. */
export interface Layout {
  readonly v: 1;
  /** Slot order: column 0 top, column 0 bottom, column 1 top, ... */
  readonly order: readonly PanelId[];
  /** Column widths in percent, summing to 100. */
  readonly cols: readonly number[];
  /** Row heights in percent for each column, each pair summing to 100. */
  readonly rows: readonly (readonly number[])[];
  readonly theme: Theme;
  readonly density: Density;
  /** Selected symbol, or null for "first available". */
  readonly sym: string | null;
  readonly chartKind: ChartKind;
  /** Candle width in seconds. */
  readonly frameSec: number;
}

/** Storage key; bump the version in the key when the shape changes. */
export const LAYOUT_KEY = 'trade-capture.layout.v1';

/** The factory layout. */
export const DEFAULT_LAYOUT: Layout = {
  v: 1,
  order: ['quotes', 'tape', 'chart', 'positions', 'ticket', 'notes'],
  cols: [32, 40, 28],
  rows: [
    [58, 42],
    [58, 42],
    [64, 36],
  ],
  theme: 'dark',
  density: 'compact',
  sym: null,
  chartKind: 'candles',
  frameSec: 1,
};

/** Allowed candle widths in seconds. */
export const FRAMES: readonly number[] = [1, 5, 15, 60];

/**
 * Scales positive sizes so they sum to 100.
 *
 * @param sizes Raw percentages.
 * @param count Required length.
 * @param fallback Sizes to use when the input is unusable.
 * @return Sizes that sum to 100 (within rounding).
 */
export function normalizeSizes(
  sizes: unknown,
  count: number,
  fallback: readonly number[]
): number[] {
  if (
    !Array.isArray(sizes) ||
    sizes.length !== count ||
    sizes.some(s => typeof s !== 'number' || !Number.isFinite(s) || s <= 0)
  ) {
    return [...fallback];
  }
  const total = (sizes as number[]).reduce((a, b) => a + b, 0);
  return (sizes as number[]).map(s => (s / total) * 100);
}

/**
 * Parses stored JSON into a valid layout; every bad field falls back to its
 * default, so a corrupt or old entry can never break start-up.
 *
 * @param json Stored text, or null.
 * @return A valid layout.
 */
export function parseLayout(json: string | null): Layout {
  if (!json) {
    return DEFAULT_LAYOUT;
  }
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_LAYOUT;
    }
    raw = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_LAYOUT;
  }
  const order = raw['order'];
  const validOrder =
    Array.isArray(order) &&
    order.length === PANEL_IDS.length &&
    PANEL_IDS.every(id => order.includes(id));
  const rows = raw['rows'];
  return {
    v: 1,
    order: validOrder ? (order as PanelId[]) : DEFAULT_LAYOUT.order,
    cols: normalizeSizes(raw['cols'], 3, DEFAULT_LAYOUT.cols),
    rows: [0, 1, 2].map(i =>
      normalizeSizes(
        Array.isArray(rows) ? rows[i] : undefined,
        2,
        DEFAULT_LAYOUT.rows[i]
      )
    ),
    theme: raw['theme'] === 'light' ? 'light' : 'dark',
    density: raw['density'] === 'cozy' ? 'cozy' : 'compact',
    sym: typeof raw['sym'] === 'string' ? (raw['sym'] as string) : null,
    chartKind: raw['chartKind'] === 'area' ? 'area' : 'candles',
    frameSec: FRAMES.includes(raw['frameSec'] as number)
      ? (raw['frameSec'] as number)
      : DEFAULT_LAYOUT.frameSec,
  };
}

/**
 * Swaps two panels in the slot order.
 *
 * @param order Current order.
 * @param a First panel.
 * @param b Second panel.
 * @return A new order; unchanged if either id is missing or they are equal.
 */
export function swapPanels(
  order: readonly PanelId[],
  a: PanelId,
  b: PanelId
): readonly PanelId[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0 || i === j) {
    return order;
  }
  const next = [...order];
  next[i] = b;
  next[j] = a;
  return next;
}
