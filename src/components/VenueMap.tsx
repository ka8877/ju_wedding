import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, MapPin, RefreshCw, TrainFront } from 'lucide-react';
import type { Venue } from '../lib/types';
import { getNaverVenueUrl, getVenueCoordinates, getVenueMapViewport, getVenueStation } from '../lib/venue-map';
import { naverMapClientId } from '../lib/integrations';
import '../styles/venue-map.css';

interface MapInstance { isReady?: boolean; destroy?: () => void; fitBounds?: (bounds: unknown, margin: Record<string, number>) => void; }
interface MarkerInstance { setMap: (map: MapInstance | null) => void; }
interface Coordinates { lat: number; lng: number; }
interface NaverMaps {
  onJSContentLoaded?: (() => void) | null;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds?: new (southwest: unknown, northeast: unknown) => unknown;
  Point?: new (x: number, y: number) => unknown;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => MarkerInstance;
  Event: {
    once: (map: MapInstance, event: string, listener: () => void) => unknown;
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
class NaverMapError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'NaverMapError'; }
}
const browser = () => window as NaverWindow;
const sdkRequests = new Map<string, Promise<NaverMaps>>();
const geocodeRequests = new Map<string, Promise<Coordinates>>();
const authenticationFailures = new Set<(error: NaverMapError) => void>();
let activeSdkKey = '';
let authenticationHookInstalled = false;

function installAuthenticationHook() {
  if (authenticationHookInstalled) return;
  authenticationHookInstalled = true;
  const previous = browser().navermap_authFailure;
  browser().navermap_authFailure = () => {
    if (activeSdkKey) sdkRequests.delete(activeSdkKey);
    activeSdkKey = '';
    const error = new NaverMapError('authentication', 'Naver Maps rejected the application or its web service URL');
    authenticationFailures.forEach(listener => listener(error));
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
    let mapsWaitingForModules: NaverMaps | undefined;
    let previousContentLoaded: NaverMaps['onJSContentLoaded'];
    let contentLoaded: (() => void) | undefined;
    const cleanup = () => {
      clearTimeout(timer); authenticationFailures.delete(authFailed);
      if (mapsWaitingForModules && mapsWaitingForModules.onJSContentLoaded === contentLoaded) {
        mapsWaitingForModules.onJSContentLoaded = previousContentLoaded;
      }
    };
    const fail = (error: NaverMapError) => {
      if (finished) return;
      finished = true; cleanup(); script.remove(); sdkRequests.delete(clientId);
      reject(error);
    };
    const authFailed = (error: NaverMapError) => fail(error);
    const timer = window.setTimeout(() => fail(new NaverMapError('sdk-timeout', 'Naver Maps SDK or its geocoder did not finish loading')), 10_000);
    authenticationFailures.add(authFailed);
    script.onerror = () => fail(new NaverMapError('sdk-network', 'Naver Maps SDK request failed'));
    script.onload = () => {
      if (finished) return;
      const maps = browser().naver?.maps;
      if (!maps?.Map || !maps.LatLng || !maps.Marker || !maps.Event?.once || !maps.Event.removeListener) { fail(new NaverMapError('sdk-api-unavailable', 'Naver Maps SDK loaded without the required map APIs')); return; }
      const ready = () => {
        if (finished) return;
        if (!maps.Service?.geocode) { fail(new NaverMapError('geocoder-unavailable', 'Naver Maps geocoder submodule is unavailable')); return; }
        finished = true; cleanup(); activeSdkKey = clientId; resolve(maps);
      };
      if (maps.Service?.geocode) { ready(); return; }
      // maps.js loads requested submodules in separate scripts. Its own load
      // event can fire before the geocoder exists, so wait for SDK completion.
      mapsWaitingForModules = maps;
      previousContentLoaded = maps.onJSContentLoaded;
      contentLoaded = () => { ready(); previousContentLoaded?.(); };
      maps.onJSContentLoaded = contentLoaded;
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
    if (!service || !address) { reject(new NaverMapError('geocode-address-unavailable', 'Venue address is unavailable')); return; }
    const timer = window.setTimeout(() => reject(new NaverMapError('geocode-timeout', 'Venue lookup timed out')), 8_000);
    try {
      service.geocode({ query: address, count: 1 }, (status, response) => {
        clearTimeout(timer);
        const match = response?.v2?.addresses?.[0];
        const lat = Number(match?.y), lng = Number(match?.x);
        if (status !== service.Status.OK || !match?.x?.trim() || !match.y?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          reject(new NaverMapError('geocode-no-match', 'Venue address could not be found')); return;
        }
        resolve({ lat, lng });
      });
    } catch { clearTimeout(timer); reject(new NaverMapError('geocode-request', 'Naver Maps geocoder request failed')); }
  });
  geocodeRequests.set(key, request);
  void request.catch(() => geocodeRequests.delete(key));
  return request;
}

interface VenueMapProps { venue: Venue; title?: string; className?: string; }
type MapStatus = 'loading' | 'ready' | 'error';

function markerLabel(name: string, kind: 'venue' | 'station') {
  const label = document.createElement('div');
  label.className = `venue-map-pin venue-map-pin--${kind}`;
  const dot = document.createElement('span');
  dot.className = 'venue-map-pin-dot'; dot.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.textContent = name;
  label.append(text, dot);
  return label;
}

export default function VenueMap({ venue, title, className = '' }: VenueMapProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; status: MapStatus }>({ key: '', status: 'loading' });
  const coordinates = getVenueCoordinates(venue);
  const lat = coordinates?.lat, lng = coordinates?.lng;
  const station = getVenueStation(venue);
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
    let initialized = false;
    let map: MapInstance | undefined;
    const markers: MarkerInstance[] = [];
    let initListener: unknown;
    let idleListener: unknown;
    let maps: NaverMaps | undefined;
    let mapTimer: ReturnType<typeof setTimeout> | undefined;
    let stage = 'sdk';
    const element = canvas.current;
    const clearReadyListeners = () => {
      if (initListener !== undefined) { maps?.Event.removeListener(initListener); initListener = undefined; }
      if (idleListener !== undefined) { maps?.Event.removeListener(idleListener); idleListener = undefined; }
    };
    const destroy = () => {
      clearReadyListeners();
      markers.forEach(marker => marker.setMap(null)); markers.length = 0;
      if (map) { maps?.Event.clearInstanceListeners?.(map); map.destroy?.(); map = undefined; }
      element?.replaceChildren();
    };
    const fail = (reason: unknown) => {
      if (cancelled || failed) return;
      failed = true; clearTimeout(mapTimer); destroy();
      const code = reason instanceof NaverMapError ? reason.code : stage;
      const message = reason instanceof NaverMapError ? reason.message : 'Naver Maps SDK call failed';
      // Keep operational details in developer tools, away from guest-facing copy.
      console.error(`[VenueMap] ${code}: ${message}`, { stage, errorType: reason instanceof Error ? reason.name : 'unknown' });
      setState({ key: requestKey, status: 'error' });
    };
    authenticationFailures.add(fail);
    // Wait until the user pauses typing an address before looking it up.
    const debounce = window.setTimeout(() => {
      void loadNaverMaps(clientId).then(async sdk => {
        if (cancelled || failed || !element) return;
        maps = sdk;
        stage = 'geocoding';
        const pin = lat !== undefined && lng !== undefined ? { lat, lng } : await geocodeAddress(sdk, clientId, address);
        if (cancelled || failed) return;
        stage = 'map-initialization';
        const position = new sdk.LatLng(pin.lat, pin.lng);
        const viewport = getVenueMapViewport(venue, station ? 'area' : 'venue', pin)!;
        map = new sdk.Map(element, {
          center: new sdk.LatLng(viewport.center.lat, viewport.center.lng), zoom: viewport.zoom, zoomControl: true, mapDataControl: true,
          logoControl: true, scaleControl: true, scrollWheel: false,
          ...(sdk.Position ? { zoomControlOptions: { position: sdk.Position.TOP_RIGHT } } : {}),
        });
        const ready = () => {
          if (cancelled || failed || initialized) return;
          initialized = true;
          clearTimeout(mapTimer); clearReadyListeners();
          setState({ key: requestKey, status: 'ready' });
        };
        mapTimer = setTimeout(() => fail(new NaverMapError('map-initialization-timeout', 'Naver Maps did not report map initialization')), 8_000);
        // Raster maps emit init without an initial idle event. Register before
        // fitBounds, which can emit idle synchronously, and also handle an SDK
        // map that completed initialization during its constructor.
        initListener = sdk.Event.once(map, 'init', ready);
        idleListener = sdk.Event.once(map, 'idle', ready);
        const addMarker = (name: string, point: unknown, kind: 'venue' | 'station') => {
          markers.push(new sdk.Marker({
            map, position: point, title: name, zIndex: kind === 'venue' ? 20 : 10,
            icon: { content: markerLabel(name, kind), ...(sdk.Point ? { anchor: new sdk.Point(0, 0) } : {}) },
          }));
        };
        addMarker(venue.name || '예식장', position, 'venue');
        if (station) {
          addMarker(station.name, new sdk.LatLng(station.lat, station.lng), 'station');
          if (sdk.LatLngBounds && map.fitBounds) {
            map.fitBounds(new sdk.LatLngBounds(
              new sdk.LatLng(Math.min(pin.lat, station.lat), Math.min(pin.lng, station.lng)),
              new sdk.LatLng(Math.max(pin.lat, station.lat), Math.max(pin.lng, station.lng)),
            ), { top: 65, right: 45, bottom: 65, left: 45 });
          }
        }
        if (map.isReady) ready();
      }).catch(fail);
    }, lat !== undefined && lng !== undefined ? 0 : 600);
    return () => {
      cancelled = true; clearTimeout(debounce); clearTimeout(mapTimer);
      authenticationFailures.delete(fail); destroy();
    };
  }, [clientId, lat, lng, address, venue.name, attempt, requestKey, station]);

  return <div className={`venue-map ${className}`} data-map-provider="naver" data-map-state={configured ? status : 'unconfigured'}>
    {!naverReady && <div className="venue-map-status" role={configured ? status === 'error' ? 'alert' : 'status' : 'note'}>
      {configured && status === 'loading' ? <><LoaderCircle className="venue-map-loading" size={20} strokeWidth={1.5} /><p>네이버 지도를 불러오고 있어요.</p></> : <><MapPin size={20} strokeWidth={1.3} /><p>{configured ? '네이버 지도를 불러오지 못했어요.' : '네이버 지도에서 예식장 위치를 확인해 주세요.'}</p></>}
      <div>
        {configured && status === 'error' && <button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={13} />다시 시도</button>}
        <a href={getNaverVenueUrl(venue)} target="_blank" rel="noreferrer">네이버 지도에서 보기<ArrowUpRight size={13} /></a>
      </div>
    </div>}
    {configured && <div className={`venue-map-frame${naverReady ? ' is-ready' : ' is-pending'}`} aria-hidden={!naverReady}>
      <div className={`venue-map-naver${naverReady ? ' is-ready' : ''}`} ref={canvas} role="region" aria-label={`${mapTitle} · 네이버 지도`} aria-hidden={!naverReady} />
    </div>}
    {station && <div className="venue-map-station"><TrainFront size={17} strokeWidth={1.5} /><div><strong>{station.name}</strong><span>{station.lines}</span></div><a href={station.url} target="_blank" rel="noreferrer">역 정보<ArrowUpRight size={13} /></a></div>}
    {naverReady && <p className="venue-map-caption"><span>네이버 지도</span><span>{venue.name || '예식장'}{venue.hall ? ` · ${venue.hall}` : ''}</span></p>}
  </div>;
}
