import React, { useState, useEffect } from 'react';
import { Vehicle } from '../types';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { VehicleIcon } from './VehicleIcon';
import { AddressDisplay } from './AddressDisplay';
import { ShieldCheck, Clock, Navigation, MapPin, Gauge } from 'lucide-react';

interface PublicTrackingViewProps {
  vehicle: Vehicle;
  token: string;
}

export default function PublicTrackingView({ vehicle, token }: PublicTrackingViewProps) {
  const [mapZoom, setMapZoom] = useState(16);

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-white overflow-hidden relative">
      {/* Public Top Header Bar */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 p-3 sm:p-4 flex items-center justify-between z-20 shadow-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl shadow">
            📍
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm sm:text-base text-white">{vehicle.name}</h1>
              <span className="text-[11px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                Rastreio ao Vivo
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Placa: <strong className="text-slate-200">{vehicle.licensePlate || 'GRA-2026'}</strong>
            </p>
          </div>
        </div>

        <div className="bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-2xl flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-black text-emerald-400">
            TRANSMISSÃO ATIVA
          </span>
        </div>
      </header>

      {/* Map Area */}
      <div className="flex-1 relative w-full h-full">
        <Map
          defaultCenter={{ lat: Number(vehicle.lat) || -23.5505, lng: Number(vehicle.lng) || -46.6333 }}
          defaultZoom={16}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
        >
          {vehicle.lat && vehicle.lng && (
            <AdvancedMarker position={{ lat: Number(vehicle.lat), lng: Number(vehicle.lng) }}>
              <div className="flex flex-col items-center select-none relative">
                <div className="absolute -inset-3 rounded-full bg-emerald-500/30 animate-ping pointer-events-none" />
                
                <div className="p-2.5 rounded-full shadow-2xl bg-white border-4 border-emerald-500 text-emerald-600 relative z-10">
                  <VehicleIcon iconType={vehicle.iconType} color={vehicle.color} size={28} photoUrl={vehicle.photoUrl} />
                </div>

                <div className="mt-1 bg-slate-900/90 backdrop-blur-md text-white px-2.5 py-0.5 rounded-full text-xs font-black shadow border border-slate-700 whitespace-nowrap">
                  {vehicle.name} • {Math.round(vehicle.speed || 0)} km/h
                </div>
              </div>
            </AdvancedMarker>
          )}
        </Map>
      </div>

      {/* Bottom Telemetry Card for Public View */}
      <div className="absolute bottom-4 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-3xl p-4 shadow-2xl z-20 pointer-events-auto">
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Velocidade Atual</span>
            <span className="text-base font-black font-mono text-emerald-400">
              {Math.round(vehicle.speed || 0)} km/h
            </span>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Estado do Motor</span>
            <span className={`text-xs font-extrabold ${vehicle.speed > 0 || vehicle.status === 'Moving' || vehicle.status === 'IgnitionOn' ? 'text-emerald-400' : 'text-slate-300'}`}>
              {vehicle.speed > 0 || vehicle.status === 'Moving' ? '🟢 Em Movimento' : vehicle.status === 'IgnitionOn' ? '🟢 Ignição Ligada' : '⚪ Parado'}
            </span>
          </div>
        </div>

        <div className="bg-slate-800/80 p-2.5 rounded-2xl border border-slate-700 text-xs">
          <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Endereço Aproximado em Tempo Real</span>
          <AddressDisplay lat={vehicle.lat} lng={vehicle.lng} />
        </div>
      </div>
    </div>
  );
}
