package com.example.capture.core;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class FeedJsonTest {

  private static LiveBoard.Update one() {
    LiveBoard board = new LiveBoard(5);
    return board.onTrade(
        new TradeEvent("EX-1", "ACC7", "AAPL", TradeEvent.Side.SELL, 100, 187_250_000L, "FIX:B1", 1L, Instant.ofEpochMilli(42)),
        99L);
  }

  @Test
  void heartbeatShape() {
    assertThat(FeedJson.heartbeat(7)).isEqualTo("{\"kind\":\"heartbeat\",\"seq\":7}");
  }

  @Test
  void quoteDeltaShape() {
    assertThat(FeedJson.quoteDelta(one().quote()))
        .isEqualTo("{\"kind\":\"delta\",\"seq\":1,\"quote\":{\"sym\":\"AAPL\",\"px\":187.25,\"qty\":100,\"seq\":1,\"ts\":99}}");
  }

  @Test
  void tradeDeltaShape() {
    assertThat(FeedJson.tradeDelta(one().trade()))
        .isEqualTo("{\"kind\":\"delta\",\"seq\":1,\"trade\":{\"id\":\"FIX:B1/EX-1\",\"source\":\"FIX:B1\",\"account\":\"ACC7\",\"sym\":\"AAPL\",\"side\":\"SELL\",\"qty\":100,\"pxMicros\":187250000,\"seq\":1,\"ts\":42}}");
  }

  @Test
  void snapshotsListTheirRows() {
    LiveBoard board = new LiveBoard(5);
    assertThat(FeedJson.quoteSnapshot(board.quoteSnapshot()))
        .isEqualTo("{\"kind\":\"snapshot\",\"seq\":0,\"quotes\":[]}");
    assertThat(FeedJson.tradeSnapshot(board.tradeSnapshot()))
        .isEqualTo("{\"kind\":\"snapshot\",\"seq\":0,\"trades\":[]}");
    board.onTrade(new TradeEvent("1", "A", "X", TradeEvent.Side.BUY, 1, 1_000_000L, "S", 1L, Instant.EPOCH), 1L);
    board.onTrade(new TradeEvent("2", "A", "Y", TradeEvent.Side.BUY, 1, 2_000_000L, "S", 2L, Instant.EPOCH), 2L);
    String json = FeedJson.quoteSnapshot(board.quoteSnapshot());
    assertThat(json.startsWith("{\"kind\":\"snapshot\",\"seq\":2,\"quotes\":[{\"sym\":\"X\"")).isTrue();
    assertThat(json.contains("},{\"sym\":\"Y\"")).isTrue();
  }

  @Test
  void stringsAreEscaped() {
    assertThat(FeedJson.string("a\"b\\c\nd")).isEqualTo("\"a\\\"b\\\\c\\nd\"");
    assertThat(FeedJson.string(null)).isEqualTo("null");
    assertThat(FeedJson.string("\u0001")).isEqualTo("\"\\u0001\"");
  }

  @Test
  void smallPricesNeverUseExponentNotation() {
    LiveBoard board = new LiveBoard(5);
    LiveBoard.Update update =
        board.onTrade(new TradeEvent("1", "A", "X", TradeEvent.Side.BUY, 1, 1L, "S", 1L, Instant.EPOCH), 1L);
    assertThat(FeedJson.quoteDelta(update.quote()).contains("\"px\":0.000001")).isTrue();
  }

  @Test
  void roundPricesDropTrailingZerosButStayExact() {
    LiveBoard board = new LiveBoard(5);
    LiveBoard.Update whole =
        board.onTrade(new TradeEvent("1", "A", "X", TradeEvent.Side.BUY, 1, 200_000_000L, "S", 1L, Instant.EPOCH), 1L);
    LiveBoard.Update fractional =
        board.onTrade(new TradeEvent("2", "A", "Y", TradeEvent.Side.BUY, 1, 187_250_000L, "S", 2L, Instant.EPOCH), 2L);
    assertThat(FeedJson.quoteDelta(whole.quote()).contains("\"px\":200,")).isTrue();
    assertThat(FeedJson.quoteDelta(fractional.quote()).contains("\"px\":187.25,")).isTrue();
  }
}
