package com.example.capture.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class LiveBoardTest {

  private static TradeEvent fill(String id, String sym, long qty, long pxMicros) {
    return new TradeEvent(
        id, "ACC7", sym, TradeEvent.Side.BUY, qty, pxMicros, "FIX:B1", 1L, Instant.ofEpochMilli(5_000));
  }

  @Test
  void emptyBoardHasSequenceZeroAndNoRows() {
    LiveBoard board = new LiveBoard(10);
    assertThat(board.quoteSnapshot().seq()).isEqualTo(0L);
    assertThat(board.quoteSnapshot().items()).isEmpty();
    assertThat(board.tradeSnapshot().items()).isEmpty();
  }

  @Test
  void eachTradeAdvancesBothSequencesByExactlyOne() {
    LiveBoard board = new LiveBoard(10);
    LiveBoard.Update first = board.onTrade(fill("1", "AAPL", 100, 187_250_000L), 111L);
    LiveBoard.Update second = board.onTrade(fill("2", "MSFT", 50, 410_500_000L), 222L);
    assertThat(first.quote().seq()).isEqualTo(1L);
    assertThat(second.quote().seq()).isEqualTo(2L);
    assertThat(first.trade().seq()).isEqualTo(1L);
    assertThat(second.trade().seq()).isEqualTo(2L);
    assertThat(board.quoteSeq()).isEqualTo(2L);
    assertThat(board.tradeSeq()).isEqualTo(2L);
  }

  @Test
  void quoteCarriesLastPriceAndCumulativeVolume() {
    LiveBoard board = new LiveBoard(10);
    board.onTrade(fill("1", "AAPL", 100, 187_250_000L), 1L);
    LiveBoard.Update update = board.onTrade(fill("2", "AAPL", 250, 187_500_000L), 2L);
    assertThat(update.quote().sym()).isEqualTo("AAPL");
    assertThat(update.quote().pxMicros()).isEqualTo(187_500_000L);
    assertThat(update.quote().qty()).isEqualTo(350L);
    assertThat(update.quote().ts()).isEqualTo(2L);
  }

  @Test
  void tradeKeepsIntegerMicrosAndSourceQualifiedId() {
    LiveBoard board = new LiveBoard(10);
    LiveBoard.Update update = board.onTrade(fill("EX-9", "AAPL", 100, 187_250_001L), 1L);
    assertThat(update.trade().pxMicros()).isEqualTo(187_250_001L);
    assertThat(update.trade().id()).isEqualTo("FIX:B1/EX-9");
    assertThat(update.trade().ts()).isEqualTo(5_000L);
  }

  @Test
  void quoteSnapshotIsSortedBySymbol() {
    LiveBoard board = new LiveBoard(10);
    board.onTrade(fill("1", "MSFT", 1, 1_000_000L), 1L);
    board.onTrade(fill("2", "AAPL", 1, 1_000_000L), 2L);
    assertThat(board.quoteSnapshot().items().get(0).sym()).isEqualTo("AAPL");
    assertThat(board.quoteSnapshot().items().get(1).sym()).isEqualTo("MSFT");
  }

  @Test
  void tapeIsNewestFirstAndBounded() {
    LiveBoard board = new LiveBoard(3);
    for (int i = 1; i <= 5; i++) {
      board.onTrade(fill("T" + i, "AAPL", 1, 1_000_000L), i);
    }
    LiveBoard.Snapshot<LiveBoard.TradeView> tape = board.tradeSnapshot();
    assertThat(tape.seq()).isEqualTo(5L);
    assertThat(tape.items()).hasSize(3);
    assertThat(tape.items().get(0).id()).isEqualTo("FIX:B1/T5");
    assertThat(tape.items().get(2).id()).isEqualTo("FIX:B1/T3");
  }

  @Test
  void snapshotIsACopyNotAView() {
    LiveBoard board = new LiveBoard(3);
    board.onTrade(fill("1", "AAPL", 1, 1_000_000L), 1L);
    LiveBoard.Snapshot<LiveBoard.QuoteView> before = board.quoteSnapshot();
    board.onTrade(fill("2", "MSFT", 1, 1_000_000L), 2L);
    assertThat(before.items()).hasSize(1);
    assertThat(board.quoteSnapshot().items()).hasSize(2);
  }

  @Test
  void rejectsNonPositiveCapacity() {
    assertThatThrownBy(() -> new LiveBoard(0)).isInstanceOf(IllegalArgumentException.class);
  }
}
