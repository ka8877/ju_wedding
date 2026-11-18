import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultWedding } from '../../src/lib/defaults';
import { confirmedVenueCoordinates, getVenueMapViewport, jeongjaStation } from '../../src/lib/venue-map';
import type { Venue, WeddingData } from '../../src/lib/types';
import { naverSdkMock } from './naver-sdk-mock';

const googleRequests = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const requests: string[] = [];
  googleRequests.set(page, requests);
  page.on('request', request => {
    if (/^https:\/\/(?:maps|www)\.google\.[^/]+\//.test(request.url())) requests.push(request.url());
  });
});
test.afterEach(({ page }) => {
  expect(googleRequests.get(page)).toEqual([]);
});

async function publishFixture(page: Page, data: WeddingData) {
  data.guestFeatures.opening.enabled = false;
  await page.goto('/');
  const skipOpening = page.getByRole('button', { name: '건너뛰기', exact: true });
  if (await skipOpening.isVisible()) await skipOpening.click();
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

test('an unconfigured invitation offers Naver without substituting an inline provider or a blank map', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const data = structuredClone(defaultWedding);
  data.venue.lat = null; data.venue.lng = null;
  delete (data.venue as Partial<Venue>).naverMapClientId;
  await publishFixture(page, data);
  const location = page.locator('[data-section="location"]');
  const map = location.locator('.venue-map');
  await expect(map).toHaveAttribute('data-map-provider', 'naver');
  await expect(map).toHaveAttribute('data-map-state', 'unconfigured');
  await expect(map.locator('iframe, .venue-map-frame, .venue-map-views, .venue-map-context')).toHaveCount(0);
  await expect(map.getByRole('region')).toHaveCount(0);
  await expect(map.getByRole('note')).toContainText('네이버 지도에서 예식장 위치를 확인해 주세요.');
  await expect(map.getByRole('link', { name: '네이버 지도에서 보기', exact: true })).toHaveAttribute('href', 'https://m.place.naver.com/place/1156613092/location');
  await expect(map.locator('.venue-map-station')).toContainText('정자역');
  await expect(map.locator('.venue-map-station a')).toHaveAttribute('href', jeongjaStation.url);
  expect((await map.boundingBox())!.height).toBeLessThan(260);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a customized address links to its own Naver search without unrelated station context', async ({ page }) => {
  const data = structuredClone(defaultWedding);
  data.venue = { ...data.venue, name: '우리의 새로운 예식장', address: '서울특별시 중구 세종대로 110', lat: null, lng: null };
  await publishFixture(page, data);
  const map = page.locator('[data-section="location"] .venue-map');
  const naverUrl = await map.getByRole('link', { name: '네이버 지도에서 보기', exact: true }).getAttribute('href');
  expect(decodeURIComponent(naverUrl!)).toContain(data.venue.address);
  expect(naverUrl).not.toContain('1156613092');
  await expect(map.locator('iframe, .venue-map-station, .venue-map-context')).toHaveCount(0);
});

test('one Naver map shows the venue and station together with native zoom and no redundant view buttons', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let sdkRequests = 0;
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => {
    sdkRequests++;
    return route.fulfill({ contentType: 'application/javascript', body: naverSdkMock });
  });
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  const location = page.locator('[data-section="location"]');
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-provider', 'naver');
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-state', 'ready');
  const map = location.getByRole('region', { name: 'HD현대글로벌R&D센터 위치 지도 · 네이버 지도', exact: true });
  await expect(map).toBeVisible();
  const viewport = getVenueMapViewport(data.venue, 'area')!;
  await expect(map).toHaveAttribute('data-center', `${viewport.center.lat},${viewport.center.lng}`);
  await expect(map).toHaveAttribute('data-zoom', '14');
  expect(JSON.parse((await map.getAttribute('data-bounds'))!)).toEqual({
    southwest: { lat: jeongjaStation.lat, lng: confirmedVenueCoordinates.lng },
    northeast: { lat: confirmedVenueCoordinates.lat, lng: jeongjaStation.lng },
  });
  await expect(map.locator('[data-marker-title="HD현대글로벌R&D센터"]')).toHaveAttribute('data-position', '37.3768838,127.1043929');
  await expect(map.locator('[data-marker-title="정자역"]')).toHaveAttribute('data-position', '37.3677228,127.108455');
  await expect(map).toHaveAttribute('data-zoom-control', 'true');
  await expect(location.getByRole('button', { name: /예식장 자세히|주변 교통 보기/ })).toHaveCount(0);
  await expect(location.getByRole('group', { name: '지도 범위' })).toHaveCount(0);
  await expect(location.locator('iframe')).toHaveCount(0);
  expect(sdkRequests).toBe(1);
  expect(errors).toEqual([]);
});

test('a rejected Naver key shows an honest retry without switching the configured map to Google', async ({ page }) => {
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
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-provider', 'naver');
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-state', 'error');
  await expect(location.locator('.venue-map-views')).toHaveCount(0);
  expect((await location.locator('.venue-map').boundingBox())!.height).toBeLessThan(260);
  await expect(location.locator('iframe')).toHaveCount(0);
  await expect(location.locator('.venue-map-status')).toContainText('지도를 불러오지 못했어요.');
  await expect(location.getByRole('button', { name: '다시 시도', exact: true })).toBeVisible();
  await expect(location.locator('.venue-map-status').getByRole('link', { name: '네이버 지도에서 보기', exact: true })).toHaveAttribute('href', 'https://m.place.naver.com/place/1156613092/location');
  expect(errors).toEqual([]);
});

test('editors can update the venue by address without configuring map credentials or coordinates', async ({ page }) => {
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.abort());
  await page.goto('/#/admin');
  await expect(page.locator('a[href="#/setup"]')).toHaveCount(0);
  await page.getByRole('button', { name: '예식 장소', exact: true }).click();
  await expect(page.getByLabel(/Client ID|위도|경도/)).toHaveCount(0);
  await expect(page.locator('summary').filter({ hasText: /네이버 지도 화면 연결|지도 위치 직접 입력/ })).toHaveCount(0);
  await page.getByLabel('예식장 이름', { exact: true }).fill('새로운 예식장');
  await page.getByLabel('주소', { exact: true }).fill('서울특별시 중구 세종대로 110');
  const map = page.locator('.editor-venue-map');
  await expect(map).toHaveAttribute('data-map-state', 'unconfigured');
  await expect(map.locator('iframe')).toHaveCount(0);
  expect(decodeURIComponent((await map.getByRole('link', { name: '네이버 지도에서 보기', exact: true }).getAttribute('href'))!)).toContain('서울특별시 중구 세종대로 110');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await expect(page.locator('.editor-notice')).toContainText('이 기기에 초안을 저장했어요');
  await page.reload();
  await page.getByRole('button', { name: '예식 장소', exact: true }).click();
  await expect(page.getByLabel('주소', { exact: true })).toHaveValue('서울특별시 중구 세종대로 110');
  await expect(page.getByLabel(/Client ID|위도|경도/)).toHaveCount(0);
});

test('a raster map becomes ready on SDK init without waiting for an idle event', async ({ page }) => {
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.fulfill({ contentType: 'application/javascript', body: naverSdkMock }));
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  const map = page.locator('[data-section="location"] .venue-map');
  await expect(map).toHaveAttribute('data-map-state', 'ready');
  await expect(map.getByRole('region')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { weddingMapEvents?: string[] }).weddingMapEvents)).toEqual(['init']);
});

test('a map initialized in its constructor becomes ready even when no later init event is emitted', async ({ page }) => {
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.fulfill({
    contentType: 'application/javascript', body: `window.weddingMapInitialization = 'constructor'; ${naverSdkMock}`,
  }));
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  await expect(page.locator('[data-section="location"] .venue-map')).toHaveAttribute('data-map-state', 'ready');
  expect(await page.evaluate(() => (window as Window & { weddingMapEvents?: string[] }).weddingMapEvents || [])).toEqual([]);
});

test('the SDK idle event emitted synchronously by fitBounds is observed', async ({ page }) => {
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.fulfill({
    contentType: 'application/javascript', body: `window.weddingMapInitialization = 'fit-bounds-idle'; ${naverSdkMock}`,
  }));
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  await expect(page.locator('[data-section="location"] .venue-map')).toHaveAttribute('data-map-state', 'ready');
  expect(await page.evaluate(() => (window as Window & { weddingMapEvents?: string[] }).weddingMapEvents)).toEqual(['idle']);
});

test('a map that never initializes still times out and exposes its reason only in developer tools', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.install();
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.fulfill({
    contentType: 'application/javascript', body: `window.weddingMapInitialization = 'never'; ${naverSdkMock}`,
  }));
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  const map = page.locator('[data-section="location"] .venue-map');
  await expect(map.locator('.venue-map-naver')).toHaveAttribute('data-initial-height', /^[1-9]\d*$/);
  await page.clock.fastForward(8_100);
  await expect(map).toHaveAttribute('data-map-state', 'error');
  await expect(map.getByRole('alert')).toContainText('네이버 지도를 불러오지 못했어요.');
  await expect(map.getByRole('alert')).not.toContainText('map-initialization-timeout');
  expect(errors.some(message => message.includes('[VenueMap] map-initialization-timeout:'))).toBe(true);
});

test('a configured Naver map remains compact while loading and reveals only the map when ready', async ({ page }) => {
  let releaseSdk!: () => void;
  const sdkGate = new Promise<void>(resolve => { releaseSdk = resolve; });
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', async route => {
    await sdkGate;
    await route.fulfill({ contentType: 'application/javascript', body: naverSdkMock });
  });
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  const map = page.locator('[data-section="location"] .venue-map');
  await expect(map).toHaveAttribute('data-map-state', 'loading');
  await expect(map.getByRole('status')).toContainText('네이버 지도를 불러오고 있어요.');
  await expect(map.locator('.venue-map-views')).toHaveCount(0);
  expect((await map.boundingBox())!.height).toBeLessThan(260);
  await expect(map.locator('iframe')).toHaveCount(0);
  releaseSdk();
  await expect(map).toHaveAttribute('data-map-state', 'ready');
  await expect(map.locator('iframe')).toHaveCount(0);
  await expect(map.getByRole('group', { name: '지도 범위' })).toHaveCount(0);
  await expect(map.getByRole('region')).toBeVisible();
  expect(Number(await map.getByRole('region').getAttribute('data-initial-width'))).toBeGreaterThan(0);
  expect(Number(await map.getByRole('region').getAttribute('data-initial-height'))).toBeGreaterThan(0);
});

test('a custom address is resolved by the official Naver geocoder without editor coordinate input', async ({ page }) => {
  let sdkUrl = '';
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => {
    sdkUrl = route.request().url();
    return route.fulfill({ contentType: 'application/javascript', body: naverSdkMock });
  });
  const data = structuredClone(defaultWedding);
  data.venue = { ...data.venue, naverMapClientId: 'test-public-client-id', name: '우리의 새로운 예식장', address: '서울특별시 중구 세종대로 110', lat: null, lng: null };
  await publishFixture(page, data);
  const location = page.locator('[data-section="location"]');
  await expect(location.locator('.venue-map')).toHaveAttribute('data-map-state', 'ready');
  await expect(location.getByRole('region', { name: '우리의 새로운 예식장 위치 지도 · 네이버 지도', exact: true })).toHaveAttribute('data-center', '37.5665,126.978');
  await expect(location.getByRole('region')).toHaveAttribute('data-zoom', '17');
  expect(new URL(sdkUrl).searchParams.get('submodules')).toBe('geocoder');
  expect(await page.evaluate(() => (window as Window & { weddingGeocodeQueries?: string[] }).weddingGeocodeQueries)).toEqual([data.venue.address]);
  await expect(location.locator('[data-marker-title="정자역"]')).toHaveCount(0);
  await expect(location.locator('.venue-map-station')).toHaveCount(0);
  await expect(location.locator('iframe')).toHaveCount(0);
});

test('a custom address waits for the Naver geocoder submodule after the core SDK loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `${naverSdkMock}
      const geocoder = window.naver.maps.Service;
      delete window.naver.maps.Service;
      window.naver.maps.onJSContentLoaded = () => { window.weddingPreviousSdkCallbackCalled = true; };
      window.weddingFinishGeocoder = () => {
        window.naver.maps.Service = geocoder;
        window.naver.maps.onJSContentLoaded?.();
      };
    `,
  }));
  const data = structuredClone(defaultWedding);
  data.venue = { ...data.venue, naverMapClientId: 'test-public-client-id', name: '새 주소 예식장', address: '서울특별시 중구 세종대로 110', lat: null, lng: null };
  await publishFixture(page, data);
  const map = page.locator('[data-section="location"] .venue-map');
  await expect.poll(() => page.evaluate(() => typeof (window as Window & { weddingFinishGeocoder?: () => void }).weddingFinishGeocoder)).toBe('function');
  await expect(map).toHaveAttribute('data-map-state', 'loading');
  await page.evaluate(() => (window as Window & { weddingFinishGeocoder?: () => void }).weddingFinishGeocoder?.());
  await expect(map).toHaveAttribute('data-map-state', 'ready');
  await expect(map.getByRole('region')).toHaveAttribute('data-center', '37.5665,126.978');
  expect(await page.evaluate(() => (window as Window & { weddingGeocodeQueries?: string[] }).weddingGeocodeQueries)).toEqual([data.venue.address]);
  expect(await page.evaluate(() => (window as Window & { weddingPreviousSdkCallbackCalled?: boolean }).weddingPreviousSdkCallbackCalled)).toBe(true);
  expect(errors).toEqual([]);
});

test('a late Naver authentication error removes the old canvas and can retry the Naver connection', async ({ page }) => {
  let sdkRequests = 0;
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => {
    sdkRequests++;
    return route.fulfill({ contentType: 'application/javascript', body: naverSdkMock });
  });
  const data = structuredClone(defaultWedding);
  data.venue.naverMapClientId = 'test-public-client-id';
  await publishFixture(page, data);
  const map = page.locator('[data-section="location"] .venue-map');
  await expect(map).toHaveAttribute('data-map-state', 'ready');
  await page.evaluate(() => (window as Window & { navermap_authFailure?: () => void }).navermap_authFailure?.());
  await expect(map).toHaveAttribute('data-map-state', 'error');
  await expect(map.getByRole('region')).toHaveCount(0);
  await expect(map.locator('iframe')).toHaveCount(0);
  await map.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(map).toHaveAttribute('data-map-state', 'ready');
  expect(sdkRequests).toBe(2);
});
