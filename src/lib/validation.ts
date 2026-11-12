import type { Person, WeddingData, WeddingGuestFeatures } from './types';
import { backgrounds, defaultDesign, fonts, getDesign, palettes, sectionIds, templates } from './design.ts';
import { defaultGuestFeatures, defaultWedding } from './defaults.ts';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, max = 3000): value is string => typeof value === 'string' && value.length <= max;

function calendarDate(value: unknown): boolean {
  if (!text(value, 10)) return false;
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function publicAudioUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

export function publicImageUrl(value: string): boolean {
  if (!value) return true;
  if (/^data:image\/(webp|jpeg|png|avif);base64,[A-Za-z0-9+/=]+$/.test(value)) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function isWeddingData(value: unknown): value is WeddingData {
  if (!record(value)) return false;
  const d = value as unknown as WeddingData;
  const person = (v: WeddingData['groom']) => record(v) && ['name', 'englishName', 'phone', 'father', 'mother', 'birthOrder', 'childName'].every(k => text(v[k as keyof typeof v], 100));
  const coordinate = (v: unknown, max: number) => v === null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max);
  return d.version === 1 && d.preferencesVersion === 1 && !!person(d.groom) && !!person(d.bride)
    && text(d.date, 10) && (!d.date || /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    && text(d.time, 5) && (!d.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))
    && ['invitation','closing','verse','verseReference'].every(k => text(d[k as keyof WeddingData]))
    && typeof d.showVerse === 'boolean' && palettes.some(p => p.id === d.theme)
    && text(d.coverPhoto, 16_000_000) && publicImageUrl(d.coverPhoto)
    && Array.isArray(d.photos) && d.photos.length <= 24 && d.photos.every(p => p && text(p.id, 100) && text(p.alt, 200) && text(p.url, 16_000_000) && publicImageUrl(p.url))
    && record(d.venue) && (['name','hall','address','transport','parking','subway','bus','car'] as const).every(k => text(d.venue[k]))
    && coordinate(d.venue.lat, 90) && coordinate(d.venue.lng, 180)
    && Array.isArray(d.accounts) && d.accounts.length <= 12 && d.accounts.every(a => a && ['groom','bride'].includes(a.side) && ['id','bank','number','holder'].every(k => text(a[k as keyof typeof a], 100)))
    && isValidDesign(d.design) && isValidGuestFeatures(d.guestFeatures);
}

function isValidGuestFeatures(value: unknown): boolean {
  if (!record(value)) return false;
  const f = value as unknown as WeddingGuestFeatures;
  return record(f.music) && typeof f.music.enabled === 'boolean' && ['builtin', 'url'].includes(f.music.source)
    && text(f.music.url, 2000) && publicAudioUrl(f.music.url) && Number.isFinite(f.music.volume) && f.music.volume >= 0 && f.music.volume <= 1
    && record(f.gallery) && Number.isInteger(f.gallery.collapsedRows) && f.gallery.collapsedRows >= 0 && f.gallery.collapsedRows <= 6
    && record(f.rsvp) && typeof f.rsvp.enabled === 'boolean' && text(f.rsvp.title, 100)
    && text(f.rsvp.groomMessage, 1500) && text(f.rsvp.brideMessage, 1500) && text(f.rsvp.note, 300)
    && record(f.snap) && typeof f.snap.enabled === 'boolean' && text(f.snap.title, 100) && calendarDate(f.snap.openDate) && text(f.snap.message, 1500)
    && record(f.shuttle) && typeof f.shuttle.enabled === 'boolean' && text(f.shuttle.title, 100) && text(f.shuttle.daejeon) && text(f.shuttle.gyeongju)
    && record(f.sharing) && text(f.sharing.kakaoJavascriptKey, 100) && /^(?:[a-fA-F0-9]{32})?$/.test(f.sharing.kakaoJavascriptKey);
}

function isValidDesign(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as WeddingData['design'];
  const designText = (v: unknown, max = 1000) => text(v, max);
  const sections = (v: unknown, full = false) => Array.isArray(v) && v.every(id => sectionIds.includes(id)) && new Set(v).size === v.length && (!full || v.length === sectionIds.length);
  return templates.some(t => t.id === d.template) && fonts.some(f => f.id === d.font) && backgrounds.some(b => b.id === d.background) && ['small','normal','large'].includes(d.fontSize)
    && typeof d.accentColor === 'string' && (d.accentColor === '' || /^#[0-9a-fA-F]{6}$/.test(d.accentColor))
    && designText(d.heroTitle, 100) && designText(d.heroSubtitle, 150) && designText(d.closingTitle, 150)
    && ['arch','rectangle','oval'].includes(d.photoShape) && Number.isFinite(d.photoPosition) && d.photoPosition >= 0 && d.photoPosition <= 100
    && ['mosaic','grid','film'].includes(d.galleryLayout) && typeof d.showDecoration === 'boolean'
    && sections(d.sectionOrder, true) && sections(d.hiddenSections) && !!d.sectionTitles && typeof d.sectionTitles === 'object'
    && ['invitation','gallery','location','accounts'].every(k => designText(d.sectionTitles[k as keyof typeof d.sectionTitles], 100))
    && typeof d.showBlessing === 'boolean' && designText(d.blessingTitle, 150) && designText(d.blessing, 3000);
}

function guestFeatures(value: unknown): WeddingGuestFeatures {
  if (value === undefined) return structuredClone(defaultGuestFeatures);
  if (!record(value)) throw new Error('하객 안내 설정 형식이 올바르지 않습니다.');
  const merged = structuredClone(defaultGuestFeatures);
  for (const key of Object.keys(defaultGuestFeatures) as (keyof WeddingGuestFeatures)[]) {
    const saved = value[key];
    if (saved !== undefined && !record(saved)) throw new Error('하객 안내 설정 형식이 올바르지 않습니다.');
    Object.assign(merged[key], saved);
  }
  return merged;
}

function upgradePerson(value: Person, known: Person, legacy: boolean): Person {
  if (!record(value)) return value;
  const samePerson = value.name === known.name;
  const next = {
    ...value,
    birthOrder: value.birthOrder === undefined ? (samePerson ? known.birthOrder : '') : value.birthOrder,
    childName: value.childName === undefined ? (samePerson ? known.childName : value.name) : value.childName,
  };
  if (legacy && samePerson) {
    for (const key of ['father', 'mother', 'birthOrder', 'childName'] as const) {
      if (typeof next[key] === 'string' && !next[key].trim()) next[key] = known[key];
    }
  }
  return next;
}

/** Upgrade old documents once; later intentional blanks and existing custom copy remain intact. */
export function normalizeWedding(value: unknown): WeddingData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('청첩장 파일 형식이 올바르지 않습니다.');
  const raw = value as WeddingData;
  if (raw.design !== undefined && (!raw.design || typeof raw.design !== 'object' || Array.isArray(raw.design))) throw new Error('디자인 설정 형식이 올바르지 않습니다.');
  // Validate stored lists before normalization: never silently repair duplicate/unknown section IDs.
  for (const list of [raw.design?.sectionOrder, raw.design?.hiddenSections]) {
    if (list !== undefined && (!Array.isArray(list) || list.some(id => !sectionIds.includes(id)) || new Set(list).size !== list.length)) throw new Error('청첩장 섹션 설정이 올바르지 않습니다.');
  }
  const legacy = raw.preferencesVersion === undefined;
  const blank = (v: unknown) => typeof v === 'string' && !v.trim();
  const venue = record(raw.venue) ? {
    ...raw.venue,
    subway: raw.venue.subway === undefined ? '' : raw.venue.subway,
    bus: raw.venue.bus === undefined ? '' : raw.venue.bus,
    car: raw.venue.car === undefined ? '' : raw.venue.car,
  } : raw.venue;
  if (legacy && venue && (blank(venue.name) || venue.name === defaultWedding.venue.name)) {
    for (const key of ['name', 'hall', 'address'] as const) {
      if (blank(venue[key])) venue[key] = defaultWedding.venue[key];
    }
  }
  const design = getDesign({ design: raw.design ?? structuredClone(defaultDesign) });
  if (legacy) design.galleryLayout = 'mosaic';
  const data: WeddingData = {
    ...raw,
    preferencesVersion: raw.preferencesVersion === undefined ? 1 : raw.preferencesVersion,
    groom: upgradePerson(raw.groom, defaultWedding.groom, legacy),
    bride: upgradePerson(raw.bride, defaultWedding.bride, legacy),
    date: legacy && blank(raw.date) ? defaultWedding.date : raw.date,
    time: legacy && blank(raw.time) ? defaultWedding.time : raw.time,
    venue,
    design,
    guestFeatures: guestFeatures(raw.guestFeatures),
  };
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
  if (d.guestFeatures.music.enabled && d.guestFeatures.music.source === 'url' && !d.guestFeatures.music.url.trim()) errors.push('직접 고른 배경음악의 HTTPS 음원 주소를 입력하거나 기본 음악을 선택해 주세요.');
  return errors;
}

/** Compare JSONB content independently of PostgreSQL's object-key ordering. */
export function sameWeddingContent(a: WeddingData, b: WeddingData): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([x], [y]) => x.localeCompare(y)).map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(normalizeWedding(a))) === JSON.stringify(canonical(normalizeWedding(b)));
}
