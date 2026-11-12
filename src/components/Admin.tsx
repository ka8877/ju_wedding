import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement, ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, CheckCircle2, ChevronDown, ExternalLink, Eye, Flower2, HelpCircle, ImagePlus, Images, LoaderCircle, LogOut, MapPin, Palette, Plus, Save, Search, Send, Smartphone, Trash2, Undo2, Redo2, UserRoundPlus, Wallet, X } from 'lucide-react';
import type { Account, Person, Venue, WeddingData } from '../lib/types';
import DesignEditor from './DesignEditor';
import BackupTools from './BackupTools';
import InvitationSharing from './InvitationSharing';
import '../styles/admin.css';

interface AdminProps {
  data: WeddingData;
  onChange: (data: WeddingData) => void;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onUpload: (file: File) => Promise<string>;
  saving: boolean;
  publishing: boolean;
  mode: 'cloud' | 'local';
  onLogout: () => void;
  lastSaved: string | null;
  preview: ReactNode;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isDirty?: boolean;
}

type Tab = 'basic' | 'photos' | 'venue' | 'accounts' | 'design';
interface PlaceResult { place_id: number; display_name: string; lat: string; lon: string; name?: string; }

const tabs = [
  { id: 'basic' as const, name: '기본 정보', subtitle: '두 분의 이야기', icon: CalendarDays },
  { id: 'photos' as const, name: '사진', subtitle: '함께한 순간', icon: Images },
  { id: 'venue' as const, name: '예식 장소', subtitle: '만나게 될 곳', icon: MapPin },
  { id: 'accounts' as const, name: '마음 전하실 곳', subtitle: '축하의 마음', icon: Wallet },
  { id: 'design' as const, name: '디자인', subtitle: '우리다운 분위기', icon: Palette },
];

const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, 'aria-describedby': hint ? `${id}-hint` : undefined }) : children;
  return <div className={`editor-field${wide ? ' editor-field-wide' : ''}`}><label htmlFor={id}>{label}</label>{control}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="editor-section-heading"><span className="editor-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>;
}

function PersonFields({ label, person, onChange }: { label: string; person: Person; onChange: (person: Person) => void }) {
  const field = (key: keyof Person, value: string) => onChange({ ...person, [key]: value });
  return <fieldset className="editor-person"><legend>{label}</legend><div className="editor-field-grid">
    <Field label={`${label} 이름`}><input value={person.name} onChange={e => field('name', e.target.value)} maxLength={30} autoComplete="off" /></Field>
    <Field label={`${label} 영문 이름`}><input value={person.englishName} onChange={e => field('englishName', e.target.value)} maxLength={50} autoComplete="off" /></Field>
    <Field label={`${label} 연락처`} hint="입력하면 청첩장에서 전화와 문자를 보낼 수 있어요." wide><input type="tel" value={person.phone} onChange={e => field('phone', e.target.value)} placeholder="010-0000-0000" maxLength={25} autoComplete="off" /></Field>
    <Field label={`${label} 아버님 성함`}><input value={person.father} onChange={e => field('father', e.target.value)} placeholder="선택 사항" maxLength={30} /></Field>
    <Field label={`${label} 어머님 성함`}><input value={person.mother} onChange={e => field('mother', e.target.value)} placeholder="선택 사항" maxLength={30} /></Field>
  </div></fieldset>;
}

export default function Admin({ data, onChange, onSave, onPublish, onUpload, saving, publishing, mode, onLogout, lastSaved, preview, onUndo, onRedo, canUndo = false, canRedo = false, isDirty = false }: AdminProps) {
  const [tab, setTab] = useState<Tab>('basic');
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string; title?: string; action?: 'save' | 'publish' } | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searched, setSearched] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const lastSearchAt = useRef(0);
  const previewRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) noticeRef.current?.focus({ preventScroll: true });
  }, [message]);
  useEffect(() => {
    if (!showPreview) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    previewRef.current?.querySelector<HTMLButtonElement>('.editor-preview-close')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPreview(false);
      if (event.key !== 'Tab') return;
      const focusable = previewRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [showPreview]);
  const busy = saving || publishing || actionPending || uploading || backupBusy;
  const completion = [Boolean(data.date && data.time), Boolean(data.coverPhoto), Boolean(data.venue.name && data.venue.address)].filter(Boolean).length;
  const update = <K extends keyof WeddingData>(key: K, value: WeddingData[K]) => onChange({ ...data, [key]: value });
  const updateVenue = (value: Partial<Venue>) => update('venue', { ...data.venue, ...value });
  function openPreview() {
    if (window.matchMedia('(max-width:1000px)').matches) setShowPreview(true);
    else previewRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  async function performAction(action: 'save' | 'publish') {
    if (busy) return;
    setActionPending(true); setMessage(null);
    try {
      await (action === 'save' ? onSave() : onPublish());
      const pending = [!data.date && '날짜', !data.time && '시간', (!data.venue.name.trim() || !data.venue.address.trim()) && '장소'].filter(Boolean);
      const pendingNote = pending.length ? `\n미정인 ${pending.join('·')} 정보는 준비 중으로 표시됩니다.` : '';
      setMessage({ kind: 'success', action, title: action === 'save' ? '초안을 저장했어요' : mode === 'local' ? '이 기기의 미리보기에 적용했어요' : '공개 반영을 확인했어요', text: mode === 'local'
        ? (action === 'save' ? '이 기기에 초안을 저장했어요. 공개 URL에는 반영되지 않습니다.' : `이 기기의 미리보기에 반영했어요. 공개 URL에는 반영되지 않습니다.${pendingNote}`)
        : (action === 'save' ? '초안을 안전하게 저장했어요. 준비되면 공개 청첩장에 반영해 주세요.' : `공개 청첩장에 반영했어요. 공개 화면에서 새 내용까지 확인했어요.${pendingNote}`) });
    } catch (error) {
      setMessage({ kind: 'error', action, title: action === 'save' ? '초안을 저장하지 못했어요' : mode === 'local' ? '미리보기에 적용하지 못했어요' : '공개 반영하지 못했어요', text: error instanceof Error ? error.message : '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' });
    } finally { setActionPending(false); }
  }

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>, cover: boolean) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || busy) return;
    setMessage(null);
    if (files.some(file => !imageTypes.includes(file.type))) {
      setMessage({ kind: 'error', text: 'JPG, PNG, WEBP, AVIF 사진을 선택해 주세요. 아이폰 HEIC 사진은 JPG로 변환해 주세요.' }); return;
    }
    if (files.some(file => file.size > 8 * 1024 * 1024)) {
      setMessage({ kind: 'error', text: '사진 한 장은 8MB까지 올릴 수 있어요. 크기를 줄인 뒤 다시 선택해 주세요.' }); return;
    }
    if (!cover && data.photos.length + files.length > 24) {
      setMessage({ kind: 'error', text: '함께한 순간은 최대 24장까지 담을 수 있어요.' }); return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) urls.push(await onUpload(file));
      if (cover) update('coverPhoto', urls[0]);
      else update('photos', [...data.photos, ...urls.map((url, i) => ({ id: crypto.randomUUID(), url, alt: `함께한 순간 ${data.photos.length + i + 1}` }))]);
      setMessage({ kind: 'success', text: '사진을 추가했어요. 초안을 저장하고 공개 반영하면 청첩장에도 보여요.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '사진을 올리지 못했어요. 다시 시도해 주세요.' });
    } finally { setUploading(false); }
  }

  function movePhoto(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= data.photos.length) return;
    const photos = [...data.photos];
    [photos[index], photos[target]] = [photos[target], photos[index]];
    update('photos', photos);
  }

  async function searchPlaces(event: FormEvent) {
    event.preventDefault();
    const query = placeQuery.trim();
    if (!query || searching) return;
    if (Date.now() - lastSearchAt.current < 1100) { setSearchError('잠시 뒤에 다시 검색해 주세요.'); return; }
    lastSearchAt.current = Date.now();
    searchRequest.current?.abort();
    const controller = new AbortController(); searchRequest.current = controller;
    setSearching(true); setSearchError(''); setResults([]); setSearched(false);
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '1', limit: '5', countrycodes: 'kr', 'accept-language': 'ko' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error('장소 검색이 잠시 쉬고 있어요. 아래에서 주소를 직접 입력해 주세요.');
      const matches = await response.json() as PlaceResult[];
      setResults(matches.filter(place => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon))));
      setSearched(true);
    } catch (error) {
      setSearchError(error instanceof Error && error.name !== 'AbortError' ? error.message : '검색에 시간이 걸리고 있어요. 도로명 주소로 다시 검색하거나 직접 입력해 주세요.');
    } finally { window.clearTimeout(timeout); setSearching(false); }
  }

  function choosePlace(place: PlaceResult) {
    updateVenue({ name: place.name || data.venue.name, address: place.display_name, lat: Number(place.lat), lng: Number(place.lon) });
    setResults([]); setSearched(false); setMessage({ kind: 'success', text: '장소를 선택했어요. 예식장 이름과 주소를 한 번 더 확인해 주세요.' });
  }

  function updateAccount(id: string, value: Partial<Account>) {
    update('accounts', data.accounts.map(account => account.id === id ? { ...account, ...value } : account));
  }

  const mapReady = data.venue.lat !== null && data.venue.lng !== null && Number.isFinite(data.venue.lat) && Number.isFinite(data.venue.lng) && Math.abs(data.venue.lat) <= 90 && Math.abs(data.venue.lng) <= 180;
  const mapUrl = mapReady ? `https://www.openstreetmap.org/export/embed.html?bbox=${data.venue.lng! - 0.006},${data.venue.lat! - 0.004},${data.venue.lng! + 0.006},${data.venue.lat! + 0.004}&layer=mapnik&marker=${data.venue.lat},${data.venue.lng}` : '';

  return <div className="admin-app">
    <header className="editor-topbar"><a className="editor-brand" href="#/" aria-label="공개 청첩장 보기"><Flower2 size={25} strokeWidth={1.3} /><span>our beginning<span>WEDDING STUDIO</span></span></a><div className="editor-topbar-actions"><div className="editor-history-actions"><button className="editor-text-button" aria-label="실행 취소" title="실행 취소" disabled={!canUndo || busy} onClick={onUndo}><Undo2 size={16} /><span>실행 취소</span></button><button className="editor-text-button" aria-label="다시 실행" title="다시 실행" disabled={!canRedo || busy} onClick={onRedo}><Redo2 size={16} /><span>다시 실행</span></button></div><a className="editor-setup-link" href="#/setup" target="_blank" rel="noreferrer" aria-label="연결 안내" title="연결 안내를 새 탭에서 열기"><HelpCircle size={15} /><span>연결 안내</span><small>관리자 추가 · 처음 연결</small></a><a className="editor-text-button" aria-label="청첩장 보기" href="#/" target="_blank" rel="noreferrer"><ExternalLink size={15} /><span>청첩장 보기</span></a><button className="editor-text-button" onClick={onLogout} aria-label={mode === 'cloud' ? '로그아웃' : '나가기'}><LogOut size={15} /><span>{mode === 'cloud' ? '로그아웃' : '나가기'}</span></button></div></header>
    <div className="editor-shell">
      <div className="editor-welcome"><div><span className="editor-eyebrow">FOR YOUR BEAUTIFUL BEGINNING</span><h1>우리의 초대장을<br className="editor-mobile-break" /> 만드는 곳<span> .</span></h1><p>두 분만의 이야기를, 가장 다정한 방식으로 전해요.</p></div><span className="editor-studio-tag"><span /> {mode === 'cloud' ? '우리의 웨딩 스튜디오' : '미리보기 스튜디오'}</span></div>
      <ol className="editor-quick-guide" aria-label="청첩장 꾸미기 순서"><li><b>01</b>기본 정보</li><li><b>02</b>추천 스타일</li><li><b>03</b>미리보기</li><li><b>04</b>초안 저장 · 공개 반영</li></ol>
      {mode === 'local' && <div className="editor-local-banner"><Eye size={20} /><div><strong>편안하게 먼저 꾸며 보세요.</strong><p>이 기기에만 저장되는 미리보기입니다. 사진과 수정 내용은 다른 기기나 공개 사이트에 반영되지 않습니다.</p></div></div>}
      <div className="editor-workspace">
        <aside className="editor-sidebar"><nav aria-label="청첩장 편집 메뉴">{tabs.map(({ id, name, subtitle, icon: Icon }, index) => <button key={id} aria-label={name} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)} className={`editor-tab ${tab === id ? 'active' : ''}`}><Icon size={19} strokeWidth={1.5} /><span><strong>{name}</strong><small>{subtitle}</small></span><span className="editor-tab-index">0{index + 1}</span></button>)}</nav><a className="editor-setup-card" href="#/setup" target="_blank" rel="noreferrer" aria-label="관리자 추가·연결 안내" title="관리자 추가·연결 안내를 새 탭에서 열기"><UserRoundPlus size={19} strokeWidth={1.4} /><span><strong>관리자 추가·연결 안내</strong><small>가족과 함께 꾸미거나 처음 연결할 때</small></span><ExternalLink size={14} /></a><div className="editor-progress"><Flower2 size={26} strokeWidth={1.1} /><p>천천히, 우리답게.</p><span>사진 · 날짜 · 장소 중 {completion}개 준비됐어요</span><div role="progressbar" aria-label="주요 정보 준비" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={3}><i style={{ width: `${completion / 3 * 100}%` }} /></div><small>비워 둔 정보는 준비 중으로 보여요.</small></div></aside>
        <main className="editor-main" id="editor-main">
          <fieldset className="editor-content-fieldset" disabled={busy}>
          {tab === 'basic' && <div className="editor-panel"><SectionHeading eyebrow="01 / OUR STORY" title="우리의 이야기가 시작되는 곳" description="아직 정해지지 않은 내용은 비워 두어도 괜찮아요." /><PersonFields label="신랑" person={data.groom} onChange={person => update('groom', person)} /><PersonFields label="신부" person={data.bride} onChange={person => update('bride', person)} /><div className="editor-section"><h3>소중한 날</h3><div className="editor-field-grid"><Field label="예식 날짜"><input type="date" value={data.date} onChange={e => update('date', e.target.value)} /></Field><Field label="예식 시간" hint="한국 시간 기준으로 표시해요."><input type="time" value={data.time} onChange={e => update('time', e.target.value)} /></Field></div></div><div className="editor-section"><h3>초대의 말</h3><Field label="초대 문구" hint="줄바꿈도 청첩장에 그대로 담겨요."><textarea rows={7} value={data.invitation} onChange={e => update('invitation', e.target.value)} maxLength={2000} /></Field><Field label="마무리 인사"><textarea rows={3} value={data.closing} onChange={e => update('closing', e.target.value)} maxLength={1000} /></Field></div></div>}
          {tab === 'photos' && <div className="editor-panel"><SectionHeading eyebrow="02 / OUR MOMENTS" title="우리, 가장 빛나는 순간" description="사진 한 장으로 두 분의 분위기가 완성돼요." /><div className="editor-section editor-section-first"><div className="editor-inline-heading"><h3>첫 화면 사진</h3><span>JPG · PNG · WEBP · AVIF / 최대 8MB</span></div><input ref={coverInput} className="editor-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="첫 화면 사진 파일 선택" onChange={event => void uploadPhotos(event, true)} />{data.coverPhoto ? <div className="editor-cover-photo"><img src={data.coverPhoto} alt="첫 화면 사진 미리보기" /><div><button className="editor-button editor-button-white" onClick={() => coverInput.current?.click()}><ImagePlus size={16} />사진 바꾸기</button><button className="editor-photo-remove" onClick={() => update('coverPhoto', '')} aria-label="첫 화면 사진 삭제"><Trash2 size={17} /></button></div></div> : <button className="editor-upload-zone" onClick={() => coverInput.current?.click()}><span><ImagePlus size={30} strokeWidth={1.2} /></span><strong>첫 장에 담을 사진을 선택해 주세요</strong><small>세로 사진이 가장 예쁘게 어울려요</small><em>사진 선택하기 <Plus size={14} /></em></button>}<p className="editor-help">사진이 없어도 준비된 일러스트와 함께 청첩장이 예쁘게 보여요.</p></div><div className="editor-section"><div className="editor-inline-heading"><h3>함께한 순간 <span className="editor-count">{data.photos.length}/24</span></h3><button className="editor-text-button" onClick={() => galleryInput.current?.click()} disabled={data.photos.length >= 24}><Plus size={16} />사진 추가</button></div><input ref={galleryInput} className="editor-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple aria-label="갤러리 사진 파일 선택" onChange={event => void uploadPhotos(event, false)} />{data.photos.length === 0 ? <button className="editor-gallery-empty" onClick={() => galleryInput.current?.click()}><Images size={26} strokeWidth={1.1} /><span>기억하고 싶은 순간들을 담아 주세요.</span><small>여러 장을 한 번에 선택할 수 있어요</small></button> : <div className="editor-photo-grid">{data.photos.map((photo, index) => <div className="editor-photo-card" key={photo.id}><img src={photo.url} alt={photo.alt} /><div className="editor-photo-controls"><span>{String(index + 1).padStart(2, '0')}</span><button aria-label={`${index + 1}번 사진 앞으로 이동`} disabled={index === 0} onClick={() => movePhoto(index, -1)}><ArrowUp size={15} /></button><button aria-label={`${index + 1}번 사진 뒤로 이동`} disabled={index === data.photos.length - 1} onClick={() => movePhoto(index, 1)}><ArrowDown size={15} /></button><button aria-label={`${index + 1}번 사진 삭제`} onClick={() => update('photos', data.photos.filter(item => item.id !== photo.id))}><Trash2 size={15} /></button></div><input aria-label={`${index + 1}번 사진 설명`} value={photo.alt} onChange={e => update('photos', data.photos.map(item => item.id === photo.id ? { ...item, alt: e.target.value } : item))} maxLength={120} /></div>)}</div>}</div></div>}
          {tab === 'venue' && <div className="editor-panel"><SectionHeading eyebrow="03 / THE PLACE" title="우리의 시작을 함께할 곳" description="장소를 찾아 선택하면 지도와 주소가 함께 담겨요." /><form className="editor-place-search" onSubmit={event => void searchPlaces(event)}><label htmlFor="place-search">예식 장소 검색</label><div><Search size={18} /><input id="place-search" placeholder="예식장 이름 또는 도로명 주소" value={placeQuery} onChange={e => setPlaceQuery(e.target.value)} maxLength={150} /><button className="editor-button editor-button-primary" disabled={searching || !placeQuery.trim()}>{searching ? <LoaderCircle size={16} className="editor-spin" /> : '검색'}</button></div><small>국내 장소를 검색해요. 검색되지 않으면 아래에서 직접 입력해 주세요.</small><small className="editor-map-attribution">장소 검색: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap 참여자</a></small></form>{searchError && <p role="alert" className="editor-search-error">{searchError}</p>}{searched && results.length === 0 && <p className="editor-search-empty" role="status">일치하는 장소가 없어요. 도로명 주소로 검색하거나 직접 입력해 주세요.</p>}{results.length > 0 && <ul className="editor-search-results" aria-label="장소 검색 결과">{results.map(place => <li key={place.place_id}><button onClick={() => choosePlace(place)}><MapPin size={18} /><span><strong>{place.name || '검색한 장소'}</strong><small>{place.display_name}</small></span><ArrowRight size={16} /></button></li>)}</ul>}<div className="editor-section"><div className="editor-field-grid"><Field label="예식장 이름"><input value={data.venue.name} onChange={e => updateVenue({ name: e.target.value })} placeholder="예식장 또는 교회 이름" maxLength={100} /></Field><Field label="홀 · 층"><input value={data.venue.hall} onChange={e => updateVenue({ hall: e.target.value })} placeholder="예: 2층 그랜드홀" maxLength={100} /></Field><Field label="주소" hint="주소를 직접 바꾸면 기존 지도 위치가 초기화돼요. 다시 검색해 선택하거나 지도 위치를 입력해 주세요." wide><input value={data.venue.address} onChange={e => updateVenue({ address: e.target.value, lat: null, lng: null })} placeholder="정확한 도로명 주소" maxLength={300} /></Field></div></div><div className="editor-map-preview">{mapReady ? <iframe title="선택한 예식장 지도" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" /> : <div><MapPin size={30} strokeWidth={1.1} /><strong>선택한 장소가 여기에 보여요</strong><span>검색 결과에서 장소를 선택해 주세요</span></div>}</div><details className="editor-map-details"><summary>지도 위치 직접 입력하기 <ChevronDown size={15} /></summary><p>검색에 없는 장소는 지도 서비스에서 확인한 위도·경도를 입력해 주세요. 지도 핀이 실제 위치와 맞는지 꼭 확인해 주세요.</p><div className="editor-field-grid"><Field label="위도"><input type="number" step="any" min="-90" max="90" placeholder="예: 37.5665" value={data.venue.lat ?? ''} onChange={e => updateVenue({ lat: e.target.value === '' ? null : Number(e.target.value) })} /></Field><Field label="경도"><input type="number" step="any" min="-180" max="180" placeholder="예: 126.9780" value={data.venue.lng ?? ''} onChange={e => updateVenue({ lng: e.target.value === '' ? null : Number(e.target.value) })} /></Field></div></details><div className="editor-section"><h3>오시는 길 안내</h3><Field label="대중교통"><textarea rows={3} value={data.venue.transport} onChange={e => updateVenue({ transport: e.target.value })} placeholder="지하철역, 출구, 버스 등 하객분들께 안내해 주세요." maxLength={1500} /></Field><Field label="주차 안내"><textarea rows={3} value={data.venue.parking} onChange={e => updateVenue({ parking: e.target.value })} placeholder="주차 위치와 무료 주차 시간을 안내해 주세요." maxLength={1000} /></Field></div></div>}
          {tab === 'accounts' && <div className="editor-panel"><SectionHeading eyebrow="04 / WITH LOVE" title="마음을 전하는 방법" description="필요한 계좌만 담아 주세요. 비워 두면 청첩장에 표시되지 않아요." /><div className="editor-account-tip"><Wallet size={19} /><p>공개 반영 전에 예금주와 계좌번호를 꼭 확인해 주세요.<br />입력한 계좌는 청첩장 방문자에게 공개됩니다.</p></div><div className="editor-accounts">{data.accounts.map((account, index) => <div className="editor-account-card" key={account.id}><div className="editor-inline-heading"><h3>계좌 {index + 1}</h3><button className="editor-text-button editor-delete" onClick={() => update('accounts', data.accounts.filter(item => item.id !== account.id))} aria-label={`계좌 ${index + 1} 삭제`}><Trash2 size={15} />삭제</button></div><div className="editor-field-grid"><Field label={`계좌 ${index + 1} 구분`}><select value={account.side} onChange={e => updateAccount(account.id, { side: e.target.value as Account['side'] })}><option value="groom">신랑측</option><option value="bride">신부측</option></select></Field><Field label={`계좌 ${index + 1} 은행`}><input value={account.bank} onChange={e => updateAccount(account.id, { bank: e.target.value })} placeholder="은행 이름" maxLength={30} /></Field><Field label={`계좌 ${index + 1} 예금주`}><input value={account.holder} onChange={e => updateAccount(account.id, { holder: e.target.value })} placeholder="예금주 성함" maxLength={30} /></Field><Field label={`계좌 ${index + 1} 계좌번호`}><input inputMode="numeric" value={account.number} onChange={e => updateAccount(account.id, { number: e.target.value })} placeholder="계좌번호 입력" maxLength={40} /></Field></div></div>)}</div><button className="editor-add-account" onClick={() => update('accounts', [...data.accounts, { id: crypto.randomUUID(), side: 'bride', bank: '', number: '', holder: '' }])} disabled={data.accounts.length >= 12}><Plus size={18} />계좌 추가하기</button>{data.accounts.length === 0 && <p className="editor-help">신랑·신부뿐 아니라 부모님 계좌도 함께 추가할 수 있어요.</p>}</div>}
          {tab === 'design' && <div className="editor-panel"><DesignEditor data={data} onChange={onChange} onPreview={openPreview} /><BackupTools data={data} onChange={onChange} onUpload={onUpload} mode={mode} disabled={busy} onBusyChange={setBackupBusy} /></div>}
          </fieldset>
          <InvitationSharing names={`${data.groom.name} · ${data.bride.name}`} variant="admin" localPreview={mode === 'local'} />
          <div className="editor-bottom-navigation">{tab !== 'basic' ? <button className="editor-text-button" onClick={() => setTab(tabs[tabs.findIndex(item => item.id === tab) - 1].id)}><ArrowLeft size={15} />이전</button> : <span />}{tab !== 'design' && <button className="editor-text-button" onClick={() => setTab(tabs[tabs.findIndex(item => item.id === tab) + 1].id)}>다음 단계<ArrowRight size={15} /></button>}</div>
        </main>
        <aside ref={previewRef} role={showPreview ? 'dialog' : undefined} aria-modal={showPreview ? true : undefined} className={`editor-preview${showPreview ? ' editor-preview-open' : ''}`} aria-label="청첩장 실시간 미리보기"><div className="editor-preview-heading"><span><Smartphone size={16} />실시간 미리보기</span><button className="editor-preview-close" onClick={() => setShowPreview(false)} aria-label="미리보기 닫기"><X size={20} /></button></div><div className="editor-phone-frame"><div className="editor-phone-notch" /><div className="editor-phone-content">{preview}</div></div><p>수정한 내용이 바로 보여요.<br />하객에게 공개하려면 아래 버튼을 눌러 주세요.</p></aside>
      </div>
    </div>
    <footer className="editor-savebar">
      {message && <div ref={noticeRef} tabIndex={-1} role={message.kind === 'error' ? 'alert' : 'status'} className={`editor-notice ${message.kind}`} onKeyDown={event => { if (event.key === 'Escape') setMessage(null); }}>
        {message.kind === 'success' ? <CheckCircle2 size={19} /> : <span>!</span>}
        <div className="editor-notice-content">{message.title && <strong>{message.title}</strong>}<p>{message.text}</p>{message.kind === 'success' && message.action === 'publish' && mode === 'cloud' && <a className="editor-notice-link" href="#/" target="_blank" rel="noreferrer">공개 청첩장 확인<ExternalLink size={13} /></a>}</div>
        <button aria-label="알림 닫기" onClick={() => setMessage(null)}><X size={17} /></button>
      </div>}
      <div className="editor-savebar-inner"><div className="editor-savebar-meta">
        {mode === 'local' && <p className="editor-local-fixednote">이 기기에만 저장 · 공개 URL에는 반영되지 않아요</p>}
        <div className="editor-save-status">{publishing ? <><LoaderCircle size={15} className="editor-spin" />{mode === 'cloud' ? '공개 청첩장의 새 내용을 확인하고 있어요…' : '이 기기의 미리보기에 적용하고 있어요…'}</> : saving ? <><LoaderCircle size={15} className="editor-spin" />초안을 안전하게 저장하고 있어요…</> : uploading ? <><LoaderCircle size={15} className="editor-spin" />사진을 담는 중이에요…</> : <><span className="editor-status-dot" /><span>{isDirty ? '저장하지 않은 변경이 있어요' : lastSaved ? `${new Date(lastSaved).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 ${mode === 'local' ? '이 기기에 ' : ''}저장됨` : '수정한 내용을 저장해 주세요'}</span></>}</div>
      </div><div className="editor-save-actions"><button className="editor-button editor-preview-button" aria-label="미리보기" onClick={openPreview}><Eye size={17} /><span>미리보기</span></button><button className="editor-button editor-button-outline" disabled={busy} onClick={() => void performAction('save')}>{saving ? <LoaderCircle size={16} className="editor-spin" /> : <Save size={16} />}<span>{saving ? '초안 저장 중…' : '초안 저장'}</span></button><button className="editor-button editor-button-primary" disabled={busy} onClick={() => void performAction('publish')}>{publishing ? <LoaderCircle size={16} className="editor-spin" /> : <Send size={16} />}<span>{publishing ? mode === 'cloud' ? '공개 확인 중…' : '미리보기 적용 중…' : mode === 'cloud' ? '공개 청첩장에 반영' : '미리보기에 적용'}</span></button></div></div>
    </footer>
  </div>;
}
