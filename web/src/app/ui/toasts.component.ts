import {ChangeDetectionStrategy, Component, inject} from '@angular/core';

import {ToastStore} from '../state/toast.store';
import {IconComponent} from './icon.component';

/** Bottom-right stack of transient notifications. */
@Component({
  selector: 'app-toasts',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed bottom-9 right-3 z-[60] flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      @for (toast of store.toasts(); track toast.id) {
        <div
          class="anim-slide-in pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface p-3 shadow-lg"
          [class]="
            toast.kind === 'success'
              ? 'border-up/50'
              : toast.kind === 'error'
                ? 'border-down/50'
                : 'border-line'
          "
          role="status"
          data-testid="toast"
        >
          <app-icon
            [name]="
              toast.kind === 'success'
                ? 'check'
                : toast.kind === 'error'
                  ? 'alert'
                  : 'info'
            "
            [size]="14"
            [class]="
              toast.kind === 'success'
                ? 'text-up'
                : toast.kind === 'error'
                  ? 'text-down'
                  : 'text-accent'
            "
          />
          <div class="min-w-0 flex-1">
            <p class="text-[12px] font-medium">{{ toast.title }}</p>
            @if (toast.detail) {
              <p class="mt-0.5 text-[11px] text-muted">{{ toast.detail }}</p>
            }
          </div>
          <button
            type="button"
            class="text-faint hover:text-fg"
            aria-label="Dismiss"
            (click)="store.dismiss(toast.id)"
          >
            <app-icon name="x" [size]="12" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  protected readonly store = inject(ToastStore);
}
