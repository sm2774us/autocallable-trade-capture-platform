package com.example.capture.spring;

import com.example.capture.core.TradeEvent;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consume-transform-produce with Kafka transactions: the output record and the consumed offset
 * commit atomically (exactly-once <em>within Kafka</em>). Requires {@code
 * spring.kafka.producer.transaction-id-prefix} and downstream {@code isolation.level=
 * read_committed}. It does not make a database write atomic with Kafka; that is the outbox's job.
 */
@Component
public class EnrichmentProcessor {

  private final KafkaTemplate<String, TradeEvent> template;

  /**
   * Creates the processor.
   *
   * @param template transactional template (a transaction id prefix is configured)
   */
  public EnrichmentProcessor(KafkaTemplate<String, TradeEvent> template) {
    this.template = template;
  }

  /**
   * Forwards a trade to the enriched topic inside a Kafka transaction.
   *
   * @param record the consumed trade
   */
  @KafkaListener(id = "trade-enricher", topics = "trades.raw", groupId = "trade-enricher")
  @Transactional("kafkaTransactionManager")
  public void enrich(ConsumerRecord<String, TradeEvent> record) {
    TradeEvent trade = record.value();
    template.send("trades.enriched", trade.partitionKey(), trade);
  }
}
