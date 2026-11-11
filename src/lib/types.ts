export interface Person {
  name: string;
  englishName: string;
  phone: string;
  father: string;
  mother: string;
}
export interface Photo { id: string; url: string; alt: string; }
export interface Account { id: string; side: 'groom' | 'bride'; bank: string; number: string; holder: string; }
export interface Venue {
  name: string;
  hall: string;
  address: string;
  lat: number | null;
  lng: number | null;
  transport: string;
  parking: string;
}
export type ThemeId = 'olive' | 'rose' | 'sand' | 'ivory' | 'sage' | 'lavender' | 'midnight' | 'peach' | 'sky';
export type TemplateId = 'garden' | 'editorial' | 'photo' | 'classic' | 'chapel' | 'letter';
export type FontId = 'serif' | 'sans' | 'romantic' | 'myeongjo' | 'handwriting';
export type BackgroundId = 'plain' | 'paper' | 'linen' | 'watercolor' | 'petals' | 'starlight';
export type SectionId = 'invitation' | 'verse' | 'calendar' | 'gallery' | 'location' | 'accounts' | 'blessing';
export interface WeddingDesign {
  template: TemplateId;
  font: FontId;
  background: BackgroundId;
  fontSize: 'small' | 'normal' | 'large';
  accentColor: string;
  heroTitle: string;
  heroSubtitle: string;
  closingTitle: string;
  photoShape: 'arch' | 'rectangle' | 'oval';
  photoPosition: number;
  galleryLayout: 'mosaic' | 'grid' | 'film';
  showDecoration: boolean;
  sectionOrder: SectionId[];
  hiddenSections: SectionId[];
  sectionTitles: { invitation: string; gallery: string; location: string; accounts: string; };
  showBlessing: boolean;
  blessingTitle: string;
  blessing: string;
}
export interface WeddingData {
  version: 1;
  groom: Person;
  bride: Person;
  date: string;
  time: string;
  invitation: string;
  closing: string;
  showVerse: boolean;
  verse: string;
  verseReference: string;
  coverPhoto: string;
  photos: Photo[];
  venue: Venue;
  accounts: Account[];
  theme: ThemeId;
  design: WeddingDesign;
}
export interface StoredWedding { data: WeddingData; updatedAt: string | null; }
