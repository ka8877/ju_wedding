import type { WeddingData } from './types';
import { publicInvitationUrl } from './sharing';

const escapeText = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const timestamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

// RFC 5545 folds at 75 UTF-8 octets, without splitting Korean characters.
function fold(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let part = '', size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 75) { lines.push(part); part = ' '; size = 1; }
    part += character; size += bytes;
  }
  lines.push(part);
  return lines.join('\r\n');
}
function getCalendarEvent(data: WeddingData) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) return null;
  const start = new Date(`${data.date}T${data.time}:00+09:00`);
  if (!Number.isFinite(start.getTime()) || start.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) !== data.date) return null;
  return {
    start,
    summary: `${data.groom.name} · ${data.bride.name} 결혼식`,
    location: [data.venue.name, data.venue.hall, data.venue.address].filter(Boolean).join(' '),
  };
}

export function googleWeddingCalendarUrl(data: WeddingData, openAndroidApp = false): string | null {
  const event = getCalendarEvent(data);
  if (!event) return null;
  const { start, summary, location } = event;
  // Google requires an end time in the template. Guests can edit it before saving.
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const url = new URL('https://calendar.google.com/calendar/render');
  url.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${timestamp(start)}/${timestamp(end)}`,
    stz: 'Asia/Seoul',
    etz: 'Asia/Seoul',
    location,
    details: `청첩장: ${publicInvitationUrl}`,
  }).toString();
  return openAndroidApp
    ? `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(url.href)};end`
    : url.href;
}

export function makeWeddingCalendar(data: WeddingData, options: { now?: Date; url?: string } = {}): string | null {
  const event = getCalendarEvent(data);
  if (!event) return null;
  const { start, summary, location } = event;
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(`${data.groom.name}|${data.bride.name}|${data.date}`)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  let site = '';
  try {
    const parsed = new URL(options.url || '');
    if (['http:', 'https:'].includes(parsed.protocol)) { parsed.hash = ''; parsed.search = ''; site = parsed.href; }
  } catch { /* A share URL is optional; it never prevents calendar export. */ }
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Jo and Joo//Wedding Invitation//KO','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:wedding-${data.date.replaceAll('-', '')}-${hash.toString(16)}@jo-and-joo`,
    `DTSTAMP:${timestamp(options.now ?? new Date())}`, `DTSTART:${timestamp(start)}`, `SUMMARY:${escapeText(summary)}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    `DESCRIPTION:${escapeText([data.invitation, site ? `청첩장: ${site}` : ''].filter(Boolean).join('\n\n'))}`,
    ...(site ? [`URL:${site}`] : []), 'END:VEVENT','END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function downloadWeddingCalendar(data: WeddingData): boolean {
  const contents = makeWeddingCalendar(data, { url: publicInvitationUrl });
  if (!contents) return false;
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `juyoung-hyunbum-${data.date}.ics`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
