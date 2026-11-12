import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import type { WeddingData } from '../lib/types';
import { uploadGuestPhoto } from '../lib/guest-storage';
import type { GuestPhotoReceipt } from '../lib/guest-types';
import { GuestDialog, guestDateLabel, useGuestCapabilities } from './GuestCommon';

const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export default function GuestSnap({ data, preview = false }: { data: WeddingData; preview?: boolean }) {
  const options = data.guestFeatures.snap;
  const { capabilities, loading, reload } = useGuestCapabilities(preview);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [guestName, setGuestName] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<GuestPhotoReceipt[]>([]);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const formId = useId();
  const ready = capabilities?.status === 'ready' && capabilities.snapEnabled && capabilities.snapOpen;
  const opening = guestDateLabel(capabilities?.snapOpenDate || options.openDate || data.date);
  function close() {
    if (busy) return;
    setOpen(false); setFiles([]); setGuestName(''); setConsent(false); setError(''); setConfirmed([]); setFinished(false); setProgress({ sent: 0, total: 0 });
  }
  function selectFiles(selected: File[]) {
    setError('');
    if (selected.length > 5) { setError('사진은 한 번에 5장까지 선택해 주세요.'); return; }
    if (selected.some(file => !allowedImages.includes(file.type))) { setError('JPG, PNG, WebP, AVIF 사진을 선택해 주세요. 아이폰 HEIC는 JPG로 변환해 주세요.'); return; }
    if (selected.some(file => file.size === 0 || file.size > 8 * 1024 * 1024)) { setError('사진 한 장은 8MB 이하로 선택해 주세요. 비어 있는 파일은 전송할 수 없어요.'); return; }
    setFiles(selected);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (preview || busy || !files.length) return;
    if (!ready) { setError('지금은 사진을 전달할 수 없어요. 접수 상태를 다시 확인해 주세요.'); return; }
    const selected = [...files];
    setBusy(true); setError(''); setProgress({ sent: 0, total: selected.length });
    let sent = 0;
    try {
      for (const file of selected) {
        const receipt = await uploadGuestPhoto(file, guestName.trim());
        sent += 1; setConfirmed(items => [...items, receipt]); setProgress({ sent, total: selected.length });
      }
      setFiles([]); setFinished(true);
    } catch (e) {
      setFiles(selected.slice(sent));
      const message = e instanceof Error ? e.message : '사진 전달 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
      setError(sent ? `${sent}장은 전달됐어요. 남은 ${selected.length - sent}장은 다시 전달해 주세요.\n${message}` : message);
    } finally { setBusy(false); }
  }
  let status = '';
  if (!preview && !ready) {
    if (loading) status = '사진 접수 상태를 확인하고 있어요.';
    else if (capabilities?.status === 'offline') status = '잠시 연결이 어려워요. 조금 뒤 다시 확인해 주세요.';
    else if (capabilities?.status === 'ready' && capabilities.snapEnabled && !capabilities.snapOpen) status = `${opening}부터 사진을 올릴 수 있어요.`;
    else if (capabilities?.status === 'ready' && !capabilities.snapEnabled) status = '지금은 사진을 받고 있지 않아요.';
    else status = `사진 접수를 준비하고 있어요. ${opening}부터 함께해 주세요.`;
  }
  return <div className="guest-public-block guest-snap">
    <Camera size={28} strokeWidth={1.15} aria-hidden="true" />
    <p className="guest-intro guest-preserve">{options.message || '여러분의 시선에 담긴 오늘을\n저희에게 선물해 주세요.'}</p>
    <button type="button" className="guest-action" disabled={!preview && (!ready || loading)} onClick={() => setOpen(true)}>{loading && !preview ? <LoaderCircle size={16} className="app-spin" /> : <Camera size={16} />}{preview ? '사진 올리기 미리보기' : '현장 사진 올리기'}</button>
    {preview ? <p className="guest-status">미리보기에서는 사진을 전송하지 않아요.</p> : status && <div className="guest-status" role="status"><p>{status}</p>{capabilities?.status === 'offline' && !loading && <button className="guest-retry" type="button" onClick={() => void reload()}>다시 확인</button>}</div>}
    <p className="guest-footnote">사진은 신랑·신부만 확인할 수 있어요.</p>
    <GuestDialog open={open} onClose={close} title={finished ? '사진이 전달되었습니다' : options.title || '현장 사진 올리기'} busy={busy}>
      {finished ? <div className="guest-receipt">
        <span className="guest-success-mark"><Check size={27} /></span>
        <p>소중한 순간 {confirmed.length}장을 받았어요.<br />따뜻한 시선으로 함께해 주셔서 감사합니다.</p>
        <ul className="guest-file-list">{confirmed.map(item => <li key={item.id}><Check size={14} /><span>{item.fileName}</span></li>)}</ul>
        <p className="guest-privacy-note">전달한 사진은 공개 갤러리에 자동으로 올라가지 않아요.</p>
        <button className="guest-action guest-action--solid" type="button" onClick={close}>닫기</button>
      </div> : <form className="guest-form" onSubmit={event => void submit(event)}>
        {preview && <p className="guest-preview-note">미리보기 화면이에요. 실제 사진은 전송되지 않아요.</p>}
        <p className="guest-form-description">현장에서 담아 주신 사진을 보내 주세요.<br />한 번에 5장까지 전달할 수 있어요.</p>
        <fieldset disabled={busy || preview}>
          <div className="guest-field"><label htmlFor={`${formId}-name`}>성함 <small>선택</small></label><input id={`${formId}-name`} value={guestName} onChange={e => setGuestName(e.target.value)} maxLength={60} autoComplete="name" placeholder="사진을 보내시는 분의 성함" /></div>
          <label className="guest-file-picker" htmlFor={`${formId}-files`}><ImagePlus size={28} strokeWidth={1.25} /><strong>사진 선택하기</strong><span>JPG · PNG · WebP · AVIF / 장당 8MB 이하</span><input id={`${formId}-files`} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" aria-label="현장 사진 파일 선택" onChange={event => { selectFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></label>
          {files.length > 0 && <ul className="guest-file-list" aria-label="선택한 사진">{files.map((file, index) => <li key={`${file.name}-${index}`}><Camera size={15} /><span>{file.name}</span><button type="button" aria-label={`${index + 1}번 선택 사진 빼기`} onClick={() => setFiles(items => items.filter((_, i) => i !== index))}><X size={15} /></button></li>)}</ul>}
          <p className="guest-privacy-note">전달한 사진과 성함은 신랑·신부만 확인합니다. 사진은 공개 갤러리에 자동으로 게시되지 않아요. 함께 찍힌 분들이 전달에 동의한 사진을 골라 주세요.</p>
          <label className="guest-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />위 안내를 확인했고 사진을 전달하는 데 동의합니다.</label>
        </fieldset>
        {confirmed.length > 0 && !busy && <p className="guest-partial-note" role="status">지금까지 {confirmed.length}장을 전달했어요.</p>}
        {error && <p className="guest-form-error guest-preserve" role="alert">{error}</p>}
        {busy && <p className="guest-progress" role="status">{progress.total}장 중 {progress.sent}장 전달 완료 · 화면을 잠시 열어 두세요.</p>}
        <button type="submit" className="guest-action guest-action--solid" disabled={preview || busy || !ready || !files.length}>{busy ? <LoaderCircle size={16} className="app-spin" /> : <Upload size={16} />}{busy ? '사진을 전달하고 있어요…' : '사진 전달하기'}</button>
      </form>}
    </GuestDialog>
  </div>;
}
