import {firstValueFrom, take, toArray} from 'rxjs';

import {WsFeedClient, wsUrl} from './ws-feed.client';

class FakeSocket {
  static all: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: {data: string}) => void) | null = null;
  onclose: ((e: {code: number; wasClean: boolean}) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.({code: 1000, wasClean: true});
  }
  push(obj: unknown): void {
    this.onmessage?.({data: JSON.stringify(obj)});
  }
}

describe('wsUrl', () => {
  it('swaps the scheme and keeps the path', () => {
    expect(wsUrl('/ws/quotes', 'http://h:1')).toBe('ws://h:1/ws/quotes');
    expect(wsUrl('/ws/quotes', 'https://h')).toBe('wss://h/ws/quotes');
  });
});

describe('WsFeedClient', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('parses JSON messages and uses the resolved URL', async () => {
    const c = new WsFeedClient<{n: number}>('/ws/x', p => 'ws://t' + p);
    const got = firstValueFrom(c.messages$.pipe(take(2), toArray()));
    await Promise.resolve();
    await Promise.resolve();
    FakeSocket.all[0].push({n: 1});
    FakeSocket.all[0].push({n: 2});
    expect(await got).toEqual([{n: 1}, {n: 2}]);
    expect(FakeSocket.all[0].url).toBe('ws://t/ws/x');
  });

  it('shares one socket among subscribers', async () => {
    const c = new WsFeedClient<{n: number}>('/ws/x', p => 'ws://t' + p);
    const a = firstValueFrom(c.messages$);
    const b = firstValueFrom(c.messages$);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeSocket.all).toHaveLength(1);
    FakeSocket.all[0].push({n: 7});
    expect(await a).toEqual({n: 7});
    expect(await b).toEqual({n: 7});
  });

  it('requestSnapshot sends the resync frame', async () => {
    const c = new WsFeedClient<{n: number}>('/ws/x', p => 'ws://t' + p);
    const got = firstValueFrom(c.messages$);
    await Promise.resolve();
    await Promise.resolve();
    c.requestSnapshot();
    expect(FakeSocket.all[0].sent).toEqual(['{"type":"resync"}']);
    FakeSocket.all[0].push({n: 1});
    await got;
  });

  it('reconnects after a clean close (finding F-11)', async () => {
    vi.useFakeTimers();
    try {
      const c = new WsFeedClient<{n: number}>('/ws/x', p => 'ws://t' + p);
      const seen: number[] = [];
      const sub = c.messages$.subscribe(m => seen.push(m.n));
      await vi.advanceTimersByTimeAsync(0);
      FakeSocket.all[0].push({n: 1});
      FakeSocket.all[0].close();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(FakeSocket.all.length).toBeGreaterThanOrEqual(2);
      FakeSocket.all[FakeSocket.all.length - 1].push({n: 2});
      expect(seen).toEqual([1, 2]);
      sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });
});
