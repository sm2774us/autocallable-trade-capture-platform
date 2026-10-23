import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  QueryClient,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

import {correlationInterceptor} from './api/notes.api';
import {FEED_CLIENT, TRADE_FEED_CLIENT} from './feed/feed.client';
import {WsFeedClient} from './feed/ws-feed.client';
import {QuoteMsg, TradeMsg} from './core/models';

/**
 * Application-wide providers: error listeners, HTTP with a correlation id,
 * TanStack Query for server state, and the two live feeds. Angular 21 is
 * zoneless by default, so no zone provider is needed.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([correlationInterceptor])),
    provideTanStackQuery(
      new QueryClient({
        defaultOptions: {
          queries: {retry: 1, refetchOnWindowFocus: false, staleTime: 2_000},
        },
      })
    ),
    {
      provide: FEED_CLIENT,
      useFactory: () => new WsFeedClient<QuoteMsg>('/ws/quotes'),
    },
    {
      provide: TRADE_FEED_CLIENT,
      useFactory: () => new WsFeedClient<TradeMsg>('/ws/trades'),
    },
  ],
};
