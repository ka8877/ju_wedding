import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from './helpers';
import type { Page } from '@playwright/test';
import jsQR from 'jsqr';

const publicUrl = 'https://hyunbeom-juyoung.pages.dev/';
// pngjs is qrcode's locked Node renderer dependency. Transfer the compressed
// PNG instead of millions of RGBA numbers through Playwright and its trace.
const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Uint8Array } } };
};
function readPng(value: Buffer | string) {
  return PNG.sync.read(typeof value === 'string' ? Buffer.from(value.split(',')[1], 'base64') : value);
}
function scanPng(value: Buffer | string) {
  const png = readPng(value);
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

async function configureKakao(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const defaultsPath = '/src/lib/defaults.ts';
    const storagePath = '/src/lib/storage.ts';
    const { defaultWedding } = await import(defaultsPath);
    const { publishWedding } = await import(storagePath);
    const data = structuredClone(defaultWedding);
    data.guestFeatures.sharing.kakaoJavascriptKey = 'a'.repeat(32);
    await publishWedding(data);
  });
  await page.reload();
}

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
  await expect(dialog.locator('.wedding-share-dialog-actions button')).toHaveCount(2);
  await expect(dialog).not.toContainText(/공개 반영|이 기기의 미리보기|공개한 청첩장/);
  const image = dialog.getByRole('img', { name: '공개 청첩장으로 연결되는 QR 코드' });
  await expect(image).toBeVisible();
  const source = (await image.getAttribute('src'))!;
  const pixels = readPng(source);
  expect(pixels.width).toBe(1536);
  expect(scanPng(source)).toBe(publicUrl);
  expect(Array.from(pixels.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
  await expect(dialog.locator('.wedding-qr-frame')).toHaveAttribute('data-qr-shape', 'heart-pattern');
  await dialog.getByRole('button', { name: '링크 복사', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
  await expect(dialog.getByRole('status')).toContainText('링크를 복사했어요');
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'QR 이미지 저장', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('juyoung-hyunbum-invitation-qr.png');
  const file = await readFile((await download.path())!);
  expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(file.readUInt32BE(16)).toBe(1536);
  expect(scanPng(file)).toBe(publicUrl);
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
  await expect(page.locator('.wedding-sharing--guest .wedding-share-actions button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '카카오톡으로 공유', exact: true })).toHaveCount(0);
  await expect(page.locator('.wedding-sharing--guest .wedding-share-note')).toHaveCount(0);
  await page.getByRole('button', { name: '청첩장 공유하기', exact: true }).click();
  const shared = JSON.parse((await page.evaluate(() => sessionStorage.getItem('wedding-test-share')))!);
  expect(shared.url).toBe(publicUrl);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: '소중한 분께 전해요' })).toBeVisible();
  await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
  await expect(dialog.getByRole('link')).toHaveAttribute('href', publicUrl);
  await expect(dialog).toContainText('이 기기의 미리보기 수정은 전달되지 않아요.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('configured Kakao sharing offers one direct share action beside the heart QR', async ({ page }) => {
  await page.addInitScript(() => {
    let initialized = false;
    Object.defineProperty(window, 'Kakao', { configurable: true, value: {
      init(key: string) { initialized = true; sessionStorage.setItem('wedding-test-kakao-key', key); },
      isInitialized: () => initialized,
      Share: { sendDefault: async (payload: unknown) => { sessionStorage.setItem('wedding-test-kakao-share', JSON.stringify(payload)); } },
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { sessionStorage.setItem('wedding-test-native-share', 'opened'); } });
  });
  await configureKakao(page);
  await expect(page.locator('.wedding-sharing--guest .wedding-share-actions button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '청첩장 공유하기', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '카카오톡으로 공유', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('wedding-test-kakao-share'))).not.toBeNull();
  const payload = JSON.parse((await page.evaluate(() => sessionStorage.getItem('wedding-test-kakao-share')))!);
  expect(payload.content.link).toEqual({ mobileWebUrl: publicUrl, webUrl: publicUrl });
  expect(await page.evaluate(() => sessionStorage.getItem('wedding-test-kakao-key'))).toBe('a'.repeat(32));
  expect(await page.evaluate(() => sessionStorage.getItem('wedding-test-native-share'))).toBeNull();
});

test('an unavailable configured Kakao SDK falls back to the device share sheet', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { sessionStorage.setItem('wedding-test-kakao-share', JSON.stringify(data)); } });
  });
  await configureKakao(page);
  await page.getByRole('button', { name: '카카오톡으로 공유', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('wedding-test-kakao-share'))).not.toBeNull();
  const payload = JSON.parse((await page.evaluate(() => sessionStorage.getItem('wedding-test-kakao-share')))!);
  expect(payload.url).toBe(publicUrl);
  await expect(page.locator('.wedding-share-feedback')).toHaveText('공유창에서 카카오톡을 선택해 주세요.');
  await expect(page.locator('.wedding-sharing')).not.toContainText(/API|JavaScript|개발자|Client ID/);
});

test('the primary share action copies the link when device sharing is unavailable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('https://t1.kakaocdn.net/**', route => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '카카오톡으로 공유', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '청첩장 공유하기', exact: true }).click();
  await expect(page.locator('.wedding-share-feedback')).toHaveText('청첩장 링크를 복사했어요.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
  await expect(page.locator('.wedding-share-feedback')).not.toContainText(/전달되었습니다|전송 완료|공유 완료/);
});


test('the heart PNG scans at its actual displayed size on a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
  const image = dialog.getByRole('img', { name: '공개 청첩장으로 연결되는 QR 코드' });
  await expect(image).toBeVisible();
  const displayed = await image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const bounds = element.getBoundingClientRect();
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bounds.width); canvas.height = Math.round(bounds.height);
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fffef9'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
    return { png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  });
  expect(displayed.width).toBeLessThanOrEqual(300);
  expect(displayed.width).toBeGreaterThanOrEqual(235);
  expect(scanPng(displayed.png)).toBe(publicUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('canonical and longer invitation paths remain scannable when the heart is displayed small', async ({ page }) => {
  await page.goto('/#/admin');
  for (const url of ['https://hyunbeom-juyoung.pages.dev/', 'https://hyunbeom-juyoung.pages.dev/our-invitation/', `https://wedding.example/${'our-love-story/'.repeat(10)}`]) {
    const raster = await page.evaluate(async value => {
      const modulePath = '/src/lib/sharing.ts';
      const { invitationQr } = await import(modulePath);
      const image = new Image(); image.src = await invitationQr(value); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 252; canvas.height = 252;
      const context = canvas.getContext('2d')!; context.fillStyle = '#fffef9'; context.fillRect(0, 0, 252, 252); context.drawImage(image, 0, 0, 252, 252);
      return canvas.toDataURL('image/png');
    }, url);
    expect(scanPng(raster)).toBe(url);
  }
});
