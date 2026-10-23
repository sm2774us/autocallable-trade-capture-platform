import {defineConfig} from '@playwright/test';

import base from './playwright.config';

/** Screenshot run: same mock, only the screenshot spec, larger viewport. */
export default defineConfig({
  ...base,
  testMatch: '**/*.shots.spec.ts',
  use: {...base.use, viewport: {width: 1680, height: 960}},
});
