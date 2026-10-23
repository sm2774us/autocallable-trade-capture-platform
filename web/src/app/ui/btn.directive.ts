import {Directive, computed, input} from '@angular/core';
import {VariantProps, cva} from 'class-variance-authority';

import {cn} from '../core/cn';

/** Button look-and-feel as variants (the shadcn/spartan "hlm" pattern). */
export const btnVariants = cva(
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white hover:brightness-110',
        buy: 'border border-up/40 bg-up/15 text-up hover:bg-up/25',
        sell: 'border border-down/40 bg-down/15 text-down hover:bg-down/25',
        warn: 'border border-warn/50 bg-warn/15 text-warn hover:bg-warn/25',
        outline: 'border border-line bg-surface text-fg hover:bg-raised',
        ghost: 'text-muted hover:bg-raised hover:text-fg',
      },
      size: {
        sm: 'h-6 px-2',
        md: 'h-7 px-3',
        icon: 'size-6',
      },
    },
    defaultVariants: {variant: 'outline', size: 'md'},
  }
);

/** Props accepted by {@link btnVariants}. */
export type BtnVariants = VariantProps<typeof btnVariants>;

/** Styles any `<button hlmBtn>` with the variants above. */
@Directive({
  selector: 'button[hlmBtn], a[hlmBtn]',
  host: {'[class]': 'classes()'},
})
export class HlmBtn {
  /** Colour variant. */
  readonly variant = input<NonNullable<BtnVariants['variant']>>('outline');

  /** Size variant. */
  readonly size = input<NonNullable<BtnVariants['size']>>('md');

  /** Extra classes, merged last so they win conflicts. */
  readonly extra = input('', {alias: 'class'});

  /** Final class string. */
  protected readonly classes = computed(() =>
    cn(btnVariants({variant: this.variant(), size: this.size()}), this.extra())
  );
}
