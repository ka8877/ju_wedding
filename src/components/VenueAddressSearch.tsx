import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, LoaderCircle, MapPin, Search } from 'lucide-react';
import { naverMapClientId } from '../lib/integrations';
import { geocodeNaverAddresses, loadNaverMaps } from '../lib/naver-maps';
import type { NaverAddress } from '../lib/naver-maps';
import type { Venue } from '../lib/types';
import { getNaverPlaceSearchUrl } from '../lib/venue-map';

export default function VenueAddressSearch({ venue, onSelect }: { venue: Venue; onSelect: (address: NaverAddress) => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<NaverAddress[]>([]);
  const request = useRef(0);
  const clientId = naverMapClientId(venue.naverMapClientId);
  const keyword = query.trim();
  useEffect(() => () => { request.current += 1; }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!keyword || !clientId || status === 'searching') return;
    const revision = ++request.current;
    setStatus('searching');
    setResults([]);
    try {
      const sdk = await loadNaverMaps(clientId);
      if (revision !== request.current) return;
      const matches = await geocodeNaverAddresses(sdk, clientId, keyword, 5);
      if (revision !== request.current) return;
      setResults(matches.filter(match => match.address));
      setStatus('done');
    } catch {
      if (revision === request.current) setStatus('error');
    }
  }

  return <>
    <form className="editor-place-search" onSubmit={search}>
      <label htmlFor={id}>예식 장소 찾기</label>
      <div>
        <Search size={18} aria-hidden="true" />
        <input id={id} aria-describedby={`${id}-hint`} placeholder="장소 이름 또는 도로명 주소" value={query}
          onChange={event => { request.current += 1; setQuery(event.target.value); setResults([]); setStatus('idle'); }} maxLength={150} />
        <button type="submit" className="editor-button editor-button-primary" disabled={!clientId || !keyword || status === 'searching'}>
          {status === 'searching' ? <><LoaderCircle size={16} className="editor-spin" />검색 중</> : '주소 검색'}
        </button>
      </div>
      <a className="editor-naver-place-link" href={getNaverPlaceSearchUrl(keyword || venue.name)} target="_blank" rel="noreferrer">
        네이버 지도에서 장소 이름 검색<ArrowUpRight size={14} aria-hidden="true" />
      </a>
      <small id={`${id}-hint`}>네이버 지도에서 찾은 도로명 주소를 붙여넣고 주소 검색을 누르세요.</small>
    </form>
    {!clientId && <p className="editor-search-empty" role="status">네이버 지도에서 주소를 확인해 아래 주소 칸에 직접 입력할 수 있어요.</p>}
    {status === 'error' && <p className="editor-search-error" role="alert">네이버 주소 검색에 연결되지 않았어요. 네이버 지도에서 주소를 확인해 직접 입력해 주세요.</p>}
    {status === 'done' && !results.length && <p className="editor-search-empty" role="status">일치하는 주소가 없어요. 건물 번호까지 포함한 도로명 주소로 검색해 주세요.</p>}
    {results.length > 0 && <ul className="editor-search-results" aria-label="네이버 주소 검색 결과">
      {results.map((match, index) => <li key={`${match.address}:${index}`}>
        <button type="button" onClick={() => { onSelect(match); setResults([]); setStatus('idle'); }}>
          <MapPin size={18} aria-hidden="true" /><span><strong>{match.address}</strong></span><ArrowRight size={16} aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
  </>;
}
