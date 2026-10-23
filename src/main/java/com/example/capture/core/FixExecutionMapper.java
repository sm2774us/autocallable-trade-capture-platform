package com.example.capture.core;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

/**
 * Anti-corruption layer: maps a FIX 4.4 ExecutionReport (35=8) from a drop-copy session to the
 * internal {@link TradeEvent}. Everything vendor-specific stays on this side of the boundary.
 */
public final class FixExecutionMapper {

  private static final DateTimeFormatter FIX_TIME =
      DateTimeFormatter.ofPattern("yyyyMMdd-HH:mm:ss[.SSS]");

  private final String senderCompId;

  /**
   * Creates a mapper for one counterparty session.
   *
   * @param senderCompId the SenderCompID (tag 49) that identifies the source
   */
  public FixExecutionMapper(String senderCompId) {
    this.senderCompId = senderCompId;
  }

  /**
   * Maps an execution report to a trade, ignoring everything that is not a fill.
   *
   * @param message validated FIX message
   * @return the trade, or empty if the message is not a fill
   * @throws IllegalArgumentException if a fill is missing mandatory data or has bad values
   */
  public Optional<TradeEvent> toTrade(FixMessage message) {
    if (!"8".equals(message.get(35)) || !"F".equals(message.get(150))) {
      return Optional.empty();
    }
    TradeEvent.Side side =
        switch (message.require(54)) {
          case "1" -> TradeEvent.Side.BUY;
          case "2" -> TradeEvent.Side.SELL;
          default -> throw new IllegalArgumentException("unsupported side " + message.get(54));
        };
    long quantity = new BigDecimal(message.require(32)).longValueExact();
    long priceMicros = new BigDecimal(message.require(31)).movePointRight(6).longValueExact();
    Instant executedAt =
        LocalDateTime.parse(message.require(60), FIX_TIME).toInstant(ZoneOffset.UTC);
    return Optional.of(
        new TradeEvent(
            message.require(17),
            message.require(1),
            message.require(55),
            side,
            quantity,
            priceMicros,
            "FIX:" + senderCompId,
            Long.parseLong(message.require(34)),
            executedAt));
  }
}
