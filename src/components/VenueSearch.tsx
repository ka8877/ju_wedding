import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, LoaderCircle, MapPin, Search } from 'lucide-react';
import { naverMapClientId } from '../lib/integrations';
import { geocodeNaverAddresses, loadNaverMaps } from '../lib/naver-maps';
import type { Venue } from '../lib/types';
import { searchNaverPlaces } from '../lib/venue-search';
import type { VenueSearchResult } from '../lib/venue-search';

type SearchState = { status: 'idle' | 'loading' }
  | { status: 'done'; results: VenueSearchResult[] }
  | { status: 'error'; message: string };

function isStreetAddress(query: string): boolean {
  return /(?:로|길)\s*\d+(?:-\d+)?(?:\s|,|$)|(?:동|리|읍|면|가)\s+(?:산\s*)?\d+(?:-\d+)?(?:\s|,|$)/.test(query);
}

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

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!keyword || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setState({ status: 'loading' });
    const useGeocoding = clientId && isStreetAddress(keyword);
    try {
      const matches = useGeocoding
        ? await geocodeNaverAddresses(await loadNaverMaps(clientId), clientId, keyword, 5)
        : await searchNaverPlaces(keyword, controller.signal);
      if (pending.current === controller) setState({ status: 'done', results: matches.filter(match => match.address) });
    } catch (error) {
      if (pending.current === controller) setState({
        status: 'error', message: !useGeocoding && error instanceof Error
          ? error.message : '네이버 주소 검색에 연결되지 않았어요. 잠시 뒤에 다시 시도해 주세요.',
      });
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  }

  return <>
    <form className="editor-place-search" onSubmit={event => void search(event)} aria-busy={searching}>
      <label htmlFor={id}>예식 장소 찾기</label>
      <div>
        <Search size={18} aria-hidden="true" />
        <input id={id} placeholder="장소 이름 또는 도로명 주소" value={query}
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
    </form>
    {state.status === 'error' && <p className="editor-search-error" role="alert">{state.message}</p>}
    {state.status === 'done' && !state.results.length && <p className="editor-search-empty" role="status">
      일치하는 장소가 없어요. 지역명을 붙이거나 건물 번호까지 넣어 검색해 주세요.
    </p>}
    {state.status === 'done' && state.results.length > 0 && <ul className="editor-search-results" aria-label="네이버 검색 결과">
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
