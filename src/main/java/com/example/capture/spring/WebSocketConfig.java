package com.example.capture.spring;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/** Registers {@code /ws/quotes} and {@code /ws/trades}. */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

  private final LiveFeedHub hub;

  /**
   * Creates the configuration.
   *
   * @param hub fan-out hub shared by both endpoints
   */
  public WebSocketConfig(LiveFeedHub hub) {
    this.hub = hub;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    // Same-origin by default (the nginx edge proxies /ws/ to this service); no wildcard origins.
    registry.addHandler(new FeedSocketHandler(hub, LiveFeedHub.Channel.QUOTES), "/ws/quotes");
    registry.addHandler(new FeedSocketHandler(hub, LiveFeedHub.Channel.TRADES), "/ws/trades");
  }
}
