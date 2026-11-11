import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { applyStylePack, backgrounds, defaultDesign, fonts, randomizeStyle, recommendedStylePacks, sectionIds, stylePacks } from '../src/lib/design';
import type { WeddingData, WeddingDesign } from '../src/lib/types';
import { isWeddingData, normalizeWedding, sameWeddingContent } from '../src/lib/validation';

const visualFields = new Set(['template', 'font', 'background', 'photoShape', 'galleryLayout', 'showDecoration', 'accentColor']);
function personalInvitation(): WeddingData {
  const data = structuredClone(defaultWedding);
  data.groom = { name: '테스트 신랑', englishName: 'Test Groom', phone: '010-0000-0000', father: '신랑 아버지', mother: '신랑 어머니' };
  data.bride = { name: '테스트 신부', englishName: 'Test Bride', phone: '010-0000-0001', father: '신부 아버지', mother: '신부 어머니' };
  data.date = '2027-05-22'; data.time = '14:30';
  data.invitation = '두 사람이 직접 쓴 초대의 말'; data.closing = '직접 쓴 감사의 인사';
  data.showVerse = false; data.verse = '직접 고른 말씀'; data.verseReference = '직접 정한 말씀 출처';
  data.coverPhoto = 'https://example.test/our-cover.webp';
  data.photos = [{ id: 'our-moment-1', url: 'https://example.test/moment-1.webp', alt: '직접 쓴 사진 설명' }];
  data.venue = { name: '테스트 예식장', hall: '우리의 홀', address: '테스트 주소', lat: 37.5665, lng: 126.978, transport: '직접 쓴 교통 안내', parking: '직접 쓴 주차 안내' };
  data.accounts = [{ id: 'our-account', side: 'bride', bank: '테스트은행', holder: '테스트 신부', number: '000-000' }];
  data.design = {
    ...data.design, fontSize: 'large', accentColor: '#123456', photoPosition: 73,
    heroTitle: 'Our own title', heroSubtitle: '우리의 한 줄', closingTitle: 'Our own closing',
    sectionOrder: [...sectionIds].reverse(), hiddenSections: ['verse', 'gallery', 'accounts'],
    sectionTitles: { invitation: '우리의 초대', gallery: '우리의 순간', location: '우리의 장소', accounts: '우리의 마음' },
    showBlessing: false, blessingTitle: '직접 쓴 기도 제목', blessing: '직접 쓴 기도문',
  };
  return data;
}
function nonVisualContent(data: WeddingData) {
  return {
    wedding: Object.fromEntries(Object.entries(data).filter(([key]) => !['theme', 'design'].includes(key))),
    design: Object.fromEntries(Object.entries(data.design).filter(([key]) => !visualFields.has(key))),
  };
}
function visualCombination(data: WeddingData): string {
  return JSON.stringify([data.theme, ...[...visualFields].map(key => data.design[key as keyof WeddingDesign])]);
}

describe('curated one-click styles protect the couple’s saved information', () => {
  it('offers twelve distinct visual combinations and four first-choice recommendations', () => {
    expect(stylePacks).toHaveLength(12);
    expect(recommendedStylePacks.map(pack => pack.id)).toEqual(stylePacks.slice(0, 4).map(pack => pack.id));
    expect(recommendedStylePacks).toHaveLength(4);
    expect(new Set(stylePacks.map(pack => pack.id)).size).toBe(stylePacks.length);
    const data = personalInvitation();
    expect(new Set(stylePacks.map(pack => visualCombination(applyStylePack(data, pack.id)))).size).toBe(stylePacks.length);
  });

  it.each(stylePacks.map(pack => [pack.id]))('style %s changes only visual options and preserves all personal/faith content', id => {
    const data = personalInvitation();
    const original = structuredClone(data);
    const pack = stylePacks.find(item => item.id === id)!;
    const next = applyStylePack(data, id);
    expect(nonVisualContent(next)).toEqual(nonVisualContent(original));
    expect(next.theme).toBe(pack.theme);
    expect(next.design).toMatchObject({ template: pack.template, font: pack.font, background: pack.background, photoShape: pack.photoShape, galleryLayout: pack.galleryLayout, showDecoration: pack.showDecoration, accentColor: '' });
    expect(next.showVerse).toBe(false);
    expect(next.design.showBlessing).toBe(false);
    expect(next.design.photoPosition).toBe(73);
    expect(isWeddingData(next)).toBe(true);
    expect(data).toEqual(original);
  });

  it('preserves enabled faith options and their custom section order when selecting a non-chapel style', () => {
    const data = personalInvitation();
    data.showVerse = true; data.design.showBlessing = true;
    const next = applyStylePack(data, 'modern');
    expect(nonVisualContent(next)).toEqual(nonVisualContent(data));
    expect(next.showVerse).toBe(true);
    expect(next.design.showBlessing).toBe(true);
  });

  it('does not mutate the shared default invitation or default design', () => {
    const originalWedding = structuredClone(defaultWedding);
    const originalDesign = structuredClone(defaultDesign);
    for (const pack of stylePacks) applyStylePack(defaultWedding, pack.id);
    randomizeStyle(defaultWedding, () => 0);
    expect(defaultWedding).toEqual(originalWedding);
    expect(defaultDesign).toEqual(originalDesign);
  });

  it('rejects an unknown pack without modifying the current invitation', () => {
    const data = personalInvitation(); const before = structuredClone(data);
    expect(() => applyStylePack(data, 'unknown-pack')).toThrow();
    expect(data).toEqual(before);
  });
});

describe('random style choices are safe and visibly different', () => {
  it.each(stylePacks.map(pack => [pack.id]))('never repeats the active %s combination for edge/random values', id => {
    const data = applyStylePack(personalInvitation(), id);
    const before = structuredClone(data);
    for (const sample of [0, 0.25, 0.75, 1 - Number.EPSILON, 1, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = randomizeStyle(data, () => sample);
      expect(visualCombination(result.data)).not.toBe(visualCombination(data));
      expect(nonVisualContent(result.data)).toEqual(nonVisualContent(data));
      expect(stylePacks.some(pack => pack.id === result.pack.id)).toBe(true);
      expect(isWeddingData(result.data)).toBe(true);
    }
    expect(data).toEqual(before);
  });

  it('selects deterministic first/last alternatives and safely handles NaN', () => {
    const data = applyStylePack(personalInvitation(), stylePacks[0].id);
    expect(randomizeStyle(data, () => 0).pack.id).toBe(stylePacks[1].id);
    expect(randomizeStyle(data, () => Number.NaN).pack.id).toBe(stylePacks[1].id);
    expect(randomizeStyle(data, () => 1 - Number.EPSILON).pack.id).toBe(stylePacks.at(-1)!.id);
  });
});

describe('saved design compatibility and visual option validation', () => {
  it('fills a missing background on an older record without changing its content or mutating it', () => {
    const data = personalInvitation();
    const design: Partial<WeddingDesign> = structuredClone(data.design);
    delete design.background;
    const legacy = { ...data, design };
    const before = structuredClone(legacy);
    const upgraded = normalizeWedding(legacy);
    expect(upgraded.design.background).toBe(defaultDesign.background);
    expect(nonVisualContent(upgraded)).toEqual(nonVisualContent(data));
    expect(legacy).toEqual(before);
    // Persisted documents predate the new required property; comparison upgrades both sides.
    expect(sameWeddingContent(legacy as WeddingData, upgraded)).toBe(true);
  });

  it('detects an actual background change after upgrading an older published record', () => {
    const data = personalInvitation();
    const design: Partial<WeddingDesign> = { ...data.design }; delete design.background;
    const legacy = { ...data, design };
    const updated = normalizeWedding(legacy); updated.design.background = 'petals';
    expect(sameWeddingContent(legacy as WeddingData, updated)).toBe(false);
  });

  it('accepts all five fonts and six backgrounds in saved invitations', () => {
    expect(fonts).toHaveLength(5); expect(backgrounds).toHaveLength(6);
    for (const font of fonts) for (const background of backgrounds) {
      const data = personalInvitation(); data.design.font = font.id; data.design.background = background.id;
      expect(normalizeWedding(data)).toEqual(data);
      expect(isWeddingData(data)).toBe(true);
    }
  });

  it.each([
    { font: 'unknown-font' }, { font: 'url(javascript:alert(1))' },
    { background: 'unknown-background' }, { background: 'url(https://example.test/tracker)' },
  ])('rejects unsupported or executable visual options: %j', patch => {
    const data = personalInvitation();
    expect(() => normalizeWedding({ ...data, design: { ...data.design, ...patch } })).toThrow();
  });
});
