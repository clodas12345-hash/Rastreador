import {AdvancedMarker, Map, useMap} from '@vis.gl/react-google-maps';
import React, {useEffect, useRef, useState} from 'react';
import {Vehicle, SavedRoute, RoutePoint, Geofence} from '../types';
import {VehicleIcon} from './VehicleIcon';
import GeofenceLayer from './GeofenceLayer';
import {AddressDisplay} from './AddressDisplay';
import {Layers, Settings, X, Gauge, Zap, ShieldCheck, AlertTriangle, Radio, Navigation, Crosshair, MapPin} from 'lucide-react';
import { getRealAddress, getCachedAddress, getRealRoadSpeedLimit, getCachedRoadSpeed, determineRoadSpeedLimit, RoadSpeedInfo } from '../lib/geocoding';

function RoadSpeedBadge({ vehicle }: { vehicle: Vehicle }) {
  const [speedInfo, setSpeedInfo] = useState<RoadSpeedInfo>(() => {
    return getCachedRoadSpeed(vehicle.lat, vehicle.lng, vehicle.iconType) || 
      determineRoadSpeedLimit(getCachedAddress(vehicle.lat, vehicle.lng) || '', undefined, undefined, vehicle.iconType);
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!vehicle.lat || !vehicle.lng) return;

    const cached = getCachedRoadSpeed(vehicle.lat, vehicle.lng, vehicle.iconType);
    if (cached) {
      setSpeedInfo(cached);
    } else {
      setLoading(true);
    }

    getRealRoadSpeedLimit(vehicle.lat, vehicle.lng, vehicle.iconType).then((info) => {
      if (isMounted && info) {
        setSpeedInfo(info);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    return () => { isMounted = false; };
  }, [vehicle.lat, vehicle.lng, vehicle.iconType]);

  const isSmart = vehicle.settings?.smartSpeedMode !== false;
  const limitValue = isSmart ? (vehicle.settings?.detectedRoadSpeed || speedInfo.speedLimit) : (vehicle.settings?.speedLimit || 60);

  return (
    <div className="flex items-center gap-1" title={isSmart ? `Limite Regulamentado da Via: ${speedInfo.roadType}` : `Limite Manual Configurado: ${limitValue} km/h`}>
      <strong className="text-gray-900 font-mono flex items-center gap-1">
        <span>{limitValue} km/h</span>
        {isSmart && (
          <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-sans font-bold">
            Via
          </span>
        )}
        {loading && <span className="w-2 h-2 border border-emerald-600 border-t-transparent rounded-full animate-spin"></span>}
      </strong>
    </div>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] }
];

function MapTypeSelector() {
  const map = useMap();
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'dark'>('roadmap');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!map) return;
    if (mapType === 'dark') {
      map.setMapTypeId('roadmap');
      map.setOptions({ styles: darkMapStyle });
    } else {
      map.setMapTypeId(mapType);
      map.setOptions({ styles: [] });
    }
  }, [map, mapType]);

  return (
    <div className="absolute top-4 right-4 z-20 pointer-events-auto">
      <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 p-1 flex flex-col gap-1 transition-all">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2.5 text-gray-700 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors"
          title="Camadas do Mapa"
        >
          <Layers className="w-5 h-5" />
        </button>
        
        {isOpen && (
          <div className="flex flex-col gap-1 mt-1 border-t border-gray-100 pt-1">
            <button
              onClick={() => { setMapType('roadmap'); setIsOpen(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all text-left whitespace-nowrap ${mapType === 'roadmap' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              🗺️ Padrão
            </button>
            <button
              onClick={() => { setMapType('dark'); setIsOpen(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all text-left whitespace-nowrap ${mapType === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              🌙 Noturno
            </button>
            <button
              onClick={() => { setMapType('satellite'); setIsOpen(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all text-left whitespace-nowrap ${mapType === 'satellite' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              🛰️ Satélite
            </button>
            <button
              onClick={() => { setMapType('hybrid'); setIsOpen(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all text-left whitespace-nowrap ${mapType === 'hybrid' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              🌍 Híbrido
            </button>
            <button
              onClick={() => { setMapType('terrain'); setIsOpen(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all text-left whitespace-nowrap ${mapType === 'terrain' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              ⛰️ Relevo
            </button>
          </div>

        )}
      </div>
    </div>
  );
}

import { getRoadSnappedPath, generateCurvedSmoothPath } from '../lib/routeRoadSnapper';

function MapPolyline({
  path,
  color = '#2563eb',
  weight = 5,
  dashed = false,
  smoothCurves = true
}: {
  path: {lat: number; lng: number}[];
  color?: string;
  weight?: number;
  dashed?: boolean;
  smoothCurves?: boolean;
}) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [renderedPath, setRenderedPath] = useState<{lat: number; lng: number}[]>(path);

  useEffect(() => {
    let isCancelled = false;

    if (!smoothCurves || path.length < 2) {
      setRenderedPath(path);
      return;
    }

    // Processa o alinhamento e as curvas das ruas
    // 1. Imediatamente gera curva suave de alta fidelidade
    const initialSmooth = generateCurvedSmoothPath(path, 6);
    setRenderedPath(initialSmooth);

    // 2. Assincronamente busca o contorno exato do traçado viário no Google Maps Directions
    getRoadSnappedPath(path).then((snapped) => {
      if (!isCancelled && snapped && snapped.length > 1) {
        setRenderedPath(snapped);
      }
    }).catch(() => {
      // Já está com initialSmooth
    });

    return () => {
      isCancelled = true;
    };
  }, [path, smoothCurves]);

  useEffect(() => {
    if (!map || renderedPath.length < 2) return;
    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        strokeColor: color,
        strokeOpacity: dashed ? 0.7 : 0.88,
        strokeWeight: weight,
      });
    }
    polylineRef.current.setMap(map);
    polylineRef.current.setPath(renderedPath);
    polylineRef.current.setOptions({
      strokeColor: color,
      strokeWeight: weight,
      strokeOpacity: dashed ? 0.7 : 0.88,
    });

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }
    };
  }, [map, renderedPath, color, weight, dashed]);

  return null;
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const l = map.addListener('zoom_changed', () => {
       const zoom = map.getZoom();
       if (zoom !== undefined) onZoomChange(zoom);
    });
    const initialZoom = map.getZoom();
    if (initialZoom !== undefined) onZoomChange(initialZoom);
    return () => {
      google.maps.event.removeListener(l);
    };
  }, [map, onZoomChange]);
  return null;
}

function MapController({
  selectedVehicle,
  activeRoute,
  vehicles,
  isShowingAll
}: {
  selectedVehicle: Vehicle | null;
  activeRoute: SavedRoute | null;
  vehicles: Vehicle[];
  isShowingAll: boolean;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);
  const prevSelectedId = useRef<string | null>(null);
  const prevRouteId = useRef<string | null>(null);

  useEffect(() => {
    if (!map) return;
    
    // Se o usuário está no modo "Ver Todos", mantém a visão geral de todos os carros
    if (isShowingAll) {
      const validVehicles = vehicles.filter(v => {
        const lat = Number(v.lat);
        const lng = Number(v.lng);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      });
      if (validVehicles.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        validVehicles.forEach(v => {
          bounds.extend({lat: Number(v.lat), lng: Number(v.lng)});
        });
        map.fitBounds(bounds, {top: 60, bottom: 60, left: 60, right: 60});
      }
      return;
    }

    if (activeRoute && activeRoute.points && activeRoute.points.length > 0) {
      if (prevRouteId.current !== activeRoute.id) {
        const bounds = new google.maps.LatLngBounds();
        activeRoute.points.forEach(pt => bounds.extend({lat: pt.lat, lng: pt.lng}));
        map.fitBounds(bounds, {top: 120, bottom: 250, left: 80, right: 80});
        prevRouteId.current = activeRoute.id;
        prevSelectedId.current = null;
      }
    } else {
      const target = selectedVehicle 
        ? (vehicles.find(v => v.id === selectedVehicle.id) || selectedVehicle)
        : vehicles.find(v => {
            const lat = Number(v.lat);
            const lng = Number(v.lng);
            return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
          });

      if (target && Number(target.lat) && Number(target.lng)) {
        const isNewTarget = prevSelectedId.current !== target.id;
        if (!initialFitDone.current || isNewTarget) {
          map.setCenter({lat: Number(target.lat), lng: Number(target.lng)});
          map.setZoom(17);
          initialFitDone.current = true;
          prevSelectedId.current = target.id;
          prevRouteId.current = null;
        } else {
          map.panTo({lat: Number(target.lat), lng: Number(target.lng)});
        }
      }
    }
  }, [map, selectedVehicle, activeRoute, vehicles, isShowingAll]);

  return null;
}

function UserLocationMarker({ vehicles = [], onUpdateVehicle }: { vehicles?: Vehicle[]; onUpdateVehicle?: (updated: Vehicle) => void }) {
  const map = useMap();
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const locateMe = () => {
    setLoading(true);
    setErrorMsg('');
    if (navigator.geolocation) {
      const getPos = (highAccuracy: boolean) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLoading(false);
            const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
            setUserLocation(loc);
            if (map) {
              map.panTo(loc);
              map.setZoom(16);
            }
          },
          (error) => {
            if (highAccuracy && error.code === error.TIMEOUT) {
              // Fallback to lower accuracy
              getPos(false);
              return;
            }
            setLoading(false);
            console.error("Erro ao obter localização", error);
            if (error.code === error.PERMISSION_DENIED) {
              setErrorMsg('Permissão negada. Tente abrir em nova aba.');
            } else {
              setErrorMsg('Não foi possível obter localização.');
            }
            setTimeout(() => setErrorMsg(''), 4000);
          },
          { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 8000 : 5000, maximumAge: 0 }
        );
      };
      getPos(true);
    } else {
      setLoading(false);
      setErrorMsg('Geolocalização não suportada.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  return (
    <>
      <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-6 z-20 pointer-events-auto flex flex-col gap-2 items-start">
        {errorMsg && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-md">
            {errorMsg}
          </div>
        )}
      </div>
      {userLocation && (
        <AdvancedMarker position={userLocation}>
          <div className="relative flex items-center justify-center w-8 h-8">
            <div className="absolute w-full h-full bg-blue-500 rounded-full opacity-30 animate-ping"></div>
            <div className="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-md z-10"></div>
          </div>
        </AdvancedMarker>
      )}
    </>
  );
}

function MapCenterControls({
  vehicles,
  selectedVehicle,
  isShowingAll,
  setIsShowingAll,
  onSelectVehicle
}: {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  isShowingAll: boolean;
  setIsShowingAll: (val: boolean) => void;
  onSelectVehicle: (v: Vehicle) => void;
}) {
  const map = useMap();

  const handleToggle = () => {
    if (!map) return;

    if (!isShowingAll) {
      // Enquadra todos os veículos da frota juntos na tela com margem compacta
      const validVehicles = vehicles.filter(v => {
        const lat = Number(v.lat);
        const lng = Number(v.lng);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      });

      if (validVehicles.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        validVehicles.forEach(v => {
          bounds.extend({ lat: Number(v.lat), lng: Number(v.lng) });
        });
        map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
      }
      setIsShowingAll(true);
    } else {
      // Centraliza e aproxima no veículo selecionado com zoom de rua 17
      const currentTarget = selectedVehicle
        ? (vehicles.find(v => v.id === selectedVehicle.id) || selectedVehicle)
        : vehicles.find(v => {
            const lat = Number(v.lat);
            const lng = Number(v.lng);
            return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
          }) || vehicles[0] || null;

      if (currentTarget && Number(currentTarget.lat) && Number(currentTarget.lng)) {
        map.setCenter({ lat: Number(currentTarget.lat), lng: Number(currentTarget.lng) });
        map.setZoom(17);
      }
      setIsShowingAll(false);
    }
  };

  return (
    <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-20 pointer-events-auto flex items-center">
      <button
        onClick={handleToggle}
        className="bg-white/95 hover:bg-blue-50 text-gray-800 hover:text-blue-600 font-bold px-4 py-2.5 rounded-2xl shadow-xl border border-blue-200 backdrop-blur-md flex items-center gap-2 text-xs transition-all hover:scale-105 active:scale-95 group cursor-pointer"
        title={isShowingAll ? "Centralizar e aproximar no veículo" : "Ver todos os veículos na tela cheia"}
        aria-label={isShowingAll ? "Centralizar" : `Ver Todos (${vehicles.length})`}
      >
        <span className="p-1 bg-blue-100 group-hover:bg-blue-200 text-blue-700 rounded-lg transition-colors text-sm">
          {isShowingAll ? '🎯' : '🗺️'}
        </span>
        <span className="whitespace-nowrap font-bold">
          {isShowingAll ? 'Centralizar' : `Ver Todos (${vehicles.length})`}
        </span>
      </button>
    </div>
  );
}

export function calculateSmartRoadSpeed(v: Vehicle): number {
  const cached = getCachedRoadSpeed(v.lat, v.lng, v.iconType);
  if (cached && cached.speedLimit) {
    return cached.speedLimit;
  }
  const cachedAddress = getCachedAddress(v.lat, v.lng) || '';
  const deduced = determineRoadSpeedLimit(cachedAddress, undefined, undefined, v.iconType);
  return deduced.speedLimit || 60;
}

interface FleetTrackerProps {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  onMarkerClick: (v: Vehicle) => void;
  onMarkerDoubleClick?: (v: Vehicle) => void;
  onSelectVehicle?: (v: Vehicle) => void;
  onUpdateVehicle?: (updated: Vehicle) => void;
  onMapClick?: () => void;
  activeRoute?: SavedRoute | null;
  recordingPoints?: RoutePoint[];
  playbackIndex?: number | null;
  onCloseActiveRoute?: () => void;
  onOpenHistorico?: () => void;
  onOpenTimeline?: (vehicle: Vehicle, dateStr?: string) => void;
  timelineDate?: string;
  onChangeTimelineDate?: (date: string) => void;
  isPlayingPlayback?: boolean;
  onTogglePlayback?: () => void;
  onSeekPlayback?: (index: number) => void;
  playbackSpeed?: number;
  onChangePlaybackSpeed?: (speed: number) => void;
  geofences?: Geofence[];
  isCreatingGeofence?: boolean;
  onGeofenceCreateClick?: (lat: number, lng: number) => void;
}

export default function FleetTracker({
  vehicles,
  selectedVehicle,
  onMarkerClick,
  onMarkerDoubleClick,
  onSelectVehicle,
  onUpdateVehicle,
  onMapClick,
  activeRoute,
  recordingPoints = [],
  playbackIndex = null,
  onCloseActiveRoute,
  onOpenHistorico,
  onOpenTimeline,
  timelineDate,
  onChangeTimelineDate,
  isPlayingPlayback = false,
  onTogglePlayback,
  onSeekPlayback,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
  geofences = [],
  isCreatingGeofence = false,
  onGeofenceCreateClick
}: FleetTrackerProps) {
  const [mapZoom, setMapZoom] = useState(13);
  const [isShowingAll, setIsShowingAll] = useState(true);
  const [startPoint, setStartPoint] = useState<RoutePoint | null>(null);
  const [endPoint, setEndPoint] = useState<RoutePoint | null>(null);
  const [showTimelineDrawer, setShowTimelineDrawer] = useState(false);
  const currentPlaybackPoint = activeRoute && playbackIndex !== null && activeRoute.points[playbackIndex] ? activeRoute.points[playbackIndex] : null;

  const lastClickMapRef = useRef<{ [id: string]: number }>({});
  const singleClickTimerRef = useRef<{ [id: string]: any }>({});
  const map = useMap();
  const [activePopupVehicleId, setActivePopupVehicleId] = useState<string | null>(null);
  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null);
  const [showOnlyStops, setShowOnlyStops] = useState(false);
  const [showStreetViewModal, setShowStreetViewModal] = useState(false);

  const openNativeStreetView = (lat: number, lng: number) => {
    const isAndroid = /android/i.test(navigator.userAgent || '');
    const nativeUrl = `google.streetview:cbll=${lat},${lng}`;
    const webUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    
    if (isAndroid) {
      try {
        const link = document.createElement('a');
        link.href = nativeUrl;
        link.target = '_system';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          window.open(webUrl, '_blank');
        }, 800);
      } catch (e) {
        window.open(webUrl, '_blank');
      }
    } else {
      window.open(webUrl, '_blank');
    }
  };

  const routeStops = React.useMemo(() => {
    if (!activeRoute || !activeRoute.points || activeRoute.points.length < 2) return [];
    const stops: { lat: number; lng: number; durationMs: number; startTime: string; endTime: string }[] = [];
    let stopStartPt: RoutePoint | null = null;
    let lastPt: RoutePoint | null = null;

    for (let i = 0; i < activeRoute.points.length; i++) {
      const pt = activeRoute.points[i];
      const speed = pt.speed || 0;
      const isStopped = speed < 2;

      if (isStopped) {
        if (!stopStartPt) {
          stopStartPt = pt;
        }
        lastPt = pt;
      } else {
        if (stopStartPt && lastPt) {
          const t1 = parseInt(stopStartPt.timestamp || '0', 10);
          const t2 = parseInt(lastPt.timestamp || '0', 10);
          const duration = t2 - t1;
          if (duration >= 5 * 60 * 1000) { // 5 minutes or more
            const startDate = new Date(t1);
            const endDate = new Date(t2);
            stops.push({
              lat: stopStartPt.lat,
              lng: stopStartPt.lng,
              durationMs: duration,
              startTime: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
              endTime: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
            });
          }
        }
        stopStartPt = null;
        lastPt = null;
      }
    }
    if (stopStartPt && lastPt) {
      const t1 = parseInt(stopStartPt.timestamp || '0', 10);
      const t2 = parseInt(lastPt.timestamp || '0', 10);
      const duration = t2 - t1;
      if (duration >= 5 * 60 * 1000) {
        const startDate = new Date(t1);
        const endDate = new Date(t2);
        stops.push({
          lat: stopStartPt.lat,
          lng: stopStartPt.lng,
          durationMs: duration,
          startTime: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
          endTime: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
        });
      }
    }
    return stops;
  }, [activeRoute]);

  const activeStop = activeStopIndex !== null ? routeStops[activeStopIndex] : null;

  const handleVehicleClick = (v: Vehicle, e?: React.MouseEvent) => {
    setIsShowingAll(false);
    if (e) {
      e.stopPropagation();
    }
    const now = Date.now();
    const lastTime = lastClickMapRef.current[v.id] || 0;
    const timeDiff = now - lastTime;

    if (timeDiff < 50) {
      // Ignore duplicate call from same click bubbling
      return;
    }

    if (timeDiff < 450) {
      // 2 CLICKS (Double click): Clear single click timer, open telemetry / info card ONLY
      if (singleClickTimerRef.current[v.id]) {
        clearTimeout(singleClickTimerRef.current[v.id]);
        delete singleClickTimerRef.current[v.id];
      }
      lastClickMapRef.current[v.id] = 0;
      setActivePopupVehicleId(v.id);
      if (onSelectVehicle) onSelectVehicle(v);
      else onMarkerClick(v);
    } else {
      // 1 CLICK (Single click): Center map on car, keep popup closed unless 2 clicks happen
      lastClickMapRef.current[v.id] = now;
      setActivePopupVehicleId(null);
      if (onSelectVehicle) onSelectVehicle(v);
      else onMarkerClick(v);

      if (singleClickTimerRef.current[v.id]) {
        clearTimeout(singleClickTimerRef.current[v.id]);
      }
      singleClickTimerRef.current[v.id] = setTimeout(() => {
        delete singleClickTimerRef.current[v.id];
      }, 450);
    }
  };

  useEffect(() => {
    if (activeRoute && activeRoute.points && activeRoute.points.length > 0) {
      setStartPoint(activeRoute.points[0]);
      setEndPoint(activeRoute.points[activeRoute.points.length - 1]);
    } else {
      setStartPoint(null);
      setEndPoint(null);
    }
  }, [activeRoute]);

  // Determine active effective speed limit for selected vehicle
  const currentSelected = vehicles.find(v => v.id === selectedVehicle?.id) || selectedVehicle;
  const isSmartMode = Boolean(currentSelected?.settings?.smartSpeedMode);
  const effectiveLimit = isSmartMode
    ? (currentSelected?.settings?.detectedRoadSpeed || calculateSmartRoadSpeed(currentSelected!))
    : (currentSelected?.settings?.speedLimit || 60);

  const currentSpeed = currentSelected?.speed || 0;
  const isOverSpeed = currentSelected && currentSpeed > effectiveLimit;

  return (
    <div className="flex-grow flex relative w-full h-full overflow-hidden">


      {/* Top Banner when tracking a selected vehicle dynamically */}
      {!activeRoute && currentSelected && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg border border-blue-200 flex items-center gap-2.5 text-xs font-semibold pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
          </span>
          <span className="text-gray-700">
            Seguindo <strong className="text-blue-700">{currentSelected.name}</strong>
          </span>
          {currentSelected.speed > 0 ? (
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
              {Math.round(currentSelected.speed)} km/h
            </span>
          ) : (
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[11px]">
              {currentSelected.status === 'IgnitionOn' ? 'Parado (Ligado)' : 'Desligado'}
            </span>
          )}
        </div>
      )}

      {/* Top Banner when viewing a Timeline / Saved Route on the Map */}
      {activeRoute && (
        <div className="absolute top-4 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto max-w-4xl z-20 bg-slate-900/95 backdrop-blur-md text-white px-3.5 sm:px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 pointer-events-auto">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow">
              ⏱️
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30">
                  Linha do Tempo
                </span>
                <span className="text-xs text-slate-300 font-bold font-mono">
                  {activeRoute.distanceKm} km
                </span>
              </div>
              <h4 className="font-bold text-white text-xs sm:text-sm truncate">
                {activeRoute.name}
              </h4>
            </div>
          </div>
          
          {/* Quick Date Selectors right on the map */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {timelineDate && onChangeTimelineDate && (
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date().toISOString().split('T')[0];
                    onChangeTimelineDate(d);
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    timelineDate === new Date().toISOString().split('T')[0] ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                    onChangeTimelineDate(d);
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    timelineDate !== new Date().toISOString().split('T')[0] && new Date(timelineDate).getDate() === new Date(Date.now() - 86400000).getDate() ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Ontem
                </button>
                <input
                  type="date"
                  value={timelineDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => onChangeTimelineDate(e.target.value)}
                  className="bg-transparent text-white font-bold text-[10px] outline-none cursor-pointer px-1"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowTimelineDrawer(!showTimelineDrawer)}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                showTimelineDrawer ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <span>🅿️</span>
              <span className="hidden sm:inline">Paradas ({routeStops.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowOnlyStops(!showOnlyStops)}
              className={`text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                showOnlyStops ? 'bg-amber-600 text-white shadow' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title="Filtrar para ver somente os pontos de parada"
            >
              {showOnlyStops ? 'Ver Rota' : 'Só Paradas'}
            </button>

            {onCloseActiveRoute && (
              <button
                type="button"
                onClick={onCloseActiveRoute}
                className="text-xs bg-red-600/80 hover:bg-red-600 text-white px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1"
                title="Sair da Linha do Tempo e Voltar ao Ao Vivo"
              >
                <span>✕</span>
                <span className="hidden sm:inline">Ao Vivo</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-0">
        <Map
          defaultCenter={
            vehicles.find(v => v.lat && v.lng && (v.lat !== 0 || v.lng !== 0))
              ? { lat: Number(vehicles.find(v => v.lat && v.lng && (v.lat !== 0 || v.lng !== 0))!.lat), lng: Number(vehicles.find(v => v.lat && v.lng && (v.lat !== 0 || v.lng !== 0))!.lng) }
              : {lat: -23.5505, lng: -46.6333}
          }
          defaultZoom={17}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{width: '100%', height: '100%'}}
          gestureHandling={'greedy'}
          onClick={(e) => {
            if (isCreatingGeofence && onGeofenceCreateClick && e.detail.latLng) {
              onGeofenceCreateClick(e.detail.latLng.lat, e.detail.latLng.lng);
            } else if (onMapClick) {
              onMapClick();
            }
          }}
          disableDefaultUI={true}
          clickableIcons={false}
        >
          <MapTypeSelector />
          <ZoomTracker onZoomChange={setMapZoom} />
          <UserLocationMarker vehicles={vehicles} onUpdateVehicle={onUpdateVehicle} />
          <MapController 
            selectedVehicle={selectedVehicle} 
            activeRoute={activeRoute || null} 
            vehicles={vehicles}
            isShowingAll={isShowingAll}
          />
          
          <GeofenceLayer geofences={geofences} />
          
          <MapCenterControls
            vehicles={vehicles}
            selectedVehicle={selectedVehicle}
            isShowingAll={isShowingAll}
            setIsShowingAll={setIsShowingAll}
            onSelectVehicle={(v) => {
              setIsShowingAll(false);
              if (onSelectVehicle) onSelectVehicle(v);
              else onMarkerClick(v);
            }}
          />

          {/* Render Active Saved Route Polyline */}
          {activeRoute && activeRoute.points && activeRoute.points.length > 1 && !showOnlyStops && (
            <MapPolyline path={activeRoute.points} color="#2563eb" weight={6} />
          )}

          {/* Render Live Recording Points Polyline */}
          {recordingPoints.length > 1 && !showOnlyStops && (
            <MapPolyline path={recordingPoints} color="#ef4444" weight={5} dashed={true} />
          )}

          {/* Start Marker for Active Saved Route */}
          {startPoint && !showOnlyStops && (
            <AdvancedMarker position={{lat: startPoint.lat, lng: startPoint.lng}}>
              <div className="flex items-center gap-1 bg-green-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg border-2 border-white">
                <span>🚩 Início</span>
              </div>
            </AdvancedMarker>
          )}

          {/* End Marker for Active Saved Route */}
          {endPoint && !showOnlyStops && (
            <AdvancedMarker position={{lat: endPoint.lat, lng: endPoint.lng}}>
              <div className="flex items-center gap-1 bg-red-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg border-2 border-white">
                <span>🏁 Fim</span>
              </div>
            </AdvancedMarker>
          )}

          {/* Stop Markers ("E" for Estacionado / Parada > 5 mins) */}
          {routeStops.map((stop, idx) => {
            const hours = Math.floor(stop.durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((stop.durationMs % (1000 * 60 * 60)) / (1000 * 60));
            const durStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            const isSelectedStop = activeStopIndex === idx;

            return (
              <AdvancedMarker 
                key={`stop-${idx}`} 
                position={{lat: stop.lat, lng: stop.lng}}
                onClick={() => setActiveStopIndex(idx)}
              >
                <div 
                  className="flex flex-col items-center group cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveStopIndex(idx);
                  }}
                >
                  <div className={`font-black text-xs px-3 py-1 rounded-full shadow-lg border-2 border-white flex items-center gap-1.5 transition-transform hover:scale-110 ${isSelectedStop ? 'bg-amber-700 ring-4 ring-amber-300 scale-110' : 'bg-amber-600'}`}>
                    <span className="bg-white text-amber-950 rounded-full w-4 h-4 flex items-center justify-center font-black text-[10px] shadow-xs">E</span>
                    <span>{durStr}</span>
                  </div>
                  <div className="text-[10px] bg-slate-900/95 text-white px-2 py-0.5 rounded shadow mt-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    Clique para ver detalhes ({durStr})
                  </div>
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Playback Animated Marker */}
          {currentPlaybackPoint && (
            <AdvancedMarker position={{lat: currentPlaybackPoint.lat, lng: currentPlaybackPoint.lng}}>
              <div className="p-2.5 rounded-full shadow-xl bg-blue-600 border-2 border-white text-white animate-bounce">
                <VehicleIcon type="car" iconType="car" color="#ffffff" size={24} />
              </div>
            </AdvancedMarker>
          )}

          {/* Vehicle Markers */}
          {vehicles.map((v, index) => {
            const overlapCount = vehicles.filter((other, i) => i < index && Math.abs(other.lat - v.lat) < 0.00005 && Math.abs(other.lng - v.lng) < 0.00005).length;
            const jitterLat = overlapCount > 0 ? v.lat + (overlapCount * 0.0002) : v.lat;
            const jitterLng = overlapCount > 0 ? v.lng + (overlapCount * 0.0002) : v.lng;
            
            const isSelected = selectedVehicle?.id === v.id;
            const isMoving = v.status === 'Moving' || (v.speed || 0) > 2;
            const pointerHeight = Math.max(0, (18 - mapZoom) * 8);
            const statusColor = v.settings?.isBlocked ? 'bg-red-600' : v.status === 'Offline' || v.status === 'NoBattery' ? 'bg-red-600' : isMoving || v.status === 'IgnitionOn' ? 'bg-green-500' : 'bg-gray-400';
            const heading = typeof v.heading === 'number' ? v.heading : 0;

            return (
            <AdvancedMarker 
              key={v.id} 
              position={{lat: jitterLat, lng: jitterLng}} 
              onClick={(e) => handleVehicleClick(v, e as any)}
            >
              <div 
                className="flex flex-col items-center cursor-pointer select-none relative transition-transform duration-500 ease-out" 
                onClick={(e) => handleVehicleClick(v, e)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  lastClickMapRef.current[v.id] = 0;
                  setActivePopupVehicleId(v.id);
                  if (onSelectVehicle) onSelectVehicle(v);
                  else onMarkerClick(v);
                }}
              >
                {/* Dynamic Radar Pulse / Follow Effect when Centered/Selected */}
                {isSelected && (
                  <>
                    <div className="absolute -inset-4 rounded-full bg-blue-500/25 animate-ping pointer-events-none z-0" />
                    <div className="absolute -inset-2 rounded-full bg-blue-400/30 animate-pulse pointer-events-none z-0" />
                  </>
                )}

                {/* Dynamic Heading / Direction Arrow Cone when Moving or has Heading */}
                {heading !== undefined && heading !== null && (isMoving || isSelected) && (
                  <div 
                    className="absolute -top-3 w-6 h-6 flex items-center justify-center pointer-events-none transition-transform duration-500 z-20"
                    style={{ transform: `rotate(${heading}deg)` }}
                  >
                    <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[9px] border-b-blue-600 drop-shadow-md animate-pulse" />
                  </div>
                )}

                <div className="flex flex-col items-center justify-end relative z-10">
                  <div className={`rounded-full shadow-lg bg-white border-[3px] flex items-center justify-center relative z-10 transition-all duration-300 ${
                    isSelected ? 'ring-4 ring-blue-500/60 scale-110' : ''
                  } ${
                    v.settings?.isBlocked ? 'border-red-600 bg-red-50 text-red-600 animate-pulse' :
                    v.status === 'Offline' || v.status === 'NoBattery' ? 'border-red-600 text-red-600 animate-pulse' :
                    isMoving ? 'border-green-500 text-green-500 ring-2 ring-green-400/50' : 
                    v.status === 'IgnitionOn' ? 'border-emerald-500 text-emerald-500' :
                    'border-gray-400 text-gray-500'
                  } ${v.photoUrl ? 'p-0.5' : 'p-2'}`}>
                    <VehicleIcon iconType={v.iconType} color={v.color} size={v.photoUrl ? 40 : (isSelected ? 24 : 20)} photoUrl={v.photoUrl} className={v.photoUrl ? "border-none shadow-none" : ""} />
                  </div>
                  
                  {/* Dynamic Pointer shrinking on zoom */}
                  {pointerHeight > 0 && (
                    <div className="flex flex-col items-center justify-start pointer-events-none" style={{ marginTop: '-2px' }}>
                      <div 
                        className={`w-1 ${statusColor} opacity-90`} 
                        style={{ height: `${pointerHeight}px` }} 
                      />
                      <div className={`w-2 h-2 rounded-full ${statusColor} shadow-sm`} style={{ marginTop: '-2px' }} />
                    </div>
                  )}
                </div>
                
                {/* Dynamic Vehicle Label & Speed Indicator */}
                <div className="flex flex-col items-center absolute bottom-full mb-1 pointer-events-none">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded shadow-md whitespace-nowrap transition-all ${
                    isSelected 
                      ? 'bg-blue-600 text-white ring-2 ring-white scale-105' 
                      : 'bg-white/95 text-gray-800 border border-gray-200'
                  }`}>
                    {v.settings?.isBlocked ? `🔒 [BLOQUEADO] ${v.name}` : v.name}
                    {isMoving && v.speed > 0 ? ` • ${Math.round(v.speed)} km/h` : ''}
                  </span>
                </div>
              </div>
            </AdvancedMarker>
            );
          })}
        </Map>
      </div>

      {/* Floating Selected Vehicle Telemetry Card (Apenas no 2º clique) */}
      {currentSelected && activePopupVehicleId === currentSelected.id && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-3 right-3 sm:left-auto sm:right-5 sm:w-96 max-h-[82vh] z-30 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-blue-200 animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto flex flex-col overflow-hidden">
          {currentSelected.photoUrl && (
            <div className="w-full h-32 relative bg-gray-100 shrink-0">
              <img src={currentSelected.photoUrl} alt={currentSelected.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent opacity-90" />
            </div>
          )}
          <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2.5 mb-2.5 shrink-0">
              <div className="flex items-center gap-2.5">
                {!currentSelected.photoUrl && (
                  <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 shadow-sm shrink-0">
                    <VehicleIcon iconType={currentSelected.iconType} color={currentSelected.color} size={24} />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="font-bold text-gray-900 text-base flex items-center gap-1.5 truncate">
                    <span className="truncate">{currentSelected.name}</span>
                  {currentSelected.settings?.isBlocked && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold shrink-0">Bloqueado</span>
                  )}
                </h4>
                <span className="text-xs text-gray-500 font-mono block">
                  {currentSelected.licensePlate || currentSelected.trackerNumber || 'GPS Integrado'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onMarkerDoubleClick && (
                <button
                  onClick={() => onMarkerDoubleClick(currentSelected)}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  title="Abrir Configurações e Comandos"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setActivePopupVehicleId(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Fechar Janela"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Blocked Alert Banner if vehicle is blocked */}
          {currentSelected.settings?.isBlocked && (
            <div className="bg-red-600 text-white p-3 rounded-xl border border-red-700 mb-2.5 flex items-center justify-between shadow-md shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔒</span>
                <div>
                  <strong className="block text-xs font-black uppercase text-white">MOTOR BLOQUEADO NO SISTEMA</strong>
                  <span className="text-red-100 text-[10px] block">Relé acionado. Clique ao lado para liberar.</span>
                </div>
              </div>
              {onMarkerDoubleClick && (
                <button
                  onClick={() => onMarkerDoubleClick(currentSelected)}
                  className="bg-white text-red-700 font-bold text-xs py-1.5 px-3 rounded-lg shadow-sm hover:bg-red-50 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  🔓 Desbloquear
                </button>
              )}
            </div>
          )}

          {/* Power Cut Alert Banner if detected */}
          {(currentSelected.powerCut || currentSelected.status === 'NoBattery') && (
            <div className="bg-red-600 text-white p-2.5 rounded-xl border border-red-700 mb-2.5 flex items-start gap-2 shadow-md animate-pulse shrink-0">
              <span className="text-base shrink-0">⚡</span>
              <div className="flex-1 text-[11px] leading-tight">
                <strong className="block text-xs font-black tracking-wide uppercase text-yellow-200">⚠️ CORTE DE ENERGIA DETECTADO!</strong>
                <span className="text-red-100 text-[10px]">Cabo da bateria principal (12V) desconectado ou cortado. O aparelho está funcionando com a bateria interna de emergência.</span>
              </div>
            </div>
          )}

          {/* Linha do Tempo Button */}
          {onOpenTimeline && (
            <button
              type="button"
              onClick={() => onOpenTimeline(currentSelected)}
              className="w-full mb-2.5 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span className="text-sm">⏱️</span>
              <span>Linha do Tempo (Trajeto do Dia)</span>
            </button>
          )}

          {/* Telemetry Status Grid */}
          <div className="grid grid-cols-2 gap-2 mb-2.5 shrink-0">
            <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
              <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Status & Conexão</span>
              <span className={`font-bold text-xs ${
                currentSelected.powerCut || currentSelected.status === 'NoBattery' ? 'text-red-600 animate-pulse' :
                currentSelected.status === 'Offline' ? 'text-red-600' :
                (currentSelected.speed && currentSelected.speed > 0) || currentSelected.status === 'Moving' || currentSelected.status === 'IgnitionOn' ? 'text-emerald-600' :
                'text-gray-700'
              }`}>
                {currentSelected.powerCut || currentSelected.status === 'NoBattery' ? '🔴 Corte de Energia (Sem 12V)' :
                 currentSelected.status === 'Offline' ? '🔴 Sem Sinal (Offline)' :
                 (currentSelected.speed && currentSelected.speed > 0) ? '🟢 Em Movimento' :
                 currentSelected.status === 'Moving' ? '🟢 Em Movimento' :
                 currentSelected.status === 'IgnitionOn' ? '🟢 Ignição Ligada' :
                 '⚪ Desligado (Conectado 🟢)'}
              </span>
            </div>

            <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Bateria / Alimentação</span>
              <div className="flex items-center gap-1.5">
                <span className={`font-bold text-xs ${
                  currentSelected.powerCut || currentSelected.status === 'NoBattery' || (currentSelected.externalVoltage && currentSelected.externalVoltage < 5) ? 'text-red-600 animate-pulse' : 
                  (currentSelected.batteryLevel && currentSelected.batteryLevel <= 20) ? 'text-orange-500' : 'text-blue-700'
                }`}>
                  🔋 {currentSelected.batteryLevel != null ? `${Math.round(currentSelected.batteryLevel)}%` : '100%'}
                </span>
                <span className={`text-[10px] font-mono font-bold ${
                  (currentSelected.externalVoltage && currentSelected.externalVoltage < 11.5) ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  ⚡ {currentSelected.externalVoltage != null ? `${currentSelected.externalVoltage.toFixed(1)}V` : (currentSelected.status === 'Moving' ? '14.1V' : '12.6V')}
                </span>
              </div>
            </div>
            
            <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
              <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Velocidade Atual</span>
              <div className="flex items-baseline gap-1">
                <span className={`font-bold text-base font-mono ${isOverSpeed ? 'text-red-600 animate-pulse' : 'text-blue-700'}`}>
                  {currentSelected.status === 'Offline' ? 0 : (currentSelected.speed || 0)}
                </span>
                <span className="text-[10px] text-gray-500 font-semibold">km/h</span>
              </div>
            </div>
            
            <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
              <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Sinal GPS</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="flex gap-0.5">
                  {[1,2,3,4].map(bar => {
                    const sats = currentSelected.satellites || 12;
                    const isActive = sats >= (bar * 2);
                    let color = 'bg-gray-200';
                    if (isActive) {
                      if (sats >= 8) color = 'bg-emerald-500';
                      else if (sats >= 4) color = 'bg-blue-500';
                      else color = 'bg-red-500';
                    }
                    return (
                      <div key={bar} className={`w-1.5 h-3 rounded-full ${color}`} />
                    );
                  })}
                </div>
                <span className="text-[10px] text-gray-600 font-bold font-mono">{(currentSelected.satellites || 12)} sat</span>
              </div>
            </div>
          </div>

          {/* Road Speed */}
          <div className="mb-2.5 text-[11px] shrink-0">
            <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Gauge className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-gray-600">Limite da Via:</span>
              </div>
              <RoadSpeedBadge vehicle={currentSelected} />
            </div>
          </div>

          {/* Street View Preview & Interactive 360 Road Confirmation */}
          <div className="bg-slate-900 rounded-xl border border-slate-700 mb-2.5 overflow-hidden relative shadow-md shrink-0">
            <div className="p-2 px-3 bg-slate-800 text-white flex items-center justify-between border-b border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Street View 360° da Via
              </span>
              <button
                type="button"
                onClick={() => openNativeStreetView(currentSelected.lat, currentSelected.lng)}
                className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg font-bold transition-colors flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                title="Abrir no Google Maps (Nativo / APK)"
              >
                <span>Google Maps</span>
                <span>↗</span>
              </button>
            </div>
            
            <div 
              onClick={() => setShowStreetViewModal(true)}
              className="p-3 bg-gradient-to-br from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 transition-all cursor-pointer group flex items-center justify-between text-white"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                  👁️
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1">
                    Ver Câmera Panorâmica 360°
                  </div>
                  <div className="text-[10px] text-slate-300">
                    Fotos reais da rua, faixas e fachada do local
                  </div>
                </div>
              </div>
              <div className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg shadow transition-colors flex items-center gap-1 shrink-0">
                Ver 360°
              </div>
            </div>
          </div>

          {/* Real Address */}
          <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 mb-2.5 shrink-0">
            <span className="text-[10px] text-gray-500 font-semibold block mb-0.5">Endereço em Tempo Real</span>
            <AddressDisplay lat={currentSelected.lat} lng={currentSelected.lng} />
          </div>

          {/* Bottom info & Actions */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 shrink-0 mt-auto">
            <span>Odômetro: <strong className="text-gray-800 font-mono">{Math.round(currentSelected.totalMileage || 0).toLocaleString('pt-BR')} km</strong></span>
            {onMarkerDoubleClick && (
              <button
                type="button"
                onClick={() => onMarkerDoubleClick(currentSelected)}
                className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 text-xs cursor-pointer hover:underline"
              >
                Configurações &raquo;
              </button>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Floating Stop Details Card */}
      {activeStop && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-3 right-3 sm:left-auto sm:right-5 sm:w-96 z-30 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-amber-200 animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto flex flex-col overflow-hidden">
          <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-white text-amber-900 w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shadow">E</span>
              <div>
                <h4 className="font-bold text-sm">Local Estacionado</h4>
                <p className="text-[11px] text-amber-100 font-mono">Parada superior a 5 minutos</p>
              </div>
            </div>
            <button
              onClick={() => setActiveStopIndex(null)}
              className="p-1 text-white/80 hover:text-white hover:bg-amber-700/50 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                <span className="text-gray-500 font-medium block text-[10px] mb-0.5">⏱️ Duração</span>
                <span className="font-bold text-gray-900 text-sm">
                  {Math.floor(activeStop.durationMs / (1000 * 60 * 60)) > 0 ? `${Math.floor(activeStop.durationMs / (1000 * 60 * 60))}h ` : ''}
                  {Math.floor((activeStop.durationMs % (1000 * 60 * 60)) / (1000 * 60))}m
                </span>
              </div>
              <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                <span className="text-gray-500 font-medium block text-[10px] mb-0.5">🕒 Horário</span>
                <span className="font-bold text-gray-900 text-xs">
                  {activeStop.startTime} até {activeStop.endTime}
                </span>
              </div>
            </div>

            <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-100 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-800 text-[10px] font-semibold">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>Endereço Preciso</span>
              </div>
              <div className="text-xs font-medium text-gray-900 leading-snug">
                <AddressDisplay lat={activeStop.lat} lng={activeStop.lng} />
              </div>
            </div>

            <button
              onClick={() => {
                if (map) {
                  map.panTo({ lat: activeStop.lat, lng: activeStop.lng });
                  map.setZoom(17);
                }
              }}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Centralizar no Mapa</span>
            </button>
          </div>
        </div>
      )}

      {/* Street View 360 Interactive Modal */}
      {showStreetViewModal && currentSelected && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[2000] flex flex-col p-2 sm:p-4 animate-fadeIn pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex-1 flex flex-col overflow-hidden max-w-4xl w-full mx-auto">
            {/* Modal Header */}
            <div className="p-3 sm:p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 rounded-xl text-lg">
                  👁️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold flex items-center gap-2">
                    <span>Street View 360°</span>
                    <span className="text-xs text-blue-400 font-normal">({currentSelected.name})</span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Navegue pela via, confirme faixas, postes, placas e comércio do local
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openNativeStreetView(currentSelected.lat, currentSelected.lng)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Abrir diretamente no app do Google Maps"
                >
                  <span>Google Maps Nativo</span>
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStreetViewModal(false)}
                  className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Embedded Interactive 360 View */}
            <div className="flex-1 w-full bg-black relative min-h-[300px]">
              <iframe
                title="Google Maps Street View 360"
                src={`https://maps.google.com/maps?q=&layer=c&cbll=${currentSelected.lat},${currentSelected.lng}&cbp=11,0,0,0,0&output=svembed`}
                className="w-full h-full border-0 absolute inset-0"
                allowFullScreen
                loading="lazy"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-800/95 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-300 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-white shrink-0">📍 Local:</span>
                <span className="truncate text-[11px] text-slate-300">
                  <AddressDisplay lat={currentSelected.lat} lng={currentSelected.lng} />
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10px] text-slate-400">
                  {currentSelected.lat.toFixed(5)}, {currentSelected.lng.toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowStreetViewModal(false)}
                  className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* On-Map Day Timeline Playback Bar */}
      {activeRoute && activeRoute.points && activeRoute.points.length > 1 && (
        <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-auto max-w-xl z-30 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-slate-700 flex flex-col gap-2 pointer-events-auto">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onTogglePlayback}
                className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center font-bold shadow transition-all active:scale-95 cursor-pointer text-sm"
                title={isPlayingPlayback ? 'Pausar Animação' : 'Reproduzir Trajeto'}
              >
                {isPlayingPlayback ? '⏸️' : '▶️'}
              </button>

              <button
                type="button"
                onClick={() => onSeekPlayback && onSeekPlayback(0)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs"
                title="Voltar ao início"
              >
                🔄
              </button>

              {onChangePlaybackSpeed && (
                <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-xl text-xs">
                  {[1, 2, 5, 10].map(spd => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onChangePlaybackSpeed(spd)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        playbackSpeed === spd ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 font-mono">
              <span className="text-xs font-bold text-blue-400">
                🕒 {currentPlaybackPoint?.timestamp 
                  ? new Date(Number(currentPlaybackPoint.timestamp)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                  : '--:--'}
              </span>
              <span className="text-xs bg-slate-800 px-2 py-1 rounded-lg text-slate-200">
                ⚡ {Math.round(currentPlaybackPoint?.speed || 0)} km/h
              </span>
            </div>
          </div>

          {/* Scrubber slider */}
          {onSeekPlayback && (
            <input
              type="range"
              min={0}
              max={Math.max(1, activeRoute.points.length - 1)}
              value={playbackIndex || 0}
              onChange={(e) => onSeekPlayback(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          )}
        </div>
      )}

      {/* On-Map Side Drawer for Day's Stops / Timeline */}
      {showTimelineDrawer && activeRoute && (
        <div className="absolute top-20 right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] w-80 sm:w-96 z-30 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200 pointer-events-auto">
          <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <div>
                <h4 className="font-bold text-xs">Paradas da Linha do Tempo</h4>
                <p className="text-[10px] text-slate-400">{routeStops.length} locais estacionados no dia</p>
              </div>
            </div>
            <button
              onClick={() => setShowTimelineDrawer(false)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 overflow-y-auto flex-1 space-y-2.5">
            {routeStops.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs font-medium">
                Nenhuma parada longa (&gt;5 min) registrada nesta rota.
              </div>
            ) : (
              routeStops.map((stop, sIdx) => {
                const hours = Math.floor(stop.durationMs / (1000 * 60 * 60));
                const minutes = Math.floor((stop.durationMs % (1000 * 60 * 60)) / (1000 * 60));
                const durStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                const isSelected = activeStopIndex === sIdx;

                return (
                  <div
                    key={`drawer-stop-${sIdx}`}
                    onClick={() => {
                      setActiveStopIndex(sIdx);
                      if (map) {
                        map.panTo({ lat: stop.lat, lng: stop.lng });
                        map.setZoom(17);
                      }
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300/40 shadow-xs' : 'bg-slate-50 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-black text-[10px] flex items-center justify-center">
                          {sIdx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          Parada ({durStr})
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 font-bold">
                        {stop.startTime} ➔ {stop.endTime}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex items-start gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                      <AddressDisplay lat={stop.lat} lng={stop.lng} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
