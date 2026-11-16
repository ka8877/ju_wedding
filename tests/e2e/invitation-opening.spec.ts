import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';
import type { WeddingData } from '../../src/lib/types';

const openingKey = `wedding-opening:v4:${defaultWedding.groom.name}:${defaultWedding.bride.name}:${defaultWedding.date}`;

interface OpeningSample {
  time: number;
  motion: string | null;
  phase: string | null;
  copyOpacity: number;
  doors: { width: number; rotation: number; x: number; opacity: number }[];
  buttons: string[];
  text: string;
}
interface OpeningEvidence { samples: OpeningSample[]; finishedAt: number; }
type EvidenceWindow = Window & { weddingOpeningEvidence?: OpeningEvidence };

async function observeOpening(page: Page) {
  await page.addInitScript(() => {
    const evidence: OpeningEvidence = { samples: [], finishedAt: 0 };
    (window as EvidenceWindow).weddingOpeningEvidence = evidence;
    let seen = false;
    const sample = () => {
      const entrance = document.querySelector('.invite-opening[open]');
      if (entrance) {
        seen = true;
        evidence.samples.push({
          time: performance.now(), motion: entrance.getAttribute('data-motion'), phase: entrance.getAttribute('data-opening-state'),
          copyOpacity: Number(getComputedStyle(entrance.querySelector('.invite-opening-copy')!).opacity),
          doors: [...entrance.querySelectorAll('.invite-opening-door')].map(door => {
            const style = getComputedStyle(door), matrix = new DOMMatrix(style.transform);
            return { width: matrix.m11, rotation: matrix.m13, x: matrix.m41, opacity: Number(style.opacity) };
          }),
          buttons: [...entrance.querySelectorAll('button')].map(button => button.textContent || ''), text: entrance.textContent || '',
        });
      }
      if (!seen || entrance) requestAnimationFrame(sample);
      else evidence.finishedAt = performance.now();
    };
    requestAnimationFrame(sample);
  });
}

function expectReadableHold(samples: OpeningSample[]) {
  const held = samples.filter(sample => sample.phase === 'holding');
  expect(held.length).toBeGreaterThan(1);
  expect(held.at(-1)!.time - held[0].time).toBeGreaterThan(1200);
  expect(held.every(sample => sample.copyOpacity === 1 && sample.doors.every(door => door.width === 1 && door.rotation === 0 && door.x === 0 && door.opacity === 1))).toBe(true);
}

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

test('the first visit automatically opens real animated doors with only a skip action, once per session', async ({ page }) => {
  await observeOpening(page);
  await page.addInitScript(key => {
    for (const version of ['v1', 'v2', 'v3']) sessionStorage.setItem(key.replace('wedding-opening:v4:', `wedding-opening:${version}:`), 'opened');
  }, openingKey);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await expect(entrance.getByRole('heading')).toContainText(defaultWedding.groom.name);
  await expect(entrance.getByRole('heading')).toContainText(defaultWedding.bride.name);
  await expect(entrance.getByRole('button')).toHaveCount(1);
  await expect(entrance.getByRole('button', { name: '건너뛰기', exact: true })).toBeFocused();
  await expect(entrance).not.toContainText('기기의 움직임');
  await expect(entrance).not.toContainText('문 열림 효과 보기');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  const doors = entrance.locator('.invite-opening-door');
  await expect(entrance).toHaveAttribute('data-opening-state', 'holding');
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
  expect(await entrance.evaluate(element => getComputedStyle(element, '::backdrop').backgroundColor)).toMatch(/rgba\(.*,[\s]*0\)$/);
  await expect(entrance).toBeVisible();
  await expect.poll(() => doors.first().evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m11)).toBeLessThan(halfway[0].width - .15);
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveCount(0, { timeout: 7000 });
  const evidence = await page.evaluate(() => (window as EvidenceWindow).weddingOpeningEvidence!);
  expectReadableHold(evidence.samples);
  expect(evidence.finishedAt - evidence.samples[0].time).toBeGreaterThan(4900);
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
  await expect(entrance).toHaveAttribute('data-opening-state', 'opening');
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
  await expect(entrance).toHaveAttribute('data-opening-state', 'opening');
  await page.keyboard.press('Escape');
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
});

test('reduced-motion visitors receive a readable automatic entrance with gentle split and fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await observeOpening(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toHaveAttribute('data-opening-state', 'holding');
  await expect(entrance.getByRole('heading')).toBeVisible();
  await expect(page.locator('#wedding-title')).toBeVisible();
  await expect(entrance).toHaveCount(0, { timeout: 5000 });
  const evidence = await page.evaluate(() => (window as EvidenceWindow).weddingOpeningEvidence!);
  const samples = evidence.samples;
  expectReadableHold(samples);
  expect(evidence.finishedAt - samples[0].time).toBeGreaterThan(2800);
  expect(samples.some(sample => sample.phase === 'opening')).toBe(true);
  expect(samples.every(sample => sample.motion === 'reduced' && sample.doors.every(door => door.rotation === 0 && door.width === 1) && sample.buttons.length === 1 && sample.buttons[0] === '건너뛰기')).toBe(true);
  expect(samples.some(sample => sample.doors[0].x < -1 && sample.doors[1].x > 1 && sample.doors.every(door => door.opacity > .1 && door.opacity < .9))).toBe(true);
  expect(samples.every(sample => !sample.text.includes('기기의 움직임') && !sample.text.includes('문 열림 효과 보기') && !sample.text.includes('초대장 열기'))).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
});

test('slow artwork never holds the automatic entrance beyond its bounded start delay', async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/garden-wedding.webp', async route => { await waiting; await route.abort(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  try {
    await expect(entrance).toBeVisible();
    await expect(entrance).toHaveAttribute('data-opening-state', 'holding', { timeout: 1200 });
    await expect(entrance).toHaveAttribute('data-opening-state', 'opening', { timeout: 2400 });
    await expect(entrance.getByRole('button')).toHaveCount(1);
    await expect(entrance).toHaveCount(0, { timeout: 7000 });
  } finally { release(); }
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
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  await expect(preview).toBeFocused();
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();

  await page.evaluate(key => sessionStorage.setItem(key, 'opened'), openingKey);
  await page.getByRole('checkbox', { name: '첫 방문에 문 열림 효과 사용', exact: true }).uncheck();
  await preview.click();
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-opening-state', 'opening');
  await expect.poll(() => entrance.locator('.invite-opening-door').first().evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m11)).toBeLessThan(.9);
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveCount(0, { timeout: 7000 });
  await expect(preview).toBeFocused();
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});
