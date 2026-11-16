import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * These suites exercise the invitation after arrival. Dismiss the real welcome
 * screen through its skip action, including when a fixture changes the names or
 * wedding date. The opening suite deliberately uses Playwright's base test so
 * it can verify the complete arrival flow itself.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(page.getByRole('button', { name: '건너뛰기', exact: true }), async skip => {
      await skip.click();
    });
    await use(page);
  },
});
