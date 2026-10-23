import {Tick} from './feed.reducer';

/** One candle; `time` is the bucket start in epoch seconds. */
export interface Candle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/**
 * Aggregates ticks into fixed-width candles. Buckets without ticks are simply
 * absent (a quiet name draws gaps, not invented prices).
 *
 * @param ticks Ticks, oldest first.
 * @param bucketSec Candle width in seconds, positive.
 * @return Candles in ascending, unique time order.
 */
export function toCandles(ticks: readonly Tick[], bucketSec: number): Candle[] {
  const out: Candle[] = [];
  for (const tick of ticks) {
    const time = Math.floor(tick.t / 1000 / bucketSec) * bucketSec;
    const last = out[out.length - 1];
    if (last && last.time === time) {
      out[out.length - 1] = {
        time,
        open: last.open,
        high: Math.max(last.high, tick.px),
        low: Math.min(last.low, tick.px),
        close: tick.px,
      };
    } else if (!last || time > last.time) {
      out.push({
        time,
        open: tick.px,
        high: tick.px,
        low: tick.px,
        close: tick.px,
      });
    }
    // A tick older than the last bucket is dropped: charts need ascending time.
  }
  return out;
}
