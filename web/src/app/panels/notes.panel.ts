import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';

import {compact} from '../core/money';
import {NotesService} from '../api/notes.queries';
import {HlmBtn} from '../ui/btn.directive';
import {IconComponent} from '../ui/icon.component';
import {PanelFrameComponent} from '../ui/panel-frame.component';

/** Booked notes, cached by TanStack Query and refreshed after every booking. */
@Component({
  selector: 'app-notes',
  imports: [DatePipe, PanelFrameComponent, HlmBtn, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel-frame panel="notes" icon="briefcase">
      <div panel-actions class="flex items-center gap-1.5">
        <span class="num text-[10px] text-faint" data-testid="notes-count">{{
          notes.notes.data()?.length ?? 0
        }}</span>
        <button
          hlmBtn
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Refresh notes"
          (click)="notes.notes.refetch()"
        >
          <app-icon
            name="rotate"
            [size]="11"
            [class]="notes.notes.isFetching() ? 'anim-pulse' : ''"
          />
        </button>
      </div>
      <div class="h-full overflow-auto">
        @if (notes.notes.isError()) {
          <div
            class="flex flex-col items-center gap-2 pt-8 text-[11px] text-down"
            data-testid="notes-error"
          >
            <span>Could not load notes</span>
            <button
              hlmBtn
              size="sm"
              type="button"
              (click)="notes.notes.refetch()"
            >
              Retry
            </button>
          </div>
        } @else if (notes.notes.isPending()) {
          <div class="space-y-1 p-2" aria-busy="true">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-5 animate-pulse rounded bg-raised"></div>
            }
          </div>
        } @else if (!notes.notes.data()?.length) {
          <p
            class="pt-10 text-center text-[11px] text-faint"
            data-testid="notes-empty"
          >
            No notes booked yet. Use the ticket.
          </p>
        } @else {
          <table
            class="w-full border-collapse text-[12px]"
            aria-label="Booked notes"
          >
            <thead
              class="sticky top-0 bg-surface text-[10px] uppercase tracking-wider text-muted"
            >
              <tr class="h-6 border-b border-line">
                <th class="px-2 text-left font-medium">ID</th>
                <th class="px-2 text-left font-medium">Under.</th>
                <th class="px-2 text-right font-medium">Notional</th>
                <th class="px-2 text-right font-medium">Cpn</th>
                <th class="px-2 text-right font-medium">KI / Cpn / AC</th>
                <th class="px-2 text-right font-medium">Booked</th>
              </tr>
            </thead>
            <tbody>
              @for (n of notes.notes.data(); track n.id) {
                <tr
                  class="h-6 border-b border-line/40 hover:bg-raised/60"
                  data-testid="note-row"
                >
                  <td class="num px-2 text-accent">{{ n.id }}</td>
                  <td class="px-2 font-semibold">{{ n.terms.underlying }}</td>
                  <td class="num px-2 text-right">
                    {{ money(n.terms.notional) }}
                  </td>
                  <td class="num px-2 text-right">
                    {{ (n.terms.couponRate * 100).toFixed(2) }}%
                  </td>
                  <td class="num px-2 text-right text-muted">
                    {{ n.terms.kiBarrier }} / {{ n.terms.couponBarrier }} /
                    {{ n.terms.autocallBarrier }}
                  </td>
                  <td class="num px-2 text-right text-muted">
                    {{ n.bookedAt | date: 'HH:mm:ss' : 'UTC' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </app-panel-frame>
  `,
})
export class NotesPanel {
  protected readonly notes = inject(NotesService);

  /** Compact money text. */
  protected money(value: number): string {
    return compact(value);
  }
}
