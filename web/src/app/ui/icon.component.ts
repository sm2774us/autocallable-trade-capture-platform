import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** Builds the path of a circle (SVG `<circle>` cannot be injected via innerHTML). */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

/** Icon set: 24x24 stroke paths (the shapes follow the Lucide style). */
const ICONS = {
  search: [circle(11, 11, 7), 'm20 20-3.5-3.5'],
  sun: [
    circle(12, 12, 4),
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  command: [
    'M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3',
  ],
  keyboard: [
    'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    'M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10',
  ],
  maximize: [
    'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3',
  ],
  minimize: [
    'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
  ],
  grip: ['M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01'],
  x: ['M18 6 6 18M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  alert: [
    'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    'M12 9v4M12 17h.01',
  ],
  info: [circle(12, 12, 10), 'M12 16v-4M12 8h.01'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  up: ['M12 19V5M5 12l7-7 7 7'],
  down: ['M12 5v14M19 12l-7 7-7-7'],
  rotate: [
    'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  ],
  candles: ['M9 4v3M9 17v3M7 7h4v10H7zM17 2v4M17 14v4M15 6h4v8h-4z'],
  area: ['M3 3v18h18', 'm7 14 4-4 3 3 5-6'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9z'],
  layers: ['m12 2 10 5-10 5L2 7z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5'],
  list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
  briefcase: [
    'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
    'M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
  ],
  send: ['m22 2-7 20-4-9-9-4z', 'M22 2 11 13'],
  trend: ['m22 7-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  layout: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M9 3v18M3 12h6',
  ],
} as const;

/** Names accepted by `<app-icon>`. */
export type IconName = keyof typeof ICONS;

/** Inline SVG icon that inherits the current text colour. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 items-center justify-center',
    'aria-hidden': 'true',
  },
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.width]="size()"
      [attr.height]="size()"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class IconComponent {
  /** Icon name. */
  readonly name = input.required<IconName>();

  /** Width and height in pixels. */
  readonly size = input(14);

  /** Path data of the current icon. */
  protected readonly paths = computed<readonly string[]>(
    () => ICONS[this.name()]
  );
}
