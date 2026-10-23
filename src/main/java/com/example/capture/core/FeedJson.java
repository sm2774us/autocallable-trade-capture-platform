package com.example.capture.core;

import com.example.capture.core.LiveBoard.QuoteView;
import com.example.capture.core.LiveBoard.Snapshot;
import com.example.capture.core.LiveBoard.TradeView;
import java.math.BigDecimal;
import java.util.List;

/**
 * Hand-written JSON encoder for the two WebSocket feeds. The wire shape is tiny and fixed, so a
 * 60-line encoder is easier to verify than a reflection-based mapper and runs without Spring.
 *
 * <p>Wire contract (v2), every message carries {@code kind} and {@code seq}:
 *
 * <pre>
 * /ws/quotes  snapshot {kind,seq,quotes:[{sym,px,qty,seq,ts}]}  delta {kind,seq,quote}
 * /ws/trades  snapshot {kind,seq,trades:[{id,source,account,sym,side,qty,pxMicros,seq,ts}]}
 *             delta    {kind,seq,trade}
 * both        heartbeat {kind:"heartbeat",seq}
 * </pre>
 */
public final class FeedJson {

  private FeedJson() {}

  /**
   * Encodes a quote snapshot.
   *
   * @param snapshot consistent copy of the quote board
   * @return JSON text
   */
  public static String quoteSnapshot(Snapshot<QuoteView> snapshot) {
    StringBuilder out = new StringBuilder(64 + snapshot.items().size() * 80);
    out.append("{\"kind\":\"snapshot\",\"seq\":").append(snapshot.seq()).append(",\"quotes\":[");
    appendAll(out, snapshot.items(), FeedJson::quote);
    return out.append("]}").toString();
  }

  /**
   * Encodes one quote delta.
   *
   * @param quote the changed row
   * @return JSON text
   */
  public static String quoteDelta(QuoteView quote) {
    return "{\"kind\":\"delta\",\"seq\":" + quote.seq() + ",\"quote\":" + quote(quote) + "}";
  }

  /**
   * Encodes a trade-tape snapshot.
   *
   * @param snapshot consistent copy of the tape, newest first
   * @return JSON text
   */
  public static String tradeSnapshot(Snapshot<TradeView> snapshot) {
    StringBuilder out = new StringBuilder(64 + snapshot.items().size() * 140);
    out.append("{\"kind\":\"snapshot\",\"seq\":").append(snapshot.seq()).append(",\"trades\":[");
    appendAll(out, snapshot.items(), FeedJson::trade);
    return out.append("]}").toString();
  }

  /**
   * Encodes one trade delta.
   *
   * @param trade the new tape entry
   * @return JSON text
   */
  public static String tradeDelta(TradeView trade) {
    return "{\"kind\":\"delta\",\"seq\":" + trade.seq() + ",\"trade\":" + trade(trade) + "}";
  }

  /**
   * Encodes a heartbeat, which lets clients detect a missed delta without waiting for the next one.
   *
   * @param seq the feed's current sequence
   * @return JSON text
   */
  public static String heartbeat(long seq) {
    return "{\"kind\":\"heartbeat\",\"seq\":" + seq + "}";
  }

  /**
   * Quotes a string as a JSON string literal.
   *
   * @param text raw text, may be null
   * @return the literal including surrounding quotes
   */
  public static String string(String text) {
    if (text == null) {
      return "null";
    }
    StringBuilder out = new StringBuilder(text.length() + 2).append('"');
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (c < 0x20) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    return out.append('"').toString();
  }

  private static String quote(QuoteView q) {
    return "{\"sym\":"
        + string(q.sym())
        + ",\"px\":"
        + price(q.pxMicros())
        + ",\"qty\":"
        + q.qty()
        + ",\"seq\":"
        + q.seq()
        + ",\"ts\":"
        + q.ts()
        + "}";
  }

  /** Exact decimal text of a micros price: 187250000 becomes 187.25, never an exponent. */
  private static String price(long micros) {
    return BigDecimal.valueOf(micros, 6).stripTrailingZeros().toPlainString();
  }

  private static String trade(TradeView t) {
    return "{\"id\":"
        + string(t.id())
        + ",\"source\":"
        + string(t.source())
        + ",\"account\":"
        + string(t.account())
        + ",\"sym\":"
        + string(t.sym())
        + ",\"side\":"
        + string(t.side())
        + ",\"qty\":"
        + t.qty()
        + ",\"pxMicros\":"
        + t.pxMicros()
        + ",\"seq\":"
        + t.seq()
        + ",\"ts\":"
        + t.ts()
        + "}";
  }

  private static <T> void appendAll(
      StringBuilder out, List<T> items, java.util.function.Function<T, String> encoder) {
    for (int i = 0; i < items.size(); i++) {
      if (i > 0) {
        out.append(',');
      }
      out.append(encoder.apply(items.get(i)));
    }
  }
}
