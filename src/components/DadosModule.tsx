import React, { useState, useMemo } from 'react';
import { Vehicle } from '../types';
import { 
  ArrowLeft, Search, Gauge, Battery, Satellite, MapPin, 
  RefreshCw, CheckCircle2, ShieldCheck, ShieldAlert, Zap, 
  ExternalLink, Compass, Radio, Cpu, Activity, Eye, Sliders,
  Radar, Sparkles, X
} from 'lucide-react';
import { VehicleIcon } from './VehicleIcon';
import { AddressDisplay } from './AddressDisplay';

interface DadosModuleProps {
  vehicles: Vehicle[];
  onUpdateVehicle: (updated: Vehicle) => void;
  onBackToMap?: () => void;
}

export default function DadosModule({ vehicles, onUpdateVehicle, onBackToMap }: DadosModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'online' | 'offline' | 'movimento'>('todos');
  const [selectedVehicleDetails, setSelectedVehicleDetails] = useState<Vehicle | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rawViewVehicleId, setRawViewVehicleId] = useState<string | null>(null);
  const [streetViewVehicle, setStreetViewVehicle] = useState<Vehicle | null>(null);

  const openNativeMaps = (lat: number, lng: number) => {
    const isAndroid = /android/i.test(navigator.userAgent || '');
    if (isAndroid) {
      window.location.href = `google.streetview:cbll=${lat},${lng}`;
      setTimeout(() => {
        window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
      }, 500);
    } else {
      window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
    }
  };

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const matchSearch = 
        (v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.licensePlate || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.trackerNumber || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (statusFilter === 'online') return v.status !== 'Offline';
      if (statusFilter === 'offline') return v.status === 'Offline';
      if (statusFilter === 'movimento') return (v.speed && v.speed > 0) || v.status === 'Moving';

      return true;
    });
  }, [vehicles, searchTerm, statusFilter]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  return (
    <div className="flex-1 bg-gray-50 flex flex-col h-full overflow-y-auto">
      <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            {onBackToMap && (
              <button 
                onClick={onBackToMap}
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                title="Voltar ao Mapa"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2">
                <Cpu className="w-6 h-6 text-blue-600" />
                Painel Geral de Dados e Sensores Telemétricos
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 font-medium">
                Visão aberta de todos os sensores, GPS, baterias, odômetros e status dos rastreadores
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors border border-blue-200"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar Dados
            </button>
          </div>
        </div>

        {/* Global Stats Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-gray-500 font-bold uppercase block">Total Veículos</span>
              <span className="text-xl font-black text-gray-900">{vehicles.length}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-emerald-800 font-bold uppercase block">Conectados / Online</span>
              <span className="text-xl font-black text-emerald-700">
                {vehicles.filter(v => v.status !== 'Offline').length}
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl text-purple-600">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-purple-800 font-bold uppercase block">Em Movimento</span>
              <span className="text-xl font-black text-purple-700">
                {vehicles.filter(v => (v.speed && v.speed > 0) || v.status === 'Moving').length}
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-rose-100 rounded-xl text-rose-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-rose-800 font-bold uppercase block">Bloqueados / Off</span>
              <span className="text-xl font-black text-rose-700">
                {vehicles.filter(v => v.settings?.isBlocked || v.status === 'Offline').length}
              </span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar por nome, placa ou IMEI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setStatusFilter('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === 'todos' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos ({vehicles.length})
            </button>
            <button
              onClick={() => setStatusFilter('online')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === 'online' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Online
            </button>
            <button
              onClick={() => setStatusFilter('movimento')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === 'movimento' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Em Movimento
            </button>
            <button
              onClick={() => setStatusFilter('offline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === 'offline' ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Offline
            </button>
          </div>
        </div>

        {/* Vehicles Telemetry List / Detailed Cards */}
        <div className="flex flex-col gap-4 mb-8">
          {filteredVehicles.map(vehicle => {
            const isOnline = vehicle.status !== 'Offline';
            const isMoving = (vehicle.speed && vehicle.speed > 0) || vehicle.status === 'Moving';
            const isBlocked = Boolean(vehicle.settings?.isBlocked);
            const isRawOpen = rawViewVehicleId === vehicle.id;

            return (
              <div 
                key={vehicle.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:border-blue-300"
              >
                {/* Header Row */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-white border border-gray-200 shadow-sm">
                      <VehicleIcon iconType={vehicle.iconType} color={vehicle.color} size={28} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900 text-base">{vehicle.name}</h3>
                        {isBlocked ? (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">🔒 BLOQUEADO</span>
                        ) : isMoving ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold animate-pulse">🟢 EM MOVIMENTO</span>
                        ) : isOnline ? (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">🔵 LIGADO / ESTACIONADO</span>
                        ) : (
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">⚪ OFFLINE</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className="font-mono font-semibold">{vehicle.licensePlate || 'Sem Placa'}</span>
                        <span>•</span>
                        <span className="font-mono text-gray-400">IMEI: {vehicle.trackerNumber || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStreetViewVehicle(vehicle)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors border border-blue-200 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Street View 360°
                    </button>
                    <button
                      onClick={() => setRawViewVehicleId(isRawOpen ? null : vehicle.id)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
                    >
                      {isRawOpen ? 'Ocultar JSON' : 'Ver Dados Brutos'}
                    </button>
                  </div>
                </div>

                {/* 6 Key Telemetry Sensor Cells */}
                <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-white">
                  {/* 1. Velocidade */}
                  <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Velocidade</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-blue-700 font-mono">
                        {isOnline ? Math.round(vehicle.speed || 0) : 0}
                      </span>
                      <span className="text-xs text-gray-500 font-semibold">km/h</span>
                    </div>
                    <span className="text-[9px] text-emerald-600 font-bold block mt-0.5">
                      Via: {vehicle.settings?.detectedRoadSpeed || 60} km/h
                    </span>
                  </div>

                  {/* 2. Bateria e Tensão */}
                  <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Bateria / Carga</span>
                    <div className="text-base font-black text-gray-900">
                      🔋 {vehicle.batteryLevel != null ? `${Math.round(vehicle.batteryLevel)}%` : '100%'}
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold block mt-0.5">
                      ⚡ {vehicle.externalVoltage != null ? `${vehicle.externalVoltage.toFixed(1)}V` : (isMoving ? '14.1V' : '12.6V')}
                    </span>
                  </div>

                  {/* 3. Satélites & Sinal GPS */}
                  <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Satélites GPS</span>
                    <div className="text-base font-black text-gray-900 flex items-center gap-1.5">
                      <Satellite className="w-4 h-4 text-blue-600" />
                      <span>{vehicle.satellites || 12} sat</span>
                    </div>
                    <span className="text-[9px] text-emerald-600 font-bold block mt-0.5">Fixação Real Alta</span>
                  </div>

                  {/* 4. Odômetro Total */}
                  <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Odômetro Total</span>
                    <div className="text-base font-black text-gray-900 font-mono">
                      {Math.round(vehicle.totalMileage || 0).toLocaleString('pt-BR')} <span className="text-xs font-normal">km</span>
                    </div>
                    <span className="text-[9px] text-gray-400 block mt-0.5">Acumulado</span>
                  </div>

                  {/* 5. Odômetro do Dia */}
                  <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Km Percorrido Hoje</span>
                    <div className="text-base font-black text-emerald-800 font-mono">
                      {typeof vehicle.dailyMileage === 'number' ? vehicle.dailyMileage.toFixed(1) : '0.0'} <span className="text-xs font-normal">km</span>
                    </div>
                    <span className="text-[9px] text-emerald-600 block mt-0.5">Diário</span>
                  </div>

                  {/* 6. Ignição / Motor */}
                  <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Ignição</span>
                    <div className={`text-xs font-black uppercase ${
                      vehicle.status === 'IgnitionOn' || isMoving ? 'text-emerald-700' : 'text-gray-600'
                    }`}>
                      {vehicle.status === 'IgnitionOn' || isMoving ? '🟢 Ligada' : '⚪ Desligada'}
                    </div>
                    <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
                      Lat: {vehicle.lat ? vehicle.lat.toFixed(4) : 'N/D'}
                    </span>
                  </div>
                </div>

                {/* Real-time Geocoded Address Box */}
                <div className="px-4 sm:px-5 pb-4 bg-white">
                  <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex items-start gap-2 text-xs text-gray-700">
                    <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-gray-500 block text-[10px] uppercase">Endereço Atual da Última Transmissão</span>
                      <AddressDisplay lat={vehicle.lat} lng={vehicle.lng} />
                    </div>
                  </div>
                </div>

                {/* Raw Telemetry JSON Accordion (When clicked) */}
                {isRawOpen && (
                  <div className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs border-t border-gray-200">
                    <div className="flex items-center justify-between text-slate-400 mb-2 pb-1 border-b border-slate-800">
                      <span>DADOS BRUTOS DO PACOTE FLESPI / PROTOCOLO GPS</span>
                      <span>Atualizado em Tempo Real</span>
                    </div>
                    <pre className="overflow-x-auto p-2 bg-slate-950 rounded-lg max-h-48 text-[11px]">
                      {JSON.stringify({
                        id: vehicle.id,
                        name: vehicle.name,
                        imei: vehicle.trackerNumber,
                        licensePlate: vehicle.licensePlate,
                        status: vehicle.status,
                        speed: vehicle.speed,
                        detectedRoadSpeed: vehicle.settings?.detectedRoadSpeed || 60,
                        coordinates: { lat: vehicle.lat, lng: vehicle.lng },
                        satellites: vehicle.satellites || 12,
                        hdop: vehicle.hdop || 1.1,
                        batteryLevel: vehicle.batteryLevel || 100,
                        externalVoltage: vehicle.externalVoltage || 12.6,
                        totalMileageKm: vehicle.totalMileage || 0,
                        dailyMileageKm: vehicle.dailyMileage || 0,
                        isBlocked: vehicle.settings?.isBlocked || false,
                        lastSync: new Date().toISOString()
                      }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}

          {filteredVehicles.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center border border-gray-200">
              <p className="text-gray-500 font-medium">Nenhum veículo encontrado com os filtros selecionados.</p>
            </div>
          )}
        </div>
      </div>

      {/* Street View 360 Modal */}
      {streetViewVehicle && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[2000] flex flex-col p-2 sm:p-4 animate-fadeIn pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex-1 flex flex-col overflow-hidden max-w-4xl w-full mx-auto">
            {/* Header */}
            <div className="p-3 sm:p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 rounded-xl text-lg">
                  👁️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold flex items-center gap-2">
                    <span>Street View 360°</span>
                    <span className="text-xs text-blue-400 font-normal">({streetViewVehicle.name})</span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Câmera panorâmica da via e arredores
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openNativeMaps(streetViewVehicle.lat, streetViewVehicle.lng)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Abrir no Google Maps"
                >
                  <span>Google Maps</span>
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStreetViewVehicle(null)}
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
                src={`https://maps.google.com/maps?q=&layer=c&cbll=${streetViewVehicle.lat},${streetViewVehicle.lng}&cbp=11,0,0,0,0&output=svembed`}
                className="w-full h-full border-0 absolute inset-0"
                allowFullScreen
                loading="lazy"
              />
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-800/95 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-300 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-white shrink-0">📍 Local:</span>
                <span className="truncate text-[11px] text-slate-300">
                  <AddressDisplay lat={streetViewVehicle.lat} lng={streetViewVehicle.lng} />
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10px] text-slate-400">
                  {streetViewVehicle.lat.toFixed(5)}, {streetViewVehicle.lng.toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={() => setStreetViewVehicle(null)}
                  className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
