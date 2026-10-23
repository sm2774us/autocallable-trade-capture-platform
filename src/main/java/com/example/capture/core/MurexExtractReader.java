package com.example.capture.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * Reads trade extracts that a Murex batch drops into a directory. A file is only picked up once a
 * sibling {@code .done} marker exists, so a half-written file is never read; processed files are
 * moved atomically to an archive directory. The CSV layout used here is an assumption for
 * illustration: real extract layouts are agreed with the Murex team.
 */
public final class MurexExtractReader {

  private final Path inbox;
  private final Path archive;

  /**
   * Creates a reader.
   *
   * @param inbox directory the extract lands in
   * @param archive directory processed files are moved to
   */
  public MurexExtractReader(Path inbox, Path archive) {
    this.inbox = inbox;
    this.archive = archive;
  }

  /**
   * Parses every completed extract and archives it.
   *
   * @return all trades found, in file-name then line order
   * @throws IOException if the directory cannot be read or a file cannot be moved
   */
  public List<TradeEvent> drain() throws IOException {
    List<Path> ready = new ArrayList<>();
    try (Stream<Path> files = Files.list(inbox)) {
      files
          .filter(p -> p.getFileName().toString().endsWith(".csv"))
          .filter(p -> Files.exists(Path.of(p + ".done")))
          .sorted()
          .forEach(ready::add);
    }
    List<TradeEvent> trades = new ArrayList<>();
    for (Path file : ready) {
      List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
      for (int i = 1; i < lines.size(); i++) {
        trades.add(parseLine(lines.get(i), i));
      }
      Files.move(file, archive.resolve(file.getFileName()), StandardCopyOption.ATOMIC_MOVE);
      Files.delete(Path.of(file + ".done"));
    }
    return trades;
  }

  private static TradeEvent parseLine(String line, long lineNumber) {
    String[] c = line.split(",", -1);
    if (c.length != 7) {
      throw new IllegalArgumentException("expected 7 columns at line " + lineNumber);
    }
    return new TradeEvent(
        c[0],
        c[1],
        c[2],
        TradeEvent.Side.valueOf(c[3]),
        Long.parseLong(c[4]),
        new java.math.BigDecimal(c[5]).movePointRight(6).longValueExact(),
        "MUREX",
        lineNumber,
        Instant.parse(c[6]));
  }
}
