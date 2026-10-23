package com.example.capture.spring;

import com.example.capture.core.TradeEvent;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Transactional-outbox relay. A business transaction writes its state and an outbox row in one
 * database transaction; this relay publishes pending rows to Kafka afterwards. Delivery is
 * at-least-once (a crash between send and mark-published re-sends), which the idempotent consumer
 * absorbs. {@code FOR UPDATE SKIP LOCKED} lets several relay instances share the table without
 * blocking each other or sending a row twice concurrently.
 */
@Component
public class OutboxRelay {

  private static final String CLAIM =
      """
      SELECT id, account, symbol, payload_json FROM outbox
      WHERE published_at IS NULL
      ORDER BY id
      LIMIT ?
      FOR UPDATE SKIP LOCKED
      """;

  private static final String MARK = "UPDATE outbox SET published_at = now() WHERE id = ?";

  private final JdbcTemplate jdbc;
  private final KafkaTemplate<String, String> template;
  private final CaptureProperties properties;

  /**
   * Creates the relay.
   *
   * @param jdbc JDBC helper
   * @param template string-valued Kafka template; the outbox already stores serialized JSON
   * @param properties capture settings
   */
  public OutboxRelay(
      JdbcTemplate jdbc, KafkaTemplate<String, String> template, CaptureProperties properties) {
    this.jdbc = jdbc;
    this.template = template;
    this.properties = properties;
  }

  /**
   * Claims, publishes and marks one batch. Runs again 200 ms after the previous run finished.
   *
   * @return number of rows published in this pass
   * @throws InterruptedException if interrupted while waiting for a broker acknowledgement
   * @throws ExecutionException if the broker rejects a send; the transaction rolls back
   * @throws TimeoutException if no acknowledgement arrives in time; the transaction rolls back
   */
  @Scheduled(fixedDelay = 200)
  @Transactional
  public int relayBatch() throws InterruptedException, ExecutionException, TimeoutException {
    List<OutboxRow> rows =
        jdbc.query(
            CLAIM,
            (rs, n) ->
                new OutboxRow(
                    rs.getLong("id"),
                    rs.getString("account") + ":" + rs.getString("symbol"),
                    rs.getString("payload_json")),
            500);
    for (OutboxRow row : rows) {
      template.send(properties.topic(), row.key(), row.json()).get(5, TimeUnit.SECONDS);
      jdbc.update(MARK, row.id());
    }
    return rows.size();
  }

  /** A claimed outbox row. */
  private record OutboxRow(long id, String key, String json) {}

  /**
   * Converts an event to the outbox row key; kept next to the relay so the key rule lives in one
   * place.
   *
   * @param trade the event
   * @return the Kafka key
   */
  static String keyFor(TradeEvent trade) {
    return trade.partitionKey();
  }
}
