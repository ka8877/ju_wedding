import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { defaultWedding } from '../../src/lib/defaults';

const publicUrl = 'https://ka8877.github.io/ju_wedding/';

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/(?:maps|www)\.google\.com\//, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>예식장 지도</p>' }));
  await page.route('https://t1.kakaocdn.net/**', route => route.abort());
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js?**', route => route.fulfill({ contentType: 'application/javascript', body: 'window.navermap_authFailure();' }));
});

test('guests can scan, save and copy a real QR that points to the public invitation', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const externalRequests: string[] = [];
  // The venue iframe has its own provider; QR generation in the invitation
  // itself must still work without calling an external QR service.
  page.on('request', request => {
    const url = request.url();
    const serviceSdk = url === 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js'
      || url.startsWith('https://oapi.map.naver.com/openapi/v3/maps.js?');
    if (request.frame() === page.mainFrame() && !url.startsWith(baseURL!) && !url.startsWith('data:') && !serviceSdk) externalRequests.push(url);
  });
  await page.goto('/?tracking=private#/');
  const trigger = page.getByRole('button', { name: 'QR 코드 보기', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
  await expect(dialog).toBeVisible();
  const image = dialog.getByRole('img', { name: '공개 청첩장으로 연결되는 QR 코드' });
  await expect(image).toBeVisible();
  const pixels = await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(element, 0, 0);
    return { data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height };
  });
  expect(pixels.width).toBe(1024);
  expect(jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data).toBe(publicUrl);
  expect(pixels.data.slice(0, 4)).toEqual([255, 255, 255, 255]);
  await dialog.getByRole('button', { name: '링크 복사', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
  await expect(dialog.getByRole('status')).toContainText('링크를 복사했어요');
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'QR 이미지 저장', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('juyoung-hyunbeom-invitation-qr.png');
  const file = await readFile((await download.path())!);
  expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(file.readUInt32BE(16)).toBe(1024);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('native sharing and the editor share the public page rather than a local draft', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { sessionStorage.setItem('wedding-test-share', JSON.stringify(data)); } });
  });
  await page.goto('/?tracking=private#/');
  await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
  await page.getByRole('button', { name: '다른 앱으로 공유', exact: true }).click();
  const shared = JSON.parse((await page.evaluate(() => sessionStorage.getItem('wedding-test-share')))!);
  expect(shared.url).toBe(publicUrl);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: '소중한 분께 전해요' })).toBeVisible();
  await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
  await expect(dialog.getByRole('link')).toHaveAttribute('href', publicUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


async function publishKakaoFixture(page: import('@playwright/test').Page) {
  const data = structuredClone(defaultWedding);
  data.guestFeatures.sharing.kakaoJavascriptKey = 'a'.repeat(32);
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

test('the primary sharing action opens the dedicated Kakao SDK with the public invitation payload', async ({ page }) => {
  await page.route('https://t1.kakaocdn.net/**', route => route.fulfill({ contentType: 'application/javascript', body: `
    let initialized = false;
    window.Kakao = {
      init(key) { initialized = true; sessionStorage.setItem('wedding-test-kakao-key', key); },
      isInitialized() { return initialized; },
      Share: { sendDefault(payload) { sessionStorage.setItem('wedding-test-kakao-payload', JSON.stringify(payload)); } }
    };
  ` }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { sessionStorage.setItem('wedding-test-native-called', 'yes'); } });
  });
  await publishKakaoFixture(page);
  const actions = page.locator('.wedding-share-actions');
  await expect(actions.getByRole('button').first()).toHaveText('카카오톡으로 공유');
  await expect(page.getByRole('button', { name: '청첩장 공유하기', exact: true })).toHaveCount(0);
  await actions.getByRole('button', { name: '카카오톡으로 공유', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('wedding-test-kakao-payload'))).not.toBeNull();
  const payload = JSON.parse((await page.evaluate(() => sessionStorage.getItem('wedding-test-kakao-payload')))!);
  expect(payload).toMatchObject({ objectType: 'feed', content: {
    title: '조현범 · 권주영의 결혼식',
    imageUrl: new URL('invitation-share.png', publicUrl).href,
    link: { mobileWebUrl: publicUrl, webUrl: publicUrl },
  }, buttons: [{ title: '청첩장 보기', link: { mobileWebUrl: publicUrl, webUrl: publicUrl } }] });
  expect(await page.evaluate(() => sessionStorage.getItem('wedding-test-native-called'))).toBeNull();
  await expect(page.locator('.wedding-sharing')).not.toContainText(/API|JavaScript|개발자|Client ID/);
});

test('unavailable Kakao sharing reports a retry error and leaves copying as an explicit secondary action', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { sessionStorage.setItem('wedding-test-native-called', 'yes'); } });
  });
  await page.goto('/');
  await page.evaluate(() => navigator.clipboard.writeText('unchanged-clipboard'));
  await page.getByRole('button', { name: '카카오톡으로 공유', exact: true }).click();
  await expect(page.locator('.wedding-share-feedback')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.wedding-share-feedback')).toHaveText('카카오톡 공유를 열지 못했어요. 다시 시도하거나 링크 복사로 전해 주세요.');
  expect(await page.evaluate(() => sessionStorage.getItem('wedding-test-native-called'))).toBeNull();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('unchanged-clipboard');
  await expect(page.locator('.wedding-share-feedback')).not.toContainText(/전달되었습니다|전송 완료|공유 완료|API|설정/);
  await page.getByRole('button', { name: '링크 복사', exact: true }).click();
  await expect(page.locator('.wedding-share-feedback')).toHaveAttribute('role', 'status');
  await expect(page.locator('.wedding-share-feedback')).toHaveText('청첩장 링크를 복사했어요.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
});

test('a Kakao SDK rejection does not silently open the native share sheet or copy a link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('https://t1.kakaocdn.net/**', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.Kakao = { init() {}, isInitialized() { return false; }, Share: { sendDefault() { throw new Error('SDK failure'); } } };
  ` }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { sessionStorage.setItem('wedding-test-native-called', 'yes'); } });
  });
  await publishKakaoFixture(page);
  await page.evaluate(() => navigator.clipboard.writeText('unchanged-clipboard'));
  await page.getByRole('button', { name: '카카오톡으로 공유', exact: true }).click();
  await expect(page.locator('.wedding-share-feedback')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.wedding-share-feedback')).toContainText('다시 시도하거나 링크 복사');
  expect(await page.evaluate(() => sessionStorage.getItem('wedding-test-native-called'))).toBeNull();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('unchanged-clipboard');
});
