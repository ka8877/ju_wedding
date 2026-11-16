import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';

function redact(value: string) {
  return value.replace(/([?&](?:auth|token|clientId|ncpKeyId|key)=)[^&\s"']+/gi, '$1[redacted]');
}

test('the deployed invitation displays actual Naver map tiles', async ({ page }, testInfo) => {
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#wedding-title')).toBeVisible();
    const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
    if (await skip.isVisible()) await skip.click();
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
