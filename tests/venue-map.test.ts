import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { confirmedVenueCoordinates, getGoogleVenueMapUrl, getVenueMapViewport, getVenueStation, jeongjaStation } from '../src/lib/venue-map';

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
      { ...defaultWedding.venue, lat: 37.5665, lng: 126.978 },
    ]) {
      expect(getVenueStation(venue)).toBeNull();
      const url = new URL(getGoogleVenueMapUrl(venue));
      expect(url.searchParams.get('ll')).not.toBe('37.3723033,127.10642395');
    }
  });

  it('uses Korean road maps and a wider overview without requiring a provider key', () => {
    const overview = new URL(getGoogleVenueMapUrl(defaultWedding.venue, 'area'));
    expect(overview.searchParams.get('hl')).toBe('ko');
    expect(overview.searchParams.get('t')).toBe('m');
    expect(overview.searchParams.get('q')).toContain(defaultWedding.venue.name);
    expect(overview.searchParams.get('z')).toBe('14');
    expect(overview.searchParams.has('key')).toBe(false);
    expect(getGoogleVenueMapUrl(defaultWedding.venue, 'venue')).not.toBe(overview.href);
  });
});
