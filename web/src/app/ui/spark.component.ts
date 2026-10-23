import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** Width and height of the sparkline box. */
const W = 64;
const H = 16;

/**
 * Inline-SVG sparkline: no chart library, one polyline, scaled to its own
 * min/max so even a one-cent move is visible.
 */
@Component({
  selector: 'app-spark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'inline-flex'},
  template: `
    <svg
      [attr.width]="w"
      [attr.height]="h"
      [attr.viewBox]="'0 0 ' + w + ' ' + h"
      aria-hidden="true"
    >
      <polyline
        [attr.points]="points()"
        fill="none"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
        [attr.stroke]="up() ? 'var(--up)' : 'var(--down)'"
      />
    </svg>
  `,
})
export class SparkComponent {
  /** Prices, oldest first. */
  readonly values = input.required<readonly number[]>();

  /** Colours the line green when true, red when false. */
  readonly up = input(true);

  protected readonly w = W;
  protected readonly h = H;

  /** SVG `points` attribute. */
  protected readonly points = computed(() => {
    const values = this.values();
    if (values.length < 2) {
      return `0,${H / 2} ${W},${H / 2}`;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const span = max - min || 1;
    const step = W / (values.length - 1);
    return values
      .map(
        (v, i) =>
          `${(i * step).toFixed(1)},${(H - 1 - ((v - min) / span) * (H - 2)).toFixed(1)}`
      )
      .join(' ');
  });
}
