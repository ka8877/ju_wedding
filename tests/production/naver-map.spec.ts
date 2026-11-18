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

test('the deployed invitation plays the garden film, loads Naver tiles and shows a scannable QR', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
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
      const proof = { started: 0, ended: 0, maxVideoTime: 0, duration: 0, decodedFrame: false, filmEnded: false, nameRevealTime: 0, media: '' };
      (window as Window & { invitationOpeningProof?: typeof proof }).invitationOpeningProof = proof;
      const sample = () => {
        const cover = document.querySelector<HTMLDialogElement>('.invite-opening');
        if (cover?.open) {
          if (!proof.started) proof.started = performance.now();
          proof.media = cover.dataset.openingMedia || '';
          const film = cover.querySelector<HTMLVideoElement>('.invite-opening-film');
          if (film) {
            proof.maxVideoTime = Math.max(proof.maxVideoTime, film.currentTime);
            if (Number.isFinite(film.duration)) proof.duration = film.duration;
            proof.decodedFrame ||= film.readyState >= 2 && film.currentTime > 1;
            proof.filmEnded ||= film.ended;
            if (!proof.nameRevealTime && cover.dataset.namesVisible === 'true' && film.currentTime > 0) proof.nameRevealTime = film.currentTime;
          }
        } else if (proof.started && !proof.ended) proof.ended = performance.now();
        // Navigation and public-data loading can precede the film by many
        // seconds. Observe until actual dismissal; the test bounds its lifetime.
        if (!proof.ended) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    // Use the actual shared URL and reload the same tab, including with the
    // browser's reduced-motion preference. A forced replay query would conceal
    // either automatic bypass of the requested full entrance.
    for (const visit of ['initial', 'reload', 'reduced-motion'] as const) {
      if (visit === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
      if (visit === 'initial') await page.goto('/', { waitUntil: 'domcontentloaded' });
      else await page.reload({ waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(visit === 'reduced-motion');
      await expect(page.locator('#wedding-title')).toBeVisible();
      await expect(page.locator('.invite-opening')).toBeVisible();
      await expect(page.locator('.invite-opening-door, .invite-opening-seal')).toHaveCount(0);
      await expect.poll(() => page.locator('video.invite-opening-film').evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 16_000 }).toBeGreaterThanOrEqual(8.2);
      await page.screenshot({ path: testInfo.outputPath(visit === 'initial' ? 'entrance-garden.png' : `entrance-garden-${visit}.png`) });
      await expect(page.locator('.invite-opening')).toHaveCount(0, { timeout: 22_000 });
      await expect.poll(() => page.evaluate(() => (window as Window & { invitationOpeningProof?: { ended: number } }).invitationOpeningProof?.ended || 0)).toBeGreaterThan(0);
      const proof = await page.evaluate(() => (window as Window & { invitationOpeningProof?: { started: number; ended: number; maxVideoTime: number; duration: number; decodedFrame: boolean; filmEnded: boolean; nameRevealTime: number; media: string } }).invitationOpeningProof);
      expect(proof).toBeDefined();
      expect(proof!.ended - proof!.started).toBeGreaterThanOrEqual(10_000);
      expect(proof!.media).toBe('video');
      expect(proof!.duration).toBeGreaterThan(10);
      expect(proof!.maxVideoTime).toBeGreaterThan(10);
      expect(proof!.maxVideoTime).toBeCloseTo(proof!.duration, 1);
      expect(proof!.decodedFrame).toBe(true);
      expect(proof!.filmEnded).toBe(true);
      expect(proof!.nameRevealTime).toBeGreaterThanOrEqual(7.4);
      console.log(`Production entrance proof (${visit}):`, JSON.stringify(proof));
    }
    await expect(page.locator('.invite-footer-mark strong')).toHaveText(/^Hyunbum\s*&/);
    const fontFamilies: Record<string, string> = { serif: 'Noto Serif KR', sans: 'Noto Sans KR', romantic: 'Gowun Batang', myeongjo: 'Nanum Myeongjo', handwriting: 'Nanum Pen Script', 'clear-handwriting': 'Gaegu' };
    const selectedFont = (await page.locator('.invitation').getAttribute('data-font'))!;
    const expectedFamily = fontFamilies[selectedFont];
    expect(expectedFamily).toBeTruthy();
    for (const selector of ['#wedding-title', '.invite-korean-names', '.invite-hero-date', '.invite-letter-copy', '.invite-calendar-grid > span', '.invite-outline-button', '.invite-footer-mark strong', '.invite-music-toggle']) {
      const text = page.locator(selector).first();
      if (await text.count()) expect(await text.evaluate(element => getComputedStyle(element).fontFamily)).toContain(expectedFamily);
    }
    console.log('Production typography proof:', JSON.stringify({ selectedFont, family: expectedFamily, titleBodyDateButtons: true }));
    await page.screenshot({ path: testInfo.outputPath('invitation-mobile.png') });
    await page.locator('[data-section="location"]').scrollIntoViewIfNeeded();
    await expect(map).toHaveAttribute('data-map-provider', 'naver');
    await expect(map).toHaveAttribute('data-map-state', 'ready', { timeout: 25_000 });
    await expect(map.getByRole('region')).toBeVisible();
    await expect.poll(() => map.evaluate(element => [...element.querySelectorAll('img')].some(image => {
      return image.complete && image.naturalWidth >= 128 && image.naturalHeight >= 128
        && /(?:naver\.com|pstatic\.net)/.test(image.src) && !/logo|marker|control/i.test(image.src);
    })), { timeout: 15_000, message: 'At least one real Naver tile must load; an empty ready container is insufficient.' }).toBe(true);
    await expect(map.locator('.venue-map-pin--venue')).toContainText('HD현대글로벌R&D센터');
    if (selectedFont === 'handwriting' || selectedFont === 'clear-handwriting') {
      const action = page.getByRole('link', { name: '네이버 지도 열기', exact: true });
      const label = action.locator('> span:nth-child(2)');
      expect(await label.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(selectedFont === 'handwriting' ? 19 : 17);
      expect(await action.locator('small').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
      expect(await label.evaluate(element => getComputedStyle(element).fontFamily)).toContain(expectedFamily);
      console.log('Production map-label readability proof: selected handwritten family and readable label sizes.');
    }
    await page.locator('[data-section="location"]').screenshot({ path: testInfo.outputPath('naver-map.png') });
    await page.getByRole('button', { name: 'QR 코드 보기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '마음을 담은 초대' });
    expect(await dialog.getByRole('heading').evaluate(element => getComputedStyle(element).fontFamily)).toContain(expectedFamily);
    expect(await dialog.getByRole('button', { name: 'QR 이미지 저장', exact: true }).evaluate(element => getComputedStyle(element).fontFamily)).toContain(expectedFamily);
    const image = dialog.getByRole('img', { name: '공개 청첩장으로 연결되는 QR 코드' });
    await expect(image).toBeVisible();
    const pngBytes = Buffer.from((await image.getAttribute('src'))!.split(',')[1], 'base64');
    const png = PNG.sync.read(pngBytes);
    expect(png.width).toBe(1536);
    expect(png.height).toBe(1536);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe('https://hyunbum-juyoung.pages.dev/');
    expect(decoded!.location.topLeftFinderPattern.y).toBeCloseTo(decoded!.location.topRightFinderPattern.y);
    await writeFile(testInfo.outputPath('invitation-qr.png'), pngBytes);
    await dialog.screenshot({ path: testInfo.outputPath('qr.png') });
    console.log('Production square QR proof: 1536px, canonical URL decoded.');
  } finally {
    const state = await page.evaluate(() => {
      const node = document.querySelector('.venue-map');
      const sdk = (window as Window & { naver?: { maps?: { Map?: unknown; Service?: { geocode?: unknown }; jsContentLoaded?: boolean } } }).naver?.maps;
      return {
        openingProof: (window as Window & { invitationOpeningProof?: unknown }).invitationOpeningProof,
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
