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
  ])('keeps a real, scannable code inside the heart for %s', async url => {
    const { pixels, width, height } = await invitationQrPixels(url);
    expect({ width, height }).toEqual({ width: 1024, height: 1024 });
    expect(jsQR(pixels, width, height)?.data).toBe(url);
    const alpha = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];
    // Transparent corners and the cleft between opaque lobes distinguish the
    // downloaded raster from a square QR styled with a CSS heart around it.
    expect([alpha(0, 0), alpha(1023, 0), alpha(0, 1023), alpha(1023, 1023), alpha(512, 90)]).toEqual([0, 0, 0, 0, 0]);
    expect([alpha(250, 120), alpha(774, 120), alpha(512, 950)]).toEqual([255, 255, 255]);
  });
});
