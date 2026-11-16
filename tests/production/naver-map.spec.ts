import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';

const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Uint8Array } } };
};

function redact(value: string) {
  return value.replace(/([?&](?:auth|token|clientId|ncpKeyId|key)=)[^&\s"']+/gi, '$1[redacted]');
}

test('the deployed invitation shows gradual doors, actual Naver tiles and a scannable heart QR', async ({ page }, testInfo) => {
  const events: { kind: string; message: string }[] = [];
  const isMapHost = (value: string) => {
    try { return /(?:^|\.)(?:naver\.com|pstatic\.net)$/.test(new URL(value).hostname); }
    catch { return false; }
  };
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') events.push({ kind: message.type(), message: redact(message.text()) });
  });
  page.on('pageerror', error => events.push({ kind: 'pageerror', message: redact(error.message) }));
  page.on('requestfailed', request => {
    if (isMapHost(request.url())) events.push({ kind: 'requestfailed', message: `${redact(request.url())}: ${request.failure()?.errorText}` });
  });
  page.on('response', response => {
    if (isMapHost(response.url()) && (response.status() >= 400 || response.url().includes('/maps.js'))) {
      const url = new URL(response.url());
      events.push({ kind: 'response', message: `${response.status()} ${url.origin}${url.pathname}` });
    }
  });
  const map = page.locator('[data-section="location"] .venue-map');
  try {
    await page.addInitScript(() => {
      const proof = { started: 0, ended: 0, holdStarted: 0, holdEnded: 0, moved: false };
      (window as Window & { invitationOpeningProof?: typeof proof }).invitationOpeningProof = proof;
      const sample = () => {
        const cover = document.querySelector<HTMLDialogElement>('.invite-opening');
        if (cover?.open) {
          if (!proof.started) proof.started = performance.now();
          if (cover.dataset.openingState === 'holding') {
            if (!proof.holdStarted) proof.holdStarted = performance.now();
            proof.holdEnded = performance.now();
          }
          const door = cover.querySelector('.invite-opening-door');
          if (door) {
            const matrix = new DOMMatrix(getComputedStyle(door).transform);
            if (Math.abs(matrix.m13) > .1 && Math.abs(matrix.m13) < .99) proof.moved = true;
          }
        } else if (proof.started && !proof.ended) proof.ended = performance.now();
        if (!proof.ended && performance.now() < 20_000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#wedding-title')).toBeVisible();
    await expect(page.locator('.invite-opening')).toBeVisible();
    await expect(page.locator('.invite-opening')).toHaveCount(0, { timeout: 12_000 });
    await expect.poll(() => page.evaluate(() => (window as Window & { invitationOpeningProof?: { ended: number } }).invitationOpeningProof?.ended || 0)).toBeGreaterThan(0);
    const proof = await page.evaluate(() => (window as Window & { invitationOpeningProof?: { started: number; ended: number; holdStarted: number; holdEnded: number; moved: boolean } }).invitationOpeningProof);
    expect(proof).toBeDefined();
    expect(proof!.ended - proof!.started).toBeGreaterThanOrEqual(4900);
    expect(proof!.holdEnded - proof!.holdStarted).toBeGreaterThanOrEqual(1200);
    expect(proof!.moved).toBe(true);
    console.log('Production entrance proof:', JSON.stringify({ elapsed: proof!.ended - proof!.started, held: proof!.holdEnded - proof!.holdStarted, movingDoors: proof!.moved }));
    await page.locator('[data-section="location"]').scrollIntoViewIfNeeded();
    await expect(map).toHaveAttribute('data-map-provider', 'naver');
    await expect(map).toHaveAttribute('data-map-state', 'ready', { timeout: 25_000 });
    await expect(map.getByRole('region')).toBeVisible();
    await expect.poll(() => map.evaluate(element => [...element.querySelectorAll('img')].some(image => {
      return image.complete && image.naturalWidth >= 128 && image.naturalHeight >= 128
        && /(?:naver\.com|pstatic\.net)/.test(image.src) && !/logo|marker|control/i.test(image.src);
    })), { timeout: 15_000, message: 'At least one real Naver tile must load; an empty ready container is insufficient.' }).toBe(true);
    await expect(map.locator('.venue-map-pin--venue')).toContainText('HD현대글로벌R&D센터');
    await page.locator('[data-section="location"]').screenshot({ path: testInfo.outputPath('naver-map.png') });
    await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
    const image = dialog.getByRole('img', { name: '공개 청첩장으로 연결되는 QR 코드' });
    await expect(image).toBeVisible();
    const pngBytes = Buffer.from((await image.getAttribute('src'))!.split(',')[1], 'base64');
    const png = PNG.sync.read(pngBytes);
    expect(png.width).toBe(1536);
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe('https://hyunbeom-juyoung.pages.dev/');
    await writeFile(testInfo.outputPath('invitation-heart-qr.png'), pngBytes);
    await dialog.screenshot({ path: testInfo.outputPath('heart-qr.png') });
    console.log('Production heart QR proof: 1536px, canonical URL decoded.');
  } finally {
    const state = await page.evaluate(() => {
      const node = document.querySelector('.venue-map');
      const sdk = (window as Window & { naver?: { maps?: { Map?: unknown; Service?: { geocode?: unknown }; jsContentLoaded?: boolean } } }).naver?.maps;
      return {
        mapState: node?.getAttribute('data-map-state'),
        sdk: { map: typeof sdk?.Map, geocode: typeof sdk?.Service?.geocode, jsContentLoaded: sdk?.jsContentLoaded },
        images: [...(node?.querySelectorAll('img') || [])].map(image => ({
          path: (() => { try { const url = new URL(image.src); return url.origin + url.pathname; } catch { return ''; } })(),
          width: image.naturalWidth, height: image.naturalHeight, complete: image.complete,
        })),
      };
    }).catch(() => ({ unavailable: true }));
    const diagnostics = { state, events };
    const path = testInfo.outputPath('map-diagnostics.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(diagnostics, null, 2));
    console.log('Production Naver diagnostics:', JSON.stringify(diagnostics));
    await testInfo.attach('map-diagnostics', { path, contentType: 'application/json' });
    await page.locator('[data-section="location"]').screenshot({ path: testInfo.outputPath('naver-map-final.png'), timeout: 3000 }).catch(() => {});
  }
});
