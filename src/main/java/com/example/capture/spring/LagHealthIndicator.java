package com.example.capture.spring;

import com.example.capture.core.LagCalculator;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.ListOffsetsResult.ListOffsetsResultInfo;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * Exposes consumer-group lag on {@code /actuator/health}. Use it for the dashboard and the
 * <em>readiness</em> verdict, not for liveness: restarting a pod does not make a slow database
 * faster.
 */
@Component("consumerLag")
public class LagHealthIndicator implements HealthIndicator {

  private static final String GROUP = "trade-capture";

  private final Admin admin;
  private final LagCalculator calculator;

  /**
   * Creates the indicator.
   *
   * @param admin Kafka admin client
   * @param props capture settings holding the thresholds
   */
  public LagHealthIndicator(Admin admin, CaptureProperties props) {
    this.admin = admin;
    this.calculator = new LagCalculator(props.lagWarn(), props.lagCritical());
  }

  @Override
  public Health health() {
    try {
      Map<TopicPartition, OffsetAndMetadata> committed =
          admin
              .listConsumerGroupOffsets(GROUP)
              .partitionsToOffsetAndMetadata()
              .get(3, TimeUnit.SECONDS);
      Map<TopicPartition, OffsetSpec> request = new HashMap<>();
      committed.keySet().forEach(tp -> request.put(tp, OffsetSpec.latest()));
      Map<TopicPartition, ListOffsetsResultInfo> ends =
          admin.listOffsets(request).all().get(3, TimeUnit.SECONDS);
      Map<String, Long> endOffsets = new HashMap<>();
      Map<String, Long> committedOffsets = new HashMap<>();
      ends.forEach((tp, info) -> endOffsets.put(tp.toString(), info.offset()));
      committed.forEach((tp, meta) -> committedOffsets.put(tp.toString(), meta.offset()));
      LagCalculator.Lag lag = calculator.compute(endOffsets, committedOffsets);
      Health.Builder builder =
          lag.verdict() == LagCalculator.Verdict.CRITICAL ? Health.down() : Health.up();
      return builder
          .withDetail("totalLag", lag.totalLag())
          .withDetail("maxPartitionLag", lag.maxLag())
          .withDetail("verdict", lag.verdict().name())
          .build();
    } catch (ExecutionException | TimeoutException e) {
      return Health.unknown().withDetail("error", e.getClass().getSimpleName()).build();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Health.unknown().withDetail("error", "interrupted").build();
    }
  }
}
