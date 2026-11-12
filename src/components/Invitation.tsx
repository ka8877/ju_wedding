import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowDown, ArrowUpRight, Bus, CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Heart, MapPin, MessageCircle, Phone, X } from 'lucide-react';
import type { SectionId, WeddingData } from '../lib/types';
import { getDesign, sectionIds } from '../lib/design';
import { copyText } from '../lib/utils';
import { downloadWeddingCalendar } from '../lib/calendar';
import InvitationSharing from './InvitationSharing';
import MusicPlayer from './MusicPlayer';
import GuestRsvp from './GuestRsvp';
import GuestSnap from './GuestSnap';
import '../styles/invitation.css';

interface InvitationProps { data: WeddingData; preview?: boolean }
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function weddingDate(data: WeddingData) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return null;
  const parsed = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`);
  if (Number.isNaN(parsed.getTime()) || parsed.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) !== data.date) return null;
  return parsed;
}

function dateLabel(date: Date, time: string) {
  const label = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date);
  if (!time) return label;
  return `${label} ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true }).format(date)}`;
}

export default function Invitation({ data, preview = false }: InvitationProps) {
  const [copied, setCopied] = useState('');
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const galleryDialog = useRef<HTMLDialogElement>(null);
  const contactDialog = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLElement>(null);
  const galleryId = useId();
  const design = getDesign(data);
  const features = data.guestFeatures;
  const date = weddingDate(data);
  const hasTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time);
  // Midnight is only a parsing anchor for the calendar when the time is unknown.
  const eventMillis = date && hasTime ? date.getTime() : undefined;
  const hasContacts = Boolean(data.groom.phone || data.bride.phone);
  const hasVenue = Boolean(data.venue.name || data.venue.address);
  const validCoordinates = typeof data.venue.lat === 'number' && typeof data.venue.lng === 'number' && Number.isFinite(data.venue.lat) && Number.isFinite(data.venue.lng) && Math.abs(data.venue.lat) <= 90 && Math.abs(data.venue.lng) <= 180;
  const venueQuery = encodeURIComponent(`${data.venue.name} ${data.venue.address}`.trim());
  const naverVenueUrl = data.venue.name.trim() === 'HD현대글로벌R&D센터' && data.venue.address.includes('분당수서로 477')
    ? 'https://m.place.naver.com/place/1156613092?entry=ple'
    : `https://map.naver.com/p/search/${venueQuery}`;
  const collapsedRows = features.gallery.collapsedRows;
  const galleryLimit = collapsedRows === 0 ? data.photos.length : design.galleryLayout === 'mosaic'
    ? Array.from({ length: collapsedRows }, (_, row) => row % 2 === 0 ? 2 : 3).reduce((sum, count) => sum + count, 0)
    : collapsedRows * 2;
  const galleryPhotos = galleryExpanded ? data.photos : data.photos.slice(0, galleryLimit);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearInterval(interval); clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!root.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    root.current.querySelectorAll('.invite-reveal').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (lightbox !== null) galleryDialog.current?.showModal();
    else galleryDialog.current?.close();
  }, [lightbox]);

  useEffect(() => { setGalleryExpanded(false); }, [collapsedRows, design.galleryLayout]);
  useEffect(() => { if (lightbox !== null && lightbox >= data.photos.length) setLightbox(null); }, [data.photos.length, lightbox]);

  useEffect(() => {
    if (contactOpen) contactDialog.current?.showModal();
    else contactDialog.current?.close();
  }, [contactOpen]);

  useEffect(() => {
    if (lightbox === null && !contactOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [lightbox, contactOpen]);

  async function copy(text: string, label: string) {
    try {
      await copyText(text);
      setCopied(label);
    } catch {
      setCopied('복사할 수 없어요. 길게 눌러 직접 복사해 주세요.');
    }
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setCopied(''), 2800);
  }


  const remaining = eventMillis ? eventMillis - now : 0;
  const koreanToday = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const calendarDays = date ? Math.round((Date.parse(`${data.date}T00:00:00+09:00`) - Date.parse(`${koreanToday}T00:00:00+09:00`)) / 86_400_000) : 0;
  const dayBadge = calendarDays === 0 ? 'D-DAY' : calendarDays > 0 ? `D-${calendarDays}` : `D+${Math.abs(calendarDays)}`;
  const days = Math.max(0, Math.floor(remaining / 86_400_000));
  const hours = Math.max(0, Math.floor(remaining / 3_600_000) % 24);
  const minutes = Math.max(0, Math.floor(remaining / 60_000) % 60);
  const dateParts = data.date.split('-').map(Number);
  const year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts[2];
  const firstDay = date ? new Date(Date.UTC(year, month - 1, 1)).getUTCDay() : 0;
  const daysInMonth = date ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  const personRows = [data.groom, data.bride];

  const available: Record<SectionId, boolean> = { invitation: true, verse: Boolean(data.showVerse && data.verse), calendar: Boolean(date), gallery: true, rsvp: features.rsvp.enabled, snap: features.snap.enabled, location: true, shuttle: features.shuttle.enabled, accounts: data.accounts.length > 0, blessing: Boolean(design.showBlessing && design.blessing) };
  const visibleSections = [...new Set([...design.sectionOrder, ...sectionIds])].filter(id => !design.hiddenSections.includes(id) && available[id]);
  const sectionNumber = (id: SectionId) => String(visibleSections.indexOf(id) + 1).padStart(2, '0');
  const decoration = design.showDecoration ? <img src={`${import.meta.env.BASE_URL}olive-sprig.svg`} className="invite-sprig" alt="" /> : null;
  const initials = `${(data.groom.englishName || data.groom.name).slice(0, 1)} & ${(data.bride.englishName || data.bride.name).slice(0, 1)}`;
  const title = <h1 id="wedding-title">{design.heroTitle.split('\n').map((line, i) => i === 0 ? <span className="invite-title-line" key={i}>{line || '\u00a0'}</span> : <em className="invite-title-line" key={i}>{line || '\u00a0'}</em>)}{design.showDecoration && design.template === 'garden' && <span className="invite-title-star" aria-hidden="true"><svg width="38" height="38" viewBox="0 0 40 40" fill="none"><path d="M20 2V38M2 20H38M7 7L33 33M7 33L33 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>}</h1>;
  const englishNames = <p className="invite-english-names">{data.groom.englishName || data.groom.name} <span>&</span> {data.bride.englishName || data.bride.name}</p>;
  const heading = <div className="invite-hero-heading"><p className="invite-kicker invite-preserve">{design.heroSubtitle}</p>{title}{englishNames}</div>;
  const details = <div className="invite-hero-details"><div className="invite-korean-names"><span>{data.groom.name}</span><span className="invite-name-divider">&</span><span>{data.bride.name}</span></div>{date ? <><p className="invite-hero-date">{dateLabel(date, data.time)}</p>{!hasTime && <p className="invite-pending-info">예식 시간은 추후 안내드릴게요.</p>}</> : <p className="invite-hero-date invite-muted">우리의 소중한 날을 준비하고 있어요</p>}{hasVenue && <p className="invite-hero-venue">{data.venue.name} {data.venue.hall}</p>}</div>;
  const art = { garden: 'botanical-still-life.svg', editorial: 'editorial-flower.svg', photo: 'cinematic-garden.svg', classic: 'editorial-flower.svg', chapel: 'chapel-window.svg', letter: 'love-letter.svg' }[design.template];
  const cover = <div className={`invite-cover${data.coverPhoto ? ' invite-cover--photo' : ' invite-cover--illustration'}`}><img src={data.coverPhoto || `${import.meta.env.BASE_URL}${art}`} alt={data.coverPhoto ? `${data.groom.name}와 ${data.bride.name}의 웨딩 사진` : '사진을 등록하기 전, 사랑의 시작을 담은 웨딩 일러스트'} className="invite-cover-image" fetchPriority="high" style={{ objectPosition: `center ${design.photoPosition}%` }} />{!data.coverPhoto && design.showDecoration && design.template === 'garden' && <span className="invite-cover-note">a little love, a lifetime together</span>}{design.showDecoration && design.template === 'garden' && <div className="invite-cover-stamp" aria-hidden="true"><span>TOGETHER</span><Heart size={19} strokeWidth={1} /><span>IS A BEAUTIFUL PLACE</span></div>}</div>;
  const masthead = <div className="invite-masthead"><span>THE WEDDING OF</span><span className="invite-small-heart">{design.showDecoration && <Heart size={12} strokeWidth={1.3} />} TWO HEARTS, ONE STORY</span></div>;
  const scroll = visibleSections.length > 0 ? <a href="#our-invitation" className="invite-scroll" onClick={event => { event.preventDefault(); root.current?.querySelector('.invite-content-section')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }}><span>OUR STORY BEGINS</span><ArrowDown size={14} strokeWidth={1.2} /></a> : null;
  const cross = <svg className="invite-chapel-cross" width="25" height="34" viewBox="0 0 25 34" fill="none" aria-hidden="true"><path d="M12.5 1V33M1 11H24" stroke="currentColor" strokeWidth="1.3" /></svg>;
  const heroLayouts = {
    garden: <>{masthead}{heading}{cover}{details}{scroll}</>,
    editorial: <>{masthead}<div className="invite-editorial-meta"><span>A CELEBRATION OF LOVE</span><span>{date ? `${year} / ${String(month).padStart(2, '0')}` : 'OUR FIRST ISSUE'}</span></div>{heading}<div className="invite-editorial-photo">{cover}<span className="invite-editorial-caption">FIG. 01 — THE BEGINNING OF FOREVER</span></div>{details}{scroll}</>,
    photo: <><div className="invite-cinematic-frame">{cover}<div className="invite-cinematic-shade" /><div className="invite-cinematic-content">{masthead}{heading}{details}<span className="invite-cinematic-caption">A LOVE STORY, OURS TO TELL</span></div></div>{scroll}</>,
    classic: <>{masthead}<div className="invite-classic-border">{design.showDecoration && <div className="invite-monogram" aria-hidden="true">{initials}</div>}{heading}{cover}{details}<span className="invite-classic-caption">REQUEST THE HONOUR OF YOUR PRESENCE</span></div>{scroll}</>,
    chapel: <>{masthead}<div className="invite-chapel-heading">{cross}<span>BY GRACE, THROUGH LOVE</span></div>{heading}<div className="invite-chapel-window">{cover}</div>{details}{scroll}</>,
    letter: <>{masthead}<div className="invite-letter-heading"><span className="invite-letter-to">To. 소중한 당신에게</span>{heading}</div><div className="invite-envelope">{cover}{design.showDecoration && <span className="invite-wax-seal" aria-hidden="true"><Heart size={19} strokeWidth={1} /></span>}</div>{details}<div className="invite-letter-signoff"><span>with all our love,</span>{englishNames}</div>{scroll}</>,
  };
  const style = { ...(design.accentColor && /^#[0-9a-f]{6}$/i.test(design.accentColor) ? { '--invite-accent': design.accentColor } : {}) } as CSSProperties;
  const sections: Record<SectionId, ReactNode> = {
    invitation: (<section data-section="invitation" id="our-invitation" className="invite-section invite-letter invite-reveal invite-content-section">
        <div className="invite-section-index"><span>{sectionNumber('invitation')}</span><i /><span>INVITATION</span></div>
        {decoration}
        <h2>{design.sectionTitles.invitation}</h2>
        <p className="invite-preserve invite-letter-copy">{data.invitation}</p>
        <div className="invite-family">
          {personRows.map((person, index) => <div className="invite-family-row" key={index}>
            {(person.father || person.mother) && <span className="invite-parents">{[person.father, person.mother].filter(Boolean).join(' · ')}<span className="invite-relation">의 {person.birthOrder || (index === 0 ? '아들' : '딸')}</span></span>}
            {!person.father && !person.mother && <span className="invite-relation">{index === 0 ? '신랑' : '신부'}</span>}
            <strong>{person.childName || person.name}</strong>
          </div>)}
        </div>
        {hasContacts && <button className="invite-outline-button" onClick={() => setContactOpen(true)}><Phone size={14} strokeWidth={1.4} />축하의 연락 전하기</button>}
      </section>),
    verse: (data.showVerse && data.verse && <section data-section="verse" className="invite-verse invite-reveal invite-content-section"><span className="invite-verse-cross" aria-hidden="true"><svg width="18" height="24" viewBox="0 0 18 24" fill="none"><path d="M9 1V23M1 8H17" stroke="currentColor" strokeWidth="1.5" /></svg></span><p className="invite-preserve">{data.verse}</p><small>{data.verseReference}</small></section>),
    calendar: (date && <section data-section="calendar" className="invite-section invite-calendar-section invite-reveal invite-content-section">
        <div className="invite-section-index"><span>{sectionNumber('calendar')}</span><i /><span>OUR DAY</span></div>
        <h2 className="invite-calendar-title">{String(year)}<span>.</span>{String(month).padStart(2, '0')}<span>.</span>{String(day).padStart(2, '0')}</h2>
        <p className="invite-subtitle">{dateLabel(date, data.time)}</p>
        <span className="invite-day-badge" aria-label={`결혼식 ${dayBadge}`}><Heart size={10} fill="currentColor" />{dayBadge}</span>
        <div className="invite-calendar" aria-label={`${year}년 ${month}월 달력`}>
          <div className="invite-calendar-row invite-calendar-weekdays">{weekdays.map((weekday, i) => <span key={weekday} className={i === 0 ? 'is-sunday' : ''}>{weekday}</span>)}</div>
          <div className="invite-calendar-grid">{Array.from({ length: firstDay }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: daysInMonth }, (_, i) => <span key={i + 1} className={`${i + 1 === day ? 'is-wedding-day' : ''} ${(firstDay + i) % 7 === 0 ? 'is-sunday' : ''}`} aria-label={i + 1 === day ? `${i + 1}일, 결혼식` : undefined}>{i + 1 === day && <Heart size={38} fill="currentColor" strokeWidth={0} className="invite-calendar-heart" />}<span>{i + 1}</span></span>)}</div>
        </div>
        {!hasTime ? <p className="invite-countdown-note">예식 시간은 추후 안내드릴게요.</p> : remaining > 0 ? <><div className="invite-countdown"><div><strong>{String(days).padStart(2, '0')}</strong><span>DAYS</span></div><i>:</i><div><strong>{String(hours).padStart(2, '0')}</strong><span>HOURS</span></div><i>:</i><div><strong>{String(minutes).padStart(2, '0')}</strong><span>MINUTES</span></div></div><p className="invite-countdown-note">{calendarDays > 0 ? <>두 사람이 하나 되는 날까지 <strong>{calendarDays}일</strong></> : '오늘, 두 사람이 하나 되는 소중한 날입니다.'}</p></> : <p className="invite-countdown-note">우리의 시작을 함께 축복해 주셔서 감사합니다.</p>}
        {hasTime && <button className="invite-outline-button invite-calendar-save" onClick={() => { downloadWeddingCalendar(data); }}><CalendarPlus size={15} strokeWidth={1.4} />캘린더에 저장</button>}
      </section>),
    gallery: (<section data-section="gallery" id="our-moments" className="invite-section invite-gallery-section invite-reveal invite-content-section">
        <div className="invite-section-index"><span>{sectionNumber('gallery')}</span><i /><span>OUR MOMENTS</span></div>
        <h2>{design.sectionTitles.gallery}</h2>
        <p className="invite-subtitle">평범한 날들이, 당신과 함께 특별해졌습니다.</p>
        {data.photos.length > 0 ? <><div id={galleryId} className={`invite-gallery invite-gallery--${design.galleryLayout}`}>{galleryPhotos.map((photo, index) => <button className={`invite-gallery-item${design.galleryLayout === 'mosaic' ? index % 5 < 2 ? ' invite-gallery-item--half' : ' invite-gallery-item--third' : ''}`} key={photo.id} onClick={() => setLightbox(index)} aria-label={`${photo.alt || '웨딩 사진'} ${index + 1} 크게 보기`}><img src={photo.url} alt={photo.alt || `함께한 순간 ${index + 1}`} loading="lazy" /><span><ArrowUpRight size={20} /></span></button>)}</div>{data.photos.length > galleryLimit && <button className="invite-outline-button invite-gallery-toggle" type="button" aria-expanded={galleryExpanded} aria-controls={galleryId} onClick={() => setGalleryExpanded(value => !value)}>{galleryExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{galleryExpanded ? '갤러리 접기' : `갤러리 펼쳐보기 (${data.photos.length}장)`}</button>}</> : <div className="invite-gallery-empty"><div className="invite-empty-frame"><Heart size={21} strokeWidth={1} /><span>our moments</span></div><p>소중한 순간들을<br />곧 이곳에 담아둘게요.</p></div>}
      </section>),
    rsvp: (<section data-section="rsvp" className="invite-section invite-rsvp-section invite-reveal invite-content-section"><div className="invite-section-index"><span>{sectionNumber('rsvp')}</span><i /><span>BE OUR GUEST</span></div><h2>{features.rsvp.title}</h2><GuestRsvp data={data} preview={preview} /></section>),
    snap: (<section data-section="snap" className="invite-section invite-snap-section invite-reveal invite-content-section"><div className="invite-section-index"><span>{sectionNumber('snap')}</span><i /><span>OUR WEDDING, YOUR MOMENTS</span></div><h2>{features.snap.title}</h2><GuestSnap data={data} preview={preview} /></section>),
    location: (<section data-section="location" id="location" className="invite-section invite-location-section invite-reveal invite-content-section">
        <div className="invite-section-index"><span>{sectionNumber('location')}</span><i /><span>LOCATION</span></div>
        <h2>{design.sectionTitles.location}</h2>
        {hasVenue ? <>
          <h3 className="invite-venue-name">{data.venue.name}</h3>
          {data.venue.hall && <p className="invite-venue-hall">{data.venue.hall}</p>}
          {data.venue.address && <div className="invite-address"><span>{data.venue.address}</span><button aria-label="주소 복사" onClick={() => copy(data.venue.address, '주소를 복사했어요')}><Copy size={14} /></button></div>}
          {!data.venue.address && <p className="invite-pending-info">정확한 주소는 추후 안내드릴게요.</p>}
          {validCoordinates ? <iframe className="invite-map" title={`${data.venue.name || '예식장'} 위치 지도`} loading="lazy" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${data.venue.lng! - 0.006}%2C${data.venue.lat! - 0.004}%2C${data.venue.lng! + 0.006}%2C${data.venue.lat! + 0.004}&layer=mapnik&marker=${data.venue.lat}%2C${data.venue.lng}`} /> : <div className="invite-location-placeholder"><MapPin size={27} strokeWidth={1} /><span>아래 지도 앱에서 길을 확인해 주세요.</span></div>}
          <div className="invite-map-links"><a href={naverVenueUrl} target="_blank" rel="noreferrer"><span className="invite-map-icon invite-map-icon--naver">N</span>네이버 지도<ArrowUpRight size={13} /></a><a href={validCoordinates ? `https://map.kakao.com/link/to/${encodeURIComponent(data.venue.name || '예식장')},${data.venue.lat},${data.venue.lng}` : `https://map.kakao.com/link/search/${venueQuery}`} target="_blank" rel="noreferrer"><span className="invite-map-icon invite-map-icon--kakao">K</span>카카오맵 길찾기<ArrowUpRight size={13} /></a></div>
          {data.venue.address && <p className="invite-map-help">티맵 이용 시 위 주소를 복사해 목적지를 검색해 주세요.</p>}
          {(data.venue.subway || data.venue.bus || data.venue.car || data.venue.transport || data.venue.parking) && <div className="invite-directions">{data.venue.subway && <div><h4>지하철</h4><p className="invite-preserve">{data.venue.subway}</p></div>}{data.venue.bus && <div><h4>버스</h4><p className="invite-preserve">{data.venue.bus}</p></div>}{data.venue.car && <div><h4>자가용</h4><p className="invite-preserve">{data.venue.car}</p></div>}{data.venue.transport && <div><h4>대중교통 안내</h4><p className="invite-preserve">{data.venue.transport}</p></div>}{data.venue.parking && <div><h4>주차 안내</h4><p className="invite-preserve">{data.venue.parking}</p></div>}</div>}
        </> : <div className="invite-venue-pending"><MapPin size={25} strokeWidth={1} /><p>소중한 분들을 모실 공간을<br />정성껏 준비하고 있어요.</p><span>장소가 정해지면 이곳에서 안내드릴게요.</span></div>}
      </section>),
    shuttle: (<section data-section="shuttle" className="invite-section invite-shuttle-section invite-reveal invite-content-section"><div className="invite-section-index"><span>{sectionNumber('shuttle')}</span><i /><span>TRAVEL TOGETHER</span></div><Bus size={24} strokeWidth={1.2} className="invite-shuttle-icon" /><h2>{features.shuttle.title}</h2><p className="invite-subtitle">함께 오시는 길도 편안할 수 있도록 준비하고 있어요.</p>{(['daejeon', 'gyeongju'] as const).map(city => <details key={city} className="invite-shuttle-group"><summary>{city === 'daejeon' ? '대전 출발' : '경주 출발'}<ChevronDown size={16} /></summary><p className="invite-preserve">{features.shuttle[city] || '출발 시간과 탑승 장소는 정해지는 대로 안내드릴게요.'}</p></details>)}</section>),
    accounts: (data.accounts.length > 0 && <section data-section="accounts" className="invite-section invite-accounts invite-reveal invite-content-section"><div className="invite-section-index"><span>WITH LOVE</span><i /><Heart size={12} strokeWidth={1.2} /></div><h2>{design.sectionTitles.accounts}</h2><p className="invite-subtitle">보내주시는 따뜻한 마음, 소중히 간직하겠습니다.</p>{(['groom', 'bride'] as const).map(side => {
        const accounts = data.accounts.filter(account => account.side === side);
        if (!accounts.length) return null;
        return <details className="invite-account-group" key={side}><summary>{side === 'groom' ? '신랑' : '신부'}측 계좌번호<span>+</span></summary><div>{accounts.map(account => <div className="invite-account" key={account.id}><div><strong>{account.bank} <span>{account.number}</span></strong><span>{account.holder}</span></div><button onClick={() => copy(account.number, '계좌번호를 복사했어요')} aria-label={`${account.holder} 계좌번호 복사`}><Copy size={13} />복사</button></div>)}</div></details>;
      })}</section>),
    blessing: (<section data-section="blessing" className="invite-section invite-blessing invite-reveal invite-content-section"><div className="invite-section-index"><span>{sectionNumber('blessing')}</span><i /><span>A PRAYER FOR US</span></div>{cross}<h2>{design.blessingTitle}</h2><p className="invite-preserve invite-blessing-copy">{design.blessing}</p><span className="invite-blessing-amen">Amen.</span></section>),
  };
  return (
    <main className={`invitation invite-template--${design.template}${preview ? ' invitation--preview' : ''}`} data-theme={data.theme} data-template={design.template} data-font={design.font} data-background={design.background} data-font-size={design.fontSize} data-photo-shape={design.photoShape} data-decoration={design.showDecoration} style={style} ref={root}>
      <MusicPlayer settings={features.music} preview={preview} />
      <section className="invite-hero" aria-labelledby="wedding-title">{heroLayouts[design.template]}</section>
      {visibleSections.map(id => <div key={id} className="invite-section-wrapper">{sections[id]}</div>)}
      <footer className="invite-closing invite-reveal">{decoration}<p className="invite-preserve">{data.closing}</p><span className="invite-closing-script invite-preserve">{design.closingTitle}</span><div className="invite-closing-names">{data.groom.name}<Heart size={10} strokeWidth={1.2} />{data.bride.name}</div>{!preview && <InvitationSharing names={`${data.groom.name} · ${data.bride.name}`} kakaoJavascriptKey={features.sharing.kakaoJavascriptKey} />}<div className="invite-footer-mark"><span>WITH LOVE,</span><strong>{data.groom.englishName || data.groom.name} & {data.bride.englishName || data.bride.name}</strong></div></footer>

      {copied && <div className="invite-toast" role="status"><Check size={15} />{copied}</div>}
      <dialog className="invite-lightbox" ref={galleryDialog} onCancel={() => setLightbox(null)} onClick={event => { if (event.target === event.currentTarget) setLightbox(null); }} onKeyDown={event => { if (lightbox === null) return; if (event.key === 'ArrowRight') setLightbox((lightbox + 1) % data.photos.length); if (event.key === 'ArrowLeft') setLightbox((lightbox - 1 + data.photos.length) % data.photos.length); }} aria-label="웨딩 사진 크게 보기"><button className="invite-dialog-close" aria-label="사진 닫기" onClick={() => setLightbox(null)}><X size={24} /></button>{lightbox !== null && data.photos[lightbox] && <><img src={data.photos[lightbox].url} alt={data.photos[lightbox].alt || '웨딩 사진'} /><div className="invite-lightbox-controls"><button aria-label="이전 사진" onClick={() => setLightbox((lightbox - 1 + data.photos.length) % data.photos.length)}><ChevronLeft size={23} /></button><span>{lightbox + 1} / {data.photos.length}</span><button aria-label="다음 사진" onClick={() => setLightbox((lightbox + 1) % data.photos.length)}><ChevronRight size={23} /></button></div></>}</dialog>
      <dialog className="invite-contact-dialog" ref={contactDialog} onCancel={() => setContactOpen(false)} onClick={event => { if (event.target === event.currentTarget) setContactOpen(false); }} aria-labelledby="contact-title"><button className="invite-contact-close" aria-label="연락처 닫기" onClick={() => setContactOpen(false)}><X size={20} /></button><p className="invite-kicker">WITH YOUR BLESSING</p><h2 id="contact-title">축하의 마음 전하기</h2>{personRows.map((person, i) => person.phone && <div className="invite-contact-row" key={i}><span>{i === 0 ? '신랑' : '신부'}<strong>{person.name}</strong></span><div><a href={`tel:${person.phone.replace(/[^\d+]/g, '')}`} aria-label={`${person.name}에게 전화하기`}><Phone size={18} /></a><a href={`sms:${person.phone.replace(/[^\d+]/g, '')}`} aria-label={`${person.name}에게 문자 보내기`}><MessageCircle size={18} /></a></div></div>)}</dialog>
    </main>
  );
}
