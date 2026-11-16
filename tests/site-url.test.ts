import { describe, expect, it } from 'vitest';
import { defaultPublicSiteUrl, resolvePublicSiteUrl } from '../src/lib/site-url';

describe('canonical public invitation URL', () => {
  it('uses the sole Cloudflare site when no canonical override is configured', () => {
    expect(defaultPublicSiteUrl).toBe('https://hyunbeom-juyoung.pages.dev/');
    for (const value of [undefined, '', '   ']) expect(resolvePublicSiteUrl(value)).toBe(defaultPublicSiteUrl);
  });

  it('validates explicit HTTPS roots and subpaths for sharing assets', () => {
    const cloudflare = resolvePublicSiteUrl(' https://wedding-example.pages.dev ');
    expect(cloudflare).toBe('https://wedding-example.pages.dev/');
    expect(new URL('invitation-share.png', cloudflare).href).toBe('https://wedding-example.pages.dev/invitation-share.png');
    const subpath = resolvePublicSiteUrl('https://wedding.example/invitation');
    expect(subpath).toBe('https://wedding.example/invitation/');
    expect(new URL('invitation-share.png', subpath).href).toBe('https://wedding.example/invitation/invitation-share.png');
  });

  it('rejects private, development and editor URLs instead of printing them into shared metadata', () => {
    for (const value of [
      'not a URL', 'http://wedding.example/', 'javascript:alert(1)',
      'https://user:password@wedding.example/', 'https://wedding.example/?token=private',
      'https://wedding.example/#/admin', 'https://wedding.example/#/setup',
      'https://wedding.example/?', 'https://wedding.example/#',
      'https://wedding.example/admin/', 'https://wedding.example/wedding/setup',
      'https://wedding.example/%61dmin/', 'https://wedding.example/%invalid/',
      'https://localhost/', 'https://127.0.0.1/', 'https://[::1]/',
      'https://wedding.localhost/', 'https://wedding.example:5173/',
    ]) expect(() => resolvePublicSiteUrl(value)).toThrow(/VITE_PUBLIC_SITE_URL/);
  });
});
