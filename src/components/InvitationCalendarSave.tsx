import { useState } from 'react';
import { ArrowUpRight, CalendarDays, CalendarPlus, Download } from 'lucide-react';
import { downloadWeddingCalendar, googleWeddingCalendarUrl } from '../lib/calendar';
import type { WeddingData } from '../lib/types';
import { GuestDialog } from './GuestCommon';

export default function InvitationCalendarSave({ data }: { data: WeddingData }) {
  const [open, setOpen] = useState(false);
  const userAgent = navigator.userAgent;
  const appleMobile = /iPhone|iPad|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const appleCalendar = appleMobile || /Macintosh/.test(userAgent);
  // Android Chrome can hand an HTTPS event link to the Google Calendar app.
  // An ordinary HTTPS link also works in browsers that cannot handle intents.
  const androidChrome = /Android.*Chrome\//.test(userAgent)
    && !/\bwv\b|Version\/4\.0|SamsungBrowser|EdgA|OPR\/|KAKAOTALK|NAVER|Instagram|FBAN|FBAV/i.test(userAgent);
  const googleUrl = googleWeddingCalendarUrl(data, androidChrome);
  if (!googleUrl) return null;

  const googleOption = (
    <a className="guest-action invite-calendar-option" href={googleUrl}
      target={androidChrome ? '_self' : '_blank'} rel="noreferrer">
      <CalendarDays size={19} aria-hidden="true" />
      <span><strong>구글 캘린더</strong><small>예식 정보가 입력된 일정 열기</small></span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
  const fileOption = (
    <button className="guest-action invite-calendar-option" type="button" onClick={() => {
      if (downloadWeddingCalendar(data)) setOpen(false);
    }}>
      <CalendarDays size={19} aria-hidden="true" />
      <span><strong>{appleCalendar ? 'Apple 캘린더' : '일정 파일 받기'}</strong>
        <small>{appleCalendar ? '일정 파일(.ics)로 추가' : '사용 중인 캘린더로 가져오기 (.ics)'}</small></span>
      <Download size={16} aria-hidden="true" />
    </button>
  );

  return <>
    <button className="invite-outline-button invite-calendar-save" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <CalendarPlus size={15} strokeWidth={1.4} aria-hidden="true" />캘린더에 저장
    </button>
    <GuestDialog open={open} onClose={() => setOpen(false)} title="캘린더에 저장" eyebrow="">
      <div className="invite-calendar-options">
        {appleCalendar ? <>{fileOption}{googleOption}</> : <>{googleOption}{fileOption}</>}
      </div>
      {appleMobile && <p className="guest-footnote invite-calendar-hint">파일이 열리지 않으면 청첩장을 Safari에서 열어 주세요.</p>}
    </GuestDialog>
  </>;
}
