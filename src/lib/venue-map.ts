import type { Venue } from './types';

/** Verified in Naver Place 1156613092, at the invitation's confirmed address. */
export const confirmedVenueCoordinates = { lat: 37.3768838, lng: 127.1043929 };

export type VenueMapView = 'area' | 'venue';

// Naver's official station information supplies this point and both lines:
// https://pts.map.naver.com/end-subway/ends/web/1915/home
export const jeongjaStation = {
  name: '정자역', lines: '신분당선 · 수인분당선',
  lat: 37.3677228, lng: 127.108455,
  url: 'https://pts.map.naver.com/end-subway/ends/web/1915/home',
};

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

/** Nearby station context belongs only to the verified venue and map pin. */
export function getVenueStation(venue: Venue): typeof jeongjaStation | null {
  const coordinates = getVenueCoordinates(venue);
  return isConfirmedVenue(venue) && coordinates
    && Math.abs(coordinates.lat - confirmedVenueCoordinates.lat) < 0.000001
    && Math.abs(coordinates.lng - confirmedVenueCoordinates.lng) < 0.000001
    ? jeongjaStation : null;
}

export function getVenueMapViewport(venue: Venue, view: VenueMapView, coordinates = getVenueCoordinates(venue)) {
  if (!coordinates) return null;
  const station = view === 'area' ? getVenueStation(venue) : null;
  return {
    center: station ? {
      lat: Number(((coordinates.lat + station.lat) / 2).toFixed(8)),
      lng: Number(((coordinates.lng + station.lng) / 2).toFixed(8)),
    } : coordinates,
    zoom: view === 'area' ? 14 : 17,
  };
}

// The same-address headquarters publicly supplies this embed on its official
// directions page: https://hdhydrogen.com/kr/company/location/contents .
const confirmedGoogleEmbed = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3170.5546707026347!2d127.104857!3d37.3767129!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x357b5838ae90c2d7%3A0x7893974895b74610!2z6rK96riw64-EIOyEseuCqOyLnCDrtoTri7nqtawg67aE64u57IiY7ISc66GcIDQ3Nw!5e0!3m2!1sko!2skr!4v1739779592251!5m2!1sko!2skr';

export function getGoogleVenueMapUrl(venue: Venue, view: VenueMapView = 'area'): string {
  const coordinates = getVenueCoordinates(venue);
  if (view === 'venue' && getVenueStation(venue)) return confirmedGoogleEmbed;
  const viewport = getVenueMapViewport(venue, view);
  const query = getVenueStation(venue)
    ? `${venue.name} ${venue.address}`.trim()
    : coordinates ? `${coordinates.lat},${coordinates.lng}` : `${venue.name} ${venue.address}`.trim();
  const params = new URLSearchParams({ q: query, z: String(viewport?.zoom ?? (view === 'area' ? 14 : 17)), output: 'embed', hl: 'ko', t: 'm' });
  if (viewport) params.set('ll', `${viewport.center.lat},${viewport.center.lng}`);
  return `https://maps.google.com/maps?${params}`;
}
