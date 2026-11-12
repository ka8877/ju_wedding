import { describe, expect, it } from 'vitest';
import { defaultGuestFeatures, defaultWedding } from '../src/lib/defaults';
import { defaultDesign, sectionIds } from '../src/lib/design';
import { isWeddingData, normalizeWedding, publicationErrors } from '../src/lib/validation';

function legacyInvitation() {
  const { preferencesVersion: _preferences, guestFeatures: _features, ...legacy } = structuredClone(defaultWedding);
  const { birthOrder: _groomOrder, childName: _groomChild, ...groom } = legacy.groom;
  const { birthOrder: _brideOrder, childName: _brideChild, ...bride } = legacy.bride;
  const { subway: _subway, bus: _bus, car: _car, ...venue } = legacy.venue;
  return {
    ...legacy, groom: { ...groom, father: '', mother: '' }, bride: { ...bride, father: '', mother: '' }, date: '', time: '',
    venue: { ...venue, name: '', hall: '', address: '' },
    design: { ...legacy.design, sectionOrder: ['invitation', 'verse', 'calendar', 'gallery', 'location', 'accounts', 'blessing'] },
  };
}

describe('Juyoung’s confirmed event preferences', () => {
  it('provides the supplied date, family and venue facts with editable guest features', () => {
    expect(defaultWedding.date).toBe('2027-02-20');
    expect(defaultWedding.time).toBe('12:30');
    expect(defaultWedding.groom).toMatchObject({ father: '조성진', mother: '이진용', birthOrder: '장남', childName: '현범' });
    expect(defaultWedding.bride).toMatchObject({ father: '권용덕', mother: '이선애', birthOrder: '차녀', childName: '주영' });
    expect(defaultWedding.venue).toMatchObject({ name: 'HD현대글로벌R&D센터', hall: '아산홀', address: '경기 성남시 분당구 분당수서로 477', lat: 37.3768838, lng: 127.1043929, naverMapClientId: '', subway: '', bus: '', car: '' });
    expect(defaultWedding.accounts).toEqual([]);
    expect(defaultWedding.photos).toEqual([]);
    expect(defaultGuestFeatures.music).toMatchObject({ enabled: true, source: 'builtin', url: '' });
    expect(defaultGuestFeatures.gallery.collapsedRows).toBe(3);
    expect(defaultGuestFeatures.snap.openDate).toBe('2027-02-20');
    expect(defaultGuestFeatures.shuttle).toMatchObject({ daejeon: '', gyeongju: '' });
    expect(defaultGuestFeatures.rsvp.note).toBe('결혼식 일주일 전까지 확인 연락드리겠습니다.');
    expect(isWeddingData(defaultWedding)).toBe(true);
  });

  it('seeds a legacy saved invitation only in previously blank known fields', () => {
    const legacy = legacyInvitation();
    legacy.invitation = '이미 직접 작성한 초대의 말';
    legacy.design.heroTitle = '이미 고른 제목';
    legacy.design.template = 'letter';
    legacy.groom.phone = '010-1234-5678';
    legacy.photos = [{ id: 'one', url: 'https://example.test/wedding.webp', alt: '이미 올린 사진' }];
    const before = structuredClone(legacy);
    const upgraded = normalizeWedding(legacy);
    expect(upgraded.preferencesVersion).toBe(1);
    expect(upgraded.date).toBe('2027-02-20');
    expect(upgraded.time).toBe('12:30');
    expect(upgraded.groom).toEqual({ ...defaultWedding.groom, phone: '010-1234-5678' });
    expect(upgraded.bride).toEqual(defaultWedding.bride);
    expect(upgraded.venue).toEqual(defaultWedding.venue);
    expect(upgraded.design.sectionOrder).toEqual(sectionIds);
    expect(upgraded.design.heroTitle).toBe('이미 고른 제목');
    expect(upgraded.design.template).toBe('letter');
    expect(upgraded.invitation).toBe(legacy.invitation);
    expect(upgraded.photos).toEqual(legacy.photos);
    expect(legacy).toEqual(before);
  });

  it('preserves custom event information and custom section ordering on migration', () => {
    const legacy = legacyInvitation();
    legacy.date = '2028-06-12'; legacy.time = '15:00';
    legacy.groom.father = '직접 입력한 성함';
    legacy.venue = { ...legacy.venue, name: '직접 입력한 예식장', hall: '', address: '직접 입력한 주소' };
    legacy.design.sectionOrder = ['accounts', 'gallery', 'location', 'invitation', 'verse', 'calendar', 'blessing'];
    const upgraded = normalizeWedding(legacy);
    expect(upgraded.date).toBe(legacy.date); expect(upgraded.time).toBe(legacy.time);
    expect(upgraded.groom.father).toBe('직접 입력한 성함');
    expect(upgraded.venue).toMatchObject({ name: '직접 입력한 예식장', hall: '', address: '직접 입력한 주소' });
    expect(upgraded.design.sectionOrder.filter(id => !['rsvp', 'snap', 'shuttle'].includes(id))).toEqual(legacy.design.sectionOrder);
    expect(upgraded.design.sectionOrder.indexOf('rsvp')).toBe(upgraded.design.sectionOrder.indexOf('gallery') + 1);
    expect(upgraded.design.sectionOrder.indexOf('snap')).toBe(upgraded.design.sectionOrder.indexOf('rsvp') + 1);
    expect(upgraded.design.sectionOrder.indexOf('shuttle')).toBe(upgraded.design.sectionOrder.indexOf('location') + 1);
  });

  it('keeps later intentional blanks and feature customizations after the migration marker is saved', () => {
    const upgraded = normalizeWedding(legacyInvitation());
    upgraded.date = ''; upgraded.time = ''; upgraded.groom.father = ''; upgraded.bride.mother = '';
    upgraded.groom.birthOrder = ''; upgraded.bride.childName = '';
    upgraded.venue.name = ''; upgraded.venue.hall = ''; upgraded.venue.address = '';
    upgraded.guestFeatures.rsvp.groomMessage = '신랑 측 직접 안내';
    upgraded.guestFeatures.shuttle.daejeon = '대전 출발 직접 안내';
    upgraded.guestFeatures.music.enabled = false;
    expect(normalizeWedding(upgraded)).toEqual(upgraded);
    expect(publicationErrors(upgraded)).toEqual([]);
  });

  it('applies the newly requested collage to legacy records once, then honors later gallery choices', () => {
    const legacy = legacyInvitation(); legacy.design.galleryLayout = 'film';
    const upgraded = normalizeWedding(legacy);
    expect(upgraded.design.galleryLayout).toBe('mosaic');
    expect(legacy.design.galleryLayout).toBe('film');
    upgraded.design.galleryLayout = 'film';
    expect(normalizeWedding(upgraded).design.galleryLayout).toBe('film');
  });

  it('adds partial guest settings without replacing explicit false, zero, or empty values', () => {
    const current = { ...defaultWedding, guestFeatures: { music: { enabled: false, volume: 0 }, gallery: { collapsedRows: 0 }, snap: { message: '' } } };
    const upgraded = normalizeWedding(current);
    expect(upgraded.guestFeatures.music).toEqual({ ...defaultGuestFeatures.music, enabled: false, volume: 0 });
    expect(upgraded.guestFeatures.gallery.collapsedRows).toBe(0);
    expect(upgraded.guestFeatures.snap.message).toBe('');
    expect(upgraded.guestFeatures.rsvp).toEqual(defaultGuestFeatures.rsvp);
    expect(defaultWedding.guestFeatures).toEqual(defaultGuestFeatures);
  });

  it.each([
    { music: null }, { music: { source: 'unknown' } }, { music: { volume: -1 } },
    { music: { volume: 1.1 } }, { music: { url: 'javascript:alert(1)' } },
    { music: { url: 'https://user:password@example.test/song.mp3' } },
    { gallery: { collapsedRows: 2.5 } }, { gallery: { collapsedRows: 7 } },
    { snap: { openDate: '2027-02-30' } }, { sharing: { kakaoJavascriptKey: 'sb_secret_private' } },
    { rsvp: { groomMessage: 'a'.repeat(1501) } }, { shuttle: { enabled: 'true' } },
  ])('rejects malformed guest customizations %j', guestFeatures => {
    expect(() => normalizeWedding({ ...defaultWedding, guestFeatures })).toThrow();
  });

  it('retains an explicit section hide choice and refuses unknown or duplicate imported section IDs', () => {
    const data = normalizeWedding({ ...defaultWedding, design: { ...defaultDesign, hiddenSections: ['rsvp', 'snap'] } });
    expect(data.design.hiddenSections).toEqual(['rsvp', 'snap']);
    for (const sectionOrder of [['gallery', 'gallery'], ['invitation', 'unknown']]) {
      expect(() => normalizeWedding({ ...defaultWedding, design: { ...defaultDesign, sectionOrder } })).toThrow();
    }
    expect(() => normalizeWedding({ ...defaultWedding, preferencesVersion: 2 })).toThrow();
    expect(() => normalizeWedding({})).toThrow();
  });

  it('requires a source URL only when publishing enabled custom music', () => {
    const data = structuredClone(defaultWedding);
    data.guestFeatures.music.source = 'url';
    expect(publicationErrors(data).join(' ')).toContain('음원 주소');
    data.guestFeatures.music.url = 'https://example.test/our-music.mp3';
    expect(publicationErrors(data)).toEqual([]);
  });
});
