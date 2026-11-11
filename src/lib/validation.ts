import type { WeddingData } from './types';

export function publicImageUrl(value: string): boolean {
  if (!value) return true;
  if (/^data:image\/(webp|jpeg|png|avif);base64,[A-Za-z0-9+/=]+$/.test(value)) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function isWeddingData(value: unknown): value is WeddingData {
  if (!value || typeof value !== 'object') return false;
  const d = value as WeddingData;
  const text = (v: unknown, max = 3000) => typeof v === 'string' && v.length <= max;
  const person = (v: WeddingData['groom']) => v && ['name', 'englishName', 'phone', 'father', 'mother'].every(k => text(v[k as keyof typeof v], 100));
  const coordinate = (v: unknown, max: number) => v === null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max);
  return d.version === 1 && !!person(d.groom) && !!person(d.bride)
    && text(d.date, 10) && (!d.date || /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    && text(d.time, 5) && (!d.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))
    && ['invitation','closing','verse','verseReference'].every(k => text(d[k as keyof WeddingData]))
    && typeof d.showVerse === 'boolean' && ['olive','rose','sand'].includes(d.theme)
    && text(d.coverPhoto, 16_000_000) && publicImageUrl(d.coverPhoto)
    && Array.isArray(d.photos) && d.photos.length <= 24 && d.photos.every(p => p && text(p.id, 100) && text(p.alt, 200) && text(p.url, 16_000_000) && publicImageUrl(p.url))
    && !!d.venue && ['name','hall','address','transport','parking'].every(k => text(d.venue[k as keyof typeof d.venue]))
    && coordinate(d.venue.lat, 90) && coordinate(d.venue.lng, 180)
    && Array.isArray(d.accounts) && d.accounts.length <= 12 && d.accounts.every(a => a && ['groom','bride'].includes(a.side) && ['id','bank','number','holder'].every(k => text(a[k as keyof typeof a], 100)));
}

export function publicationErrors(d: WeddingData): string[] {
  const errors: string[] = [];
  if (!d.groom.name.trim() || !d.bride.name.trim()) errors.push('신랑과 신부의 이름을 입력해 주세요.');
  const date = new Date(`${d.date}T${d.time || '00:00'}:00+09:00`);
  if (!d.date || !Number.isFinite(date.getTime()) || date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) !== d.date) errors.push('올바른 예식 날짜를 선택해 주세요.');
  if (!d.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)) errors.push('예식 시간을 선택해 주세요.');
  if (!d.venue.name.trim() || !d.venue.address.trim()) errors.push('예식장 이름과 주소를 입력해 주세요.');
  if (d.accounts.some(a => !a.bank.trim() || !a.number.trim() || !a.holder.trim())) errors.push('추가한 계좌의 은행, 계좌번호, 예금주를 모두 입력하거나 빈 계좌를 삭제해 주세요.');
  return errors;
}
