import type { Venue } from './types';

/** Verified in Naver Place 1156613092, at the invitation's confirmed address. */
export const confirmedVenueCoordinates = { lat: 37.3768838, lng: 127.1043929 };
const confirmedVenueNames = new Set(['HD현대글로벌R&D센터', 'HD현대그룹글로벌R&D센터']);
const confirmedVenueAddress = /(?:^|\s)분당수서로\s*477(?![\d-]|\s*-\s*\d)(?=$|[\s,(])/;
const venueSiteRadiusMeters = 150;

export type VenueMapView = 'area' | 'venue';

// Naver's official station information supplies this point and both lines:
// https://pts.map.naver.com/end-subway/ends/web/1915/home
export const jeongjaStation = {
  name: '정자역', lines: '신분당선 · 수인분당선',
  lat: 37.3677228, lng: 127.108455,
  url: 'https://pts.map.naver.com/end-subway/ends/web/1915/home',
  // The building's on-site daycare lists the exit, bus and stop on Work24.
  // https://m.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet&wantedAuthNo=K180312610210028
  // GBIS lists the center as the route's last stop.
  // https://www.gbis.go.kr/service/busInfo/townBus.action?centerId=4113000000&cmd=townBus
  bus: { from: '정자역 2번 출구', line: '마을버스 2번', stop: '현대중공업R&D센터' },
};

export function isConfirmedVenue(venue: Venue): boolean {
  const name = venue.name.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  return confirmedVenueNames.has(name) && confirmedVenueAddress.test(venue.address.normalize('NFKC'));
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

export function getNaverPlaceSearchUrl(query: string): string {
  const keyword = query.trim();
  return keyword ? `https://map.naver.com/p/search/${encodeURIComponent(keyword)}` : 'https://map.naver.com/p/';
}

export function getNaverVenueUrl(venue: Venue): string {
  return getVenueStation(venue)
    ? 'https://m.place.naver.com/place/1156613092/location'
    : getNaverPlaceSearchUrl(`${venue.name} ${venue.address}`);
}

/** Nearby station context belongs only to the verified venue and map pin. */
export function getVenueStation(venue: Venue): typeof jeongjaStation | null {
  if (!isConfirmedVenue(venue)) return null;
  const coordinates = getVenueCoordinates(venue);
  if (!coordinates) return null;
  // Naver's address and place search can return different points on the site.
  const metersPerDegree = 111_320;
  const longitudeScale = Math.cos(confirmedVenueCoordinates.lat * Math.PI / 180);
  const distance = Math.hypot(
    (coordinates.lat - confirmedVenueCoordinates.lat) * metersPerDegree,
    (coordinates.lng - confirmedVenueCoordinates.lng) * metersPerDegree * longitudeScale,
  );
  return distance <= venueSiteRadiusMeters ? jeongjaStation : null;
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
