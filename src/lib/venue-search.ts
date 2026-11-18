import { supabase } from './storage';
import type { Venue } from './types';

export type VenueSearchResult = Pick<Venue, 'address' | 'lat' | 'lng'> & { name?: string };

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
    throw new Error('네이버 장소 검색에 연결되지 않았어요. 잠시 뒤에 다시 시도해 주세요.');
  });
  if (response.status === 401 || response.status === 403) throw new Error(loginMessage);
  if (response.status === 503) throw new Error('네이버 지역 검색 연결이 필요해요. 주소 검색이나 네이버 지도에서 찾기를 이용해 주세요.');
  if (response.status === 429) throw new Error('네이버 장소 검색의 이용 한도에 도달했어요. 주소 검색이나 네이버 지도에서 찾기를 이용해 주세요.');
  if (!response.ok) throw new Error('네이버 장소 검색에 연결되지 않았어요. 잠시 뒤에 다시 시도해 주세요.');
  const body = await response.json().catch(() => null) as { results?: VenueSearchResult[] } | null;
  if (!Array.isArray(body?.results)) throw new Error('네이버 장소 검색 결과를 읽지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
  return body.results;
}
