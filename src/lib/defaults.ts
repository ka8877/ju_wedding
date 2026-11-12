import type { WeddingData, WeddingGuestFeatures } from './types';
import { defaultDesign } from './design.ts';

export const defaultGuestFeatures: WeddingGuestFeatures = {
  music: { enabled: true, source: 'builtin', url: '', volume: 0.22 },
  gallery: { collapsedRows: 3 },
  rsvp: {
    enabled: true, title: '참석 여부를 알려주세요',
    groomMessage: '신랑 현범에게 축하의 마음을 전해 주셔서 감사합니다. 함께하실 인원을 알려주시면 정성껏 준비하겠습니다.',
    brideMessage: '신부 주영에게 축하의 마음을 전해 주셔서 감사합니다. 함께하실 인원을 알려주시면 정성껏 준비하겠습니다.',
    note: '결혼식 일주일 전까지 확인 연락드리겠습니다.',
  },
  snap: { enabled: true, title: '함께 담은 오늘의 순간', openDate: '2027-02-20', message: '두 사람의 소중한 날을 여러분의 시선으로 담아 주세요. 예식 당일부터 사진을 올릴 수 있어요.' },
  shuttle: { enabled: true, title: '대절버스 이용 안내', daejeon: '', gyeongju: '' },
  sharing: { kakaoJavascriptKey: '' },
};

export const defaultWedding: WeddingData = {
  version: 1, preferencesVersion: 1,
  groom: { name: '조현범', englishName: 'Hyunbeom', phone: '', father: '조성진', mother: '이진용', birthOrder: '장남', childName: '현범' },
  bride: { name: '권주영', englishName: 'Juyoung', phone: '', father: '권용덕', mother: '이선애', birthOrder: '차녀', childName: '주영' },
  date: '2027-02-20', time: '12:30',
  invitation: '서로의 가장 다정한 집이 되어\n같은 곳을 바라보며 걸어가려 합니다.\n\n저희의 새로운 시작에 함께하시어\n따뜻한 축복을 더해 주세요.',
  closing: '소중한 걸음으로 함께해 주실\n모든 분들께 진심으로 감사드립니다.',
  showVerse: false,
  verse: '그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데\n그 중의 제일은 사랑이라.',
  verseReference: '고린도전서 13:13',
  coverPhoto: '', photos: [],
  venue: { name: 'HD현대글로벌R&D센터', hall: '아산홀', address: '경기 성남시 분당구 분당수서로 477', lat: 37.3768838, lng: 127.1043929, naverMapClientId: '', transport: '', parking: '', subway: '', bus: '', car: '' },
  accounts: [], theme: 'olive', design: structuredClone(defaultDesign),
  guestFeatures: structuredClone(defaultGuestFeatures),
};
