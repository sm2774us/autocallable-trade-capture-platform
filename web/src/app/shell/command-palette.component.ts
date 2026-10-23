import {A11yModule} from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Injector,
  afterNextRender,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  BrnCommand,
  BrnCommandEmpty,
  BrnCommandGroup,
  BrnCommandInput,
  BrnCommandItem,
  BrnCommandList,
} from '@spartan-ng/brain/command';

import {fuzzyMatch, fuzzyScore} from '../core/fuzzy';
import {PANEL_IDS, PANEL_TITLES} from '../core/layout';
import {Commands} from '../state/commands';
import {QuotesStore} from '../state/quotes.store';
import {TradesStore} from '../state/trades.store';
import {WorkspaceStore} from '../state/workspace.store';
import {IconComponent, IconName} from '../ui/icon.component';
import {KbdComponent} from '../ui/kbd.component';

/** One entry of the palette. */
interface PaletteAction {
  readonly label: string;
  readonly group: string;
  readonly icon: IconName;
  readonly hint?: string;
  readonly run: () => void;
}

/**
 * Ctrl/Cmd+K command palette built on the spartan/ng brain command primitive:
 * fuzzy filter, arrow-key navigation, Enter to run. Every workspace command and
 * every symbol is reachable without the mouse.
 */
@Component({
  selector: 'app-command-palette',
  imports: [
    A11yModule,
    BrnCommand,
    BrnCommandInput,
    BrnCommandList,
    BrnCommandGroup,
    BrnCommandItem,
    BrnCommandEmpty,
    IconComponent,
    KbdComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ws.paletteOpen()) {
      <div
        class="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
        (click)="ws.closePalette()"
        data-testid="palette-backdrop"
      ></div>
      <div
        class="anim-slide-in fixed left-1/2 top-[14vh] z-50 w-[min(600px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        data-testid="palette"
      >
        <div
          brnCommand
          [filter]="filter"
          [search]="search()"
          (searchChange)="search.set($event)"
        >
          <div class="flex items-center gap-2 border-b border-line px-3">
            <app-icon name="search" [size]="14" class="text-faint" />
            <input
              #box
              brnCommandInput
              cdkFocusInitial
              class="h-11 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
              placeholder="Type a command or a symbol…"
              aria-label="Command"
            />
            <app-kbd>Esc</app-kbd>
          </div>
          <div
            brnCommandList
            class="max-h-[50vh] overflow-auto p-1.5"
            aria-label="Commands"
          >
            <div
              *brnCommandEmpty
              class="px-3 py-6 text-center text-[12px] text-faint"
            >
              No matching command
            </div>
            @for (group of groups(); track group.name) {
              <div brnCommandGroup>
                <p
                  class="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint"
                >
                  {{ group.name }}
                </p>
                @for (action of group.items; track action.label) {
                  <button
                    brnCommandItem
                    type="button"
                    [value]="action.label"
                    (selected)="run(action)"
                    class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] aria-selected:bg-accent/15"
                  >
                    <app-icon
                      [name]="action.icon"
                      [size]="13"
                      class="text-muted"
                    />
                    <span class="flex-1">{{ action.label }}</span>
                    @if (action.hint) {
                      <app-kbd>{{ action.hint }}</app-kbd>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPaletteComponent {
  protected readonly ws = inject(WorkspaceStore);
  private readonly injector = inject(Injector);
  private readonly quotes = inject(QuotesStore);
  private readonly trades = inject(TradesStore);
  private readonly commands = inject(Commands);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  private readonly command = viewChild(BrnCommand);

  /** Fuzzy filter handed to the brain primitive. */
  protected readonly filter = fuzzyMatch;

  /** Current query (two-way with the primitive). */
  protected readonly search = signal('');

  private readonly actions = computed<PaletteAction[]>(() => {
    const ws = this.ws;
    const list: PaletteAction[] = [
      {
        group: 'Ticket',
        label: 'Focus note ticket',
        icon: 'send',
        hint: 'Alt T',
        run: () => this.commands.focusTicket$.next(),
      },
      {
        group: 'Ticket',
        label: 'Book note',
        icon: 'check',
        hint: 'Ctrl ↵',
        run: () => this.commands.submitTicket$.next(),
      },
      {
        group: 'View',
        label: 'Toggle dark / light theme',
        icon: 'sun',
        hint: 'T',
        run: () => ws.toggleTheme(),
      },
      {
        group: 'View',
        label: 'Toggle compact / cozy density',
        icon: 'list',
        hint: 'D',
        run: () => ws.toggleDensity(),
      },
      {
        group: 'View',
        label: 'Chart: candlesticks',
        icon: 'candles',
        run: () => ws.setChartKind('candles'),
      },
      {
        group: 'View',
        label: 'Chart: area',
        icon: 'area',
        run: () => ws.setChartKind('area'),
      },
      ...[1, 5, 15, 60].map((sec): PaletteAction => ({
        group: 'View',
        label: `Chart: ${sec >= 60 ? sec / 60 + '-minute' : sec + '-second'} candles`,
        icon: 'activity',
        run: () => ws.setFrame(sec),
      })),
      {
        group: 'View',
        label: 'Trade tape: show all',
        icon: 'list',
        run: () => this.trades.setSide('ALL'),
      },
      {
        group: 'View',
        label: 'Trade tape: buys only',
        icon: 'up',
        run: () => this.trades.setSide('BUY'),
      },
      {
        group: 'View',
        label: 'Trade tape: sells only',
        icon: 'down',
        run: () => this.trades.setSide('SELL'),
      },
      {
        group: 'View',
        label: 'Focus quote filter',
        icon: 'search',
        hint: '/',
        run: () => this.commands.focusFilter$.next(),
      },
      ...PANEL_IDS.map((id): PaletteAction => ({
        group: 'Panels',
        label: `Maximise ${PANEL_TITLES[id]}`,
        icon: 'maximize',
        run: () => ws.setMaximized(id),
      })),
      {
        group: 'Panels',
        label: 'Restore all panels',
        icon: 'minimize',
        hint: 'Esc',
        run: () => ws.setMaximized(null),
      },
      {
        group: 'Panels',
        label: 'Reset layout',
        icon: 'layout',
        run: () => ws.resetLayout(),
      },
      {
        group: 'Help',
        label: 'Show keyboard shortcuts',
        icon: 'keyboard',
        hint: '?',
        run: () => ws.openHelp(),
      },
    ];
    const query = this.search().trim();
    if (query) {
      const symbols = this.quotes
        .symbols()
        .map(s => ({s, score: fuzzyScore(query, s)}))
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((x): PaletteAction => ({
          group: 'Symbols',
          label: `Go to ${x.s}`,
          icon: 'trend',
          run: () => ws.selectSym(x.s),
        }));
      list.unshift(...symbols);
    }
    return list;
  });

  /** Actions grouped for display, in first-seen group order. */
  protected readonly groups = computed(() => {
    const byName = new Map<string, PaletteAction[]>();
    for (const action of this.actions()) {
      byName.set(action.group, [...(byName.get(action.group) ?? []), action]);
    }
    return [...byName].map(([name, items]) => ({name, items}));
  });

  constructor() {
    // Symbol rows appear only after the query changes, so the library's own
    // "reset to first" runs too early; re-activate the best match after render.
    effect(() => {
      this.search();
      this.groups();
      afterNextRender(() => this.command()?.keyManager.setFirstItemActive(), {
        injector: this.injector,
      });
    });
    effect(() => {
      if (this.ws.paletteOpen()) {
        this.search.set('');
        // The dialog renders after this effect; focus on the next frame at the latest.
        afterNextRender(() => this.box()?.nativeElement.focus(), {
          injector: this.injector,
        });
      }
    });
  }

  /** Runs an action and closes the palette. */
  protected run(action: PaletteAction): void {
    this.ws.closePalette();
    action.run();
  }
}
