import { resolvePublicSiteUrl } from './site-url';

interface KakaoSharePayload {
  objectType: 'feed';
  content: { title: string; description: string; imageUrl: string; link: { mobileWebUrl: string; webUrl: string } };
  buttons: { title: string; link: { mobileWebUrl: string; webUrl: string } }[];
}
interface KakaoSdk {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Share: { sendDefault: (payload: KakaoSharePayload) => unknown };
}
declare global { interface Window { Kakao?: KakaoSdk } }

// Pinned official SDK; a public JavaScript key and registered web domains are required.
export const kakaoSdkUrl = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';
let loading: Promise<KakaoSdk> | undefined;

export function loadKakaoSdk(): Promise<KakaoSdk> {
  if (window.Kakao?.Share) return Promise.resolve(window.Kakao);
  if (loading) return loading;
  loading = new Promise<KakaoSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = kakaoSdkUrl; script.async = true; script.crossOrigin = 'anonymous';
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('카카오톡 공유를 준비하지 못했어요. 링크 복사로 전해 주세요.')); };
    const timer = window.setTimeout(fail, 10_000);
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      if (window.Kakao?.Share) resolve(window.Kakao); else fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}

export async function shareKakaoInvitation(key: string, names: string, href: string): Promise<void> {
  if (!/^[a-f\d]{32}$/i.test(key)) throw new Error('카카오톡 공유를 준비하지 못했어요.');
  const url = resolvePublicSiteUrl(href);
  const sdk = await loadKakaoSdk();
  if (!sdk.isInitialized()) sdk.init(key);
  const link = { mobileWebUrl: url, webUrl: url };
  await sdk.Share.sendDefault({
    objectType: 'feed',
    content: { title: `${names}의 결혼식`, description: '소중한 당신을 초대합니다.', imageUrl: new URL('invitation-share.png', url).href, link },
    buttons: [{ title: '청첩장 보기', link }],
  });
}
