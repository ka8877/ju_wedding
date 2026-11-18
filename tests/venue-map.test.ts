import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { confirmedVenueCoordinates, getGoogleVenueUrl, getKakaoVenueUrl, getNaverVenueUrl, getVenueCoordinates, getVenueMapViewport, getVenueStation, jeongjaStation } from '../src/lib/venue-map';

describe('venue and nearby transport map views', () => {
  it('frames the verified venue with Jeongja station and can return to a detailed venue view', () => {
    const venue = defaultWedding.venue;
    const overview = getVenueMapViewport(venue, 'area')!;
    expect(overview.center.lat).toBeGreaterThan(jeongjaStation.lat);
    expect(overview.center.lat).toBeLessThan(confirmedVenueCoordinates.lat);
    expect(overview.center.lng).toBeGreaterThan(confirmedVenueCoordinates.lng);
    expect(overview.center.lng).toBeLessThan(jeongjaStation.lng);
    const details = getVenueMapViewport(venue, 'venue')!;
    expect(details.center).toEqual(confirmedVenueCoordinates);
    expect(details.zoom).toBeGreaterThan(overview.zoom);
    expect(getVenueStation(venue)).toEqual(jeongjaStation);
  });

  it('keeps station context tied to the confirmed venue instead of another address or edited pin', () => {
    for (const venue of [
      { ...defaultWedding.venue, name: '다른 예식장', address: '서울특별시 중구 세종대로 110', lat: 37.5665, lng: 126.978 },
      { ...defaultWedding.venue, address: '다른 주소', lat: null, lng: null },
      { ...defaultWedding.venue, address: '분당수서로 4770', lat: null, lng: null },
      { ...defaultWedding.venue, address: '분당수서로 477-1', lat: null, lng: null },
      { ...defaultWedding.venue, lat: 37.5665, lng: 126.978 },
    ]) {
      expect(getVenueStation(venue)).toBeNull();
      expect(getNaverVenueUrl(venue)).not.toContain('/place/1156613092/');
    }
  });

  it('recognizes the same venue after place search changes its name formatting or pin', () => {
    const venue = {
      ...defaultWedding.venue,
      name: 'HD현대그룹 글로벌R&D센터',
      address: '경기도 성남시 분당구 분당수서로 477 (정자동)',
      lat: 37.37715, lng: 127.10454,
    };
    expect(getVenueCoordinates(venue)).toEqual({ lat: venue.lat, lng: venue.lng });
    expect(getVenueStation(venue)).toBe(jeongjaStation);
    expect(getNaverVenueUrl(venue)).toBe('https://m.place.naver.com/place/1156613092/location');
    expect(getVenueCoordinates({ ...venue, lat: null, lng: null })).toEqual(confirmedVenueCoordinates);
  });

  it('creates optional external Google and Kakao links with the verified venue pin', () => {
    const google = new URL(getGoogleVenueUrl(defaultWedding.venue));
    expect(google.origin + google.pathname).toBe('https://www.google.com/maps/search/');
    expect(google.searchParams.get('api')).toBe('1');
    expect(google.searchParams.get('query')).toBe('37.3768838,127.1043929');
    expect(google.searchParams.has('output')).toBe(false);
    expect(decodeURIComponent(getKakaoVenueUrl(defaultWedding.venue))).toBe('https://map.kakao.com/link/map/HD현대글로벌R&D센터,37.3768838,127.1043929');
  });

  it('searches the edited venue address when coordinates are unknown', () => {
    const venue = { ...defaultWedding.venue, name: '다른 예식장', address: '서울특별시 중구 세종대로 110', lat: null, lng: null };
    expect(new URL(getGoogleVenueUrl(venue)).searchParams.get('query')).toBe('다른 예식장 서울특별시 중구 세종대로 110');
    expect(new URL(getKakaoVenueUrl(venue)).searchParams.get('q')).toBe('다른 예식장 서울특별시 중구 세종대로 110');
  });
});
