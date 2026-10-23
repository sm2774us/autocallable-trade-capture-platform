package com.example.capture.spring;

import com.example.capture.core.FeedJson;
import com.example.capture.core.LiveBoard;
import com.example.capture.core.TradeEvent;
import java.io.IOException;
import java.time.Clock;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * Fan-out point between the capture pipeline and the browsers. The listener calls {@link
 * #publish} after a trade has been stored; every attached WebSocket session receives the matching
 * deltas. All methods are synchronized so that "send snapshot, then start receiving deltas" is
 * atomic: a client can never miss, or double-receive, the delta that races with its attach.
 */
@Component
public class LiveFeedHub {

  /** The two independent, separately sequenced feeds. */
  public enum Channel {
    QUOTES,
    TRADES
  }

  private static final Logger LOG = LoggerFactory.getLogger(LiveFeedHub.class);

  private final LiveBoard board;
  private final Clock clock;
  private final Map<Channel, Map<String, WebSocketSession>> sessions = new EnumMap<>(Channel.class);

  /** Creates a hub keeping the latest 500 trades on the tape. */
  public LiveFeedHub() {
    this(new LiveBoard(500), Clock.systemUTC());
  }

  LiveFeedHub(LiveBoard board, Clock clock) {
    this.board = board;
    this.clock = clock;
    for (Channel channel : Channel.values()) {
      sessions.put(channel, new LinkedHashMap<>());
    }
  }

  /**
   * Sends the snapshot and then subscribes the session to deltas, atomically.
   *
   * @param channel which feed
   * @param session the (already send-limited) socket session
   * @throws IOException if the snapshot cannot be written
   */
  public synchronized void attach(Channel channel, WebSocketSession session) throws IOException {
    session.sendMessage(new TextMessage(snapshotJson(channel)));
    sessions.get(channel).put(session.getId(), session);
  }

  /**
   * Re-sends a snapshot to one session, answering the client's {@code {"type":"resync"}} request.
   *
   * @param channel which feed
   * @param session the requesting session
   * @throws IOException if the snapshot cannot be written
   */
  public synchronized void resync(Channel channel, WebSocketSession session) throws IOException {
    session.sendMessage(new TextMessage(snapshotJson(channel)));
  }

  /**
   * Unsubscribes a session.
   *
   * @param channel which feed
   * @param sessionId id of the closed session
   */
  public synchronized void detach(Channel channel, String sessionId) {
    sessions.get(channel).remove(sessionId);
  }

  /**
   * Applies a stored trade to both feeds and broadcasts the deltas.
   *
   * @param trade a trade that was just inserted into the database
   */
  public synchronized void publish(TradeEvent trade) {
    LiveBoard.Update update = board.onTrade(trade, clock.millis());
    broadcast(Channel.QUOTES, FeedJson.quoteDelta(update.quote()));
    broadcast(Channel.TRADES, FeedJson.tradeDelta(update.trade()));
  }

  /** Once a second tells every client the current sequence, so a lost delta is noticed fast. */
  @Scheduled(fixedRate = 1000)
  public synchronized void heartbeat() {
    broadcast(Channel.QUOTES, FeedJson.heartbeat(board.quoteSeq()));
    broadcast(Channel.TRADES, FeedJson.heartbeat(board.tradeSeq()));
  }

  /**
   * Counts attached sessions.
   *
   * @param channel which feed
   * @return number of subscribed sessions
   */
  public synchronized int sessionCount(Channel channel) {
    return sessions.get(channel).size();
  }

  /**
   * Returns the quote-feed sequence.
   *
   * @return sequence of the last quote delta
   */
  public long quoteSeq() {
    return board.quoteSeq();
  }

  /**
   * Returns the trade-feed sequence.
   *
   * @return sequence of the last trade delta
   */
  public long tradeSeq() {
    return board.tradeSeq();
  }

  private String snapshotJson(Channel channel) {
    return channel == Channel.QUOTES
        ? FeedJson.quoteSnapshot(board.quoteSnapshot())
        : FeedJson.tradeSnapshot(board.tradeSnapshot());
  }

  private void broadcast(Channel channel, String json) {
    TextMessage message = new TextMessage(json);
    sessions
        .get(channel)
        .values()
        .removeIf(
            session -> {
              try {
                session.sendMessage(message);
                return false;
              } catch (IOException | RuntimeException e) {
                // A slow or dead consumer is dropped, never allowed to stall the pipeline.
                LOG.warn("dropping {} session {}: {}", channel, session.getId(), e.toString());
                closeQuietly(session);
                return true;
              }
            });
  }

  private static void closeQuietly(WebSocketSession session) {
    try {
      session.close();
    } catch (IOException | RuntimeException ignored) {
      // already gone
    }
  }
}
