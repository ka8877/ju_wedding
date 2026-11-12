import { useCallback, useEffect, useState } from 'react';
import { Camera, Check, Download, LoaderCircle, RefreshCw, UsersRound } from 'lucide-react';
import { downloadRsvpsCsv, listGuestPhotos, listRsvps } from '../lib/guest-storage';
import type { GuestPhotoRecord, RsvpRecord } from '../lib/guest-types';
import { guestTimestamp } from './GuestCommon';

const mealLabels = { yes: '식사 예정', no: '식사 안 함', undecided: '식사 미정' };
const shuttleLabels = { none: '버스 이용 안 함', daejeon: '대전 버스', gyeongju: '경주 버스' };

export default function GuestManagement() {
  const [tab, setTab] = useState<'rsvp' | 'photos'>('rsvp');
  const [side, setSide] = useState<'all' | 'groom' | 'bride'>('all');
  const [records, setRecords] = useState<RsvpRecord[] | null>(null);
  const [photos, setPhotos] = useState<GuestPhotoRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [csvError, setCsvError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setErrors([]);
    const results = await Promise.allSettled([listRsvps(), listGuestPhotos()]);
    const nextErrors: string[] = [];
    if (results[0].status === 'fulfilled') setRecords(results[0].value); else { setRecords(null); nextErrors.push(results[0].reason instanceof Error ? results[0].reason.message : '참석 응답을 불러오지 못했어요.'); }
    if (results[1].status === 'fulfilled') setPhotos(results[1].value); else { setPhotos(null); nextErrors.push(results[1].reason instanceof Error ? results[1].reason.message : '현장 사진을 불러오지 못했어요.'); }
    setErrors([...new Set(nextErrors)]); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = records?.filter(record => side === 'all' || record.side === side) ?? [];
  const attending = records?.filter(record => record.attending).reduce((sum, record) => sum + record.guests, 0);
  const meals = records?.filter(record => record.attending && record.meal === 'yes').reduce((sum, record) => sum + record.guests, 0);
  function download() {
    if (!records) return;
    setCsvError('');
    try { downloadRsvpsCsv(filtered); } catch (e) { setCsvError(e instanceof Error ? e.message : '파일을 만들지 못했어요.'); }
  }
  return <section className="guest-management editor-panel">
    <header className="guest-management-heading"><span>OUR GUESTS, OUR MEMORIES</span><h2>함께해 주시는 마음</h2><p>하객의 참석 응답과 현장 사진을 이곳에서 확인해요.<br />이 화면의 응답과 사진은 관리자에게만 보입니다.</p></header>
    <div className="guest-management-toolbar"><div className="guest-management-tabs" role="group" aria-label="하객 자료 종류"><button type="button" aria-pressed={tab === 'rsvp'} onClick={() => setTab('rsvp')}><UsersRound size={16} />참석 응답</button><button type="button" aria-pressed={tab === 'photos'} onClick={() => setTab('photos')}><Camera size={16} />현장 사진</button></div><button type="button" className="guest-manager-button" disabled={loading} onClick={() => void load()}>{loading ? <LoaderCircle size={15} className="app-spin" /> : <RefreshCw size={15} />}새로고침</button></div>
    {loading && <p className="guest-manager-status" role="status">하객 자료를 확인하고 있어요.</p>}
    {errors.length > 0 && <div className="guest-manager-error" role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}
    {tab === 'rsvp' && <>
      <div className="guest-stats"><div><span>불러온 응답</span><strong>{records ? records.length : '—'}<small>건</small></strong></div><div><span>참석 예정</span><strong>{attending ?? '—'}<small>명</small></strong></div><div><span>식사 예정</span><strong>{meals ?? '—'}<small>명</small></strong></div></div>
      <div className="guest-manager-filter"><label>하객 구분<select value={side} onChange={event => setSide(event.target.value as typeof side)}><option value="all">전체</option><option value="groom">신랑측</option><option value="bride">신부측</option></select></label><button type="button" className="guest-manager-button" disabled={!records || !filtered.length || loading} onClick={download}><Download size={15} />엑셀용 파일 저장</button></div>
      <p className="guest-manager-help">최근 응답을 최대 5,000건 불러옵니다. 저장한 파일은 엑셀에서 열 수 있어요. 선택한 하객 구분의 응답이 담깁니다.</p>
      {csvError && <p className="guest-manager-error" role="alert">{csvError}</p>}
      {records && filtered.length === 0 && !loading && <div className="guest-manager-empty"><UsersRound size={26} strokeWidth={1.2} /><p>{records.length ? '선택한 구분의 응답이 아직 없어요.' : '아직 전달받은 참석 응답이 없어요.'}</p></div>}
      <div className="guest-records">{filtered.map(record => <article className="guest-record" key={record.id}><header><div><span>{record.side === 'groom' ? '신랑측' : '신부측'}</span><h3>{record.name}</h3></div><span className={`guest-attendance ${record.attending ? 'guest-attendance--yes' : ''}`}>{record.attending ? <><Check size={13} />본인 포함 {record.guests}명 참석</> : '참석 어려움'}</span></header><dl>{record.phone && <div><dt>연락처</dt><dd><a href={`tel:${record.phone.replace(/[^\d+]/g, '')}`}>{record.phone}</a></dd></div>}{record.attending && <><div><dt>식사</dt><dd>{mealLabels[record.meal]}</dd></div><div><dt>대절버스</dt><dd>{shuttleLabels[record.shuttle]}</dd></div></>}<div><dt>응답 일시</dt><dd>{guestTimestamp(record.createdAt)}</dd></div></dl>{record.message && <p className="guest-record-message guest-preserve">{record.message}</p>}</article>)}</div>
    </>}
    {tab === 'photos' && <><p className="guest-manager-help">하객이 전달한 사진을 최대 500장까지 불러옵니다. 사진은 공개 갤러리와 별도로 보관되며, 사진 열기 링크가 만료되면 새로고침해 주세요.</p>{photos && !photos.length && !loading && <div className="guest-manager-empty"><Camera size={28} strokeWidth={1.2} /><p>아직 전달받은 현장 사진이 없어요.</p></div>}<div className="guest-photo-records">{photos?.map(photo => <article className="guest-photo-record" key={photo.id}>{photo.downloadUrl ? <a href={photo.downloadUrl} target="_blank" rel="noreferrer" aria-label={`${photo.fileName} 사진 열기`}><img src={photo.downloadUrl} alt={photo.guestName ? `${photo.guestName}님이 전달한 현장 사진` : '하객이 전달한 현장 사진'} loading="lazy" /></a> : <div className="guest-photo-unavailable"><Camera size={28} /><span>미리보기 연결을 확인해 주세요.</span></div>}<div><strong>{photo.guestName || '마음을 보내주신 하객'}</strong><span>{photo.fileName}</span><small>{guestTimestamp(photo.createdAt)}</small>{photo.downloadUrl && <a href={photo.downloadUrl} target="_blank" rel="noreferrer"><Download size={13} />사진 열기</a>}</div></article>)}</div></>}
  </section>;
}
