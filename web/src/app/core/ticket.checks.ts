/** Autocallable note terms as entered on the ticket. */
export interface Terms {
  underlying: string;
  notional: number;
  couponRate: number;
  couponBarrier: number;
  autocallBarrier: number;
  kiBarrier: number;
}

/** Hard ceiling on notional, mirrored by the server (`NoteTerms`). */
export const MAX_NOTIONAL = 1_000_000_000;

/** Notional at or above which the ticket asks for a second confirmation. */
export const LARGE_NOTIONAL = 25_000_000;

/** Severity of one pre-trade check. */
export type CheckLevel = 'ok' | 'warn' | 'error';

/** One line of the pre-trade checklist. */
export interface Check {
  readonly id: string;
  readonly level: CheckLevel;
  readonly label: string;
  readonly detail: string;
  /** Form field the check is about, to highlight it. */
  readonly field?: keyof Terms;
}

/**
 * Counts decimal places of a number without floating-point surprises.
 *
 * @param value Any finite number.
 * @return Number of digits after the decimal point.
 */
export function decimals(value: number): number {
  const text = String(value);
  if (text.includes('e-')) {
    const [mantissa, exponent] = text.split('e-');
    return (mantissa.split('.')[1]?.length ?? 0) + Number(exponent);
  }
  return text.split('.')[1]?.length ?? 0;
}

/**
 * The instant pre-trade risk gate. It runs on every keystroke, in the browser,
 * on the same rules the server re-checks in `NoteTerms.parse`.
 *
 * @param terms Current form values; non-finite numbers count as missing.
 * @return The full checklist, errors first.
 */
export function preTradeChecks(terms: Partial<Terms>): Check[] {
  const checks: Check[] = [];
  const add = (
    id: string,
    level: CheckLevel,
    label: string,
    detail: string,
    field?: keyof Terms
  ): void => {
    checks.push({id, level, label, detail, field});
  };
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const underlying = (terms.underlying ?? '').trim();
  if (/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(underlying)) {
    add('underlying', 'ok', 'Underlying', underlying, 'underlying');
  } else {
    add(
      'underlying',
      'error',
      'Underlying',
      'Use 1-12 chars of A-Z 0-9 . -',
      'underlying'
    );
  }

  const notional = num(terms.notional);
  if (notional === null || notional <= 0) {
    add('notional', 'error', 'Notional', 'Must be positive', 'notional');
  } else if (notional > MAX_NOTIONAL) {
    add(
      'notional',
      'error',
      'Notional',
      'Above the 1,000,000,000 hard limit',
      'notional'
    );
  } else if (decimals(notional) > 2) {
    add(
      'notional',
      'error',
      'Notional',
      'At most 2 decimal places',
      'notional'
    );
  } else if (notional >= LARGE_NOTIONAL) {
    add(
      'notional',
      'warn',
      'Notional',
      'Large ticket: second confirmation required',
      'notional'
    );
  } else {
    add('notional', 'ok', 'Notional', 'Within limits', 'notional');
  }

  const rate = num(terms.couponRate);
  if (rate === null || rate < 0 || rate > 1) {
    add(
      'couponRate',
      'error',
      'Coupon rate',
      'Fraction between 0 and 1',
      'couponRate'
    );
  } else if (decimals(rate) > 4) {
    add(
      'couponRate',
      'error',
      'Coupon rate',
      'At most 4 decimal places',
      'couponRate'
    );
  } else if (rate > 0.05) {
    add(
      'couponRate',
      'warn',
      'Coupon rate',
      'Above 5% per period: confirm',
      'couponRate'
    );
  } else {
    add('couponRate', 'ok', 'Coupon rate', 'Within limits', 'couponRate');
  }

  const barriers: Array<[keyof Terms, string]> = [
    ['couponBarrier', 'Coupon barrier'],
    ['autocallBarrier', 'Autocall barrier'],
    ['kiBarrier', 'KI barrier'],
  ];
  let barriersValid = true;
  for (const [field, label] of barriers) {
    const value = num(terms[field]);
    if (value === null || value <= 0 || value > 200) {
      barriersValid = false;
      add(field, 'error', label, 'Above 0 and at most 200 %', field);
    } else if (decimals(value) > 2) {
      barriersValid = false;
      add(field, 'error', label, 'At most 2 decimal places', field);
    } else {
      add(field, 'ok', label, value + ' %', field);
    }
  }

  if (barriersValid) {
    const knockIn = terms.kiBarrier as number;
    const coupon = terms.couponBarrier as number;
    const autocall = terms.autocallBarrier as number;
    if (!(knockIn < coupon)) {
      add(
        'order-ki',
        'error',
        'Barrier order',
        'KI barrier must be below the coupon barrier',
        'kiBarrier'
      );
    } else if (!(coupon <= autocall)) {
      add(
        'order-coupon',
        'error',
        'Barrier order',
        'Coupon barrier cannot exceed autocall barrier',
        'couponBarrier'
      );
    } else {
      add('order', 'ok', 'Barrier order', 'KI < coupon ≤ autocall', undefined);
      if (knockIn < 50) {
        add(
          'deep-ki',
          'warn',
          'Deep knock-in',
          'KI below 50 %: confirm',
          'kiBarrier'
        );
      }
    }
  }
  const rank: Record<CheckLevel, number> = {error: 0, warn: 1, ok: 2};
  return checks
    .map((check, index) => ({check, index}))
    .sort(
      (a, b) => rank[a.check.level] - rank[b.check.level] || a.index - b.index
    )
    .map(entry => entry.check);
}

/**
 * Whether any check blocks booking.
 *
 * @param checks The checklist.
 * @return True when there is no error.
 */
export function canBook(checks: readonly Check[]): boolean {
  return checks.every(check => check.level !== 'error');
}

/**
 * Whether booking needs a second confirmation.
 *
 * @param checks The checklist.
 * @return True when at least one warning is present.
 */
export function needsConfirm(checks: readonly Check[]): boolean {
  return checks.some(check => check.level === 'warn');
}

/** Modifier keys held while stepping a size. */
export interface StepMods {
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/**
 * Next notional when the trader nudges the size with a hotkey or wheel.
 * Plain: 100K, Shift: 1M, Alt: 10M. Never below zero or above the hard limit.
 *
 * @param current The current notional.
 * @param direction +1 to increase, -1 to decrease.
 * @param mods Held modifier keys.
 * @return The new notional, an exact multiple of the step.
 */
export function stepNotional(
  current: number,
  direction: 1 | -1,
  mods: StepMods = {}
): number {
  const step = mods.alt ? 10_000_000 : mods.shift ? 1_000_000 : 100_000;
  const base = Number.isFinite(current) ? current : 0;
  const snapped =
    direction === 1
      ? (Math.floor(base / step) + 1) * step
      : (Math.ceil(base / step) - 1) * step;
  return Math.min(MAX_NOTIONAL, Math.max(0, snapped));
}
