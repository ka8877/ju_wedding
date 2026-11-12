import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';
import type { Venue, WeddingData } from '../../src/lib/types';

async function publishFixture(page: Page, data: WeddingData) {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>표시된 예식장 지도</p>' }));
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
      tx.objectStore('wedding').put({ data: wedding, updatedAt: '2026-11-12T00:00:00Z' }, 'published');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
  await page.locator('[data-section="location"]').scrollIntoViewIfNeeded();
}

test('an existing invitation without coordinates or a map key shows the venue map and primary Naver link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const data = structuredClone(defaultWedding);
  data.venue.lat = null; data.venue.lng = null;
  delete (data.venue as Partial<Venue>).naverMapClientId;
  await publishFixture(page, data);
  const location = page.locator('[data-section="location"]');
  const map = location.locator('iframe');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('src', /^https:\/\/www\.google\.com\/maps\/embed\?/);
  await expect(page.frameLocator('[data-section="location"] iframe').getByText('표시된 예식장 지도')).toBeVisible();
  await expect(location.getByRole('link', { name: '네이버 지도 열기', exact: true })).toHaveAttribute('href', 'https://m.place.naver.com/place/1156613092/location');
  await expect(location.getByRole('link', { name: '네이버 지도 열기', exact: true })).toHaveClass(/primary/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a customized address uses its own map and Naver search instead of the original venue', async ({ page }) => {
  const data = structuredClone(defaultWedding);
  data.venue = { ...data.venue, name: '우리의 새로운 예식장', address: '서울특별시 중구 세종대로 110', lat: null, lng: null };
  await publishFixture(page, data);
  const location = page.locator('[data-section="location"]');
  const frameUrl = await location.locator('iframe').getAttribute('src');
  expect(new URL(frameUrl!).searchParams.get('q')).toContain(data.venue.address);
  expect(frameUrl).not.toContain('127.104');
  const naverUrl = await location.getByRole('link', { name: '네이버 지도 열기', exact: true }).getAttribute('href');
  expect(decodeURIComponent(naverUrl!)).toContain(data.venue.address);
  expect(naverUrl).not.toContain('1156613092');
});

test('a configured Naver key displays the interactive Naver canvas and a marker at the verified coordinates', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let sdkRequests = 0;
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => {
    sdkRequests++;
    return route.fulfill({ contentType: 'application/javascript', body: `
      window.naver = { maps: {
        LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
        Map: class { constructor(element, options) { this.element = element; element.dataset.center = options.center.lat + ',' + options.center.lng; } destroy() {} },
        Marker: class { constructor(options) { const pin = document.createElement('span'); pin.textContent = options.title; options.map.element.append(pin); } setMap() {} },
        Event: { addListenerOnce(map, event, listener) { return setTimeout(listener, 20); }, removeListener(handle) { clearTimeout(handle); }, clearInstanceListeners() {} }
      } };
    ` });
  });
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  const location = page.locator('[data-section="location"]');
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-provider', 'naver');
  const map = location.getByRole('region', { name: 'HD현대글로벌R&D센터 위치 지도 · 네이버 지도', exact: true });
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('data-center', '37.3768838,127.1043929');
  await expect(map).toHaveText('HD현대글로벌R&D센터');
  await expect(location.locator('iframe')).toHaveCount(0);
  expect(sdkRequests).toBe(1);
  expect(errors).toEqual([]);
});

test('a rejected Naver key leaves the embedded map and default Naver venue link available', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let rejected = false;
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => {
    rejected = true;
    return route.fulfill({ contentType: 'application/javascript', body: 'window.navermap_authFailure();' });
  });
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'rejected-public-key';
  await publishFixture(page, data);
  await expect.poll(() => rejected).toBe(true);
  const location = page.locator('[data-section="location"]');
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-provider', 'google');
  await expect(location.locator('iframe')).toBeVisible();
  await expect(page.frameLocator('[data-section="location"] iframe').getByText('표시된 예식장 지도')).toBeVisible();
  await expect(location.getByRole('link', { name: '네이버 지도 열기', exact: true })).toHaveAttribute('href', 'https://m.place.naver.com/place/1156613092/location');
  expect(errors).toEqual([]);
});

test('editors can update the venue by address without configuring map credentials or coordinates', async ({ page }) => {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>표시된 예식장 지도</p>' }));
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.abort());
  await page.goto('/#/admin');
  await expect(page.locator('a[href="#/setup"]')).toHaveCount(0);
  await page.getByRole('button', { name: '예식 장소', exact: true }).click();
  await expect(page.getByLabel(/Client ID|위도|경도/)).toHaveCount(0);
  await expect(page.locator('summary').filter({ hasText: /네이버 지도 화면 연결|지도 위치 직접 입력/ })).toHaveCount(0);
  await page.getByLabel('예식장 이름', { exact: true }).fill('새로운 예식장');
  await page.getByLabel('주소', { exact: true }).fill('서울특별시 중구 세종대로 110');
  const map = page.getByTitle('선택한 예식장 지도', { exact: true });
  await expect(map).toBeVisible();
  expect(new URL((await map.getAttribute('src'))!).searchParams.get('q')).toContain('서울특별시 중구 세종대로 110');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기에 초안을 저장했어요');
  await page.reload();
  await page.getByRole('button', { name: '예식 장소', exact: true }).click();
  await expect(page.getByLabel('주소', { exact: true })).toHaveValue('서울특별시 중구 세종대로 110');
  await expect(page.getByLabel(/Client ID|위도|경도/)).toHaveCount(0);
});
