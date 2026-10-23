import {expect, test} from '@playwright/test';

import {openApp, reset, stats} from './helpers';

test.describe('trade capture terminal', () => {
  test.beforeEach(async ({request}) => {
    await reset(request);
  });

  test('renders every panel with live data', async ({page}) => {
    await openApp(page);
    for (const id of [
      'top-bar',
      'workspace',
      'status-bar',
      'ticket-form',
      'chart-host',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('quote-row')).toHaveCount(8);
    await expect(page.getByTestId('tape-row').first()).toBeVisible();
    await expect(page.getByTestId('quote-seq')).toContainText('seq');
  });

  test('a pushed trade moves the tape and the quote board', async ({
    page,
    request,
  }) => {
    await openApp(page);
    const before = await page.getByTestId('tape-row').count();
    await request.post('/__control/trade', {
      data: {sym: 'AAPL', side: 'BUY', qty: 777, px: 188.5},
    });
    await expect(page.getByTestId('tape-row').first()).toContainText('777');
    expect(await page.getByTestId('tape-row').count()).toBeGreaterThanOrEqual(
      before
    );
    await expect(
      page.getByTestId('quote-row').filter({hasText: 'AAPL'})
    ).toContainText('188.50');
  });

  test('a sequence gap triggers exactly one resync, then recovers', async ({
    page,
    request,
  }) => {
    await openApp(page);
    const base = (await stats(request)).resyncRequests.quotes;
    await request.post('/__control/gap', {
      data: {sym: 'AAPL', px: 199.99, feed: 'quotes'},
    });
    await expect
      .poll(async () => (await stats(request)).resyncRequests.quotes)
      .toBe(base + 1);
    await expect(
      page.getByTestId('quote-row').filter({hasText: 'AAPL'})
    ).toContainText('199.99');
  });

  test('reconnects after the server drops and after a clean close (F-11)', async ({
    page,
    request,
  }) => {
    await openApp(page);
    await request.post('/__control/drop');
    await request.post('/__control/trade', {
      data: {sym: 'MSFT', qty: 31, px: 420.1},
    });
    await expect(page.getByTestId('tape-row').first()).toContainText('31', {
      timeout: 20_000,
    });
    await request.post('/__control/close');
    await request.post('/__control/trade', {
      data: {sym: 'MSFT', qty: 32, px: 420.2},
    });
    await expect(page.getByTestId('tape-row').first()).toContainText('32', {
      timeout: 20_000,
    });
  });

  test('goes stale without heartbeats and recovers', async ({
    page,
    request,
  }) => {
    await openApp(page);
    await request.post('/__control/heartbeats', {data: {on: false}});
    await expect(page.locator('[data-status="stale"]').first()).toBeVisible({
      timeout: 12_000,
    });
    await request.post('/__control/heartbeats', {data: {on: true}});
    await expect(page.locator('[data-status="live"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('command palette filters and jumps to a symbol', async ({page}) => {
    await openApp(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('palette')).toBeVisible();
    await page.keyboard.type('nvda');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const id = document
            .querySelector('input[brncommandinput]')
            ?.getAttribute('aria-activedescendant');
          return id ? document.getElementById(id)?.textContent?.trim() : '';
        })
      )
      .toContain('Go to NVDA');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('palette')).toBeHidden();
    await expect(
      page.getByTestId('quote-row').filter({hasText: 'NVDA'})
    ).toHaveClass(/selected/);
  });

  test('theme toggle persists across reload', async ({page}) => {
    await openApp(page, 'dark');
    await page.getByTestId('theme-button').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('maximise a panel and restore with Escape', async ({page}) => {
    await openApp(page);
    await page
      .getByRole('button', {name: /Maximise/})
      .first()
      .click();
    await expect(page.getByTestId('maximized')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('maximized')).toBeHidden();
  });

  test('ticket: invalid blocks, valid books once with a correlation id', async ({
    page,
    request,
  }) => {
    await openApp(page);
    const book = page.getByTestId('book-button');
    await page.getByLabel('Underlying').fill('');
    await expect(book).toBeDisabled();
    await page.getByLabel('Underlying').fill('AAPL');
    await expect(book).toBeEnabled();
    await book.click();
    if (
      (await page.getByTestId('ticket-state').getAttribute('data-state')) ===
      'confirming'
    ) {
      await book.click();
    }
    await expect(page.getByTestId('ticket-booked')).toContainText('N');
    const s = await stats(request);
    expect(s.bookings).toHaveLength(1);
    expect(s.bookings[0].correlationId).toMatch(/^ui-/);
    await expect(page.getByTestId('note-row').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('ticket: server rejects an inconsistent barrier ladder', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByLabel('Underlying').fill('AAPL');
    await page.getByLabel('KI barrier').fill('80');
    await expect(page.getByTestId('book-button')).toBeDisabled();
    await expect(page.getByTestId('checks')).toContainText(/barrier/i);
  });

  test('ticket: size hotkeys step the notional', async ({page}) => {
    await openApp(page);
    const n = page.getByRole('spinbutton', {name: 'Notional'});
    await n.focus();
    const start = Number(await n.inputValue());
    await page.keyboard.press('ArrowUp');
    expect(Number(await n.inputValue())).toBe(start + 100_000);
    await page.keyboard.press('Shift+ArrowUp');
    expect(Number(await n.inputValue())).toBe(2_000_000);
    await page.keyboard.press('Alt+ArrowUp');
    expect(Number(await n.inputValue())).toBe(10_000_000);
  });

  test('drag a panel header onto another swaps them and the layout persists', async ({
    page,
  }) => {
    await openApp(page);
    const order = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('trade-capture.layout.v1') ?? '{}')
            .order
      );
    const before = await order();
    const from = page.locator('[data-ws-panel="quotes"] header');
    const to = page.locator('[data-ws-panel="ticket"] header');
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    await page.mouse.move(a.x + 60, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 80, a.y + a.height / 2 + 10, {steps: 4});
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 30, {
      steps: 12,
    });
    await page.mouse.up();
    await expect.poll(order).not.toEqual(before);
    await page.reload();
    await page.getByTestId('quote-row').first().waitFor();
    expect(await order()).not.toEqual(before);
  });

  test('5,000 symbols stay virtualised', async ({page, request}) => {
    await request.post('/__control/reset', {data: {symbols: 5000}});
    await openApp(page);
    await expect(page.getByTestId('quote-count')).toContainText('5');
    const rendered = await page.getByTestId('quote-row').count();
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(200);
  });
});
