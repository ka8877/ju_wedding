import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { invitationQrPixels, invitationUrl, publicInvitationUrl } from '../src/lib/sharing';

describe('guest invitation links', () => {
  it('shares the canonical Cloudflare site from live, preview and retired addresses', () => {
    expect(publicInvitationUrl).toBe('https://hyunbeom-juyoung.pages.dev/');
    for (const href of [
      'https://hyunbeom-juyoung.pages.dev/?tracking=private#/admin',
      'https://ka8877.github.io/ju_wedding/?token=private#/admin',
      'https://branch-preview.hyunbeom-juyoung.pages.dev/#/setup',
      'https://wedding.example/couple/?tracking=123#/setup',
    ]) expect(invitationUrl(href)).toBe(publicInvitationUrl);
  });

  it('never directs another phone to a development server or a private preview', () => {
    for (const host of ['localhost', '127.0.0.1', '127.0.1.1', '0.0.0.0', '[::1]', 'wedding.localhost']) {
      expect(invitationUrl(`http://${host}:5175/?draft=true#/admin`)).toBe(publicInvitationUrl);
    }
    expect(invitationUrl('https://preview.example/secret/#/admin', true)).toBe(publicInvitationUrl);
    for (const invalid of ['javascript:alert(1)', 'data:text/plain,test', 'not a URL', 'https://user:password@wedding.example/']) {
      expect(invitationUrl(invalid)).toBe(publicInvitationUrl);
    }
  });

  it.each([
    'https://hyunbeom-juyoung.pages.dev/',
    'https://hyunbeom-juyoung.pages.dev/our-invitation/',
    `https://wedding.example/${'our-love-story/'.repeat(10)}`,
  ])('encodes a scannable QR whose dark module field forms a heart for %s', async url => {
    const { pixels, width, height } = await invitationQrPixels(url);
    expect({ width, height }).toEqual({ width: 1536, height: 1536 });
    const decoded = jsQR(pixels, width, height);
    expect(decoded?.data).toBe(url);
    const QRCode = await import('qrcode');
    const highCorrection = QRCode.create(url, { errorCorrectionLevel: 'H' });
    const reference = highCorrection.modules.size > 45 ? QRCode.create(url, { errorCorrectionLevel: 'M' }) : highCorrection;
    const corners = decoded!.location;
    let changedFunctionModules = 0;
    for (let row = 0; row < reference.modules.size; row += 1) {
      for (let column = 0; column < reference.modules.size; column += 1) {
        if (!reference.modules.isReserved(row, column)) continue;
        // Use the scanner's independently detected symbol geometry to inspect
        // every functional module, including alignment patterns near the cleft.
        const u = (column + 0.5) / reference.modules.size, v = (row + 0.5) / reference.modules.size;
        const x = Math.floor(corners.topLeftCorner.x + (corners.topRightCorner.x - corners.topLeftCorner.x) * u + (corners.bottomLeftCorner.x - corners.topLeftCorner.x) * v);
        const y = Math.floor(corners.topLeftCorner.y + (corners.topRightCorner.y - corners.topLeftCorner.y) * u + (corners.bottomLeftCorner.y - corners.topLeftCorner.y) * v);
        const dark = pixels[(y * width + x) * 4] < 80;
        if (dark !== Boolean(reference.modules.get(row, column))) changedFunctionModules += 1;
      }
    }
    expect(changedFunctionModules).toBe(0);
    const countDark = (left: number, top: number, right: number, bottom: number) => {
      let count = 0;
      for (let y = Math.floor(top * height); y < bottom * height; y += 1) {
        for (let x = Math.floor(left * width); x < right * width; x += 1) {
          const offset = (y * width + x) * 4;
          if (pixels[offset] < 80 && pixels[offset + 1] < 80 && pixels[offset + 2] < 80) count += 1;
        }
      }
      return count;
    };
    // The pattern, rather than a decorative outline around a square, fills both
    // upper lobes and the tapered point while leaving the cleft and corners blank.
    expect(countDark(0.12, 0.09, 0.4, 0.2)).toBeGreaterThan(1000);
    expect(countDark(0.6, 0.09, 0.88, 0.2)).toBeGreaterThan(1000);
    expect(countDark(0.42, 0.83, 0.58, 0.95)).toBeGreaterThan(1000);
    expect(countDark(0.47, 0.02, 0.53, 0.12)).toBe(0);
    expect(countDark(0, 0, 0.1, 0.1)).toBe(0);
    expect(countDark(0.9, 0.9, 1, 1)).toBe(0);
    // No colored heart border/paper can pass as the requested module silhouette.
    let hasPaperFrame = false;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset] !== 255 && pixels[offset] !== 31) { hasPaperFrame = true; break; }
    }
    expect(hasPaperFrame).toBe(false);
  });
});
