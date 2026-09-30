export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'speed' | 'command' | 'battery' | 'system' | 'geofence' | 'person';
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  vehicleId?: string;
  vehicleName?: string;
  lat?: number;
  lng?: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  speed?: number;
  timestamp?: string;
  ignition?: boolean;
  batteryVoltage?: number;
  batteryLevel?: number;
  direction?: number;
  satellites?: number;
  hdop?: number;
  altitude?: number;
  engineRpm?: number;
  engineTemp?: number;
  fuelLevel?: number;
  harshCornering?: boolean;
  harshBraking?: boolean;
  harshAcceleration?: boolean;
}

export interface SavedRoute {
  id: string;
  name: string;
  vehicleId: string;
  vehicleName: string;
  distanceKm: number;
  createdAt: string;
  points: RoutePoint[];
  stats?: RouteStats;
  notes?: string;
}

export interface VehicleSettings {
  timezone: string;
  smsPassword?: string;
  authorizationNumber?: string;
  tankVolumeLiters?: number;
  oilCalibration?: string;
  initialMileageMeters?: number;
  mileageDisplayUnit: 'km' | 'miles';
  accNotify: boolean;
  speedNotify?: boolean;
  batteryNotify?: boolean;
  powerNotify?: boolean;
  shockNotify?: boolean;
  geofenceNotify?: boolean;
  turningAngle: number;
  alarmSendingTimes: string;
  sensitivity: string;
  alarmSettings: string;
  drivingBehaviorSetting: string;
  speakerSwitch: boolean;
  bluetoothSwitch: boolean;
  economicalMode?: 'economical' | 'standard' | 'realtime';
  _alarmArmed?: boolean;
  _geofenceActive?: boolean;
  _sleepModeEnabled?: boolean;
  _sleepConfiguredAt?: string;
  isBlocked?: boolean;
  pendingBlock?: boolean;
  speedLimit?: number;
  smartSpeedMode?: boolean;
  detectedRoadSpeed?: number;
}

export interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  color: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  name: string;
  licensePlate: string;
  color?: string;
  iconType?: 'car' | 'truck' | 'bus' | 'motorcycle' | 'bike' | 'van';
  status: 'Moving' | 'Stopped' | 'Maintenance' | 'IgnitionOn' | 'IgnitionOff' | 'NoBattery' | 'Offline' | 'Alarm';
  speed: number;
  fuel: number;
  lat: number;
  lng: number;
  sharpTurns: number;
  harshBraking: number;
  totalMileage: number;
  dailyMileage: number;
  trackerNumber: string;
  phoneNumber: string;
  photoUrl?: string;
  satellites?: number;
  hdop?: number;
  batteryLevel?: number; // 0-100%
  externalVoltage?: number; // em Volts
  powerCut?: boolean; // Verdadeiro se a alimentação principal 12V foi cortada/desconectada
  lastTelemetryTime?: number; // Timestamp da última telemetria recebida
  heading?: number; // Ângulo de direção em graus (0 - 360)
  insideGeofences?: string[]; // IDs das cercas onde o veículo está
  commandQueue?: Array<{ id: string; name: string; timestamp: string }>;
  settings: VehicleSettings;
}

export interface RouteStats {
  movingTimeMs: number;
  idleTimeMs: number;
  stoppedTimeMs: number;
  maxSpeed: number;
  avgSpeed: number;
  minBatteryVoltage?: number;
  maxBatteryVoltage?: number;
  avgBatteryVoltage?: number;
  batteryDrainAlert?: boolean; // Alerta se houve queda de tensão com chave ligada sem partida
  batteryDrainMinutes?: number;
  batteryHealthStatus?: 'Excelente' | 'Normal' | 'Atenção' | 'Crítica';
  harshBrakingCount?: number;
  sharpTurnsCount?: number;
  harshAccelCount?: number;
  overspeedCount?: number;
  firstStartTime?: string;
  lastStopTime?: string;
  totalTripsCount?: number;
  avgSatellites?: number;
  minSatellites?: number;
  maxAltitude?: number;
  minAltitude?: number;
  avgEngineRpm?: number;
  maxEngineRpm?: number;
  maxEngineTemp?: number;
  fuelConsumedLiters?: number;
  deepScan?: boolean;
  rawPacketsCount?: number;
  microStopsCount?: number;
  gpsSignalFidelity?: number;
}

export interface Driver {
  id: string;
  name: string;
  cpf: string;
  cnhNumber: string;
  cnhCategory: 'A' | 'B' | 'AB' | 'C' | 'D' | 'E';
  cnhDueDate: string;
  phoneNumber: string;
  assignedVehicleId?: string;
  photoUrl?: string;
  safetyScore: number; // 0 a 100
  harshBrakingCount: number;
  sharpTurnsCount: number;
  overspeedCount: number;
  idleTimeMinutes: number;
  totalTripsCount: number;
  totalKmDriven: number;
}
