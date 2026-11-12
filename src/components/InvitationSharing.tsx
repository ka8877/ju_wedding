import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, ExternalLink, Heart, LoaderCircle, MessageCircle, QrCode, Share2, TriangleAlert, X } from 'lucide-react';
import { invitationQr, invitationUrl } from '../lib/sharing';
import { copyText } from '../lib/utils';
import { loadKakaoSdk, shareKakaoInvitation } from '../lib/kakao-sharing';
import { kakaoJavascriptKey as configuredKakaoJavascriptKey } from '../lib/integrations';
import '../styles/sharing.css';

interface SharingProps { names: string; variant?: 'guest' | 'admin'; localPreview?: boolean; kakaoJavascriptKey?: string }

export default function InvitationSharing({ names, variant = 'guest', localPreview = false, kakaoJavascriptKey: legacyKakaoKey = '' }: SharingProps) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState(false);
  const [message, setMessage] = useState('');
  const [shareError, setShareError] = useState(false);
  const [sharingKakao, setSharingKakao] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const titleId = useId();
  const descriptionId = useId();
  const url = invitationUrl(window.location.href, import.meta.env.DEV || localPreview);
  const kakaoJavascriptKey = configuredKakaoJavascriptKey(legacyKakaoKey);

  useEffect(() => {
    if (/^[a-f\d]{32}$/i.test(kakaoJavascriptKey)) void loadKakaoSdk().catch(() => { /* The primary action retries loading on demand. */ });
  }, [kakaoJavascriptKey]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    setQrError(false);
    void invitationQr(url).then(image => { if (active) setQr(image); }).catch(() => { if (active) setQrError(true); });
    return () => {
      active = false;
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open, url]);

  function notify(text: string, error = false) {
    setMessage(text);
    setShareError(error);
    clearTimeout(noticeTimer.current);
    if (!error) noticeTimer.current = setTimeout(() => setMessage(''), 3500);
  }
  async function copy() {
    try { await copyText(url); notify('청첩장 링크를 복사했어요.'); }
    catch { notify('복사하지 못했어요. 아래 주소를 길게 눌러 복사해 주세요.'); setOpen(true); }
  }
  async function share() {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: `${names}의 결혼식`, text: '소중한 당신을 초대합니다.', url }); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) await copy();
    }
  }
  async function shareKakao() {
    if (sharingKakao) return;
    setSharingKakao(true); setMessage(''); setShareError(false);
    try { await shareKakaoInvitation(kakaoJavascriptKey, names, url); }
    catch { notify('카카오톡 공유를 열지 못했어요. 다시 시도하거나 링크 복사로 전해 주세요.', true); }
    finally { setSharingKakao(false); }
  }
  function download() {
    if (!qr) return;
    const link = document.createElement('a');
    link.href = qr; link.download = 'juyoung-hyunbeom-invitation-qr.png';
    document.body.appendChild(link); link.click(); link.remove();
    notify('QR 이미지 저장을 시작했어요.');
  }

  return <>
    <div className={`wedding-sharing wedding-sharing--${variant}`}>
      {variant === 'admin' && <div className="wedding-share-card-heading"><span><Heart size={17} strokeWidth={1.3} /></span><div><h2>소중한 분께 전해요</h2><p>카카오톡과 링크·QR로 우리 청첩장을 전할 수 있어요.</p></div></div>}
      <div className="wedding-share-actions">
        <button type="button" className="wedding-share-button wedding-share-button--kakao" disabled={sharingKakao} onClick={() => void shareKakao()}>{sharingKakao ? <LoaderCircle size={16} className="app-spin" /> : <MessageCircle size={16} />}{sharingKakao ? '카카오톡 여는 중…' : '카카오톡으로 공유'}</button>
        <button type="button" className="wedding-share-button" onClick={() => void copy()}><Copy size={15} />링크 복사</button>
        <button type="button" className="wedding-share-button wedding-share-button--qr" onClick={() => { setMessage(''); setOpen(true); }}><QrCode size={16} strokeWidth={1.4} />QR 코드 보기</button>
      </div>
      {variant === 'admin' && <p className="wedding-share-note">{localPreview ? 'QR은 실제 공개 사이트로 연결돼요. 이 기기의 미리보기 수정은 전달되지 않아요.' : 'QR은 공개 청첩장으로 연결돼요. 편집한 내용은 공개 반영 후 전달됩니다.'}</p>}
      {message && !open && <p className={`wedding-share-feedback${shareError ? ' wedding-share-feedback--error' : ''}`} role={shareError ? 'alert' : 'status'}>{shareError ? <TriangleAlert size={14} /> : <Check size={13} />}{message}</p>}
    </div>
    {createPortal(<dialog className="wedding-share-dialog" ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="wedding-share-dialog-content">
        <button type="button" className="wedding-share-close" aria-label="QR 코드 닫기" onClick={() => setOpen(false)} autoFocus><X size={21} /></button>
        <span className="wedding-share-eyebrow">A LITTLE INVITATION, WITH LOVE</span>
        <h2 id={titleId}>마음을 담은 초대</h2>
        <p id={descriptionId}>휴대폰 카메라로 QR을 비추면<br />청첩장을 바로 열 수 있어요.</p>
        <div className="wedding-qr-frame">
          {qr ? <img src={qr} width={212} height={212} alt="공개 청첩장으로 연결되는 QR 코드" />
            : qrError ? <p role="alert">QR을 만들지 못했어요.<br />링크 복사로 전해 주세요.</p>
              : <span role="status"><LoaderCircle className="app-spin" size={24} />QR을 준비하고 있어요</span>}
        </div>
        <p className="wedding-share-names">{names}</p>
        <a className="wedding-share-url" href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, '')}<ExternalLink size={12} /></a>
        <div className="wedding-share-dialog-actions">
          <button type="button" className="wedding-share-button wedding-share-button--primary" onClick={download} disabled={!qr}><Download size={16} />QR 이미지 저장</button>
          <button type="button" className="wedding-share-button" onClick={() => void copy()}><Copy size={15} />링크 복사</button>
          {typeof navigator.share === 'function' && <button type="button" className="wedding-share-button wedding-share-button--wide" onClick={() => void share()}><Share2 size={15} />다른 앱으로 공유</button>}
        </div>
        <p className="wedding-share-note">공개한 청첩장으로 연결됩니다.<br />저장한 QR은 인쇄하거나 메시지에 첨부할 수 있어요.</p>
        {message && open && <p className="wedding-share-feedback" role="status">{message}</p>}
      </div>
    </dialog>, document.body)}
  </>;
}
