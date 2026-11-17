import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';
import type { WeddingData } from '../../src/lib/types';

const openingKey = `wedding-opening:v6:${defaultWedding.groom.name}:${defaultWedding.bride.name}:${defaultWedding.date}`;

interface OpeningSample {
  time: number;
  motion: string | null;
  phase: string | null;
  copyOpacity: number;
  filmTime: number;
  filmDuration: number;
  filmPaused: boolean;
  filmReadyState: number;
  filmEnded: boolean;
  buttons: string[];
}
interface OpeningEvidence { samples: OpeningSample[]; finishedAt: number; }
type EvidenceWindow = Window & { weddingOpeningEvidence?: OpeningEvidence };

async function observeOpening(page: Page) {
  await page.addInitScript(() => {
    const evidence: OpeningEvidence = { samples: [], finishedAt: 0 };
    (window as EvidenceWindow).weddingOpeningEvidence = evidence;
    let seen = false;
    const sample = () => {
      const entrance = document.querySelector<HTMLDialogElement>('.invite-opening[open]');
      if (entrance) {
        seen = true;
        const film = entrance.querySelector<HTMLVideoElement>('.invite-opening-film');
        const copy = entrance.querySelector('.invite-opening-copy');
        evidence.samples.push({
          time: performance.now(), motion: entrance.getAttribute('data-motion'), phase: entrance.getAttribute('data-opening-state'),
          copyOpacity: copy ? Number(getComputedStyle(copy).opacity) : 0,
          filmTime: film?.currentTime || 0, filmDuration: Number.isFinite(film?.duration) ? film!.duration : 0,
          filmPaused: film?.paused ?? true, filmReadyState: film?.readyState || 0, filmEnded: film?.ended ?? false,
          buttons: [...entrance.querySelectorAll('button')].map(button => button.textContent || ''),
        });
      }
      if (!seen || entrance) requestAnimationFrame(sample);
      else evidence.finishedAt = performance.now();
    };
    requestAnimationFrame(sample);
  });
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html', body: '<p>지도 테스트</p>' }));
});

async function storePublishedFixture(page: Page, data: WeddingData) {
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
}

async function publishFixture(page: Page, data: WeddingData) {
  await page.goto('/');
  await storePublishedFixture(page, data);
  await page.reload();
}

test('a root visit plays the full garden entrance and a fresh reload plays it again', async ({ page }, testInfo) => {
  await observeOpening(page);
  await page.addInitScript(key => {
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5']) sessionStorage.setItem(key.replace('wedding-opening:v6:', `wedding-opening:${version}:`), 'opened');
  }, openingKey);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  const film = entrance.locator('video.invite-opening-film');
  const copy = entrance.locator('.invite-opening-copy');
  await expect(entrance).toBeVisible();
  await expect(entrance.getByRole('heading')).toContainText(defaultWedding.groom.name);
  await expect(entrance.getByRole('heading')).toContainText(defaultWedding.bride.name);
  await expect(entrance.getByRole('button')).toHaveCount(1);
  await expect(entrance.getByRole('button', { name: '건너뛰기', exact: true })).toBeFocused();
  await expect(entrance.locator('.invite-opening-door, .invite-opening-seal')).toHaveCount(0);
  expect(await film.evaluate(element => { const video = element as HTMLVideoElement; return { muted: video.muted, inline: video.playsInline, loop: video.loop }; })).toEqual({ muted: true, inline: true, loop: false });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  // A changing media clock and a decoded frame prove that the gate/camera
  // sequence is playing; an elapsed timer or a CSS transform is insufficient.
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  expect(await film.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  expect(await copy.evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThan(.1);
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 12000 }).toBeGreaterThan(7.5);
  await expect.poll(() => copy.evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.5);
  await page.screenshot({ path: testInfo.outputPath('garden-entrance-names.png') });
  await expect(entrance).toHaveCount(0, { timeout: 8000 });

  const evidence = await page.evaluate(() => (window as EvidenceWindow).weddingOpeningEvidence!);
  expect(evidence.samples.some(sample => sample.filmReadyState >= 2 && sample.filmTime > 1 && !sample.filmPaused)).toBe(true);
  expect(evidence.samples.some(sample => sample.filmTime > 9.5 && sample.filmEnded)).toBe(true);
  expect(evidence.samples.filter(sample => sample.filmTime > .8 && sample.filmTime < 6).every(sample => sample.copyOpacity < .1)).toBe(true);
  expect(evidence.samples.some(sample => sample.filmTime >= 7.4 && sample.copyOpacity > .8)).toBe(true);
  expect(evidence.finishedAt - evidence.samples[0].time).toBeGreaterThan(10_000);
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
  await page.reload();
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-opening-media', 'video');
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();
  expect(errors).toEqual([]);
});

test('legacy completion flags cannot skip a root visit or a return from the editor', async ({ page }) => {
  await page.addInitScript(key => sessionStorage.setItem(key, 'opened'), openingKey);
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  const film = entrance.locator('video.invite-opening-film');
  await expect(entrance).toBeVisible();
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0);
  await page.getByRole('link', { name: '우리 청첩장 관리' }).click();
  await expect(page.locator('.admin-app')).toBeVisible();
  await expect(entrance).toHaveCount(0);
  await page.getByRole('link', { name: '공개 청첩장 보기', exact: true }).click();
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-opening-media', 'video');
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
});

test('refreshing the mounted invitation updates its copy without reopening the entrance', async ({ page }) => {
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0);
  const data = structuredClone(defaultWedding);
  data.invitation = '새로 불러온 초대 문구입니다.';
  await storePublishedFixture(page, data);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.invite-letter-copy')).toContainText(data.invitation);
  await expect(entrance).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();
});

test('keyboard skip dismisses immediately, restores scrolling, and leaves the invitation accessible', async ({ page }) => {
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await expect(entrance.getByRole('button', { name: '건너뛰기', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
  await page.locator('.invite-scroll').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();
});

test('Escape is available while the garden film is playing', async ({ page }) => {
  await page.goto('/');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await expect.poll(() => entrance.locator('video.invite-opening-film').evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  await page.keyboard.press('Escape');
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
});

test('ordinary root visits play the full garden film even when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await observeOpening(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  const film = entrance.locator('video.invite-opening-film');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-motion', 'full');
  await expect(entrance).toHaveAttribute('data-opening-media', 'video');
  await expect(entrance.getByRole('heading')).toContainText(defaultWedding.groom.name);
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  expect(await film.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await expect(entrance).toHaveCount(0, { timeout: 16_000 });
  const evidence = await page.evaluate(() => (window as EvidenceWindow).weddingOpeningEvidence!);
  expect(evidence.finishedAt - evidence.samples[0].time).toBeGreaterThan(10_000);
  expect(evidence.samples.some(sample => sample.filmEnded && sample.filmTime > 10)).toBe(true);
  expect(evidence.samples.some(sample => sample.filmReadyState >= 2 && sample.filmTime > 1 && !sample.filmPaused)).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();
});

test('an explicit replay link plays the film despite reduced motion and an existing session', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(key => sessionStorage.setItem(key, 'opened'), openingKey);
  await page.goto('/?intro=play');
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-motion', 'full');
  await expect.poll(() => entrance.locator('video.invite-opening-film').evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.goto('/');
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-motion', 'full');
  await expect(entrance).toHaveAttribute('data-opening-media', 'video');
  await expect.poll(() => entrance.locator('video.invite-opening-film').evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
});

test('a failed garden film falls back to a readable still and never blocks arrival', async ({ page }) => {
  await page.route('**/garden-entrance.mp4', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await expect.poll(() => entrance.locator('.invite-opening-copy').evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.8);
  await expect(entrance.getByRole('button')).toHaveCount(1);
  await expect(entrance).toHaveCount(0, { timeout: 6500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
});

test('autoplay rejection uses the still fallback instead of leaving a frozen gate', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('Autoplay is blocked in this test.', 'NotAllowedError')); };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  await expect(entrance).toBeVisible();
  await expect.poll(() => entrance.locator('.invite-opening-copy').evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.8);
  await expect(entrance).toHaveCount(0, { timeout: 6500 });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('a four-second garden download delay still plays the video instead of the still fallback', async ({ page }) => {
  await page.route('**/garden-entrance.mp4', async route => {
    await new Promise(resolve => setTimeout(resolve, 4000));
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  const film = entrance.locator('video.invite-opening-film');
  await expect(entrance).toBeVisible();
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 12_000 }).toBeGreaterThan(.8);
  await expect(entrance).toHaveAttribute('data-opening-media', 'video');
  expect(await film.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0, { timeout: 500 });
});

test('five seconds of buffering does not truncate the full garden film', async ({ page }) => {
  await observeOpening(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  const film = entrance.locator('video.invite-opening-film');
  await expect.poll(() => film.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  const pausedAt = await film.evaluate(element => {
    const video = element as HTMLVideoElement;
    video.pause();
    return video.currentTime;
  });
  // Freeze the actual media clock to simulate a buffered stream. The wall-clock
  // duration now exceeds the old total-playback cutoff even though it recovers.
  await page.waitForTimeout(5000);
  await expect(entrance).toBeVisible();
  expect(await film.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeCloseTo(pausedAt, 1);
  await film.evaluate(element => (element as HTMLVideoElement).play());
  await expect(entrance).toHaveCount(0, { timeout: 16_000 });
  const evidence = await page.evaluate(() => (window as EvidenceWindow).weddingOpeningEvidence!);
  expect(evidence.samples.some(sample => sample.filmEnded && sample.filmTime > 10)).toBe(true);
  expect(evidence.finishedAt - evidence.samples[0].time).toBeGreaterThan(15_000);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('a stalled garden download is bounded and skip remains available', async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/garden-entrance.mp4', async route => { await waiting; await route.abort(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const entrance = page.locator('.invite-opening');
  try {
    await expect(entrance).toBeVisible();
    await expect(entrance.getByRole('button', { name: '건너뛰기', exact: true })).toBeEnabled();
    await expect(entrance).toHaveCount(0, { timeout: 15_000 });
  } finally { release(); }
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('#wedding-title')).toBeFocused();
});

test('direct section links and disabled entrances bypass the film', async ({ page }) => {
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

test('the editor can replay the garden film without changing guest session history', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/admin');
  await page.getByRole('button', { name: '추가 기능', exact: true }).click();
  const preview = page.getByRole('button', { name: /^(?:입장 영상|입장 효과|문 열림 효과) 미리보기$/ });
  const entrance = page.locator('.invite-opening');
  await preview.click();
  await expect(entrance).toHaveAttribute('data-opening-preview', 'true');
  await expect(entrance).toHaveAttribute('data-motion', 'full');
  await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(entrance).toHaveCount(0, { timeout: 500 });
  await expect(preview).toBeFocused();
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBeNull();

  await page.evaluate(key => sessionStorage.setItem(key, 'opened'), openingKey);
  await page.getByRole('checkbox', { name: /(?:입장 영상|입장 효과|문 열림 효과) 사용$/ }).uncheck();
  await preview.click();
  await expect(entrance).toBeVisible();
  await expect(entrance).toHaveAttribute('data-motion', 'full');
  await expect.poll(() => entrance.locator('video.invite-opening-film').evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 8000 }).toBeGreaterThan(.8);
  await expect(entrance).toHaveCount(0, { timeout: 16_000 });
  await expect(preview).toBeFocused();
  expect(await page.evaluate(key => sessionStorage.getItem(key), openingKey)).toBe('opened');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

for (const viewport of [{ width: 390, height: 664 }, { width: 390, height: 844 }, { width: 1365, height: 900 }, { width: 844, height: 390 }]) {
  test(`garden names and skip stay clear at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const entrance = page.locator('.invite-opening');
    await expect.poll(() => entrance.locator('.invite-opening-copy').evaluate(element => Number(getComputedStyle(element).opacity)), { timeout: 14_000 }).toBeGreaterThan(.8);
    const layout = await entrance.evaluate(element => {
      const box = (selector: string) => {
        const rect = element.querySelector(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return { copy: box('.invite-opening-copy'), skip: box('.invite-opening-skip'), film: box('.invite-opening-film') };
    });
    expect(layout.copy.bottom + 16).toBeLessThanOrEqual(layout.skip.top);
    expect(layout.copy.left).toBeGreaterThanOrEqual(0);
    expect(layout.copy.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.skip.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.skip.left).toBeGreaterThanOrEqual(0);
    expect(layout.skip.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.film.width).toBeGreaterThan(0);
    expect(layout.film.height).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await entrance.getByRole('button', { name: '건너뛰기', exact: true }).click();
    await expect(entrance).toHaveCount(0, { timeout: 500 });
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
}
