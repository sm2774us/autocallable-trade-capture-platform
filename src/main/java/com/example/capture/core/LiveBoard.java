package com.example.capture.core;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * In-memory, sequence-numbered view of what the capture pipeline has stored, shaped for the
 * browser. It keeps two independent feeds, each with its own monotonically increasing sequence:
 *
 * <ul>
 *   <li>the <b>quote board</b>: last price and cumulative volume per symbol, derived from captured
 *       fills;
 *   <li>the <b>trade tape</b>: the most recent captured fills, newest first.
 * </ul>
 *
 * <p>The sequence numbers implement the snapshot-plus-delta contract the Angular reducer expects: a
 * client first receives a snapshot stamped with the current sequence, then deltas stamped
 * {@code seq+1, seq+2, ...}. All methods are synchronized, so a snapshot and the sequence it
 * carries are always consistent with each other.
 */
public final class LiveBoard {

  /**
   * One row of the quote board.
   *
   * @param sym symbol
   * @param pxMicros last traded price in millionths of the currency unit (exact)
   * @param qty cumulative traded quantity since start-up
   * @param seq quote-feed sequence of the delta that last changed this row
   * @param ts server time of that change in epoch milliseconds
   */
  public record QuoteView(String sym, long pxMicros, long qty, long seq, long ts) {}

  /**
   * One row of the trade tape. Prices stay in integer micros end to end.
   *
   * @param id source-qualified trade id, unique on the tape
   * @param source originating system
   * @param account booking account
   * @param sym symbol
   * @param side {@code BUY} or {@code SELL}
   * @param qty executed quantity
   * @param pxMicros execution price in millionths
   * @param seq trade-feed sequence number
   * @param ts execution time in epoch milliseconds
   */
  public record TradeView(
      String id,
      String source,
      String account,
      String sym,
      String side,
      long qty,
      long pxMicros,
      long seq,
      long ts) {}

  /**
   * The two feed updates produced by one captured trade.
   *
   * @param quote new state of the quote row
   * @param trade the tape entry
   */
  public record Update(QuoteView quote, TradeView trade) {}

  /**
   * A consistent copy of one feed.
   *
   * @param seq sequence number the copy is valid at
   * @param items the rows
   * @param <T> row type
   */
  public record Snapshot<T>(long seq, List<T> items) {}

  private final int tapeCapacity;
  private final Map<String, QuoteView> quotes = new TreeMap<>();
  private final Map<String, Long> volume = new HashMap<>();
  private final ArrayDeque<TradeView> tape = new ArrayDeque<>();
  private long quoteSeq;
  private long tradeSeq;

  /**
   * Creates a board.
   *
   * @param tapeCapacity maximum trades kept on the tape, positive
   */
  public LiveBoard(int tapeCapacity) {
    if (tapeCapacity <= 0) {
      throw new IllegalArgumentException("tapeCapacity must be positive");
    }
    this.tapeCapacity = tapeCapacity;
  }

  /**
   * Applies a captured trade to both feeds.
   *
   * @param trade the trade that was just stored
   * @param nowMillis server clock, stamped on the quote row
   * @return the stamped quote and trade rows, to be broadcast as deltas
   */
  public synchronized Update onTrade(TradeEvent trade, long nowMillis) {
    tradeSeq++;
    TradeView view =
        new TradeView(
            trade.dedupKey(),
            trade.source(),
            trade.account(),
            trade.symbol(),
            trade.side().name(),
            trade.quantity(),
            trade.priceMicros(),
            tradeSeq,
            trade.executedAt().toEpochMilli());
    tape.addFirst(view);
    while (tape.size() > tapeCapacity) {
      tape.removeLast();
    }
    quoteSeq++;
    long cumulative = volume.merge(trade.symbol(), trade.quantity(), Long::sum);
    QuoteView quote =
        new QuoteView(trade.symbol(), trade.priceMicros(), cumulative, quoteSeq, nowMillis);
    quotes.put(trade.symbol(), quote);
    return new Update(quote, view);
  }

  /**
   * Returns the whole quote board.
   *
   * @return snapshot sorted by symbol
   */
  public synchronized Snapshot<QuoteView> quoteSnapshot() {
    return new Snapshot<>(quoteSeq, new ArrayList<>(quotes.values()));
  }

  /**
   * Returns the tape, newest first.
   *
   * @return snapshot of up to {@code tapeCapacity} trades
   */
  public synchronized Snapshot<TradeView> tradeSnapshot() {
    return new Snapshot<>(tradeSeq, new ArrayList<>(tape));
  }

  /**
   * Returns the current quote-feed sequence.
   *
   * @return sequence of the last quote delta
   */
  public synchronized long quoteSeq() {
    return quoteSeq;
  }

  /**
   * Returns the current trade-feed sequence.
   *
   * @return sequence of the last trade delta
   */
  public synchronized long tradeSeq() {
    return tradeSeq;
  }
}
