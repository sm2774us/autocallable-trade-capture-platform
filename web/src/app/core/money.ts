/** Millionths per currency unit: the fixed-point scale used end to end. */
export const MICROS = 1_000_000;

const MICROS_BIG = 1_000_000n;

/**
 * Converts a decimal price into integer micros.
 *
 * @param px A decimal price such as 187.25.
 * @return The price in millionths, rounded to the nearest micro.
 */
export function toMicros(px: number): bigint {
  return BigInt(Math.round(px * MICROS));
}

/**
 * Inserts thousands separators into a string of digits.
 *
 * @param digits Non-negative integer text.
 * @return For example "1,234,567".
 */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats micros as a decimal with exact (integer) rounding, half away from
 * zero. No floating point is involved.
 *
 * @param value Amount in millionths.
 * @param dp Decimal places to show, 0..6.
 * @return For example "187.25" or "-1,234.50".
 */
export function fmtMicros(value: bigint | number, dp = 2): string {
  const raw = typeof value === 'bigint' ? value : BigInt(Math.round(value));
  const negative = raw < 0n;
  let magnitude = negative ? -raw : raw;
  const places = Math.min(6, Math.max(0, dp));
  const scale = 10n ** BigInt(6 - places);
  magnitude = (magnitude + scale / 2n) / scale;
  const base = 10n ** BigInt(places);
  const whole = magnitude / base;
  const fraction = magnitude % base;
  const text =
    group(whole.toString()) +
    (places ? '.' + fraction.toString().padStart(places, '0') : '');
  return negative && magnitude !== 0n ? '-' + text : text;
}

/**
 * Like {@link fmtMicros} but always shows a sign, for P&L columns.
 *
 * @param value Amount in millionths.
 * @param dp Decimal places.
 * @return For example "+12.50", "-3.00" or "0.00".
 */
export function fmtSigned(value: bigint, dp = 2): string {
  const text = fmtMicros(value, dp);
  if (text.startsWith('-')) {
    return text;
  }
  return /[1-9]/.test(text) ? '+' + text : text;
}

/**
 * Formats a quantity with thousands separators.
 *
 * @param qty A whole number.
 * @return For example "12,500".
 */
export function fmtQty(qty: number): string {
  const text = group(Math.abs(Math.trunc(qty)).toString());
  return qty < 0 ? '-' + text : text;
}

/**
 * Notional of a fill.
 *
 * @param qty Quantity.
 * @param pxMicros Price in micros.
 * @return Quantity times price, in micros, exact.
 */
export function notionalMicros(qty: number, pxMicros: number): bigint {
  return BigInt(qty) * BigInt(pxMicros);
}

/**
 * Volume-weighted average price in micros, exact in BigInt.
 *
 * @param fills The fills to average.
 * @return The VWAP rounded half up, or null for no quantity.
 */
export function vwapMicros(
  fills: ReadonlyArray<{readonly qty: number; readonly pxMicros: number}>
): bigint | null {
  let quantity = 0n;
  let value = 0n;
  for (const fill of fills) {
    quantity += BigInt(fill.qty);
    value += notionalMicros(fill.qty, fill.pxMicros);
  }
  return quantity === 0n ? null : (value * 2n + quantity) / (quantity * 2n);
}

/**
 * Formats a number compactly: 1_250_000 becomes "1.25M".
 *
 * @param value The amount; null, undefined and NaN render as an em dash.
 * @return The compact text.
 */
export function compact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  const magnitude = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const scaled = (unit: number): string =>
    (magnitude / unit).toFixed(2).replace(/\.?0+$/, '');
  if (magnitude >= 1e9) {
    return sign + scaled(1e9) + 'B';
  }
  if (magnitude >= 1e6) {
    return sign + scaled(1e6) + 'M';
  }
  if (magnitude >= 1e3) {
    return sign + scaled(1e3) + 'K';
  }
  return sign + magnitude.toString();
}

/**
 * Formats epoch milliseconds as UTC time with milliseconds.
 *
 * @param ms Epoch milliseconds.
 * @return For example "07:42:11.382".
 */
export function fmtClock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 23);
}

/**
 * Converts micros to a plain number for charting only; never for accounting.
 *
 * @param value Amount in millionths.
 * @return A double.
 */
export function microsToNumber(value: bigint): number {
  return Number(value) / Number(MICROS_BIG);
}
