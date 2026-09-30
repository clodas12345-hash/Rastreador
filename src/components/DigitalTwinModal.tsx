import React, { useState } from 'react';
import { Vehicle } from '../types';
import { X, Gauge, Zap, Wrench, ShieldCheck, AlertTriangle, Compass, Activity, Eye } from 'lucide-react';
import { AddressDisplay } from './AddressDisplay';

interface DigitalTwinModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  onOpenMaintenance?: () => void;
}

export default function DigitalTwinModal({ vehicle, onClose, onOpenMaintenance }: DigitalTwinModalProps) {
  const [activeTab, setActiveTab] = useState<'twin' | 'birds_eye'>('twin');

  const currentKm = Math.round(vehicle.totalMileage || 0);
  const batteryVolt = vehicle.externalVoltage != null ? vehicle.externalVoltage : (vehicle.status === 'Moving' ? 14.1 : 12.6);
  const isPowerCut = vehicle.powerCut || vehicle.status === 'NoBattery';
  const satellites = vehicle.satellites || 12;

  // Calculos Preditivos de Saúde das Peças
  const engineTemp = vehicle.status === 'Moving' ? 88 : (vehicle.status === 'IgnitionOn' ? 82 : 25);
  const fuelPct = vehicle.fuel || 85;
  const heading = vehicle.heading || 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-5 animate-fadeIn pointer-events-auto">
      <div className="bg-slate-900 text-white rounded-3xl border border-slate-700 shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-500/50 rounded-2xl text-2xl shadow">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">{vehicle.name}</h3>
                <span className="text-xs font-mono bg-blue-600/30 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded-full font-bold">
                  {vehicle.licensePlate || 'GRA-2026'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Gêmeo Digital & Telemática 360° em Tempo Real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-900 p-1 rounded-2xl border border-slate-700 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('twin')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'twin' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                🏎️ Gêmeo Digital 3D
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('birds_eye')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'birds_eye' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                👁️ Visão Top-Down 360°
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-2xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'twin' ? (
            <>
              {/* Top Sensor Status Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl text-xl">🛢️</div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Motor & Temp</span>
                    <span className="text-sm font-black text-white font-mono">{engineTemp}°C</span>
                  </div>
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl text-xl ${isPowerCut ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    ⚡
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Bateria 12V</span>
                    <span className="text-sm font-black text-white font-mono">{batteryVolt.toFixed(1)}V</span>
                  </div>
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl text-xl">⛽</div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Tanque de Combustível</span>
                    <span className="text-sm font-black text-white font-mono">{fuelPct}%</span>
                  </div>
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/20 text-purple-400 rounded-xl text-xl">📡</div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Sinal GPS</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">{satellites} Satélites</span>
                  </div>
                </div>
              </div>

              {/* Digital Twin Schematic Diagram */}
              <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 relative overflow-hidden flex flex-col items-center">
                <div className="absolute top-3 left-4 text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                  Gêmeo Digital Raio-X Preditivo
                </div>

                {/* Car Silhouette SVG with telemetry hotspots */}
                <div className="relative w-full max-w-lg h-64 my-4 flex items-center justify-center">
                  <svg className="w-full h-full text-slate-700" viewBox="0 0 500 220" fill="none" stroke="currentColor" strokeWidth="2">
                    {/* Outline Car */}
                    <path d="M70,140 L100,80 L180,60 L320,60 L400,80 L440,140 L450,170 L50,170 Z" fill="#1e293b" stroke="#334155" strokeWidth="3" />
                    {/* Windows */}
                    <path d="M110,85 L175,68 L240,68 L240,130 L110,130 Z" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
                    <path d="M255,68 L315,68 L385,85 L385,130 L255,130 Z" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
                    {/* Wheels */}
                    <circle cx="120" cy="170" r="32" fill="#020617" stroke="#38bdf8" strokeWidth="3" />
                    <circle cx="120" cy="170" r="16" fill="#1e293b" />
                    <circle cx="370" cy="170" r="32" fill="#020617" stroke="#38bdf8" strokeWidth="3" />
                    <circle cx="370" cy="170" r="16" fill="#1e293b" />
                  </svg>

                  {/* Hotspot 1: Motor */}
                  <div className="absolute top-20 left-[18%] bg-slate-900/90 border border-amber-500/80 px-2.5 py-1 rounded-xl shadow-lg text-[10px] font-bold text-amber-300 flex items-center gap-1.5 animate-pulse">
                    <span>🛢️ Motor</span>
                    <span className="font-mono text-white">{engineTemp}°C</span>
                  </div>

                  {/* Hotspot 2: Bateria */}
                  <div className="absolute top-12 left-[38%] bg-slate-900/90 border border-blue-500/80 px-2.5 py-1 rounded-xl shadow-lg text-[10px] font-bold text-blue-300 flex items-center gap-1.5">
                    <span>⚡ Bateria</span>
                    <span className="font-mono text-white">{batteryVolt.toFixed(1)}V</span>
                  </div>

                  {/* Hotspot 3: Freios Dianteiros */}
                  <div className="absolute bottom-6 left-[22%] bg-slate-900/90 border border-emerald-500/80 px-2.5 py-1 rounded-xl shadow-lg text-[10px] font-bold text-emerald-300 flex items-center gap-1.5">
                    <span>🛑 Freios</span>
                    <span className="font-mono text-white">OK (85%)</span>
                  </div>

                  {/* Hotspot 4: Tanque */}
                  <div className="absolute top-24 right-[25%] bg-slate-900/90 border border-cyan-500/80 px-2.5 py-1 rounded-xl shadow-lg text-[10px] font-bold text-cyan-300 flex items-center gap-1.5">
                    <span>⛽ Tanque</span>
                    <span className="font-mono text-white">{fuelPct}%</span>
                  </div>
                </div>

                <div className="w-full flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
                  <span>Odômetro: <strong className="text-white font-mono">{currentKm.toLocaleString('pt-BR')} km</strong></span>
                  {onOpenMaintenance && (
                    <button
                      type="button"
                      onClick={onOpenMaintenance}
                      className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow flex items-center gap-1 cursor-pointer"
                    >
                      <span>🔧</span>
                      <span>Ver Quadro de Manutenção</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Bird's Eye View Top-Down 360 Mode */
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 flex flex-col items-center relative overflow-hidden min-h-[380px] justify-center">
              <div className="absolute top-4 left-4 text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                Visão Aérea Top-Down 360° & Radar de Aproximação
              </div>

              {/* Radar Simulation */}
              <div className="relative w-72 h-72 rounded-full border-2 border-slate-800 flex items-center justify-center my-4">
                <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping pointer-events-none" />
                <div className="absolute w-52 h-52 rounded-full border border-slate-800" />
                <div className="absolute w-32 h-32 rounded-full border border-slate-800" />

                {/* Car Top View Box */}
                <div 
                  className="w-24 h-44 bg-blue-600/90 border-2 border-white rounded-2xl shadow-2xl flex flex-col items-center justify-between p-2 relative z-10 transition-transform duration-500"
                  style={{ transform: `rotate(${heading}deg)` }}
                >
                  <div className="w-16 h-8 bg-slate-950/80 rounded-t-xl border border-blue-400/50" />
                  <span className="text-[10px] font-black text-white tracking-widest uppercase">
                    {vehicle.name.slice(0, 8)}
                  </span>
                  <div className="w-16 h-8 bg-slate-950/80 rounded-b-xl border border-blue-400/50" />
                </div>

                {/* Radar Distance Sensors */}
                <div className="absolute top-2 bg-emerald-500/20 border border-emerald-400 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                  FRENTE: 120 cm
                </div>
                <div className="absolute bottom-2 bg-emerald-500/20 border border-emerald-400 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                  RÉ: 45 cm
                </div>
                <div className="absolute left-2 bg-emerald-500/20 border border-emerald-400 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                  ESQ: 80 cm
                </div>
                <div className="absolute right-2 bg-emerald-500/20 border border-emerald-400 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                  DIR: 95 cm
                </div>
              </div>

              <div className="text-xs text-slate-300 font-medium text-center max-w-md">
                Ângulo de Direção: <strong className="text-blue-400 font-mono">{heading}°</strong> • Sensores de proximidade ativos na manobra
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
