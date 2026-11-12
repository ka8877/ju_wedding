import type { Venue } from './types';

/** Verified in Naver Place 1156613092, at the invitation's confirmed address. */
export const confirmedVenueCoordinates = { lat: 37.3768838, lng: 127.1043929 };

export function isConfirmedVenue(venue: Venue): boolean {
  return venue.name.trim() === 'HD현대글로벌R&D센터' && venue.address.includes('분당수서로 477');
}

export function getVenueCoordinates(venue: Venue): { lat: number; lng: number } | null {
  if (typeof venue.lat === 'number' && typeof venue.lng === 'number'
    && Number.isFinite(venue.lat) && Number.isFinite(venue.lng)
    && Math.abs(venue.lat) <= 90 && Math.abs(venue.lng) <= 180) {
    return { lat: venue.lat, lng: venue.lng };
  }
  // Existing invitations may predate the confirmed location. Never use this
  // fallback for an edited address, another venue, or partially entered pins.
  if (venue.lat === null && venue.lng === null && isConfirmedVenue(venue)) return { ...confirmedVenueCoordinates };
  return null;
}

export function getNaverVenueUrl(venue: Venue): string {
  return isConfirmedVenue(venue)
    ? 'https://m.place.naver.com/place/1156613092/location'
    : `https://map.naver.com/p/search/${encodeURIComponent(`${venue.name} ${venue.address}`.trim())}`;
}

// The same-address headquarters publicly supplies this embed on its official
// directions page: https://hdhydrogen.com/kr/company/location/contents .
const confirmedGoogleEmbed = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3170.5546707026347!2d127.104857!3d37.3767129!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x357b5838ae90c2d7%3A0x7893974895b74610!2z6rK96riw64-EIOyEseuCqOyLnCDrtoTri7nqtawg67aE64u57IiY7ISc66GcIDQ3Nw!5e0!3m2!1sko!2skr!4v1739779592251!5m2!1sko!2skr';

export function getGoogleVenueMapUrl(venue: Venue): string {
  const coordinates = getVenueCoordinates(venue);
  if (isConfirmedVenue(venue) && coordinates?.lat === confirmedVenueCoordinates.lat && coordinates.lng === confirmedVenueCoordinates.lng) return confirmedGoogleEmbed;
  const query = coordinates ? `${coordinates.lat},${coordinates.lng}` : `${venue.name} ${venue.address}`.trim();
  const params = new URLSearchParams({ q: query, z: '16', output: 'embed', hl: 'ko' });
  return `https://maps.google.com/maps?${params}`;
}
