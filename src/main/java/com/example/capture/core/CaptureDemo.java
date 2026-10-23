package com.example.capture.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Runs every framework-free building block of the plumbing section and prints evidence. */
public final class CaptureDemo {

  private CaptureDemo() {}

  /**
   * Entry point.
   *
   * @param args ignored
   * @throws IOException if the temporary directories cannot be used
   */
  public static void main(String[] args) throws IOException {
    partitioning();
    backoff();
    lag();
    dedup();
    fix();
    murex();
  }

  private static void partitioning() {
    System.out.println("== murmur2 vectors from Kafka's own UtilsTest ==");
    String[] keys = {"21", "foobar", "a-little-bit-long-string", "a-little-bit-longer-string"};
    int[] expected = {-973932308, -790332482, -985981536, -1486304829};
    for (int i = 0; i < keys.length; i++) {
      int h = Murmur2.hash(keys[i].getBytes(java.nio.charset.StandardCharsets.UTF_8));
      System.out.printf("%-28s %12d expected %12d %s%n", keys[i], h, expected[i], h == expected[i]);
    }
    int[] perPartition = new int[12];
    String[] symbols = {"AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOG", "META", "JPM"};
    for (int a = 0; a < 50; a++) {
      for (String s : symbols) {
        perPartition[Murmur2.partitionFor("ACC" + a + ":" + s, 12)]++;
      }
    }
    System.out.println("400 keys over 12 partitions: " + java.util.Arrays.toString(perPartition));
  }

  private static void backoff() {
    BackoffPolicy policy = new BackoffPolicy(200, 2.0, 5_000, 6);
    System.out.println("== back-off ==");
    for (int a = 1; a <= 6; a++) {
      System.out.printf(
          "retry %d: %d ms, jittered %d ms%n",
          a,
          policy.delayMillis(a),
          policy.jitteredDelayMillis(a, new java.util.SplittableRandom(42)));
    }
    System.out.println("worst-case blocking before DLT: " + policy.totalBlockingMillis() + " ms");
  }

  private static void lag() {
    LagCalculator calc = new LagCalculator(1_000, 10_000);
    LagCalculator.Lag lag =
        calc.compute(
            Map.of("t-0", 5_000L, "t-1", 20_000L, "t-2", 100L),
            Map.of("t-0", 4_900L, "t-1", 5_000L));
    System.out.println("== lag ==\n" + lag);
  }

  private static void dedup() {
    DedupStore store = new DedupStore(2);
    System.out.println("== dedup (capacity 2) ==");
    for (String key : List.of("a", "b", "a", "c", "a")) {
      System.out.println(key + " first=" + store.firstTime(key));
    }
  }

  private static void fix() {
    System.out.println("== FIX drop-copy ==");
    String raw =
        FixMessage.build(
            "FIX.4.4",
            "35=8",
            "34=101",
            "49=BROKER1",
            "17=EX-9001",
            "150=F",
            "39=2",
            "1=ACC7",
            "55=AAPL",
            "54=1",
            "32=300",
            "31=187.25",
            "60=20261012-14:30:05.123");
    FixMessage message = FixMessage.parse(raw);
    Optional<TradeEvent> trade = new FixExecutionMapper("BROKER1").toTrade(message);
    System.out.println(trade.orElseThrow());
    String corrupted = raw.replace("32=300", "32=900");
    try {
      FixMessage.parse(corrupted);
    } catch (IllegalArgumentException e) {
      System.out.println("corrupted message rejected: " + e.getMessage());
    }
    SequenceGapDetector gaps = new SequenceGapDetector(100);
    for (long seq : new long[] {100, 101, 105, 105, 106}) {
      System.out.println("seq " + seq + " -> " + gaps.observe(seq));
    }
  }

  private static void murex() throws IOException {
    System.out.println("== Murex extract ==");
    Path inbox = Files.createTempDirectory("mx-inbox");
    Path archive = Files.createTempDirectory("mx-archive");
    Files.writeString(
        inbox.resolve("extract_1.csv"),
        "tradeId,account,symbol,side,qty,price,ts\n"
            + "MX1,ACC7,AAPL,BUY,100,187.250000,2026-10-12T14:30:05Z\n"
            + "MX2,ACC7,MSFT,SELL,50,410.500000,2026-10-12T14:31:00Z\n");
    Files.writeString(inbox.resolve("extract_2.csv"), "tradeId,account,symbol,side,qty,price,ts\n");
    Files.writeString(inbox.resolve("extract_1.csv.done"), "");
    MurexExtractReader reader = new MurexExtractReader(inbox, archive);
    List<TradeEvent> trades = reader.drain();
    trades.forEach(System.out::println);
    System.out.println(
        "extract_2 (no .done marker) still in inbox: "
            + Files.exists(inbox.resolve("extract_2.csv")));
  }
}
