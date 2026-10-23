import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import {NotesService} from '../api/notes.queries';
import {compact, fmtQty} from '../core/money';
import {QuotesStore} from '../state/quotes.store';
import {TradesStore} from '../state/trades.store';

/** Bottom bar: sequence numbers, message rates, latency and server counters. */
@Component({
  selector: 'app-status-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer
      class="num flex h-6 shrink-0 items-center gap-4 border-t border-line bg-surface px-3 text-[10px] text-muted"
      data-testid="status-bar"
    >
      <span class="flex items-center gap-1.5" data-testid="quote-feed">
        <span class="font-semibold uppercase tracking-wider text-faint"
          >Quotes</span
        >
        <span data-testid="quote-seq">seq {{ qty(quotes.lastSeq()) }}</span>
        <span>{{ quotes.health.perSec() }} msg/s</span>
      </span>
      <span class="flex items-center gap-1.5" data-testid="trade-feed">
        <span class="font-semibold uppercase tracking-wider text-faint"
          >Trades</span
        >
        <span data-testid="trade-seq">seq {{ qty(trades.lastSeq()) }}</span>
        <span>{{ trades.health.perSec() }} msg/s</span>
      </span>
      <span>tape {{ trades.stats().count }} · {{ notional() }}</span>
      <span class="ml-auto flex items-center gap-4">
        @if (system.data(); as s) {
          <span data-testid="rtt">rtt {{ s.rttMs }} ms</span>
          <span>skew {{ skew(s.skewMs) }} ms</span>
          <span
            >clients {{ s.status.quoteClients }}/{{
              s.status.tradeClients
            }}</span
          >
          <span
            >stored {{ qty(s.status.inserted) }} · dup
            {{ qty(s.status.duplicates) }}</span
          >
        } @else {
          <span class="text-faint">server status unavailable</span>
        }
        <span class="text-faint">v2.0</span>
      </span>
    </footer>
  `,
})
export class StatusBarComponent {
  protected readonly quotes = inject(QuotesStore);
  protected readonly trades = inject(TradesStore);
  protected readonly system = inject(NotesService).system;

  protected qty = fmtQty;

  /** Session notional on the tape. */
  protected readonly notional = computed(
    () => '$' + compact(Number(this.trades.stats().notionalMicros / 1_000_000n))
  );

  /** Signed rounded skew. */
  protected skew(ms: number): string {
    const r = Math.round(ms);
    return (r > 0 ? '+' : '') + r;
  }
}
