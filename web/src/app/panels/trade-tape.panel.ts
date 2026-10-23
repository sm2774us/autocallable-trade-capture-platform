import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  BrnToggleGroup,
  BrnToggleGroupItem,
} from '@spartan-ng/brain/toggle-group';

import {Trade} from '../core/models';
import {compact, fmtClock, fmtMicros, fmtQty} from '../core/money';
import {SideFilter, TradesStore} from '../state/trades.store';
import {WorkspaceStore} from '../state/workspace.store';
import {PanelFrameComponent} from '../ui/panel-frame.component';

/**
 * Time-and-sales tape of captured fills, newest first. Buys and sells are
 * tinted, new prints flash once, and the side toggle narrows the list without
 * touching the underlying book.
 */
@Component({
  selector: 'app-trade-tape',
  imports: [
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    BrnToggleGroup,
    BrnToggleGroupItem,
    PanelFrameComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel-frame panel="tape" icon="list">
      <div panel-actions class="flex items-center gap-2">
        <span
          class="num hidden text-[10px] text-muted xl:inline"
          data-testid="tape-stats"
        >
          <span class="text-up">B {{ compactQty(store.stats().buyQty) }}</span>
          <span class="text-faint"> · </span>
          <span class="text-down"
            >S {{ compactQty(store.stats().sellQty) }}</span
          >
          <span class="text-faint"> · </span>
          <span>{{ notionalText() }}</span>
        </span>
        <div
          class="seg"
          brnToggleGroup
          [value]="store.side()"
          (valueChange)="onSide($event)"
          aria-label="Side filter"
        >
          @for (option of sides; track option) {
            <button
              type="button"
              class="seg-item"
              brnToggleGroupItem
              [value]="option"
            >
              {{ option }}
            </button>
          }
        </div>
      </div>

      <div
        class="flex h-full min-h-0 flex-col"
        role="grid"
        aria-label="Trade tape"
      >
        <div
          class="flex h-0.5 shrink-0 bg-down/70"
          aria-hidden="true"
          data-testid="imbalance"
        >
          <div
            class="bg-up/80 transition-[width] duration-300"
            [style.width.%]="buyShare()"
          ></div>
        </div>
        <div
          class="grid h-6 shrink-0 items-center border-b border-line bg-raised/40 px-2 text-[10px] font-medium uppercase tracking-wider text-muted"
          [style.grid-template-columns]="template"
        >
          <span>Time</span><span>Side</span><span>Symbol</span>
          <span class="text-right">Qty</span
          ><span class="text-right">Price</span>
          <span class="truncate pl-2">Account</span>
        </div>
        <cdk-virtual-scroll-viewport
          class="min-h-0 flex-1"
          [itemSize]="rowH()"
          [minBufferPx]="300"
          [maxBufferPx]="700"
        >
          <div
            *cdkVirtualFor="let t of store.visible(); trackBy: trackTrade"
            class="tape-row grid cursor-pointer items-center border-b border-line/40 px-2 text-[12px] hover:bg-raised/60"
            [class]="flashClass(t)"
            [class.selected]="t.sym === ws.sym()"
            [style.grid-template-columns]="template"
            [style.height.px]="rowH()"
            (click)="ws.selectSym(t.sym)"
            role="row"
            data-testid="tape-row"
          >
            <span class="num text-muted">{{ clock(t.ts) }}</span>
            <span
              class="font-semibold"
              [class]="t.side === 'BUY' ? 'text-up' : 'text-down'"
              >{{ t.side }}</span
            >
            <span class="font-semibold">{{ t.sym }}</span>
            <span class="num text-right">{{ qty(t.qty) }}</span>
            <span
              class="num text-right"
              [class]="t.side === 'BUY' ? 'text-up' : 'text-down'"
              >{{ px(t.pxMicros) }}</span
            >
            <span class="truncate pl-2 text-muted">{{ t.account }}</span>
          </div>
        </cdk-virtual-scroll-viewport>
        @if (!store.visible().length) {
          <p
            class="absolute inset-x-0 top-16 text-center text-[11px] text-faint"
            data-testid="tape-empty"
          >
            @if (store.status() === 'connecting') {
              Waiting for the first snapshot…
            } @else {
              No trades yet
            }
          </p>
        }
      </div>
    </app-panel-frame>
  `,
})
export class TradeTapePanel {
  protected readonly store = inject(TradesStore);
  protected readonly ws = inject(WorkspaceStore);

  /** Side filter options. */
  protected readonly sides: readonly SideFilter[] = ['ALL', 'BUY', 'SELL'];

  /** Shared grid template. */
  protected readonly template =
    '96px 40px minmax(48px,1fr) 64px 80px minmax(56px,1fr)';

  /** Row height follows the density setting. */
  protected readonly rowH = computed(() =>
    this.ws.density() === 'cozy' ? 30 : 24
  );

  /** Session notional as compact text. */
  protected readonly notionalText = computed(
    () => '$' + compact(Number(this.store.stats().notionalMicros / 1_000_000n))
  );

  /** Share of buy quantity on the tape, for the imbalance bar. */
  protected readonly buyShare = computed(() => {
    const {buyQty, sellQty} = this.store.stats();
    return buyQty + sellQty ? (buyQty / (buyQty + sellQty)) * 100 : 50;
  });

  /** Reacts to the toggle group. */
  protected onSide(value: unknown): void {
    if (value === 'ALL' || value === 'BUY' || value === 'SELL') {
      this.store.setSide(value);
    }
  }

  protected trackTrade = (_index: number, trade: Trade): string => trade.id;
  protected clock = fmtClock;
  protected qty = fmtQty;
  protected compactQty = compact;
  protected px(micros: number): string {
    return fmtMicros(micros, 2);
  }

  /** Newest few prints get a one-off tint animation. */
  protected flashClass(trade: Trade): string {
    if (trade.seq <= this.store.lastSeq() - 2) {
      return '';
    }
    return trade.side === 'BUY' ? 'anim-row-buy' : 'anim-row-sell';
  }
}
