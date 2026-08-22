import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Vehicle } from '../types';
import { ChevronDown, ChevronUp, Car, Activity, Zap, ShieldCheck, AlertTriangle, Radio, Navigation, Gauge, MapPin, ArrowLeft, LogOut } from 'lucide-react';
import { getRealAddress, getCachedAddress, getRealRoadSpeedLimit, getCachedRoadSpeed, determineRoadSpeedLimit, RoadSpeedInfo } from '../lib/geocoding';

function DashboardAddress({ lat, lng }: { lat: number; lng: number }) {
  const [address, setAddress] = useState<string>(() => getCachedAddress(lat, lng) || 'Consultando endereço real...');
  const [loading, setLoading] = useState(!getCachedAddress(lat, lng));

  useEffect(() => {
    let isMounted = true;
    if (!lat || !lng) {
      setAddress('Localização não definida');
      setLoading(false);
      return;
    }
    const cached = getCachedAddress(lat, lng);
    if (cached) {
      setAddress(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    getRealAddress(lat, lng).then(addr => {
      if (isMounted) {
        setAddress(addr);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) {
        setAddress(`Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [lat, lng]);

  return (
    <span className="font-medium text-gray-800 text-xs flex items-center gap-1.5 leading-tight">
      <span className="text-blue-600 shrink-0">📍</span>
      <span className="break-words">{address}</span>
      {loading && <span className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></span>}
    </span>
  );
}

function DashboardRoadSpeed({ vehicle }: { vehicle: Vehicle }) {
  const [speedInfo, setSpeedInfo] = useState<RoadSpeedInfo>(() => {
    return getCachedRoadSpeed(vehicle.lat, vehicle.lng, vehicle.iconType) || 
      determineRoadSpeedLimit(getCachedAddress(vehicle.lat, vehicle.lng) || '', undefined, undefined, vehicle.iconType);
  });

  useEffect(() => {
    let isMounted = true;
    if (!vehicle.lat || !vehicle.lng) return;

    const cached = getCachedRoadSpeed(vehicle.lat, vehicle.lng, vehicle.iconType);
    if (cached) {
      setSpeedInfo(cached);
    }

    getRealRoadSpeedLimit(vehicle.lat, vehicle.lng, vehicle.iconType).then((info) => {
      if (isMounted && info) {
        setSpeedInfo(info);
      }
    }).catch(() => {});

    return () => { isMounted = false; };
  }, [vehicle.lat, vehicle.lng, vehicle.iconType]);

  const isSmart = vehicle.settings?.smartSpeedMode !== false;
  const limitValue = isSmart ? (vehicle.settings?.detectedRoadSpeed || speedInfo.speedLimit) : (vehicle.settings?.speedLimit || 60);

  return (
    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
      <span className="text-gray-500 block mb-0.5">Limite da Via (Satélite)</span>
      <div className="flex items-center gap-2">
        <strong className="text-gray-900 text-sm font-bold flex items-center gap-1 font-mono">
          <Gauge className="w-4 h-4 text-emerald-600" />
          {limitValue} km/h
        </strong>
        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium truncate max-w-[140px]" title={speedInfo.roadType}>
          {speedInfo.roadType.split('(')[0].trim()}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard({ vehicles, onBackToMap }: { vehicles: Vehicle[]; onBackToMap?: () => void }) {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'moving' | 'stopped' | 'maintenance'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDevices, setShowDevices] = useState(true);

  const filterByStatus = (list: Vehicle[]) => {
    return list.filter(v => {
      if (selectedFilter === 'moving') return v.status === 'Moving' || v.status === 'IgnitionOn';
      if (selectedFilter === 'stopped') return v.status === 'Stopped' || v.status === 'IgnitionOff';
      if (selectedFilter === 'maintenance') return v.status === 'Maintenance' || v.status === 'NoBattery' || v.status === 'Alarm' || v.status === 'Offline';
      return true;
    });
  };

  const displayedVehicles = filterByStatus(vehicles);

  const totalVehicles = vehicles.length;
  const movingVehicles = vehicles.filter(v => v.status === 'Moving' || v.status === 'IgnitionOn').length;
  const stoppedVehicles = vehicles.filter(v => v.status === 'Stopped' || v.status === 'IgnitionOff').length;
  const maintenanceVehicles = vehicles.filter(v => v.status === 'Maintenance' || v.status === 'NoBattery' || v.status === 'Alarm' || v.status === 'Offline').length;
  const onlineWithSatellites = vehicles.filter(v => v.status !== 'Offline' && v.lat !== 0 && v.lng !== 0).length;

  const totalMileage = Math.round(vehicles.reduce((acc, v) => acc + (v.totalMileage || 0), 0)).toLocaleString('pt-BR');
  const totalDailyMileage = Math.round(vehicles.reduce((acc, v) => acc + (v.dailyMileage || 0), 0)).toLocaleString('pt-BR');
  const avgSpeed = totalVehicles > 0 ? (vehicles.reduce((acc, v) => acc + (v.speed || 0), 0) / totalVehicles).toFixed(1) : '0';

  const statusData = [
    { name: 'Em Movimento / Ligado', value: movingVehicles },
    { name: 'Parado / Desligado', value: stoppedVehicles },
    { name: 'Offline / Alerta', value: maintenanceVehicles },
  ];
  const COLORS = ['#22c55e', '#64748b', '#ef4444'];

  
  const vehicleMileageData = vehicles.slice(0, 8).map(v => ({
    name: v.name || v.licensePlate || 'Veículo',
    km: Math.round(v.totalMileage || 0)
  }));

  const drivingBehaviorData = vehicles.slice(0, 8).map(v => ({
    name: v.name || v.licensePlate || 'Veículo',
    Curvas: v.sharpTurns || 0,
    Frenagens: v.harshBraking || 0
  }));

  const speedData = vehicles.slice(0, 8).map(v => ({
    name: v.name || v.licensePlate || 'Veículo',
    Velocidade: v.speed || 0,
    Limite: v.settings?.speedLimit || 80
  }));


  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="flex-grow p-4 sm:p-6 overflow-y-auto bg-gray-50/50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold text-gray-950 tracking-tight flex items-center gap-2">
              <Activity className="w-7 h-7 text-blue-600" />
              Painel Geral da Frota e Rastreadores
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Visão geral da telemetria veicular, sinal de satélites GPS/GNSS e métricas em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200">
              <Radio className="w-3.5 h-3.5 mr-1.5 text-emerald-600 animate-pulse" />
              {onlineWithSatellites} / {totalVehicles} com Sinal de Satélite 🛰️
            </span>

            
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div 
            onClick={() => setSelectedFilter('all')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md ${
              selectedFilter === 'all' ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total da Frota</span>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Car className="w-5 h-5" /></div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-gray-900">{totalVehicles}</span>
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Sincronizados</span>
            </div>
          </div>

          <div 
            onClick={() => setSelectedFilter('moving')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md ${
              selectedFilter === 'moving' ? 'border-emerald-500 ring-2 ring-emerald-500/10' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Em Movimento / Ligado</span>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><Zap className="w-5 h-5" /></div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-emerald-600">{movingVehicles}</span>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Ignição Ligada 🟢</span>
            </div>
          </div>

          <div 
            onClick={() => setSelectedFilter('stopped')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md ${
              selectedFilter === 'stopped' ? 'border-slate-500 ring-2 ring-slate-500/10' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Parados / Desligados</span>
              <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl"><ShieldCheck className="w-5 h-5" /></div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-700">{stoppedVehicles}</span>
              <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">Conectados ⚪</span>
            </div>
          </div>

          <div 
            onClick={() => setSelectedFilter('maintenance')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md ${
              selectedFilter === 'maintenance' ? 'border-red-500 ring-2 ring-red-500/10' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Offline / Alertas</span>
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl"><AlertTriangle className="w-5 h-5" /></div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-red-600">{maintenanceVehicles}</span>
              <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Sem Sinal 🔴</span>
            </div>
          </div>
        </div>

        {/* Telemetry Secondary Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-200 text-center">
          <div className="p-3 bg-gray-50 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">Km Total Acumulado</span>
            <span className="text-base font-extrabold text-gray-900">{totalMileage} km</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">Km Rodado Hoje</span>
            <span className="text-base font-extrabold text-blue-600">{totalDailyMileage} km</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">Velocidade Média</span>
            <span className="text-base font-extrabold text-emerald-600">{avgSpeed} km/h</span>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Pie Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Status Operacional da Frota</h3>
            <p className="text-xs text-gray-500 mb-4">Proporção de veículos em movimento, parados e offline</p>
            <div className="h-72 w-full flex-grow flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={6}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {statusData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Mileage Bar Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Quilometragem da Frota</h3>
            <p className="text-xs text-gray-500 mb-4">Distância percorrida por veículo cadastrado</p>
            <div className="h-72 w-full flex-grow">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleMileageData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={40} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="km" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer></div></div></div>
        {/* Aditional Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Behavior Bar Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Comportamento de Condução</h3>
            <p className="text-xs text-gray-500 mb-4">Eventos de curvas e frenagens bruscas por veículo</p>
            <div className="h-72 w-full flex-grow">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={drivingBehaviorData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={40} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar dataKey="Curvas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Frenagens" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Speed Bar Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Velocidade Atual vs. Limite</h3>
            <p className="text-xs text-gray-500 mb-4">Métrica de velocidade em tempo real comparada ao limite da via</p>
            <div className="h-72 w-full flex-grow">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={speedData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={40} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar dataKey="Velocidade" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Limite" fill="#94a3b8" radius={[4, 4, 0, 0]} opacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>


        {/* Vehicles List Section */}
        {showDevices && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-5 bg-blue-50/60 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-lg shadow-sm">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Veículos e Rastreadores na Frota</h3>
                  <p className="text-xs text-gray-600">{displayedVehicles.length} unidades exibidas • Sinal Satélite e Telemetria</p>
                </div>
              </div>
              <button
                onClick={() => setShowDevices(false)}
                className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
              >
                Ocultar Lista
              </button>
            </div>

            <div className="divide-y divide-gray-100 overflow-y-auto max-h-[500px]">
              {displayedVehicles.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">Nenhum veículo encontrado para este filtro.</div>
              ) : (
                displayedVehicles.map((vehicle) => {
                  const isExpanded = expandedId === vehicle.id;
                  const satCount = vehicle.status === 'Offline' ? 0 : (vehicle.satellites || 12);
                  return (
                    <div key={vehicle.id} className="transition-colors hover:bg-blue-50/20">
                      <div 
                        onClick={(e) => toggleExpand(vehicle.id, e)}
                        className="p-4 flex items-center justify-between cursor-pointer group select-none"
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm border border-gray-200 transition-colors"
                            style={{ backgroundColor: (vehicle.color || '#3b82f6') + '20', color: vehicle.color || '#3b82f6' }}
                          >
                            🚗
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                              {vehicle.name}
                              {vehicle.settings?.isBlocked && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-bold">Bloqueado</span>
                              )}
                            </h4>
                            <p className="text-xs font-mono text-gray-500">Placa: {vehicle.licensePlate || 'N/A'} • IMEI/ID: {vehicle.trackerNumber || 'TK303G'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            vehicle.status === 'Offline' ? 'bg-red-100 text-red-800' :
                            vehicle.status === 'Moving' || vehicle.status === 'IgnitionOn' ? 'bg-emerald-100 text-emerald-800' :
                            vehicle.status === 'Stopped' || vehicle.status === 'IgnitionOff' ? 'bg-slate-100 text-slate-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {vehicle.status === 'Offline' ? '🔴 Offline (Sem Internet/Sinal)' :
                             vehicle.status === 'Moving' ? '🚗 Em Movimento' :
                             vehicle.status === 'IgnitionOn' ? '🟢 Ignição Ligada' :
                             vehicle.status === 'IgnitionOff' ? '⚪ Desligado' :
                             vehicle.status === 'Stopped' ? '⚪ Parado' :
                             vehicle.status === 'NoBattery' ? 'Sem Bateria ⚠️' : vehicle.status}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(vehicle.id, e)}
                            className="p-2 rounded-lg bg-gray-100 group-hover:bg-blue-600 group-hover:text-white text-gray-600 transition-all flex items-center gap-1 text-xs font-medium shadow-sm"
                          >
                            <span>{isExpanded ? 'Recolher' : 'Expandir'}</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-5 pb-5 pt-2 bg-blue-50/40 border-t border-blue-100 space-y-3 animate-fadeIn">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                              <span className="text-gray-500 block mb-0.5">Velocidade Atual</span>
                              <strong className="text-gray-900 text-sm font-bold">{vehicle.speed || 0} km/h</strong>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                              <span className="text-gray-500 block mb-0.5">Combustível / Bateria</span>
                              <strong className="text-gray-900 text-sm font-bold">{vehicle.batteryLevel != null ? Math.round(vehicle.batteryLevel) + '%' : (vehicle.fuel || 100) + '%'}</strong>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                              <span className="text-gray-500 block mb-0.5">Quilometragem Total</span>
                              <strong className="text-gray-900 text-sm font-bold">{Math.round(vehicle.totalMileage || 0).toLocaleString('pt-BR')} km</strong>
                            </div>
                          </div>

                          <div className="text-xs">
                            <DashboardRoadSpeed vehicle={vehicle} />
                          </div>

                          <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                            <span className="text-[10px] text-gray-500 font-medium block mb-1">Endereço Preciso (Localização Real)</span>
                            <DashboardAddress lat={vehicle.lat} lng={vehicle.lng} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
