export type GuestSide = 'groom' | 'bride';
export type GuestMeal = 'yes' | 'no' | 'undecided';
export type GuestShuttle = 'none' | 'daejeon' | 'gyeongju';

export interface GuestCapabilities {
  status: 'ready' | 'setup-required' | 'offline' | 'local';
  rsvpEnabled: boolean;
  snapEnabled: boolean;
  snapOpen: boolean;
  snapOpenDate: string;
  message: string;
}

export interface RsvpInput {
  side: GuestSide;
  attending: boolean;
  name: string;
  phone: string;
  guests: number;
  meal: GuestMeal;
  shuttle: GuestShuttle;
  message: string;
  consent: boolean;
}

export interface RsvpReceipt { id: string; createdAt: string; }
export interface RsvpRecord extends Omit<RsvpInput, 'consent'> { id: string; createdAt: string; }
export interface GuestPhotoReceipt { id: string; fileName: string; createdAt: string; }
export interface GuestPhotoRecord extends GuestPhotoReceipt {
  guestName: string;
  storagePath: string;
  downloadUrl: string | null;
}
