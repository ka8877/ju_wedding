import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight } from 'lucide-react';
import type { FontId } from '../lib/types';
import { useInvitationFont } from './InvitationFont';
import '../styles/invitation-opening.css';

interface InvitationOpeningProps {
  enabled: boolean;
  groomName: string;
  brideName: string;
  imageUrl: string;
  sessionKey: string;
  preview?: boolean;
  previewRequest?: number;
  onOpened?: () => void;
  font?: FontId;
}

type OpeningPhase = 'closed' | 'ready' | 'holding' | 'opening' | 'leaving';
const entranceFilm = `${import.meta.env.BASE_URL}garden-entrance.mp4`;
const entrancePoster = `${import.meta.env.BASE_URL}garden-entrance-poster.jpg`;

function isSectionLink() {
  return Boolean(window.location.hash && !['#', '#/'].includes(window.location.hash));
}

/** A muted garden film, with a bounded still-image alternative and immediate skip. */
export default function InvitationOpening({ enabled, groomName, brideName, imageUrl, sessionKey, preview = false, previewRequest = 0, onOpened, font }: InvitationOpeningProps) {
  const invitationFont = useInvitationFont();
  const [phase, setPhase] = useState<OpeningPhase>('closed');
  const [fallback, setFallback] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const completedKey = useRef('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  const titleId = useId();
  const descriptionId = useId();
  const replay = previewRequest > 0;
  const openingIdentity = replay ? `${sessionKey}:preview:${previewRequest}` : sessionKey;
  const visible = phase !== 'closed';
  // Keep the selected entrance film on ordinary visits even when the browser
  // requests reduced motion. Skip and reduced CSS transitions remain available.
  const still = fallback;

  const complete = useCallback(() => {
    if (completedKey.current === openingIdentity) return;
    completedKey.current = openingIdentity;
    film.current?.pause();
    dialog.current?.close();
    setPhase('closed');
    onOpenedRef.current?.();
    requestAnimationFrame(() => {
      if (replay) { if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); return; }
      const heading = document.getElementById('wedding-title');
      if (!heading) return;
      const previousTabIndex = heading.getAttribute('tabindex');
      if (previousTabIndex === null) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      if (previousTabIndex === null) heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
    });
  }, [openingIdentity, replay]);

  useEffect(() => {
    if (!replay && (!enabled || preview || isSectionLink())) { setPhase('closed'); return; }
    // Each fresh visit plays the entrance. Renders within this visit do not
    // reopen it, and old once-per-tab flags must not silently skip the film.
    completedKey.current = '';
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFallback(false); setElapsed(0); setPhase('ready');
  }, [enabled, preview, replay, previewRequest, sessionKey]);

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
    if (phase !== 'ready') return;
    if (still) { setPhase('holding'); return; }
    const video = film.current;
    if (!video) return;
    const ready = () => setPhase('holding');
    const failed = () => { setFallback(true); setPhase('holding'); };
    const timeout = window.setTimeout(failed, 8000);
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    if (video.readyState >= 2) ready();
    return () => { clearTimeout(timeout); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); };
  }, [phase, still]);

  useEffect(() => {
    if (phase !== 'holding') return;
    const timer = window.setTimeout(() => setPhase(still ? 'leaving' : 'opening'), still ? 2200 : 400);
    return () => clearTimeout(timer);
  }, [phase, still]);

  useEffect(() => {
    if (phase !== 'opening') return;
    if (still) { setPhase('holding'); return; }
    const video = film.current;
    if (!video) return;
    let cancelled = false;
    void video.play().catch(() => { if (!cancelled) { setFallback(true); setPhase('holding'); } });
    // Brief buffering should not cut a 10-second film short. Bound a stream
    // that makes no progress separately from the total time spent watching it.
    let lastTime = video.currentTime;
    let lastProgress = performance.now();
    const watchdog = window.setInterval(() => {
      if (video.currentTime > lastTime) { lastTime = video.currentTime; lastProgress = performance.now(); }
      if (performance.now() - lastProgress >= 8000) { setFallback(true); setPhase('holding'); }
    }, 500);
    const ceiling = window.setTimeout(() => setPhase('leaving'), 30_000);
    return () => { cancelled = true; clearInterval(watchdog); clearTimeout(ceiling); video.pause(); };
  }, [phase, still]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(complete, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 200 : 800);
    return () => clearTimeout(timer);
  }, [phase, complete]);

  if (!visible) return null;

  return createPortal(<dialog
    className={`invite-opening invite-opening--${phase}`}
    data-invitation-font={font || invitationFont}
    data-opening-state={phase} data-motion="full"
    data-opening-media={still ? 'fallback' : 'video'}
    data-names-visible={still || elapsed >= 7.4 || phase === 'leaving'}
    data-opening-preview={replay || undefined}
    ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); complete(); }}
  >
    <div className="invite-opening-stage">
      {still ? <img className="invite-opening-still" src={imageUrl} alt="" aria-hidden="true" /> : <video
        ref={film} className="invite-opening-film" src={entranceFilm} poster={entrancePoster}
        muted playsInline preload="auto" aria-hidden="true" disablePictureInPicture disableRemotePlayback
        onTimeUpdate={event => setElapsed(event.currentTarget.currentTime)}
        onEnded={() => setPhase('leaving')}
        onError={() => { setFallback(true); setPhase('holding'); }}
      />}
      <div className="invite-opening-copy">
        {replay && <p className="invite-opening-preview-label">정원 입장 미리보기</p>}
        <h2 id={titleId}><span>{groomName || '신랑'}</span><small>그리고</small><span>{brideName || '신부'}</span></h2>
      </div>
      <p className="invite-opening-description" id={descriptionId}>정원의 문을 지나, 두 사람의 새로운 시작에 초대합니다.</p>
      <button className="invite-opening-skip" type="button" autoFocus onClick={complete}>건너뛰기<ArrowRight size={13} strokeWidth={1.3} aria-hidden="true" /></button>
    </div>
  </dialog>, document.body);
}
