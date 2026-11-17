import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { applyStylePack, applyTemplate, bodyAlignments, buttonShapes, defaultDesign, galleryGaps, getDesign, letterSpacings, lineSpacings, randomizeStyle, sectionSpacings, stylePacks, templates } from '../src/lib/design';
import type { WeddingDesign } from '../src/lib/types';
import { isWeddingData, normalizeWedding, sameWeddingContent } from '../src/lib/validation';

const customizations = {
  lineSpacing: 'relaxed', letterSpacing: 'wide', sectionSpacing: 'compact',
  bodyAlignment: 'left', buttonShape: 'pill', galleryGap: 'wide',
} as const satisfies Partial<WeddingDesign>;
const choiceGroups = { lineSpacing: lineSpacings, letterSpacing: letterSpacings, sectionSpacing: sectionSpacings, bodyAlignment: bodyAlignments, buttonShape: buttonShapes, galleryGap: galleryGaps };
const fields = Object.keys(customizations) as (keyof typeof customizations)[];

function personalInvitation() {
  const data = structuredClone(defaultWedding);
  data.design = { ...data.design, ...customizations, heroTitle: '직접 쓴 첫 문장', hiddenSections: ['verse', 'accounts'] };
  data.invitation = '둘이 함께 쓴 초대 문구';
  data.closing = '잊지 않을 감사의 마음';
  data.coverPhoto = 'https://example.test/our-cover.webp';
  data.photos = [{ id: 'our-photo', url: 'https://example.test/our-photo.webp', alt: '함께 고른 사진' }];
  data.accounts = [{ id: 'our-account', side: 'bride' as const, bank: '테스트은행', holder: '권주영', number: '123-456' }];
  return data;
}

describe('additional saved invitation customizations', () => {
  it('fills options omitted by older invitations without changing their input or source record', () => {
    const data = personalInvitation();
    const legacyDesign: Partial<WeddingDesign> = structuredClone(data.design);
    for (const field of fields) delete legacyDesign[field];
    const legacy = { ...data, design: legacyDesign };
    const before = structuredClone(legacy);
    const normalized = normalizeWedding(legacy);
    const expected = { ...data, design: { ...data.design } };
    for (const field of fields) Object.assign(expected.design, { [field]: defaultDesign[field] });
    expect(normalized).toEqual(expected);
    expect(legacy).toEqual(before);
    expect(sameWeddingContent(legacy as typeof data, expected)).toBe(true);
  });

  it('treats an undefined optional choice like an omitted JSON field', () => {
    const data = personalInvitation();
    const design = getDesign({ design: { ...data.design, lineSpacing: undefined } as unknown as WeddingDesign });
    expect(design.lineSpacing).toBe('normal');
    expect(design.buttonShape).toBe('pill');
  });

  it('keeps the left-aligned body of older editorial invitations and respects an explicit center choice', () => {
    const data = personalInvitation();
    data.design.template = 'editorial';
    const legacyDesign: Partial<WeddingDesign> = structuredClone(data.design);
    delete legacyDesign.bodyAlignment;
    expect(normalizeWedding({ ...data, design: legacyDesign }).design.bodyAlignment).toBe('left');
    expect(normalizeWedding({ ...data, design: { ...legacyDesign, bodyAlignment: 'center' } }).design.bodyAlignment).toBe('center');
  });

  for (const [field, choices] of Object.entries(choiceGroups)) {
    it.each(choices.map(choice => choice.id))(`round-trips ${field}=%s through persistence normalization`, choiceId => {
      const data = personalInvitation();
      Object.assign(data.design, { [field]: choiceId });
      const before = structuredClone(data);
      const restored = normalizeWedding(JSON.parse(JSON.stringify(data)));
      expect(restored).toEqual(before);
      expect(isWeddingData(restored)).toBe(true);
      expect(data).toEqual(before);
    });

    it.each(['unknown', '', null, 2, false])(`rejects an invalid explicit ${field} value: %j`, invalid => {
      const data = personalInvitation();
      Object.assign(data.design, { [field]: invalid });
      expect(isWeddingData(data)).toBe(false);
      expect(() => normalizeWedding(data)).toThrow();
    });
  }

  it.each(stylePacks)('preserves custom spacing, alignment and button choices when applying $id', pack => {
    const data = personalInvitation();
    const before = structuredClone(data);
    const next = applyStylePack(data, pack.id);
    expect(next.design).toMatchObject(customizations);
    for (const field of ['groom', 'bride', 'date', 'time', 'invitation', 'closing', 'coverPhoto', 'photos', 'accounts', 'guestFeatures'] as const) expect(next[field]).toEqual(before[field]);
    expect(next.design.heroTitle).toBe(before.design.heroTitle);
    expect(next.design.hiddenSections).toEqual(before.design.hiddenSections);
    expect(data).toEqual(before);
  });

  it.each(templates)('preserves fine customizations when changing to template $id', template => {
    const data = personalInvitation();
    const before = structuredClone(data);
    expect(applyTemplate(data, template.id).design).toMatchObject(customizations);
    expect(data).toEqual(before);
  });

  it('keeps fine choices during random recommendations without mutating the defaults', () => {
    const data = personalInvitation();
    const before = structuredClone(data);
    const sharedDesign = structuredClone(defaultDesign);
    expect(randomizeStyle(data, () => .75).data.design).toMatchObject(customizations);
    expect(data).toEqual(before);
    expect(defaultDesign).toEqual(sharedDesign);
  });
});
