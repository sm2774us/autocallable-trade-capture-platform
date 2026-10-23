import {
  MonoTypeOperatorFunction,
  Observable,
  SchedulerLike,
  asyncScheduler,
  timer,
} from 'rxjs';
import {bufferTime, filter, map, repeat, retry} from 'rxjs/operators';

import {Quote, Sym} from './models';

/**
 * Collapses a burst into one Map per frame: last write wins per symbol
 * (conflation). Safe for display, never for accounting.
 *
 * @param frameMs The frame length in milliseconds.
 * @param scheduler The scheduler that drives the frames; inject a test
 *     scheduler in tests.
 * @return An operator that emits one conflated map per non-empty frame.
 */
export function conflateBySymbol(
  frameMs: number,
  scheduler: SchedulerLike = asyncScheduler
): (source: Observable<Quote>) => Observable<ReadonlyMap<Sym, Quote>> {
  return (source: Observable<Quote>): Observable<ReadonlyMap<Sym, Quote>> =>
    source.pipe(
      bufferTime(frameMs, null, Number.MAX_SAFE_INTEGER, scheduler),
      filter(batch => batch.length > 0),
      map(batch => {
        const latest = new Map<Sym, Quote>();
        for (const quote of batch) {
          latest.set(quote.sym, quote);
        }
        return latest;
      })
    );
}

/**
 * Groups messages into one array per frame, preserving order and losing
 * nothing. Unlike conflation this is safe for sequenced feeds, because the
 * reducer must see every sequence number.
 *
 * @param frameMs Frame length; zero or less passes messages through one by one.
 * @param scheduler Scheduler driving the frames.
 * @return An operator emitting one non-empty batch per frame.
 */
export function frameBatch<T>(
  frameMs: number,
  scheduler: SchedulerLike = asyncScheduler
): (source: Observable<T>) => Observable<T[]> {
  return (source: Observable<T>): Observable<T[]> =>
    frameMs > 0
      ? source.pipe(
          bufferTime(frameMs, null, Number.MAX_SAFE_INTEGER, scheduler),
          filter(batch => batch.length > 0)
        )
      : source.pipe(map(item => [item]));
}

/** Settings for {@link retryWithBackoff}. */
export interface BackoffCfg {
  /** Delay before the first retry, in milliseconds. */
  baseMs: number;

  /** Upper bound for any delay, in milliseconds. */
  capMs: number;

  /** Maximum number of retries before the error propagates. */
  maxAttempts: number;

  /** Returns a multiplier in (0, 1]; defaults to 0.5..1 random jitter. */
  jitter?: () => number;
}

/**
 * Delay for the n-th attempt: min(cap, base * 2^(n-1)) * jitter.
 *
 * @param cfg Back-off settings.
 * @param attempt 1-based attempt number.
 * @return Milliseconds to wait.
 */
export function backoffMs(cfg: BackoffCfg, attempt: number): number {
  const jitter = cfg.jitter ?? (() => 0.5 + Math.random() / 2);
  return Math.min(cfg.capMs, cfg.baseMs * 2 ** (attempt - 1)) * jitter();
}

/**
 * Exponential back-off with jitter for reconnects.
 *
 * @param cfg The back-off settings.
 * @return An operator that resubscribes on error with growing delays.
 */
export function retryWithBackoff<T>(
  cfg: BackoffCfg
): MonoTypeOperatorFunction<T> {
  return retry<T>({
    count: cfg.maxAttempts,
    delay: (_error, attempt) => timer(backoffMs(cfg, attempt)),
  });
}

/**
 * Keeps a source alive forever: reconnects after errors with back-off, and also
 * after a clean completion. A WebSocket that the server closes normally
 * completes the RxJS stream; without `repeat` the app would stay silently dead
 * (finding F-11).
 *
 * @param cfg The back-off settings.
 * @return An operator that never completes on its own.
 */
export function resilient<T>(cfg: BackoffCfg): MonoTypeOperatorFunction<T> {
  return source =>
    source.pipe(
      retry({
        count: cfg.maxAttempts,
        delay: (_error, attempt) => timer(backoffMs(cfg, attempt)),
        resetOnSuccess: true,
      }),
      repeat({delay: count => timer(backoffMs(cfg, count))})
    );
}
