package com.example.capture.core;

import java.time.Instant;
import java.util.Objects;

/**
 * One normalized execution, the unit that flows through Kafka and into the trade store.
 *
 * @param tradeId identifier unique within {@code source} (FIX ExecID, Murex trade number)
 * @param account booking account
 * @param symbol instrument identifier
 * @param side buy or sell
 * @param quantity executed quantity, strictly positive
 * @param priceMicros execution price in millionths, strictly positive (no floating point)
 * @param source originating system, for example {@code FIX:BROKER1} or {@code MUREX}
 * @param sourceSeq per-source sequence number, used for gap detection
 * @param executedAt execution time
 */
public record TradeEvent(
    String tradeId,
    String account,
    String symbol,
    Side side,
    long quantity,
    long priceMicros,
    String source,
    long sourceSeq,
    Instant executedAt) {

  /** Trade direction. */
  public enum Side {
    BUY,
    SELL
  }

  /** Validates invariants so that a malformed event can never reach the topic. */
  public TradeEvent {
    Objects.requireNonNull(tradeId, "tradeId");
    Objects.requireNonNull(account, "account");
    Objects.requireNonNull(symbol, "symbol");
    Objects.requireNonNull(side, "side");
    Objects.requireNonNull(source, "source");
    Objects.requireNonNull(executedAt, "executedAt");
    if (quantity <= 0 || priceMicros <= 0) {
      throw new IllegalArgumentException("quantity and price must be positive: " + tradeId);
    }
  }

  /**
   * Returns the Kafka record key. All fills for one account and instrument share a partition, so
   * position and P&L consumers see them in order.
   *
   * @return the partitioning key
   */
  public String partitionKey() {
    return account + ":" + symbol;
  }

  /**
   * Returns the idempotency key used by the consumer's upsert.
   *
   * @return source-qualified trade identifier
   */
  public String dedupKey() {
    return source + "/" + tradeId;
  }
}
