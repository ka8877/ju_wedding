import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import jsQR from 'jsqr';
import { invitationQr, invitationUrl, publicInvitationUrl } from '../src/lib/sharing';

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
    'https://hyunbum-juyoung.pages.dev/',
  ])('generates an upright square QR for %s', async url => {
    const { PNG } = createRequire(import.meta.url)('pngjs') as {
      PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Uint8Array } } };
    };
    const image = await invitationQr(url);
    expect(image).toMatch(/^data:image\/png;base64,/);
    const { width, height, data } = PNG.sync.read(Buffer.from(image.split(',')[1], 'base64'));
    expect({ width, height }).toEqual({ width: 1536, height: 1536 });
    const scanned = jsQR(new Uint8ClampedArray(data), width, height);
    expect(scanned?.data).toBe(url);
    const { topLeftFinderPattern, topRightFinderPattern, bottomLeftFinderPattern } = scanned!.location;
    expect(topLeftFinderPattern.y).toBeCloseTo(topRightFinderPattern.y);
    expect(topLeftFinderPattern.x).toBeCloseTo(bottomLeftFinderPattern.x);
  });
});
