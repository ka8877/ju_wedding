import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getGuestCapabilities } from '../lib/guest-storage';
import type { GuestCapabilities } from '../lib/guest-types';
import '../styles/guests.css';

export function useGuestCapabilities(preview: boolean) {
  const [capabilities, setCapabilities] = useState<GuestCapabilities | null>(null);
  const [loading, setLoading] = useState(!preview);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    if (preview) return;
    setLoading(true);
    try {
      const result = await getGuestCapabilities();
      if (mounted.current) setCapabilities(result);
    } catch {
      if (mounted.current) setCapabilities({ status: 'offline', rsvpEnabled: false, snapEnabled: false, snapOpen: false, snapOpenDate: '', message: '' });
    } finally { if (mounted.current) setLoading(false); }
  }, [preview]);
  useEffect(() => {
    mounted.current = true;
    void reload();
    if (preview) return () => { mounted.current = false; };
    const refresh = () => { if (document.visibilityState === 'visible') void reload(); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { mounted.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [preview, reload]);
  return { capabilities, loading, reload };
}

export function guestDateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '예식 당일';
  const date = new Date(`${value}T00:00:00+09:00`);
  if (!Number.isFinite(date.getTime())) return '예식 당일';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

export function guestTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function GuestDialog({ open, onClose, title, busy = false, children }: { open: boolean; onClose: () => void; title: string; busy?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => { if (open && dialog.current) dialog.current.scrollTop = 0; }, [open, title]);
  return createPortal(<dialog className="guest-dialog" ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) closeRef.current(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) closeRef.current(); }}
    onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
    <div className="guest-dialog-body">
      <button type="button" className="guest-dialog-close" aria-label={`${title} 닫기`} disabled={busy} onClick={() => closeRef.current()} autoFocus><X size={21} /></button>
      <p className="guest-eyebrow">WITH YOUR WARMEST WISHES</p>
      <h2 id={titleId}>{title}</h2>
      {children}
    </div>
  </dialog>, document.body);
}
