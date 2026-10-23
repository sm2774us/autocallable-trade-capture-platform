import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import {NotesService} from '../api/notes.queries';
import {ClockService} from '../state/clock.service';
import {QuotesStore} from '../state/quotes.store';
import {TradesStore} from '../state/trades.store';
import {WorkspaceStore} from '../state/workspace.store';
import {HlmBtn} from '../ui/btn.directive';
import {IconComponent} from '../ui/icon.component';
import {KbdComponent} from '../ui/kbd.component';
import {StatusPillComponent} from './status-pill.component';

/** Brand, command-palette launcher, feed health, clock and view toggles. */
@Component({
  selector: 'app-top-bar',
  imports: [DatePipe, HlmBtn, IconComponent, KbdComponent, StatusPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="flex h-10 shrink-0 items-center gap-4 border-b border-line bg-surface px-3"
      data-testid="top-bar"
    >
      <div class="flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="22"
            height="22"
            rx="6"
            fill="var(--accent)"
          />
          <path
            d="M5 16l4-5 3 3 6-8"
            fill="none"
            stroke="#fff"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text-[12px] font-semibold tracking-[0.16em]"
          >TRADE&nbsp;CAPTURE</span
        >
        <span
          class="rounded px-1.5 py-px text-[9px] font-bold tracking-widest"
          [class]="envClass()"
          data-testid="env-badge"
          >{{ env() }}</span
        >
      </div>

      <button
        type="button"
        class="mx-auto flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-left text-[12px] text-faint transition-colors hover:border-faint"
        (click)="ws.openPalette()"
        aria-label="Open command palette"
        data-testid="palette-button"
      >
        <app-icon name="search" [size]="13" />
        <span class="flex-1">Search symbols, run commands…</span>
        <app-kbd>Ctrl</app-kbd><app-kbd>K</app-kbd>
      </button>

      <div class="flex items-center gap-4">
        <app-status-pill label="Quotes" [status]="quotes.status()" />
        <app-status-pill label="Trades" [status]="trades.status()" />
        <time
          class="num w-[92px] text-right text-[12px] text-muted"
          data-testid="clock"
          >{{ clock.ms() | date: 'HH:mm:ss.SSS' : 'UTC' }}</time
        >
        <span class="text-[10px] text-faint">UTC</span>
        <div class="flex items-center gap-0.5">
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            type="button"
            (click)="ws.toggleDensity()"
            [attr.aria-label]="'Density: ' + ws.density()"
            title="Density (D)"
            data-testid="density-button"
          >
            <app-icon name="list" [size]="13" />
          </button>
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            type="button"
            (click)="ws.toggleTheme()"
            aria-label="Toggle theme"
            title="Theme (T)"
            data-testid="theme-button"
          >
            <app-icon
              [name]="ws.theme() === 'dark' ? 'sun' : 'moon'"
              [size]="13"
            />
          </button>
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            type="button"
            (click)="ws.openHelp()"
            aria-label="Keyboard shortcuts"
            title="Shortcuts (?)"
          >
            <app-icon name="keyboard" [size]="13" />
          </button>
        </div>
      </div>
    </header>
  `,
})
export class TopBarComponent {
  protected readonly ws = inject(WorkspaceStore);
  protected readonly quotes = inject(QuotesStore);
  protected readonly trades = inject(TradesStore);
  protected readonly clock = inject(ClockService);
  private readonly service = inject(NotesService);

  /** Environment label from the server's status document. */
  protected readonly env = computed(() => {
    if (this.service.system.isError()) {
      return 'OFFLINE';
    }
    const sample = this.service.system.data();
    return sample ? (sample.status.demo ? 'DEMO' : 'LIVE') : '…';
  });

  protected readonly envClass = computed(() => {
    switch (this.env()) {
      case 'LIVE':
        return 'bg-up/15 text-up';
      case 'DEMO':
        return 'bg-warn/15 text-warn';
      case 'OFFLINE':
        return 'bg-down/15 text-down';
      default:
        return 'bg-raised text-faint';
    }
  });
}
