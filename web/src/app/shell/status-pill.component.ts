import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import {FeedStatus} from '../core/models';

/** Coloured dot plus label for one feed's health. */
@Component({
  selector: 'app-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'inline-flex items-center gap-1.5'},
  template: `
    <span
      class="inline-block size-1.5 rounded-full"
      [class]="dotClass()"
      [class.anim-pulse]="status() === 'live' || status() === 'connecting'"
    ></span>
    <span
      class="text-[10px] font-semibold uppercase tracking-wider text-muted"
      >{{ label() }}</span
    >
    <span
      class="text-[10px] font-semibold uppercase tracking-wider"
      [class]="textClass()"
      [attr.data-status]="status()"
    >
      {{ status() }}
    </span>
  `,
})
export class StatusPillComponent {
  /** Feed name, for example "Quotes". */
  readonly label = input.required<string>();

  /** Health. */
  readonly status = input.required<FeedStatus>();

  protected readonly dotClass = computed(() => TONE[this.status()].dot);
  protected readonly textClass = computed(() => TONE[this.status()].text);
}

const TONE: Record<FeedStatus, {dot: string; text: string}> = {
  live: {dot: 'bg-up', text: 'text-up'},
  resync: {dot: 'bg-warn', text: 'text-warn'},
  stale: {dot: 'bg-down', text: 'text-down'},
  connecting: {dot: 'bg-faint', text: 'text-faint'},
};
