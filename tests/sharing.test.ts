import { describe, expect, it } from 'vitest';
import { invitationQr, invitationUrl, publicInvitationUrl } from '../src/lib/sharing';

describe('guest invitation links', () => {
  it('removes editor routes and tracking queries while preserving the deployed base path', () => {
    expect(invitationUrl('https://ka8877.github.io/ju_wedding/?token=private#/admin')).toBe('https://ka8877.github.io/ju_wedding/');
    expect(invitationUrl('https://wedding.example/couple/?tracking=123#/setup')).toBe('https://wedding.example/couple/');
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

  it('generates a downloadable 1024 pixel PNG locally', async () => {
    const qr = await invitationQr(publicInvitationUrl);
    expect(qr).toMatch(/^data:image\/png;base64,/);
    const file = Buffer.from(qr.split(',')[1], 'base64');
    expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(file.readUInt32BE(16)).toBe(1024);
    expect(file.readUInt32BE(20)).toBe(1024);
  });
});
