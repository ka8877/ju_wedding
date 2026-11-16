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
  const doors = entrance.locator('.invite-opening-door');
  const before = await doors.evaluateAll(elements => elements.map(element => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { width: matrix.m11, rotation: matrix.m13 };
  }));
  expect(before).toEqual([{ width: 1, rotation: 0 }, { width: 1, rotation: 0 }]);
  await entrance.getByRole('button', { name: '초대장 열기', exact: true }).click();
  await expect(entrance).toHaveAttribute('data-opening-state', 'opening');
  await expect(entrance.getByRole('button', { name: '건너뛰기', exact: true })).toBeEnabled();
  // Read actual compositor transforms: a timer/state flag alone does not prove
  // that the door effect is visible, especially under global motion overrides.
  await expect.poll(() => doors.first().evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m11)).toBeLessThan(.94);
  const halfway = await doors.evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrix(style.transform);
    return { width: matrix.m11, rotation: matrix.m13, opacity: Number(style.opacity) };
  }));
  expect(halfway[0].width).toBeGreaterThan(.1);
  expect(halfway[0].rotation).toBeGreaterThan(0);
  expect(halfway[1].rotation).toBeLessThan(0);
  expect(halfway.every(door => door.opacity > .9)).toBe(true);
  await expect(entrance).toBeVisible();
  await expect.poll(() => doors.first().evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m11)).toBeLessThan(halfway[0].width - .15);
  await expect(entrance).toBeVisible();
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
  await expect(entrance).toContainText('기기의 움직임 줄이기 설정에 따라');
  await expect(entrance.getByRole('button', { name: '문 열림 효과 보기', exact: true })).toBeVisible();
  await entrance.getByRole('button', { name: '초대장 열기', exact: true }).click();
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('a reduced-motion visitor can explicitly preview the real door effect once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toHaveAttribute('data-motion', 'reduced');
  await entrance.getByRole('button', { name: '문 열림 효과 보기', exact: true }).click();
  await expect(entrance).toHaveAttribute('data-motion', 'full');
  const door = entrance.locator('.invite-opening-door').first();
  await expect.poll(() => door.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m11)).toBeLessThan(.9);
  await expect(entrance).toBeVisible();
  expect(await door.evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.9);
  await expect(entrance).toHaveCount(0);
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

test('the editor can replay the door effect repeatedly without changing guest session history', async ({ page }) => {
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '추가 기능', exact: true }).click();
  const preview = page.getByRole('button', { name: '문 열림 효과 미리보기', exact: true });
  const entrance = page.locator('.invite-opening');
  await preview.click();
  await expect(entrance).toHaveAttribute('data-opening-preview', 'true');
  await expect(entrance).toContainText('입장 효과 미리보기');
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0);
  await expect(preview).toBeFocused();
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();

  await page.evaluate(key => sessionStorage.setItem(key, 'opened'), openingKey);
  await page.getByRole('checkbox', { name: '첫 방문에 문 열림 효과 사용', exact: true }).uncheck();
  await preview.click();
  await expect(entrance).toBeVisible();
  await entrance.getByRole('button', { name: '초대장 열기', exact: true }).click();
  await expect.poll(() => entrance.locator('.invite-opening-door').first().evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m11)).toBeLessThan(.9);
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveCount(0);
  await expect(preview).toBeFocused();
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});
