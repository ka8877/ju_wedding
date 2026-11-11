import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { applyTemplate, defaultDesign, getDesign, palettes, sectionIds, templates } from '../src/lib/design';
import { isWeddingData, normalizeWedding } from '../src/lib/validation';

describe('saved invitation compatibility', () => {
  it('upgrades existing invitations without changing names, photos or accounts', () => {
    const saved = structuredClone(defaultWedding);
    saved.invitation = '주영님이 직접 쓴 문구';
    saved.photos = [{ id: '1', url: 'https://example.com/moment.webp', alt: '함께한 날' }];
    saved.accounts = [{ id: '1', side: 'bride', bank: '은행', holder: '권주영', number: '123' }];
    const { design: _oldDesign, ...legacy } = saved;
    const upgraded = normalizeWedding(legacy);
    expect(upgraded).toEqual({ ...saved, design: defaultDesign });
    expect(legacy).not.toHaveProperty('design');
  });
  it('adds new design options to partial saved designs without dropping custom titles', () => {
    const upgraded = normalizeWedding({ ...defaultWedding, design: { template: 'letter', heroTitle: '우리만의 제목', sectionOrder: ['gallery', 'invitation'] } });
    expect(upgraded.design.heroTitle).toBe('우리만의 제목');
    expect(upgraded.design.sectionOrder).toEqual(['gallery','invitation',...sectionIds.filter(id => !['gallery','invitation'].includes(id))]);
  });
  it.each([
    { accentColor: 'url(javascript:alert(1))' }, { sectionOrder: ['gallery','gallery'] },
    { hiddenSections: ['not-a-section'] }, { photoPosition: 101 }, { template: 'unknown' }, { font: 'unknown' },
  ])('rejects malformed imported customizations: %j', patch => {
    expect(() => normalizeWedding({ ...defaultWedding, design: { ...defaultDesign, ...patch } })).toThrow();
  });
});

describe('safe self-service design changes', () => {
  it.each(templates.map(p => [p.id]))('template %s preserves all wedding details and custom copy', id => {
    const data = structuredClone(defaultWedding);
    data.design.heroTitle = '두 사람이 직접 지은 제목';
    data.design.heroSubtitle = '우리의 소중한 한 줄';
    data.verse = '직접 고른 말씀'; data.invitation = '직접 쓴 초대';
    data.coverPhoto = 'https://example.com/cover.webp'; data.date = '2027-05-22';
    data.venue.name = '두 사람의 예식장';
    const next = applyTemplate(data, id);
    for (const field of ['groom','bride','date','venue','accounts','coverPhoto','photos','invitation','verse'] as const) expect(next[field]).toEqual(data[field]);
    expect(next.design.heroTitle).toBe(data.design.heroTitle);
    expect(next.design.heroSubtitle).toBe(data.design.heroSubtitle);
    expect(isWeddingData(next)).toBe(true);
  });
  it('chapel shows the blessing and verse while preserving their saved content', () => {
    const data = structuredClone(defaultWedding);
    data.design.hiddenSections = ['verse','blessing','gallery'];
    data.design.blessing = '두 사람이 직접 쓴 기도';
    const next = applyTemplate(data, 'chapel');
    expect(next.showVerse).toBe(true); expect(next.design.showBlessing).toBe(true);
    expect(next.design.hiddenSections).toEqual(['gallery']);
    expect(next.design.blessing).toBe(data.design.blessing);
  });
  it('changes built-in title recommendations while leaving the original snapshot untouched', () => {
    const data = structuredClone(defaultWedding);
    const next = applyTemplate(data, 'photo');
    expect(next.design.heroTitle).toBe(templates.find(t => t.id === 'photo')!.title);
    expect(data).toEqual(defaultWedding);
    const design = getDesign(data); design.sectionTitles.gallery = '새 제목';
    expect(defaultWedding.design.sectionTitles.gallery).not.toBe('새 제목');
  });
  it.each(palettes.map(p => [p.id]))('accepts curated palette %s', theme => {
    expect(isWeddingData({ ...defaultWedding, theme })).toBe(true);
  });
});
