import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Heart, MapPin, MessageCircle, Phone, Share2, X } from 'lucide-react';
import type { WeddingData } from '../lib/types';
import { copyText } from '../lib/utils';
import '../styles/invitation.css';

interface InvitationProps { data: WeddingData; preview?: boolean }
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function weddingDate(data: WeddingData) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return null;
  const parsed = new Date(`${data.date}T${data.time || '00:00'}:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const [now, setNow] = useState(Date.now());
  const galleryDialog = useRef<HTMLDialogElement>(null);
  const contactDialog = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLElement>(null);
  const date = weddingDate(data);
  const eventMillis = date?.getTime();
  const hasContacts = Boolean(data.groom.phone || data.bride.phone);
  const hasVenue = Boolean(data.venue.name || data.venue.address);
  const validCoordinates = typeof data.venue.lat === 'number' && typeof data.venue.lng === 'number' && Number.isFinite(data.venue.lat) && Number.isFinite(data.venue.lng) && Math.abs(data.venue.lat) <= 90 && Math.abs(data.venue.lng) <= 180;
  const venueQuery = encodeURIComponent(`${data.venue.name} ${data.venue.address}`.trim());

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

  async function share() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    const shareData = { title: `${data.groom.name} · ${data.bride.name}의 결혼식`, text: '소중한 당신을 초대합니다.', url: url.toString() };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) await copy(url.toString(), '청첩장 링크를 복사했어요');
      }
    } else await copy(url.toString(), '청첩장 링크를 복사했어요');
  }

  const remaining = eventMillis ? eventMillis - now : 0;
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

  return (
    <main className={`invitation${preview ? ' invitation--preview' : ''}`} data-theme={data.theme} ref={root}>
      <section className="invite-hero" aria-labelledby="wedding-title">
        <div className="invite-masthead"><span>THE WEDDING OF</span><span className="invite-small-heart"><Heart size={12} strokeWidth={1.3} /> TWO HEARTS, ONE STORY</span></div>
        <div className="invite-hero-heading">
          <p className="invite-kicker">함께여서, 더 아름다운 날</p>
          <h1 id="wedding-title">With you,<br /><em>always.</em><span className="invite-title-star" aria-hidden="true"><svg width="38" height="38" viewBox="0 0 40 40" fill="none"><path d="M20 2V38M2 20H38M7 7L33 33M7 33L33 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span></h1>
          <p className="invite-english-names">{data.groom.englishName || data.groom.name} <span>&</span> {data.bride.englishName || data.bride.name}</p>
        </div>
        <div className={`invite-cover${data.coverPhoto ? ' invite-cover--photo' : ''}`}>
          <img src={data.coverPhoto || `${import.meta.env.BASE_URL}botanical-still-life.svg`} alt={data.coverPhoto ? `${data.groom.name}와 ${data.bride.name}의 웨딩 사진` : '올리브 가지와 크림빛 꽃을 리본으로 묶은 웨딩 일러스트'} className="invite-cover-image" fetchPriority="high" />
          {!data.coverPhoto && <span className="invite-cover-note">a little love, a lifetime together</span>}
          <div className="invite-cover-stamp" aria-hidden="true"><span>TOGETHER</span><Heart size={19} strokeWidth={1} /><span>IS A BEAUTIFUL PLACE</span></div>
        </div>
        <div className="invite-hero-details">
          <div className="invite-korean-names"><span>{data.groom.name}</span><span className="invite-name-divider">&</span><span>{data.bride.name}</span></div>
          {date ? <p className="invite-hero-date">{dateLabel(date, data.time)}</p> : <p className="invite-hero-date invite-muted">우리의 소중한 날을 준비하고 있어요</p>}
          {hasVenue && <p className="invite-hero-venue">{data.venue.name} {data.venue.hall}</p>}
        </div>
        <a href="#our-invitation" className="invite-scroll" onClick={event => {
          event.preventDefault();
          root.current?.querySelector('#our-invitation')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
        }}><span>OUR STORY BEGINS</span><ArrowDown size={14} strokeWidth={1.2} /></a>
      </section>

      <section id="our-invitation" className="invite-section invite-letter invite-reveal">
        <div className="invite-section-index"><span>01</span><i /><span>INVITATION</span></div>
        <img src={`${import.meta.env.BASE_URL}olive-sprig.svg`} className="invite-sprig" alt="" />
        <h2>우리, 결혼합니다.</h2>
        <p className="invite-preserve invite-letter-copy">{data.invitation}</p>
        <div className="invite-family">
          {personRows.map((person, index) => <div className="invite-family-row" key={index}>
            {(person.father || person.mother) && <span className="invite-parents">{[person.father, person.mother].filter(Boolean).join(' · ')}<span className="invite-relation">의 {index === 0 ? '아들' : '딸'}</span></span>}
            {!person.father && !person.mother && <span className="invite-relation">{index === 0 ? '신랑' : '신부'}</span>}
            <strong>{person.name}</strong>
          </div>)}
        </div>
        {hasContacts && <button className="invite-outline-button" onClick={() => setContactOpen(true)}><Phone size={14} strokeWidth={1.4} />축하의 연락 전하기</button>}
      </section>

      {data.showVerse && data.verse && <section className="invite-verse invite-reveal"><span className="invite-verse-cross" aria-hidden="true">✝</span><p className="invite-preserve">{data.verse}</p><small>{data.verseReference}</small></section>}

      {date && <section className="invite-section invite-calendar-section invite-reveal">
        <div className="invite-section-index"><span>02</span><i /><span>OUR DAY</span></div>
        <h2 className="invite-calendar-title">{String(year)}<span>.</span>{String(month).padStart(2, '0')}<span>.</span>{String(day).padStart(2, '0')}</h2>
        <p className="invite-subtitle">{dateLabel(date, data.time)}</p>
        <div className="invite-calendar" aria-label={`${year}년 ${month}월 달력`}>
          <div className="invite-calendar-row invite-calendar-weekdays">{weekdays.map((weekday, i) => <span key={weekday} className={i === 0 ? 'is-sunday' : ''}>{weekday}</span>)}</div>
          <div className="invite-calendar-grid">{Array.from({ length: firstDay }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: daysInMonth }, (_, i) => <span key={i + 1} className={`${i + 1 === day ? 'is-wedding-day' : ''} ${(firstDay + i) % 7 === 0 ? 'is-sunday' : ''}`} aria-label={i + 1 === day ? `${i + 1}일, 결혼식` : undefined}>{i + 1 === day && <Heart size={38} fill="currentColor" strokeWidth={0} className="invite-calendar-heart" />}<span>{i + 1}</span></span>)}</div>
        </div>
        {remaining > 0 ? <><div className="invite-countdown"><div><strong>{String(days).padStart(2, '0')}</strong><span>DAYS</span></div><i>:</i><div><strong>{String(hours).padStart(2, '0')}</strong><span>HOURS</span></div><i>:</i><div><strong>{String(minutes).padStart(2, '0')}</strong><span>MINUTES</span></div></div><p className="invite-countdown-note">두 사람이 하나 되는 날까지 <strong>{Math.ceil(remaining / 86_400_000)}일</strong></p></> : <p className="invite-countdown-note">우리의 시작을 함께 축복해 주셔서 감사합니다.</p>}
      </section>}

      <section id="our-moments" className="invite-section invite-gallery-section invite-reveal">
        <div className="invite-section-index"><span>{date ? '03' : '02'}</span><i /><span>OUR MOMENTS</span></div>
        <h2>사랑이 머문 순간들</h2>
        <p className="invite-subtitle">평범한 날들이, 당신과 함께 특별해졌습니다.</p>
        {data.photos.length > 0 ? <div className="invite-gallery">{data.photos.map((photo, index) => <button className={`invite-gallery-item${index % 5 === 0 ? ' invite-gallery-item--wide' : ''}`} key={photo.id} onClick={() => setLightbox(index)} aria-label={`${photo.alt || '웨딩 사진'} ${index + 1} 크게 보기`}><img src={photo.url} alt={photo.alt || `함께한 순간 ${index + 1}`} loading="lazy" /><span><ArrowUpRight size={20} /></span></button>)}</div> : <div className="invite-gallery-empty"><div className="invite-empty-frame"><Heart size={21} strokeWidth={1} /><span>our moments</span></div><p>소중한 순간들을<br />곧 이곳에 담아둘게요.</p></div>}
      </section>

      <section id="location" className="invite-section invite-location-section invite-reveal">
        <div className="invite-section-index"><span>{date ? '04' : '03'}</span><i /><span>LOCATION</span></div>
        <h2>마음이 만나는 곳</h2>
        {hasVenue ? <>
          <h3 className="invite-venue-name">{data.venue.name}</h3>
          {data.venue.hall && <p className="invite-venue-hall">{data.venue.hall}</p>}
          {data.venue.address && <div className="invite-address"><span>{data.venue.address}</span><button aria-label="주소 복사" onClick={() => copy(data.venue.address, '주소를 복사했어요')}><Copy size={14} /></button></div>}
          {validCoordinates ? <iframe className="invite-map" title={`${data.venue.name || '예식장'} 위치 지도`} loading="lazy" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${data.venue.lng! - 0.006}%2C${data.venue.lat! - 0.004}%2C${data.venue.lng! + 0.006}%2C${data.venue.lat! + 0.004}&layer=mapnik&marker=${data.venue.lat}%2C${data.venue.lng}`} /> : <div className="invite-location-placeholder"><MapPin size={27} strokeWidth={1} /><span>아래 지도 앱에서 길을 확인해 주세요.</span></div>}
          <div className="invite-map-links"><a href={`https://map.naver.com/p/search/${venueQuery}`} target="_blank" rel="noreferrer"><span className="invite-map-icon invite-map-icon--naver">N</span>네이버 지도<ArrowUpRight size={13} /></a><a href={`https://map.kakao.com/?q=${venueQuery}`} target="_blank" rel="noreferrer"><span className="invite-map-icon invite-map-icon--kakao">K</span>카카오맵<ArrowUpRight size={13} /></a></div>
          {(data.venue.transport || data.venue.parking) && <div className="invite-directions">{data.venue.transport && <div><h4>대중교통 안내</h4><p className="invite-preserve">{data.venue.transport}</p></div>}{data.venue.parking && <div><h4>주차 안내</h4><p className="invite-preserve">{data.venue.parking}</p></div>}</div>}
        </> : <div className="invite-venue-pending"><MapPin size={25} strokeWidth={1} /><p>소중한 분들을 모실 공간을<br />정성껏 준비하고 있어요.</p><span>장소가 정해지면 이곳에서 안내드릴게요.</span></div>}
      </section>

      {data.accounts.length > 0 && <section className="invite-section invite-accounts invite-reveal"><div className="invite-section-index"><span>WITH LOVE</span><i /><Heart size={12} strokeWidth={1.2} /></div><h2>마음 전하실 곳</h2><p className="invite-subtitle">보내주시는 따뜻한 마음, 소중히 간직하겠습니다.</p>{(['groom', 'bride'] as const).map(side => {
        const accounts = data.accounts.filter(account => account.side === side);
        if (!accounts.length) return null;
        return <details className="invite-account-group" key={side}><summary>{side === 'groom' ? '신랑' : '신부'}측 계좌번호<span>+</span></summary><div>{accounts.map(account => <div className="invite-account" key={account.id}><div><strong>{account.bank} <span>{account.number}</span></strong><span>{account.holder}</span></div><button onClick={() => copy(account.number, '계좌번호를 복사했어요')} aria-label={`${account.holder} 계좌번호 복사`}><Copy size={13} />복사</button></div>)}</div></details>;
      })}</section>}

      <footer className="invite-closing invite-reveal"><img src={`${import.meta.env.BASE_URL}olive-sprig.svg`} className="invite-sprig" alt="" /><p className="invite-preserve">{data.closing}</p><span className="invite-closing-script">Forever begins with us.</span><div className="invite-closing-names">{data.groom.name}<Heart size={10} strokeWidth={1.2} />{data.bride.name}</div><button className="invite-share" onClick={share}><Share2 size={15} strokeWidth={1.4} />청첩장 공유하기</button><div className="invite-footer-mark"><span>WITH LOVE,</span><strong>{data.groom.englishName || data.groom.name} & {data.bride.englishName || data.bride.name}</strong></div></footer>

      {copied && <div className="invite-toast" role="status"><Check size={15} />{copied}</div>}
      <dialog className="invite-lightbox" ref={galleryDialog} onCancel={() => setLightbox(null)} onClick={event => { if (event.target === event.currentTarget) setLightbox(null); }} onKeyDown={event => { if (lightbox === null) return; if (event.key === 'ArrowRight') setLightbox((lightbox + 1) % data.photos.length); if (event.key === 'ArrowLeft') setLightbox((lightbox - 1 + data.photos.length) % data.photos.length); }} aria-label="웨딩 사진 크게 보기"><button className="invite-dialog-close" aria-label="사진 닫기" onClick={() => setLightbox(null)}><X size={24} /></button>{lightbox !== null && data.photos[lightbox] && <><img src={data.photos[lightbox].url} alt={data.photos[lightbox].alt || '웨딩 사진'} /><div className="invite-lightbox-controls"><button aria-label="이전 사진" onClick={() => setLightbox((lightbox - 1 + data.photos.length) % data.photos.length)}><ChevronLeft size={23} /></button><span>{lightbox + 1} / {data.photos.length}</span><button aria-label="다음 사진" onClick={() => setLightbox((lightbox + 1) % data.photos.length)}><ChevronRight size={23} /></button></div></>}</dialog>
      <dialog className="invite-contact-dialog" ref={contactDialog} onCancel={() => setContactOpen(false)} onClick={event => { if (event.target === event.currentTarget) setContactOpen(false); }} aria-labelledby="contact-title"><button className="invite-contact-close" aria-label="연락처 닫기" onClick={() => setContactOpen(false)}><X size={20} /></button><p className="invite-kicker">WITH YOUR BLESSING</p><h2 id="contact-title">축하의 마음 전하기</h2>{personRows.map((person, i) => person.phone && <div className="invite-contact-row" key={i}><span>{i === 0 ? '신랑' : '신부'}<strong>{person.name}</strong></span><div><a href={`tel:${person.phone.replace(/[^\d+]/g, '')}`} aria-label={`${person.name}에게 전화하기`}><Phone size={18} /></a><a href={`sms:${person.phone.replace(/[^\d+]/g, '')}`} aria-label={`${person.name}에게 문자 보내기`}><MessageCircle size={18} /></a></div></div>)}</dialog>
    </main>
  );
}
