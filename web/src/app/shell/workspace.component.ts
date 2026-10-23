import {
  CdkDrag,
  CdkDragEnd,
  CdkDragMove,
  CdkDragPreview,
} from '@angular/cdk/drag-drop';
import {NgTemplateOutlet} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  BrnResizableGroup,
  BrnResizableHandle,
  BrnResizablePanel,
} from '@spartan-ng/brain/resizable';

import {PANEL_TITLES, PanelId} from '../core/layout';
import {ChartPanel} from '../panels/chart.panel';
import {NotesPanel} from '../panels/notes.panel';
import {PositionsPanel} from '../panels/positions.panel';
import {QuoteBoardPanel} from '../panels/quote-board.panel';
import {TicketPanel} from '../panels/ticket.panel';
import {TradeTapePanel} from '../panels/trade-tape.panel';
import {WorkspaceStore} from '../state/workspace.store';

/**
 * The dockable workspace: three resizable columns of two resizable panes
 * (spartan/ng brain primitives), panel headers draggable onto another slot to
 * swap places (Angular CDK drag), one panel maximisable. Sizes and order are
 * persisted by the {@link WorkspaceStore}.
 */
@Component({
  selector: 'app-workspace',
  imports: [
    BrnResizableGroup,
    BrnResizablePanel,
    BrnResizableHandle,
    CdkDrag,
    CdkDragPreview,
    NgTemplateOutlet,
    QuoteBoardPanel,
    TradeTapePanel,
    ChartPanel,
    PositionsPanel,
    TicketPanel,
    NotesPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #panelTpl let-id let-slot="slot">
      <div
        cdkDrag
        class="h-full"
        [cdkDragData]="id"
        (cdkDragMoved)="onMove($event)"
        (cdkDragEnded)="onEnd($event, id)"
        [attr.data-ws-panel]="id"
      >
        <div
          *cdkDragPreview
          class="rounded-md border border-accent bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider shadow-lg"
        >
          {{ title(id) }}
        </div>
        @switch (id) {
          @case ('quotes') {
            <app-quote-board />
          }
          @case ('tape') {
            <app-trade-tape />
          }
          @case ('chart') {
            <app-chart />
          }
          @case ('positions') {
            <app-positions />
          }
          @case ('ticket') {
            <app-ticket />
          }
          @case ('notes') {
            <app-notes />
          }
        }
      </div>
    </ng-template>

    @if (ws.maximized(); as max) {
      <div class="h-full" data-testid="maximized">
        <ng-container
          *ngTemplateOutlet="panelTpl; context: {$implicit: max, slot: -1}"
        />
      </div>
    } @else {
      <div
        brnResizableGroup
        direction="horizontal"
        [layout]="cols()"
        (layoutChanged)="ws.setCols($event)"
        class="bg-bg"
        data-testid="workspace"
      >
        @for (col of columns; track col) {
          <div
            brnResizablePanel
            [id]="'col-' + col"
            [defaultSize]="ws.cols()[col]"
            [minSize]="14"
          >
            <div
              brnResizableGroup
              direction="vertical"
              [layout]="rows()[col]"
              (layoutChanged)="ws.setRows(col, $event)"
            >
              <div
                brnResizablePanel
                [id]="'row-' + col + '-0'"
                [defaultSize]="ws.rows()[col][0]"
                [minSize]="16"
              >
                <div
                  class="h-full"
                  [attr.data-ws-slot]="col * 2"
                  [class.slot-target]="dropSlot() === col * 2"
                >
                  <ng-container
                    *ngTemplateOutlet="
                      panelTpl;
                      context: {$implicit: ws.order()[col * 2], slot: col * 2}
                    "
                  />
                </div>
              </div>
              <div
                brnResizeHandle
                class="rz-handle"
                [attr.aria-label]="'Resize rows in column ' + (col + 1)"
              ></div>
              <div
                brnResizablePanel
                [id]="'row-' + col + '-1'"
                [defaultSize]="ws.rows()[col][1]"
                [minSize]="16"
              >
                <div
                  class="h-full"
                  [attr.data-ws-slot]="col * 2 + 1"
                  [class.slot-target]="dropSlot() === col * 2 + 1"
                >
                  <ng-container
                    *ngTemplateOutlet="
                      panelTpl;
                      context: {
                        $implicit: ws.order()[col * 2 + 1],
                        slot: col * 2 + 1,
                      }
                    "
                  />
                </div>
              </div>
            </div>
          </div>
          @if (col < 2) {
            <div
              brnResizeHandle
              class="rz-handle"
              [attr.aria-label]="'Resize column ' + (col + 1)"
            ></div>
          }
        }
      </div>
    }
  `,
})
export class WorkspaceComponent {
  protected readonly ws = inject(WorkspaceStore);

  /** Column indexes. */
  protected readonly columns = [0, 1, 2] as const;

  /** Slot currently under a dragged panel, for the drop highlight. */
  protected readonly dropSlot = signal<number | null>(null);

  /** Mutable copies for the resizable inputs (which want `number[]`). */
  protected readonly cols = computed(() => [...this.ws.cols()]);
  protected readonly rows = computed(() => this.ws.rows().map(r => [...r]));

  protected title(id: PanelId): string {
    return PANEL_TITLES[id];
  }

  /** Highlights the slot under the pointer while dragging. */
  protected onMove(event: CdkDragMove<PanelId>): void {
    this.dropSlot.set(slotAt(event.pointerPosition.x, event.pointerPosition.y));
  }

  /** Swaps the dragged panel with the panel in the slot where it was dropped. */
  protected onEnd(event: CdkDragEnd<PanelId>, dragged: PanelId): void {
    const slot = slotAt(event.dropPoint.x, event.dropPoint.y);
    this.dropSlot.set(null);
    event.source.reset();
    if (slot !== null) {
      const target = this.ws.order()[slot];
      if (target && target !== dragged) {
        this.ws.swap(dragged, target);
      }
    }
  }
}

/**
 * Finds the workspace slot under a screen point.
 *
 * @param x Viewport x.
 * @param y Viewport y.
 * @return Slot index 0..5, or null when the point is outside every slot.
 */
function slotAt(x: number, y: number): number | null {
  const hit = document
    .elementsFromPoint(x, y)
    .find(
      el => el instanceof HTMLElement && el.dataset['wsSlot'] !== undefined
    );
  return hit instanceof HTMLElement ? Number(hit.dataset['wsSlot']) : null;
}
