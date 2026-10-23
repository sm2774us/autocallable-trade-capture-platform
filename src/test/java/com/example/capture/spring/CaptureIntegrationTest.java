package com.example.capture.spring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.example.capture.core.TradeEvent;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * End-to-end test against a real broker and a real PostgreSQL, started by Testcontainers. It
 * proves the property that matters: publishing the same trade twice leaves exactly one row.
 */
@SpringBootTest
@Testcontainers
class CaptureIntegrationTest {

  @Container
  static final KafkaContainer KAFKA =
      new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.1"));

  @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

  @DynamicPropertySource
  static void wire(DynamicPropertyRegistry registry) {
    registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired private TradePublisher publisher;
  @Autowired private JdbcTemplate jdbc;

  @Test
  void duplicatePublishProducesOneRow() {
    TradeEvent trade =
        new TradeEvent(
            "EX-1", "ACC7", "AAPL", TradeEvent.Side.BUY, 100, 187_250_000L, "FIX:B1", 1L, Instant.now());

    publisher.publish(trade);
    publisher.publish(trade);

    await()
        .atMost(Duration.ofSeconds(20))
        .untilAsserted(
            () ->
                assertThat(
                        jdbc.query(
                            "SELECT 1 FROM trade WHERE source = 'FIX:B1' AND trade_id = 'EX-1'",
                            (rs, n) -> n))
                    .hasSize(1));
  }
}
