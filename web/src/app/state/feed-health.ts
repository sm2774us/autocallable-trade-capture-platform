import {computed, signal} from '@angular/core';

import {FeedStatus} from '../core/models';

/**
 * Connection-health signals shared by the quote and trade stores: when did a
 * message last arrive, how many per second, and is the feed stale.
 *
 * @param now Clock (injectable).
 * @param staleMs Silence after which the feed is stale.
 * @param needsResync Reads the book's resync flag.
 * @return Signals and the two mutators.
 */
export function createFeedHealth(
  now: () => number,
  staleMs: number,
  needsResync: () => boolean
) {
  const lastMsgAt = signal(0);
  const clock = signal(now());
  const perSec = signal(0);
  let windowCount = 0;

  const status = computed<FeedStatus>(() => {
    if (lastMsgAt() === 0) {
      return 'connecting';
    }
    if (clock() - lastMsgAt() > staleMs) {
      return 'stale';
    }
    return needsResync() ? 'resync' : 'live';
  });

  return {
    lastMsgAt: lastMsgAt.asReadonly(),
    perSec: perSec.asReadonly(),
    status,
    /** Called with the size of every flushed batch. */
    noteMessages(count: number): void {
      windowCount += count;
      lastMsgAt.set(now());
      clock.set(lastMsgAt());
    },
    /** Called once per second: publishes the rate and refreshes the clock. */
    tick(): void {
      perSec.set(windowCount);
      windowCount = 0;
      clock.set(now());
    },
  };
}

/** Return type of {@link createFeedHealth}. */
export type FeedHealth = ReturnType<typeof createFeedHealth>;
