import {Directive, ElementRef, effect, inject, input} from '@angular/core';

/**
 * Flashes the element green when the value rises and red when it falls, using
 * the Web Animations API (compositor-friendly, no class toggling, no timers).
 *
 * `appFlashKey` identifies what the cell currently shows. When virtual scrolling
 * recycles the element for another symbol the key changes and no flash fires.
 */
@Directive({selector: '[appFlash]'})
export class FlashDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private last: {key: unknown; value: number} | null = null;

  /** The number being displayed. */
  readonly value = input.required<number>({alias: 'appFlash'});

  /** Identity of the row; changes reset the baseline silently. */
  readonly key = input<unknown>(null, {alias: 'appFlashKey'});

  constructor() {
    effect(() => {
      const value = this.value();
      const key = this.key();
      const last = this.last;
      this.last = {key, value};
      if (!last || last.key !== key || last.value === value) {
        return;
      }
      const colour =
        value > last.value ? 'var(--flash-up)' : 'var(--flash-down)';
      this.el.nativeElement.animate?.(
        [{backgroundColor: colour}, {backgroundColor: 'transparent'}],
        {duration: 650, easing: 'ease-out'}
      );
    });
  }
}
