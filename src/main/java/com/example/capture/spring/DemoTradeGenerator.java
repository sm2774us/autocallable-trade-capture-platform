package com.example.capture.spring;

import com.example.capture.core.TradeEvent;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Optional synthetic order flow so a fresh checkout shows a living terminal. Enabled only with
 * {@code capture.demo.enabled=true}. The trades go through the <em>real</em> pipeline (Kafka, the
 * listener, PostgreSQL, the hub), so the demo exercises exactly what production exercises.
 */
@Component
@ConditionalOnProperty(name = "capture.demo.enabled", havingValue = "true")
public class DemoTradeGenerator {

  private record Instrument(String symbol, long midMicros) {}

  private static final List<Instrument> UNIVERSE =
      List.of(
          new Instrument("AAPL", 187_250_000L),
          new Instrument("AMZN", 178_100_000L),
          new Instrument("GOOG", 141_800_000L),
          new Instrument("META", 480_200_000L),
          new Instrument("MSFT", 410_500_000L),
          new Instrument("NFLX", 610_000_000L),
          new Instrument("NVDA", 120_400_000L),
          new Instrument("TSLA", 250_900_000L),
          new Instrument("AMD", 162_400_000L),
          new Instrument("AVGO", 168_200_000L),
          new Instrument("BAC", 41_300_000L),
          new Instrument("BRK.B", 452_600_000L),
          new Instrument("COST", 880_100_000L),
          new Instrument("CRM", 262_700_000L),
          new Instrument("DIS", 112_400_000L),
          new Instrument("GS", 489_900_000L),
          new Instrument("JNJ", 154_200_000L),
          new Instrument("JPM", 201_500_000L),
          new Instrument("KO", 62_300_000L),
          new Instrument("LLY", 790_500_000L),
          new Instrument("MA", 468_800_000L),
          new Instrument("ORCL", 125_600_000L),
          new Instrument("UNH", 521_400_000L),
          new Instrument("XOM", 118_700_000L));
  private static final List<String> ACCOUNTS = List.of("ACC7", "ACC9", "DESK-A", "DESK-B");

  private final TradePublisher publisher;
  private final AtomicLong sequence = new AtomicLong();
  private final String run = Long.toString(System.currentTimeMillis(), 36);

  /**
   * Creates the generator.
   *
   * @param publisher Kafka publisher
   */
  public DemoTradeGenerator(TradePublisher publisher) {
    this.publisher = publisher;
  }

  /** Publishes one random fill; the price random-walks around the instrument's mid. */
  @Scheduled(fixedDelayString = "${capture.demo.interval-millis:250}")
  public void tick() {
    ThreadLocalRandom rnd = ThreadLocalRandom.current();
    Instrument instrument = UNIVERSE.get(rnd.nextInt(UNIVERSE.size()));
    long seq = sequence.incrementAndGet();
    // +-20 basis points of the mid, in pure integer arithmetic (no floating point for money)
    long drift = instrument.midMicros() * rnd.nextLong(-20, 21) / 10_000;
    publisher.publish(
        new TradeEvent(
            "DEMO-" + run + "-" + seq,
            ACCOUNTS.get(rnd.nextInt(ACCOUNTS.size())),
            instrument.symbol(),
            rnd.nextBoolean() ? TradeEvent.Side.BUY : TradeEvent.Side.SELL,
            100L * rnd.nextInt(1, 50),
            instrument.midMicros() + drift,
            "DEMO",
            seq,
            Instant.now()));
  }
}
