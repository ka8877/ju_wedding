import type { WeddingData } from './types';
import { defaultDesign, getDesign, palettes, sectionIds, templates } from './design.ts';

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
    && typeof d.showVerse === 'boolean' && palettes.some(p => p.id === d.theme)
    && text(d.coverPhoto, 16_000_000) && publicImageUrl(d.coverPhoto)
    && Array.isArray(d.photos) && d.photos.length <= 24 && d.photos.every(p => p && text(p.id, 100) && text(p.alt, 200) && text(p.url, 16_000_000) && publicImageUrl(p.url))
    && !!d.venue && ['name','hall','address','transport','parking'].every(k => text(d.venue[k as keyof typeof d.venue]))
    && coordinate(d.venue.lat, 90) && coordinate(d.venue.lng, 180)
    && Array.isArray(d.accounts) && d.accounts.length <= 12 && d.accounts.every(a => a && ['groom','bride'].includes(a.side) && ['id','bank','number','holder'].every(k => text(a[k as keyof typeof a], 100)))
    && isValidDesign(d.design);
}

function isValidDesign(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as WeddingData['design'];
  const text = (v: unknown, max = 1000) => typeof v === 'string' && v.length <= max;
  const sections = (v: unknown, full = false) => Array.isArray(v) && v.every(id => sectionIds.includes(id)) && new Set(v).size === v.length && (!full || v.length === sectionIds.length);
  return templates.some(t => t.id === d.template) && ['serif','sans','romantic'].includes(d.font) && ['small','normal','large'].includes(d.fontSize)
    && typeof d.accentColor === 'string' && (d.accentColor === '' || /^#[0-9a-fA-F]{6}$/.test(d.accentColor))
    && text(d.heroTitle, 100) && text(d.heroSubtitle, 150) && text(d.closingTitle, 150)
    && ['arch','rectangle','oval'].includes(d.photoShape) && Number.isFinite(d.photoPosition) && d.photoPosition >= 0 && d.photoPosition <= 100
    && ['mosaic','grid','film'].includes(d.galleryLayout) && typeof d.showDecoration === 'boolean'
    && sections(d.sectionOrder, true) && sections(d.hiddenSections) && !!d.sectionTitles && typeof d.sectionTitles === 'object'
    && ['invitation','gallery','location','accounts'].every(k => text(d.sectionTitles[k as keyof typeof d.sectionTitles], 100))
    && typeof d.showBlessing === 'boolean' && text(d.blessingTitle, 150) && text(d.blessing, 3000);
}

/** Fill additive design defaults without losing any previously saved wedding information. */
export function normalizeWedding(value: unknown): WeddingData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('청첩장 파일 형식이 올바르지 않습니다.');
  const raw = value as WeddingData;
  if (raw.design !== undefined && (!raw.design || typeof raw.design !== 'object' || Array.isArray(raw.design))) throw new Error('디자인 설정 형식이 올바르지 않습니다.');
  // Validate stored lists before normalization: never silently repair duplicate/unknown section IDs.
  for (const list of [raw.design?.sectionOrder, raw.design?.hiddenSections]) {
    if (list !== undefined && (!Array.isArray(list) || list.some(id => !sectionIds.includes(id)) || new Set(list).size !== list.length)) throw new Error('청첩장 섹션 설정이 올바르지 않습니다.');
  }
  const data = { ...raw, design: getDesign({ design: raw.design ?? structuredClone(defaultDesign) }) };
  if (!isWeddingData(data)) throw new Error('청첩장 데이터 형식을 확인할 수 없습니다.');
  return data;
}

export function publicationErrors(d: WeddingData): string[] {
  const errors: string[] = [];
  if (!d.groom.name.trim() || !d.bride.name.trim()) errors.push('신랑과 신부의 이름을 입력해 주세요.');
  const date = new Date(`${d.date}T${d.time || '00:00'}:00+09:00`);
  if (d.date && (!Number.isFinite(date.getTime()) || date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) !== d.date)) errors.push('올바른 예식 날짜를 선택해 주세요.');
  if (d.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)) errors.push('올바른 예식 시간을 선택해 주세요.');
  if (d.accounts.some(a => !a.bank.trim() || !a.number.trim() || !a.holder.trim())) errors.push('추가한 계좌의 은행, 계좌번호, 예금주를 모두 입력하거나 빈 계좌를 삭제해 주세요.');
  return errors;
}

/** Compare JSONB content independently of PostgreSQL's object-key ordering. */
export function sameWeddingContent(a: WeddingData, b: WeddingData): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([x], [y]) => x.localeCompare(y)).map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(normalizeWedding(a))) === JSON.stringify(canonical(normalizeWedding(b)));
}
