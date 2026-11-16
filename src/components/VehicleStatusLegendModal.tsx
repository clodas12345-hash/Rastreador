import React from 'react';
import { Info, X } from 'lucide-react';
import { Vehicle } from '../types';

interface VehicleStatusLegendModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles?: Vehicle[];
}

export default function VehicleStatusLegendModal({
  isOpen,
  onClose,
  vehicles = []
}: VehicleStatusLegendModalProps) {
  const counts = React.useMemo(() => {
    let ligado = 0;
    let comSinal = 0;
    let offline = 0;
    let blocked = 0;

    vehicles.forEach(v => {
      const isBlocked = Boolean(v.settings?.isBlocked);
      const isOff = v.status === 'Offline' || v.status === 'NoBattery';
      const isLig = !isOff && (v.status === 'Moving' || v.status === 'IgnitionOn' || (v.speed || 0) >= 4);

      if (isBlocked) blocked++;
      if (isOff) offline++;
      else if (isLig) ligado++;
      else comSinal++;
    });

    return { ligado, comSinal, offline, blocked };
  }, [vehicles]);

  if (!isOpen) return null;

  const legendItems = [
    {
      id: 'comSinal',
      label: 'Com Sinal de Internet (Verde)',
      sub: 'Conectado / Desligado estacionado',
      count: counts.comSinal,
      indicator: (
        <div className="flex items-center justify-center w-6 h-6 shrink-0">
          <span className="inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white shadow-sm ring-1 ring-emerald-400/40"></span>
        </div>
      ),
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
    },
    {
      id: 'ligado',
      label: 'Ligado (Azul)',
      sub: 'Motor ligado ou em deslocamento',
      count: counts.ligado,
      indicator: (
        <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border-2 border-white shadow-sm ring-2 ring-blue-400/50"></span>
        </div>
      ),
      badgeClass: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
    },
    {
      id: 'offline',
      label: 'Sem Sinal de Internet (Vermelho)',
      sub: 'Sem sinal GPRS ou sem bateria',
      count: counts.offline,
      indicator: (
        <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-50"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 border-2 border-white shadow-sm"></span>
        </div>
      ),
      badgeClass: 'bg-red-500/20 text-red-300 border border-red-500/30'
    },
    {
      id: 'blocked',
      label: 'Bloqueado',
      sub: 'Corte de combustível ativo',
      count: counts.blocked,
      indicator: (
        <div className="flex items-center justify-center w-6 h-6 shrink-0">
          <span className="inline-flex rounded-full h-4 w-4 bg-red-700 border-2 border-white shadow-sm ring-2 ring-red-500/50 flex items-center justify-center text-[9px] font-black text-white">
            ✕
          </span>
        </div>
      ),
      badgeClass: 'bg-red-700/20 text-red-300 border border-red-700/30'
    }
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1200] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/90 p-5 w-full max-w-sm flex flex-col gap-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-white leading-tight">Legenda de Status</h4>
              <p className="text-[11px] text-slate-400">Cores e sinais dos veículos no mapa</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar legenda"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {legendItems.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-800/50 border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.indicator}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-100 truncate">{item.label}</span>
                  <span className="text-[11px] text-slate-400 truncate">{item.sub}</span>
                </div>
              </div>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md shrink-0 ${item.badgeClass}`}>
                {item.count}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-2.5 border-t border-slate-800/80 flex items-center gap-2.5 text-[11px] text-slate-400">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border border-white ring-2 ring-blue-400/60 shrink-0"></div>
          <span>Borda azul pulsante indica veículo em foco no mapa</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
