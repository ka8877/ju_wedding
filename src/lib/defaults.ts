import type { WeddingData } from './types';

export const defaultWedding: WeddingData = {
  version: 1,
  groom: { name: '조현범', englishName: 'Hyunbeom', phone: '', father: '', mother: '' },
  bride: { name: '권주영', englishName: 'Juyoung', phone: '', father: '', mother: '' },
  date: '', time: '',
  invitation: '서로의 가장 다정한 집이 되어\n같은 곳을 바라보며 걸어가려 합니다.\n\n저희의 새로운 시작에 함께하시어\n따뜻한 축복을 더해 주세요.',
  closing: '소중한 걸음으로 함께해 주실\n모든 분들께 진심으로 감사드립니다.',
  showVerse: false,
  verse: '그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데\n그 중의 제일은 사랑이라.',
  verseReference: '고린도전서 13:13',
  coverPhoto: '', photos: [],
  venue: { name: '', hall: '', address: '', lat: null, lng: null, transport: '', parking: '' },
  accounts: [], theme: 'olive',
};
