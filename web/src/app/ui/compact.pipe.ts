import {Pipe, PipeTransform} from '@angular/core';

import {compact} from '../core/money';

/** Pure pipe: 1_250_000 becomes "1.25M". */
@Pipe({name: 'compact'})
export class CompactPipe implements PipeTransform {
  /**
   * Formats a number with a K, M or B suffix.
   *
   * @param value The amount; null, undefined and NaN render as an em dash.
   * @return The compact text.
   */
  transform(value: number | null | undefined): string {
    return compact(value);
  }
}
