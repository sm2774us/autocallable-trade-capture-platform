import {ChangeDetectionStrategy, Component, inject} from '@angular/core';

import {HotkeyAction, resolveHotkey} from './core/hotkeys';
import {Commands} from './state/commands';
import {QuotesStore} from './state/quotes.store';
import {TradesStore} from './state/trades.store';
import {WorkspaceStore} from './state/workspace.store';
import {CommandPaletteComponent} from './shell/command-palette.component';
import {ShortcutHelpComponent} from './shell/shortcut-help.component';
import {StatusBarComponent} from './shell/status-bar.component';
import {TopBarComponent} from './shell/top-bar.component';
import {WorkspaceComponent} from './shell/workspace.component';
import {ToastsComponent} from './ui/toasts.component';

/**
 * Root component: the terminal shell. It owns the global keyboard handler and
 * makes sure both feeds connect at start-up, whichever panel is on screen.
 */
@Component({
  selector: 'app-root',
  imports: [
    TopBarComponent,
    WorkspaceComponent,
    StatusBarComponent,
    CommandPaletteComponent,
    ShortcutHelpComponent,
    ToastsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'(document:keydown)': 'onKey($event)', class: 'block h-dvh'},
  template: `
    <div class="flex h-full flex-col bg-bg text-fg">
      <app-top-bar />
      <main class="min-h-0 flex-1" aria-label="Workspace">
        <app-workspace />
      </main>
      <app-status-bar />
    </div>
    <app-command-palette />
    <app-shortcut-help />
    <app-toasts />
  `,
})
export class App {
  private readonly ws = inject(WorkspaceStore);
  private readonly quotes = inject(QuotesStore);
  private readonly trades = inject(TradesStore);
  private readonly commands = inject(Commands);

  /**
   * Resolves a key press to an action and performs it.
   *
   * @param event The keyboard event.
   */
  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      !!target &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable);
    const action = resolveHotkey(event, {
      typing,
      modalOpen: this.ws.modalOpen(),
    });
    if (action) {
      event.preventDefault();
      this.perform(action);
    }
  }

  private perform(action: HotkeyAction): void {
    switch (action) {
      case 'palette':
        this.ws.paletteOpen() ? this.ws.closePalette() : this.ws.openPalette();
        break;
      case 'help':
        this.ws.openHelp();
        break;
      case 'escape':
        if (this.ws.paletteOpen()) {
          this.ws.closePalette();
        } else if (this.ws.helpOpen()) {
          this.ws.closeHelp();
        } else if (this.ws.maximized()) {
          this.ws.setMaximized(null);
        } else {
          this.commands.cancelTicket$.next();
        }
        break;
      case 'focusTicket':
        this.commands.focusTicket$.next();
        break;
      case 'submitTicket':
        this.commands.submitTicket$.next();
        break;
      case 'focusFilter':
        this.commands.focusFilter$.next();
        break;
      case 'nextSym':
        this.ws.stepSym(this.quotes.symbols(), 1);
        break;
      case 'prevSym':
        this.ws.stepSym(this.quotes.symbols(), -1);
        break;
      case 'toggleTheme':
        this.ws.toggleTheme();
        break;
      case 'toggleDensity':
        this.ws.toggleDensity();
        break;
      case 'maximize': {
        const hover = this.ws.hover();
        if (hover) {
          this.ws.toggleMaximize(hover);
        }
        break;
      }
    }
  }
}
