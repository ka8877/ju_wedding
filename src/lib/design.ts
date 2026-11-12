import type { BackgroundId, FontId, SectionId, TemplateId, ThemeId, WeddingData, WeddingDesign } from './types';

export const sectionLabels: Record<SectionId, string> = {
  invitation: '초대의 말', verse: '성경 말씀', calendar: '예식 달력', gallery: '사진 갤러리', rsvp: '참석 여부', snap: '현장 스냅', location: '오시는 길', shuttle: '대절버스 안내', accounts: '마음 전하실 곳', blessing: '축복의 기도',
};
export const sectionIds: SectionId[] = ['invitation', 'verse', 'calendar', 'gallery', 'rsvp', 'snap', 'location', 'shuttle', 'accounts', 'blessing'];
export const defaultDesign: WeddingDesign = {
  template: 'garden', font: 'serif', background: 'plain', fontSize: 'normal', accentColor: '',
  heroTitle: 'With you,\nalways.', heroSubtitle: '함께여서, 더 아름다운 날', closingTitle: 'Forever begins with us.',
  photoShape: 'arch', photoPosition: 50, galleryLayout: 'mosaic', showDecoration: true,
  sectionOrder: [...sectionIds], hiddenSections: [],
  sectionTitles: { invitation: '우리, 결혼합니다.', gallery: '사랑이 머문 순간들', location: '마음이 만나는 곳', accounts: '마음 전하실 곳' },
  showBlessing: false, blessingTitle: '우리의 가정을 위한 기도',
  blessing: '하나님, 서로에게 선물로 주신 두 사람이\n기쁠 때나 어려울 때나 사랑으로 함께하게 하소서.\n\n작은 일에도 감사하고, 서로를 위해 기도하며\n따뜻한 사랑을 나누는 가정이 되게 하소서.',
};
export const palettes: { id: ThemeId; name: string; color: string; background: string; description: string }[] = [
  { id: 'olive', name: '올리브 가든', color: '#58644f', background: '#f4f3eb', description: '자연을 닮은 차분한 초록' },
  { id: 'rose', name: '로지 모먼트', color: '#976569', background: '#faf0ed', description: '은은한 장밋빛 로맨스' },
  { id: 'sand', name: '샌드 레터', color: '#94775a', background: '#f5eee4', description: '오래 간직할 따뜻한 편지' },
  { id: 'ivory', name: '퓨어 아이보리', color: '#52504a', background: '#fffdfa', description: '꾸밈없이 우아한 클래식' },
  { id: 'sage', name: '세이지 브리즈', color: '#53756b', background: '#edf4ef', description: '싱그러운 정원의 바람' },
  { id: 'lavender', name: '라벤더 무드', color: '#766184', background: '#f5f0f7', description: '서정적인 연보라의 순간' },
  { id: 'midnight', name: '미드나잇 블루', color: '#c7ad79', background: '#1f2b3b', description: '별빛을 담은 저녁의 약속' },
  { id: 'peach', name: '피치 블로썸', color: '#a96b50', background: '#fff3eb', description: '햇살처럼 다정한 살구빛' },
  { id: 'sky', name: '블루 세레니티', color: '#527b91', background: '#edf4f8', description: '맑고 깨끗한 하늘빛' },
];
export const templates: { id: TemplateId; name: string; tag: string; description: string; theme: ThemeId; font: WeddingDesign['font']; photoShape: WeddingDesign['photoShape']; title: string; subtitle: string }[] = [
  { id: 'garden', name: '보태니컬 가든', tag: 'NATURAL', description: '꽃과 아치로 여는 자연스러운 초대', theme: 'olive', font: 'serif', photoShape: 'arch', title: 'With you,\nalways.', subtitle: '함께여서, 더 아름다운 날' },
  { id: 'editorial', name: '에디토리얼', tag: 'MINIMAL', description: '큰 타이포와 여백, 우리의 웨딩 매거진', theme: 'ivory', font: 'sans', photoShape: 'rectangle', title: 'Our next\nchapter.', subtitle: '우리의 다음 페이지에 초대합니다' },
  { id: 'photo', name: '시네마틱 러브', tag: 'PHOTO', description: '한 장의 사진으로 시작하는 영화 같은 날', theme: 'sand', font: 'romantic', photoShape: 'rectangle', title: 'You are\nmy forever.', subtitle: '가장 아름다운 장면은, 당신과 함께' },
  { id: 'classic', name: '타임리스 클래식', tag: 'ELEGANT', description: '정갈한 테두리와 모노그램의 품격', theme: 'sand', font: 'serif', photoShape: 'oval', title: 'To love,\nfor a lifetime.', subtitle: '평생을 함께할 소중한 약속' },
  { id: 'chapel', name: '그레이스 채플', tag: 'CHRISTIAN', description: '십자가와 빛, 하나님 안에서의 새 시작', theme: 'ivory', font: 'serif', photoShape: 'arch', title: 'Joined\nin His love.', subtitle: '하나님이 이어 주신 사랑, 함께하는 첫걸음' },
  { id: 'letter', name: '디어 마이 러브', tag: 'LETTER', description: '손편지처럼 따뜻하고 담백한 초대', theme: 'peach', font: 'romantic', photoShape: 'rectangle', title: 'Dear you,\nwith love.', subtitle: '소중한 당신에게 전하는, 우리의 편지' },
];
export const fonts: { id: FontId; name: string; sample: string; description: string }[] = [
  { id: 'serif', name: '단아한 명조', sample: '서로의 봄이 되어', description: '차분하고 정갈한 문장' },
  { id: 'sans', name: '깔끔한 고딕', sample: '오늘부터, 우리', description: '간결하고 또렷한 문장' },
  { id: 'romantic', name: '로맨틱 레터', sample: 'Love, always.', description: '편지처럼 서정적인 문장' },
  { id: 'myeongjo', name: '클래식 명조', sample: '오래도록, 다정하게', description: '품격 있게 오래 남는 글씨' },
  { id: 'handwriting', name: '다정한 손글씨', sample: '당신이라 참 좋아요', description: '진심을 꾹꾹 눌러 담은 손편지' },
];
export const backgrounds: { id: BackgroundId; name: string; description: string }[] = [
  { id: 'plain', name: '깔끔한 단색', description: '사진과 문구가 가장 돋보이는 기본' },
  { id: 'paper', name: '포근한 종이', description: '한 장의 좋은 종이에 담은 마음' },
  { id: 'linen', name: '차분한 린넨', description: '고운 천처럼 단정한 결' },
  { id: 'watercolor', name: '은은한 수채화', description: '빛이 번지듯 부드러운 물감' },
  { id: 'petals', name: '흩날리는 꽃잎', description: '작은 꽃잎으로 더하는 설렘' },
  { id: 'starlight', name: '작은 별빛', description: '소중한 약속을 비추는 잔잔한 별' },
];
export interface StylePack {
  id: string; name: string; description: string; tag: string;
  template: TemplateId; theme: ThemeId; font: FontId; background: BackgroundId;
  photoShape: WeddingDesign['photoShape']; galleryLayout: WeddingDesign['galleryLayout']; showDecoration: boolean;
}
export const stylePacks: StylePack[] = [
  { id: 'evergreen', name: '가장 무난한 선택', description: '올리브·단아한 명조·포근한 종이. 누구에게나 잘 어울려요.', tag: '처음이라면 추천', template: 'garden', theme: 'olive', font: 'serif', background: 'paper', photoShape: 'arch', galleryLayout: 'mosaic', showDecoration: true },
  { id: 'modern', name: '깔끔한 웨딩 매거진', description: '아이보리와 고딕, 군더더기 없이 사진과 이야기에 집중해요.', tag: '심플한 취향', template: 'editorial', theme: 'ivory', font: 'sans', background: 'plain', photoShape: 'rectangle', galleryLayout: 'grid', showDecoration: false },
  { id: 'grace', name: '은혜로운 채플', description: '클래식 명조와 은은한 수채화로 차분하게 전하는 초대.', tag: '믿음의 약속', template: 'chapel', theme: 'ivory', font: 'myeongjo', background: 'watercolor', photoShape: 'arch', galleryLayout: 'grid', showDecoration: true },
  { id: 'dear', name: '다정한 손편지', description: '따뜻한 살구빛과 손글씨로 우리다운 마음을 전해요.', tag: '따뜻한 분위기', template: 'letter', theme: 'peach', font: 'handwriting', background: 'paper', photoShape: 'rectangle', galleryLayout: 'film', showDecoration: true },
  { id: 'sky', name: '맑은 하늘의 약속', description: '하늘빛과 린넨의 산뜻한 조합', tag: 'FRESH', template: 'editorial', theme: 'sky', font: 'sans', background: 'linen', photoShape: 'rectangle', galleryLayout: 'grid', showDecoration: false },
  { id: 'sage', name: '초록빛 바람', description: '싱그러운 세이지와 고운 글씨', tag: 'NATURAL', template: 'garden', theme: 'sage', font: 'romantic', background: 'linen', photoShape: 'arch', galleryLayout: 'mosaic', showDecoration: true },
  { id: 'rose', name: '장밋빛 서약', description: '장밋빛 꽃잎과 클래식한 한 장', tag: 'ROMANTIC', template: 'classic', theme: 'rose', font: 'myeongjo', background: 'petals', photoShape: 'oval', galleryLayout: 'grid', showDecoration: true },
  { id: 'night', name: '별이 빛나는 밤', description: '깊은 남색과 금빛 별의 약속', tag: 'EVENING', template: 'classic', theme: 'midnight', font: 'serif', background: 'starlight', photoShape: 'oval', galleryLayout: 'film', showDecoration: true },
  { id: 'film', name: '우리의 영화', description: '사진이 주인공이 되는 담백한 장면', tag: 'CINEMATIC', template: 'photo', theme: 'sand', font: 'romantic', background: 'plain', photoShape: 'rectangle', galleryLayout: 'film', showDecoration: false },
  { id: 'lavender', name: '라벤더 드림', description: '연보라 수채화에 담은 서정적인 하루', tag: 'SOFT', template: 'garden', theme: 'lavender', font: 'romantic', background: 'watercolor', photoShape: 'arch', galleryLayout: 'mosaic', showDecoration: true },
  { id: 'sand', name: '오래 남는 초대', description: '따뜻한 종이와 정갈한 클래식', tag: 'TIMELESS', template: 'classic', theme: 'sand', font: 'myeongjo', background: 'paper', photoShape: 'oval', galleryLayout: 'grid', showDecoration: true },
  { id: 'peach', name: '봄날의 편지', description: '살구빛 꽃잎 사이로 건네는 마음', tag: 'BLOOM', template: 'letter', theme: 'peach', font: 'romantic', background: 'petals', photoShape: 'rectangle', galleryLayout: 'film', showDecoration: true },
];
export const recommendedStylePacks = stylePacks.slice(0, 4);

/** Style choices never replace the couple's content, faith choices or section setup. */
export function applyStylePack(data: WeddingData, id: string): WeddingData {
  const pack = stylePacks.find(p => p.id === id);
  if (!pack) throw new Error('스타일을 찾지 못했습니다. 다른 조합을 선택해 주세요.');
  return { ...data, theme: pack.theme, design: { ...getDesign(data), template: pack.template, font: pack.font, background: pack.background, photoShape: pack.photoShape, galleryLayout: pack.galleryLayout, showDecoration: pack.showDecoration, accentColor: '' } };
}
export function randomizeStyle(data: WeddingData, random: () => number = Math.random): { data: WeddingData; pack: StylePack } {
  const design = getDesign(data);
  const choices = stylePacks.filter(p => !(p.theme === data.theme && p.template === design.template && p.font === design.font && p.background === design.background && p.photoShape === design.photoShape && p.galleryLayout === design.galleryLayout && p.showDecoration === design.showDecoration && !design.accentColor));
  const value = random();
  const sample = Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
  const pack = choices[Math.floor(sample * choices.length)] ?? stylePacks[0];
  return { data: applyStylePack(data, pack.id), pack };
}
export const versePresets = [
  { name: '사랑', reference: '고린도전서 13:13', text: '그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데\n그 중의 제일은 사랑이라.' },
  { name: '함께함', reference: '전도서 4:9', text: '두 사람이 한 사람보다 나음은\n그들이 수고함으로 좋은 상을 얻을 것임이라.' },
  { name: '온전한 사랑', reference: '골로새서 3:14', text: '이 모든 것 위에 사랑을 더하라\n이는 온전하게 매는 띠니라.' },
  { name: '서로 사랑', reference: '요한일서 4:19', text: '우리가 사랑함은\n그가 먼저 우리를 사랑하셨음이라.' },
];
export const invitationPresets = [
  { id: 'warm', name: '다정한 초대', text: '서로의 가장 다정한 집이 되어\n같은 곳을 바라보며 걸어가려 합니다.\n\n저희의 새로운 시작에 함께하시어\n따뜻한 축복을 더해 주세요.' },
  { id: 'simple', name: '담백한 초대', text: '서로의 하루를 아끼며\n오래도록 함께하고 싶은 사람을 만났습니다.\n\n한 걸음 더 나아가는 저희의 시작에\n소중한 당신을 초대합니다.' },
  { id: 'faith', name: '믿음의 초대', text: '하나님의 은혜 안에서 만난 두 사람이\n이제 믿음과 사랑으로 한 가정을 이루려 합니다.\n\n서로를 위해 기도하며 걸어갈 첫걸음에\n함께하시어 축복해 주시면 감사하겠습니다.' },
];

export function getDesign(data: Pick<WeddingData, 'design'>): WeddingDesign {
  const saved = data.design;
  const order = [...(saved?.sectionOrder ?? [])];
  for (const id of sectionIds) {
    if (order.includes(id)) continue;
    const after: Partial<Record<SectionId, SectionId>> = { rsvp: 'gallery', snap: 'rsvp', shuttle: 'location' };
    const anchor = after[id];
    const index = anchor ? order.indexOf(anchor) : -1;
    if (index >= 0) order.splice(index + 1, 0, id);
    else order.push(id);
  }
  return { ...structuredClone(defaultDesign), ...saved, sectionTitles: { ...defaultDesign.sectionTitles, ...saved?.sectionTitles }, sectionOrder: order, hiddenSections: [...(saved?.hiddenSections ?? [])] };
}
export function applyTemplate(data: WeddingData, id: TemplateId): WeddingData {
  const preset = templates.find(t => t.id === id)!;
  const design = getDesign(data);
  const previous = templates.find(t => t.id === design.template);
  const presetTitle = !design.heroTitle || design.heroTitle === previous?.title || design.heroTitle === defaultDesign.heroTitle;
  const presetSubtitle = !design.heroSubtitle || design.heroSubtitle === previous?.subtitle || design.heroSubtitle === defaultDesign.heroSubtitle;
  return { ...data, theme: preset.theme, ...(id === 'chapel' ? { showVerse: true } : {}), design: { ...design, template: id, font: preset.font, photoShape: preset.photoShape,
    heroTitle: presetTitle ? preset.title : design.heroTitle,
    heroSubtitle: presetSubtitle ? preset.subtitle : design.heroSubtitle,
    accentColor: '',
    ...(id === 'chapel' ? { showBlessing: true, hiddenSections: design.hiddenSections.filter(s => s !== 'verse' && s !== 'blessing') } : {}),
  } };
}
