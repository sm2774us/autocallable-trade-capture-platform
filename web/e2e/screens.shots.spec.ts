import {test} from '@playwright/test';

import {openApp, reset} from './helpers';

const OUT = '../docs/screenshots';

test.describe('screenshots for the documentation', () => {
  test.beforeEach(async ({request}) => {
    await reset(request, 28);
    await request.post('/__control/live', {data: {on: true, intervalMs: 120}});
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`workspace ${theme}`, async ({page}) => {
      await openApp(page, theme);
      await page.waitForTimeout(8000);
      await page.screenshot({path: `${OUT}/workspace-${theme}.png`});
    });
  }

  test('palette', async ({page}) => {
    await openApp(page);
    await page.waitForTimeout(3000);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('nv');
    await page.waitForTimeout(400);
    await page.screenshot({path: `${OUT}/palette.png`});
  });

  test('shortcut help', async ({page}) => {
    await openApp(page);
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(300);
    await page.screenshot({path: `${OUT}/help.png`});
  });

  test('confirmation of a risky ticket', async ({page}) => {
    await openApp(page);
    await page.waitForTimeout(3000);
    await page.getByLabel('Underlying').fill('NVDA');
    await page.getByRole('spinbutton', {name: 'Notional'}).fill('30000000');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(300);
    await page.screenshot({path: `${OUT}/ticket-confirm.png`});
  });

  test('invalid barrier ladder', async ({page}) => {
    await openApp(page);
    await page.waitForTimeout(3000);
    await page.getByLabel('KI barrier').fill('80');
    await page.waitForTimeout(300);
    await page.screenshot({path: `${OUT}/ticket-invalid.png`});
  });

  test('maximised chart', async ({page}) => {
    await openApp(page);
    await page.waitForTimeout(6000);
    await page.getByRole('button', {name: /Maximise Chart/i}).click();
    await page.waitForTimeout(500);
    await page.screenshot({path: `${OUT}/chart-maximised.png`});
  });
});

test('5,000 symbols, virtualised', async ({page, request}) => {
  await request.post('/__control/reset', {data: {symbols: 5000}});
  await request.post('/__control/live', {data: {on: true, intervalMs: 60}});
  await openApp(page);
  await page.waitForTimeout(5000);
  await page.screenshot({path: `${OUT}/workspace-5000.png`});
});
