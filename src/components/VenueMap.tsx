import { useEffect, useRef, useState } from 'react';
import type { Venue } from '../lib/types';
import { getGoogleVenueMapUrl, getVenueCoordinates } from '../lib/venue-map';
import { naverMapClientId } from '../lib/integrations';
import '../styles/venue-map.css';

interface MapInstance { destroy?: () => void; }
interface MarkerInstance { setMap: (map: MapInstance | null) => void; }
interface NaverMaps {
  LatLng: new (lat: number, lng: number) => unknown;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => MarkerInstance;
  Event: {
    addListenerOnce: (map: MapInstance, event: string, listener: () => void) => unknown;
    removeListener: (listener: unknown) => void;
    clearInstanceListeners?: (instance: MapInstance) => void;
  };
  Position?: { TOP_RIGHT: unknown };
}
type NaverWindow = Window & { naver?: { maps?: NaverMaps }; navermap_authFailure?: () => void };
const browser = () => window as NaverWindow;
const sdkRequests = new Map<string, Promise<NaverMaps>>();
const authenticationFailures = new Set<() => void>();
let activeSdkKey = '';
let authenticationHookInstalled = false;

function installAuthenticationHook() {
  if (authenticationHookInstalled) return;
  authenticationHookInstalled = true;
  const previous = browser().navermap_authFailure;
  browser().navermap_authFailure = () => {
    authenticationFailures.forEach(listener => listener());
    previous?.();
  };
}

/** Multiple public/admin previews share one request for the same public ID. */
function loadNaverMaps(clientId: string): Promise<NaverMaps> {
  if (activeSdkKey === clientId && browser().naver?.maps) return Promise.resolve(browser().naver!.maps!);
  const pending = sdkRequests.get(clientId);
  if (pending) return pending;
  installAuthenticationHook();
  const request = new Promise<NaverMaps>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.dataset.weddingNaverMaps = clientId;
    let finished = false;
    const cleanup = () => { clearTimeout(timer); authenticationFailures.delete(authFailed); };
    const fail = () => {
      if (finished) return;
      finished = true; cleanup(); script.remove();
      sdkRequests.delete(clientId);
      reject(new Error('Naver Maps could not be loaded'));
    };
    const authFailed = () => fail();
    const timer = window.setTimeout(fail, 10_000);
    authenticationFailures.add(authFailed);
    script.onerror = fail;
    script.onload = () => {
      if (finished) return;
      const maps = browser().naver?.maps;
      if (!maps?.Map || !maps.LatLng || !maps.Marker) { fail(); return; }
      finished = true; cleanup(); activeSdkKey = clientId; resolve(maps);
    };
    document.head.append(script);
  });
  sdkRequests.set(clientId, request);
  return request;
}

interface VenueMapProps { venue: Venue; title?: string; className?: string; }

export default function VenueMap({ venue, title, className = '' }: VenueMapProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const [naverReady, setNaverReady] = useState(false);
  const coordinates = getVenueCoordinates(venue);
  const lat = coordinates?.lat;
  const lng = coordinates?.lng;
  const clientId = naverMapClientId(venue.naverMapClientId);
  const mapTitle = title || `${venue.name || '예식장'} 위치 지도`;

  useEffect(() => {
    setNaverReady(false);
    if (!clientId || lat === undefined || lng === undefined || !/^[A-Za-z0-9_-]+$/.test(clientId)) return;
    let cancelled = false;
    let failed = false;
    let map: MapInstance | undefined;
    let marker: MarkerInstance | undefined;
    let idleListener: unknown;
    let maps: NaverMaps | undefined;
    let mapTimer: ReturnType<typeof setTimeout> | undefined;
    const authFailed = () => { failed = true; if (!cancelled) setNaverReady(false); };
    authenticationFailures.add(authFailed);
    // Public and editor previews share the same centrally configured SDK.
    const debounce = window.setTimeout(() => {
      void loadNaverMaps(clientId).then(sdk => {
        if (cancelled || !canvas.current) return;
        maps = sdk;
        const position = new sdk.LatLng(lat, lng);
        map = new sdk.Map(canvas.current, {
          center: position, zoom: 16, zoomControl: true, mapDataControl: true,
          logoControl: true, scaleControl: true, scrollWheel: false,
          ...(sdk.Position ? { zoomControlOptions: { position: sdk.Position.TOP_RIGHT } } : {}),
        });
        marker = new sdk.Marker({ map, position, title: venue.name || '예식장' });
        // Keep the working embedded map if authentication/tiles never become
        // ready; a slow or blocked SDK must never leave the invitation blank.
        mapTimer = setTimeout(() => { if (!cancelled) setNaverReady(false); }, 8_000);
        idleListener = sdk.Event.addListenerOnce(map, 'idle', () => {
          if (!cancelled && !failed) { clearTimeout(mapTimer); setNaverReady(true); }
        });
      }).catch(() => { if (!cancelled) setNaverReady(false); });
    }, 600);
    return () => {
      cancelled = true; clearTimeout(debounce); clearTimeout(mapTimer);
      authenticationFailures.delete(authFailed);
      if (idleListener !== undefined) maps?.Event.removeListener(idleListener);
      marker?.setMap(null);
      if (map) { maps?.Event.clearInstanceListeners?.(map); map.destroy?.(); }
    };
  }, [clientId, lat, lng, venue.name]);

  return <div className={`venue-map ${className}`} data-map-provider={naverReady ? 'naver' : 'google'}>
    <div className="venue-map-frame">
      {!naverReady && <iframe title={mapTitle} src={getGoogleVenueMapUrl(venue)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
      <div className={`venue-map-naver${naverReady ? ' is-ready' : ''}`} ref={canvas} role="region" aria-label={`${mapTitle} · 네이버 지도`} aria-hidden={!naverReady} />
    </div>
    <p className="venue-map-caption"><span>{naverReady ? '네이버 지도' : 'Google 지도'}</span><span>{venue.name || '예식장'}{venue.hall ? ` · ${venue.hall}` : ''}</span></p>
  </div>;
}
