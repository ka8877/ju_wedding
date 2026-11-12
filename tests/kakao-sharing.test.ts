import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareKakaoInvitation } from '../src/lib/kakao-sharing';

afterEach(() => vi.unstubAllGlobals());

describe('optional native Kakao invitation sharing', () => {
  it('shares only the guest page and the correct image base path', async () => {
    const init = vi.fn(), sendDefault = vi.fn();
    vi.stubGlobal('window', { Kakao: { init, isInitialized: () => false, Share: { sendDefault } } });
    await shareKakaoInvitation('a'.repeat(32), '조현범 · 권주영', 'https://hyunbeom-juyoung.pages.dev/');
    expect(init).toHaveBeenCalledWith('a'.repeat(32));
    expect(sendDefault).toHaveBeenCalledWith(expect.objectContaining({
      objectType: 'feed', content: expect.objectContaining({
        imageUrl: 'https://hyunbeom-juyoung.pages.dev/invitation-share.png',
        link: { mobileWebUrl: 'https://hyunbeom-juyoung.pages.dev/', webUrl: 'https://hyunbeom-juyoung.pages.dev/' },
      }),
    }));
    await shareKakaoInvitation('a'.repeat(32), '두 사람', 'https://ka8877.github.io/ju_wedding/');
    expect(sendDefault.mock.calls[1][0].content.imageUrl).toBe('https://ka8877.github.io/ju_wedding/invitation-share.png');
  });
  it('does not initialize or share malformed keys, editor routes or tracking URLs', async () => {
    const init = vi.fn(), sendDefault = vi.fn();
    vi.stubGlobal('window', { Kakao: { init, isInitialized: () => true, Share: { sendDefault } } });
    await expect(shareKakaoInvitation('not-a-key', '두 사람', 'https://example.com/')).rejects.toThrow(/JavaScript/);
    for (const url of ['https://example.com/#/admin', 'https://example.com/?token=private', 'javascript:alert(1)']) {
      await expect(shareKakaoInvitation('a'.repeat(32), '두 사람', url)).rejects.toThrow(/HTTPS/);
    }
    expect(init).not.toHaveBeenCalled(); expect(sendDefault).not.toHaveBeenCalled();
  });
});
