import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, LoaderCircle, MapPin, Search } from 'lucide-react';
import { naverMapClientId } from '../lib/integrations';
import { geocodeNaverAddresses, loadNaverMaps } from '../lib/naver-maps';
import type { Venue } from '../lib/types';
import { getNaverPlaceSearchUrl } from '../lib/venue-map';
import { searchNaverPlaces } from '../lib/venue-search';
import type { VenueSearchResult } from '../lib/venue-search';

type SearchKind = 'place' | 'address';
type SearchState = { status: 'idle' | 'loading' }
  | { status: 'done'; kind: SearchKind; results: VenueSearchResult[] }
  | { status: 'error'; message: string };

export default function VenueSearch({ venue, onSelect }: { venue: Venue; onSelect: (place: VenueSearchResult) => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const pending = useRef<AbortController | null>(null);
  const clientId = naverMapClientId(venue.naverMapClientId);
  const keyword = query.trim();
  const searching = state.status === 'loading';
  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  async function search(kind: SearchKind) {
    if (!keyword || pending.current || (kind === 'address' && !clientId)) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setState({ status: 'loading' });
    try {
      const matches = kind === 'place'
        ? await searchNaverPlaces(keyword, controller.signal)
        : await geocodeNaverAddresses(await loadNaverMaps(clientId), clientId, keyword, 5);
      if (pending.current === controller) setState({ status: 'done', kind, results: matches.filter(match => match.address) });
    } catch (error) {
      if (pending.current === controller) setState({ status: 'error', message: kind === 'place' && error instanceof Error
        ? error.message : '네이버 주소 검색에 연결되지 않았어요. 네이버 지도에서 주소를 확인해 직접 입력해 주세요.' });
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search('place');
  }

  return <>
    <form className="editor-place-search" onSubmit={onSubmit} aria-busy={searching}>
      <label htmlFor={id}>예식 장소 찾기</label>
      <div>
        <Search size={18} aria-hidden="true" />
        <input id={id} aria-describedby={`${id}-hint`} placeholder="장소 이름 또는 도로명 주소" value={query}
          onChange={event => {
            pending.current?.abort();
            pending.current = null;
            setQuery(event.target.value);
            setState({ status: 'idle' });
          }} maxLength={150} />
        <button type="submit" className="editor-button editor-button-primary" disabled={!keyword || searching}>
          {searching ? <><LoaderCircle size={16} className="editor-spin" aria-hidden="true" />검색 중</> : '장소 검색'}
        </button>
      </div>
      <small id={`${id}-hint`}>예식장 이름으로 찾고, 도로명 주소까지 확인한 뒤 결과를 선택하세요.</small>
      <nav className="editor-place-search-actions" aria-label="다른 검색 방법">
        <button className="editor-text-button" type="button" disabled={!clientId || !keyword || searching} onClick={() => void search('address')}>주소 검색</button>
        <a className="editor-naver-place-link" href={getNaverPlaceSearchUrl(keyword || venue.name)} target="_blank" rel="noreferrer">
          네이버 지도에서 장소 이름 검색<ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </nav>
    </form>
    {state.status === 'error' && <p className="editor-search-error" role="alert">{state.message}</p>}
    {state.status === 'done' && !state.results.length && <p className="editor-search-empty" role="status">
      {state.kind === 'place' ? '일치하는 장소가 없어요. 예식장 이름에 지역명을 붙여 다시 검색해 주세요.' : '일치하는 주소가 없어요. 건물 번호까지 포함한 도로명 주소로 검색해 주세요.'}
    </p>}
    {state.status === 'done' && state.results.length > 0 && <ul className="editor-search-results" aria-label={state.kind === 'place' ? '네이버 장소 검색 결과' : '네이버 주소 검색 결과'}>
      {state.results.map((match, index) => <li key={`${match.address}:${index}`}>
        <button type="button" onClick={() => { onSelect(match); setState({ status: 'idle' }); }}>
          <MapPin size={18} aria-hidden="true" />
          <span><strong>{match.name || match.address}</strong>{match.name && <small>{match.address}</small>}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
  </>;
}
