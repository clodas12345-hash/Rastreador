import React, { useEffect, useRef, useState } from 'react';
import { Vehicle } from '../types';

declare global {
  interface Window {
    L?: any;
  }
}

interface FallbackLeafletMapProps {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  onSelectVehicle: (v: Vehicle | null) => void;
}

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.L) {
      resolve(window.L);
      return;
    }

    if (!document.getElementById('leaflet-fallback-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-fallback-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById('leaflet-fallback-js') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L));
      existingScript.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-fallback-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error('Leaflet failed to initialize'));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function FallbackLeafletMap({
  vehicles,
  selectedVehicle,
  onSelectVehicle
}: FallbackLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    let active = true;
    loadLeaflet()
      .then((L) => {
        if (!active || !containerRef.current || mapRef.current) return;
        const firstValid = vehicles.find((v) => Number(v.lat) && Number(v.lng));
        const initLat = firstValid ? Number(firstValid.lat) : -23.518;
        const initLng = firstValid ? Number(firstValid.lng) : -46.553;

        const map = L.map(containerRef.current, { zoomControl: false }).setView(
          [initLat, initLng],
          vehicles.length === 1 ? 16 : 13
        );
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap, © CARTO'
        }).addTo(map);

        map.on('click', () => {
          onSelectVehicle(null);
        });

        mapRef.current = map;
        setReady(true);

        // Fit all vehicles initially
        const validPts = vehicles
          .filter((v) => Number(v.lat) && Number(v.lng))
          .map((v) => [Number(v.lat), Number(v.lng)]);
        if (validPts.length > 0) {
          if (validPts.length === 1) {
            map.setView(validPts[0], 16);
          } else {
            map.fitBounds(L.latLngBounds(validPts).pad(0.25));
          }
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = {};
      }
    };
  }, []);

  // Update vehicle markers
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    const currentIds = new Set(vehicles.map((v) => v.id));
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    vehicles.forEach((v) => {
      const lat = Number(v.lat);
      const lng = Number(v.lng);
      if (!lat || !lng) return;

      const isOffline = v.status === 'Offline' || v.status === 'NoBattery';
      const speed = Math.round(v.speed || 0);
      const isMoving = !isOffline && (v.status === 'Moving' || v.status === 'IgnitionOn' || speed >= 4);
      const ringColor = isOffline ? '#ef4444' : isMoving ? '#2563eb' : '#10b981';
      const isFocused = selectedVehicle?.id === v.id;

      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-80%);">
          <div style="background:${isFocused ? '#2563eb' : '#0f172a'};color:#fff;font-size:11px;font-weight:800;padding:2px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.4);margin-bottom:4px;border:1px solid rgba(255,255,255,0.25);">
            ${v.name}${speed >= 4 ? ` • ${speed} km/h` : ''}
          </div>
          <div style="width:42px;height:42px;border-radius:50%;background:#fff;border:3.5px solid ${ringColor};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,0.35);font-size:20px;">
            🚘
          </div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'fallback-vehicle-pin',
        html,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });

      if (markersRef.current[v.id]) {
        markersRef.current[v.id].setLatLng([lat, lng]);
        markersRef.current[v.id].setIcon(icon);
      } else {
        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.on('click', (ev: any) => {
          if (ev?.originalEvent) ev.originalEvent.stopPropagation();
          onSelectVehicle(v);
        });
        markersRef.current[v.id] = marker;
      }
    });
  }, [ready, vehicles, selectedVehicle?.id, onSelectVehicle]);

  // Pan/Zoom when selectedVehicle changes
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    if (selectedVehicle && Number(selectedVehicle.lat) && Number(selectedVehicle.lng)) {
      map.flyTo([Number(selectedVehicle.lat), Number(selectedVehicle.lng)], 16, { duration: 0.8 });
    } else if (!selectedVehicle && vehicles.length > 1) {
      const validPts = vehicles
        .filter((v) => Number(v.lat) && Number(v.lng))
        .map((v) => [Number(v.lat), Number(v.lng)]);
      if (validPts.length > 1) {
        map.fitBounds(L.latLngBounds(validPts).pad(0.25));
      }
    }
  }, [ready, selectedVehicle?.id, selectedVehicle?.lat, selectedVehicle?.lng]);

  const handleCycleCenter = () => {
    if (vehicles.length === 0) return;
    if (vehicles.length === 1) {
      onSelectVehicle(vehicles[0]);
      if (mapRef.current && Number(vehicles[0].lat) && Number(vehicles[0].lng)) {
        mapRef.current.flyTo([Number(vehicles[0].lat), Number(vehicles[0].lng)], 17, { duration: 0.8 });
      }
      return;
    }

    if (cycleIndex < vehicles.length) {
      onSelectVehicle(vehicles[cycleIndex]);
      setCycleIndex(cycleIndex + 1);
    } else {
      onSelectVehicle(null);
      setCycleIndex(0);
    }
  };

  const centerLabel =
    vehicles.length === 1
      ? `Centralizar (${vehicles[0].name})`
      : cycleIndex < vehicles.length
      ? `Centralizar (${vehicles[cycleIndex].name})`
      : 'Centralizar os dois';

  return (
    <div className="absolute inset-0 w-full h-full bg-slate-200 z-0">
      <div ref={containerRef} className="w-full h-full" />

      {!ready && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 z-10 pointer-events-none">
          <div className="bg-white px-4 py-3 rounded-2xl shadow-lg border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600 animate-ping" />
            <span>Carregando mapa da frota...</span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 max-w-sm text-center space-y-2">
            <div className="text-2xl">📍</div>
            <h4 className="font-extrabold text-sm text-slate-900">Posições em Tempo Real</h4>
            <div className="space-y-1.5 text-left">
              {vehicles.map((v) => (
                <div key={v.id} className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between">
                  <span className="font-bold text-slate-800">{v.name}</span>
                  <span className="font-mono text-blue-700">{Math.round(v.speed || 0)} km/h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {ready && vehicles.length > 0 && (
        <div className="absolute bottom-5 right-4 z-[1000] pointer-events-auto">
          <button
            type="button"
            onClick={handleCycleCenter}
            className="bg-white/95 hover:bg-white text-slate-900 border border-blue-200 px-4 py-2.5 rounded-2xl shadow-xl font-extrabold text-xs flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
          >
            <span>🎯</span>
            <span>{centerLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
