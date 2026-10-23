package com.example.capture.core;

import java.util.random.RandomGenerator;

/**
 * Exponential back-off with a cap and optional full jitter. This is the schedule that Spring's
 * {@code ExponentialBackOffWithMaxRetries} produces, written out so it can be reasoned about and
 * unit-tested.
 */
public final class BackoffPolicy {

  private final long initialMillis;
  private final double multiplier;
  private final long maxMillis;
  private final int maxRetries;

  /**
   * Creates a policy.
   *
   * @param initialMillis delay before the first retry, positive
   * @param multiplier growth factor per retry, at least 1.0
   * @param maxMillis cap for any single delay
   * @param maxRetries number of retries before the record is dead-lettered
   */
  public BackoffPolicy(long initialMillis, double multiplier, long maxMillis, int maxRetries) {
    if (initialMillis <= 0 || multiplier < 1.0 || maxMillis < initialMillis || maxRetries < 0) {
      throw new IllegalArgumentException("invalid back-off parameters");
    }
    this.initialMillis = initialMillis;
    this.multiplier = multiplier;
    this.maxMillis = maxMillis;
    this.maxRetries = maxRetries;
  }

  /**
   * Returns the deterministic delay before retry number {@code attempt}.
   *
   * @param attempt retry number, starting at 1
   * @return delay in milliseconds, capped at {@code maxMillis}
   */
  public long delayMillis(int attempt) {
    double raw = initialMillis * Math.pow(multiplier, attempt - 1);
    return (long) Math.min(raw, maxMillis);
  }

  /**
   * Returns a full-jitter delay, uniform in {@code [0, delayMillis(attempt)]}, which de-correlates
   * many consumers retrying against the same failing dependency.
   *
   * @param attempt retry number, starting at 1
   * @param random source of randomness
   * @return jittered delay in milliseconds
   */
  public long jitteredDelayMillis(int attempt, RandomGenerator random) {
    return random.nextLong(delayMillis(attempt) + 1);
  }

  /**
   * Returns the worst-case time a single record can block its partition before dead-lettering.
   *
   * @return sum of all retry delays in milliseconds
   */
  public long totalBlockingMillis() {
    long total = 0;
    for (int attempt = 1; attempt <= maxRetries; attempt++) {
      total += delayMillis(attempt);
    }
    return total;
  }

  /**
   * Returns the retry limit.
   *
   * @return maximum number of retries
   */
  public int maxRetries() {
    return maxRetries;
  }
}
