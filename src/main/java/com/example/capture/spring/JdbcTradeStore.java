package com.example.capture.spring;

import com.example.capture.core.TradeEvent;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PostgreSQL implementation. The unique constraint on {@code (source, trade_id)} makes redelivery
 * harmless: the second insert affects zero rows.
 */
@Component
public class JdbcTradeStore implements TradeStore {

  private static final String INSERT =
      """
      INSERT INTO trade (source, trade_id, account, symbol, side, quantity,
                         price_micros, source_seq, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (source, trade_id) DO NOTHING
      """;

  private final JdbcTemplate jdbc;

  /**
   * Creates the store.
   *
   * @param jdbc Spring's JDBC helper, auto-configured by Boot from {@code spring.datasource}
   */
  public JdbcTradeStore(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  @Transactional
  public boolean insertIfAbsent(TradeEvent t) {
    int rows =
        jdbc.update(
            INSERT,
            t.source(),
            t.tradeId(),
            t.account(),
            t.symbol(),
            t.side().name(),
            t.quantity(),
            t.priceMicros(),
            t.sourceSeq(),
            java.sql.Timestamp.from(t.executedAt()));
    return rows == 1;
  }
}
