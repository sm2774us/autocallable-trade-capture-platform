import {A11yModule} from '@angular/cdk/a11y';
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';

import {HOTKEY_HELP} from '../core/hotkeys';
import {WorkspaceStore} from '../state/workspace.store';
import {IconComponent} from '../ui/icon.component';
import {KbdComponent} from '../ui/kbd.component';

/** Modal listing every keyboard shortcut. */
@Component({
  selector: 'app-shortcut-help',
  imports: [A11yModule, KbdComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ws.helpOpen()) {
      <div
        class="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
        (click)="ws.closeHelp()"
      ></div>
      <div
        class="anim-slide-in fixed left-1/2 top-[16vh] z-50 w-[min(520px,92vw)] -translate-x-1/2 rounded-xl border border-line bg-surface p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        cdkTrapFocus
        cdkTrapFocusAutoCapture
        data-testid="help"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[13px] font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            class="text-faint hover:text-fg"
            aria-label="Close"
            (click)="ws.closeHelp()"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </div>
        <dl
          class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[12px]"
        >
          @for (row of rows; track row[0]) {
            <dt class="flex gap-1">
              @for (key of row[0].split(' '); track $index) {
                <app-kbd>{{ key }}</app-kbd>
              }
            </dt>
            <dd class="text-muted">{{ row[1] }}</dd>
          }
        </dl>
      </div>
    }
  `,
})
export class ShortcutHelpComponent {
  protected readonly ws = inject(WorkspaceStore);
  protected readonly rows = HOTKEY_HELP;
}
