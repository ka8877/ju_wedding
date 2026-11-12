export const defaultPublicSiteUrl = 'https://ka8877.github.io/ju_wedding/';

/** The public guest page is a directory URL, so sharing assets keep its base path. */
export function resolvePublicSiteUrl(value?: string): string {
  const raw = value?.trim();
  if (!raw) return defaultPublicSiteUrl;
  const invalid = () => new Error('VITE_PUBLIC_SITE_URL에는 관리자 경로·쿼리·해시가 없는 공개 청첩장의 HTTPS 주소를 입력해 주세요.');
  let url: URL;
  try { url = new URL(raw); } catch { throw invalid(); }
  const local = /^(localhost|0\.0\.0\.0|127(?:\.\d+){3}|\[::1\])$/.test(url.hostname) || url.hostname.endsWith('.localhost');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || raw.includes('?') || raw.includes('#') || local) throw invalid();
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { throw invalid(); }
  if (path.split('/').some(segment => /^(admin|setup)$/i.test(segment))) throw invalid();
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}
