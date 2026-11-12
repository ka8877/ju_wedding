import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Heart, LoaderCircle, Send } from 'lucide-react';
import type { WeddingData } from '../lib/types';
import { submitRsvp } from '../lib/guest-storage';
import type { RsvpInput, RsvpReceipt } from '../lib/guest-types';
import { GuestDialog, useGuestCapabilities } from './GuestCommon';

const meals = { yes: '식사 예정', no: '식사 안 함', undecided: '미정' };
const shuttles = { none: '이용 안 함', daejeon: '대전', gyeongju: '경주' };

export default function GuestRsvp({ data, preview = false }: { data: WeddingData; preview?: boolean }) {
  const options = data.guestFeatures.rsvp;
  const { capabilities, loading, reload } = useGuestCapabilities(preview);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<RsvpInput['side'] | ''>('');
  const [attending, setAttending] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(1);
  const [meal, setMeal] = useState<RsvpInput['meal']>('undecided');
  const [shuttle, setShuttle] = useState<RsvpInput['shuttle']>('none');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ record: RsvpInput; confirmation: RsvpReceipt } | null>(null);
  const formId = useId();
  const requestToken = useRef<string | null>(null);
  const ready = capabilities?.status === 'ready' && capabilities.rsvpEnabled;
  const intro = side === 'groom' ? options.groomMessage : side === 'bride' ? options.brideMessage : '신랑측 또는 신부측을 먼저 선택해 주세요.';
  function close() {
    if (busy) return;
    setOpen(false); requestToken.current = null; setReceipt(null); setSide(''); setName(''); setPhone(''); setMessage(''); setConsent(false); setAttending(true); setGuests(1); setMeal('undecided'); setShuttle('none'); setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || preview || !side) return;
    if (!ready) { setError('지금은 응답을 전달할 수 없어요. 조금 뒤 다시 확인해 주세요.'); return; }
    const record: RsvpInput = { side, attending, name: name.trim(), phone: phone.trim(), guests: attending ? guests : 0, meal: attending ? meal : 'undecided', shuttle: attending ? shuttle : 'none', message: message.trim(), consent };
    setBusy(true); setError('');
    try { const confirmation = await submitRsvp(record, requestToken.current ??= crypto.randomUUID()); setReceipt({ record, confirmation }); }
    catch (e) { setError(e instanceof Error ? e.message : '응답을 전달하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <div className="guest-public-block guest-rsvp">
    <Heart size={26} strokeWidth={1.15} aria-hidden="true" />
    <p className="guest-intro">함께해 주실 마음을 미리 전해 주세요.<br />소중한 분들을 맞이하는 데 큰 도움이 됩니다.</p>
    <button className="guest-action" type="button" disabled={!preview && (!ready || loading)} onClick={() => { requestToken.current = crypto.randomUUID(); setOpen(true); }}>
      {loading && !preview ? <LoaderCircle size={16} className="app-spin" /> : <Send size={15} />} {preview ? '참석 응답 미리보기' : '참석 여부 전하기'}
    </button>
    {preview ? <p className="guest-status">미리보기에서는 응답을 전송하지 않아요.</p>
      : !ready && <div className="guest-status" role="status"><p>{loading ? '접수 상태를 확인하고 있어요.' : capabilities?.status === 'offline' ? '잠시 연결이 어려워요. 조금 뒤 다시 확인해 주세요.' : capabilities?.status === 'ready' ? '지금은 참석 응답을 받고 있지 않아요.' : '참석 응답 접수를 준비하고 있어요.'}</p>{!loading && capabilities?.status === 'offline' && <button type="button" className="guest-retry" onClick={() => void reload()}>다시 확인</button>}</div>}
    <p className="guest-footnote">{options.note}</p>
    <GuestDialog open={open} onClose={close} title={receipt ? '전달되었습니다' : options.title || '참석 여부 전하기'} busy={busy}>
      {receipt ? <div className="guest-receipt">
        <span className="guest-success-mark"><Check size={27} /></span>
        <p>작성해 주신 내용을 신랑·신부에게<br />잘 전달했어요. 마음 전해 주셔서 감사합니다.</p>
        <dl className="guest-receipt-details">
          <div><dt>구분</dt><dd>{receipt.record.side === 'groom' ? '신랑측' : '신부측'}</dd></div>
          <div><dt>성함</dt><dd>{receipt.record.name}</dd></div>
          <div><dt>참석 여부</dt><dd>{receipt.record.attending ? '참석합니다' : '참석이 어려워요'}</dd></div>
          {receipt.record.attending && <><div><dt>참석 인원</dt><dd>본인 포함 {receipt.record.guests}명</dd></div><div><dt>식사</dt><dd>{meals[receipt.record.meal]}</dd></div><div><dt>대절버스</dt><dd>{shuttles[receipt.record.shuttle]}</dd></div></>}
          {receipt.record.phone && <div><dt>연락처</dt><dd>{receipt.record.phone}</dd></div>}
          {receipt.record.message && <div><dt>전하신 말씀</dt><dd className="guest-preserve">{receipt.record.message}</dd></div>}
        </dl>
        <button type="button" className="guest-action guest-action--solid" onClick={close}>닫기</button>
      </div> : <form className="guest-form" onSubmit={event => void submit(event)}>
        {preview && <p className="guest-preview-note">미리보기 화면이에요. 작성한 내용은 전송되지 않아요.</p>}
        <fieldset disabled={busy}>
          <legend>어느 분의 하객이신가요?</legend>
          <div className="guest-side-options"><button type="button" aria-pressed={side === 'groom'} onClick={() => setSide('groom')}>신랑측</button><button type="button" aria-pressed={side === 'bride'} onClick={() => setSide('bride')}>신부측</button></div>
          <p className="guest-side-message guest-preserve" aria-live="polite">{intro}</p>
          <div className="guest-field"><label htmlFor={`${formId}-name`}>성함</label><input id={`${formId}-name`} name="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={60} required placeholder="성함을 입력해 주세요" /></div>
          <div className="guest-field"><span>참석 여부</span><div className="guest-radio-options"><label><input type="radio" name={`${formId}-attending`} checked={attending} onChange={() => setAttending(true)} />참석합니다</label><label><input type="radio" name={`${formId}-attending`} checked={!attending} onChange={() => setAttending(false)} />참석이 어려워요</label></div></div>
          {attending && <><div className="guest-form-grid"><div className="guest-field"><label htmlFor={`${formId}-guests`}>참석 인원 · 본인 포함</label><select id={`${formId}-guests`} value={guests} onChange={e => setGuests(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}명</option>)}</select></div><div className="guest-field"><label htmlFor={`${formId}-meal`}>식사 여부</label><select id={`${formId}-meal`} value={meal} onChange={e => setMeal(e.target.value as RsvpInput['meal'])}><option value="undecided">미정</option><option value="yes">식사 예정</option><option value="no">식사 안 함</option></select></div></div>
          {data.guestFeatures.shuttle.enabled && <div className="guest-field"><label htmlFor={`${formId}-shuttle`}>대절버스 이용 의사</label><select id={`${formId}-shuttle`} value={shuttle} onChange={e => setShuttle(e.target.value as RsvpInput['shuttle'])}><option value="none">이용하지 않아요</option><option value="daejeon">대전 출발</option><option value="gyeongju">경주 출발</option></select><small>탑승 장소와 시간은 대절버스 안내를 확인해 주세요.</small></div>}</>}
          <div className="guest-field"><label htmlFor={`${formId}-phone`}>연락처 <small>선택</small></label><input id={`${formId}-phone`} type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} placeholder="010-0000-0000" /><small>참석 확인 연락을 받으실 번호를 남겨 주세요.</small></div>
          <div className="guest-field"><label htmlFor={`${formId}-message`}>함께 오시는 분 · 전하실 말씀 <small>선택</small></label><textarea id={`${formId}-message`} value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={500} placeholder="동행하시는 분이나 전하고 싶은 이야기를 남겨 주세요" /></div>
          <p className="guest-privacy-note">이름과 연락처 등 응답 내용은 신랑·신부만 확인하며, 예식 준비와 참석 확인에 사용됩니다.</p>
          <label className="guest-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />위 안내에 따라 응답 내용을 전달하는 데 동의합니다.</label>
        </fieldset>
        {error && <p className="guest-form-error" role="alert">{error}</p>}
        <button type="submit" className="guest-action guest-action--solid" disabled={busy || !side || preview || !ready}>{busy ? <LoaderCircle size={16} className="app-spin" /> : <Send size={15} />}{busy ? '전달하고 있어요…' : '전달하기'}</button>
        <p className="guest-footnote">{options.note}</p>
      </form>}
    </GuestDialog>
  </div>;
}
