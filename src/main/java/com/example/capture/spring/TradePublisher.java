package com.example.capture.spring;

import com.example.capture.core.TradeEvent;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.CompletableFuture;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

/**
 * Publishes normalized trades. Durability comes from producer configuration ({@code acks=all},
 * {@code enable.idempotence=true}, see application.yml), ordering from the record key.
 */
@Service
public class TradePublisher {

  private final KafkaTemplate<String, TradeEvent> template;
  private final CaptureProperties properties;
  private final Counter sent;
  private final Counter failed;

  /**
   * Creates the publisher.
   *
   * @param template Spring's Kafka template, auto-configured by Boot
   * @param properties capture settings
   * @param registry Micrometer registry
   */
  public TradePublisher(
      KafkaTemplate<String, TradeEvent> template,
      CaptureProperties properties,
      MeterRegistry registry) {
    this.template = template;
    this.properties = properties;
    this.sent = registry.counter("capture.publish", "outcome", "ok");
    this.failed = registry.counter("capture.publish", "outcome", "error");
  }

  /**
   * Sends one trade asynchronously. The returned future completes when the broker has acknowledged
   * the write to all in-sync replicas.
   *
   * @param trade the trade
   * @return a future for the broker acknowledgement
   */
  public CompletableFuture<SendResult<String, TradeEvent>> publish(TradeEvent trade) {
    return template
        .send(properties.topic(), trade.partitionKey(), trade)
        .whenComplete(
            (result, error) -> {
              if (error == null) {
                sent.increment();
              } else {
                failed.increment();
              }
            });
  }
}
