package com.example.capture.spring;

import com.example.capture.core.TradeEvent;
import org.apache.kafka.common.TopicPartition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.ExponentialBackOffWithMaxRetries;

/**
 * Listener container factory with bounded retries and a dead-letter topic. Poison messages
 * (validation failures) skip the retries; transient failures (database down) retry with exponential
 * back-off, then land on {@code <topic>.DLT} on the same partition number so ordering information
 * is preserved for the replay tool.
 */
@Configuration
public class KafkaErrorHandlingConfig {

  /**
   * Builds the error handler.
   *
   * @param dltTemplate template used to publish to the dead-letter topic
   * @param props capture settings
   * @return the configured handler
   */
  @Bean
  public DefaultErrorHandler tradeErrorHandler(
      KafkaTemplate<String, TradeEvent> dltTemplate, CaptureProperties props) {
    DeadLetterPublishingRecoverer recoverer =
        new DeadLetterPublishingRecoverer(
            dltTemplate,
            (record, error) ->
                new TopicPartition(record.topic() + props.deadLetterSuffix(), record.partition()));
    ExponentialBackOffWithMaxRetries backOff =
        new ExponentialBackOffWithMaxRetries(props.maxRetries());
    backOff.setInitialInterval(props.retryInitialMillis());
    backOff.setMultiplier(props.retryMultiplier());
    backOff.setMaxInterval(props.retryMaxMillis());
    DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
    handler.addNotRetryableExceptions(IllegalArgumentException.class);
    handler.setCommitRecovered(true);
    return handler;
  }

  /**
   * Builds the container factory used by {@link TradeListener}.
   *
   * @param consumerFactory Boot's auto-configured consumer factory
   * @param errorHandler the handler above
   * @return the factory
   */
  @Bean
  public ConcurrentKafkaListenerContainerFactory<String, TradeEvent> tradeListenerFactory(
      ConsumerFactory<String, TradeEvent> consumerFactory, DefaultErrorHandler errorHandler) {
    ConcurrentKafkaListenerContainerFactory<String, TradeEvent> factory =
        new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(consumerFactory);
    factory.setCommonErrorHandler(errorHandler);
    factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
    factory.setConcurrency(3);
    return factory;
  }
}
