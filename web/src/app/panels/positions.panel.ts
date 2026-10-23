import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import {fmtMicros, fmtQty, fmtSigned, toMicros} from '../core/money';
import {Position, avgPriceMicros, unrealizedMicros} from '../core/positions';
import {QuotesStore} from '../state/quotes.store';
import {TradesStore} from '../state/trades.store';
import {WorkspaceStore} from '../state/workspace.store';
import {PanelFrameComponent} from '../ui/panel-frame.component';

/** One displayed position with its mark-to-market numbers. */
interface PositionRow {
  readonly key: string;
  readonly account: string;
  readonly sym: string;
  readonly net: number;
  readonly avg: bigint | null;
  readonly last: bigint | null;
  readonly unrealized: bigint;
  readonly realized: bigint;
  readonly total: bigint;
}

/**
 * Positions and P&L folded from the trade feed. All maths is exact integer
 * (BigInt micros); only the final text is formatted.
 */
@Component({
  selector: 'app-positions',
  imports: [PanelFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel-frame panel="positions" icon="layers">
      <div panel-actions class="num text-[10px]" data-testid="pnl-total">
        <span class="text-muted">Σ P&amp;L </span>
        <span [class]="tone(totals().total)">{{ signed(totals().total) }}</span>
      </div>
      <div class="flex h-full min-h-0 flex-col overflow-auto">
        <table
          class="w-full border-collapse text-[12px]"
          aria-label="Positions"
        >
          <thead
            class="sticky top-0 z-10 bg-surface text-[10px] uppercase tracking-wider text-muted"
          >
            <tr class="h-6 border-b border-line">
              <th class="px-2 text-left font-medium">Account</th>
              <th class="px-2 text-left font-medium">Symbol</th>
              <th class="px-2 text-right font-medium">Net</th>
              <th class="px-2 text-right font-medium">Avg</th>
              <th class="px-2 text-right font-medium">Last</th>
              <th class="px-2 text-right font-medium">Unrealised</th>
              <th class="px-2 text-right font-medium">Realised</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.key) {
              <tr
                class="h-6 cursor-pointer border-b border-line/40 hover:bg-raised/60"
                [class.bg-raised]="row.sym === ws.sym()"
                (click)="ws.selectSym(row.sym)"
                data-testid="position-row"
              >
                <td class="px-2 text-muted">{{ row.account }}</td>
                <td class="px-2 font-semibold">{{ row.sym }}</td>
                <td
                  class="num px-2 text-right"
                  [class]="row.net >= 0 ? 'text-up' : 'text-down'"
                >
                  {{ qty(row.net) }}
                </td>
                <td class="num px-2 text-right">
                  {{ row.avg === null ? '—' : micros(row.avg) }}
                </td>
                <td class="num px-2 text-right">
                  {{ row.last === null ? '—' : micros(row.last) }}
                </td>
                <td class="num px-2 text-right" [class]="tone(row.unrealized)">
                  {{ signed(row.unrealized) }}
                </td>
                <td class="num px-2 text-right" [class]="tone(row.realized)">
                  {{ signed(row.realized) }}
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (!rows().length) {
          <p class="mt-10 text-center text-[11px] text-faint">
            Positions appear as fills arrive
          </p>
        }
      </div>
    </app-panel-frame>
  `,
})
export class PositionsPanel {
  private readonly trades = inject(TradesStore);
  private readonly quotes = inject(QuotesStore);
  protected readonly ws = inject(WorkspaceStore);

  /** Positions marked to the last quote. */
  protected readonly rows = computed<readonly PositionRow[]>(() => {
    const book = this.quotes.book().quotes;
    return this.trades
      .positions()
      .map((p: Position): PositionRow => {
        const quote = book.get(p.sym as never);
        const last = quote ? toMicros(quote.px) : null;
        const unrealized = last === null ? 0n : unrealizedMicros(p, last);
        return {
          key: p.key,
          account: p.account,
          sym: p.sym,
          net: p.netQty,
          avg: avgPriceMicros(p),
          last,
          unrealized,
          realized: p.realizedMicros,
          total: unrealized + p.realizedMicros,
        };
      })
      .sort(
        (a, b) =>
          a.account.localeCompare(b.account) || a.sym.localeCompare(b.sym)
      );
  });

  /** Sum of all P&L. */
  protected readonly totals = computed(() => ({
    total: this.rows().reduce((sum, row) => sum + row.total, 0n),
  }));

  protected qty = fmtQty;
  protected micros(value: bigint): string {
    return fmtMicros(value, 2);
  }
  protected signed(value: bigint): string {
    return fmtSigned(value, 2);
  }
  protected tone(value: bigint): string {
    return value > 0n ? 'text-up' : value < 0n ? 'text-down' : 'text-muted';
  }
}
