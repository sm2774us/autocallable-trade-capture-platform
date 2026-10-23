import {ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts, so a later `px-2` beats an
 * earlier `px-4`. The same helper shadcn/ui and spartan/ui ship.
 *
 * @param inputs Class names, arrays or conditional objects.
 * @return One merged class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
