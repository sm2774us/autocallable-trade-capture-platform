import {ChangeDetectionStrategy, Component} from '@angular/core';

/** A keycap, for showing shortcuts next to buttons and menu items. */
@Component({
  selector: 'app-kbd',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'inline-flex h-4 min-w-4 items-center justify-center rounded border border-line bg-raised px-1 font-mono text-[10px] leading-none text-muted',
  },
  template: `<ng-content />`,
})
export class KbdComponent {}
