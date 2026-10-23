package com.example.capture.spring;

import com.example.capture.core.TradeEvent;

/** Persistence port for captured trades. */
public interface TradeStore {

  /**
   * Inserts a trade unless its idempotency key already exists.
   *
   * @param trade the trade
   * @return true if a new row was written, false if it was a duplicate
   */
  boolean insertIfAbsent(TradeEvent trade);
}
