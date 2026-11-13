import { Vehicle } from '../types';

/**
 * Cores padronizadas para os veículos:
 * - Verde quando com sinal de internet (conectado, porém desligado)
 * - Azul quando ligado (ignição ligada / em movimento / ocioso)
 * - Vermelho quando sem sinal de internet (offline / sem sinal / sem bateria)
 */
export const VEHICLE_COLORS = {
  ONLINE_OFF: '#16a34a',  // Verde (Com sinal de internet / Desligado)
  LIGADO: '#2563eb',      // Azul (Ligado / Em movimento)
  OFFLINE: '#dc2626',     // Vermelho (Sem sinal de internet / Offline)
};

/**
 * Retorna a cor exata (código HEX) do veículo de acordo com seu estado em tempo real:
 * - Verde quando com sinal de internet
 * - Azul quando ligado
 * - Vermelho quando sem sinal de internet
 */
export function getVehicleDynamicColor(vehicle?: Partial<Vehicle> | null): string {
  if (!vehicle) return VEHICLE_COLORS.ONLINE_OFF;

  const isOffline = vehicle.status === 'Offline' || vehicle.status === 'NoBattery';
  if (isOffline) {
    return VEHICLE_COLORS.OFFLINE;
  }

  const isLigado = vehicle.status === 'Moving' || 
                   vehicle.status === 'IgnitionOn' || 
                   (typeof vehicle.speed === 'number' && vehicle.speed >= 4);

  if (isLigado) {
    return VEHICLE_COLORS.LIGADO;
  }

  return VEHICLE_COLORS.ONLINE_OFF;
}

/**
 * Retorna classes CSS de cores, bordas, anéis e texto para estilização coerente do veículo.
 */
export function getVehicleColorStyles(vehicle?: Partial<Vehicle> | null) {
  const isOffline = !vehicle || vehicle.status === 'Offline' || vehicle.status === 'NoBattery';
  
  if (isOffline) {
    return {
      state: 'offline' as const,
      hex: VEHICLE_COLORS.OFFLINE,
      label: 'Sem Sinal de Internet',
      dotClass: 'bg-red-600 animate-pulse',
      borderClass: 'border-red-600 text-red-600',
      textClass: 'text-red-600',
      ringClass: 'ring-red-400/50',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      pillClass: 'bg-red-900/60 text-red-300',
      bgClass: 'bg-red-600',
      lightBgClass: 'bg-red-100 text-red-800 border-red-200'
    };
  }

  const isLigado = vehicle.status === 'Moving' || 
                   vehicle.status === 'IgnitionOn' || 
                   (typeof vehicle.speed === 'number' && vehicle.speed >= 4);

  if (isLigado) {
    const isMoving = (typeof vehicle.speed === 'number' && vehicle.speed >= 4) || vehicle.status === 'Moving';
    return {
      state: 'ligado' as const,
      hex: VEHICLE_COLORS.LIGADO,
      label: isMoving ? `Ligado (${Math.round(vehicle.speed || 0)} km/h)` : 'Ligado',
      dotClass: 'bg-blue-600 animate-pulse',
      borderClass: 'border-blue-600 text-blue-600',
      textClass: 'text-blue-600',
      ringClass: 'ring-blue-400/50',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      pillClass: 'bg-blue-900/60 text-blue-300',
      bgClass: 'bg-blue-600',
      lightBgClass: 'bg-blue-100 text-blue-800 border-blue-200'
    };
  }

  // Com sinal de internet (desligado mas conectado)
  return {
    state: 'com_sinal' as const,
    hex: VEHICLE_COLORS.ONLINE_OFF,
    label: 'Com Sinal de Internet',
    dotClass: 'bg-emerald-500',
    borderClass: 'border-emerald-500 text-emerald-600',
    textClass: 'text-emerald-600',
    ringClass: 'ring-emerald-400/40',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pillClass: 'bg-emerald-900/60 text-emerald-300',
    bgClass: 'bg-emerald-500',
    lightBgClass: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  };
}
