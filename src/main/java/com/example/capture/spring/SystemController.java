package com.example.capture.spring;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Small status document the terminal's status bar polls every few seconds. */
@RestController
@RequestMapping("/api/system")
public class SystemController {

  /**
   * Status document.
   *
   * @param service service name
   * @param serverTime server clock
   * @param quoteSeq quote-feed sequence
   * @param tradeSeq trade-feed sequence
   * @param quoteClients attached quote sockets
   * @param tradeClients attached trade sockets
   * @param inserted trades stored since start
   * @param duplicates redeliveries ignored since start
   * @param demo whether the synthetic trade generator is running
   */
  public record Status(
      String service,
      Instant serverTime,
      long quoteSeq,
      long tradeSeq,
      int quoteClients,
      int tradeClients,
      long inserted,
      long duplicates,
      boolean demo) {}

  private final LiveFeedHub hub;
  private final MeterRegistry registry;
  private final boolean demo;
  private final String service;

  /**
   * Creates the controller.
   *
   * @param hub live feed hub
   * @param registry Micrometer registry holding the consume counters
   * @param demo value of {@code capture.demo.enabled}
   * @param service value of {@code spring.application.name}
   */
  public SystemController(
      LiveFeedHub hub,
      MeterRegistry registry,
      @Value("${capture.demo.enabled:false}") boolean demo,
      @Value("${spring.application.name:trade-capture}") String service) {
    this.hub = hub;
    this.registry = registry;
    this.demo = demo;
    this.service = service;
  }

  /**
   * Returns the status.
   *
   * @return current status
   */
  @GetMapping("/status")
  public Status status() {
    return new Status(
        service,
        Instant.now(),
        hub.quoteSeq(),
        hub.tradeSeq(),
        hub.sessionCount(LiveFeedHub.Channel.QUOTES),
        hub.sessionCount(LiveFeedHub.Channel.TRADES),
        (long) registry.counter("capture.consume", "outcome", "inserted").count(),
        (long) registry.counter("capture.consume", "outcome", "duplicate").count(),
        demo);
  }
}
