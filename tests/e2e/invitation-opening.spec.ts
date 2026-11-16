import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';
import type { WeddingData } from '../../src/lib/types';

const openingKey = `wedding-opening:v1:${defaultWedding.groom.name}:${defaultWedding.bride.name}:${defaultWedding.date}`;

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html', body: '<p>지도 테스트</p>' }));
});

async function publishFixture(page: Page, data: WeddingData) {
  await page.goto('/');
  await page.evaluate(async wedding => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jo-and-joo', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('wedding');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('wedding', 'readwrite');
      tx.objectStore('wedding').put({ data: wedding, updatedAt: '2026-11-16T00:00:00Z' }, 'published');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
}

test('the first visit opens an illustrated entrance and doors reveal the invitation only once per session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-opening-state', 'ready');
  await expect(entrance.getByRole('heading')).toContainText(defaultWedding.groom.name);
  await expect(entrance.getByRole('heading')).toContainText(defaultWedding.bride.name);
  await expect(entrance.getByRole('button', { name: '초대장 열기', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await entrance.getByRole('button', { name: '초대장 열기', exact: true }).click();
  await expect(entrance).toHaveAttribute('data-opening-state', 'opening');
  await expect(entrance.getByRole('button', { name: '건너뛰기', exact: true })).toBeEnabled();
  await expect(entrance).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
  await page.reload();
  await expect(page.locator('#wedding-title')).toBeVisible();
  await expect(entrance).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('keyboard skip dismisses immediately, restores scrolling, and leaves the invitation accessible', async ({ page }) => {
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(entrance.getByRole('button', { name: '건너뛰기', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(entrance).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
  await page.locator('.invite-scroll').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
});

test('Escape is always available during the entrance animation', async ({ page }) => {
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await entrance.getByRole('button', { name: '초대장 열기', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
});

test('reduced-motion visitors can enter without waiting for the door animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await entrance.getByRole('button', { name: '초대장 열기', exact: true }).click();
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('direct section links and disabled entrances bypass the doors', async ({ page }) => {
  await page.goto('/#location');
  await expect(page.locator('#wedding-title')).toBeVisible();
  await expect(page.locator('.invite-opening')).toHaveCount(0);
  const data = structuredClone(defaultWedding);
  data.guestFeatures.opening.enabled = false;
  await publishFixture(page, data);
  await expect(page.locator('#wedding-title')).toBeVisible();
  await expect(page.locator('.invite-opening')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('the editor preview never blocks editing behind an entrance dialog', async ({ page }) => {
  await page.goto('/#/admin');
  await expect(page.locator('.admin-app')).toBeVisible();
  await expect(page.locator('.invite-opening')).toHaveCount(0);
});
