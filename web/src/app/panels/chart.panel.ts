import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  BrnToggleGroup,
  BrnToggleGroupItem,
} from '@spartan-ng/brain/toggle-group';

import {FRAMES} from '../core/layout';
import {Candle, toCandles} from '../core/ohlc';
import {QuotesStore} from '../state/quotes.store';
import {WorkspaceStore} from '../state/workspace.store';
import {IconComponent} from '../ui/icon.component';
import {PanelFrameComponent} from '../ui/panel-frame.component';
import {CHART_FACTORY, ChartHandle, readColors} from './chart.adapter';

/**
 * Candlestick / area chart of the selected symbol, built from the quote ticks
 * the store already holds. The chart library hides behind {@link ChartHandle},
 * so the panel is testable without a canvas.
 */
@Component({
  selector: 'app-chart',
  imports: [
    BrnToggleGroup,
    BrnToggleGroupItem,
    IconComponent,
    PanelFrameComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel-frame panel="chart" icon="candles">
      <div panel-actions class="flex items-center gap-1.5">
        <select
          class="field !h-5 !w-[76px] !px-1 text-[11px]"
          aria-label="Chart symbol"
          [value]="symbol()"
          (change)="ws.selectSym($any($event.target).value)"
        >
          @for (s of store.symbols(); track s) {
            <option [value]="s" [selected]="s === symbol()">{{ s }}</option>
          }
        </select>
        <div
          class="seg"
          brnToggleGroup
          [value]="ws.chartKind()"
          (valueChange)="onKind($event)"
          aria-label="Chart type"
        >
          <button
            type="button"
            class="seg-item"
            brnToggleGroupItem
            value="candles"
            aria-label="Candles"
            title="Candles"
          >
            <app-icon name="candles" [size]="11" />
          </button>
          <button
            type="button"
            class="seg-item"
            brnToggleGroupItem
            value="area"
            aria-label="Area"
            title="Area"
          >
            <app-icon name="area" [size]="11" />
          </button>
        </div>
        <div
          class="seg"
          brnToggleGroup
          [value]="ws.frameSec()"
          (valueChange)="onFrame($event)"
          aria-label="Candle width"
        >
          @for (f of frames; track f) {
            <button
              type="button"
              class="seg-item"
              brnToggleGroupItem
              [value]="f"
            >
              {{ label(f) }}
            </button>
          }
        </div>
      </div>
      <div class="absolute inset-0">
        <div #host class="absolute inset-0" data-testid="chart-host"></div>
        <div
          class="pointer-events-none absolute left-3 top-2 flex items-baseline gap-3"
          data-testid="chart-readout"
        >
          <span class="text-[15px] font-semibold tracking-wide">{{
            symbol()
          }}</span>
          <span class="num text-[15px]">{{
            last()?.close?.toFixed(2) ?? '—'
          }}</span>
          <span
            class="num text-[11px]"
            [class]="(change() ?? 0) >= 0 ? 'text-up' : 'text-down'"
          >
            {{ changeText() }}
          </span>
          <span class="text-[10px] text-faint"
            >{{ candles().length }} bars</span
          >
        </div>
        @if (!candles().length) {
          <p
            class="absolute inset-x-0 top-1/2 text-center text-[11px] text-faint"
          >
            Waiting for ticks…
          </p>
        }
      </div>
    </app-panel-frame>
  `,
})
export class ChartPanel {
  protected readonly store = inject(QuotesStore);
  protected readonly ws = inject(WorkspaceStore);
  private readonly factory = inject(CHART_FACTORY);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly destroyRef = inject(DestroyRef);
  private readonly handle = signal<ChartHandle | null>(null);
  private lastKey = '';
  private lastTheme = '';

  /** Candle widths on offer. */
  protected readonly frames = FRAMES;

  /** The symbol being charted: the selection, else the first available. */
  protected readonly symbol = computed(
    () => this.ws.sym() ?? this.store.symbols()[0] ?? ''
  );

  /** Candles of the selected symbol at the selected width. */
  protected readonly candles = computed<readonly Candle[]>(() => {
    const ticks = this.store.book().ticks.get(this.symbol() as never) ?? [];
    return toCandles(ticks, this.ws.frameSec());
  });

  /** Newest candle. */
  protected readonly last = computed(() => this.candles().at(-1) ?? null);

  /** Change from the first candle's open to the last close. */
  protected readonly change = computed(() => {
    const first = this.candles()[0];
    const last = this.last();
    return first && last && first.open
      ? ((last.close - first.open) / first.open) * 100
      : null;
  });

  /** Signed percentage text. */
  protected readonly changeText = computed(() => {
    const c = this.change();
    return c === null ? '' : (c > 0 ? '+' : '') + c.toFixed(2) + '%';
  });

  constructor() {
    afterNextRender(() => {
      const el = this.host().nativeElement;
      const handle = this.factory(el, readColors(el));
      this.handle.set(handle);
      this.destroyRef.onDestroy(() => {
        handle.destroy();
      });
    });
    effect(() => {
      const handle = this.handle();
      const candles = this.candles();
      const kind = this.ws.chartKind();
      const theme = this.ws.theme();
      const key = this.symbol() + '|' + this.ws.frameSec();
      if (!handle) {
        return;
      }
      if (theme !== this.lastTheme) {
        // Theme tokens are applied to <html> by the WorkspaceStore effect.
        handle.applyTheme(readColors(this.host().nativeElement));
        this.lastTheme = theme;
      }
      handle.setData(candles, kind);
      if (key !== this.lastKey && candles.length) {
        handle.follow();
        this.lastKey = key;
      }
    });
  }

  protected label(sec: number): string {
    return sec >= 60 ? sec / 60 + 'm' : sec + 's';
  }

  protected onKind(value: unknown): void {
    if (value === 'candles' || value === 'area') {
      this.ws.setChartKind(value);
    }
  }

  protected onFrame(value: unknown): void {
    if (typeof value === 'number' && FRAMES.includes(value)) {
      this.ws.setFrame(value);
    }
  }
}
