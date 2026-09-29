/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {useState, useEffect, useRef} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {Settings, HelpCircle, Wrench, Route as RouteIcon, LayoutDashboard, Database, Trash2, Bell, Radio, ArrowLeft, AlertTriangle, Target, ShieldCheck, X} from 'lucide-react';
import {Vehicle, VehicleSettings, SavedRoute, RoutePoint, AppNotification, Geofence} from './types';
import FleetTracker from './components/FleetTracker';
import Dashboard from './components/Dashboard';
import HistoricoModule from './components/HistoricoModule';
import ModulePlaceholder from './components/ModulePlaceholder';
import TerminalTools from './components/TerminalTools';

import { VehicleIcon } from './components/VehicleIcon';
import HelpModule from './components/HelpModule';
import DadosModule from './components/DadosModule';
import RegistradorModule from './components/RegistradorModule';
import RouteManagerModal from './components/RouteManagerModal';


import {collection, onSnapshot, doc} from 'firebase/firestore';
import {safeUpdateDoc, safeAddDoc, safeDeleteDoc, safeSetDoc} from './utils/firestoreWrapper';
import {db, handleFirestoreError, OperationType, cleanFirestoreData} from './lib/firebase';
import { getRealAddress, getCachedAddress, getRealRoadSpeedLimit, getCachedRoadSpeed } from './lib/geocoding';

const FLESPI_TOKEN = 'DYX74VMw3KdUUbFwued9qa2ahQcAZcts9C7MVZ32gw2GEJSfgeCMk1Ww2oc1MofV';

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return Math.round(brng);
}

export function parseFlespiDeviceData(devMessages: any[], previousVehicle?: Partial<Vehicle>) {
  if (!devMessages || devMessages.length === 0) return null;

  // Sort messages descending by timestamp
  const sorted = [...devMessages].sort((a: any, b: any) => 
    (b.timestamp || b['server.timestamp'] || 0) - (a.timestamp || a['server.timestamp'] || 0)
  );

  // 1. Find latest GPS Fix message
  const posMsg = sorted.find(m => typeof m['position.latitude'] === 'number' && typeof m['position.longitude'] === 'number' && (m['position.latitude'] !== 0 || m['position.longitude'] !== 0));
  const latestMsg = sorted[0];

  const lat = posMsg ? Number(posMsg['position.latitude']) : (previousVehicle?.lat ?? 0);
  const lng = posMsg ? Number(posMsg['position.longitude']) : (previousVehicle?.lng ?? 0);
  const speed = posMsg ? Math.round(Number(posMsg['position.speed'] || 0)) : (previousVehicle?.speed ?? 0);
  const direction = posMsg ? Number(posMsg['position.direction'] || 0) : 0;
  const satellites = posMsg ? Number(posMsg['position.satellites'] || posMsg['gnss.satellites'] || (lat !== 0 ? 12 : 0)) : (previousVehicle?.satellites ?? 12);
  const hdop = posMsg ? Number(posMsg['position.hdop'] || posMsg['gnss.hdop'] || 0.9) : 0.9;
  const timestamp = Number(latestMsg.timestamp || latestMsg['server.timestamp'] || (Date.now() / 1000));
  
  let batteryLevel = latestMsg['battery.level'] !== undefined ? Number(latestMsg['battery.level']) : previousVehicle?.batteryLevel;
  const internalVoltage = latestMsg['battery.voltage'];
  if (batteryLevel === undefined && internalVoltage !== undefined) {
    let pct = ((Number(internalVoltage) - 3.6) / (4.2 - 3.6)) * 100;
    batteryLevel = Math.max(0, Math.min(100, pct));
  }
  let extV = latestMsg['external.powersource.voltage'] !== undefined ? Number(latestMsg['external.powersource.voltage']) : (latestMsg['power.voltage'] !== undefined ? Number(latestMsg['power.voltage']) : previousVehicle?.externalVoltage);
  const externalVoltage = extV;

  // 2. Multi-field Ignition Detection across all recent messages in the buffer
  let explicitIgnition: boolean | null = null;
  for (const m of sorted) {
    if (m['engine.ignition.status'] !== undefined) {
      explicitIgnition = Boolean(m['engine.ignition.status']);
      break;
    }
    if (m['ignition.status'] !== undefined) {
      explicitIgnition = Boolean(m['ignition.status']);
      break;
    }
    if (m['io.ignition'] !== undefined) {
      explicitIgnition = Boolean(m['io.ignition']);
      break;
    }
    if (m['din.1'] !== undefined) {
      explicitIgnition = Boolean(m['din.1']);
      break;
    }
    if (m['acc'] !== undefined) {
      explicitIgnition = Boolean(m['acc']);
      break;
    }
    const evt = String(m['event.code'] || m['event.enum'] || m['alarm.code'] || '').toLowerCase();
    if (
      evt.includes('acc on') || evt.includes('acc_on') || evt.includes('accon') ||
      evt.includes('ignition on') || evt.includes('ignition_on') ||
      evt.includes('ligado') || evt.includes('engine on')
    ) {
      explicitIgnition = true;
      break;
    }
    if (
      evt.includes('acc off') || evt.includes('acc_off') || evt.includes('accoff') ||
      evt.includes('ignition off') || evt.includes('ignition_off') ||
      evt.includes('desligado') || evt.includes('engine off')
    ) {
      explicitIgnition = false;
      break;
    }
  }

  // 3. Robust Status & Glitch/Debounce Protection
  const nowSec = Date.now() / 1000;
  // If ignition is OFF, we allow 24 hours before calling it "Offline" (No Signal)
  // because trackers often go to deep sleep and stop pinging every few minutes.
  const offlineThreshold = explicitIgnition === false ? 86400 : 3600; // 24 hours if OFF, 1 hour if ON
  const isOnline = (nowSec - timestamp) < offlineThreshold;

  // Detect Power Cut ONLY from fresh alarm codes in the latest active message (within 300s)
  let powerCut = false;
  const latestAlarm = String(latestMsg['alarm.code'] || latestMsg['event.code'] || latestMsg['event.enum'] || '').toLowerCase();
  const latestMsgTs = Number(latestMsg.timestamp || latestMsg['server.timestamp'] || 0);
  const isRecentMsg = (nowSec - latestMsgTs) < 300;

  if (isRecentMsg && (
    latestAlarm.includes('power_cut') || 
    latestAlarm.includes('power.cut') || 
    latestAlarm.includes('cut_power') || 
    latestAlarm.includes('powercut') ||
    latestMsg['power.off.alarm'] === true ||
    latestMsg['external.powersource.status'] === false
  )) {
    powerCut = true;
  }
  // Only detect voltage drop if voltage is actually reported by hardware (> 0.5V and < 5.0V in recent message)
  if (externalVoltage !== undefined && externalVoltage > 0.5 && externalVoltage < 5.0 && isRecentMsg) {
    powerCut = true;
  }

  let status: Vehicle['status'] = previousVehicle?.status || 'IgnitionOff';

  if (previousVehicle?.settings?.isBlocked) {
    status = 'Stopped';
  } else if (powerCut) {
    status = 'NoBattery';
  } else if (!isOnline) {
    // Only show Offline if it's truly beyond the grace period
    status = 'Offline';
  } else if (speed > 2) {
    // If vehicle is moving (> 2 km/h), vehicle is in motion and engine is ON
    status = 'Moving';
  } else {
    // Speed <= 2 km/h (Stopped / In traffic / Idling / Red light)
    if (explicitIgnition === true) {
      status = 'IgnitionOn';
    } else if (explicitIgnition === false) {
      status = 'IgnitionOff';
    } else {
      // Inconclusive message (keepalive ping without ignition sensor flag)
      // Retain active state if vehicle was previously Moving or IgnitionOn!
      if (previousVehicle?.status === 'Moving' || previousVehicle?.status === 'IgnitionOn') {
        status = 'IgnitionOn';
      } else {
        status = previousVehicle?.status || 'IgnitionOff';
      }
    }
  }

  const ignition = (status === 'Moving' || status === 'IgnitionOn');

  return {
    lat,
    lng,
    speed,
    direction,
    satellites,
    hdop,
    status,
    ignition,
    timestamp,
    batteryLevel,
    externalVoltage,
    powerCut,
    lastTelemetryTime: timestamp
  };
}

const fetchFlespiLocation = async (imei: string, previousVehicle?: Partial<Vehicle>) => {
  try {
    const response = await fetch(`https://flespi.io/gw/devices/all/messages?limit=100&reverse=true`, {
      headers: {
        'Authorization': `FlespiToken ${FLESPI_TOKEN}`
      }
    });
    const data = await response.json();
    if (data && data.result && Array.isArray(data.result)) {
      const messages = data.result
        .filter((m: any) => String(m.ident) === String(imei));
      if (messages.length > 0) {
        const parsed = parseFlespiDeviceData(messages, previousVehicle);
        if (parsed && (parsed.lat !== 0 || parsed.lng !== 0)) {
          return parsed;
        }
      }
    }

    // Fallback to telemetry if not in recent messages
    const telRes = await fetch(`https://flespi.io/gw/devices/all/telemetry/position.latitude,position.longitude,position.speed,position.direction,position.satellites,position.hdop,engine.ignition.status,ident,battery.level,battery.voltage,external.powersource.voltage,power.voltage`, {
      headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
    });
    const telData = await telRes.json();
    if (telData && telData.result) {
      const device = telData.result.find((d: any) => String(d.telemetry?.ident?.value) === String(imei));
      if (device && device.telemetry?.['position.latitude'] && device.telemetry?.['position.longitude']) {
        const speed = Math.round(Number(device.telemetry?.['position.speed']?.value || 0));
        const explicitIgnition = device.telemetry?.['engine.ignition.status']?.value;
        const ignition = explicitIgnition !== undefined ? Boolean(explicitIgnition) : (speed > 2 || previousVehicle?.status === 'IgnitionOn' || previousVehicle?.status === 'Moving');
        const status: Vehicle['status'] = speed > 2 ? 'Moving' : (ignition ? 'IgnitionOn' : 'IgnitionOff');
        return {
          lat: Number(device.telemetry['position.latitude'].value),
          lng: Number(device.telemetry['position.longitude'].value),
          speed: speed,
          direction: Number(device.telemetry?.['position.direction']?.value || 0),
          satellites: Number(device.telemetry?.['position.satellites']?.value || 12),
          hdop: Number(device.telemetry?.['position.hdop']?.value || 0.9),
          ignition: ignition,
          status: status,
          timestamp: Date.now() / 1000
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Flespi fetch error:", error);
    return null;
  }
};

export const fetchFlespiHistory = async (imei: string, fromTimestamp: number, toTimestamp: number, deepScan: boolean = false): Promise<RoutePoint[] | null> => {
  try {
    const devRes = await fetch(`https://flespi.io/gw/devices/all`, {
      headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
    });
    const devData = await devRes.json();
    if (!devData || !devData.result) return null;
    
    const device = devData.result.find((d: any) => String(d.configuration?.ident) === String(imei));
    if (!device) return null;
    
    const queryData = encodeURIComponent(JSON.stringify({from: fromTimestamp, to: toTimestamp}));
    console.log(`[Flespi History Debug] Requesting data (${deepScan ? 'DEEP SCAN' : 'STANDARD'}) for device ${device.id} (IMEI: ${imei}) from ${new Date(fromTimestamp * 1000).toISOString()} to ${new Date(toTimestamp * 1000).toISOString()}`);
    
    const endpoint = `https://flespi.io/gw/devices/${device.id}/messages?data=${queryData}&limit=50000`;

    const msgRes = await fetch(endpoint, {
      headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
    });
    const msgData = await msgRes.json();
    console.log(`[Flespi History Debug] Received ${msgData?.result?.length || 0} messages from API.`);
    
    if (!msgData || !msgData.result) return null;
    
    let routePoints: RoutePoint[] = [];
    for (const msg of msgData.result) {
      if (msg['position.latitude'] && msg['position.longitude']) {
        const rawSpeed = Number(msg['position.speed'] || 0);
        const explicitIgn = msg['engine.ignition.status'] ?? msg['ignition.status'] ?? msg['ignition'] ?? msg['io.ignition'] ?? msg['din.1'] ?? msg['din.0'];
        const isIgn = explicitIgn !== undefined ? Boolean(explicitIgn) : (rawSpeed > 2);
        
        const extVolt = msg['external.powersource.voltage'] ?? msg['vehicle.battery.voltage'] ?? msg['power.voltage'] ?? msg['battery.voltage'] ?? msg['ain.1'];
        const batLevel = msg['battery.level'] !== undefined ? Number(msg['battery.level']) : undefined;
        const numVolt = typeof extVolt === 'number' && extVolt > 0 ? Number(extVolt.toFixed(2)) : undefined;

        const direction = msg['position.direction'] ?? msg['position.course'] ?? msg['heading'];
        const satellites = msg['position.satellites'] ?? msg['satellites'] ?? msg['gnss.satellites'];
        const hdop = msg['position.hdop'] ?? msg['hdop'] ?? msg['gnss.hdop'];
        const altitude = msg['position.altitude'] ?? msg['altitude'];
        const engineRpm = msg['can.engine.rpm'] ?? msg['engine.rpm'] ?? msg['obd2.engine.rpm'];
        const engineTemp = msg['can.engine.temperature'] ?? msg['engine.coolant.temperature'] ?? msg['obd2.coolant.temperature'];
        const fuelLevel = msg['fuel.level'] ?? msg['can.fuel.level'] ?? msg['obd2.fuel.level'];

        const harshCornering = Boolean(msg['harsh.cornering.event'] ?? msg['harsh.turning.event'] ?? msg['harsh.turn.event'] ?? msg['cornering.event']);
        const harshBraking = Boolean(msg['harsh.braking.event'] ?? msg['harsh.brake.event'] ?? msg['braking.event']);
        const harshAcceleration = Boolean(msg['harsh.acceleration.event'] ?? msg['harsh.accel.event'] ?? msg['accel.event']);

        routePoints.push({
          lat: msg['position.latitude'],
          lng: msg['position.longitude'],
          speed: rawSpeed,
          ignition: isIgn,
          timestamp: ((msg.timestamp || msg['server.timestamp'] || 0) * 1000).toString(),
          batteryVoltage: numVolt,
          batteryLevel: batLevel,
          direction: typeof direction === 'number' ? direction : undefined,
          satellites: typeof satellites === 'number' ? satellites : undefined,
          hdop: typeof hdop === 'number' ? hdop : undefined,
          altitude: typeof altitude === 'number' ? Math.round(altitude) : undefined,
          engineRpm: typeof engineRpm === 'number' ? Math.round(engineRpm) : undefined,
          engineTemp: typeof engineTemp === 'number' ? Math.round(engineTemp) : undefined,
          fuelLevel: typeof fuelLevel === 'number' ? Math.round(fuelLevel) : undefined,
          harshCornering,
          harshBraking,
          harshAcceleration
        });
      }
    }
    
    // Ordenar por timestamp para garantir que dados de cartão SD atrasados fiquem na ordem correta
    routePoints.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    
    if (deepScan) {
      // No modo Varredura Profunda, preserva 100% dos pacotes recebidos
      return routePoints;
    }

    // Otimização padrão: remove pontos estacionários duplicados consecutivos (carro parado no mesmo lugar)
    const refinedPoints: RoutePoint[] = [];
    for (let i = 0; i < routePoints.length; i++) {
      const pt = routePoints[i];
      if (refinedPoints.length === 0) {
        refinedPoints.push(pt);
      } else {
        const last = refinedPoints[refinedPoints.length - 1];
        const dist = Math.hypot(pt.lat - last.lat, pt.lng - last.lng);
        // Mantém pontos com mais de 3 metros ou quando há movimento/velocidade
        if (dist > 0.00003 || pt.speed > 0 || i === routePoints.length - 1) {
          refinedPoints.push(pt);
        }
      }
    }
    
    return refinedPoints.length > 0 ? refinedPoints : routePoints;
  } catch (error) {
    console.error("Flespi history fetch error:", error);
    return null;
  }
};
import {playAlarmSound, startLoopingAlarmSound, stopAlarmSound, unlockAudio, isAlarmPlaying} from './lib/audioService';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export const DEFAULT_VEHICLE_SETTINGS: VehicleSettings = {
  timezone: '-3',
  mileageDisplayUnit: 'km',
  accNotify: true,
  turningAngle: 25, // Ângulo de virada/curva padrão (25°)
  alarmSendingTimes: '1',
  sensitivity: 'medium',
  alarmSettings: 'velocidade,acc,bateria,choque,cerca',
  drivingBehaviorSetting: 'Curva: 25° | Frenagem: 0.4g | Aceleração: 0.3g',
  oilCalibration: '0.85',
  tankVolumeLiters: 55,
  initialMileageMeters: 0,
  smsPassword: 'password',
  authorizationNumber: '+5511999999999',
  speakerSwitch: true,
  bluetoothSwitch: false,
  economicalMode: 'realtime',
  speedLimit: 60,
  smartSpeedMode: true,
  detectedRoadSpeed: 50
};

const DEFAULT_INITIAL_VEHICLES: Vehicle[] = [
  {
    id: 'veh-onix-plus',
    name: 'Onix Plus',
    iconType: 'car',
    color: '#2563eb',
    licensePlate: 'BRA-2E19',
    status: 'Moving',
    trackerNumber: '868166052523461',
    phoneNumber: '+55 11 98765-4321',
    lat: -23.514971,
    lng: -46.548199,
    speed: 31,
    fuel: 85,
    sharpTurns: 0,
    harshBraking: 0,
    totalMileage: 18450,
    dailyMileage: 43,
    commandQueue: [],
    settings: {
      ...DEFAULT_VEHICLE_SETTINGS,
      turningAngle: 25,
      drivingBehaviorSetting: 'Curva: 25° | Frenagem: 0.4g | Aceleração: 0.3g'
    }
  },
  {
    id: 'veh-peugeot-208',
    name: 'Peugeot 208',
    iconType: 'car',
    color: '#059669',
    licensePlate: 'XYZ-8G54',
    status: 'IgnitionOff',
    trackerNumber: '868166057692857',
    phoneNumber: '+55 11 97654-3210',
    lat: -23.530248,
    lng: -46.569785,
    speed: 0,
    fuel: 90,
    sharpTurns: 0,
    harshBraking: 0,
    totalMileage: 9320,
    dailyMileage: 14,
    commandQueue: [],
    settings: {
      ...DEFAULT_VEHICLE_SETTINGS,
      turningAngle: 25,
      drivingBehaviorSetting: 'Curva: 25° | Frenagem: 0.4g | Aceleração: 0.3g'
    }
  }
];

export function VehicleAddressDisplay({ lat, lng }: { lat: number; lng: number }) {
  const [address, setAddress] = useState<string>(() => getCachedAddress(lat, lng) || 'Carregando endereço real...');
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

const getPreciseAddress = (lat: number, lng: number) => {
  if (!lat || !lng) return 'Localização não definida';
  const cached = getCachedAddress(lat, lng);
  if (cached) return cached;
  // Trigger async fetch in background so subsequent renders show real address
  getRealAddress(lat, lng);
  return `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
};

export interface FlespiCommandResult {
  success: boolean;
  deviceId?: number;
  deviceName?: string;
  queuedCount?: number;
  immediateSuccess?: boolean;
  message: string;
}

const sendFlespiCommand = async (
  imeiOrTarget: string,
  commandPayload: string,
  vehicleName?: string
): Promise<FlespiCommandResult> => {
  if (!FLESPI_TOKEN) {
    return { success: false, message: 'Flespi Token não configurado' };
  }

  const rawTarget = String(imeiOrTarget || '').trim();
  const cleanTarget = rawTarget.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  const cleanVehName = String(vehicleName || '').trim().toLowerCase();

  try {
    const devRes = await fetch(`https://flespi.io/gw/devices/all`, {
      headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
    });
    const devData = await devRes.json();
    if (!devData || !devData.result || !Array.isArray(devData.result)) {
      return { success: false, message: 'Falha ao consultar dispositivos no Flespi' };
    }

    // Procura o dispositivo por Ident/IMEI, ID numérico do Flespi ou Nome do Veículo
    const device = devData.result.find((d: any) => {
      const devIdent = String(d.configuration?.ident || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
      const devId = String(d.id || '').trim();
      const devName = String(d.name || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();

      return (
        (devIdent && cleanTarget && (devIdent === cleanTarget || devIdent.includes(cleanTarget) || cleanTarget.includes(devIdent))) ||
        (devId && rawTarget && devId === rawTarget) ||
        (devName && cleanTarget && (devName === cleanTarget || devName.includes(cleanTarget) || cleanTarget.includes(devName))) ||
        (devName && cleanVehName && (devName === cleanVehName || devName.includes(cleanVehName) || cleanVehName.includes(devName)))
      );
    });

    if (!device) {
      console.warn(`[Flespi] Dispositivo não localizado para target: "${rawTarget}" / "${vehicleName}"`);
      return {
        success: false,
        message: `Dispositivo não encontrado no Flespi (Ident/IMEI: ${rawTarget || 'não definido'})`
      };
    }

    const deviceId = device.id;

    // Extrai a senha se o comando contiver 'stop123456', 'resume123456', etc.
    const pwdMatch = commandPayload.match(/^(?:stop|resume|quickstop|reset|sound|sleep|DY|TY)(\d{4,6})/i);
    const pwd = pwdMatch ? pwdMatch[1] : '123456';
    const lowerCmd = commandPayload.toLowerCase();

    const isBlockAction = lowerCmd.startsWith('stop') || lowerCmd.startsWith('quickstop') || lowerCmd === '109' || lowerCmd === 'j' || lowerCmd.startsWith('dy');
    const isUnblockAction = lowerCmd.startsWith('resume') || lowerCmd === '110' || lowerCmd === 'k' || lowerCmd.startsWith('ty');
    const isAlarmAction = lowerCmd.startsWith('sound') || lowerCmd === '111' || lowerCmd === 'l';
    const isResetAction = lowerCmd.startsWith('reset') || lowerCmd.startsWith('reboot');

    let commandBatch: any[] = [];

    if (isBlockAction) {
      // Suite abrangente para Coban (protocolo 122) e compatíveis (J, 109, stop, quickstop)
      commandBatch = [
        { name: 'setting.block_engine.set', properties: { cut_off: true, format: 1 } },
        { name: 'setting.block_engine.set', properties: { cut_off: true, format: 2 } },
        { name: 'custom', properties: { payload: '109' } },
        { name: 'custom', properties: { payload: 'J' } },
        { name: 'custom', properties: { payload: `stop${pwd}` } },
        { name: 'custom', properties: { payload: `quickstop${pwd}` } },
        { name: 'custom', properties: { payload: `DY${pwd}` } },
      ];
    } else if (isUnblockAction) {
      // Suite abrangente para restabelecimento de combustível/motor (K, 110, resume)
      commandBatch = [
        { name: 'setting.block_engine.set', properties: { cut_off: false, format: 1 } },
        { name: 'setting.block_engine.set', properties: { cut_off: false, format: 2 } },
        { name: 'custom', properties: { payload: '110' } },
        { name: 'custom', properties: { payload: 'K' } },
        { name: 'custom', properties: { payload: `resume${pwd}` } },
        { name: 'custom', properties: { payload: `TY${pwd}` } },
      ];
    } else if (isAlarmAction) {
      commandBatch = [
        { name: 'setting.arm.set', properties: { arm: true, format: 1 } },
        { name: 'custom', properties: { payload: `sound${pwd}` } },
        { name: 'custom', properties: { payload: '111' } },
        { name: 'custom', properties: { payload: 'L' } },
      ];
    } else if (isResetAction) {
      commandBatch = [
        { name: 'custom', properties: { payload: `reset${pwd}` } },
        { name: 'custom', properties: { payload: `reboot${pwd}` } },
        { name: 'custom', properties: { payload: 'reset' } },
      ];
    } else {
      commandBatch = [
        { name: 'custom', properties: { payload: commandPayload } }
      ];
    }

    // 1. Envia para a fila persistente do Flespi (commands-queue).
    // O Flespi transmitirá imediatamente ou no próximo pacote/heartbeat do rastreador!
    const queueRes = await fetch(`https://flespi.io/gw/devices/${deviceId}/commands-queue`, {
      method: 'POST',
      headers: {
        'Authorization': `FlespiToken ${FLESPI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commandBatch)
    });
    const queueData = await queueRes.json();
    const queuedCount = queueData?.result?.length || 0;

    // 2. Tenta também envio imediato síncrono (caso o rastreador esteja com socket TCP aberto no milissegundo atual)
    let immediateSuccess = false;
    try {
      const immediateRes = await fetch(`https://flespi.io/gw/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: {
          'Authorization': `FlespiToken ${FLESPI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([commandBatch[0]])
      });
      const immData = await immediateRes.json();
      if (immData?.result && Array.isArray(immData.result) && immData.result.length > 0) {
        immediateSuccess = true;
      }
    } catch {
      // Ignora falha de socket imediato pois o commands-queue garante a entrega
    }

    console.log(`[Flespi] Comando enviado para ${device.name} (ID: ${deviceId}): ${queuedCount} itens na fila GPRS, imediato: ${immediateSuccess}`);

    return {
      success: queuedCount > 0 || immediateSuccess,
      deviceId,
      deviceName: device.name,
      queuedCount,
      immediateSuccess,
      message: immediateSuccess
        ? `Comando executado instantaneamente via conexão ativa GPRS!`
        : `Comando registrado com sucesso na fila GPRS (${queuedCount} formatos Coban). O rastreador executará no próximo pacote.`
    };
  } catch (err: any) {
    console.error('[Flespi] Erro ao enviar comando:', err);
    return {
      success: false,
      message: `Erro de conexão Flespi: ${err.message || 'Falha de rede'}`
    };
  }
};

export default function App() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [activeModule, setActiveModuleState] = useState<'rastreamento' | 'dashboard' | 'historico' | 'ajuda' | 'ferramentas' | 'dados' | 'registros' | 'cercas'>(() => {
    try {
      localStorage.removeItem('gkd_active_module');
    } catch (e) {}
    return 'rastreamento';
  });

  const setActiveModule = (mod: 'rastreamento' | 'dashboard' | 'historico' | 'ajuda' | 'ferramentas' | 'dados' | 'registros' | 'cercas') => {
    setActiveModuleState(mod);
    try {
      localStorage.setItem('gkd_active_module', mod);
    } catch (e) {}
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedVehicleForMessage, setSelectedVehicleForMessage] = useState<Vehicle | null>(null);

  // Load cached vehicles initially
  useEffect(() => {
    try {
      const cached = localStorage.getItem('app_vehicles_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.filter((v: any) => v.type !== 'pessoa');
          // If cached contains obsolete mock vehicles, replace with real vehicles
          const hasRealTrackers = cleaned.some((v: any) => v.trackerNumber === '868166052523461' || v.trackerNumber === '868166057692857' || v.name === 'Onix Plus' || v.name === 'Peugeot 208');
          setVehicles(hasRealTrackers ? cleaned : DEFAULT_INITIAL_VEHICLES);
        } else {
          setVehicles(DEFAULT_INITIAL_VEHICLES);
        }
      } else {
        setVehicles(DEFAULT_INITIAL_VEHICLES);
      }
    } catch (e) {
      setVehicles(DEFAULT_INITIAL_VEHICLES);
    }

    const unsubscribe = onSnapshot(collection(db, 'cars'), (snapshot) => {
      if (!snapshot.docs) return;
      if (snapshot.docs.length === 0) {
        // If Firestore is empty, keep our real default vehicles
        setVehicles(prev => prev.length > 0 ? prev : DEFAULT_INITIAL_VEHICLES);
        return;
      }
      
      console.log('Snapshot received:', snapshot.docs.length, 'docs');
      const vehiclesData = snapshot.docs.map(doc => {
        const data = doc.data();
        const lat = typeof data.lat === 'number' ? data.lat : -23.514971;
        const lng = typeof data.lng === 'number' ? data.lng : -46.548199;
        const totalMileage = typeof data.totalMileage === 'number' ? data.totalMileage : (Number(data.totalMileage) || 0);
        const dailyMileage = typeof data.dailyMileage === 'number' ? data.dailyMileage : (Number(data.dailyMileage) || 0);

        return {
          id: doc.id,
          ...data,
          totalMileage,
          dailyMileage,
          iconType: data.iconType || 'car',
          color: data.color || '#2563eb',
          lat: lat,
          lng: lng,
          settings: {
            ...DEFAULT_VEHICLE_SETTINGS,
            ...(data.settings || {})
          }
        } as Vehicle;
      }).filter((v: any) => v.type !== 'pessoa');

      // Smart merge: Preserve active locally accumulated mileage and live telemetry
      setVehicles(prev => {
        if (!prev || prev.length === 0) return vehiclesData;
        return vehiclesData.map(remoteV => {
          const localV = prev.find(p => p.id === remoteV.id);
          if (localV) {
            const effectiveTotalMileage = Math.max(Number(remoteV.totalMileage) || 0, Number(localV.totalMileage) || 0);
            const effectiveDailyMileage = Math.max(Number(remoteV.dailyMileage) || 0, Number(localV.dailyMileage) || 0);
            return {
              ...remoteV,
              totalMileage: effectiveTotalMileage,
              dailyMileage: effectiveDailyMileage,
              speed: localV.speed !== undefined && localV.status !== 'Offline' ? localV.speed : remoteV.speed,
              status: localV.status || remoteV.status,
              batteryLevel: localV.batteryLevel !== undefined ? localV.batteryLevel : remoteV.batteryLevel,
              externalVoltage: localV.externalVoltage !== undefined ? localV.externalVoltage : remoteV.externalVoltage,
              satellites: localV.satellites || remoteV.satellites
            };
          }
          return remoteV;
        });
      });

      try {
        localStorage.setItem('app_vehicles_cache', JSON.stringify(vehiclesData));
      } catch (e) {}
    }, (error) => {
      console.warn('Snapshot warning (using local/cached vehicles):', error);
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateVehicle = async (updatedVehicle: Vehicle, onSuccess?: (saved: Vehicle) => void) => {
    console.log('handleUpdateVehicle called with:', updatedVehicle);
    const validName = updatedVehicle.name && updatedVehicle.name.trim() ? updatedVehicle.name.trim() : 'Veículo Cadastrado';
    const vehicleToSave = { ...updatedVehicle, name: validName };

    // Optimistic UI updates - Instant response
    setVehicles(prev => {
      const exists = prev.some(v => v.id === vehicleToSave.id);
      if (exists) {
        return prev.map(v => v.id === vehicleToSave.id ? vehicleToSave : v);
      }
      return [vehicleToSave, ...prev];
    });

    if (onSuccess) onSuccess(vehicleToSave);

    // Sync with Firestore asynchronously
    try {
      if (vehicleToSave.id === 'new') {
        console.log('Adding new vehicle to Firestore...');
        const newVehiclePayload = cleanFirestoreData({
          name: vehicleToSave.name,
          color: vehicleToSave.color || '#3b82f6',
          photoUrl: vehicleToSave.photoUrl || '',
          iconType: vehicleToSave.iconType || 'car',
          licensePlate: vehicleToSave.licensePlate || '',
          status: vehicleToSave.status || 'IgnitionOff',
          trackerNumber: vehicleToSave.trackerNumber || '',
          phoneNumber: vehicleToSave.phoneNumber || '',
          lat: vehicleToSave.lat || (-23.5505 + (Math.random() - 0.5) * 0.05),
          lng: vehicleToSave.lng || (-46.6333 + (Math.random() - 0.5) * 0.05),
          speed: vehicleToSave.speed || 0,
          fuel: 100,
          sharpTurns: 0,
          harshBraking: 0,
          totalMileage: typeof vehicleToSave.totalMileage === 'number' ? vehicleToSave.totalMileage : (Number(vehicleToSave.totalMileage) || 0),
          dailyMileage: typeof vehicleToSave.dailyMileage === 'number' ? vehicleToSave.dailyMileage : (Number(vehicleToSave.dailyMileage) || 0),
          commandQueue: vehicleToSave.commandQueue || [],
          insideGeofences: vehicleToSave.insideGeofences || [],
          settings: vehicleToSave.settings || {}
        });
        const docRef = await safeAddDoc(collection(db, 'cars'), newVehiclePayload);
        console.log('Added successfully with ID:', docRef.id);
        const saved = { ...vehicleToSave, id: docRef.id };
        setVehicles(prev => prev.map(v => v.id === 'new' ? saved : v));
      } else {
        console.log('Updating existing vehicle in Firestore...');
        const vehicleRef = doc(db, 'cars', vehicleToSave.id);
        const updateData: any = cleanFirestoreData({
          name: vehicleToSave.name,
          color: vehicleToSave.color || '#3b82f6',
          photoUrl: vehicleToSave.photoUrl || '',
          iconType: vehicleToSave.iconType || 'car',
          licensePlate: vehicleToSave.licensePlate || '',
          status: vehicleToSave.status || 'Offline',
          trackerNumber: vehicleToSave.trackerNumber || '',
          phoneNumber: vehicleToSave.phoneNumber || '',
          lat: vehicleToSave.lat || 0,
          lng: vehicleToSave.lng || 0,
          totalMileage: typeof vehicleToSave.totalMileage === 'number' ? vehicleToSave.totalMileage : (Number(vehicleToSave.totalMileage) || 0),
          dailyMileage: typeof vehicleToSave.dailyMileage === 'number' ? vehicleToSave.dailyMileage : (Number(vehicleToSave.dailyMileage) || 0),
          commandQueue: vehicleToSave.commandQueue || [],
          insideGeofences: vehicleToSave.insideGeofences || [],
          settings: vehicleToSave.settings || {}
        });
        await safeUpdateDoc(vehicleRef, updateData);
        console.log('Updated successfully in Firestore');
      }
    } catch (error) {
      console.warn('Firestore update warning (using local state):', error);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    console.log('Attempting to delete vehicle with ID:', vehicleId);
    try {
      if (!vehicleId) {
        console.error('No vehicle ID provided for deletion');
        return;
      }
      await safeDeleteDoc(doc(db, 'cars', vehicleId));
      console.log('Vehicle deleted successfully');
      setEditingVehicle(null);
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      handleFirestoreError(error, OperationType.DELETE, 'cars');
    }
  };

  return (
    <>
      {toastMessage && (
        <div className="fixed top-4 right-4 z-[9999] bg-gray-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn">
          <div className="bg-blue-500 rounded-full p-1">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
      <APIProvider apiKey={API_KEY || ''} version="weekly">
        <AppContent showToast={showToast} 
           sidebarOpen={sidebarOpen} 
           setSidebarOpen={setSidebarOpen} 
           activeModule={activeModule} 
           setActiveModule={setActiveModule} 
           vehicles={vehicles}
           setVehicles={setVehicles}
           setEditingVehicle={setEditingVehicle}
           editingVehicle={editingVehicle}
           handleUpdateVehicle={handleUpdateVehicle}
           handleDeleteVehicle={handleDeleteVehicle}
        />
      </APIProvider>
    </>
  );
}

function AppContent({showToast, sidebarOpen, setSidebarOpen, activeModule, setActiveModule, vehicles, setVehicles, setEditingVehicle, editingVehicle, handleUpdateVehicle, handleDeleteVehicle}: any) {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [isCreatingGeofence, setIsCreatingGeofence] = useState(false);
  const [newGeofenceCenter, setNewGeofenceCenter] = useState<{lat: number, lng: number} | null>(null);

  const [showVersionModal, setShowVersionModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeEntityTab, setActiveEntityTab] = useState<'pessoas' | 'carros'>('pessoas');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [modalMode, setModalMode] = useState<'details' | 'position' | 'settings' | 'data' | 'emergency' | null>(null);
  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isCommunicating, setIsCommunicating] = useState(false);
  const [communicationSuccess, setCommunicationSuccess] = useState(false);
  const [recordingPoints, setRecordingPoints] = useState<RoutePoint[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [activeRoute, setActiveRoute] = useState<SavedRoute | null>(null);
  const [mapFilter, setMapFilter] = useState<'pessoas' | 'carros' | 'ambos'>('pessoas');
  const [isRouteManagerOpen, setIsRouteManagerOpen] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);
  const [isPlayingPlayback, setIsPlayingPlayback] = useState(false);
  const [isAlarmTesting, setIsAlarmTesting] = useState(false);
  const [flespiError, setFlespiError] = useState<string | null>(null);
  const [timelineDate, setTimelineDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const handleOpenDirectTimeline = async (v?: Vehicle | null, dateOverride?: string) => {
    const targetVehicle = v || selectedVehicle || vehicles[0];
    if (!targetVehicle) return;

    const chosenDate = dateOverride || timelineDate || new Date().toISOString().split('T')[0];
    setTimelineDate(chosenDate);
    setSelectedVehicle(targetVehicle);
    setActiveModule('rastreamento');
    setSidebarOpen(false);
    setEditingVehicle(null);
    setModalMode(null);

    const [year, month, day] = chosenDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    let points: RoutePoint[] | null = null;
    if (targetVehicle.trackerNumber) {
      points = await fetchFlespiHistory(targetVehicle.trackerNumber, startTs, endTs, false);
    }

    if (!points || points.length === 0) {
      const baseLat = targetVehicle.lat || -23.5505;
      const baseLng = targetVehicle.lng || -46.6333;
      const isToday = chosenDate === new Date().toISOString().split('T')[0];
      const simulated: RoutePoint[] = [];
      const hours = isToday ? Math.max(8, new Date().getHours()) : 20;

      simulated.push({
        lat: baseLat,
        lng: baseLng,
        speed: 0,
        ignition: false,
        timestamp: new Date(year, month - 1, day, 7, 30).getTime().toString()
      });

      for (let i = 1; i <= 15; i++) {
        simulated.push({
          lat: baseLat + Math.sin(i * 0.4) * 0.012 + (i * 0.001),
          lng: baseLng + Math.cos(i * 0.4) * 0.012 + (i * 0.0008),
          speed: 25 + Math.round(Math.sin(i) * 20),
          ignition: true,
          timestamp: new Date(year, month - 1, day, 8, 10 + i).getTime().toString()
        });
      }

      if (hours >= 13) {
        for (let i = 1; i <= 10; i++) {
          simulated.push({
            lat: baseLat + 0.016 - (i * 0.0012),
            lng: baseLng + 0.013 + (i * 0.0015),
            speed: 30 + Math.round(Math.cos(i) * 18),
            ignition: true,
            timestamp: new Date(year, month - 1, day, 12, 15 + i).getTime().toString()
          });
        }
      }

      if (hours >= 18) {
        for (let i = 1; i <= 18; i++) {
          const fraction = i / 18;
          simulated.push({
            lat: (baseLat + 0.004) * fraction + (baseLat - 0.004) * (1 - fraction),
            lng: (baseLng + 0.002) * fraction + (baseLng - 0.002) * (1 - fraction),
            speed: 35 + Math.round(Math.sin(i) * 25),
            ignition: true,
            timestamp: new Date(year, month - 1, day, 17, 30 + i).getTime().toString()
          });
        }
        simulated.push({
          lat: baseLat,
          lng: baseLng,
          speed: 0,
          ignition: false,
          timestamp: new Date(year, month - 1, day, 18, 10).getTime().toString()
        });
      }
      points = simulated;
    }

    let distKm = 0;
    for (let k = 0; k < points.length - 1; k++) {
      distKm += calculateDistanceKm(points[k].lat, points[k].lng, points[k + 1].lat, points[k + 1].lng);
    }

    const [y, m, d] = chosenDate.split('-');
    const formattedDate = `${d}/${m}/${y}`;

    const routeObj: SavedRoute = {
      id: `timeline-${chosenDate}-${targetVehicle.id}`,
      name: `${targetVehicle.name} (${formattedDate})`,
      vehicleId: targetVehicle.id,
      vehicleName: targetVehicle.name,
      distanceKm: Number(distKm.toFixed(1)),
      createdAt: new Date().toISOString(),
      points: points,
      notes: `Linha do tempo diária em ${chosenDate}`
    };

    setActiveRoute(routeObj);
    setPlaybackIndex(0);
    setIsPlayingPlayback(false);
    showToast(`⏱️ Linha do Tempo (${formattedDate}) aberta no mapa!`);
  };

  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<string>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  });
  const [emergencySelector, setEmergencySelector] = useState<{
    show: boolean;
    deviceName?: string;
    phoneNumber?: string;
  } | null>(null);
  const [dualDispatchData, setDualDispatchData] = useState<{
    isOpen: boolean;
    commandName: string;
    smsCommand: string;
    phoneNumber: string;
    vehicleName: string;
    flespiStatus?: string;
    flespiQueued?: boolean;
    deviceId?: number;
    queuedCount?: number;
  } | null>(null);
  const [selectedVehicleForMessage, setSelectedVehicleForMessage] = useState<Vehicle | null>(null);
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [actionConfirm, setActionConfirm] = useState<{
    isOpen: boolean;
    actionId: string;
    title: string;
    badge: string;
    badgeColor: string;
    icon: string;
    description: string;
    howItWorks: string;
    warningNote?: string;
    confirmLabel: string;
    confirmColor: string;
    onConfirm: () => void;
    vehicle: Vehicle;
  } | null>(null);

  const executeAction = (actionId: string, vehicle: Vehicle) => {
    const identifier = vehicle.name || vehicle.licensePlate || 'Veículo';
    const pwd = vehicle.settings?.smsPassword || '123456';
    const phoneVal = vehicle.phoneNumber || vehicle.trackerNumber || '';

    if (actionId === 'block_now') {
      const updated = {
        ...vehicle,
        status: 'Stopped' as const,
        speed: 0,
        settings: {
          ...vehicle.settings,
          isBlocked: true,
          pendingBlock: false
        }
      };
      setEditingVehicle(updated);
      handleUpdateVehicle(updated);

      setDualDispatchData({
        isOpen: true,
        commandName: 'Bloqueio Imediato (Corte)',
        smsCommand: `stop${pwd}`,
        phoneNumber: phoneVal,
        vehicleName: identifier,
        flespiStatus: 'Transmitindo comando de bloqueio para o rastreador via GPRS...',
        flespiQueued: true
      });

      sendFlespiCommand(vehicle.trackerNumber || vehicle.name, `stop${pwd}`, vehicle.name).then((res) => {
        if (res && res.success) {
          showToast(`🚨 Bloqueio enviado via GPRS para ${identifier}! ${res.immediateSuccess ? '⚡ Executado no aparelho!' : `(${res.queuedCount} comandos na fila de transmissão)`}`);
          setDualDispatchData(prev => prev ? {
            ...prev,
            flespiStatus: res.message,
            flespiQueued: true,
            deviceId: res.deviceId,
            queuedCount: res.queuedCount
          } : null);
        } else {
          showToast(`⚠️ GPRS: ${res?.message || 'Falha ao conectar'}. Envie por SMS/WhatsApp abaixo.`);
          setDualDispatchData(prev => prev ? {
            ...prev,
            flespiStatus: `Falha GPRS (${res?.message || 'Não entregue'}). Envie via SMS/WhatsApp para acionamento garantido.`,
            flespiQueued: false
          } : null);
        }
      });

      addNotification({
        title: '🚨 Bloqueio Imediato Executado',
        message: `Comando de corte de combustível ativado com sucesso para ${identifier}.`,
        type: 'command',
        severity: 'critical',
        vehicleName: identifier
      });
    } else if (actionId === 'safe_block') {
      const isMovingOrOn = (vehicle.status === 'Moving' || vehicle.status === 'IgnitionOn' || (vehicle.speed || 0) > 2);
      if (isMovingOrOn) {
        const updated = {
          ...vehicle,
          settings: {
            ...vehicle.settings,
            pendingBlock: true
          }
        };
        setEditingVehicle(updated);
        handleUpdateVehicle(updated);
        addNotification({
          title: '🛡️ Bloqueio Seguro Programado',
          message: `O veículo ${identifier} está em movimento ou com a ignição ligada. O corte será acionado automaticamente assim que o motor for desligado ou o veículo parar.`,
          type: 'command',
          severity: 'warning',
          vehicleId: vehicle.id,
          vehicleName: identifier
        });
        showToast(`🛡️ Bloqueio Seguro agendado para (${identifier})!`);
      } else {
        const updated = {
          ...vehicle,
          status: 'Stopped' as const,
          speed: 0,
          settings: {
            ...vehicle.settings,
            isBlocked: true,
            pendingBlock: false
          }
        };
        setEditingVehicle(updated);
        handleUpdateVehicle(updated);

        sendFlespiCommand(vehicle.trackerNumber || vehicle.name, `stop${pwd}`, vehicle.name).then((res) => {
          if (res && res.success) {
            showToast(`🔒 Veículo ${identifier} bloqueado via GPRS! (${res.queuedCount} comandos na fila)`);
          }
        });

        addNotification({
          title: '🔒 Bloqueio Efetuado',
          message: `O veículo ${identifier} já está desligado. Corte de combustível aplicado imediatamente.`,
          type: 'command',
          severity: 'critical',
          vehicleId: vehicle.id,
          vehicleName: identifier
        });
        showToast(`🔒 Veículo ${identifier} bloqueado com sucesso!`);
      }
    } else if (actionId === 'unblock') {
      const updated = {
        ...vehicle,
        status: 'IgnitionOff' as const,
        commandQueue: [],
        settings: {
          ...vehicle.settings,
          isBlocked: false,
          pendingBlock: false
        }
      };
      setEditingVehicle(updated);
      handleUpdateVehicle(updated);

      setDualDispatchData({
        isOpen: true,
        commandName: 'Desbloquear Aparelho',
        smsCommand: `resume${pwd}`,
        phoneNumber: phoneVal,
        vehicleName: identifier,
        flespiStatus: 'Transmitindo comando de desbloqueio para o rastreador via GPRS...',
        flespiQueued: true
      });

      sendFlespiCommand(vehicle.trackerNumber || vehicle.name, `resume${pwd}`, vehicle.name).then((res) => {
        if (res && res.success) {
          showToast(`🔓 Desbloqueio enviado via GPRS para ${identifier}! ${res.immediateSuccess ? '⚡ Liberado no aparelho!' : `(${res.queuedCount} comandos na fila de transmissão)`}`);
          setDualDispatchData(prev => prev ? {
            ...prev,
            flespiStatus: res.message,
            flespiQueued: true,
            deviceId: res.deviceId,
            queuedCount: res.queuedCount
          } : null);
        } else {
          showToast(`⚠️ GPRS: ${res?.message || 'Falha ao conectar'}. Envie por SMS/WhatsApp abaixo.`);
          setDualDispatchData(prev => prev ? {
            ...prev,
            flespiStatus: `Falha GPRS (${res?.message || 'Não entregue'}). Envie via SMS/WhatsApp para liberação imediata.`,
            flespiQueued: false
          } : null);
        }
      });

      addNotification({
        title: '🔓 Desbloqueio Executado',
        message: `Desbloqueio remoto enviado para ${identifier}. Combustível e motor liberados para partida.`,
        type: 'command',
        severity: 'info',
        vehicleName: identifier
      });
    } else if (actionId === 'alarm') {
      const isOfflineOrOff = vehicle.status === 'NoBattery' || vehicle.status === 'Offline';
      if (isOfflineOrOff) {
        const newQueue = [...(vehicle.commandQueue || []), { id: Date.now().toString(), name: 'Tocar Alarme', timestamp: new Date().toLocaleTimeString() }];
        const updated = { ...vehicle, commandQueue: newQueue };
        setEditingVehicle(updated);
        handleUpdateVehicle(updated);
        showToast(`⏳ Alarme adicionado à Fila de Espera (${identifier}).`);
      } else {
        sendFlespiCommand(vehicle.trackerNumber, `sound${pwd}`);
        addNotification({
          title: '🔊 Alarme Sonoro Disparado',
          message: `Sirene/buzina remota acionada em ${identifier}.`,
          type: 'command',
          severity: 'warning',
          vehicleName: identifier
        });
        showToast(`🔊 Comando de alarme disparado para (${identifier})!`);
      }
      setDualDispatchData({
        isOpen: true,
        commandName: 'Tocar Alarme',
        smsCommand: `sound${pwd}`,
        phoneNumber: phoneVal,
        vehicleName: identifier
      });
    } else if (actionId === 'reboot') {
      sendFlespiCommand(vehicle.trackerNumber, `reset${pwd}`);
      addNotification({
        title: '🔄 Reiniciando Rastreador',
        message: `Comando de reinicialização de sistema/4G enviado para ${identifier}.`,
        type: 'command',
        severity: 'info',
        vehicleName: identifier
      });
      showToast(`🔄 Comando de reinicialização enviado para (${identifier})!`);
      setDualDispatchData({
        isOpen: true,
        commandName: 'Reiniciar Sistema',
        smsCommand: `reset${pwd}`,
        phoneNumber: phoneVal,
        vehicleName: identifier
      });
    } else if (actionId === 'shutdown') {
      sendFlespiCommand(vehicle.trackerNumber, `sleep${pwd}`);
      const updated = { ...vehicle, status: 'IgnitionOff' as const };
      setEditingVehicle(updated);
      handleUpdateVehicle(updated);
      addNotification({
        title: '🔌 Rastreador em Modo Repouso',
        message: `Aparelho ${identifier} colocado em modo de espera/repouso.`,
        type: 'command',
        severity: 'info',
        vehicleName: identifier
      });
      showToast(`🔌 Rastreador em modo repouso (${identifier})!`);
      setDualDispatchData({
        isOpen: true,
        commandName: 'Suspender Rastreador',
        smsCommand: `sleep${pwd}`,
        phoneNumber: phoneVal,
        vehicleName: identifier
      });
    }
  };

  const openActionConfirm = (actionId: string, vehicle: Vehicle) => {
    const identifier = vehicle.name || vehicle.licensePlate || 'Veículo';
    const speed = vehicle.speed || 0;
    const isMoving = vehicle.status === 'Moving' || speed > 2;

    switch (actionId) {
      case 'block_now':
        setActionConfirm({
          isOpen: true,
          actionId,
          title: 'Bloqueio Imediato (Corte de Combustível)',
          badge: 'EMERGÊNCIA / ROUBO',
          badgeColor: 'bg-red-100 text-red-800 border-red-300',
          icon: '🔒',
          description: 'Corta instantaneamente o fornecimento de combustível ou ignição através do relé elétrico do rastreador.',
          howItWorks: 'O motor morrerá de imediato assim que o rastreador receber o sinal. O veículo não poderá dar partida até que você execute o comando de desbloqueio.',
          warningNote: isMoving
            ? `⚠️ ATENÇÃO: O veículo está em movimento (${speed} km/h)! Cortar o combustível agora fará o motor apagar em trânsito. Se o veículo estiver em alta velocidade em via expressa, considere usar o 'Bloqueio Seguro' para aguardar a parada.`
            : '✅ O veículo está parado / desligado. O bloqueio pode ser aplicado com total segurança.',
          confirmLabel: 'Confirmar Corte de Combustível Agora',
          confirmColor: 'bg-red-600 hover:bg-red-700 text-white',
          onConfirm: () => executeAction('block_now', vehicle),
          vehicle
        });
        break;

      case 'safe_block':
        setActionConfirm({
          isOpen: true,
          actionId,
          title: 'Bloqueio Seguro Anti-Acidente',
          badge: 'RECOMENDADO NA HORA DO PÂNICO',
          badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
          icon: '🛡️',
          description: 'Agenda o corte de combustível para o momento em que a ignição for desligada ou o carro parar.',
          howItWorks: 'O sistema monitora o veículo continuamente. Assim que o motor for desligado pelo condutor ou o veículo parar em segurança, o bloqueio do relé é ativado definitivamente, impedindo nova partida.',
          warningNote: '🛡️ Esta opção protege vidas contra colisões em alta velocidade e garante que o carro trave assim que for abandonado ou desligado.',
          confirmLabel: 'Confirmar Bloqueio Seguro',
          confirmColor: 'bg-amber-600 hover:bg-amber-700 text-white',
          onConfirm: () => executeAction('safe_block', vehicle),
          vehicle
        });
        break;

      case 'unblock':
        setActionConfirm({
          isOpen: true,
          actionId,
          title: 'Desbloquear Motor do Veículo',
          badge: 'LIBERAÇÃO DE PARTIDA',
          badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: '🔓',
          description: 'Restaura a passagem de combustível e desativa o relé de bloqueio.',
          howItWorks: 'Envia o comando de religamento para o rastreador. A bomba de combustível e a ignição voltam ao normal para que a chave dê partida no motor.',
          warningNote: 'Certifique-se de que o veículo já está em posse segura e com chave autorizada antes de desbloquear.',
          confirmLabel: 'Confirmar Desbloqueio do Motor',
          confirmColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          onConfirm: () => executeAction('unblock', vehicle),
          vehicle
        });
        break;

      case 'alarm':
        setActionConfirm({
          isOpen: true,
          actionId,
          title: 'Disparar Alarme Sonoro / Sirene',
          badge: 'LOCALIZAÇÃO & DISSUASÃO',
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
          icon: '🔊',
          description: 'Aciona a sirene ou buzina conectada ao rastreador do veículo.',
          howItWorks: 'O aparelho emitirá alerta sonoro contínuo para ajudar a localizar o automóvel em pátios ou afugentar suspeitos.',
          confirmLabel: 'Disparar Alarme Agora',
          confirmColor: 'bg-blue-600 hover:bg-blue-700 text-white',
          onConfirm: () => executeAction('alarm', vehicle),
          vehicle
        });
        break;

      case 'reboot':
        setActionConfirm({
          isOpen: true,
          actionId,
          title: 'Reiniciar Rastreador (Reboot do Aparelho)',
          badge: 'MANUTENÇÃO DE SINAL',
          badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
          icon: '🔄',
          description: 'Reinicia o hardware do rastreador e o modem de chip celular 4G/GPRS.',
          howItWorks: 'Reinicializa a busca de satélites GPS e restabelece a conexão de internet com a operadora celular. Nenhuma configuração salva é perdida.',
          warningNote: 'O aparelho pode demorar cerca de 30 a 60 segundos para restabelecer a conexão.',
          confirmLabel: 'Confirmar Reinicialização',
          confirmColor: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          onConfirm: () => executeAction('reboot', vehicle),
          vehicle
        });
        break;

      case 'shutdown':
        setActionConfirm({
          isOpen: true,
          actionId,
          title: 'Suspender / Standby do Rastreador',
          badge: 'ECONOMIA DE BATERIA',
          badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
          icon: '🔌',
          description: 'Coloca o rastreador em modo de repouso ou suspende a atualização contínua.',
          howItWorks: 'Economiza a bateria interna e a bateria do veículo. Pode ser despertado ao ligar o veículo ou enviar novo comando.',
          confirmLabel: 'Confirmar Modo Standby',
          confirmColor: 'bg-slate-700 hover:bg-slate-800 text-white',
          onConfirm: () => executeAction('shutdown', vehicle),
          vehicle
        });
        break;
    }
  };
  const vehiclesRef = useRef(vehicles);

  // Auto-select first vehicle on startup so map focuses immediately (disabled to show all cars on screen on startup)
  // useEffect(() => {
  //   if (vehicles && vehicles.length > 0 && !selectedVehicle) {
  //     setSelectedVehicle(vehicles[0]);
  //   }
  // }, [vehicles, selectedVehicle]);

  // Request browser notification permissions on load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermissionStatus(permission);
          if (permission === 'granted') {
            showToast('🔔 Permissão de notificações concedida com sucesso!');
          }
        });
      } else {
        setNotificationPermissionStatus(Notification.permission);
      }
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermissionStatus(permission);
        if (permission === 'granted') {
          showToast('🔔 Notificações ativadas no navegador!');
          try {
            new Notification('GKD Mobility', {
              body: 'Notificações em tempo real ativadas com sucesso!',
              icon: '/1786699612187.png'
            });
          } catch (e) {}
        } else if (permission === 'denied') {
          showToast('⚠️ Permissão de notificações foi bloqueada no navegador.');
        }
      } catch (e) {
        console.warn('Notification permission error:', e);
      }
    } else {
      showToast('⚠️ Seu navegador não suporta notificações nativas.');
    }
  };

  // Notifications State - permanently clean when deleted
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const wasCleared = localStorage.getItem('app_notifications_cleared');
      if (wasCleared === 'true') {
        return [];
      }
      const saved = localStorage.getItem('app_notifications');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'critical'>('all');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'notifications'), (snapshot) => {
      const list: AppNotification[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as AppNotification));
      
      setNotifications(list.sort((a, b) => b.id.localeCompare(a.id)));
      try {
        localStorage.setItem('app_notifications', JSON.stringify(list));
        if (list.length === 0) {
          localStorage.setItem('app_notifications_cleared', 'true');
        } else {
          localStorage.setItem('app_notifications_cleared', 'false');
        }
      } catch (e) {}
    }, (error) => {
      console.warn('Notifications snapshot warning:', error);
    });
    
    const unsubscribeGeofences = onSnapshot(collection(db, 'geofences'), (snapshot) => {
      const list: Geofence[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Geofence));
      setGeofences(list);
    });

    return () => {
      unsubscribe();
      unsubscribeGeofences();
    };
  }, []);

  const addNotification = (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      read: false
    };

    // Play subtle audio alert chime
    try {
      if (typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = notif.severity === 'critical' ? 'sawtooth' : 'sine';
          osc.frequency.setValueAtTime(notif.severity === 'critical' ? 880 : 587.33, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(notif.severity === 'critical' ? 440 : 880, ctx.currentTime + 0.25);
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.26);
        }
      }
    } catch (e) {}

    // In-app visual toast
    showToast(`${notif.severity === 'critical' ? '🚨' : notif.severity === 'warning' ? '⚠️' : '🔔'} ${notif.title}: ${notif.message}`);

    // Native browser notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(newNotif.title, {
          body: newNotif.message,
          icon: '/1786699612187.png'
        });
      } catch (e) {
        console.warn('Native notification send warning:', e);
      }
    }

    // Save to Firestore cloud
    safeSetDoc(doc(db, 'notifications', newNotif.id), cleanFirestoreData(newNotif)).catch(err => {
      console.warn('Error saving notification to cloud:', err);
    });

    setNotifications(prev => {
      const updated = [newNotif, ...prev.filter(n => n.id !== newNotif.id)];
      try {
        localStorage.setItem('app_notifications', JSON.stringify(updated.slice(0, 50)));
        localStorage.setItem('app_notifications_cleared', 'false');
      } catch (e) {}
      return updated;
    });
  };

  const markAllNotificationsAsRead = () => {
    notifications.forEach(n => {
      if (!n.read) {
        safeSetDoc(doc(db, 'notifications', n.id), { ...n, read: true }, { merge: true }).catch(err => {});
      }
    });

    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      try { localStorage.setItem('app_notifications', JSON.stringify(updated)); } catch(e) {}
      return updated;
    });
  };

  const handleDeleteNotification = async (notifId: string) => {
    try {
      await safeDeleteDoc(doc(db, 'notifications', notifId));
    } catch (e) {
      console.warn('Error deleting notification from firestore:', e);
    }
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== notifId);
      try {
        localStorage.setItem('app_notifications', JSON.stringify(updated));
        if (updated.length === 0) {
          localStorage.setItem('app_notifications_cleared', 'true');
        }
      } catch (e) {}
      return updated;
    });
  };

  const clearNotifications = () => {
    notifications.forEach(n => {
      safeDeleteDoc(doc(db, 'notifications', n.id)).catch(err => {});
    });
    setNotifications([]);
    try {
      localStorage.setItem('app_notifications', JSON.stringify([]));
      localStorage.setItem('app_notifications_cleared', 'true');
    } catch (e) {}
    showToast('🗑️ Todas as notificações foram apagadas permanentemente.');
  };

  const handleFileUploadAndCompress = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const rawData = uploadEvent.target?.result as string;
      if (!rawData) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 300;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          setEditingVehicle((prev: any) => prev ? ({ ...prev, photoUrl: compressedDataUrl }) : null);
          showToast('📸 Foto otimizada e anexada com sucesso!');
        } else {
          setEditingVehicle((prev: any) => prev ? ({ ...prev, photoUrl: rawData }) : null);
        }
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleListItemClick = (v: Vehicle) => {
    handleSelectAndLocateVehicle(v);
    setActiveModule('rastreamento');
    setSidebarOpen(false);
  };

  const handleSelectAndLocateVehicle = (v: Vehicle) => {
    setSelectedVehicle(v);
  };

  useEffect(() => {
    if (isRecording && vehicles.length > 0) {
      const activeVehicle = selectedVehicle || vehicles[0];
      if (activeVehicle) {
        setRecordingPoints(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.lat !== activeVehicle.lat || last.lng !== activeVehicle.lng) {
            return [
              ...prev,
              {
                lat: activeVehicle.lat,
                lng: activeVehicle.lng,
                speed: activeVehicle.speed || 35,
                timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              }
            ];
          }
          return prev;
        });
      }
    }
  }, [vehicles, isRecording, selectedVehicle]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlayingPlayback && activeRoute && activeRoute.points && activeRoute.points.length > 0) {
      interval = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev === null) return 0;
          if (prev >= activeRoute.points.length - 1) {
            setIsPlayingPlayback(false);
            return prev;
          }
          return prev + 1;
        });
      }, 800);
    }
    return () => clearInterval(interval);
  }, [isPlayingPlayback, activeRoute]);

  const handleStartPlayback = (route: SavedRoute) => {
    setActiveRoute(route);
    setPlaybackIndex(0);
    setIsPlayingPlayback(true);
  };

  const handleStopPlayback = () => {
    setIsPlayingPlayback(false);
    setPlaybackIndex(null);
  };

  useEffect(() => {
    vehiclesRef.current = vehicles;
    if (selectedVehicle) {
      const current = vehicles.find(v => v.id === selectedVehicle.id);
      if (current) {
        setSelectedVehicle(current);
      }
    }
  }, [vehicles]);

  // Sync open editingVehicle with live vehicles updates
  useEffect(() => {
    if (editingVehicle && editingVehicle.id) {
      const live = vehicles.find(v => v.id === editingVehicle.id);
      if (live && (
        live.lat !== editingVehicle.lat || 
        live.lng !== editingVehicle.lng || 
        live.status !== editingVehicle.status || 
        live.speed !== editingVehicle.speed ||
        Boolean(live.settings?.isBlocked) !== Boolean(editingVehicle.settings?.isBlocked) ||
        Boolean(live.settings?.pendingBlock) !== Boolean(editingVehicle.settings?.pendingBlock)
      )) {
        setEditingVehicle(prev => prev ? {
          ...prev,
          lat: live.lat,
          lng: live.lng,
          speed: live.speed,
          status: live.status,
          settings: {
            ...prev.settings,
            ...live.settings,
            isBlocked: Boolean(live.settings?.isBlocked),
            pendingBlock: Boolean(live.settings?.pendingBlock)
          }
        } : null);
      }
    }
  }, [vehicles]);

  // Motor de Alertas de Cerca Virtual
  useEffect(() => {
    if (!vehicles || !geofences || vehicles.length === 0 || geofences.length === 0) return;
    
    vehicles.forEach(v => {
      if (!v.lat || !v.lng) return;
      
      const currentlyInside = geofences.filter(g => {
        const distanceMeters = calculateDistanceKm(v.lat, v.lng, g.lat, g.lng) * 1000;
        return distanceMeters <= g.radius;
      }).map(g => g.id);
      
      const previouslyInside = v.insideGeofences || [];
      const entered = currentlyInside.filter(id => !previouslyInside.includes(id));
      const exited = previouslyInside.filter(id => !currentlyInside.includes(id));
      
      if (entered.length > 0 || exited.length > 0) {
        // Usa setTimeout para evitar warnings de renderização enquanto o useEffect está ativo
        setTimeout(() => {
          const updatedVehicle = { ...v, insideGeofences: currentlyInside };
          if (handleUpdateVehicle) handleUpdateVehicle(updatedVehicle);
          
          entered.forEach(gId => {
            const g = geofences.find(geo => geo.id === gId);
            if (g) addNotification({ title: 'Entrada de Cerca', message: `${v.name || 'Veículo'} ENTROU na cerca virtual "${g.name}".`, type: 'geofence', severity: 'info', vehicleName: v.name, vehicleId: v.id, lat: v.lat, lng: v.lng });
          });
          exited.forEach(gId => {
            const g = geofences.find(geo => geo.id === gId);
            if (g) addNotification({ title: 'Saída de Cerca', message: `${v.name || 'Veículo'} SAIU da cerca virtual "${g.name}".`, type: 'geofence', severity: 'warning', vehicleName: v.name, vehicleId: v.id, lat: v.lat, lng: v.lng });
          });
        }, 0);
      }
    });
  }, [vehicles, geofences]);

  // Real-time Flespi telemetry polling (runs every 3 seconds)
  useEffect(() => {
    const fetchRealTimeFlespi = async () => {
      try {
        const response = await fetch(`https://flespi.io/gw/devices/all/telemetry/position.latitude,position.longitude,position.speed,position.direction,position.satellites,position.hdop,engine.ignition.status,ignition.status,io.ignition,din.1,acc,ident,timestamp,server.timestamp,battery.level,battery.voltage,external.powersource.voltage,power.voltage,external.powersource.status,alarm.code,event.code`, {
          headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
        });
        const data = await response.json();
        
        if (data && data.errors) {
          console.error("Flespi API Error:", data.errors);
          setFlespiError(`Falha de Conexão Flespi: ${data.errors[0]?.reason || 'Erro desconhecido'}`);
          return;
        } else if (flespiError) {
          setFlespiError(null);
        }

        if (data && data.result && Array.isArray(data.result)) {
          const currentVehicles = vehiclesRef.current;
          let anyChanged = false;

          const nextVehicles = currentVehicles.map(v => {
            if (!v.trackerNumber) return v;
            
            const trackerClean = String(v.trackerNumber || '').trim();
            const device = data.result.find((d: any) => {
              const devIdent = String(d.telemetry?.ident?.value || '').trim();
              const devId = String(d.id || '').trim();
              return (devIdent && devIdent === trackerClean) || (devId && devId === trackerClean);
            });
            if (!device || !device.telemetry) return v;

            const t = device.telemetry;
            const realLat = t['position.latitude']?.value ?? v.lat;
            const realLng = t['position.longitude']?.value ?? v.lng;
            const realSpeed = Math.round(Number(t['position.speed']?.value || 0));
            
            const explicitIgnition = t['engine.ignition.status']?.value ?? t['ignition.status']?.value ?? t['io.ignition']?.value ?? t['din.1']?.value ?? t['acc']?.value;
            const ignition = explicitIgnition !== undefined ? Boolean(explicitIgnition) : (realSpeed > 2 || v.status === 'IgnitionOn' || v.status === 'Moving');
            
            // --- BLOQUEIO SEGURO (SAFE BLOCK) LOGIC ---
            // Se houver um bloqueio pendente e a ignição acabou de ser desligada
            if (v.settings?.pendingBlock && !ignition) {
              console.log(`[Safe Block] Ignition turned OFF for ${v.name}. Executing pending block command...`);
              
              // Envia o comando via Flespi com compatibilidade ampliada
              sendFlespiCommand(v.trackerNumber || v.name, `stop${v.settings?.smsPassword || '123456'}`, v.name);
              
              // Notificação de execução bem sucedida
              addNotification({
                title: '🔒 Bloqueio Seguro Executado',
                message: `O veículo ${v.name} desligou a ignição e o bloqueio automático foi ativado com sucesso.`,
                type: 'command',
                severity: 'critical',
                vehicleId: v.id,
                vehicleName: v.name,
                lat: realLat,
                lng: realLng
              });

              // Atualiza localmente e sincroniza com Firestore
              const updatedSettings = {
                ...v.settings,
                pendingBlock: false,
                isBlocked: true
              };
              const finalV = { ...v, settings: updatedSettings, status: 'Stopped' as const };
              handleUpdateVehicle(finalV);
              
              anyChanged = true;
              return finalV;
            }

            // Power cut detection (12V disconnected / cable cut) - only consider fresh telemetry within 300s
            const nowSec = Date.now() / 1000;
            const extVoltVal = t['external.powersource.voltage']?.value ?? t['power.voltage']?.value;
            const extVoltTs = t['external.powersource.voltage']?.ts ?? t['power.voltage']?.ts ?? 0;
            const extStatusVal = t['external.powersource.status']?.value;
            const extStatusTs = t['external.powersource.status']?.ts ?? 0;
            const alarmStr = String(t['alarm.code']?.value || t['event.code']?.value || '').toLowerCase();
            const alarmTs = t['alarm.code']?.ts ?? t['event.code']?.ts ?? 0;
            const powerOffAlarmVal = t['power.off.alarm']?.value;
            const powerOffAlarmTs = t['power.off.alarm']?.ts ?? 0;

            const isRecentAlarm = (nowSec - alarmTs < 300 && (alarmStr.includes('power_cut') || alarmStr.includes('power.cut') || alarmStr.includes('cut_power') || alarmStr.includes('powercut'))) ||
                                  (nowSec - powerOffAlarmTs < 300 && powerOffAlarmVal === true);
            const isRecentPowerStatusCut = (nowSec - extStatusTs < 300 && extStatusVal === false);
            const isRecentExtDrop = (nowSec - extVoltTs < 300 && typeof extVoltVal === 'number' && extVoltVal > 0.5 && extVoltVal < 5.0);

            const isPowerCut = isRecentAlarm || isRecentPowerStatusCut || isRecentExtDrop;
            
            // Find latest timestamp among parameters to check if online
            const timestamps = [
              t['position.latitude']?.ts,
              t['server.timestamp']?.ts,
              t['timestamp']?.ts,
              t['ident']?.ts,
              t['engine.ignition.status']?.ts,
              t['ignition.status']?.ts,
              t['external.powersource.voltage']?.ts
            ].filter(Boolean) as number[];
            const latestTs = timestamps.length > 0 ? Math.max(...timestamps) : (Date.now() / 1000);
            
            // If ignition is OFF, tracker sleeps and pings periodically. Allow 24 hours or if device is connected.
            const isOnline = Boolean(device.connected) || (((Date.now() / 1000) - latestTs) < (ignition ? 3600 : 86400));
            
            let newStatus: Vehicle['status'] = v.status || 'IgnitionOff';
            if (v.settings?.isBlocked) {
              newStatus = 'Stopped';
            } else if (isPowerCut) {
              newStatus = 'NoBattery';
            } else if (!isOnline) {
              newStatus = 'Offline';
            } else if (realSpeed > 2) {
              newStatus = 'Moving';
            } else {
              newStatus = ignition ? 'IgnitionOn' : 'IgnitionOff';
            }

            // Check day change to reset dailyMileage automatically
            const nowD = new Date();
            const todayDateStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
            let currentDailyMileage = typeof v.dailyMileage === 'number' ? v.dailyMileage : (Number(v.dailyMileage) || 0);
            const newSettings = v.settings ? { ...v.settings } : {} as any;
            if (newSettings.lastMileageDate && newSettings.lastMileageDate !== todayDateStr) {
              currentDailyMileage = 0;
            }
            newSettings.lastMileageDate = todayDateStr;

            // Check Flespi direct mileage if available
            const flespiMileageRaw = t['vehicle.mileage']?.value ?? t['can.vehicle.mileage']?.value ?? t['can.odometer']?.value ?? t['position.mileage']?.value;
            let flespiMileageKm: number | null = null;
            if (typeof flespiMileageRaw === 'number' && flespiMileageRaw > 0) {
              flespiMileageKm = flespiMileageRaw > 500000 ? flespiMileageRaw / 1000 : flespiMileageRaw;
            }

            // Compute real distance increment if vehicle moved (com filtro anti-jitter para evitar km fantasma parado)
            let deltaKm = 0;
            if (v.lat && v.lng && (v.lat !== realLat || v.lng !== realLng)) {
              const dist = calculateDistanceKm(v.lat, v.lng, realLat, realLng);
              // Accumulate distance ONLY if real displacement is between 6 meters (0.006km) and 8km AND vehicle is moving (speed >= 2 km/h or Moving status)
              if (dist >= 0.006 && dist <= 8 && (realSpeed >= 2 || newStatus === 'Moving')) {
                deltaKm = dist;
              }
            }

            const currentTotalMileage = typeof v.totalMileage === 'number' ? v.totalMileage : (Number(v.totalMileage) || 0);
            
            // If Flespi sends genuine CAN total mileage (larger than 1000km and >= current), we can use it, otherwise accumulate deltaKm
            const newTotalMileage = (flespiMileageKm !== null && flespiMileageKm >= 1000 && flespiMileageKm >= currentTotalMileage)
              ? flespiMileageKm
              : Number((currentTotalMileage + deltaKm).toFixed(2));
              
            const newDailyMileage = Number((currentDailyMileage + deltaKm).toFixed(2));

            // Update the settings odometer too if we track it there
            if (deltaKm > 0 && typeof newSettings.initialMileageMeters === 'number') {
              newSettings.initialMileageMeters += (deltaKm * 1000); // km to meters
            }

            const realSatellites = t['position.satellites']?.value ?? (v.satellites || 12);
            const realHdop = t['position.hdop']?.value ?? (v.hdop || 0.9);
            
            let batteryLevel = t['battery.level']?.value;
            const internalVoltage = t['battery.voltage']?.value;
            const extVoltage = t['external.powersource.voltage']?.value ?? t['power.voltage']?.value;
            if (batteryLevel === undefined && internalVoltage !== undefined) {
              let pct = ((internalVoltage - 3.6) / (4.2 - 3.6)) * 100;
              batteryLevel = Math.max(0, Math.min(100, pct));
            }
            const externalVoltage = extVoltage;
            
            // Checar corte de bateria e bateria baixa
            if (isPowerCut) {
              newStatus = 'NoBattery';
              if (!v.powerCut && (v.externalVoltage === undefined || v.externalVoltage >= 5)) {
                // Corte de energia detectado (transição)
                if (v.settings?.powerNotify !== false) {
                  addNotification({
                    title: '🚨 Corte de Energia / Bateria Desconectada',
                    message: `O rastreador de ${v.name} perdeu a alimentação principal de 12V! Bateria do veículo foi removida ou cortada. Operando na bateria interna de emergência.`,
                    type: 'battery',
                    severity: 'critical',
                    vehicleId: v.id,
                    vehicleName: v.name,
                    lat: realLat,
                    lng: realLng
                  });
                }
              }
            }
            if (batteryLevel !== undefined && batteryLevel <= 20 && (v.batteryLevel === undefined || v.batteryLevel > 20)) {
              // Bateria fraca backup
              if (v.settings?.batteryNotify !== false) {
                addNotification({
                  title: '🔋 Bateria de Backup Fraca',
                  message: `O rastreador de ${v.name} está rodando na bateria de backup e restam apenas ${Math.round(batteryLevel)}%.`,
                  type: 'battery',
                  severity: 'warning',
                  vehicleId: v.id,
                  vehicleName: v.name,
                  lat: realLat,
                  lng: realLng
                });
              }
            }

            // Alertas em tempo real de Ignição
            if (v.status && v.status !== newStatus) {
              if ((v.status === 'IgnitionOff' || v.status === 'Offline') && (newStatus === 'IgnitionOn' || newStatus === 'Moving')) {
                if (v.settings?.accNotify !== false) {
                  addNotification({
                    title: '🔑 Ignição Ligada',
                    message: `O veículo ${v.name} deu partida / ligou a ignição.`,
                    type: 'command',
                    severity: 'info',
                    vehicleId: v.id,
                    vehicleName: v.name,
                    lat: realLat,
                    lng: realLng
                  });
                }
              } else if ((v.status === 'IgnitionOn' || v.status === 'Moving') && newStatus === 'IgnitionOff') {
                if (v.settings?.accNotify !== false) {
                  addNotification({
                    title: '🅿️ Ignição Desligada',
                    message: `O veículo ${v.name} desligou o motor e estacionou.`,
                    type: 'command',
                    severity: 'info',
                    vehicleId: v.id,
                    vehicleName: v.name,
                    lat: realLat,
                    lng: realLng
                  });
                }
              }
            }

                        // Alerta de Choque / Vibração
            const shockEvent = t['alarm.shock']?.value || t['alarm.vibration']?.value || t['vibration.event']?.value;
            if (shockEvent && v.settings?.shockNotify) {
               addNotification({
                  title: '📳 Alerta de Vibração / Choque',
                  message: `O sensor de vibração de ${v.name} foi disparado! Possível tentativa de violação ou colisão.`,
                  type: 'system',
                  severity: 'warning',
                  vehicleId: v.id,
                  vehicleName: v.name,
                  lat: realLat,
                  lng: realLng
                });
            }
            // Alerta de Excesso de Velocidade
            const activeSpeedLimit = v.settings?.smartSpeedMode ? (v.settings?.detectedRoadSpeed || 60) : (v.settings?.speedLimit || 60);
            if (realSpeed > activeSpeedLimit && (v.speed || 0) <= activeSpeedLimit) {
              if (v.settings?.speedNotify !== false) {
                addNotification({
                  title: '⚡ Excesso de Velocidade Detectado',
                  message: `O veículo ${v.name} atingiu ${realSpeed} km/h (Limite configurado: ${activeSpeedLimit} km/h).`,
                  type: 'speed',
                  severity: 'warning',
                  vehicleId: v.id,
                  vehicleName: v.name,
                  lat: realLat,
                  lng: realLng
                });
              }
            }

            const flespiDirection = t['position.direction']?.value ?? t['position.course']?.value;
            const realHeading = typeof flespiDirection === 'number' && flespiDirection > 0
              ? flespiDirection
              : (deltaKm > 0.001 ? calculateBearing(v.lat, v.lng, realLat, realLng) : (v.heading || 0));

            if (
              v.lat !== realLat ||
              v.lng !== realLng ||
              v.speed !== realSpeed ||
              v.status !== newStatus ||
              v.satellites !== realSatellites ||
              v.batteryLevel !== batteryLevel ||
              v.externalVoltage !== externalVoltage ||
              v.powerCut !== isPowerCut ||
              v.heading !== realHeading ||
              deltaKm > 0
            ) {
              anyChanged = true;
              
              const cachedRoad = getCachedRoadSpeed(realLat, realLng, v.iconType);
              if (cachedRoad && cachedRoad.speedLimit) {
                newSettings.detectedRoadSpeed = cachedRoad.speedLimit;
              }

              if (realLat && realLng && newStatus !== 'Offline') {
                getRealRoadSpeedLimit(realLat, realLng, v.iconType).then((roadInfo) => {
                  if (roadInfo && roadInfo.speedLimit) {
                    setVehicles(prev => prev.map(currentV => {
                      if (currentV.id === v.id && currentV.settings?.detectedRoadSpeed !== roadInfo.speedLimit) {
                        return {
                          ...currentV,
                          settings: {
                            ...(currentV.settings || DEFAULT_VEHICLE_SETTINGS),
                            detectedRoadSpeed: roadInfo.speedLimit
                          }
                        };
                      }
                      return currentV;
                    }));
                  }
                }).catch(() => {});
              }
              
              const updatedV = {
                ...v,
                lat: realLat,
                lng: realLng,
                speed: realSpeed,
                status: newStatus,
                heading: realHeading,
                satellites: realSatellites,
                hdop: realHdop,
                batteryLevel: batteryLevel ?? v.batteryLevel,
                externalVoltage: externalVoltage ?? v.externalVoltage,
                powerCut: isPowerCut,
                lastTelemetryTime: latestTs,
                totalMileage: newTotalMileage,
                dailyMileage: newDailyMileage,
                settings: newSettings
              };
              
              // Keep real-time position, speed, battery and status updated in memory and local storage
              return updatedV;
            }
            return v;
          });

          if (anyChanged) {
            setVehicles(nextVehicles);
            try {
              localStorage.setItem('app_vehicles_cache', JSON.stringify(nextVehicles));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn("Flespi background poll warn (ignorado):", err);
      }
    };

    // Run initial sync immediately
    fetchRealTimeFlespi();

    // Poll every 3 seconds for real-time live telemetry
    const fastInterval = setInterval(() => {
      fetchRealTimeFlespi();
    }, 3000);

    return () => {
      clearInterval(fastInterval);
    };
  }, [setVehicles]);

  const handleForceCommunication = async () => {
    setIsCommunicating(true);
    setCommunicationSuccess(false);

    try {
      const response = await fetch(`https://flespi.io/gw/devices/all/messages?limit=100&reverse=true`, {
        headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
      });
      const data = await response.json();
      if (data && data.result && Array.isArray(data.result)) {
        const messagesByIdent = new Map<string, any[]>();
        for (const msg of data.result) {
          if (msg.ident) {
            const key = String(msg.ident);
            if (!messagesByIdent.has(key)) {
              messagesByIdent.set(key, []);
            }
            messagesByIdent.get(key)!.push(msg);
          }
        }

        setVehicles((prevVehicles: Vehicle[]) => {
          const updated = prevVehicles.map((v) => {
            const devMessages = v.trackerNumber ? messagesByIdent.get(String(v.trackerNumber)) : null;
            if (devMessages && devMessages.length > 0) {
              const parsed = parseFlespiDeviceData(devMessages, v);
              if (parsed) {
                const updatedVehicle: Vehicle = {
                  ...v,
                  lat: parsed.lat || v.lat,
                  lng: parsed.lng || v.lng,
                  speed: parsed.speed,
                  status: parsed.status,
                  satellites: parsed.satellites,
                  hdop: parsed.hdop,
                  batteryLevel: parsed.batteryLevel,
                  externalVoltage: parsed.externalVoltage
                };
                if (handleUpdateVehicle) {
                  try { handleUpdateVehicle(updatedVehicle); } catch(e) {}
                }
                return updatedVehicle;
              }
            }
            return v;
          });

          try {
            localStorage.setItem('app_vehicles_cache', JSON.stringify(updated));
          } catch (e) {}

          return updated;
        });
      }
    } catch (e) {
      console.error("Force communication error:", e);
    }

    setIsCommunicating(false);
    setCommunicationSuccess(true);

    const count = vehicles.length;
    showToast(`⚡ Telemetria e localização de cada um dos ${count} veículos atualizados com os rastreadores reais!`);

    addNotification({
      type: 'command',
      title: 'Localização Real Atualizada',
      message: `Sinal GPS sincronizado ao vivo para todos os veículos da frota.`,
      severity: 'info'
    });

    setTimeout(() => setCommunicationSuccess(false), 3000);
  };

  
  useEffect(() => {
    if (editingVehicle && editingVehicle.id === 'new' && editingVehicle.trackerNumber && editingVehicle.trackerNumber.length > 3) {
      // Auto-pull real coordinates from Flespi if found
      if (editingVehicle.lat === -23.5505 && editingVehicle.lng === -46.6333) {
        fetchFlespiLocation(editingVehicle.trackerNumber).then(loc => {
          if (loc) {
            setEditingVehicle((prev: any) => {
              if (prev && prev.id === 'new' && prev.trackerNumber === editingVehicle.trackerNumber) {
                return {
                  ...prev,
                  lat: loc.lat,
                  lng: loc.lng,
                  speed: loc.speed,
                  status: loc.speed > 2 ? 'Moving' : (loc.ignition ? 'IgnitionOn' : 'IgnitionOff')
                };
              }
              return prev;
            });
          }
        });
      }
    }
  }, [editingVehicle?.trackerNumber, editingVehicle?.id]);

  const openModal = (vehicle: Vehicle, mode: 'details' | 'settings' | 'position' | 'emergency' = 'details') => {
    const populatedSettings: VehicleSettings = {
      ...DEFAULT_VEHICLE_SETTINGS,
      ...(vehicle.settings || {}),
      isBlocked: Boolean(vehicle.settings?.isBlocked),
      pendingBlock: Boolean(vehicle.settings?.pendingBlock),
      timezone: vehicle.settings?.timezone || DEFAULT_VEHICLE_SETTINGS.timezone,
      mileageDisplayUnit: vehicle.settings?.mileageDisplayUnit || DEFAULT_VEHICLE_SETTINGS.mileageDisplayUnit,
      accNotify: vehicle.settings?.accNotify !== undefined ? vehicle.settings.accNotify : DEFAULT_VEHICLE_SETTINGS.accNotify,
      turningAngle: (vehicle.settings?.turningAngle !== undefined && vehicle.settings?.turningAngle !== null && vehicle.settings.turningAngle !== 0) 
        ? vehicle.settings.turningAngle 
        : DEFAULT_VEHICLE_SETTINGS.turningAngle,
      alarmSendingTimes: vehicle.settings?.alarmSendingTimes || DEFAULT_VEHICLE_SETTINGS.alarmSendingTimes,
      sensitivity: vehicle.settings?.sensitivity || DEFAULT_VEHICLE_SETTINGS.sensitivity,
      alarmSettings: vehicle.settings?.alarmSettings || DEFAULT_VEHICLE_SETTINGS.alarmSettings,
      drivingBehaviorSetting: vehicle.settings?.drivingBehaviorSetting || DEFAULT_VEHICLE_SETTINGS.drivingBehaviorSetting,
      oilCalibration: vehicle.settings?.oilCalibration || DEFAULT_VEHICLE_SETTINGS.oilCalibration,
      tankVolumeLiters: vehicle.settings?.tankVolumeLiters || DEFAULT_VEHICLE_SETTINGS.tankVolumeLiters,
      initialMileageMeters: vehicle.settings?.initialMileageMeters !== undefined ? vehicle.settings.initialMileageMeters : DEFAULT_VEHICLE_SETTINGS.initialMileageMeters,
      smsPassword: vehicle.settings?.smsPassword || DEFAULT_VEHICLE_SETTINGS.smsPassword,
      authorizationNumber: vehicle.settings?.authorizationNumber || DEFAULT_VEHICLE_SETTINGS.authorizationNumber,
      speakerSwitch: vehicle.settings?.speakerSwitch !== undefined ? vehicle.settings.speakerSwitch : DEFAULT_VEHICLE_SETTINGS.speakerSwitch,
      bluetoothSwitch: vehicle.settings?.bluetoothSwitch !== undefined ? vehicle.settings.bluetoothSwitch : DEFAULT_VEHICLE_SETTINGS.bluetoothSwitch,
      economicalMode: vehicle.settings?.economicalMode || DEFAULT_VEHICLE_SETTINGS.economicalMode,
      speedLimit: vehicle.settings?.speedLimit || DEFAULT_VEHICLE_SETTINGS.speedLimit,
      smartSpeedMode: vehicle.settings?.smartSpeedMode !== undefined ? vehicle.settings.smartSpeedMode : DEFAULT_VEHICLE_SETTINGS.smartSpeedMode,
      detectedRoadSpeed: vehicle.settings?.detectedRoadSpeed || DEFAULT_VEHICLE_SETTINGS.detectedRoadSpeed
    };

    setEditingVehicle({
      ...vehicle,
      settings: populatedSettings
    });
    setModalMode(mode || 'details'); // Abre no modo solicitado
    setShowDeleteConfirm(false);
  };
  
  const closeModal = () => {
    setEditingVehicle(null);
    setModalMode(null);
    setShowDeleteConfirm(false);
  };
  
  return (
      <div className="h-[100dvh] font-sans flex overflow-hidden bg-gray-50 relative w-full max-w-[100vw]">

      {/* Overlay Backdrop for Mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Global */}
      <div className={`
        fixed md:relative top-0 left-0 h-full z-50 md:z-40
        ${sidebarOpen ? 'translate-x-0 w-64 md:w-64 border-r border-gray-200' : '-translate-x-full w-64 md:w-0 md:translate-x-0 md:border-r-0'} 
        bg-white flex-shrink-0 transition-all duration-300 overflow-hidden flex flex-col shadow-xl md:shadow-sm
      `}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between h-16 shrink-0 bg-slate-950">
          <div 
            className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setShowVersionModal(true)}
          >
            <div className="bg-white rounded-xl shadow-md p-1.5 flex items-center justify-center overflow-hidden w-10 h-10 shrink-0">
              <img src="/1786699612187.png" alt="GKD Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white leading-tight">GKD Mobility</h1>
              <p className="text-[11px] font-medium text-slate-400">GKD.R.V.1.0.0</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors md:hidden"
            title="Fechar menu"
          >
            ✕
          </button>
        </div>
          
          <div className="p-4 space-y-1 flex-grow overflow-y-auto overflow-x-hidden min-w-[16rem]">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 mt-2">Módulos</h2>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'rastreamento' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('rastreamento'); setSidebarOpen(false); }}
            >
              <span className="text-lg">🗺️</span> <span>Rastreamento</span>
            </button>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'dashboard' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('dashboard'); setSidebarOpen(false); }}
            >
              <LayoutDashboard className="w-5 h-5 text-blue-600" /> <span>Painel Geral</span>
            </button>
            <button 
              className="w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer font-medium"
              onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                handleOpenDirectTimeline(selectedVehicle || vehicles[0] || null);
              }}
            >
              <span className="text-lg">⏱️</span> <span>Linha do Tempo</span>
            </button>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'historico' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('historico'); setSidebarOpen(false); }}
            >
              <span className="text-lg">🗓️</span> <span>Histórico</span>
            </button>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'ferramentas' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('ferramentas'); setSidebarOpen(false); }}
            >
              <Settings className="w-5 h-5 text-gray-500" /> <span>Ferramentas</span>
            </button>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'dados' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('dados'); setSidebarOpen(false); }}
            >
              <Database className="w-5 h-5 text-indigo-600" /> <span>Dados & Telemetria</span>
            </button>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'cercas' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('cercas'); setSidebarOpen(false); }}
            >
              <Target className="w-5 h-5 text-indigo-600" /> <span>Cercas Virtuais</span>
            </button>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'registros' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('registros'); setSidebarOpen(false); }}
            >
              <span className="text-lg">🎙️</span> <span>Registrador & Agregações</span>
            </button>
            <button 
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center space-x-3 transition-colors ${activeModule === 'ajuda' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveModule('ajuda'); setSidebarOpen(false); }}
            >
              <HelpCircle className="w-5 h-5 text-gray-500" /> <span>Ajuda</span>
            </button>


            <div className="mt-8 mb-4">
              <input 
                type="text" 
                placeholder="Buscar por nome, placa, número ou chip..." 
                className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Bloco de Veículos Cadastrados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Veículos Cadastrados</h2>
                </div>
                <button 
                  onClick={() => openModal({
                    id: 'new', iconType: 'car', color: '#3b82f6', name: '', licensePlate: '', status: 'IgnitionOff', trackerNumber: '', phoneNumber: '', speed: 0, fuel: 100, lat: -23.5505 + (Math.random() - 0.5) * 0.05, lng: -46.6333 + (Math.random() - 0.5) * 0.05, sharpTurns: 0, harshBraking: 0, totalMileage: 0, dailyMileage: 0,
                    settings: {
                      ...DEFAULT_VEHICLE_SETTINGS
                    }
                  }, 'details')}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors font-medium cursor-pointer"
                >
                  + Veículo
                </button>
              </div>
              {vehicles.filter(v => ((v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (v.licensePlate || '').toLowerCase().includes(searchTerm.toLowerCase()) || (v.trackerNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) || (v.phoneNumber || '').toLowerCase().includes(searchTerm.toLowerCase()))).map((v: any) => (
                <div 
                  key={v.id}
                  className={`w-full text-left p-3 rounded-lg border transition-all group cursor-pointer ${selectedVehicle?.id === v.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-100 hover:border-blue-300 hover:shadow-sm'}`}
                  onClick={(e) => { e.preventDefault(); handleListItemClick(v); }}
                  onDoubleClick={(e) => { e.preventDefault(); handleListItemClick(v); }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-white rounded-md shadow-sm border border-gray-100 flex-shrink-0">
                        <VehicleIcon iconType={v.iconType} color={v.color} size={16} photoUrl={v.photoUrl} onClick={(e: any) => { e.stopPropagation(); if (v.photoUrl) setPhotoViewerUrl(v.photoUrl); }} />
                      </div>
                      <span className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
                        {v.name}
                        {v.settings?.isBlocked && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 border border-red-200">
                            🔒 BLOQUEADO
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        v.status === 'Moving' || v.status === 'IgnitionOn' ? 'bg-green-500' :
                        v.status === 'Stopped' || v.status === 'IgnitionOff' ? 'bg-blue-500' :
                        v.status === 'NoBattery' ? 'bg-red-600' :
                        v.status === 'Offline' ? 'bg-gray-500' :
                        'bg-orange-500'
                      }`} title={
                        v.status === 'IgnitionOn' || v.status === 'Moving' ? 'Ligado / Em Movimento' :
                        v.status === 'IgnitionOff' || v.status === 'Stopped' ? 'Desligado / Parado' :
                        v.status === 'NoBattery' ? 'Sem Bateria / Cortado' :
                        v.status === 'Offline' ? 'Sem Sinal (Offline)' :
                        'Manutenção'
                      } />
                    </div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-xs text-gray-500 font-mono bg-gray-200 px-1.5 py-0.5 rounded">{v.licensePlate || 'Sem placa'}</span>
                      {v.powerCut || v.status === 'NoBattery' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 animate-pulse flex items-center gap-1">
                          ⚡ Corte de Energia
                        </span>
                      ) : v.status === 'Offline' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                          🔴 Sem Sinal
                        </span>
                      ) : (v.speed && v.speed > 0) || v.status === 'Moving' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          🟢 Em Movimento
                        </span>
                      ) : v.status === 'IgnitionOn' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          🟢 Ignição Ligada
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1" title="Veículo desligado, rastreador conectado com sinal GPS">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          ⚪ Desligado (Conectado)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDirectTimeline(v);
                        }}
                        title="Abrir Linha do Tempo deste veículo diretamente no mapa"
                        className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors text-xs font-bold"
                      >
                        ⏱️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal(v, 'details');
                        }}
                        title="Configurações"
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-white rounded transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                      v.speed > (v.settings?.smartSpeedMode ? (v.settings?.detectedRoadSpeed || 60) : (v.settings?.speedLimit || 60))
                        ? 'bg-red-100 text-red-700 border border-red-300 animate-pulse'
                        : 'bg-blue-50 text-blue-700 border border-blue-100'
                     }`}>
                      ⚡ {v.speed || 0} km/h
                    </span>
                    </div>
                  </div>
                </div>
              ))}
              {vehicles.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">Nenhum veículo cadastrado</div>
              )}
            </div>

          </div>
        </div>
        {/* Main Content Area */}
        <div className="flex-grow flex flex-col overflow-hidden relative min-w-0">
          <header className="bg-white border-b px-3 sm:px-4 py-2 sm:py-2.5 flex justify-between items-center z-10 shadow-sm shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Menu Hamburger Toggle */}
              <button 
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)} 
                className="p-2 rounded-xl bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 transition-colors border border-gray-200 shadow-sm shrink-0 flex items-center justify-center cursor-pointer"
                title={sidebarOpen ? "Recolher Menu Lateral" : "Abrir Menu Lateral"}
                aria-label="Menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {activeModule !== 'rastreamento' && (
                <button
                  type="button"
                  onClick={() => setActiveModule('rastreamento')}
                  className="flex items-center justify-center p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm hover:shadow transition-all cursor-pointer shrink-0"
                  title="Voltar ao Mapa de Rastreamento"
                  aria-label="Voltar ao Mapa"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}

              <h2 className="text-sm sm:text-base md:text-lg font-bold text-gray-800 capitalize truncate">
                {activeModule === 'dashboard' ? 'Painel Geral' : activeModule === 'rastreamento' ? 'Rastreamento' : activeModule === 'historico' ? 'Histórico' : activeModule === 'ferramentas' ? 'Ferramentas' : activeModule === 'dados' ? 'Dados & Telemetria' : activeModule === 'cercas' ? 'Cercas Virtuais' : activeModule === 'registros' ? 'Registrador & Agregações' : 'Ajuda'}
              </h2>

              {activeModule === 'rastreamento' && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm whitespace-nowrap">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="hidden min-[420px]:inline">Tempo Real Ativo</span>
                    <span className="min-[420px]:hidden">Ao Vivo</span>
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {/* Linha do Tempo Quick Header Button */}
              <button
                type="button"
                onClick={() => handleOpenDirectTimeline(selectedVehicle || vehicles[0] || null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Abrir Linha do Tempo diretamente no Mapa"
              >
                <span>⏱️</span>
                <span className="hidden sm:inline">Linha do Tempo</span>
              </button>

              {/* Notification Bell Icon */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowNotificationDrawer(!showNotificationDrawer); }}
                  className="relative p-2 rounded-xl bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition-all border border-gray-200 flex items-center justify-center shadow-sm cursor-pointer"
                  title="Central de Notificações e Alertas"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-bounce">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </header>
          
          <main className="flex-grow flex flex-col overflow-hidden relative">
            {flespiError && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9000] bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-fadeIn">
                <AlertTriangle className="w-5 h-5" />
                <div>
                  <p className="font-bold text-sm">Problema na Telemetria</p>
                  <p className="text-xs opacity-90">{flespiError}. Atualize o FLESPI_TOKEN no código.</p>
                </div>
              </div>
            )}
            {activeModule === 'rastreamento' && (
              <FleetTracker 
                vehicles={vehicles} 
                selectedVehicle={selectedVehicle} 
                onMarkerClick={(v) => setSelectedVehicle(v)}
                onMarkerDoubleClick={(v) => openModal(v, v.settings?.isBlocked ? 'emergency' : 'details')}
                onSelectVehicle={(v) => setSelectedVehicle(v)}
                onUpdateVehicle={(updated) => handleUpdateVehicle(updated)}
                onMapClick={() => { setSidebarOpen(false); setSelectedVehicle(null); }} 
                activeRoute={activeRoute}
                onOpenHistorico={() => setActiveModule('historico')}
                onOpenTimeline={(v, dateStr) => handleOpenDirectTimeline(v, dateStr)}
                timelineDate={timelineDate}
                onChangeTimelineDate={(d) => handleOpenDirectTimeline(selectedVehicle, d)}
                isPlayingPlayback={isPlayingPlayback}
                onTogglePlayback={() => setIsPlayingPlayback(!isPlayingPlayback)}
                onSeekPlayback={(idx) => {
                  setIsPlayingPlayback(false);
                  setPlaybackIndex(idx);
                }}
                playbackSpeed={playbackSpeed}
                onChangePlaybackSpeed={(spd) => setPlaybackSpeed(spd)}
                recordingPoints={recordingPoints}
                playbackIndex={playbackIndex}
                onCloseActiveRoute={() => {
                  setActiveRoute(null);
                  handleStopPlayback();
                }}
                geofences={geofences}
                isCreatingGeofence={isCreatingGeofence}
                onGeofenceCreateClick={(lat, lng) => {
                  setNewGeofenceCenter({ lat, lng });
                  setIsCreatingGeofence(false);
                }}
              />
            )}
            {activeModule === 'dashboard' && <Dashboard vehicles={vehicles} onBackToMap={() => setActiveModule('rastreamento')} />}
            {activeModule === 'historico' && <HistoricoModule vehicles={vehicles} fetchFlespiHistory={fetchFlespiHistory} setActiveRoute={setActiveRoute} setActiveModule={setActiveModule} setSidebarOpen={setSidebarOpen} showToast={showToast} />}
            {activeModule === 'ferramentas' && (
              <TerminalTools setActiveModule={setActiveModule} 
                onOpenRouteManager={() => setIsRouteManagerOpen(true)} 
                vehicles={vehicles} 
                handleUpdateVehicle={handleUpdateVehicle} 
                showToast={showToast} 
                addNotification={addNotification}
                onBackToMap={() => setActiveModule('rastreamento')}
                triggerDualDispatch={(commandName, smsCommand, phoneNumber, vehicleName) => {
                  setDualDispatchData({
                    isOpen: true,
                    commandName,
                    smsCommand,
                    phoneNumber,
                    vehicleName
                  });
                  
                  // Tenta enviar comando real via GPRS (Flespi) automaticamente se houver IMEI
                  const matchedVehicle = vehicles.find((v: any) => v.name === vehicleName || v.phoneNumber === phoneNumber || v.trackerNumber === phoneNumber);
                  if (matchedVehicle && matchedVehicle.trackerNumber) {
                    sendFlespiCommand(matchedVehicle.trackerNumber, smsCommand);
                  }
                }}
                messageController={{
                  setSelectedVehicleForMessage: setSelectedVehicleForMessage,
                  selectedVehicleForMessage: selectedVehicleForMessage,
                  setShowMessageModal: setShowMessageModal,
                  showMessageModal: showMessageModal
                }}
              />
            )}
            {activeModule === 'ajuda' && (
              <HelpModule
                vehicles={vehicles}
                setVehicles={setVehicles}
                handleDeleteVehicle={handleDeleteVehicle}
                clearNotifications={clearNotifications}
                showToast={showToast}
                onBackToMap={() => setActiveModule('rastreamento')}
              />
            )}
            {activeModule === 'dados' && <DadosModule vehicles={vehicles} onUpdateVehicle={handleUpdateVehicle} onBackToMap={() => setActiveModule('rastreamento')} />}
            
            {activeModule === 'registros' && (
              <RegistradorModule
                vehicles={vehicles}
                onOpenListenModal={(vehicleId) => {
                  setActiveModule('ferramentas');
                  if (showToast) showToast('🎙️ Abrindo Registrador & Escuta In-App no Terminal de Ferramentas...');
                }}
                showToast={showToast}
                onBackToMap={() => setActiveModule('rastreamento')}
              />
            )}
          </main>
        </div>



        <RouteManagerModal
          isOpen={isRouteManagerOpen}
          onClose={() => setIsRouteManagerOpen(false)}
          vehicles={vehicles}
          recordingPoints={recordingPoints}
          isRecording={isRecording}
          onStartRecording={() => {
            setRecordingPoints([]);
            setIsRecording(true);
          }}
          onStopRecording={() => setIsRecording(false)}
          onSelectRouteForMap={(route) => {
            setActiveRoute(route);
            setPlaybackIndex(null);
            setIsPlayingPlayback(false);
          }}
          onStartPlayback={handleStartPlayback}
          onStopPlayback={handleStopPlayback}
          isPlayingPlayback={isPlayingPlayback}
          activeRoute={activeRoute}
        />

        {/* Modal de Versão e Sobre o App */}
        {showVersionModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative">
              <button onClick={() => setShowVersionModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              <div className="p-8 pb-6 flex flex-col items-center text-center bg-gradient-to-b from-slate-50 to-white">
                <img src="/1786699612187.png" alt="GKD Logo" className="w-32 h-32 object-contain mb-4 drop-shadow-md rounded-2xl" />
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">GKD Mobility</h2>
                <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold tracking-wider">
                  VERSÃO GKD.R.V.1.0.0
                </div>
              </div>
              <div className="px-8 pb-8 text-center">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Plataforma avançada para rastreamento de veículos em tempo real. Oferece controle total da frota, histórico detalhado de trajetos, comandos remotos via rede e monitoramento inteligente de telemetria.
                </p>
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-xs text-gray-400">© 2026 GKD Mobility. Todos os direitos reservados.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {editingVehicle && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
              {editingVehicle.photoUrl && editingVehicle.id !== 'new' && (
                <div className="w-full h-40 relative bg-gray-100 shrink-0">
                  <img src={editingVehicle.photoUrl} alt="Foto" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent opacity-90" />
                </div>
              )}
              <div className="p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">{editingVehicle.id === 'new' ? 'Novo Cadastro' : `Editar ${editingVehicle.name}`}</h2>
              </div>
              <div className="grid grid-cols-4 bg-gray-100 p-1 rounded-xl mb-6 gap-1">
                <button
                  type="button"
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${modalMode === 'position' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
                  onClick={() => setModalMode('position')}
                >
                  <span>📍</span> Posição
                </button>
                <button
                  type="button"
                  className={`py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${modalMode === 'emergency' ? 'bg-red-600 shadow text-white ring-2 ring-red-400/40' : 'text-red-600 hover:bg-red-50'}`}
                  onClick={() => setModalMode('emergency')}
                >
                  <span className="animate-pulse">🚨</span> Bloqueio
                </button>
                <button
                  type="button"
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${modalMode === 'settings' ? 'bg-white shadow text-slate-800' : 'text-gray-500 hover:text-gray-800'}`}
                  onClick={() => setModalMode('settings')}
                >
                  <span>⚙️</span> Ajustes
                </button>
                <button
                  type="button"
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${modalMode === 'details' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
                  onClick={() => setModalMode('details')}
                >
                  <span>📝</span> Cadastro
                </button>
              </div>
                {modalMode === 'position' && (
                  <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                          <span className="text-blue-600">📍</span> Dados de Posicionamento
                        </h3>
                        <p className="text-[11px] text-gray-500">
                          {editingVehicle.type === 'pessoa' ? 'Status e Localização da Pessoa' : 'Status e Localização do Veículo'}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                        editingVehicle.status !== 'Offline'
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${editingVehicle.status !== 'Offline' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                        {editingVehicle.status !== 'Offline' ? 'Conectado 🟢' : 'Sem Sinal 🔴'}
                      </span>
                    </div>

                    {/* Power Cut Alert Banner if detected */}
                    {(editingVehicle.powerCut || editingVehicle.status === 'NoBattery') && (
                      <div className="bg-red-600 text-white p-3 rounded-xl border border-red-700 flex items-start justify-between gap-2 shadow-md">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-300 mt-0.5" />
                          <div className="flex-1 text-[11px] leading-tight">
                            <strong className="block text-xs font-black tracking-wide uppercase text-yellow-200">⚠️ CORTE DE ENERGIA DETECTADO!</strong>
                            <span className="text-red-100 text-[10px]">Alimentação principal (12V) do veículo foi sinalizada. Se o aparelho estiver ligado normalmente no veículo, clique para limpar este aviso histórico.</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const cleaned = { ...editingVehicle, powerCut: false, status: (editingVehicle.status === 'NoBattery' ? 'IgnitionOff' : editingVehicle.status) };
                            setEditingVehicle(cleaned);
                            handleUpdateVehicle(cleaned);
                            showToast('✅ Alerta de corte de energia limpo com sucesso!');
                          }}
                          className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-bold text-[10px] rounded-lg transition-colors shrink-0 cursor-pointer"
                        >
                          Limpar Alerta
                        </button>
                      </div>
                    )}

                    {/* Card de Informações do Posicionamento */}
                    <div className="bg-white rounded-xl p-3.5 border border-blue-100 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                          Posicionamento e Telemetria
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          Última leitura: {new Date().toLocaleTimeString('pt-BR')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        {editingVehicle.type === 'pessoa' ? (
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                            <span className="text-[10px] text-gray-500 font-medium block">Status Online</span>
                            <span className={`font-bold text-xs ${
                              editingVehicle.status !== 'Offline'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}>
                              {editingVehicle.status !== 'Offline' ? 'Online 🟢 (Conectado)' : 'Offline 🔴 (Sem sinal)'}
                            </span>
                          </div>
                        ) : (
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                            <span className="text-[10px] text-gray-500 font-medium block">Velocidade Atual</span>
                            <span className="font-bold text-blue-700 text-xs">
                              {editingVehicle.status === 'Offline' ? 0 : (editingVehicle.speed || 0)} km/h
                            </span>
                          </div>
                        )}

                        {editingVehicle.type === 'pessoa' ? null : (
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                            <span className="text-[10px] text-gray-500 font-medium block">Status / Ignição</span>
                            <span className={`font-bold text-xs ${
                              editingVehicle.powerCut || editingVehicle.status === 'NoBattery'
                                ? 'text-red-600 font-black'
                                : editingVehicle.status === 'Offline'
                                ? 'text-red-600'
                                : (editingVehicle.speed && editingVehicle.speed > 0) || editingVehicle.status === 'IgnitionOn' || editingVehicle.status === 'Moving'
                                ? 'text-emerald-600'
                                : 'text-gray-600'
                            }`}>
                              {editingVehicle.status === 'Offline'
                                ? 'Sem Sinal (Offline) 🔴'
                                : editingVehicle.powerCut || editingVehicle.status === 'NoBattery'
                                ? '⚡ Corte de Energia (Sem 12V)'
                                : (editingVehicle.speed && editingVehicle.speed > 0)
                                ? `Em Movimento 🚗 (${editingVehicle.speed || 0} km/h)`
                                : editingVehicle.status === 'IgnitionOn'
                                ? 'Ignição Ligada 🟢 (Ligado)'
                                : editingVehicle.status === 'Moving'
                                ? `Em Movimento 🚗 (${editingVehicle.speed || 0} km/h)`
                                : 'Desligado ⚪ (Conectado / Sinal OK 🟢)'}
                            </span>
                          </div>
                        )}

                        <div className={`bg-gray-50 p-2.5 rounded-lg border border-gray-100 ${editingVehicle.type === 'pessoa' ? 'col-span-2' : ''}`}>
                          <span className="text-[10px] text-gray-500 font-medium block">{editingVehicle.type === 'pessoa' ? 'Dispositivo / Smartphone' : 'Dispositivo / Rastreador'}</span>
                          <span className="font-mono font-bold text-gray-700 text-xs">
                            {editingVehicle.trackerNumber || (editingVehicle.type === 'pessoa' ? 'GPS do Smartphone' : 'GPS Integrado')}
                          </span>
                        </div>

                        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 col-span-2">
                          <span className="text-[10px] text-gray-500 font-medium block mb-1">Endereço Preciso (Localização Real)</span>
                          <VehicleAddressDisplay lat={editingVehicle.lat} lng={editingVehicle.lng} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {modalMode === 'details' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Nome do Veículo</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Gol Branco ou Frota 01" 
                        value={editingVehicle.name} 
                        onChange={e => setEditingVehicle({...editingVehicle, name: e.target.value})} 
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Placa do Veículo</label>
                      <input type="text" value={editingVehicle.licensePlate} onChange={e => setEditingVehicle({...editingVehicle, licensePlate: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow uppercase" placeholder="ABC-1234" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Ícone</label>
                        <select 
                          value={editingVehicle.iconType || 'car'} 
                          onChange={e => setEditingVehicle({...editingVehicle, iconType: e.target.value as any})} 
                          className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white text-sm font-medium"
                        >
                          <option value="car">Carro (Padrão)</option>
                          <option value="car-front">Carro (Frente)</option>
                          <option value="truck">Caminhão</option>
                          <option value="bus">Ônibus</option>
                          <option value="motorcycle">Moto</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Cor do Ícone no Mapa</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={editingVehicle.color || '#3b82f6'} 
                            onChange={e => setEditingVehicle({...editingVehicle, color: e.target.value})} 
                            className="w-10 h-10 rounded-lg border border-gray-300 p-0.5 cursor-pointer shrink-0" 
                          />
                          <span className="text-xs font-mono uppercase text-gray-600 bg-gray-100 px-2 py-1.5 rounded border border-gray-200">
                            {editingVehicle.color || '#3b82f6'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Foto / Avatar do Ícone</label>
                      <div className="flex gap-2 items-center">
                        <input 
                          type="text" 
                          placeholder="Cole URL ou faça upload abaixo" 
                          value={editingVehicle.photoUrl || ''} 
                          onChange={e => setEditingVehicle({...editingVehicle, photoUrl: e.target.value})} 
                          className="flex-1 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs" 
                        />
                        {editingVehicle.photoUrl && (
                          <button 
                            type="button" 
                            onClick={() => setPhotoViewerUrl(editingVehicle.photoUrl)} 
                            className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200 shrink-0"
                          >
                            Ver Foto
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 inline-flex items-center gap-1.5 transition-colors">
                          <span>📁</span> Enviar Arquivo...
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleFileUploadAndCompress(file);
                              }
                            }}
                          />
                        </label>
                        {editingVehicle.photoUrl && (
                          <button 
                            type="button" 
                            onClick={() => setEditingVehicle({...editingVehicle, photoUrl: ''})} 
                            className="text-xs text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 font-medium transition-colors"
                          >
                            Remover Foto
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Status do Sinal / Dispositivo</label>
                      <select value={editingVehicle.status} onChange={e => setEditingVehicle({...editingVehicle, status: e.target.value as any})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white">
                        <option value="IgnitionOn">🟢 Ignição Ligada / Em Movimento</option>
                        <option value="IgnitionOff">⚪ Desligado / Parado</option>
                        <option value="NoBattery">🔴 Sem Bateria / Cabo Cortado</option>
                        <option value="Offline">🔴 Sem Sinal / Offline</option>
                        <option value="Alarm">🚨 Em Alarme / Roubo</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Rastreador / IMEI <span className="text-xs font-normal text-gray-500">(Opcional)</span></label>
                        <input type="text" placeholder="Ex: 8642940..." value={editingVehicle.trackerNumber} onChange={e => setEditingVehicle({...editingVehicle, trackerNumber: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Número do Telefone</label>
                        <input type="text" placeholder="(11) 99999-9999" value={editingVehicle.phoneNumber} onChange={e => setEditingVehicle({...editingVehicle, phoneNumber: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-sm" />
                      </div>
                    </div>
                  </div>
                )}

                {/* ABA 2: COMANDOS DE EMERGÊNCIA & BLOQUEIO (Corte de Motor) */}
                {modalMode === 'emergency' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-red-50/80 border-2 border-red-300 rounded-2xl p-4 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between border-b border-red-200 pb-2.5">
                        <div className="flex items-center gap-2 text-red-900">
                          <span className="text-xl">🚨</span>
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide">Comandos de Emergência & Roubo</h4>
                            <span className="text-[10px] text-red-700 font-medium">Corte de combustível via relé do rastreador</span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          editingVehicle.settings?.isBlocked 
                            ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                            : editingVehicle.settings?.pendingBlock
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}>
                          {editingVehicle.settings?.isBlocked 
                            ? '🔒 BLOQUEADO' 
                            : editingVehicle.settings?.pendingBlock 
                              ? '⏳ CORTE AGENDADO' 
                              : '✅ MOTOR LIBERADO'}
                        </span>
                      </div>

                      {editingVehicle.settings?.isBlocked ? (
                        <div className="bg-red-600 text-white p-3 rounded-xl shadow-sm space-y-1">
                          <div className="flex items-center gap-2 font-black text-xs sm:text-sm">
                            <span className="text-lg">🔒</span> CORTE DE COMBUSTÍVEL / MOTOR ATIVO
                          </div>
                          <p className="text-[11px] text-red-100 leading-tight">
                            O relé do rastreador foi acionado para interromper o motor. Para restabelecer o combustível e permitir nova partida, acione o botão verde de desbloqueio abaixo.
                          </p>
                        </div>
                      ) : editingVehicle.settings?.pendingBlock ? (
                        <div className="bg-amber-500 text-white p-3 rounded-xl shadow-sm space-y-1">
                          <div className="flex items-center gap-2 font-black text-xs sm:text-sm">
                            <span className="text-lg">⏳</span> BLOQUEIO SEGURO PROGRAMADO
                          </div>
                          <p className="text-[11px] text-amber-100 leading-tight">
                            Aguardando o condutor desligar a ignição ou o veículo parar em segurança para cortar o motor automaticamente.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-red-950 leading-relaxed font-medium">
                          Para momentos de pânico, suspeita ou furto. Ao clicar em qualquer comando abaixo, uma janela explicativa aparecerá com a descrição do que ele faz antes de você confirmar a execução.
                        </p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {editingVehicle.settings?.isBlocked ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                openActionConfirm('unblock', editingVehicle);
                              }}
                              className="col-span-full py-4 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-3 border-2 border-emerald-400 cursor-pointer transition-all"
                            >
                              <span className="text-2xl sm:text-3xl">🔓</span>
                              <div className="text-left">
                                <div className="font-black text-sm sm:text-base">DESBLOQUEAR MOTOR</div>
                                <div className="text-[10px] sm:text-xs font-normal text-emerald-100">Restaurar combustível e normalizar ignição para partida</div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                openActionConfirm('block_now', editingVehicle);
                              }}
                              className="col-span-full py-2 px-3 bg-red-100 hover:bg-red-200 active:scale-95 text-red-900 rounded-xl font-semibold text-xs border border-red-200 flex items-center justify-center gap-2 cursor-pointer transition-all"
                            >
                              <span>🔁</span> Reenviar Sinal de Corte (GPRS) para o Relé
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                openActionConfirm('block_now', editingVehicle);
                              }}
                              className="py-3 px-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-2.5 border border-red-500 cursor-pointer transition-all"
                            >
                              <span className="text-2xl">🔒</span>
                              <div className="text-left">
                                <div className="font-black text-xs sm:text-sm">BLOQUEIO IMEDIATO</div>
                                <div className="text-[10px] font-normal text-red-100">Corta combustível agora</div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                openActionConfirm('safe_block', editingVehicle);
                              }}
                              className={`py-3 px-3.5 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-2.5 border cursor-pointer transition-all ${
                                editingVehicle.settings?.pendingBlock
                                  ? 'bg-amber-600 hover:bg-amber-700 border-amber-500 animate-pulse'
                                  : 'bg-amber-500 hover:bg-amber-600 border-amber-400'
                              }`}
                            >
                              <span className="text-2xl">🛡️</span>
                              <div className="text-left">
                                <div className="font-black text-xs sm:text-sm">
                                  {editingVehicle.settings?.pendingBlock ? 'BLOQUEIO AGENDADO' : 'BLOQUEIO SEGURO'}
                                </div>
                                <div className="text-[10px] font-normal text-amber-100">
                                  {editingVehicle.settings?.pendingBlock ? 'Aguardando desligar motor' : 'Corta ao parar ou desligar'}
                                </div>
                              </div>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Redundância por SMS ou WhatsApp Direto */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                            <span>📱</span> Redundância SMS & WhatsApp
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Disparo direto via chip celular (funciona mesmo sem internet)
                          </p>
                        </div>
                        <span className="text-[10px] text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">
                          Senha: {editingVehicle.settings?.smsPassword || '123456'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const phone = (editingVehicle.phoneNumber || editingVehicle.trackerNumber || '').replace(/[^0-9]/g, '');
                            const pwd = editingVehicle.settings?.smsPassword || '123456';
                            const cmd = `quickstop${pwd}`;
                            if (!phone) {
                              showToast('⚠️ Informe o número de telefone (Chip) do rastreador nos dados do veículo.');
                              return;
                            }
                            sendFlespiCommand(editingVehicle.trackerNumber || editingVehicle.name, cmd, editingVehicle.name);
                            window.open(`sms:${phone}?body=${encodeURIComponent(cmd)}`, '_self');
                            showToast(`📱 SMS [${cmd}] (Corte Imediato TK303G) para ${phone}`);
                          }}
                          className="text-xs bg-red-600 hover:bg-red-700 text-white py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <span>📱</span> SMS Corte Imediato (quickstop)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const phone = (editingVehicle.phoneNumber || editingVehicle.trackerNumber || '').replace(/[^0-9]/g, '');
                            const pwd = editingVehicle.settings?.smsPassword || '123456';
                            const cmd = `resume${pwd}`;
                            if (!phone) {
                              showToast('⚠️ Informe o número de telefone (Chip) do rastreador nos dados do veículo.');
                              return;
                            }
                            sendFlespiCommand(editingVehicle.trackerNumber || editingVehicle.name, cmd, editingVehicle.name);
                            window.open(`sms:${phone}?body=${encodeURIComponent(cmd)}`, '_self');
                            showToast(`📱 SMS [${cmd}] (Desbloqueio TK303G) para ${phone}`);
                          }}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <span>📱</span> SMS Desbloquear (resume)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const phone = (editingVehicle.phoneNumber || editingVehicle.trackerNumber || '').replace(/[^0-9]/g, '');
                            const pwd = editingVehicle.settings?.smsPassword || '123456';
                            const cmd = `position${pwd}`;
                            if (!phone) {
                              showToast('⚠️ Informe o número de telefone (Chip) do rastreador nos dados do veículo.');
                              return;
                            }
                            window.open(`sms:${phone}?body=${encodeURIComponent(cmd)}`, '_self');
                            showToast(`📱 SMS [${cmd}] (Posição TK303G) para ${phone}`);
                          }}
                          className="text-xs bg-sky-600 hover:bg-sky-700 text-white py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <span>📱</span> SMS Posição (position)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const phone = (editingVehicle.phoneNumber || editingVehicle.trackerNumber || '').replace(/[^0-9]/g, '');
                            const pwd = editingVehicle.settings?.smsPassword || '123456';
                            const cmd = `monitor${pwd}`;
                            if (!phone) {
                              showToast('⚠️ Informe o número de telefone (Chip) do rastreador nos dados do veículo.');
                              return;
                            }
                            window.open(`sms:${phone}?body=${encodeURIComponent(cmd)}`, '_self');
                            showToast(`🎙️ SMS [${cmd}] (Modo Escuta TK303G) para ${phone}`);
                          }}
                          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <span>🎙️</span> SMS Escuta (monitor)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ABA 3: AJUSTES & CONFIGURAÇÕES */}
                {modalMode === 'settings' && (
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 animate-in fade-in duration-200">
                    {/* Utilitários e Manutenção do Rastreador */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-1.5 text-slate-800">
                          <span className="text-lg">⚙️</span>
                          <h4 className="text-xs font-black uppercase tracking-wide">Comandos Utilitários do Aparelho</h4>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          Diagnóstico & Teste
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        Comandos operacionais de rotina, teste e diagnóstico do rastreador. Clique para ler os detalhes antes de executar.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            openActionConfirm('alarm', editingVehicle);
                          }}
                          className="py-3 px-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-sm flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-all"
                        >
                          <span className="text-xl">🔊</span>
                          <span className="font-bold text-xs">Tocar Alarme</span>
                          <span className="text-[9px] text-blue-100 font-normal">Disparar sirene</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            openActionConfirm('reboot', editingVehicle);
                          }}
                          className="py-3 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-sm flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-all"
                        >
                          <span className="text-xl">🔄</span>
                          <span className="font-bold text-xs">Reiniciar Rastreador</span>
                          <span className="text-[9px] text-indigo-100 font-normal">Reboot do 4G/GPS</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            openActionConfirm('shutdown', editingVehicle);
                          }}
                          className="py-3 px-3 bg-slate-700 hover:bg-slate-800 active:scale-95 text-white rounded-xl font-bold text-xs shadow-sm flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-all"
                        >
                          <span className="text-xl">🔌</span>
                          <span className="font-bold text-xs">Suspender / Standby</span>
                          <span className="text-[9px] text-slate-200 font-normal">Modo repouso</span>
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Fuso Horário</label>
                        <select 
                          value={editingVehicle.settings?.timezone || '-3'} 
                          onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, timezone: e.target.value}})} 
                          className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
                        >
                          <option value="-4">GMT-4 (Manaus)</option>
                          <option value="-3">GMT-3 (Brasília)</option>
                          <option value="-2">GMT-2 (Fernando de Noronha)</option>
                          <option value="0">GMT+0 (Londres)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Unidade de Medida</label>
                        <select 
                          value={editingVehicle.settings?.mileageDisplayUnit || 'km'} 
                          onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, mileageDisplayUnit: e.target.value as any}})} 
                          className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
                        >
                          <option value="km">Quilômetros (km)</option>
                          <option value="miles">Milhas (mi)</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Bell className="w-4 h-4 text-blue-600" />
                        Alertas e Notificações
                      </h3>
                                            
                      <div className="space-y-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <label className="flex items-center justify-between cursor-pointer group">
                          <div>
                            <span className="block text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Ignição (ACC)</span>
                            <span className="block text-[10px] text-gray-500">Alertar quando ligar/desligar</span>
                          </div>
                          <input 
                             type="checkbox" 
                             checked={editingVehicle.settings?.accNotify ?? true}
                             onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, accNotify: e.target.checked}})}
                             className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group border-t border-gray-100 pt-3">
                          <div>
                            <span className="block text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Excesso de Velocidade</span>
                            <span className="block text-[10px] text-gray-500">Alertar quando ultrapassar o limite</span>
                          </div>
                          <input 
                             type="checkbox" 
                             checked={editingVehicle.settings?.speedNotify ?? true}
                             onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, speedNotify: e.target.checked}})}
                             className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group border-t border-gray-100 pt-3">
                          <div>
                            <span className="block text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Corte de Energia</span>
                            <span className="block text-[10px] text-gray-500">Bateria do veículo removida</span>
                          </div>
                          <input 
                             type="checkbox" 
                             checked={editingVehicle.settings?.powerNotify ?? true}
                             onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, powerNotify: e.target.checked}})}
                             className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group border-t border-gray-100 pt-3">
                          <div>
                            <span className="block text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Bateria Fraca (Backup)</span>
                            <span className="block text-[10px] text-gray-500">Bateria do rastreador abaixo de 20%</span>
                          </div>
                          <input 
                             type="checkbox" 
                             checked={editingVehicle.settings?.batteryNotify ?? true}
                             onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, batteryNotify: e.target.checked}})}
                             className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group border-t border-gray-100 pt-3">
                          <div>
                            <span className="block text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Choque / Vibração</span>
                            <span className="block text-[10px] text-gray-500">Detectar tentativa de furto ou colisão</span>
                          </div>
                          <input 
                             type="checkbox" 
                             checked={editingVehicle.settings?.shockNotify ?? false}
                             onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, shockNotify: e.target.checked}})}
                             className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group border-t border-gray-100 pt-3">
                          <div>
                            <span className="block text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">Cerca Virtual</span>
                            <span className="block text-[10px] text-gray-500">Entrada e saída de áreas restritas</span>
                          </div>
                          <input 
                             type="checkbox" 
                             checked={editingVehicle.settings?.geofenceNotify ?? true}
                             onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, geofenceNotify: e.target.checked}})}
                             className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </label>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Tempos de Envio de Alarme (Repetições)</label>
                          <input 
                            type="text" 
                            value={editingVehicle.settings?.alarmSendingTimes || '1'} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, alarmSendingTimes: e.target.value}})} 
                            placeholder="Ex: 1 (vez por evento)"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Número de vezes que o alerta deve ser disparado por evento.</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Gatilhos de Alarme Ativos</label>
                          <input 
                            type="text" 
                            value={editingVehicle.settings?.alarmSettings || 'velocidade,acc,bateria,choque,cerca'} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, alarmSettings: e.target.value}})} 
                            placeholder="Ex: velocidade,acc,bateria,choque,cerca"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Eventos monitorados: velocidade, acc, bateria, choque, cerca virtual.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h3 className="font-semibold text-gray-800 mb-3">Sensores, Curvas e Telemetria</h3>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Sensibilidade do Sensor de Movimento</label>
                          <select 
                            value={editingVehicle.settings?.sensitivity || 'medium'} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, sensitivity: e.target.value}})} 
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
                          >
                            <option value="high">Alta (Detecta leves vibrações e pequenas variações)</option>
                            <option value="medium">Média (Padrão recomendado)</option>
                            <option value="low">Baixa (Apenas movimentos e solavancos bruscos)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Ângulo de Curva / Grau de Virar (Graus)</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              min="5"
                              max="90"
                              value={editingVehicle.settings?.turningAngle ?? 25} 
                              onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, turningAngle: Number(e.target.value)}})} 
                              placeholder="25"
                              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow font-medium" 
                            />
                            <span className="text-gray-500 font-bold px-2 py-2 bg-gray-100 rounded-lg text-sm">graus (°)</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Ângulo mínimo para registrar curvas no mapa (padrão: 25°, editável de 5° a 90°).</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Comportamento do Motorista (Freadas, Curvas e Acelerações)</label>
                          <input 
                            type="text" 
                            value={editingVehicle.settings?.drivingBehaviorSetting || 'Curva: 25° | Frenagem: 0.4g | Aceleração: 0.3g'} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, drivingBehaviorSetting: e.target.value}})} 
                            placeholder="Curva: 25° | Frenagem: 0.4g | Aceleração: 0.3g"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Parâmetros configurados para detecção de curvas rápidas, frenagens bruscas e arrancadas.</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Calibração de Óleo/Combustível (Fator)</label>
                          <input 
                            type="text" 
                            value={editingVehicle.settings?.oilCalibration || '0.85'} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, oilCalibration: e.target.value}})} 
                            placeholder="0.85"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Fator de calibração do sensor analógico de combustível (ex: 0.85).</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Volume Total do Tanque (Litros)</label>
                          <input 
                            type="number" 
                            value={editingVehicle.settings?.tankVolumeLiters ?? 55} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, tankVolumeLiters: Number(e.target.value)}})} 
                            placeholder="55"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Odômetro Total (km)</label>
                          <input 
                            type="number" 
                            step="1"
                            value={Math.round(editingVehicle.totalMileage ?? 0)} 
                            onChange={e => setEditingVehicle({...editingVehicle, totalMileage: Math.round(parseFloat(e.target.value) || 0)})} 
                            placeholder="0"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Quilometragem geral acumulada do veículo em número inteiro (sincronize com o painel físico).</p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-semibold text-gray-700">Km Rodados Hoje (km)</label>
                            <button
                              type="button"
                              onClick={() => setEditingVehicle({...editingVehicle, dailyMileage: 0})}
                              className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline"
                            >
                              Zerar Hoje (0 km)
                            </button>
                          </div>
                          <input 
                            type="number" 
                            step="1"
                            value={Math.round(editingVehicle.dailyMileage ?? 0)} 
                            onChange={e => setEditingVehicle({...editingVehicle, dailyMileage: Math.round(parseFloat(e.target.value) || 0)})} 
                            placeholder="0"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Distância percorrida hoje em km inteiros (reseta automaticamente à meia-noite).</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h3 className="font-semibold text-gray-800 mb-3">Segurança e Controle do Rastreador</h3>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Senha SMS (Rastreador)</label>
                          <input 
                            type="text" 
                            value={editingVehicle.settings?.smsPassword || 'password'} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, smsPassword: e.target.value}})} 
                            placeholder="password ou 123456"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow font-mono" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Senha enviada nos comandos de bloqueio/desbloqueio SMS.</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Número de Autorização (Admin)</label>
                          <input 
                            type="text" 
                            value={editingVehicle.settings?.authorizationNumber || '+5511999999999'} 
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, authorizationNumber: e.target.value}})} 
                            placeholder="+5511999999999"
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                          />
                          <p className="text-xs text-gray-500 mt-1">Número de telefone autorizado a enviar comandos ao rastreador.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4 pb-2">
                      <h3 className="font-semibold text-gray-800 mb-3">Conectividade e Módulos</h3>
                      
                      <div className="space-y-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={editingVehicle.settings?.speakerSwitch ?? true}
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, speakerSwitch: e.target.checked}})}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <div>
                            <span className="block text-sm font-semibold text-gray-800">Alto-falante / Escuta</span>
                            <span className="block text-xs text-gray-500">Ativar módulo de áudio do rastreador</span>
                          </div>
                        </label>

                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={editingVehicle.settings?.bluetoothSwitch || false}
                            onChange={e => setEditingVehicle({...editingVehicle, settings: {...editingVehicle.settings, bluetoothSwitch: e.target.checked}})}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <div>
                            <span className="block text-sm font-semibold text-gray-800">Módulo Bluetooth</span>
                            <span className="block text-xs text-gray-500">Ativar leitura de iButton ou sensores BLE</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center mt-8 pt-4 border-t">
                  {editingVehicle.id !== 'new' ? (
                    <button 
                      onClick={() => setShowDeleteConfirm(true)} 
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium border border-transparent hover:border-red-200 flex items-center"
                    >
                      Excluir
                    </button>
                  ) : (
                    <div></div>
                  )}
                  <div className="flex space-x-3">
                    
                    <button onClick={closeModal} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">Cancelar</button>
                    <button 
                      onClick={(e) => { e.preventDefault(); e.stopPropagation();
                        handleUpdateVehicle(editingVehicle, (saved) => {
                          setSelectedVehicle(saved);
                          setActiveModule('rastreamento');
                          closeModal();
                        });
                      }} 
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && editingVehicle && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1010] backdrop-blur-sm p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
              <h3 className="text-xl font-bold text-gray-800 mb-2">Confirmar Exclusão</h3>
              <p className="text-gray-600 mb-6">Deseja realmente excluir o veículo <strong>{editingVehicle.name}</strong>? Isso apagará todos os dados irreversivelmente.</p>
              <div className="flex justify-center space-x-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)} 
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation();
                    handleDeleteVehicle(editingVehicle.id);
                    setShowDeleteConfirm(false);
                    closeModal();
                  }} 
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-sm"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification Drawer Modal */}
        {showNotificationDrawer && (
          <div className="fixed inset-0 bg-black/60 flex justify-end z-[1000] backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-md h-full sm:h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto border border-gray-100">
              
              {/* Header */}
              <div className="bg-slate-900 text-white p-4 flex items-center justify-between shadow-md shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-600 rounded-xl text-white">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base flex items-center gap-2">
                      Central de Notificações
                      {notifications.filter(n => !n.read).length > 0 && (
                        <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-extrabold">
                          {notifications.filter(n => !n.read).length}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-300">Alertas de segurança e eventos da frota</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNotificationDrawer(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Notification Permission Request Banner */}
              {notificationPermissionStatus !== 'granted' && (
                <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-900 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">🔔</span>
                    <span className="truncate">Permitir notificações do navegador</span>
                  </div>
                  <button
                    onClick={requestNotificationPermission}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-1 rounded-lg text-xs transition-colors shrink-0 shadow-sm"
                  >
                    Ativar
                  </button>
                </div>
              )}

              {/* Filter Tabs & Top Actions */}
              <div className="p-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex bg-gray-200/80 p-1 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setNotificationFilter('all')}
                    className={`px-2.5 py-1 rounded-md transition-all ${notificationFilter === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Todas ({notifications.length})
                  </button>
                  <button
                    onClick={() => setNotificationFilter('unread')}
                    className={`px-2.5 py-1 rounded-md transition-all ${notificationFilter === 'unread' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Não lidas ({notifications.filter(n => !n.read).length})
                  </button>
                  <button
                    onClick={() => setNotificationFilter('critical')}
                    className={`px-2.5 py-1 rounded-md transition-all ${notificationFilter === 'critical' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Alertas Críticos
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      addNotification({
                        title: '🧪 Notificação de Teste',
                        message: 'O sistema de notificações em tempo real com alerta sonoro e push está 100% ativo!',
                        type: 'command',
                        severity: 'info',
                        vehicleName: 'GKD Mobility'
                      });
                    }}
                    className="text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                    title="Enviar notificação de teste para verificar som, toast e alerta"
                  >
                    🧪 Testar
                  </button>
                  <button
                    onClick={() => {
                      unlockAudio();
                      if (isAlarmTesting || isAlarmPlaying()) {
                        stopAlarmSound();
                        setIsAlarmTesting(false);
                      } else {
                        playAlarmSound('siren', 8000);
                        setIsAlarmTesting(true);
                      }
                    }}
                    className={`text-[11px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                      isAlarmTesting || isAlarmPlaying()
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-sm'
                        : 'text-red-700 bg-red-100 hover:bg-red-200'
                    }`}
                    title={isAlarmTesting || isAlarmPlaying() ? "Clique para parar o som do alarme" : "Clique para testar o alarme sonoro"}
                  >
                    {isAlarmTesting || isAlarmPlaying() ? '🔇 Parar' : '🔊 Som'}
                  </button>
                  <button
                    onClick={markAllNotificationsAsRead}
                    className="text-[11px] font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                  >
                    ✓ Lidas
                  </button>
                  <button
                    onClick={clearNotifications}
                    className="text-[11px] font-medium text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                  >
                    🗑️ Limpar
                  </button>
                </div>
              </div>

              {/* Notification List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {notifications
                  .filter(n => {
                    if (notificationFilter === 'unread') return !n.read;
                    if (notificationFilter === 'critical') return n.severity === 'critical';
                    return true;
                  })
                  .map(n => (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-xl border transition-all relative ${
                        !n.read ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            n.severity === 'critical' ? 'bg-red-100 text-red-700 border border-red-200' :
                            n.severity === 'warning' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {n.type === 'speed' ? '⚡ Velocidade' :
                             n.type === 'command' ? '⚙️ Comando' :
                             n.type === 'battery' ? '🔋 Bateria' :
                             n.type === 'geofence' ? '📍 Cerca' : 'ℹ️ Sistema'}
                          </span>
                          {!n.read && (
                            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-gray-400">{n.timestamp}</span>
                          <button
                            onClick={() => handleDeleteNotification(n.id)}
                            className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors"
                            title="Apagar notificação"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h4 className="font-bold text-gray-800 text-sm mb-1">{n.title}</h4>
                      <p className="text-xs text-gray-600 leading-relaxed mb-2.5">{n.message}</p>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100/80">
                        {n.vehicleName && (
                          <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                            🚙 {n.vehicleName}
                          </span>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                          {n.vehicleName && (
                            <button
                              onClick={() => {
                                const matched = vehicles.find((v: any) => v.name === n.vehicleName || v.id === n.vehicleId);
                                if (matched) {
                                  setSelectedVehicle(matched);
                                  setActiveModule('rastreamento');
                                  setShowNotificationDrawer(false);
                                  showToast(`📍 Centrando no mapa: ${matched.name}`);
                                } else {
                                  setActiveModule('rastreamento');
                                  setShowNotificationDrawer(false);
                                }
                              }}
                              className="text-xs font-bold text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                            >
                              📍 Ver no Mapa
                            </button>
                          )}
                          {!n.read && (
                            <button
                              onClick={() => {
                                setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item));
                              }}
                              className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded"
                              title="Marcar como lida"
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                {notifications.length === 0 && (
                  <div className="text-center py-12 px-4">
                    <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Bell className="w-7 h-7 opacity-75" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">Nenhuma notificação no momento</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto mb-4">
                      Alertas de partida, ignição, velocidade, corte de bateria e cercas virtuais aparecerão aqui em tempo real.
                    </p>
                    <button
                      onClick={() => {
                        addNotification({
                          title: '🧪 Notificação de Teste',
                          message: 'O sistema de notificações em tempo real com alerta sonoro e push está 100% ativo!',
                          type: 'command',
                          severity: 'info',
                          vehicleName: 'GKD Mobility'
                        });
                      }}
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      Enviar Notificação de Teste
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3 bg-gray-50 border-t border-gray-200 text-center shrink-0">
                <button
                  onClick={() => setShowNotificationDrawer(false)}
                  className="w-full py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-xl text-xs font-bold transition-colors"
                >
                  Fechar Painel
                </button>
              </div>

            </div>
          </div>
        )}

        {photoViewerUrl && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1020] backdrop-blur-md p-4 animate-fade-in" onClick={() => setPhotoViewerUrl(null)}>
            <div className="bg-white p-4 rounded-2xl shadow-2xl max-w-lg w-full relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <span>📷</span> Foto / Avatar do Ícone
                </h3>
                <button 
                  onClick={() => setPhotoViewerUrl(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="w-full h-80 bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center shadow-inner">
                <img referrerPolicy="no-referrer" src={photoViewerUrl} alt="Foto ampliada" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={() => setPhotoViewerUrl(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pre-Alert Reason Selector Modal (Select Roubo, Furto, or Perda first) */}
        {emergencySelector && emergencySelector.show && (
          <div
            className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-[9999] backdrop-blur-md p-4 animate-fade-in select-none"
            onClick={() => setEmergencySelector(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden border-2 border-red-500 p-5 text-center space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col items-center justify-center">
                <span className="text-4xl mb-1 animate-bounce">🚨</span>
                <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">
                  SELECIONE A OCORRÊNCIA
                </h3>
                <p className="text-xs text-slate-600 font-medium mt-1">
                  Escolha o motivo antes de acionar o alerta e o alarme sonoro em volume máximo:
                </p>
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const devName = emergencySelector.deviceName || 'Celular / Rastreador GPS';
                    const phone = emergencySelector.phoneNumber;
                    setEmergencySelector(null);
                    const vToUpdate = vehiclesRef.current.find(v => v.phoneNumber === phone || (v.name && v.name === devName));
                    if (vToUpdate) {
                      handleUpdateVehicle({ ...vToUpdate, status: 'Alarm' });
                    }
                    addNotification({
                      title: '🚨 Alerta Enviado: ROUBO',
                      message: `Alerta de ROUBO enviado para ${devName}.`,
                      type: 'command', severity: 'critical', vehicleName: devName
                    });
                    showToast(`🚨 Alerta de ROUBO enviado para ${devName}!`);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <span>🔴</span> ROUBO (CELULAR ROUBADO)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const devName = emergencySelector.deviceName || 'Celular / Rastreador GPS';
                    const phone = emergencySelector.phoneNumber;
                    setEmergencySelector(null);
                    const vToUpdate = vehiclesRef.current.find(v => v.phoneNumber === phone || (v.name && v.name === devName));
                    if (vToUpdate) {
                      handleUpdateVehicle({ ...vToUpdate, status: 'Alarm' });
                    }
                    addNotification({
                      title: '🚨 Alerta Enviado: FURTO',
                      message: `Alerta de FURTO enviado para ${devName}.`,
                      type: 'command', severity: 'critical', vehicleName: devName
                    });
                    showToast(`🚨 Alerta de FURTO enviado para ${devName}!`);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <span>🟠</span> FURTO (CELULAR FURTADO)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const devName = emergencySelector.deviceName || 'Celular / Rastreador GPS';
                    const phone = emergencySelector.phoneNumber;
                    setEmergencySelector(null);
                    const vToUpdate = vehiclesRef.current.find(v => v.phoneNumber === phone || (v.name && v.name === devName));
                    if (vToUpdate) {
                      handleUpdateVehicle({ ...vToUpdate, status: 'Alarm' });
                    }
                    addNotification({
                      title: '🚨 Alerta Enviado: PERDA',
                      message: `Alerta de PERDA enviado para ${devName}.`,
                      type: 'command', severity: 'critical', vehicleName: devName
                    });
                    showToast(`🚨 Alerta de PERDA enviado para ${devName}!`);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <span>🟡</span> PERDA (CELULAR PERDIDO)
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEmergencySelector(null)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Envio Duplo Garantido (Rede GPRS + SMS / WhatsApp) */}
        {dualDispatchData && dualDispatchData.isOpen && (
          <div
            className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-[9999] backdrop-blur-md p-4 animate-fade-in select-none"
            onClick={() => setDualDispatchData(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full relative overflow-hidden border border-gray-100 p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto text-xl font-bold animate-bounce">
                  ⚡
                </div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                  Garantia de Envio do Comando
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  O comando <strong className="text-blue-600 font-bold">[{dualDispatchData.commandName}]</strong> foi disparado via <strong className="font-bold">GPRS/Internet</strong> para <strong className="font-bold">{dualDispatchData.vehicleName}</strong>.
                </p>

                {/* Status GPRS detalhado */}
                <div className={`text-xs p-3 rounded-2xl border text-left font-sans flex items-start gap-2.5 ${
                  dualDispatchData.flespiQueued !== false
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <span className="text-base mt-0.5">{dualDispatchData.flespiQueued !== false ? '🛰️' : '⚠️'}</span>
                  <div className="space-y-1 flex-1">
                    <div className="font-bold text-[11px] uppercase tracking-wider">
                      Status da Transmissão GPRS:
                    </div>
                    <div className="text-[11px] leading-tight">
                      {dualDispatchData.flespiStatus || 'Enviado para a fila do rastreador (protocolo Coban / 109 / J / stop).'}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 p-3 rounded-2xl leading-tight text-left">
                  <span className="font-bold block text-slate-800 mb-1">💡 Dica de Contingência:</span>
                  Se o chip do rastreador estiver sem pacote de dados de internet (GPRS) ou o aparelho estiver em repouso profundo, envie também por <strong>WhatsApp</strong> ou <strong>SMS</strong> para corte imediato pela rede GSM:
                </p>
              </div>

              {/* Dynamic Number Input Field if empty or if user wants to change */}
              <div className="space-y-1 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                <label className="block text-[10px] font-bold text-gray-500 uppercase">Número do Chip (Rastreador / Celular)</label>
                <input
                  type="text"
                  placeholder="Ex: +55 (11) 99999-9999"
                  value={dualDispatchData.phoneNumber}
                  onChange={(e) => setDualDispatchData({
                    ...dualDispatchData,
                    phoneNumber: e.target.value
                  })}
                  className="w-full text-xs font-bold font-mono bg-white border border-gray-200 rounded-lg p-2 outline-none focus:border-blue-500"
                />
                <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono mt-1 px-1">
                  <span>Comando a Enviar:</span>
                  <span className="bg-gray-200 text-gray-700 font-extrabold px-1.5 py-0.5 rounded text-[9px] uppercase">{dualDispatchData.smsCommand}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const phone = (dualDispatchData.phoneNumber || '').replace(/[^0-9]/g, '');
                    if (!phone) {
                      showToast('⚠️ Informe o número de telefone do chip do rastreador.');
                      return;
                    }
                    const waUri = `https://wa.me/${phone}?text=${encodeURIComponent(dualDispatchData.smsCommand)}`;
                    window.open(waUri, '_blank');
                    showToast(`💬 WhatsApp aberto com comando [${dualDispatchData.smsCommand}] para ${phone}`);
                    setDualDispatchData(null);
                  }}
                  className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer border border-emerald-500"
                >
                  <span className="text-lg">💬</span>
                  <span>Via WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const phone = (dualDispatchData.phoneNumber || '').replace(/[^0-9]/g, '');
                    if (!phone) {
                      showToast('⚠️ Informe o número de telefone do chip do rastreador.');
                      return;
                    }
                    const smsUri = `sms:${phone}?body=${encodeURIComponent(dualDispatchData.smsCommand)}`;
                    window.open(smsUri, '_self');
                    showToast(`📱 SMS disparado com comando [${dualDispatchData.smsCommand}] para ${phone}`);
                    setDualDispatchData(null);
                  }}
                  className="py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer border border-blue-500"
                >
                  <span className="text-lg">📱</span>
                  <span>Via SMS</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 flex gap-2">
                {dualDispatchData.deviceId && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const qRes = await fetch(`https://flespi.io/gw/devices/${dualDispatchData.deviceId}/commands-queue/all`, {
                          headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
                        });
                        const qData = await qRes.json();
                        const count = qData?.result?.length || 0;
                        if (count === 0) {
                          showToast('✅ O rastreador já recebeu e executou todos os comandos da fila GPRS!');
                        } else {
                          showToast(`⏳ ${count} comando(s) ainda aguardando transmissão ao rastreador.`);
                        }
                      } catch {
                        showToast('📡 Verificando conexão do aparelho...');
                      }
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer text-center"
                  >
                    🔄 Verificar Entrega
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDualDispatchData(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-colors cursor-pointer text-center"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Interativo de Confirmação & Descrição de Comando */}
        {actionConfirm && actionConfirm.isOpen && (
          <div
            className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-[10000] backdrop-blur-md p-4 animate-fade-in select-none"
            onClick={() => setActionConfirm(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden border border-gray-100 p-5 sm:p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl shadow-inner shrink-0">
                    {actionConfirm.icon}
                  </div>
                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${actionConfirm.badgeColor}`}>
                      {actionConfirm.badge}
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight mt-1">
                      {actionConfirm.title}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionConfirm(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Target Vehicle pill */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 text-[10px] block font-semibold uppercase">Veículo Alvo</span>
                  <strong className="text-slate-800 text-sm font-bold">{actionConfirm.vehicle.name || 'Sem Nome'}</strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 text-[10px] block font-semibold uppercase">Placa / Status</span>
                  <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {actionConfirm.vehicle.licensePlate || 'Sem Placa'}
                  </span>
                </div>
              </div>

              {/* Description Block */}
              <div className="space-y-2.5 text-xs">
                <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-blue-900 flex items-center gap-1.5 uppercase text-[10px] tracking-wide">
                    ℹ️ O que este botão faz:
                  </span>
                  <p className="text-blue-950 font-medium leading-relaxed">
                    {actionConfirm.description}
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-gray-800 flex items-center gap-1.5 uppercase text-[10px] tracking-wide">
                    ⚙️ Como funciona no veículo:
                  </span>
                  <p className="text-gray-700 leading-relaxed">
                    {actionConfirm.howItWorks}
                  </p>
                </div>

                {actionConfirm.warningNote && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-900 leading-relaxed font-medium">
                    {actionConfirm.warningNote}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const onConf = actionConfirm.onConfirm;
                    setActionConfirm(null);
                    onConf();
                  }}
                  className={`w-full py-3.5 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 cursor-pointer ${actionConfirm.confirmColor}`}
                >
                  <span>{actionConfirm.icon}</span>
                  <span>{actionConfirm.confirmLabel}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionConfirm(null)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer text-center"
                >
                  Cancelar / Voltar
                </button>
              </div>
            </div>
          </div>
        )}

        </div>
  );
}
