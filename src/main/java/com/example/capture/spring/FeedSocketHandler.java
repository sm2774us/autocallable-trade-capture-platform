package com.example.capture.spring;

import java.io.IOException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * One WebSocket endpoint for one {@link LiveFeedHub.Channel}. On connect the client receives a
 * snapshot; afterwards it receives deltas and heartbeats. The only thing a client may send is
 * {@code {"type":"resync"}}, which triggers a fresh snapshot.
 */
public class FeedSocketHandler extends TextWebSocketHandler {

  private static final int SEND_TIME_LIMIT_MS = 2_000;
  private static final int BUFFER_LIMIT_BYTES = 512 * 1024;

  private final LiveFeedHub hub;
  private final LiveFeedHub.Channel channel;

  /**
   * Creates the handler.
   *
   * @param hub fan-out hub
   * @param channel the feed this endpoint serves
   */
  public FeedSocketHandler(LiveFeedHub hub, LiveFeedHub.Channel channel) {
    this.hub = hub;
    this.channel = channel;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession raw) throws IOException {
    // The decorator serialises concurrent sends and closes consumers that fall behind.
    WebSocketSession session =
        new ConcurrentWebSocketSessionDecorator(raw, SEND_TIME_LIMIT_MS, BUFFER_LIMIT_BYTES);
    raw.getAttributes().put("decorated", session);
    hub.attach(channel, session);
  }

  @Override
  protected void handleTextMessage(WebSocketSession raw, TextMessage message) throws IOException {
    if (message.getPayload().contains("\"resync\"")) {
      WebSocketSession session = (WebSocketSession) raw.getAttributes().get("decorated");
      hub.resync(channel, session == null ? raw : session);
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    hub.detach(channel, session.getId());
  }

  @Override
  public void handleTransportError(WebSocketSession session, Throwable exception) {
    hub.detach(channel, session.getId());
  }
}
