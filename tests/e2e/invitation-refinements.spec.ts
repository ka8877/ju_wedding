import { expect, test } from './helpers';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';
import type { WeddingData } from '../../src/lib/types';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4+vrOfwAJUQO8AaEsBQAAAABJRU5ErkJggg==';

async function publishFixture(page: Page, data: WeddingData) {
  await page.goto('/');
  await page.evaluate(async wedding => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jo-and-joo', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('wedding');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('wedding', 'readwrite');
      tx.objectStore('wedding').put({ data: wedding, updatedAt: '2026-11-17T00:00:00Z' }, 'published');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
}

test('the letter invitation presents saved wedding details before its artwork on small phones', async ({ page }) => {
  const data = structuredClone(defaultWedding);
  data.theme = 'peach';
  data.design.template = 'letter';
  data.design.font = 'sans';
  data.design.heroTitle = '함께 쓰는\n우리의 다음 장';
  data.design.heroSubtitle = '소중한 분들과 함께할 우리의 시작';
  data.design.coverStyle = 'auto';
  data.invitation = '각자의 계절을 지나\n이제 같은 길을 걸으려 합니다.\n\n저희가 직접 쓴 이 초대의 말을\n오래 간직해 주세요.';
  data.closing = '오늘도 내일도, 소중한 마음을 기억하겠습니다.';
  data.coverPhoto = image;
  data.photos = [{ id: 'saved-moment', alt: '우리가 고른 소중한 순간', url: image }];
  data.guestFeatures.music.trackId = 'sunny-walk';

  await page.setViewportSize({ width: 390, height: 844 });
  await publishFixture(page, data);
  await expect(page.locator('.invitation')).toHaveAttribute('data-template', 'letter');
  await expect(page.locator('.invitation')).toHaveAttribute('data-theme', 'peach');
  await expect(page.locator('.invitation')).toHaveAttribute('data-font', 'sans');
  await expect(page.locator('#wedding-title .invite-title-line')).toHaveText(['함께 쓰는', '우리의 다음 장']);
  await expect(page.locator('.invite-hero-date')).toHaveText('2027년 2월 20일 토요일 오후 12:30');
  await expect(page.locator('.invite-hero-venue')).toHaveText(`${data.venue.name} ${data.venue.hall}`);
  await expect(page.locator('.invite-korean-names')).toContainText(data.groom.name);
  await expect(page.locator('.invite-korean-names')).toContainText(data.bride.name);
  await expect(page.locator('.invite-cover-image')).toHaveAttribute('src', image);
  await page.evaluate(async () => { await document.fonts.ready; });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    // A guest can read when and where without first scrolling past a portrait.
    await expect(page.locator('.invite-hero-date')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.invite-hero-venue')).toBeInViewport({ ratio: 1 });
    const title = await page.locator('#wedding-title').boundingBox();
    const date = await page.locator('.invite-hero-date').boundingBox();
    const venue = await page.locator('.invite-hero-venue').boundingBox();
    const artwork = await page.locator('.invite-cover').boundingBox();
    expect(title!.y + title!.height).toBeLessThanOrEqual(date!.y);
    expect(date!.y + date!.height).toBeLessThanOrEqual(venue!.y);
    expect(venue!.y + venue!.height).toBeLessThanOrEqual(artwork!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('#wedding-title').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }

  const invitation = page.locator('.invite-letter-copy');
  await invitation.scrollIntoViewIfNeeded();
  await expect(invitation).toHaveText(data.invitation);
  await expect(page.locator('.invite-family-row').first()).toContainText(`${data.groom.father} · ${data.groom.mother}`);
  await expect(page.locator('.invite-gallery-item img')).toHaveAttribute('src', image);
  await expect(page.locator('.invite-gallery-item img')).toHaveAttribute('alt', data.photos[0].alt);
  await expect(page.locator('.invite-closing > p')).toHaveText(data.closing);

  // Reading the refined layout must leave the complete saved invitation intact,
  // including settings that are not visible in this particular viewport.
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jo-and-joo', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ data: WeddingData; updatedAt: string }>((resolve, reject) => {
        const request = db.transaction('wedding').objectStore('wedding').get('published');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
  expect(saved.data).toEqual(data);
  expect(saved.updatedAt).toBe('2026-11-17T00:00:00Z');
});
