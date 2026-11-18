import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, MapPin, RefreshCw, TrainFront } from 'lucide-react';
import type { Venue } from '../lib/types';
import { getNaverVenueUrl, getVenueCoordinates, getVenueMapViewport, getVenueStation } from '../lib/venue-map';
import { naverMapClientId } from '../lib/integrations';
import { geocodeNaverAddresses, loadNaverMaps, NaverMapError, onNaverMapAuthFailure } from '../lib/naver-maps';
import type { MapInstance, MarkerInstance, NaverMaps } from '../lib/naver-maps';
import '../styles/venue-map.css';

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
  const venueName = venue.name || '예식장';
  const mapTitle = title || `${venueName} 위치 지도`;
  const requestKey = `${clientId}:${lat}:${lng}:${address}:${venueName}:${attempt}`;
  const status = state.key === requestKey ? state.status : 'loading';
  const configured = Boolean(clientId);
  const naverReady = configured && status === 'ready';
  const nearbyBus = !venue.bus.trim() && !venue.transport.trim() ? station?.bus : undefined;

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
    const stopWatchingAuth = onNaverMapAuthFailure(fail);
    // Wait until the user pauses typing an address before looking it up.
    const debounce = window.setTimeout(() => {
      void loadNaverMaps(clientId).then(async sdk => {
        if (cancelled || failed || !element) return;
        maps = sdk;
        stage = 'geocoding';
        const pin = lat !== undefined && lng !== undefined ? { lat, lng } : (await geocodeNaverAddresses(sdk, clientId, address, 1))[0];
        if (!pin) throw new NaverMapError('geocode-no-match', 'Venue address could not be found');
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
        const addMarker = (name: string, label: string, point: unknown, kind: 'venue' | 'station') => {
          markers.push(new sdk.Marker({
            map, position: point, title: name, zIndex: kind === 'venue' ? 20 : 10,
            icon: { content: markerLabel(label, kind), ...(sdk.Point ? { anchor: new sdk.Point(0, 0) } : {}) },
          }));
        };
        addMarker(venueName, station ? '예식장' : venueName, position, 'venue');
        if (station) {
          addMarker(station.name, station.name, new sdk.LatLng(station.lat, station.lng), 'station');
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
      stopWatchingAuth(); destroy();
    };
  }, [clientId, lat, lng, address, venueName, requestKey, station]);

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
    {station && <div className="venue-map-station">
      <div className="venue-map-station-heading">
        <TrainFront size={18} strokeWidth={1.5} aria-hidden="true" />
        <div><strong>{station.name}</strong><span>{station.lines}</span></div>
        <a aria-label={`${station.name} 정보`} href={station.url} target="_blank" rel="noreferrer">역 정보<ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
      {nearbyBus && <div className="venue-map-station-transfer">
        <span>{nearbyBus.from}에서 {nearbyBus.line} 탑승</span>
        <span>{nearbyBus.stop} 방면 · 종점 하차</span>
      </div>}
    </div>}
  </div>;
}
