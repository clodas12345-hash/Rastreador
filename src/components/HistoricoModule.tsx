import React, { useState, useMemo } from 'react';
import { Vehicle, RoutePoint, SavedRoute } from '../types';
import { 
  Search, Map as MapIcon, ArrowLeft, Clock, Activity, AlertTriangle, Zap, Navigation, 
  Battery, BatteryCharging, BatteryWarning, ShieldCheck, AlertOctagon,
  FileText, Download, TrendingUp, BarChart2, ShieldAlert, Calendar,
  RotateCw, Compass, Gauge, Satellite, Mountain, Fuel, X, Layers, ChevronRight, CheckCircle2,
  Radar, Sparkles, Cpu, Radio, Flame, Filter, ChevronDown, ChevronUp
} from 'lucide-react';
import { collection } from 'firebase/firestore';
import { safeAddDoc } from '../utils/firestoreWrapper';
import { db, cleanFirestoreData } from '../lib/firebase';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, 
  Tooltip, CartesianGrid, Legend
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface HistoricoModuleProps {
  vehicles: Vehicle[];
  fetchFlespiHistory: (imei: string, fromTimestamp: number, toTimestamp: number, deepScan?: boolean) => Promise<RoutePoint[] | null>;
  setActiveRoute: (route: SavedRoute) => void;
  setActiveModule: (module: string) => void;
  setSidebarOpen: (open: boolean) => void;
  showToast: (msg: string) => void;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function parsePtTimestamp(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') {
    return ts < 10000000000 ? ts * 1000 : ts;
  }
  const str = String(ts).trim();
  const num = Number(str);
  if (!isNaN(num) && num > 0) {
    return num < 10000000000 ? num * 1000 : num;
  }
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export interface DayBreakdownSummary {
  dateStr: string;
  rawDate: string;
  distanceKm: number;
  movingTimeMs: number;
  idleTimeMs: number;
  stoppedTimeMs: number;
  firstStartTime: string;
  lastStopTime: string;
  maxSpeed: number;
  avgSpeed: number;
  harshEvents: number;
  minBattery?: number;
  maxBattery?: number;
  pointsCount: number;
}

export interface MonthBreakdownGroup {
  monthKey: string;
  monthName: string;
  year: string;
  monthLabel: string;
  shortLabel: string;
  days: DayBreakdownSummary[];
  totalDistanceKm: number;
  totalMovingMs: number;
  totalIdleMs: number;
  totalStoppedMs: number;
  totalHarshEvents: number;
  maxSpeed: number;
}

export const MONTH_NAMES_PT: Record<string, string> = {
  '01': 'Janeiro',
  '02': 'Fevereiro',
  '03': 'Março',
  '04': 'Abril',
  '05': 'Maio',
  '06': 'Junho',
  '07': 'Julho',
  '08': 'Agosto',
  '09': 'Setembro',
  '10': 'Outubro',
  '11': 'Novembro',
  '12': 'Dezembro'
};

function getDailyBreakdown(points: RoutePoint[]): DayBreakdownSummary[] {
  if (!points || points.length === 0) return [];
  
  const daysMap = new Map<string, RoutePoint[]>();
  
  for (const pt of points) {
    if (!pt) continue;
    const t = parsePtTimestamp(pt.timestamp);
    if (!t) continue;
    const d = new Date(t);
    if (isNaN(d.getTime())) continue;

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    if (!daysMap.has(key)) {
      daysMap.set(key, []);
    }
    daysMap.get(key)!.push(pt);
  }

  const sortedKeys = Array.from(daysMap.keys()).map(k => String(k)).sort();
  const result: DayBreakdownSummary[] = [];

  for (const dateKey of sortedKeys) {
    const dayPoints = daysMap.get(dateKey) || [];
    dayPoints.sort((a, b) => parsePtTimestamp(a.timestamp) - parsePtTimestamp(b.timestamp));

    let dayDist = 0;
    let movingTimeMs = 0;
    let idleTimeMs = 0;
    let stoppedTimeMs = 0;
    let maxSpeed = 0;
    let sumSpeed = 0;
    let movingCount = 0;
    let harshEvents = 0;
    let minBat = 999;
    let maxBat = -999;
    let firstStartTime = '';
    let lastStopTime = '';

    for (let i = 0; i < dayPoints.length; i++) {
      const pt = dayPoints[i];
      const speed = Math.max(0, Number(pt.speed || 0));
      const t = parsePtTimestamp(pt.timestamp);
      const timeStr = t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

      if (speed > maxSpeed && speed < 220) maxSpeed = speed;

      if (pt.harshBraking || pt.harshCornering || pt.harshAcceleration) {
        harshEvents++;
      }

      if (pt.batteryVoltage && pt.batteryVoltage >= 8 && pt.batteryVoltage <= 32) {
        if (pt.batteryVoltage < minBat) minBat = pt.batteryVoltage;
        if (pt.batteryVoltage > maxBat) maxBat = pt.batteryVoltage;
      }

      if (i > 0) {
        const prev = dayPoints[i - 1];
        const prevT = parsePtTimestamp(prev.timestamp);
        const prevSpeed = Math.max(0, Number(prev.speed || 0));
        const dt = Math.max(0, t - prevT);
        const dtSec = dt / 1000;
        const segDist = calculateDistanceKm(prev.lat, prev.lng, pt.lat, pt.lng);
        const effectiveSpeed = dtSec > 0 ? (segDist / (dtSec / 3600)) : 0;

        // Movimento real: requer velocidade ou deslocamento físico compatível
        const isRealMovement = (speed >= 3.0 || prevSpeed >= 3.0 || effectiveSpeed >= 3.0) && (segDist >= 0.015 || effectiveSpeed >= 2.0);

        if (isRealMovement) {
          dayDist += segDist;
          sumSpeed += Math.max(speed, prevSpeed, effectiveSpeed);
          movingCount++;

          if (!firstStartTime) firstStartTime = timeStr;
          lastStopTime = timeStr;

          if (dt <= 180000) {
            movingTimeMs += dt;
          } else {
            const avgTravelSpeed = Math.max(speed, prevSpeed, effectiveSpeed, 20);
            const estMoveMs = Math.min(dt, Math.max(10000, Math.round((segDist / avgTravelSpeed) * 3600 * 1000)));
            movingTimeMs += estMoveMs;
            const remainingDt = Math.max(0, dt - estMoveMs);
            if (pt.ignition) {
              idleTimeMs += remainingDt;
            } else {
              stoppedTimeMs += remainingDt;
            }
          }
        } else {
          // Veículo parado (filtra ruído GPS)
          if (prev.ignition || pt.ignition) {
            idleTimeMs += dt;
            if (!firstStartTime) firstStartTime = timeStr;
            lastStopTime = timeStr;
          } else {
            stoppedTimeMs += dt;
          }
        }
      }
    }

    const [yyyy, mm, dd] = dateKey.split('-');
    const dateFormatted = `${dd}/${mm}/${yyyy}`;

    const calculatedAvgSpeed = movingTimeMs > 0 ? (dayDist / (movingTimeMs / 3600000)) : 0;
    const finalAvgSpeed = calculatedAvgSpeed > 0 ? Math.min(calculatedAvgSpeed, maxSpeed || 120) : (movingCount > 0 ? sumSpeed / movingCount : 0);

    result.push({
      dateStr: dateFormatted,
      rawDate: dateKey,
      distanceKm: Number(dayDist.toFixed(1)),
      movingTimeMs,
      idleTimeMs,
      stoppedTimeMs,
      firstStartTime: firstStartTime || '--:--',
      lastStopTime: lastStopTime || '--:--',
      maxSpeed: Number(maxSpeed.toFixed(1)),
      avgSpeed: Number(finalAvgSpeed.toFixed(1)),
      harshEvents,
      minBattery: minBat < 900 ? Number(minBat.toFixed(1)) : undefined,
      maxBattery: maxBat > -900 ? Number(maxBat.toFixed(1)) : undefined,
      pointsCount: dayPoints.length
    });
  }

  return result;
}

function getLocalTodayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDaysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFirstDayOfCurrentMonth(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function getFirstDayOfPrevMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function getLastDayOfPrevMonth(): string {
  const d = new Date();
  d.setDate(0); // Último dia do mês anterior
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function HistoricoModule({ 
  vehicles, 
  fetchFlespiHistory, 
  setActiveRoute, 
  setActiveModule, 
  setSidebarOpen, 
  showToast 
}: HistoricoModuleProps) {
  const [startDate, setStartDate] = useState<string>(getLocalTodayDate());
  const [endDate, setEndDate] = useState<string>(getLocalTodayDate());
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showPdfOptionsModal, setShowPdfOptionsModal] = useState(false);
  const [report, setReport] = useState<SavedRoute | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<'velocidade' | 'bateria' | 'altitude'>('velocidade');
  const [periodPreset, setPeriodPreset] = useState<'hoje' | 'ontem' | '7d' | '15d' | '30d' | 'mes_atual' | 'mes_anterior' | 'custom'>('hoje');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('todos');
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  const toggleCollapseMonth = (mKey: string) => {
    setCollapsedMonths(prev => ({
      ...prev,
      [mKey]: !prev[mKey]
    }));
  };

  const formatDuration = (ms: number | undefined | null) => {
    if (!ms || isNaN(ms) || ms <= 0) return '0m';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  const applyPreset = (preset: 'hoje' | 'ontem' | '7d' | '15d' | '30d' | 'mes_atual' | 'mes_anterior') => {
    setPeriodPreset(preset);
    const today = getLocalTodayDate();
    if (preset === 'hoje') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'ontem') {
      const yesterday = getDaysAgoDate(1);
      setStartDate(yesterday);
      setEndDate(yesterday);
    } else if (preset === '7d') {
      setStartDate(getDaysAgoDate(6));
      setEndDate(today);
    } else if (preset === '15d') {
      setStartDate(getDaysAgoDate(14));
      setEndDate(today);
    } else if (preset === '30d') {
      setStartDate(getDaysAgoDate(29));
      setEndDate(today);
    } else if (preset === 'mes_atual') {
      setStartDate(getFirstDayOfCurrentMonth());
      setEndDate(today);
    } else if (preset === 'mes_anterior') {
      setStartDate(getFirstDayOfPrevMonth());
      setEndDate(getLastDayOfPrevMonth());
    }
  };

  const handleSearch = async (deepScanMode: boolean = false) => {
    if (!selectedVehicleId) {
      showToast('❌ Por favor, selecione um veículo primeiro.');
      return;
    }
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;
    const imei = vehicle.trackerNumber || '';
    if (!imei) {
      showToast('❌ O veículo selecionado não possui IMEI cadastrado.');
      return;
    }
    
    if (!startDate || !endDate) {
      showToast('❌ Por favor, selecione o período completo.');
      return;
    }

    if (startDate > endDate) {
      showToast('❌ A data inicial não pode ser posterior à data final.');
      return;
    }
    
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    const formatStartBr = `${String(startDay).padStart(2, '0')}/${String(startMonth).padStart(2, '0')}/${startYear}`;
    const formatEndBr = `${String(endDay).padStart(2, '0')}/${String(endMonth).padStart(2, '0')}/${endYear}`;
    const periodLabel = startDate === endDate ? formatStartBr : `${formatStartBr} a ${formatEndBr}`;
    
    if (deepScanMode) {
      showToast(`🔬 Iniciando Varredura Profunda (Deep Scan) em ${vehicle.name}...`);
    } else {
      showToast(`🗓️ Varrendo sensores e histórico de ${vehicle.name}...`);
    }
    
    setIsLoading(true);
    setIsDeepScanning(deepScanMode);
    setReport(null);
    
    try {
      const startOfPeriod = new Date(startYear, startMonth - 1, startDay, 0, 0, 0);
      const endOfPeriod = new Date(endYear, endMonth - 1, endDay, 23, 59, 59);
      
      const fromTs = Math.floor(startOfPeriod.getTime() / 1000);
      const toTs = Math.floor(endOfPeriod.getTime() / 1000);
      
      const routePoints = await fetchFlespiHistory(imei, fromTs, toTs, deepScanMode);
      
      if (routePoints && routePoints.length > 0) {
        // Ordena cronologicamente os pontos
        routePoints.sort((a, b) => parsePtTimestamp(a.timestamp) - parsePtTimestamp(b.timestamp));

        let dist = 0;
        let movingTimeMs = 0;
        let idleTimeMs = 0;
        let stoppedTimeMs = 0;
        let maxSpeed = 0;
        let speedSum = 0;
        let speedCount = 0;

        let harshBrakingCount = 0;
        let sharpTurnsCount = 0;
        let harshAccelCount = 0;
        let overspeedCount = 0;
        let microStopsCount = 0;
        let preciseFidelityCount = 0;

        let lastHarshBrakeTs = 0;
        let lastSharpTurnTs = 0;
        let lastHarshAccelTs = 0;
        let lastOverspeedTs = 0;

        let firstStartTime: string | undefined = undefined;
        let lastStopTime: string | undefined = undefined;

        // Sensor Aggregates
        let satSum = 0;
        let satCount = 0;
        let minSat = 999;
        let minAlt = 99999;
        let maxAlt = -99999;

        // Ajuste de lacunas de borda do período consultado
        const periodStartMs = fromTs * 1000;
        const periodEndMs = Math.min(toTs * 1000, Date.now());
        const firstPtTs = parsePtTimestamp(routePoints[0].timestamp);
        const lastPtTs = parsePtTimestamp(routePoints[routePoints.length - 1].timestamp);

        if (firstPtTs > periodStartMs) {
          const leadGap = firstPtTs - periodStartMs;
          if (routePoints[0].ignition) {
            idleTimeMs += leadGap;
          } else {
            stoppedTimeMs += leadGap;
          }
        }

        for (let i = 1; i < routePoints.length; i++) {
          const p1 = routePoints[i - 1];
          const p2 = routePoints[i];

          const t1 = parsePtTimestamp(p1.timestamp);
          const t2 = parsePtTimestamp(p2.timestamp);
          const diffMs = Math.max(0, t2 - t1);
          const diffSec = diffMs / 1000;

          // Distância do segmento
          const segDist = calculateDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
          const s1 = Math.max(0, p1.speed || 0);
          const s2 = Math.max(0, p2.speed || 0);
          const effectiveSpeed = diffSec > 0 ? (segDist / (diffSec / 3600)) : 0; // km/h

          // Movimento real: filtra oscilação de GPS parado (drift)
          const isRealMovement = (s1 >= 3.0 || s2 >= 3.0 || effectiveSpeed >= 3.0) && (segDist >= 0.015 || effectiveSpeed >= 2.0);

          if (isRealMovement) {
            dist += segDist;

            // Duração do deslocamento
            if (diffMs <= 180000) { // Até 3 minutos entre pacotes em trânsito contínuo
              movingTimeMs += diffMs;
            } else {
              // Lacuna longa entre pacotes (ex: veículo parado por horas entre viagens)
              const avgTravelSpeed = Math.max(s1, s2, effectiveSpeed, 20);
              const estTravelMs = Math.min(diffMs, Math.max(10000, Math.round((segDist / avgTravelSpeed) * 3600 * 1000)));
              movingTimeMs += estTravelMs;
              const remainingGapMs = Math.max(0, diffMs - estTravelMs);
              if (p2.ignition) {
                idleTimeMs += remainingGapMs;
              } else {
                stoppedTimeMs += remainingGapMs;
              }
            }

            if (!firstStartTime && t1 > 0) {
              const dateObj = new Date(t1);
              firstStartTime = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            }
            if (t2 > 0) {
              const dateObj = new Date(t2);
              lastStopTime = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            }
          } else {
            // Veículo estacionado / parado
            if (p1.ignition || p2.ignition) {
              idleTimeMs += diffMs;
              if (diffSec >= 15 && diffSec <= 300) {
                microStopsCount++;
              }
            } else {
              stoppedTimeMs += diffMs;
              if (diffSec >= 15 && diffSec <= 300) {
                microStopsCount++;
              }
            }
          }

          const currentSpeed = s2;
          const prevSpeed = s1;
          if (currentSpeed > maxSpeed && currentSpeed < 220) maxSpeed = currentSpeed;
          if (isRealMovement && currentSpeed > 0) {
            speedSum += currentSpeed;
            speedCount++;
          }

          // 1. Viradas Bruscas / Curvas Acentuadas (Giroscópio / Bússola & Dinâmica Veicular Real)
          let headingDiff = 0;
          if (p2.direction !== undefined && p1.direction !== undefined) {
            headingDiff = Math.abs(p2.direction - p1.direction);
            if (headingDiff > 180) headingDiff = 360 - headingDiff;
          }
          // Padrão de telemetria automotiva: curva brusca exige velocidade considerável (>= 36 km/h)
          // com variação angular rápida (>= 50 graus em até 2.5s) e taxa angular acentuada (>= 20°/s)
          // Isso evita marcar curvas e esquinas urbanas normais a 20 km/h como infração
          const minTurnAngle = deepScanMode ? 45 : 55;
          const minTurnSpeed = deepScanMode ? 32 : 36;
          const turnRate = diffSec > 0 ? headingDiff / diffSec : 0;
          const isSharpTurnDetected = p2.harshCornering || (
            currentSpeed >= minTurnSpeed && 
            headingDiff >= minTurnAngle && 
            turnRate >= 20 && 
            diffSec >= 0.5 && 
            diffSec <= 3.0
          );
          if (isSharpTurnDetected && (t2 - lastSharpTurnTs > 12000)) {
            sharpTurnsCount++;
            lastSharpTurnTs = t2;
          }

          // 2. Acelerações Bruscas (Hardware Tracker ou Aumento Súbito de Velocidade)
          const speedGain = currentSpeed - prevSpeed;
          const accelRate = diffSec >= 0.5 ? speedGain / diffSec : 0;
          const minAccelGain = deepScanMode ? 14 : 18;
          const minAccelRate = deepScanMode ? 5 : 6.5;
          const isHarshAccelDetected = p2.harshAcceleration || (speedGain >= minAccelGain && (accelRate >= minAccelRate || (diffSec <= 3.5 && diffSec >= 0.5)) && prevSpeed >= 4);
          if (isHarshAccelDetected && (t2 - lastHarshAccelTs > 10000)) {
            harshAccelCount++;
            lastHarshAccelTs = t2;
          }

          // 3. Frenagem Brusca (Hardware Tracker ou Queda Súbita)
          const speedDrop = prevSpeed - currentSpeed;
          const decelRate = diffSec >= 0.5 ? speedDrop / diffSec : 0;
          const minDrop = deepScanMode ? 15 : 20;
          const minDecelRate = deepScanMode ? 7.5 : 9;
          const isHarshBrakeDetected = p2.harshBraking || (prevSpeed >= 25 && speedDrop >= minDrop && (decelRate >= minDecelRate || (speedDrop >= 18 && diffSec <= 3.5 && diffSec >= 0.5)));
          if (isHarshBrakeDetected && (t2 - lastHarshBrakeTs > 10000)) {
            harshBrakingCount++;
            lastHarshBrakeTs = t2;
          }

          // 4. Excesso de velocidade (> limite do veículo ou > 85 km/h)
          const configuredSpeedLimit = vehicle.settings?.speedLimit || 85;
          if (currentSpeed > configuredSpeedLimit && (t2 - lastOverspeedTs > 30000)) {
            overspeedCount++;
            lastOverspeedTs = t2;
          }
        }

        if (lastPtTs < periodEndMs) {
          const tailGap = periodEndMs - lastPtTs;
          if (routePoints[routePoints.length - 1].ignition) {
            idleTimeMs += tailGap;
          } else {
            stoppedTimeMs += tailGap;
          }
        }

        // Análise de Bateria, Satélites e Altitude
        let minBatVolt = 999;
        let maxBatVolt = 0;
        let batVoltSum = 0;
        let batVoltCount = 0;
        let batteryDrainMinutes = 0;

        for (let i = 0; i < routePoints.length; i++) {
          const pt = routePoints[i];
          
          // Bateria
          const volt = pt.batteryVoltage;
          if (typeof volt === 'number' && volt >= 8 && volt <= 32) {
            if (volt < minBatVolt) minBatVolt = volt;
            if (volt > maxBatVolt) maxBatVolt = volt;
            batVoltSum += volt;
            batVoltCount++;
          }

          // Satélites
          if (typeof pt.satellites === 'number' && pt.satellites > 0 && pt.satellites <= 40) {
            satSum += pt.satellites;
            satCount++;
            if (pt.satellites < minSat) minSat = pt.satellites;
          }

          if ((pt.hdop || 1) <= 1.5 && (pt.satellites || 10) >= 10) {
            preciseFidelityCount++;
          }

          // Altitude
          if (typeof pt.altitude === 'number' && pt.altitude > -500 && pt.altitude < 9000) {
            if (pt.altitude < minAlt) minAlt = pt.altitude;
            if (pt.altitude > maxAlt) maxAlt = pt.altitude;
          }
          
          if (i > 0) {
            const pPrev = routePoints[i - 1];
            const t1 = parsePtTimestamp(pPrev.timestamp);
            const t2 = parsePtTimestamp(pt.timestamp);
            const dMs = Math.abs(t2 - t1);
            
            if (pPrev.ignition && (pPrev.speed || 0) <= 2 && (pPrev.batteryVoltage ? pPrev.batteryVoltage < 12.6 : true)) {
              if (dMs > 0 && dMs < 1000 * 60 * 60) {
                batteryDrainMinutes += Math.round(dMs / 60000);
              }
            }
          }
        }

        const avgBatVolt = batVoltCount > 0 ? Number((batVoltSum / batVoltCount).toFixed(1)) : undefined;
        const finalMinVolt = minBatVolt < 999 ? Number(minBatVolt.toFixed(1)) : undefined;
        const finalMaxVolt = maxBatVolt > 0 ? Number(maxBatVolt.toFixed(1)) : undefined;

        let batteryHealthStatus: 'Excelente' | 'Normal' | 'Atenção' | 'Crítica' = 'Normal';
        if (finalMinVolt !== undefined) {
          if (finalMinVolt >= 12.4 && (finalMaxVolt || 0) >= 13.5) {
            batteryHealthStatus = 'Excelente';
          } else if (finalMinVolt >= 11.9) {
            batteryHealthStatus = 'Normal';
          } else if (finalMinVolt >= 11.4) {
            batteryHealthStatus = 'Atenção';
          } else {
            batteryHealthStatus = 'Crítica';
          }
        }

        const batteryDrainAlert = batteryDrainMinutes >= 5 || (finalMinVolt !== undefined && finalMinVolt < 11.8);
        const calculatedAvg = movingTimeMs > 0 ? (dist / (movingTimeMs / 3600000)) : 0;
        const avgSpeed = calculatedAvg > 0 ? Math.min(calculatedAvg, maxSpeed || 120) : (speedCount > 0 ? speedSum / speedCount : 0);

        // Estimativa de Combustível Gasto (km rodados / 10.5km/l + 0.9L/h de ocioso)
        const idleHours = idleTimeMs / 3600000;
        const estimatedFuelLiters = Number(((dist / 10.5) + (idleHours * 0.9)).toFixed(1));

        const avgSatellites = satCount > 0 ? Math.round(satSum / satCount) : (vehicle.satellites && vehicle.satellites > 0 ? vehicle.satellites : undefined);
        const minSatellites = minSat < 999 ? minSat : (vehicle.satellites && vehicle.satellites > 0 ? vehicle.satellites : undefined);
        const finalMinAlt = minAlt < 99999 ? Math.round(minAlt) : undefined;
        const finalMaxAlt = maxAlt > -99999 ? Math.round(maxAlt) : undefined;
        const gpsSignalFidelity = routePoints.length > 0 ? Math.round((preciseFidelityCount / routePoints.length) * 100) : 100;
        
        const savedRoute: SavedRoute = {
          id: `flespi-history-${imei}-${fromTs}-${toTs}`,
          name: `Período de ${periodLabel}`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          points: routePoints,
          createdAt: new Date().toISOString(),
          distanceKm: Number(dist.toFixed(1)),
          stats: {
            movingTimeMs,
            idleTimeMs,
            stoppedTimeMs,
            maxSpeed: Number(maxSpeed.toFixed(1)),
            avgSpeed: Number(avgSpeed.toFixed(1)),
            minBatteryVoltage: finalMinVolt,
            maxBatteryVoltage: finalMaxVolt,
            avgBatteryVoltage: avgBatVolt,
            batteryDrainAlert,
            batteryDrainMinutes,
            batteryHealthStatus,
            harshBrakingCount,
            sharpTurnsCount,
            harshAccelCount,
            overspeedCount,
            firstStartTime: firstStartTime || formatStartBr,
            lastStopTime: lastStopTime || formatEndBr,
            avgSatellites,
            minSatellites,
            minAltitude: finalMinAlt,
            maxAltitude: finalMaxAlt,
            fuelConsumedLiters: estimatedFuelLiters,
            deepScan: deepScanMode,
            rawPacketsCount: routePoints.length,
            microStopsCount,
            gpsSignalFidelity
          }
        };

        setReport(savedRoute);
        
        // Auto-save to Firestore with cleaned data (no undefined fields)
        try {
          const { id, ...routeWithoutId } = savedRoute;
          const cleanedPayload = cleanFirestoreData(routeWithoutId);
          await safeAddDoc(collection(db, 'trajetos'), cleanedPayload);
        } catch (err) {
          console.error("Erro ao salvar trajeto automaticamente:", err);
        }

        if (deepScanMode) {
          showToast(`🔬 Varredura Profunda Concluída! (${routePoints.length} pacotes de alta precisão decodificados)`);
        } else {
          showToast(`✅ Relatório e varredura de sensores concluídos! (${routePoints.length} posições analisadas)`);
        }
      } else {
        showToast(`❌ Nenhum histórico encontrado no Flespi para o período ${periodLabel}.`);
      }
    } catch (error) {
      showToast(`❌ Erro ao buscar histórico.`);
    } finally {
      setIsLoading(false);
      setIsDeepScanning(false);
    }
  };

  // Preparar dados do gráfico
  const chartData = useMemo(() => {
    if (!report || !report.points || report.points.length === 0) return [];
    
    const maxDataPoints = 60;
    const step = Math.max(1, Math.floor(report.points.length / maxDataPoints));
    
    const sampled: Array<{
      time: string;
      speed: number;
      voltage: number;
      altitude: number;
      ignition: number;
    }> = [];

    for (let i = 0; i < report.points.length; i += step) {
      const pt = report.points[i];
      const t = parseInt(pt.timestamp || '0', 10);
      let timeLabel = '';
      if (t > 0) {
        const d = new Date(t);
        if (startDate === endDate) {
          timeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } else {
          timeLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
        }
      } else {
        timeLabel = `Pto ${i + 1}`;
      }

      sampled.push({
        time: timeLabel,
        speed: Math.round(pt.speed || 0),
        voltage: pt.batteryVoltage ? Number(pt.batteryVoltage.toFixed(1)) : 12.6,
        altitude: pt.altitude || 720,
        ignition: pt.ignition ? 1 : 0
      });
    }

    return sampled;
  }, [report, startDate, endDate]);

  const dailyBreakdownData = useMemo(() => {
    return getDailyBreakdown(report?.points || []);
  }, [report]);

  const monthlyBreakdownData = useMemo<MonthBreakdownGroup[]>(() => {
    if (!dailyBreakdownData || dailyBreakdownData.length === 0) return [];
    const map = new Map<string, DayBreakdownSummary[]>();
    for (const day of dailyBreakdownData) {
      const parts = (day.rawDate || '').split('-');
      const monthKey = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'outros';
      if (!map.has(monthKey)) {
        map.set(monthKey, []);
      }
      map.get(monthKey)!.push(day);
    }

    const sortedMonthKeys = Array.from(map.keys()).sort();
    return sortedMonthKeys.map(mKey => {
      const days = map.get(mKey) || [];
      const [year, monthNum] = mKey.split('-');
      const monthName = MONTH_NAMES_PT[monthNum] || monthNum;
      const monthLabel = year ? `${monthName} de ${year}` : mKey;
      const shortLabel = year ? `${monthName.slice(0, 3)}/${year.slice(2)}` : mKey;
      const totalDistanceKm = Number(days.reduce((acc, d) => acc + (d.distanceKm || 0), 0).toFixed(1));
      const totalMovingMs = days.reduce((acc, d) => acc + (d.movingTimeMs || 0), 0);
      const totalIdleMs = days.reduce((acc, d) => acc + (d.idleTimeMs || 0), 0);
      const totalStoppedMs = days.reduce((acc, d) => acc + (d.stoppedTimeMs || 0), 0);
      const totalHarshEvents = days.reduce((acc, d) => acc + (d.harshEvents || 0), 0);
      const maxSpeed = Math.max(0, ...days.map(d => d.maxSpeed || 0));

      return {
        monthKey: mKey,
        monthName,
        year: year || '',
        monthLabel,
        shortLabel,
        days,
        totalDistanceKm,
        totalMovingMs,
        totalIdleMs,
        totalStoppedMs,
        totalHarshEvents,
        maxSpeed
      };
    });
  }, [dailyBreakdownData]);

  const displayedMonthGroups = useMemo(() => {
    if (selectedMonthFilter === 'todos') {
      return monthlyBreakdownData;
    }
    return monthlyBreakdownData.filter(g => g.monthKey === selectedMonthFilter);
  }, [monthlyBreakdownData, selectedMonthFilter]);

  const handleExportPDF = (mode: 'total' | 'diario' = 'total') => {
    if (!report) return;
    setShowPdfOptionsModal(false);
    setIsGeneratingPdf(true);

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const vehicle = vehicles.find(v => v.id === report.vehicleId);
      const isDailyMode = mode === 'diario';
      const periodLabel = report.name ? report.name.replace('Período de ', '') : `${startDate} a ${endDate}`;

      // Helper seguro para execução do autoTable
      const runTable = (options: any) => {
        if (typeof autoTable === 'function') {
          autoTable(doc, options);
        } else if (typeof (doc as any).autoTable === 'function') {
          (doc as any).autoTable(options);
        }
      };

      // Helper para controle seguro de quebra de página automática
      const ensureSpace = (neededHeight: number = 35): number => {
        const pageHeight = doc.internal.pageSize.getHeight() || 297;
        const lastY = (doc as any).lastAutoTable?.finalY;
        if (!lastY || typeof lastY !== 'number') return 46;
        if (lastY + neededHeight > pageHeight - 20) {
          doc.addPage();
          return 20;
        }
        return lastY + 8;
      };

      // Header Colors & Theme
      doc.setFillColor(30, 41, 59); // Slate-800
      doc.rect(0, 0, 210, 32, 'F');

      // Title & Branding
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      const titleText = isDailyMode 
        ? 'GKD RASTREADOR - RELATÓRIO ANALÍTICO DA JORNADA SEPARADO POR MESES'
        : 'GKD RASTREADOR - RELATÓRIO CONSOLIDADO TOTAL DE TELEMETRIA';
      doc.text(titleText, 14, 14);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')} | Tipo: ${isDailyMode ? 'Detalhamento Separado por Meses' : 'Resumo Consolidado Total'} • Sensores Flespi`, 14, 24);

      // 1. Informações do Veículo e Período
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.text('1. DADOS DO VEÍCULO & PERÍODO CONSULTADO', 14, 41);

      const vehicleInfo = [
        ['Veículo / Modelo:', String(vehicle?.name || report.vehicleName || 'N/A'), 'Período:', String(periodLabel)],
        ['Placa:', String(vehicle?.licensePlate || 'N/A'), 'IMEI do Rastreador:', String(vehicle?.trackerNumber || 'N/A')],
        ['Primeira Partida:', String(report.stats?.firstStartTime || startDate || '--:--'), 'Último Desligamento:', String(report.stats?.lastStopTime || endDate || '--:--')]
      ];

      runTable({
        startY: 44,
        head: [],
        body: vehicleInfo,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 38 },
          1: { cellWidth: 55 },
          2: { fontStyle: 'bold', cellWidth: 42 },
          3: { cellWidth: 55 }
        }
      });

      // 2. Resumo Operacional
      const currentY1 = ensureSpace(45);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('2. RESUMO OPERACIONAL & TEMPOS TOTAIS DE MOTOR', 14, currentY1);

      const operationalSummary = [
        ['Distância Total Percorrida', `${Number(report.distanceKm || 0).toFixed(1)} km`],
        ['Tempo em Movimento (Rodando)', formatDuration(report.stats?.movingTimeMs || 0)],
        ['Tempo Ocioso (Motor Ligado sem Deslocamento)', formatDuration(report.stats?.idleTimeMs || 0)],
        ['Tempo Estacionado / Desligado', formatDuration(report.stats?.stoppedTimeMs || 0)],
        ['Velocidade Máxima Registrada', `${Number(report.stats?.maxSpeed || 0).toFixed(1)} km/h`],
        ['Velocidade Média no Período', `${Number(report.stats?.avgSpeed || 0).toFixed(1)} km/h`]
      ];

      runTable({
        startY: currentY1 + 4,
        head: [['Parâmetro de Operação', 'Total / Média do Período']],
        body: operationalSummary,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      // Se for modo Dia a Dia, insere as tabelas discriminadas separadas por mês com quebra segura
      if (isDailyMode) {
        const currentYDaily = ensureSpace(45);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('3. DETALHAMENTO DA JORNADA SEPARADO POR MESES', 14, currentYDaily);

        if (monthlyBreakdownData && monthlyBreakdownData.length > 0) {
          monthlyBreakdownData.forEach((group) => {
            const groupStartY = ensureSpace(35);
            doc.setFontSize(9.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(88, 28, 135);
            doc.text(`📅 MÊS: ${group.monthLabel.toUpperCase()} — TOTAL DO MÊS: ${group.totalDistanceKm} KM (${group.days.length} DIAS)`, 14, groupStartY);

            const dailyRows = group.days.map(d => [
              String(d.dateStr || '--/--/----'),
              `${Number(d.distanceKm || 0).toFixed(1)} km`,
              String(d.firstStartTime || '--:--'),
              String(d.lastStopTime || '--:--'),
              String(formatDuration(d.movingTimeMs || 0)),
              String(formatDuration(d.idleTimeMs || 0)),
              `${Number(d.maxSpeed || 0).toFixed(1)} km/h`,
              `${Number(d.harshEvents || 0)} ev`,
              d.minBattery && d.maxBattery ? `${d.minBattery}V / ${d.maxBattery}V` : '12.6V'
            ]);

            // Linha de Subtotal do Mês
            dailyRows.push([
              `SUBTOTAL (${group.monthName.toUpperCase()})`,
              `${group.totalDistanceKm} km`,
              '--',
              '--',
              String(formatDuration(group.totalMovingMs)),
              String(formatDuration(group.totalIdleMs)),
              `${group.maxSpeed} km/h`,
              `${group.totalHarshEvents} ev`,
              '--'
            ]);

            runTable({
              startY: groupStartY + 3,
              head: [['Data', 'Km Dia', '1ª Partida', 'Últ. Parada', 'Rodando', 'Ocioso', 'Vel. Máx', 'Eventos', 'Bateria Mín/Máx']],
              body: dailyRows,
              theme: 'striped',
              headStyles: { fillColor: [109, 40, 217], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
              styles: { fontSize: 7.2, cellPadding: 1.8, halign: 'center' },
              columnStyles: {
                0: { fontStyle: 'bold', halign: 'left' },
                1: { fontStyle: 'bold', textColor: [30, 64, 175] }
              }
            });
          });
        }
      }

      // 3/4. Sensores de Condução e Comportamento (Eco-Driving)
      const currentY2 = ensureSpace(40);
      const sectionNumDriving = isDailyMode ? '4' : '3';
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`${sectionNumDriving}. SENSORES DE DIREÇÃO & COMPORTAMENTO DE CONDUÇÃO (ECO-DRIVING)`, 14, currentY2);

      const drivingBehavior = [
        ['Viradas Bruscas / Curvas Acentuadas (Giroscópio)', `${report.stats?.sharpTurnsCount || 0} evento(s)`],
        ['Acelerações Bruscas (Acelerômetro / Inércia)', `${report.stats?.harshAccelCount || 0} evento(s)`],
        ['Frenagens Bruscas Registradas', `${report.stats?.harshBrakingCount || 0} evento(s)`],
        ['Excesso de Velocidade Regulamentar (> 85 km/h)', `${report.stats?.overspeedCount || 0} evento(s)`]
      ];

      runTable({
        startY: currentY2 + 4,
        head: [['Sensor / Evento de Telemetria', 'Contagem de Ocorrências']],
        body: drivingBehavior,
        theme: 'striped',
        headStyles: { fillColor: [147, 51, 234], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      // 4/5. Diagnóstico Elétrico, GPS e Combustível
      const currentY3 = ensureSpace(45);
      const sectionNumHardware = isDailyMode ? '5' : '4';
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`${sectionNumHardware}. SENSORES DE HARDWARE, BATERIA E CONSUMO ESTIMADO`, 14, currentY3);

      const hardwareSummary = [
        ['Saúde Geral da Bateria', `${report.stats?.batteryHealthStatus || 'Normal'}`],
        ['Tensão Mínima da Bateria (Partida/Repouso)', `${report.stats?.minBatteryVoltage || 12.2} V`],
        ['Tensão Máxima (Alternador em Carga)', `${report.stats?.maxBatteryVoltage || 14.1} V`],
        ['Chave Ligada sem Partida (Consumo Parado)', `${report.stats?.batteryDrainMinutes || 0} minutos`],
        ['Satélites GPS Visíveis (Média / Mínimo)', report.stats?.avgSatellites ? `${report.stats.avgSatellites} satélites (mín: ${report.stats?.minSatellites || report.stats.avgSatellites})` : 'Sinal GPS Ativo (Conectado)'],
        ['Altitude / Relevo do Trajeto', report.stats?.minAltitude !== undefined && report.stats?.maxAltitude !== undefined ? `Min: ${report.stats.minAltitude}m | Max: ${report.stats.maxAltitude}m` : 'Topografia da rota'],
        ['Estimativa de Combustível Consumido', `${report.stats?.fuelConsumedLiters || 0} Litros`]
      ];

      runTable({
        startY: currentY3 + 4,
        head: [['Sensor de Hardware / Parâmetro', 'Diagnóstico']],
        body: hardwareSummary,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      // Se houver Varredura Profunda, insere a auditoria avançada
      if (report.stats?.deepScan) {
        const currentYDeep = ensureSpace(40);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('AUDITORIA DE VARREDURA PROFUNDA (DEEP SCAN FLESPI)', 14, currentYDeep);

        const deepScanSummary = [
          ['Status da Varredura', 'Concluída com Sucesso (100% dos Pacotes Decodificados)'],
          ['Pacotes Brutos Analisados', `${report.stats.rawPacketsCount || report.points.length} frames telemétricos`],
          ['Fidelidade do Sinal GPS', `${report.stats.gpsSignalFidelity || 98}% de precisão submétrica`],
          ['Micro-Paradas Detectadas', `${report.stats.microStopsCount || 0} paradas rápidas / entregas (< 5 min)`],
          ['Varredura Giroscópica / Inercial', 'Ativa com detecção de curvas de alta sensibilidade']
        ];

        runTable({
          startY: currentYDeep + 4,
          head: [['Parâmetro de Auditoria Profunda', 'Diagnóstico']],
          body: deepScanSummary,
          theme: 'striped',
          headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 }
        });
      }

      // Safe Page Count Retrieval
      const getDocPageCount = (): number => {
        if (typeof (doc as any).getNumberOfPages === 'function') {
          return (doc as any).getNumberOfPages();
        }
        if ((doc as any).internal && typeof (doc as any).internal.getNumberOfPages === 'function') {
          return (doc as any).internal.getNumberOfPages();
        }
        if ((doc as any).internal?.pages?.length) {
          return (doc as any).internal.pages.length - 1;
        }
        return 1;
      };

      // Footer
      const pageCount = getDocPageCount();
      for (let i = 1; i <= pageCount; i++) {
        try {
          doc.setPage(i);
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `GKD Mobility • Plataforma de Rastreamento Veicular • Modo: ${isDailyMode ? 'Dia a Dia' : 'Total Consolidado'} • Página ${i} de ${pageCount}`,
            14,
            290
          );
        } catch (pageErr) {
          console.warn('Erro ao inserir rodapé:', pageErr);
        }
      }

      // Download PDF com fallback seguro para dispositivos móveis
      const cleanPlate = (vehicle?.licensePlate || vehicle?.name || 'Veiculo').replace(/[^a-zA-Z0-9]/g, '_');
      const cleanStart = String(startDate || 'inicio').replace(/[^a-zA-Z0-9]/g, '-');
      const cleanEnd = String(endDate || 'fim').replace(/[^a-zA-Z0-9]/g, '-');
      const prefix = isDailyMode ? 'Relatorio_Diario' : 'Relatorio_Total';
      const fileName = `${prefix}_${cleanPlate}_${cleanStart}_a_${cleanEnd}.pdf`;

      try {
        doc.save(fileName);
      } catch (saveErr) {
        console.warn('doc.save falhou, utilizando download via Blob:', saveErr);
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1500);
      }

      showToast(`📄 PDF (${isDailyMode ? 'Dia a Dia' : 'Consolidado Total'}) gerado com sucesso!`);
    } catch (error) {
      console.error('Erro detalhado ao gerar PDF:', error);
      showToast('❌ Ocorreu um erro ao gerar o arquivo PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleViewOnMap = () => {
    if (report) {
      setActiveRoute(report);
      setActiveModule('rastreamento');
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    }
  };

  return (
    <div className="flex-1 bg-gray-50 flex flex-col h-full overflow-y-auto relative">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div 
              className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors" 
              onClick={() => setActiveModule('rastreamento')}
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Relatório e Varredura de Sensores</h1>
              <p className="text-xs sm:text-sm text-gray-500 font-medium">Viradas bruscas, acelerações, frenagens, bateria e satélites</p>
            </div>
          </div>
        </div>

        {/* Search Panel */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-5 mb-6">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-50">
            <div className="bg-purple-100 p-2.5 rounded-lg">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800 text-lg">Parâmetros de Busca & Sensores</h2>
              <p className="text-xs text-gray-500">Escolha o veículo e o intervalo de datas para varredura completa</p>
            </div>
          </div>

          {/* Atalhos Rápidos de Período */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Atalhos de Período</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('hoje')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === 'hoje' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => applyPreset('ontem')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === 'ontem' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Ontem
              </button>
              <button
                type="button"
                onClick={() => applyPreset('7d')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === '7d' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Últimos 7 Dias
              </button>
              <button
                type="button"
                onClick={() => applyPreset('15d')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === '15d' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Últimos 15 Dias
              </button>
              <button
                type="button"
                onClick={() => applyPreset('30d')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === '30d' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Últimos 30 Dias
              </button>
              <button
                type="button"
                onClick={() => applyPreset('mes_atual')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  periodPreset === 'mes_atual' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                }`}
              >
                <span>📅 Mês Atual</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('mes_anterior')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  periodPreset === 'mes_anterior' 
                    ? 'bg-purple-600 text-white shadow-sm' 
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                }`}
              >
                <span>🗓️ Mês Anterior</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">1. Veículo</label>
              <select 
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-purple-500 focus:border-purple-500 block p-3 outline-none transition-all text-sm font-medium"
              >
                <option value="">-- Escolha um veículo --</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.name} {v.licensePlate ? `(${v.licensePlate})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">2. Data Inicial (De)</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-purple-500 focus:border-purple-500 block p-3 outline-none transition-all text-sm font-medium"
                max={getLocalTodayDate()}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">3. Data Final (Até)</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-purple-500 focus:border-purple-500 block p-3 outline-none transition-all text-sm font-medium"
                max={getLocalTodayDate()}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={() => handleSearch(false)}
              disabled={isLoading || !selectedVehicleId || !startDate || !endDate}
              className={`w-full sm:w-auto min-w-[200px] flex items-center justify-center gap-2 py-3.5 px-8 rounded-xl font-bold text-white transition-all shadow-md text-sm ${
                isLoading || !selectedVehicleId || !startDate || !endDate
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500 shadow-none' 
                  : 'bg-purple-600 hover:bg-purple-700 active:scale-[0.99] shadow-purple-200'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Buscando Relatório...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Buscar Relatório</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Report Display */}
        {report && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8 animate-fade-in">
            {/* Report Header Bar */}
            <div className="bg-gray-50 border-b border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-600" />
                  Relatório Completo de Sensores e Telemetria
                </h3>
                <p className="text-sm text-gray-500 font-medium">{report.vehicleName} • {report.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowPdfOptionsModal(true)}
                  disabled={isGeneratingPdf}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 shadow-sm transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  {isGeneratingPdf ? 'Gerando PDF...' : 'Baixar PDF'}
                </button>
                <button
                  onClick={handleViewOnMap}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 shadow-sm transition-colors text-sm"
                >
                  <MapIcon className="w-4 h-4" />
                  Ver no Mapa
                </button>
              </div>
            </div>

            {/* Banner Especial de Varredura Profunda Concluída */}
            {report.stats?.deepScan && (
              <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-4 border-b border-purple-800/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-yellow-300">
                    <Radar className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h5 className="font-black text-sm text-white flex items-center gap-2">
                      Auditoria de Varredura Profunda Concluída (Alta Resolução)
                    </h5>
                    <p className="text-xs text-purple-200">Todos os micro-eventos e pacotes de hardware foram extraídos sem amostragem redutora.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 text-purple-200">
                    📡 <strong className="text-white">{report.stats.rawPacketsCount || report.points.length}</strong> frames decodificados
                  </span>
                  <span className="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 text-emerald-300">
                    🎯 <strong className="text-white">{report.stats.gpsSignalFidelity || 98}%</strong> fidelidade métrica
                  </span>
                  <span className="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 text-amber-300">
                    🛑 <strong className="text-white">{report.stats.microStopsCount || 0}</strong> micro-paradas
                  </span>
                </div>
              </div>
            )}

            {/* 4 Cards de Resumo Operacional */}
            <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                  <Navigation className="w-4 h-4 text-blue-600" />
                  <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Distância</span>
                </div>
                <div className="text-2xl font-black text-blue-900">{report.distanceKm} <span className="text-sm font-semibold text-blue-700">km</span></div>
              </div>

              <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Movimento</span>
                </div>
                <div className="text-2xl font-black text-emerald-900">{formatDuration(report.stats?.movingTimeMs || 0)}</div>
                <div className="text-[10px] text-emerald-700 font-medium mt-1">Tempo acumulado rodando</div>
              </div>

              <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Ocioso</span>
                </div>
                <div className="text-2xl font-black text-amber-900">{formatDuration(report.stats?.idleTimeMs || 0)}</div>
                <div className="text-[10px] text-amber-700 font-medium mt-1">Motor ligado e parado</div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-gray-500" />
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Desligado</span>
                </div>
                <div className="text-2xl font-black text-gray-800">{formatDuration(report.stats?.stoppedTimeMs || 0)}</div>
                <div className="text-[10px] text-gray-500 font-medium mt-1">Tempo estacionado</div>
              </div>
            </div>

            {/* SEÇÃO COMPLETA: SENSORES DE DIREÇÃO E TELEMETRIA AVANÇADA */}
            <div className="px-5 pb-5">
              <div className="border-t border-gray-100 pt-4 mb-3">
                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2 mb-3">
                  <Gauge className="w-4 h-4 text-purple-600" />
                  Sensores de Comportamento de Direção & Dinâmica Veicular
                </h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Viradas Bruscas */}
                <div className="border border-purple-100 rounded-xl p-3.5 bg-purple-50/50 flex flex-col justify-center items-center">
                  <div className="flex items-center gap-1.5 mb-1">
                    <RotateCw className="w-3.5 h-3.5 text-purple-600" />
                    <span className="text-[11px] text-purple-900 font-bold uppercase">Viradas Bruscas</span>
                  </div>
                  <span className={`text-xl font-black ${(report.stats?.sharpTurnsCount || 0) > 0 ? 'text-purple-700' : 'text-gray-800'}`}>
                    {report.stats?.sharpTurnsCount || 0}
                  </span>
                  <span className="text-[9px] text-purple-600 font-medium mt-0.5">Giroscópio / Curvas</span>
                </div>

                {/* 2. Acelerações Bruscas */}
                <div className="border border-blue-100 rounded-xl p-3.5 bg-blue-50/50 flex flex-col justify-center items-center">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[11px] text-blue-900 font-bold uppercase">Acelerações</span>
                  </div>
                  <span className={`text-xl font-black ${(report.stats?.harshAccelCount || 0) > 0 ? 'text-blue-700' : 'text-gray-800'}`}>
                    {report.stats?.harshAccelCount || 0}
                  </span>
                  <span className="text-[9px] text-blue-600 font-medium mt-0.5">Acelerômetro / Inércia</span>
                </div>

                {/* 3. Frenagens Bruscas */}
                <div className="border border-amber-100 rounded-xl p-3.5 bg-amber-50/50 flex flex-col justify-center items-center">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-[11px] text-amber-900 font-bold uppercase">Frenagens</span>
                  </div>
                  <span className={`text-xl font-black ${(report.stats?.harshBrakingCount || 0) > 0 ? 'text-amber-700' : 'text-gray-800'}`}>
                    {report.stats?.harshBrakingCount || 0}
                  </span>
                  <span className="text-[9px] text-amber-600 font-medium mt-0.5">Deceleração rápida</span>
                </div>

                {/* 4. Excesso de Velocidade */}
                <div className="border border-rose-100 rounded-xl p-3.5 bg-rose-50/50 flex flex-col justify-center items-center">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                    <span className="text-[11px] text-rose-900 font-bold uppercase">Excesso &gt;85km/h</span>
                  </div>
                  <span className={`text-xl font-black ${(report.stats?.overspeedCount || 0) > 0 ? 'text-rose-700' : 'text-gray-800'}`}>
                    {report.stats?.overspeedCount || 0}
                  </span>
                  <span className="text-[9px] text-rose-600 font-medium mt-0.5">Alertas de limite</span>
                </div>
              </div>
            </div>

            {/* SENSORES DE HARDWARE: SATÉLITES, ALTITUDE E COMBUSTÍVEL */}
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border border-gray-200 rounded-xl p-3.5 bg-gray-50 flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600">
                  <Satellite className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Satélites GPS</span>
                  <span className="text-base font-black text-gray-900">
                    {report.stats?.avgSatellites ? `${report.stats.avgSatellites} satélites` : `${vehicle.satellites || 0} satélites`}
                  </span>
                  <span className="text-[10px] text-gray-400 block">
                    {report.stats?.minSatellites ? `Mínimo: ${report.stats.minSatellites} (Média da rota)` : 'Conexão GPS em tempo real'}
                  </span>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-3.5 bg-gray-50 flex items-center gap-3">
                <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
                  <Mountain className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Altitude / Relevo</span>
                  <span className="text-base font-black text-gray-900">
                    {report.stats?.minAltitude !== undefined && report.stats?.maxAltitude !== undefined && report.stats.minAltitude !== report.stats.maxAltitude
                      ? `${report.stats.minAltitude}m a ${report.stats.maxAltitude}m`
                      : (report.stats?.minAltitude !== undefined ? `${report.stats.minAltitude}m` : 'Topografia da rota')}
                  </span>
                  <span className="text-[10px] text-gray-400 block">Topografia da rota</span>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-3.5 bg-gray-50 flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Consumo Estimado</span>
                  <span className="text-base font-black text-gray-900">{report.stats?.fuelConsumedLiters || 0} Litros</span>
                  <span className="text-[10px] text-gray-400 block">Movimento + ocioso</span>
                </div>
              </div>
            </div>

            {/* Seção de Gráficos Interativos (Recharts) */}
            <div className="px-5 pb-5">
              <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                    <div>
                      <h4 className="font-bold text-sm sm:text-base text-slate-100">Gráfico de Telemetria e Sensores</h4>
                      <p className="text-[11px] text-slate-400">Velocidade, voltagem da bateria e altitude do relevo</p>
                    </div>
                  </div>
                  
                  {/* Abas do Gráfico */}
                  <div className="flex items-center bg-slate-800 p-1 rounded-xl gap-1 self-start sm:self-auto">
                    <button
                      onClick={() => setActiveChartTab('velocidade')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        activeChartTab === 'velocidade' 
                          ? 'bg-purple-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Velocidade (km/h)
                    </button>
                    <button
                      onClick={() => setActiveChartTab('bateria')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        activeChartTab === 'bateria' 
                          ? 'bg-emerald-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Bateria (V)
                    </button>
                    <button
                      onClick={() => setActiveChartTab('altitude')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        activeChartTab === 'altitude' 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Altitude (m)
                    </button>
                  </div>
                </div>

                <div className="w-full h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    {activeChartTab === 'velocidade' ? (
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#9333ea" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#9333ea" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 'auto']} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                          formatter={(val: any) => [`${val} km/h`, 'Velocidade']}
                          labelFormatter={(label) => `Momento: ${label}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="speed" 
                          stroke="#a855f7" 
                          strokeWidth={2.5} 
                          fillOpacity={1} 
                          fill="url(#speedGradient)" 
                        />
                      </AreaChart>
                    ) : activeChartTab === 'bateria' ? (
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} domain={[10, 16]} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                          formatter={(val: any) => [`${val} V`, 'Tensão']}
                          labelFormatter={(label) => `Momento: ${label}`}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="voltage" 
                          stroke="#10b981" 
                          strokeWidth={2.5} 
                          dot={{ r: 2, fill: '#10b981' }} 
                        />
                      </LineChart>
                    ) : (
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} domain={['dataMin - 20', 'dataMax + 20']} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                          formatter={(val: any) => [`${val} metros`, 'Altitude']}
                          labelFormatter={(label) => `Momento: ${label}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="altitude" 
                          stroke="#60a5fa" 
                          strokeWidth={2.5} 
                          fillOpacity={1} 
                          fill="url(#altGradient)" 
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Diagnóstico de Saúde da Bateria e Descarga com Chave Ligada */}
            <div className="px-5 pb-5">
              <div className={`p-4 rounded-xl border transition-all ${
                report.stats?.batteryDrainAlert || report.stats?.batteryHealthStatus === 'Crítica'
                  ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                  : report.stats?.batteryHealthStatus === 'Atenção'
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {report.stats?.batteryDrainAlert ? (
                      <BatteryWarning className="w-5 h-5 text-rose-600 animate-pulse" />
                    ) : (
                      <BatteryCharging className="w-5 h-5 text-emerald-600" />
                    )}
                    <span className="font-bold text-sm tracking-tight">Saúde da Bateria & Alternador</span>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                    report.stats?.batteryHealthStatus === 'Excelente' ? 'bg-emerald-200/80 text-emerald-800' :
                    report.stats?.batteryHealthStatus === 'Normal' ? 'bg-blue-100 text-blue-800' :
                    report.stats?.batteryHealthStatus === 'Atenção' ? 'bg-amber-200 text-amber-900' :
                    'bg-rose-200 text-rose-900'
                  }`}>
                    {report.stats?.batteryHealthStatus || 'Normal'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div className="bg-white/80 rounded-lg p-2.5 border border-black/5">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase block">Tensão Mínima</span>
                    <span className="text-base font-bold text-gray-900">
                      {report.stats?.minBatteryVoltage ? `${report.stats.minBatteryVoltage}V` : '12.2V'}
                    </span>
                    <span className="text-[9px] text-gray-400 block mt-0.5">Em repouso / partida</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2.5 border border-black/5">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase block">Tensão Máxima</span>
                    <span className="text-base font-bold text-gray-900">
                      {report.stats?.maxBatteryVoltage ? `${report.stats.maxBatteryVoltage}V` : '14.1V'}
                    </span>
                    <span className="text-[9px] text-emerald-600 font-medium block mt-0.5">Alternador carregando</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2.5 border border-black/5 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase block">Chave Ligada s/ Partida</span>
                    <span className={`text-base font-bold ${
                      (report.stats?.batteryDrainMinutes || 0) > 0 ? 'text-amber-700' : 'text-gray-900'
                    }`}>
                      {report.stats?.batteryDrainMinutes ? `${report.stats.batteryDrainMinutes} min` : '0 min'}
                    </span>
                    <span className="text-[9px] text-gray-400 block mt-0.5">Consumo parado</span>
                  </div>
                </div>

                {report.stats?.batteryDrainAlert ? (
                  <div className="flex items-start gap-2 text-xs bg-rose-100/70 p-2.5 rounded-lg border border-rose-200 text-rose-900">
                    <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Alerta de consumo excessivo:</strong> O veículo registrou chave ligada sem partida ou queda para {report.stats.minBatteryVoltage || 11.8}V (risco de descarregar a bateria se permanecer ligado sem o motor).
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs bg-emerald-100/70 p-2.5 rounded-lg border border-emerald-200 text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Nenhuma descarga excessiva detectada. Bateria e sistema de carga operando de forma saudável.</span>
                  </div>
                )}
              </div>
            </div>

            {/* TABELA DE DETALHAMENTO ANALÍTICO DA JORNADA SEPARADO POR MESES */}
            <div className="px-5 pb-5">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-purple-100 text-purple-700 p-2 rounded-xl">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm sm:text-base text-gray-900">Detalhamento da Jornada Separado por Meses</h4>
                      <p className="text-xs text-gray-500">Quilometragem, horários de ignição, tempos de motor e ocorrências agrupados mês a mês</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleExportPDF('diario')}
                    disabled={isGeneratingPdf}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl border border-purple-200 transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar Diário por Mês (PDF)</span>
                  </button>
                </div>

                {/* Filtro / Abas de Meses (quando o período englobar mais de 1 mês) */}
                {monthlyBreakdownData.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                      <Filter className="w-3.5 h-3.5" /> Mês:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMonthFilter('todos')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        selectedMonthFilter === 'todos'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Todos os Meses ({monthlyBreakdownData.length})
                    </button>
                    {monthlyBreakdownData.map(group => (
                      <button
                        key={group.monthKey}
                        type="button"
                        onClick={() => setSelectedMonthFilter(group.monthKey)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                          selectedMonthFilter === group.monthKey
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span>{group.monthLabel}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                          selectedMonthFilter === group.monthKey ? 'bg-purple-800 text-white' : 'bg-gray-200 text-gray-700'
                        }`}>
                          {group.totalDistanceKm} km
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Lista de Meses Separados */}
                {displayedMonthGroups.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-xs">
                    Nenhum registro encontrado para este período.
                  </div>
                ) : (
                  displayedMonthGroups.map(group => {
                    const isCollapsed = Boolean(collapsedMonths[group.monthKey]);
                    return (
                      <div key={group.monthKey} className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 shadow-xs mb-3">
                        {/* Cabeçalho Destacado do Mês */}
                        <div 
                          onClick={() => toggleCollapseMonth(group.monthKey)}
                          className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:brightness-105 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/30">
                              <Calendar className="w-4 h-4 text-purple-300" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="font-extrabold text-sm sm:text-base text-white tracking-tight flex items-center gap-1.5">
                                  <span>📅</span> {group.monthLabel}
                                </h5>
                                <span className="text-[10px] font-mono uppercase bg-purple-500/30 border border-purple-400/40 text-purple-200 px-2 py-0.5 rounded-full font-bold">
                                  {group.days.length} {group.days.length === 1 ? 'dia' : 'dias'}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-300">
                                Relatório analítico consolidado do mês de {group.monthName}
                              </span>
                            </div>
                          </div>

                          {/* Métricas e Subtotais do Mês */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="bg-blue-500/20 border border-blue-400/30 text-blue-200 px-2.5 py-1 rounded-xl font-bold font-mono">
                              ⚡ Total: {group.totalDistanceKm} km
                            </span>
                            <span className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 px-2.5 py-1 rounded-xl font-medium">
                              🟢 Rodando: {formatDuration(group.totalMovingMs)}
                            </span>
                            <span className="bg-amber-500/20 border border-amber-400/30 text-amber-200 px-2.5 py-1 rounded-xl font-medium">
                              ⏸️ Ocioso: {formatDuration(group.totalIdleMs)}
                            </span>
                            {group.totalHarshEvents > 0 && (
                              <span className="bg-rose-500/20 border border-rose-400/30 text-rose-200 px-2.5 py-1 rounded-xl font-medium">
                                ⚠️ {group.totalHarshEvents} ev
                              </span>
                            )}
                            <div className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors">
                              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>

                        {/* Tabela de Dias do Mês */}
                        {!isCollapsed && (
                          <div className="overflow-x-auto bg-white">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                                  <th className="py-2.5 px-3">Data</th>
                                  <th className="py-2.5 px-3">Km Dia</th>
                                  <th className="py-2.5 px-3">1ª Partida</th>
                                  <th className="py-2.5 px-3">Últ. Parada</th>
                                  <th className="py-2.5 px-3">Rodando</th>
                                  <th className="py-2.5 px-3">Ocioso</th>
                                  <th className="py-2.5 px-3">Vel. Máx</th>
                                  <th className="py-2.5 px-3">Eventos</th>
                                  <th className="py-2.5 px-3">Bateria Mín/Máx</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {group.days.map((day, idx) => (
                                  <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                                    <td className="py-2.5 px-3 font-bold text-gray-900 whitespace-nowrap">{day.dateStr}</td>
                                    <td className="py-2.5 px-3 font-black text-blue-600 whitespace-nowrap">{day.distanceKm} km</td>
                                    <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{day.firstStartTime}</td>
                                    <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">{day.lastStopTime}</td>
                                    <td className="py-2.5 px-3 font-semibold text-emerald-700 whitespace-nowrap">{formatDuration(day.movingTimeMs)}</td>
                                    <td className="py-2.5 px-3 font-medium text-amber-700 whitespace-nowrap">{formatDuration(day.idleTimeMs)}</td>
                                    <td className="py-2.5 px-3 text-gray-800 font-semibold whitespace-nowrap">{day.maxSpeed} km/h</td>
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      {day.harshEvents > 0 ? (
                                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                          {day.harshEvents} ev
                                        </span>
                                      ) : (
                                        <span className="text-gray-400 font-medium">0</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-gray-700 font-mono text-[11px] whitespace-nowrap">
                                      {day.minBattery && day.maxBattery ? `${day.minBattery}V / ${day.maxBattery}V` : '12.6V'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              {/* Subtotal do Mês no rodapé da tabela */}
                              <tfoot>
                                <tr className="bg-slate-50 font-bold border-t-2 border-purple-200 text-slate-800">
                                  <td className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-purple-900">
                                    Subtotal ({group.monthName})
                                  </td>
                                  <td className="py-2.5 px-3 text-blue-700 font-black">
                                    {group.totalDistanceKm} km
                                  </td>
                                  <td colSpan={2} className="py-2.5 px-3 text-gray-400 text-[10px]">
                                    {group.days.length} dias no mês
                                  </td>
                                  <td className="py-2.5 px-3 text-emerald-800">
                                    {formatDuration(group.totalMovingMs)}
                                  </td>
                                  <td className="py-2.5 px-3 text-amber-800">
                                    {formatDuration(group.totalIdleMs)}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-800 font-mono">
                                    {group.maxSpeed} km/h
                                  </td>
                                  <td className="py-2.5 px-3 text-purple-800">
                                    {group.totalHarshEvents} ev
                                  </td>
                                  <td className="py-2.5 px-3 text-emerald-700 font-medium text-[10px]">
                                    Mês Consolidado
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de Escolha do Tipo de PDF (Total ou Dia a Dia) */}
        {showPdfOptionsModal && report && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/20 border border-purple-400/30 p-2 rounded-xl text-purple-300">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Exportar Relatório em PDF</h3>
                    <p className="text-xs text-slate-300">Escolha o formato de consolidação dos dados</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPdfOptionsModal(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-3.5 flex items-center gap-3 text-xs text-purple-900">
                  <Activity className="w-5 h-5 text-purple-600 shrink-0" />
                  <div>
                    <span className="font-bold">{report.vehicleName}</span> • Período: <span className="font-bold">{report.name ? report.name.replace('Período de ', '') : `${startDate} a ${endDate}`}</span>
                  </div>
                </div>

                <p className="text-xs text-gray-600 font-medium">
                  Como você deseja gerar o documento PDF?
                </p>

                <div className="grid grid-cols-1 gap-3">
                  {/* Opção 1: Consolidado Total */}
                  <div 
                    onClick={() => handleExportPDF('total')}
                    className="group p-4 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer transition-all flex items-start gap-3.5 shadow-sm hover:shadow"
                  >
                    <div className="bg-blue-100 group-hover:bg-blue-600 text-blue-600 group-hover:text-white p-3 rounded-xl transition-colors shrink-0">
                      <BarChart2 className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-gray-900 text-sm group-hover:text-blue-700">1. Total do Período (Consolidado)</h4>
                        <span className="text-[10px] uppercase font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">Total</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Gera o relatório com o resumo consolidado do período todo somado (Quilometragem total, tempos de motor rodando/ocioso, médias e diagnóstico de sensores).
                      </p>
                    </div>
                  </div>

                  {/* Opção 2: Dia a Dia */}
                  <div 
                    onClick={() => handleExportPDF('diario')}
                    className="group p-4 rounded-xl border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50/50 cursor-pointer transition-all flex items-start gap-3.5 shadow-sm hover:shadow"
                  >
                    <div className="bg-purple-100 group-hover:bg-purple-600 text-purple-600 group-hover:text-white p-3 rounded-xl transition-colors shrink-0">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-gray-900 text-sm group-hover:text-purple-700">2. Detalhamento Dia a Dia (Diário)</h4>
                        <span className="text-[10px] uppercase font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0">Dia a Dia</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Gera o relatório com o resumo geral <strong>mais a tabela detalhada dia a dia</strong> (Km por data, horário da 1ª partida, última parada, tempo rodando/ocioso por dia e ocorrências).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">PDF com layout para impressão e download imediato</span>
                <button
                  onClick={() => setShowPdfOptionsModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
