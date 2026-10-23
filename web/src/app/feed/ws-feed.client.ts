import {Observable, defer, share} from 'rxjs';
import {WebSocketSubject, webSocket} from 'rxjs/webSocket';

import {resilient} from '../core/rx-utils';
import {FeedClient} from './feed.client';

/**
 * Builds an absolute ws:// or wss:// URL for a same-origin path.
 *
 * @param path Path such as "/ws/quotes".
 * @param origin The page origin; injectable for tests.
 * @return The WebSocket URL.
 */
export function wsUrl(
  path: string,
  origin = globalThis.location?.origin
): string {
  return (origin ?? 'http://localhost').replace(/^http/, 'ws') + path;
}

/**
 * Production transport: a WebSocket that reconnects forever with exponential
 * back-off and jitter, on errors and on clean closes alike. On every
 * (re)connect the server sends a snapshot first, which the reducer treats as
 * "start from here".
 */
export class WsFeedClient<M> implements FeedClient<M> {
  private socket?: WebSocketSubject<M | {type: 'resync'}>;

  /** Shared stream of feed messages. */
  readonly messages$: Observable<M>;

  /**
   * Creates a client.
   *
   * @param path Same-origin endpoint, for example "/ws/quotes".
   * @param url Resolver for the absolute URL; replaceable in tests.
   */
  constructor(path: string, url: (path: string) => string = wsUrl) {
    this.messages$ = defer(() => {
      this.socket = webSocket<M | {type: 'resync'}>(url(path));
      return this.socket as Observable<M>;
    }).pipe(
      resilient({
        baseMs: 250,
        capMs: 15_000,
        maxAttempts: Number.MAX_SAFE_INTEGER,
      }),
      share()
    );
  }

  /** Asks the server to resend a snapshot. */
  requestSnapshot(): void {
    this.socket?.next({type: 'resync'});
  }
}
