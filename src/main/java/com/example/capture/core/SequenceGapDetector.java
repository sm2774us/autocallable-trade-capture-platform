package com.example.capture.core;

import java.util.Optional;

/**
 * Tracks FIX MsgSeqNum (tag 34) for one session. A gap means missed fills and must trigger a
 * ResendRequest (35=2); a duplicate or lower number means a possible replay.
 */
public final class SequenceGapDetector {

  /**
   * Outcome of observing one sequence number.
   *
   * @param kind classification
   * @param resendFrom first missing sequence when kind is GAP, otherwise zero
   * @param resendTo last missing sequence when kind is GAP, otherwise zero
   */
  public record Observation(Kind kind, long resendFrom, long resendTo) {

    /** Classification of a sequence number. */
    public enum Kind {
      IN_ORDER,
      GAP,
      DUPLICATE
    }
  }

  private long expected;

  /**
   * Creates a detector.
   *
   * @param nextExpected the first sequence number expected on the session
   */
  public SequenceGapDetector(long nextExpected) {
    this.expected = nextExpected;
  }

  /**
   * Observes a sequence number.
   *
   * @param seq sequence number received
   * @return classification and, for a gap, the range to request
   */
  public Observation observe(long seq) {
    if (seq == expected) {
      expected++;
      return new Observation(Observation.Kind.IN_ORDER, 0, 0);
    }
    if (seq > expected) {
      Observation gap = new Observation(Observation.Kind.GAP, expected, seq - 1);
      expected = seq + 1;
      return gap;
    }
    return new Observation(Observation.Kind.DUPLICATE, 0, 0);
  }

  /**
   * Returns the next expected sequence number.
   *
   * @return expected sequence
   */
  public long nextExpected() {
    return expected;
  }

  /**
   * Helper for callers that only want the gap range.
   *
   * @param observation an observation
   * @return the range as an optional pair, present only for a gap
   */
  public static Optional<long[]> gapRange(Observation observation) {
    if (observation.kind() != Observation.Kind.GAP) {
      return Optional.empty();
    }
    return Optional.of(new long[] {observation.resendFrom(), observation.resendTo()});
  }
}
