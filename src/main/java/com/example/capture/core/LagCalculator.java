package com.example.capture.core;

import java.util.Map;

/** Computes consumer lag from end offsets and committed offsets. */
public final class LagCalculator {

  /** Health verdict derived from lag. */
  public enum Verdict {
    OK,
    WARN,
    CRITICAL
  }

  /**
   * Result of a lag computation.
   *
   * @param totalLag sum of lag over all partitions
   * @param maxLag largest single-partition lag
   * @param verdict classification against the thresholds
   */
  public record Lag(long totalLag, long maxLag, Verdict verdict) {}

  private final long warnThreshold;
  private final long criticalThreshold;

  /**
   * Creates a calculator.
   *
   * @param warnThreshold per-partition lag at which the verdict becomes WARN
   * @param criticalThreshold per-partition lag at which the verdict becomes CRITICAL
   */
  public LagCalculator(long warnThreshold, long criticalThreshold) {
    this.warnThreshold = warnThreshold;
    this.criticalThreshold = criticalThreshold;
  }

  /**
   * Computes lag. A partition with no committed offset counts its whole log as lag.
   *
   * @param endOffsets latest offset per partition
   * @param committed committed offset per partition; missing means nothing committed
   * @return aggregate lag and verdict
   */
  public Lag compute(Map<String, Long> endOffsets, Map<String, Long> committed) {
    long total = 0;
    long max = 0;
    for (Map.Entry<String, Long> entry : endOffsets.entrySet()) {
      long lag = Math.max(0L, entry.getValue() - committed.getOrDefault(entry.getKey(), 0L));
      total += lag;
      max = Math.max(max, lag);
    }
    Verdict verdict = Verdict.OK;
    if (max >= criticalThreshold) {
      verdict = Verdict.CRITICAL;
    } else if (max >= warnThreshold) {
      verdict = Verdict.WARN;
    }
    return new Lag(total, max, verdict);
  }
}
