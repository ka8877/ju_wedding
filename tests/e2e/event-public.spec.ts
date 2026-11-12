import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';
import type { WeddingData } from '../../src/lib/types';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4+vrOfwAJUQO8AaEsBQAAAABJRU5ErkJggg==';

async function publishFixture(page: Page, data: WeddingData) {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html', body: '<p>지도 테스트</p>' }));
  await page.goto('/');
  await page.evaluate(async wedding => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jo-and-joo', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('wedding');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('wedding', 'readwrite');
      tx.objectStore('wedding').put({ data: wedding, updatedAt: '2026-11-12T00:00:00Z' }, 'published');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
}

test('known wedding facts, family order, transport and shuttle guidance appear in the chosen section order', async ({ page }) => {
  const data = structuredClone(defaultWedding);
  data.venue.lat = null; data.venue.lng = null;
  data.venue.subway = '지하철 안내 테스트'; data.venue.bus = '버스 안내 테스트'; data.venue.car = '자가용 안내 테스트';
  data.guestFeatures.shuttle.daejeon = '대전 탑승 안내 테스트';
  data.accounts = [
    { id: 'groom-account', side: 'groom', bank: '테스트은행', number: '111-222', holder: '조현범' },
    { id: 'bride-account', side: 'bride', bank: '테스트은행', number: '333-444', holder: '권주영' },
  ];
  await publishFixture(page, data);
  await expect(page.locator('.invite-hero-date')).toHaveText('2027년 2월 20일 토요일 오후 12:30');
  await expect(page.locator('.invite-hero-venue')).toContainText('HD현대글로벌R&D센터 아산홀');
  await expect(page.locator('.invite-family-row').first()).toContainText('조성진 · 이진용');
  await expect(page.locator('.invite-family-row').first()).toContainText('의 장남');
  await expect(page.locator('.invite-family-row').first().locator('strong')).toHaveText('현범');
  await expect(page.locator('.invite-family-row').nth(1)).toContainText('권용덕 · 이선애');
  await expect(page.locator('.invite-family-row').nth(1)).toContainText('의 차녀');
  await expect(page.locator('.invite-family-row').nth(1).locator('strong')).toHaveText('주영');
  expect(await page.locator('.invite-content-section').evaluateAll(elements => elements.map(element => element.getAttribute('data-section')))).toEqual(['invitation', 'calendar', 'gallery', 'rsvp', 'snap', 'location', 'shuttle', 'accounts']);
  for (const title of ['지하철', '버스', '자가용']) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '카카오맵 길찾기' })).toHaveAttribute('href', /map\.kakao\.com\/link\/to\/.*37\.3768838,127\.1043929/);
  const daejeon = page.locator('.invite-shuttle-group').first();
  await expect(daejeon.locator('p')).not.toBeVisible();
  await daejeon.locator('summary').click();
  await expect(daejeon.locator('p')).toHaveText('대전 탑승 안내 테스트');
  const gyeongju = page.locator('.invite-shuttle-group').nth(1);
  await gyeongju.locator('summary').click();
  await expect(gyeongju.locator('p')).toContainText('출발 시간과 탑승 장소는 정해지는 대로');
  await expect(page.locator('.invite-account-group')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('collage starts with three mixed two/three-photo rows and expands without losing album order', async ({ page }) => {
  const data = structuredClone(defaultWedding);
  data.design.galleryLayout = 'mosaic';
  data.guestFeatures.gallery.collapsedRows = 3;
  data.photos = Array.from({ length: 12 }, (_, i) => ({ id: `photo-${i}`, alt: `테스트 사진 ${i + 1}`, url: image }));
  await publishFixture(page, data);
  const photos = page.locator('.invite-gallery-item');
  await expect(photos).toHaveCount(7);
  const positions = await photos.evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { y: box.y, width: box.width }; }));
  expect(positions[0].y).toBe(positions[1].y);
  expect(positions[2].y).toBe(positions[3].y);
  expect(positions[2].y).toBe(positions[4].y);
  expect(positions[5].y).toBe(positions[6].y);
  expect(positions[0].width).toBeGreaterThan(positions[2].width);
  expect(positions[2].y).toBeGreaterThan(positions[0].y);
  expect(positions[5].y).toBeGreaterThan(positions[2].y);
  await page.getByRole('button', { name: '갤러리 펼쳐보기 (12장)', exact: true }).click();
  await expect(photos).toHaveCount(12);
  await photos.nth(9).click();
  const lightbox = page.getByRole('dialog', { name: '웨딩 사진 크게 보기' });
  await expect(lightbox).toContainText('10 / 12');
  await page.keyboard.press('ArrowRight');
  await expect(lightbox).toContainText('11 / 12');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '갤러리 접기', exact: true }).click();
  await expect(photos).toHaveCount(7);
  await photos.nth(6).click();
  await page.keyboard.press('ArrowRight');
  await expect(lightbox).toContainText('8 / 12');
});

test('music waits for a tap and stops when paused or the page becomes hidden', async ({ page }) => {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    (window as Window & { weddingAudioContexts?: AudioContext[] }).weddingAudioContexts = contexts;
    window.AudioContext = new Proxy(window.AudioContext, { construct(Target, args) { const context = Reflect.construct(Target, args) as AudioContext; contexts.push(context); return context; } });
  });
  await page.goto('/');
  const play = page.getByRole('button', { name: '배경음악 재생', exact: true });
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as Window & { weddingAudioContexts?: AudioContext[] }).weddingAudioContexts?.length)).toBe(0);
  await play.click();
  await expect(page.getByRole('button', { name: '배경음악 일시정지', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => (window as Window & { weddingAudioContexts?: AudioContext[] }).weddingAudioContexts?.[0].state)).toBe('running');
  await page.getByRole('button', { name: '배경음악 일시정지', exact: true }).click();
  await expect(play).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { weddingAudioContexts?: AudioContext[] }).weddingAudioContexts?.[0].state)).toBe('closed');
  await play.click();
  await expect(page.getByRole('button', { name: '배경음악 일시정지', exact: true })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(play).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { weddingAudioContexts?: AudioContext[] }).weddingAudioContexts?.[1].state)).toBe('closed');
});

test('the Korean wedding day is D-DAY even before the ceremony starts', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-02-20T11:00:00+09:00'));
  await page.goto('/');
  await expect(page.locator('.invite-day-badge')).toHaveText('D-DAY');
  await expect(page.locator('.invite-countdown-note')).toHaveText('오늘, 두 사람이 하나 되는 소중한 날입니다.');
});
