import {TestBed} from '@angular/core/testing';

import {ToastStore} from './toast.store';

describe('ToastStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses success after 4 s and errors after 8 s', () => {
    const s = TestBed.inject(ToastStore);
    s.push('success', 'ok');
    s.push('error', 'bad');
    expect(s.toasts()).toHaveLength(2);
    vi.advanceTimersByTime(4001);
    expect(s.toasts().map(t => t.title)).toEqual(['bad']);
    vi.advanceTimersByTime(4000);
    expect(s.toasts()).toHaveLength(0);
  });

  it('keeps at most four and dismisses by id', () => {
    const s = TestBed.inject(ToastStore);
    const ids = [1, 2, 3, 4, 5].map(i => s.push('info', 't' + i));
    expect(s.toasts()).toHaveLength(4);
    s.dismiss(ids[4]);
    expect(s.toasts().map(t => t.title)).toEqual(['t2', 't3', 't4']);
  });
});
