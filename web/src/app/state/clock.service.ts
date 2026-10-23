import {DestroyRef, Injectable, inject, signal} from '@angular/core';

import {NOW} from '../feed/feed.client';

/** A ticking wall clock as a signal, for the top bar. */
@Injectable({providedIn: 'root'})
export class ClockService {
  private readonly now = inject(NOW);
  private readonly value = signal(this.now());

  /** Current time in epoch milliseconds, refreshed four times a second. */
  readonly ms = this.value.asReadonly();

  constructor() {
    const timer = setInterval(() => {
      this.value.set(this.now());
    }, 250);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }
}
