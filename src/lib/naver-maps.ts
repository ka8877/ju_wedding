export interface MapInstance { isReady?: boolean; destroy?: () => void; fitBounds?: (bounds: unknown, margin: Record<string, number>) => void; }
export interface MarkerInstance { setMap: (map: MapInstance | null) => void; }
export interface NaverAddress { address: string; lat: number; lng: number; }
interface RawNaverAddress { x: string; y: string; roadAddress?: string; jibunAddress?: string; }
export interface NaverMaps {
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
    geocode: (options: { query: string; count: number }, callback: (status: number, response?: { v2?: { addresses?: RawNaverAddress[] } }) => void) => void;
  };
}
type NaverWindow = Window & { naver?: { maps?: NaverMaps }; navermap_authFailure?: () => void };
export class NaverMapError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'NaverMapError'; }
}
const browser = () => window as NaverWindow;
const sdkRequests = new Map<string, Promise<NaverMaps>>();
const geocodeRequests = new Map<string, Promise<NaverAddress[]>>();
const authenticationFailures = new Set<(error: NaverMapError) => void>();
let activeSdkKey = '';
let authenticationHookInstalled = false;

export function onNaverMapAuthFailure(listener: (error: NaverMapError) => void) {
  authenticationFailures.add(listener);
  return () => { authenticationFailures.delete(listener); };
}

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
export function loadNaverMaps(clientId: string): Promise<NaverMaps> {
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

/** Reuse matching lookups across the editor and invitation. */
export function geocodeNaverAddresses(sdk: NaverMaps, clientId: string, query: string, count: number): Promise<NaverAddress[]> {
  const key = `${clientId}:${count}:${query}`;
  const existing = geocodeRequests.get(key);
  if (existing) return existing;
  const request = new Promise<NaverAddress[]>((resolve, reject) => {
    const service = sdk.Service;
    if (!service || !query) { reject(new NaverMapError('geocode-address-unavailable', 'Venue address is unavailable')); return; }
    const timer = window.setTimeout(() => reject(new NaverMapError('geocode-timeout', 'Venue lookup timed out')), 8_000);
    try {
      service.geocode({ query, count }, (status, response) => {
        clearTimeout(timer);
        if (status !== service.Status.OK) { reject(new NaverMapError('geocode-request', 'Naver Maps geocoder request failed')); return; }
        const addresses = response?.v2?.addresses;
        resolve(Array.isArray(addresses) ? addresses.flatMap(item => {
          const lat = Number(item?.y), lng = Number(item?.x);
          if (!item?.x?.trim() || !item.y?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
          const address = item.roadAddress?.trim() || item.jibunAddress?.trim() || '';
          return [{ address, lat, lng }];
        }) : []);
      });
    } catch { clearTimeout(timer); reject(new NaverMapError('geocode-request', 'Naver Maps geocoder request failed')); }
  });
  geocodeRequests.set(key, request);
  void request.then(addresses => { if (!addresses.length) geocodeRequests.delete(key); }, () => geocodeRequests.delete(key));
  return request;
}
