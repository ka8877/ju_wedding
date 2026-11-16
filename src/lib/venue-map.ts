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

/** Optional external Google Maps search; never mounted inside the invitation. */
export function getGoogleVenueUrl(venue: Venue): string {
  const coordinates = getVenueCoordinates(venue);
  const query = coordinates ? `${coordinates.lat},${coordinates.lng}` : `${venue.name} ${venue.address}`.trim();
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`;
}

/** Optional external Kakao map, preserving the venue pin where available. */
export function getKakaoVenueUrl(venue: Venue): string {
  const coordinates = getVenueCoordinates(venue);
  return coordinates
    ? `https://map.kakao.com/link/map/${encodeURIComponent(venue.name || '예식장')},${coordinates.lat},${coordinates.lng}`
    : `https://map.kakao.com/?${new URLSearchParams({ q: `${venue.name} ${venue.address}`.trim() })}`;
}
