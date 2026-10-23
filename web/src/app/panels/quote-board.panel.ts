import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {
  ColumnDef,
  FlexRenderDirective,
  Row,
  createAngularTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
} from '@tanstack/angular-table';

import {compact, fmtClock} from '../core/money';
import {Commands} from '../state/commands';
import {QuoteRow, QuotesStore} from '../state/quotes.store';
import {WorkspaceStore} from '../state/workspace.store';
import {FlashDirective} from '../ui/flash.directive';
import {IconComponent} from '../ui/icon.component';
import {PanelFrameComponent} from '../ui/panel-frame.component';
import {SparkComponent} from '../ui/spark.component';

/** Column ids that hold numbers and are therefore right-aligned. */
const NUMERIC = new Set(['px', 'chgPct', 'qty', 'ts']);

/**
 * Live quote board. The grid engine is TanStack Table (headless: sorting,
 * filtering, row model); rendering is CDK virtual scroll, so five thousand rows
 * cost the same as twenty. Price cells flash on every tick.
 */
@Component({
  selector: 'app-quote-board',
  imports: [
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    FlexRenderDirective,
    FlashDirective,
    SparkComponent,
    IconComponent,
    PanelFrameComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel-frame panel="quotes" icon="trend">
      <div panel-actions class="flex items-center gap-1.5">
        <label class="relative">
          <app-icon
            name="search"
            [size]="11"
            class="absolute left-1.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            #filterInput
            class="field !h-5 w-28 !pl-5 text-[11px]"
            aria-label="Filter symbol"
            placeholder="Filter  /"
            [value]="store.filter()"
            (input)="store.setFilter($any($event.target).value)"
          />
        </label>
        <span class="num text-[10px] text-faint" data-testid="quote-count">{{
          rows().length
        }}</span>
      </div>

      <div
        class="flex h-full min-h-0 flex-col"
        role="grid"
        aria-label="Quote board"
      >
        <div
          class="grid h-6 shrink-0 items-center border-b border-line bg-raised/40 px-2 text-[10px] font-medium uppercase tracking-wider text-muted"
          [style.grid-template-columns]="template"
          role="row"
        >
          @for (header of table.getHeaderGroups()[0].headers; track header.id) {
            <button
              type="button"
              class="flex items-center gap-0.5 hover:text-fg"
              [class.justify-end]="numeric(header.column.id)"
              [class.justify-center]="header.column.id === 'spark'"
              [disabled]="!header.column.getCanSort()"
              (click)="header.column.toggleSorting(undefined, false)"
              [attr.aria-sort]="ariaSort(header.column.getIsSorted())"
              role="columnheader"
            >
              <ng-container
                *flexRender="
                  header.column.columnDef.header;
                  props: header.getContext();
                  let title
                "
                >{{ title }}</ng-container
              >
              @if (header.column.getIsSorted(); as dir) {
                <app-icon
                  [name]="dir === 'asc' ? 'up' : 'down'"
                  [size]="9"
                  class="text-accent"
                />
              }
            </button>
          }
        </div>

        <cdk-virtual-scroll-viewport
          class="min-h-0 flex-1"
          [itemSize]="rowH()"
          [minBufferPx]="300"
          [maxBufferPx]="700"
          data-testid="quote-viewport"
        >
          <div
            *cdkVirtualFor="let row of rows(); trackBy: trackRow"
            class="quote-row grid cursor-pointer items-center border-b border-line/40 px-2 text-[12px] hover:bg-raised/60"
            [class.selected]="row.original.sym === selected()"
            [style.grid-template-columns]="template"
            [style.height.px]="rowH()"
            (click)="ws.selectSym(row.original.sym)"
            role="row"
            data-testid="quote-row"
          >
            @for (cell of row.getVisibleCells(); track cell.id) {
              @switch (cell.column.id) {
                @case ('px') {
                  <span
                    class="num rounded-sm px-1 text-right font-medium"
                    [appFlash]="row.original.px"
                    [appFlashKey]="row.original.sym"
                    role="gridcell"
                    >{{ row.original.px.toFixed(2) }}</span
                  >
                }
                @case ('chgPct') {
                  <span
                    class="num text-right"
                    [class]="row.original.chgPct >= 0 ? 'text-up' : 'text-down'"
                    role="gridcell"
                    >{{ pct(row.original.chgPct) }}</span
                  >
                }
                @case ('spark') {
                  <span class="flex justify-center" role="gridcell">
                    <app-spark
                      [values]="row.original.spark"
                      [up]="row.original.chgPct >= 0"
                    />
                  </span>
                }
                @case ('qty') {
                  <span
                    class="num truncate rounded-sm px-1 text-right"
                    [style.background]="volumeBar(row.original.qty)"
                    role="gridcell"
                    >{{ compactQty(row.original.qty) }}</span
                  >
                }
                @default {
                  <span
                    class="truncate"
                    [class.num]="numeric(cell.column.id)"
                    [class.text-right]="numeric(cell.column.id)"
                    [class.font-semibold]="cell.column.id === 'sym'"
                    [class.text-muted]="cell.column.id === 'ts'"
                    role="gridcell"
                  >
                    <ng-container
                      *flexRender="
                        cell.column.columnDef.cell;
                        props: cell.getContext();
                        let text
                      "
                      >{{ text }}</ng-container
                    >
                  </span>
                }
              }
            }
          </div>
        </cdk-virtual-scroll-viewport>
        @if (!rows().length) {
          <p
            class="absolute inset-x-0 top-16 text-center text-[11px] text-faint"
            data-testid="quote-empty"
          >
            @if (store.status() === 'connecting') {
              Waiting for the first snapshot…
            } @else {
              No symbols match
            }
          </p>
        }
      </div>
    </app-panel-frame>
  `,
})
export class QuoteBoardPanel {
  protected readonly store = inject(QuotesStore);
  protected readonly ws = inject(WorkspaceStore);
  private readonly filterInput =
    viewChild<ElementRef<HTMLInputElement>>('filterInput');

  /** Shared grid template so header and rows line up. */
  protected readonly template =
    'minmax(52px,1fr) minmax(60px,1fr) minmax(54px,0.9fr) minmax(68px,1.2fr) 72px 64px';

  /** Row height follows the density setting. */
  protected readonly rowH = computed(() =>
    this.ws.density() === 'cozy' ? 30 : 24
  );

  /** Symbol highlighted in the grid. */
  protected readonly selected = computed(
    () => this.ws.sym() ?? this.store.symbols()[0] ?? null
  );

  private readonly columns: ColumnDef<QuoteRow>[] = [
    {
      accessorKey: 'sym',
      header: 'Symbol',
      cell: info => info.getValue<string>(),
    },
    {
      accessorKey: 'px',
      header: 'Last',
      cell: info => info.row.original.px.toFixed(2),
    },
    {
      accessorKey: 'chgPct',
      header: 'Chg %',
      cell: info => this.pct(info.row.original.chgPct),
    },
    {
      accessorKey: 'qty',
      header: 'Volume',
      cell: info => compact(info.row.original.qty),
    },
    {id: 'spark', header: 'Trend', enableSorting: false, cell: () => ''},
    {
      accessorKey: 'ts',
      header: 'Time',
      cell: info =>
        info.row.original.ts ? fmtClock(info.row.original.ts).slice(0, 8) : '—',
    },
  ];

  /** The TanStack table instance; options are re-read whenever a signal changes. */
  protected readonly table = createAngularTable<QuoteRow>(() => ({
    data: this.store.rows() as QuoteRow[],
    columns: this.columns,
    state: {sorting: this.store.sorting(), globalFilter: this.store.filter()},
    onSortingChange: updater => {
      this.store.setSorting(updater);
    },
    getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, value: string) =>
      row.original.sym.includes(String(value).trim().toUpperCase()),
    enableSortingRemoval: false,
  }));

  /** Rows after filtering and sorting. */
  protected readonly rows = computed(() => this.table.getRowModel().rows);

  constructor() {
    inject(Commands)
      .focusFilter$.pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.filterInput()?.nativeElement.focus();
      });
  }

  /** Stable identity so recycled DOM rows keep their flash baseline. */
  protected trackRow = (_index: number, row: Row<QuoteRow>): string => row.id;

  /** Background that draws volume as a horizontal data bar. */
  protected volumeBar(qty: number): string {
    const max = this.store.maxQty();
    const pct = max ? Math.max(2, Math.round((qty / max) * 100)) : 0;
    return `linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent) ${pct}%, transparent ${pct}%)`;
  }

  protected compactQty = compact;

  /** True for right-aligned columns. */
  protected numeric(id: string): boolean {
    return NUMERIC.has(id);
  }

  /** Formats a percentage with a sign. */
  protected pct(value: number): string {
    return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  /** Maps TanStack's sort state to the ARIA vocabulary. */
  protected ariaSort(state: false | 'asc' | 'desc'): string {
    return state === 'asc'
      ? 'ascending'
      : state === 'desc'
        ? 'descending'
        : 'none';
  }
}
