import type { SectionId, TemplateId, ThemeId, WeddingData, WeddingDesign } from './types';

export const sectionLabels: Record<SectionId, string> = {
  invitation: '초대의 말', verse: '성경 말씀', calendar: '예식 달력', gallery: '사진 갤러리', location: '오시는 길', accounts: '마음 전하실 곳', blessing: '축복의 기도',
};
export const sectionIds: SectionId[] = ['invitation', 'verse', 'calendar', 'gallery', 'location', 'accounts', 'blessing'];
export const defaultDesign: WeddingDesign = {
  template: 'garden', font: 'serif', fontSize: 'normal', accentColor: '',
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
  return { ...structuredClone(defaultDesign), ...saved, sectionTitles: { ...defaultDesign.sectionTitles, ...saved?.sectionTitles }, sectionOrder: [...(saved?.sectionOrder ?? []), ...sectionIds.filter(id => !saved?.sectionOrder?.includes(id))], hiddenSections: saved?.hiddenSections ?? [] };
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
