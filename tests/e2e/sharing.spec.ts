import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';

const publicUrl = 'https://ka8877.github.io/ju_wedding/';

test('guests can scan, save and copy a real QR that points to the public invitation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const externalRequests: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5175') && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
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
  await page.getByRole('button', { name: '청첩장 공유하기', exact: true }).click();
  const shared = JSON.parse((await page.evaluate(() => sessionStorage.getItem('wedding-test-share')))!);
  expect(shared.url).toBe(publicUrl);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: '소중한 분께 전해요' })).toBeVisible();
  await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
  await expect(dialog.getByRole('link')).toHaveAttribute('href', publicUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
