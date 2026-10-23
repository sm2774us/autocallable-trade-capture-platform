package com.example.capture.spring;

import com.example.capture.core.DedupStore;
import com.example.capture.core.TradeEvent;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

/**
 * Consumes trades with manual acknowledgement: the offset is committed only after the database
 * transaction has committed, which gives at-least-once delivery, and the idempotent insert turns
 * that into effectively-once processing. After a successful insert the trade is pushed to the live
 * feeds.
 *
 * <p><b>Finding F-1 fixed.</b> The original code recorded the key in the in-memory set
 * <em>before</em> the insert. If the insert then threw, the retry saw "already seen" and silently
 * dropped the trade. Now the key is only remembered <em>after</em> the insert has succeeded.
 */
@Component
public class TradeListener {

  private final TradeStore store;
  private final LiveFeedHub hub;
  private final DedupStore recent = new DedupStore(100_000);
  private final Counter inserted;
  private final Counter duplicates;

  /**
   * Creates the listener.
   *
   * @param store persistence port
   * @param hub live feed fan-out
   * @param registry Micrometer registry
   */
  public TradeListener(TradeStore store, LiveFeedHub hub, MeterRegistry registry) {
    this.store = store;
    this.hub = hub;
    this.inserted = registry.counter("capture.consume", "outcome", "inserted");
    this.duplicates = registry.counter("capture.consume", "outcome", "duplicate");
  }

  /**
   * Handles one record. Any exception propagates to the container's error handler, which retries
   * with back-off and finally dead-letters (see {@link KafkaErrorHandlingConfig}).
   *
   * @param record the record, deserialized by the configured value deserializer
   * @param ack handle used to commit the offset
   */
  @KafkaListener(
      id = "trade-capture",
      topics = "${capture.topic}",
      groupId = "trade-capture",
      containerFactory = "tradeListenerFactory")
  public void onTrade(ConsumerRecord<String, TradeEvent> record, Acknowledgment ack) {
    TradeEvent trade = record.value();
    String key = trade.dedupKey();
    if (recent.contains(key)) {
      duplicates.increment();
    } else {
      boolean fresh = store.insertIfAbsent(trade); // may throw: key is then NOT remembered
      recent.remember(key);
      if (fresh) {
        inserted.increment();
        hub.publish(trade);
      } else {
        duplicates.increment();
      }
    }
    ack.acknowledge();
  }
}
