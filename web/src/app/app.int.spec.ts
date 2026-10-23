import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {
  QueryClient,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

import {App} from './app';
import {correlationInterceptor} from './api/notes.api';
import {QuoteMsg, TradeMsg} from './core/models';
import {FEED_CLIENT, FLUSH_MS, TRADE_FEED_CLIENT} from './feed/feed.client';
import {CHART_FACTORY, ChartHandle} from './panels/chart.adapter';
import {LAYOUT_STORAGE} from './state/workspace.store';
import {
  FakeFeed,
  qDelta,
  qSnap,
  quote,
  tDelta,
  tSnap,
  trade,
} from './testing/fakes';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('App (integration, fake feeds + fake chart)', () => {
  let fixture: ComponentFixture<App>;
  let el: HTMLElement;
  let quotes: FakeFeed<QuoteMsg>;
  let trades: FakeFeed<TradeMsg>;
  let http: HttpTestingController;
  let chartCalls: string[];

  const settle = async (): Promise<void> => {
    await sleep(15);
    fixture.detectChanges();
    await sleep(5);
    fixture.detectChanges();
  };
  const q = (id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const qa = (id: string) =>
    Array.from(el.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];

  beforeEach(async () => {
    quotes = new FakeFeed<QuoteMsg>();
    trades = new FakeFeed<TradeMsg>();
    chartCalls = [];
    const fakeChart: ChartHandle = {
      setData: () => chartCalls.push('data'),
      applyTheme: () => chartCalls.push('theme'),
      follow: () => chartCalls.push('follow'),
      destroy: () => chartCalls.push('destroy'),
    };
    const store = new Map<string, string>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([correlationInterceptor])),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({defaultOptions: {queries: {retry: false}}})
        ),
        {provide: FEED_CLIENT, useValue: quotes},
        {provide: TRADE_FEED_CLIENT, useValue: trades},
        {provide: FLUSH_MS, useValue: 1},
        {provide: CHART_FACTORY, useValue: () => fakeChart},
        {
          provide: LAYOUT_STORAGE,
          useValue: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(App);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('renders the shell and its panels', () => {
    for (const id of ['top-bar', 'workspace', 'status-bar', 'ticket-form']) {
      expect(q(id), id).not.toBeNull();
    }
  });

  it('shows quote and trade snapshots, then deltas', async () => {
    quotes.push(qSnap(1, quote('AAPL', 190.1, 1), quote('MSFT', 410.5, 1)));
    trades.push(
      tSnap(2, trade(2, 'MSFT', 'SELL', 50), trade(1, 'AAPL', 'BUY', 100))
    );
    await settle();
    expect(q('quote-seq')?.textContent).toContain('1');
    expect(q('trade-seq')?.textContent).toContain('2');
    expect(q('pnl-total')).not.toBeNull();

    quotes.push(qDelta(2, quote('AAPL', 191.2, 2)));
    trades.push(tDelta(3, trade(3, 'AAPL', 'SELL', 40)));
    await settle();
    expect(q('quote-seq')?.textContent).toContain('2');
    expect(q('trade-seq')?.textContent).toContain('3');
  });

  it('requests exactly one snapshot after a sequence gap', async () => {
    quotes.push(qSnap(1, quote('AAPL', 190, 1)));
    await settle();
    quotes.push(qDelta(5, quote('AAPL', 191, 5)));
    quotes.push(qDelta(6, quote('AAPL', 192, 6)));
    await settle();
    expect(quotes.snapshotRequests).toBe(1);
    quotes.push(qSnap(7, quote('AAPL', 193, 7)));
    await settle();
    expect(q('quote-seq')?.textContent).toContain('7');
  });

  it('opens the command palette with Ctrl+K and closes it with Escape', async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'k', ctrlKey: true, bubbles: true})
    );
    await settle();
    expect(q('palette')).not.toBeNull();
    document.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})
    );
    await settle();
    expect(q('palette')).toBeNull();
  });

  it('opens shortcut help with ?', async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {key: '?', shiftKey: true, bubbles: true})
    );
    await settle();
    expect(q('help')).not.toBeNull();
  });

  it('toggles the theme', async () => {
    const before = document.documentElement.dataset['theme'];
    q('theme-button')?.click();
    await settle();
    expect(document.documentElement.dataset['theme']).not.toBe(before);
  });

  it('blocks booking when the form is invalid', async () => {
    const book = q('book-button') as HTMLButtonElement;
    expect(book.disabled).toBe(true);
    expect(q('checks')?.textContent?.length).toBeGreaterThan(0);
  });

  it('books a valid note once, shows the id, and refuses a double submit', async () => {
    quotes.push(qSnap(1, quote('AAPL', 190, 1)));
    await settle();
    const form = q('ticket-form') as HTMLFormElement;
    const set = (label: string, v: string) => {
      const i = form.querySelector(
        `[aria-label="${label}"], [formcontrolname="${label}"]`
      ) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input', {bubbles: true}));
    };
    set('underlying', 'AAPL');
    await settle();
    const book = q('book-button') as HTMLButtonElement;
    expect(book.disabled).toBe(false);
    book.click();
    await settle();
    if (q('ticket-state')?.dataset['state'] === 'confirming') {
      book.click(); // warnings need a second, deliberate press
    }
    book.click(); // a double submit must be impossible
    await settle();
    const posts = http.match(
      r => r.method === 'POST' && r.url === '/api/notes'
    );
    expect(posts).toHaveLength(1);
    posts[0].flush({id: 'N-1'});
    await settle();
    expect(q('ticket-booked')?.textContent).toContain('N-1');
    expect(q('ticket-state')?.dataset['state']).toBe('booked');
  });

  it('shows the server rejection', async () => {
    const form = q('ticket-form') as HTMLFormElement;
    const i = form.querySelector(
      '[formcontrolname="underlying"]'
    ) as HTMLInputElement;
    i.value = 'AAPL';
    i.dispatchEvent(new Event('input', {bubbles: true}));
    await settle();
    const book = q('book-button') as HTMLButtonElement;
    book.click();
    await settle();
    if (q('ticket-state')?.dataset['state'] === 'confirming') {
      book.click();
      await settle();
    }
    const post = http.match(r => r.method === 'POST')[0];
    expect(post).toBeDefined();
    post.flush(
      {errors: [{field: 'autocallBarrier', message: 'too low'}]},
      {status: 422, statusText: 'Unprocessable'}
    );
    await settle();
    expect(q('ticket-rejected')).not.toBeNull();
    expect(q('toast')).not.toBeNull();
  });
});
