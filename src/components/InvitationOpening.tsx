import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Heart } from 'lucide-react';
import '../styles/invitation-opening.css';

interface InvitationOpeningProps {
  enabled: boolean;
  groomName: string;
  brideName: string;
  imageUrl: string;
  /** A public invitation identity, stable across refreshes and content updates. */
  sessionKey: string;
  preview?: boolean;
  /** Increment to replay the entrance in the editor without changing guest history. */
  previewRequest?: number;
  onOpened?: () => void;
}

type OpeningPhase = 'closed' | 'ready' | 'opening';
const completedInMemory = new Set<string>();
const openingDuration = 2300;

function hasOpened(key: string) {
  if (completedInMemory.has(key)) return true;
  try { return window.sessionStorage.getItem(key) === 'opened'; }
  catch { return false; }
}

function rememberOpening(key: string) {
  completedInMemory.add(key);
  try { window.sessionStorage.setItem(key, 'opened'); }
  catch { /* The in-memory entry still prevents repeats when storage is blocked. */ }
}

function isSectionLink() {
  // Preserve links directly to a section, including back/forward navigation.
  return Boolean(window.location.hash && !['#', '#/'].includes(window.location.hash));
}

/** A single, skippable entrance per invitation and browser-tab session. */
export default function InvitationOpening({ enabled, groomName, brideName, imageUrl, sessionKey, preview = false, previewRequest = 0, onOpened }: InvitationOpeningProps) {
  const [phase, setPhase] = useState<OpeningPhase>('closed');
  const [imageFailed, setImageFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [motion, setMotion] = useState<'full' | 'reduced'>('full');
  const dialog = useRef<HTMLDialogElement>(null);
  const completedKey = useRef('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const optedIntoMotion = useRef(false);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  const titleId = useId();
  const descriptionId = useId();
  const storageKey = `wedding-opening:v1:${sessionKey}`;
  const replay = previewRequest > 0;
  const openingIdentity = replay ? `${storageKey}:preview:${previewRequest}` : storageKey;
  const visible = phase !== 'closed';

  const complete = useCallback(() => {
    if (completedKey.current === openingIdentity) return;
    completedKey.current = openingIdentity;
    if (!replay) rememberOpening(storageKey);
    dialog.current?.close();
    setPhase('closed');
    onOpenedRef.current?.();
    // Give keyboard and screen-reader users a useful place to continue reading.
    requestAnimationFrame(() => {
      if (replay) { if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); return; }
      const heading = document.getElementById('wedding-title');
      if (!heading) return;
      const previousTabIndex = heading.getAttribute('tabindex');
      if (previousTabIndex === null) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      if (previousTabIndex === null) heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
    });
  }, [openingIdentity, replay, storageKey]);

  useEffect(() => {
    if (!replay && (!enabled || preview || isSectionLink() || hasOpened(storageKey))) { setPhase('closed'); return; }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    optedIntoMotion.current = false;
    setMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full');
    setPhase('ready');
  }, [enabled, preview, replay, previewRequest, storageKey]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      setReducedMotion(preference.matches);
      if (preference.matches && phase === 'opening' && !optedIntoMotion.current) complete();
    };
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, [phase, complete]);

  useEffect(() => { setImageFailed(false); }, [imageUrl]);

  useEffect(() => {
    if (!visible || !dialog.current) return;
    const element = dialog.current;
    if (typeof element.showModal !== 'function') { complete(); return; }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try { if (!element.open) element.showModal(); }
    catch { document.body.style.overflow = previousOverflow; complete(); return; }
    const onHashChange = () => { if (!replay && isSectionLink()) complete(); };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('hashchange', onHashChange);
      if (element.open) element.close();
    };
  }, [visible, complete, replay]);

  useEffect(() => {
    if (phase !== 'opening') return;
    const timer = window.setTimeout(complete, openingDuration);
    return () => window.clearTimeout(timer);
  }, [phase, complete]);

  function openInvitation(withMotion = false) {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced && !withMotion) { complete(); return; }
    optedIntoMotion.current = withMotion;
    setMotion('full');
    setPhase('opening');
  }

  if (!visible) return null;

  return createPortal(<dialog
    className={`invite-opening invite-opening--${phase}`}
    data-opening-state={phase}
    data-motion={motion}
    data-opening-preview={replay || undefined}
    ref={dialog}
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); complete(); }}
  >
    <div className="invite-opening-stage">
      <div className="invite-opening-doors" aria-hidden="true">
        {(['left', 'right'] as const).map(side => <div className={`invite-opening-door invite-opening-door--${side}`} key={side}>
          {!imageFailed && imageUrl && <img className="invite-opening-art" src={imageUrl} alt="" onError={() => setImageFailed(true)} fetchPriority="high" />}
          <span className="invite-opening-door-wash" />
          <span className="invite-opening-door-frame" />
          <span className="invite-opening-door-handle" />
        </div>)}
      </div>
      <div className="invite-opening-seal" aria-hidden="true"><Heart size={19} strokeWidth={1.2} /><span>WITH LOVE</span></div>
      <div className="invite-opening-copy">
        <p className="invite-opening-eyebrow">{replay ? '입장 효과 미리보기' : 'A NEW CHAPTER OF OUR LOVE'}</p>
        <Heart className="invite-opening-heart" size={17} strokeWidth={1.2} aria-hidden="true" />
        <h2 id={titleId}><span>{groomName || '신랑'}</span><small>그리고</small><span>{brideName || '신부'}</span></h2>
        <p className="invite-opening-message" id={descriptionId}>우리의 시작에<br />소중한 당신을 초대합니다.</p>
      </div>
      <div className="invite-opening-actions">
        {reducedMotion && <p className="invite-opening-mode-note">기기의 움직임 줄이기 설정에 따라<br />초대장은 바로 열립니다.</p>}
        <button className="invite-opening-enter" type="button" autoFocus disabled={phase === 'opening'} onClick={() => openInvitation()}>
          <span>{phase === 'opening' ? '초대장을 열고 있어요' : '초대장 열기'}</span><ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
        {reducedMotion && <button className="invite-opening-motion-preview" type="button" disabled={phase === 'opening'} onClick={() => openInvitation(true)}>문 열림 효과 보기</button>}
      </div>
      <button className="invite-opening-skip" type="button" onClick={complete}>건너뛰기<ArrowRight size={13} strokeWidth={1.3} aria-hidden="true" /></button>
      <span className="invite-opening-progress" role="status">{phase === 'opening' ? '초대장을 열고 있어요.' : ''}</span>
    </div>
  </dialog>, document.body);
}
