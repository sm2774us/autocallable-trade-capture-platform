import {CdkDragHandle} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import {PANEL_TITLES, PanelId} from '../core/layout';
import {WorkspaceStore} from '../state/workspace.store';
import {HlmBtn} from './btn.directive';
import {IconComponent, IconName} from './icon.component';

/**
 * Chrome shared by every panel: a drag handle, an icon and title, an actions
 * slot, and a maximise button. The header is the CDK drag handle: dragging it
 * onto another slot swaps the two panels.
 */
@Component({
  selector: 'app-panel-frame',
  imports: [CdkDragHandle, IconComponent, HlmBtn],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'block h-full min-h-0'},
  template: `
    <section
      class="flex h-full min-h-0 flex-col bg-surface"
      [attr.data-panel-id]="panel()"
      (pointerenter)="ws.setHover(panel())"
      (pointerleave)="ws.setHover(null)"
    >
      <header
        cdkDragHandle
        class="flex h-7 shrink-0 cursor-grab select-none items-center gap-2 border-b border-line bg-raised/60 px-2 active:cursor-grabbing"
      >
        <app-icon name="grip" [size]="12" class="text-faint" />
        <app-icon [name]="icon()" [size]="12" class="text-accent" />
        <h2
          class="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted"
        >
          {{ title() }}
        </h2>
        <div
          class="ml-auto flex items-center gap-1.5"
          (pointerdown)="$event.stopPropagation()"
        >
          <ng-content select="[panel-actions]" />
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            type="button"
            [attr.aria-label]="(isMax() ? 'Restore ' : 'Maximise ') + title()"
            [title]="(isMax() ? 'Restore' : 'Maximise') + ' (M)'"
            (click)="ws.toggleMaximize(panel())"
          >
            <app-icon [name]="isMax() ? 'minimize' : 'maximize'" [size]="12" />
          </button>
        </div>
      </header>
      <div class="relative min-h-0 flex-1">
        <ng-content />
      </div>
    </section>
  `,
})
export class PanelFrameComponent {
  protected readonly ws = inject(WorkspaceStore);

  /** Which panel this frame belongs to. */
  readonly panel = input.required<PanelId>();

  /** Header icon. */
  readonly icon = input.required<IconName>();

  /** Header title. */
  protected readonly title = computed(() => PANEL_TITLES[this.panel()]);

  /** True while this panel fills the workspace. */
  protected readonly isMax = computed(
    () => this.ws.maximized() === this.panel()
  );
}
