import React, { useState } from 'react';
import { Vehicle } from '../types';
import { 
  ArrowLeft, ShieldAlert, Activity, Gauge, Clock, 
  FileText, Download, Printer, AlertTriangle, CheckCircle2, 
  Sparkles, MapPin, Zap, RefreshCw
} from 'lucide-react';
import { AddressDisplay } from './AddressDisplay';

export interface CrashEvent {
  id: string;
  vehicleId: string;
  vehicleName: string;
  licensePlate: string;
  timestamp: string;
  lat: number;
  lng: number;
  impactSpeed: number; // km/h no momento
  maxGForce: number; // Força G de desaceleração (ex: 1.8g)
  severity: 'moderada' | 'grave' | 'critica';
  driverName?: string;
  weatherCondition?: string;
  telemetrySeconds: Array<{
    second: number; // -10s a +10s
    speed: number;
    gForce: number;
    batteryVoltage: number;
  }>;
}

interface CaixaPretaModuleProps {
  vehicles: Vehicle[];
  onBackToMap?: () => void;
  showToast?: (msg: string) => void;
}

const SAMPLE_CRASH_EVENTS: CrashEvent[] = [
  {
    id: 'crash-101',
    vehicleId: 'veh-onix-plus',
    vehicleName: 'Onix Plus',
    licensePlate: 'BRA-2E19',
    timestamp: '30/09/2026 14:22:18',
    lat: -23.514971,
    lng: -46.548199,
    impactSpeed: 68,
    maxGForce: 1.85,
    severity: 'critica',
    driverName: 'Carlos Eduardo Silva',
    weatherCondition: 'Chuva Moderada (Pista Molhada)',
    telemetrySeconds: [
      { second: -5, speed: 78, gForce: 0.1, batteryVoltage: 14.1 },
      { second: -4, speed: 78, gForce: 0.2, batteryVoltage: 14.1 },
      { second: -3, speed: 76, gForce: 0.3, batteryVoltage: 14.0 },
      { second: -2, speed: 72, gForce: 0.8, batteryVoltage: 14.0 },
      { second: -1, speed: 68, gForce: 1.85, batteryVoltage: 13.8 },
      { second: 0, speed: 12, gForce: 2.1, batteryVoltage: 12.4 },
      { second: 1, speed: 0, gForce: 0.1, batteryVoltage: 12.4 },
      { second: 2, speed: 0, gForce: 0.0, batteryVoltage: 12.4 },
      { second: 3, speed: 0, gForce: 0.0, batteryVoltage: 12.4 }
    ]
  },
  {
    id: 'crash-102',
    vehicleId: 'veh-honda-hrv',
    vehicleName: 'Honda HR-V',
    licensePlate: 'BRA-9A88',
    timestamp: '28/09/2026 09:15:42',
    lat: -23.5505,
    lng: -46.6333,
    impactSpeed: 42,
    maxGForce: 1.15,
    severity: 'moderada',
    driverName: 'Roberto Alencar',
    weatherCondition: 'Tempo Limpo',
    telemetrySeconds: [
      { second: -5, speed: 45, gForce: 0.1, batteryVoltage: 14.1 },
      { second: -4, speed: 45, gForce: 0.1, batteryVoltage: 14.1 },
      { second: -3, speed: 44, gForce: 0.2, batteryVoltage: 14.1 },
      { second: -2, speed: 42, gForce: 1.15, batteryVoltage: 14.0 },
      { second: -1, speed: 15, gForce: 0.4, batteryVoltage: 13.9 },
      { second: 0, speed: 0, gForce: 0.0, batteryVoltage: 13.9 }
    ]
  }
];

export default function CaixaPretaModule({
  vehicles,
  onBackToMap,
  showToast
}: CaixaPretaModuleProps) {
  const [events] = useState<CrashEvent[]>(SAMPLE_CRASH_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<CrashEvent>(SAMPLE_CRASH_EVENTS[0]);

  const handlePrintLaudo = () => {
    window.print();
  };

  return (
    <div className="flex-1 bg-gray-50 flex flex-col h-full overflow-y-auto">
      <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            {onBackToMap && (
              <button 
                onClick={onBackToMap}
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                title="Voltar ao Mapa"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-red-600" />
                Caixa Preta & Reconstrução Pericial de Sinistros
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 font-medium">
                Laudo pericial de impacto com telemetria segundo a segundo pré e pós-colisão
              </p>
            </div>
          </div>

          <button
            onClick={handlePrintLaudo}
            className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Printer className="w-4 h-4" />
            Imprimir Laudo Pericial (PDF)
          </button>
        </div>

        {/* Selected Event Laudo Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-700 relative overflow-hidden">
          <div className="flex items-start justify-between border-b border-slate-700 pb-4 mb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-red-400 bg-red-500/20 px-3 py-1 rounded-full border border-red-500/30 inline-block mb-2">
                🚨 REGISTRO DE IMPACTO DETECTADO
              </span>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                {selectedEvent.vehicleName}
                <span className="text-xs font-mono text-slate-300 font-normal bg-slate-800 px-2 py-0.5 rounded">
                  {selectedEvent.licensePlate}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Data do Sinistro: <strong className="text-slate-200">{selectedEvent.timestamp}</strong> • Condutor: <strong className="text-slate-200">{selectedEvent.driverName || 'Não informado'}</strong>
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Pico de Força G</span>
              <span className="text-3xl font-black font-mono text-red-400">{selectedEvent.maxGForce}g</span>
            </div>
          </div>

          {/* Grid de Dados da Perícia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Velocidade Pré-Impacto</span>
              <span className="text-xl font-black text-white font-mono">{selectedEvent.impactSpeed} km/h</span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Gravidade Estimada</span>
              <span className="text-base font-black uppercase text-red-400">{selectedEvent.severity}</span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Condição Climática</span>
              <span className="text-xs font-bold text-slate-200 truncate block">{selectedEvent.weatherCondition}</span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Coordenadas GPS</span>
              <span className="text-xs font-mono text-slate-300 font-bold">
                {selectedEvent.lat.toFixed(4)}, {selectedEvent.lng.toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        {/* Telemetry Timeline Seconds Graphic */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <h3 className="text-base font-extrabold text-gray-900 mb-1 flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-600" />
            <span>Reconstrução Telemétrica Segundo a Segundo (Caixa Preta)</span>
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Curva de desaceleração e variações telemétricas no instante da colisão
          </p>

          <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
            {selectedEvent.telemetrySeconds.map((sec, idx) => (
              <div 
                key={idx}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  sec.gForce >= 1.0 ? 'bg-red-50 border-red-300 ring-2 ring-red-400/30' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <span className="text-[10px] font-bold text-gray-400 block mb-1 font-mono">
                  {sec.second === 0 ? '💥 IMPACTO' : `${sec.second > 0 ? '+' : ''}${sec.second}s`}
                </span>
                <span className="text-sm font-black font-mono block text-gray-900">{sec.speed} km/h</span>
                <span className={`text-[10px] font-bold block ${sec.gForce >= 1.0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {sec.gForce}g
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Event Selector Table */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <h3 className="text-base font-extrabold text-gray-900 mb-3">
            Ocorrências de Colisão Registradas
          </h3>

          <div className="space-y-2">
            {events.map(evt => (
              <div
                key={evt.id}
                onClick={() => setSelectedEvent(evt)}
                className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  selectedEvent.id === evt.id ? 'bg-red-50 border-red-400 ring-2 ring-red-300/40' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-100 text-red-600 rounded-xl font-bold">🚨</div>
                  <div>
                    <strong className="text-sm text-gray-900 block">{evt.vehicleName} ({evt.licensePlate})</strong>
                    <span className="text-xs text-gray-500 font-mono">{evt.timestamp} • {evt.impactSpeed} km/h • {evt.maxGForce}g</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all"
                >
                  Ver Laudo
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
