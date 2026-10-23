import {APIRequestContext, Page} from '@playwright/test';

/** Resets the mock to a known, quiet state (live generator off). */
export async function reset(
  request: APIRequestContext,
  symbols = 8
): Promise<void> {
  await request.post('/__control/reset', {data: {symbols}});
  await request.post('/__control/live', {data: {on: false}});
  await request.post('/__control/heartbeats', {data: {on: true}});
}

/** Mock counters. */
export async function stats(request: APIRequestContext): Promise<{
  connections: {quotes: number; trades: number};
  resyncRequests: {quotes: number; trades: number};
  bookings: Array<{terms: Record<string, unknown>; correlationId: string}>;
  quoteSeq: number;
  tradeSeq: number;
}> {
  return (await request.get('/__control/stats')).json();
}

/** Opens the app with a clean layout and waits until the quote grid has rows. */
export async function openApp(
  page: Page,
  theme: 'dark' | 'light' = 'dark'
): Promise<void> {
  await page.addInitScript(t => {
    try {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(
          'trade-capture.layout.v1',
          JSON.stringify({v: 1, theme: t})
        );
        sessionStorage.setItem('seeded', '1');
      }
    } catch {
      /* storage unavailable */
    }
  }, theme);
  await page.goto('/');
  await page.getByTestId('quote-row').first().waitFor();
}

/** Symbols of the rendered quote rows, in order. */
export async function symbolsInGrid(page: Page): Promise<string[]> {
  return page
    .getByTestId('quote-row')
    .evaluateAll(rows =>
      rows.map(r =>
        (
          r.querySelector('[role="gridcell"], span') as HTMLElement
        ).innerText.trim()
      )
    );
}
