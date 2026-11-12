import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, MapPin, RefreshCw } from 'lucide-react';
import type { Venue } from '../lib/types';
import { getGoogleVenueMapUrl, getNaverVenueUrl, getVenueCoordinates } from '../lib/venue-map';
import { naverMapClientId } from '../lib/integrations';
import '../styles/venue-map.css';

interface MapInstance { destroy?: () => void; }
interface MarkerInstance { setMap: (map: MapInstance | null) => void; }
interface Coordinates { lat: number; lng: number; }
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
  Service?: {
    Status: { OK: number };
    geocode: (options: { query: string; count: number }, callback: (status: number, response?: { v2?: { addresses?: { x: string; y: string }[] } }) => void) => void;
  };
}
type NaverWindow = Window & { naver?: { maps?: NaverMaps }; navermap_authFailure?: () => void };
const browser = () => window as NaverWindow;
const sdkRequests = new Map<string, Promise<NaverMaps>>();
const geocodeRequests = new Map<string, Promise<Coordinates>>();
const authenticationFailures = new Set<() => void>();
let activeSdkKey = '';
let authenticationHookInstalled = false;

function installAuthenticationHook() {
  if (authenticationHookInstalled) return;
  authenticationHookInstalled = true;
  const previous = browser().navermap_authFailure;
  browser().navermap_authFailure = () => {
    if (activeSdkKey) sdkRequests.delete(activeSdkKey);
    activeSdkKey = '';
    authenticationFailures.forEach(listener => listener());
    previous?.();
  };
}

/** Public and editor previews share the same developer-configured SDK. */
function loadNaverMaps(clientId: string): Promise<NaverMaps> {
  if (activeSdkKey === clientId && browser().naver?.maps) return Promise.resolve(browser().naver!.maps!);
  const pending = sdkRequests.get(clientId);
  if (pending) return pending;
  installAuthenticationHook();
  const request = new Promise<NaverMaps>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    // Geocoding is enabled on the same Naver application. No client secret is
    // exposed; the official browser module authenticates its registered origin.
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`;
    script.dataset.weddingNaverMaps = clientId;
    let finished = false;
    const cleanup = () => { clearTimeout(timer); authenticationFailures.delete(authFailed); };
    const fail = () => {
      if (finished) return;
      finished = true; cleanup(); script.remove(); sdkRequests.delete(clientId);
      reject(new Error('Naver Maps could not be loaded'));
    };
    const authFailed = () => fail();
    const timer = window.setTimeout(fail, 10_000);
    authenticationFailures.add(authFailed);
    script.onerror = fail;
    script.onload = () => {
      if (finished) return;
      const maps = browser().naver?.maps;
      if (!maps?.Map || !maps.LatLng || !maps.Marker || !maps.Event) { fail(); return; }
      finished = true; cleanup(); activeSdkKey = clientId; resolve(maps);
    };
    document.head.append(script);
  });
  sdkRequests.set(clientId, request);
  return request;
}

/** Reuse a successful address lookup across the live editor and its preview. */
function geocodeAddress(sdk: NaverMaps, clientId: string, address: string): Promise<Coordinates> {
  const key = `${clientId}:${address}`;
  const existing = geocodeRequests.get(key);
  if (existing) return existing;
  const request = new Promise<Coordinates>((resolve, reject) => {
    const service = sdk.Service;
    if (!service || !address) { reject(new Error('Venue address is unavailable')); return; }
    const timer = window.setTimeout(() => reject(new Error('Venue lookup timed out')), 8_000);
    try {
      service.geocode({ query: address, count: 1 }, (status, response) => {
        clearTimeout(timer);
        const match = response?.v2?.addresses?.[0];
        const lat = Number(match?.y), lng = Number(match?.x);
        if (status !== service.Status.OK || !match?.x?.trim() || !match.y?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          reject(new Error('Venue address could not be found')); return;
        }
        resolve({ lat, lng });
      });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
  geocodeRequests.set(key, request);
  void request.catch(() => geocodeRequests.delete(key));
  return request;
}

interface VenueMapProps { venue: Venue; title?: string; className?: string; }
type MapStatus = 'loading' | 'ready' | 'error';

export default function VenueMap({ venue, title, className = '' }: VenueMapProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; status: MapStatus }>({ key: '', status: 'loading' });
  const coordinates = getVenueCoordinates(venue);
  const lat = coordinates?.lat, lng = coordinates?.lng;
  const clientId = naverMapClientId(venue.naverMapClientId);
  const address = venue.address.trim();
  const mapTitle = title || `${venue.name || '예식장'} 위치 지도`;
  const requestKey = `${clientId}:${lat}:${lng}:${address}:${venue.name}:${attempt}`;
  const status = state.key === requestKey ? state.status : 'loading';
  const configured = Boolean(clientId);
  const naverReady = configured && status === 'ready';

  useEffect(() => {
    if (!clientId) return;
    setState({ key: requestKey, status: 'loading' });
    let cancelled = false;
    let failed = false;
    let map: MapInstance | undefined;
    let marker: MarkerInstance | undefined;
    let idleListener: unknown;
    let maps: NaverMaps | undefined;
    let mapTimer: ReturnType<typeof setTimeout> | undefined;
    const element = canvas.current;
    const destroy = () => {
      if (idleListener !== undefined) { maps?.Event.removeListener(idleListener); idleListener = undefined; }
      marker?.setMap(null); marker = undefined;
      if (map) { maps?.Event.clearInstanceListeners?.(map); map.destroy?.(); map = undefined; }
      element?.replaceChildren();
    };
    const fail = () => {
      if (cancelled || failed) return;
      failed = true; clearTimeout(mapTimer); destroy();
      setState({ key: requestKey, status: 'error' });
    };
    authenticationFailures.add(fail);
    // Wait until the user pauses typing an address before looking it up.
    const debounce = window.setTimeout(() => {
      void loadNaverMaps(clientId).then(async sdk => {
        if (cancelled || failed || !element) return;
        maps = sdk;
        const pin = lat !== undefined && lng !== undefined ? { lat, lng } : await geocodeAddress(sdk, clientId, address);
        if (cancelled || failed) return;
        const position = new sdk.LatLng(pin.lat, pin.lng);
        map = new sdk.Map(element, {
          center: position, zoom: 16, zoomControl: true, mapDataControl: true,
          logoControl: true, scaleControl: true, scrollWheel: false,
          ...(sdk.Position ? { zoomControlOptions: { position: sdk.Position.TOP_RIGHT } } : {}),
        });
        marker = new sdk.Marker({ map, position, title: venue.name || '예식장' });
        mapTimer = setTimeout(fail, 8_000);
        idleListener = sdk.Event.addListenerOnce(map, 'idle', () => {
          if (!cancelled && !failed) { clearTimeout(mapTimer); setState({ key: requestKey, status: 'ready' }); }
        });
      }).catch(fail);
    }, 600);
    return () => {
      cancelled = true; clearTimeout(debounce); clearTimeout(mapTimer);
      authenticationFailures.delete(fail); destroy();
    };
  }, [clientId, lat, lng, address, venue.name, attempt, requestKey]);

  return <div className={`venue-map ${className}`} data-map-provider={configured ? 'naver' : 'google'} data-map-state={configured ? status : 'ready'}>
    <div className="venue-map-frame">
      {!configured && <iframe title={mapTitle} src={getGoogleVenueMapUrl(venue)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
      {configured && !naverReady && <div className="venue-map-status" role={status === 'error' ? 'alert' : 'status'}>
        <span className="venue-map-brand">NAVER MAP</span>
        {status === 'error' ? <><MapPin size={25} strokeWidth={1.3} /><p>지도를 불러오지 못했어요.<br />다시 시도하거나 네이버 지도에서 확인해 주세요.</p><div><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={13} />다시 시도</button><a href={getNaverVenueUrl(venue)} target="_blank" rel="noreferrer">네이버 지도 열기<ArrowUpRight size={13} /></a></div></> : <><LoaderCircle className="venue-map-loading" size={24} strokeWidth={1.5} /><p>네이버 지도를 불러오고 있어요.</p></>}
      </div>}
      <div className={`venue-map-naver${naverReady ? ' is-ready' : ''}`} ref={canvas} role="region" aria-label={`${mapTitle} · 네이버 지도`} aria-hidden={!naverReady} />
    </div>
    <p className="venue-map-caption"><span>{configured ? '네이버 지도' : 'Google 지도'}</span><span>{venue.name || '예식장'}{venue.hall ? ` · ${venue.hall}` : ''}</span></p>
  </div>;
}
