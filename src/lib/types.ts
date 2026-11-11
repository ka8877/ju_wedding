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
  theme: 'olive' | 'rose' | 'sand';
}
export interface StoredWedding { data: WeddingData; updatedAt: string | null; }
