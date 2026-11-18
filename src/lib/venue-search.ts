import { supabase } from './storage';
import type { Venue } from './types';

export type VenueSearchResult = Pick<Venue, 'address' | 'lat' | 'lng'> & { name?: string };

const searchErrors: Record<string, string> = {
  admin_check_failed: '관리자 권한을 확인하는 서버에 연결되지 않았어요.',
  naver_unconfigured: '네이버 지역 검색 연결이 필요해요.',
  naver_auth_failed: '네이버 지역 검색 인증에 실패했어요.',
  naver_limit: '네이버 장소 검색의 이용 한도에 도달했어요.',
  naver_connection_failed: '네이버 지역 검색 서버에 연결되지 않았어요.',
  naver_unavailable: '네이버가 장소 검색 요청에 오류를 반환했어요.',
  naver_invalid_response: '네이버 장소 검색 응답을 읽지 못했어요.',
};

export async function searchNaverPlaces(query: string, signal: AbortSignal): Promise<VenueSearchResult[]> {
  const loginMessage = '네이버 장소 검색은 운영 페이지의 관리자 로그인 후 사용할 수 있어요.';
  if (!supabase) throw new Error(loginMessage);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error(loginMessage);

  const response = await fetch('/api/venue-search', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }).catch(() => {
    throw new Error('검색 서버에 연결되지 않았어요. 잠시 뒤에 다시 시도해 주세요.');
  });
  if (response.status === 401 || response.status === 403) throw new Error(loginMessage);
  const body = await response.json().catch(() => null) as { results?: VenueSearchResult[]; error?: string; upstreamStatus?: number } | null;
  if (!response.ok) {
    const code = body?.error && Object.hasOwn(searchErrors, body.error) ? body.error : '';
    const status = Number.isInteger(body?.upstreamStatus) ? body!.upstreamStatus : response.status;
    const message = code ? searchErrors[code] : '장소 검색 서버가 응답하지 않았어요.';
    throw new Error(`${message} (${status}${code ? ` · ${code}` : ''})`);
  }
  if (!Array.isArray(body?.results)) throw new Error('네이버 장소 검색 결과를 읽지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
  return body.results;
}
