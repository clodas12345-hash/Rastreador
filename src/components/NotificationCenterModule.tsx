import React, { useState, useEffect } from 'react';
import { Bell, Shield, ArrowLeft, Trash2, CheckCircle2, Volume2, Settings, Zap, AlertTriangle, Car, Check } from 'lucide-react';
import { Vehicle } from '../types';

interface NotificationCenterModuleProps {
  notifications: any[];
  vehicles?: Vehicle[];
  onUpdateVehicle?: (updated: Vehicle) => void;
  clearNotifications: () => void;
  markAllNotificationsAsRead: () => void;
  addNotification: (notif: any, scheduledTime?: Date) => void;
  showToast: (msg: string) => void;
  onBackToMap: () => void;
  requestNotificationPermission: () => void;
  notificationPermissionStatus: string;
  requestBatteryOptimizationExemption: () => void;
}

export const ALL_ALARM_TYPES = [
  { id: 'velocidade', title: '⚡ Excesso de Velocidade', desc: 'Avisa se o veículo ultrapassar o limite da via ou velocidade configurada.' },
  { id: 'acc', title: '🔑 Ignição / Partida do Motor', desc: 'Notifica na hora que a chave for girada e o motor for ligado ou desligado.' },
  { id: 'bateria', title: '🛡️ Corte de Energia (12V / Segurança)', desc: 'Alerta de emergência se a fiação do rastreador ou bateria principal for cortada.' },
  { id: 'choque', title: '📳 Sensor de Choque e Movimento', desc: 'Dispara alerta de vibração ou colisão enquanto o veículo estiver estacionado.' },
  { id: 'cerca', title: '📍 Cercas Virtuais e Perímetros', desc: 'Avisa imediatamente se este veículo sair da zona segura delimitada no mapa.' },
  { id: 'frenagem', title: '🛑 Frenagem Brusca', desc: 'Detecta desacelerações repentinas ou frenagens de emergência em alta velocidade.' },
  { id: 'aceleracao', title: '🚀 Aceleração Repentina', desc: 'Avisa sobre arrancadas bruscas e conduta de direção agressiva.' },
  { id: 'curva', title: '🔄 Curva Acentuada em Alta Velocidade', desc: 'Identifica viradas bruscas de direção com risco de capotamento.' },
  { id: 'ocioso', title: '⏸️ Motor Ligado Parado (> 5 min)', desc: 'Notifica desperdício de combustível e motor funcionando com veículo estacionado.' },
  { id: 'horario', title: '🌙 Uso Fora do Horário Permitido', desc: 'Alerta sobre ignição do motor durante a madrugada ou finais de semana.' },
  { id: 'perda_sinal', title: '🌐 Perda de Sinal GPS / Sombra', desc: 'Identifica quando o veículo entrar em garagens subterrâneas ou áreas sem cobertura.' },
  { id: 'ancora_viog', title: '🔒 Violação do Modo Âncora', desc: 'Avisa se o carro for arrastado ou guinchado enquanto ancorado.' },
  { id: 'jammer', title: '🛰️ Bloqueador de Sinal (Jammer)', desc: 'Dispara aviso de interferência proposital na freqüência de transmissão GPRS/GPS.' },
  { id: 'combustivel', title: '⛽ Queda Repentina de Combustível', desc: 'Alerta de suspeita de furto ou vazamento caso o nível do tanque caia bruscamente.' },
  { id: 'sos', title: '🆘 Botão de Pânico / SOS', desc: 'Notificação de emergência enviada diretamente pelo botão oculto do veículo.' }
];

export default function NotificationCenterModule({
  notifications,
  vehicles = [],
  onUpdateVehicle,
  clearNotifications,
  markAllNotificationsAsRead,
  addNotification,
  showToast,
  onBackToMap,
  requestNotificationPermission,
  notificationPermissionStatus,
  requestBatteryOptimizationExemption
}: NotificationCenterModuleProps) {
  // Global Notification Preferences State (stored in localStorage)
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem('gkd_notif_preferences');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      speedAlerts: true,
      powerCutAlerts: true,
      ignitionAlerts: true,
      geofenceAlerts: true,
      soundEnabled: true,
      vibrationEnabled: true
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('gkd_notif_preferences', JSON.stringify(prefs));
    } catch (e) {}
  }, [prefs]);

  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'critical' | 'settings'>('all');
  const [settingsSubTab, setSettingsSubTab] = useState<'per_car' | 'global'>('per_car');
  const [selectedCarId, setSelectedCarId] = useState<string>(() => vehicles[0]?.id || '');

  const activeVehicle = vehicles.find(v => v.id === selectedCarId) || vehicles[0] || null;

  // Helper to parse active alarm settings for a vehicle
  const getVehicleAlarms = (v: Vehicle) => {
    const raw = v.settings?.alarmSettings || 'velocidade,acc,bateria,choque,cerca,frenagem,aceleracao,curva,ocioso,horario,perda_sinal,ancora_viog,jammer,combustivel,sos';
    const list = raw.split(',').map(s => s.trim().toLowerCase());
    const map: Record<string, boolean> = {};
    ALL_ALARM_TYPES.forEach(item => {
      map[item.id] = list.includes(item.id);
    });
    return map;
  };

  const toggleVehicleAlarm = (v: Vehicle, key: string) => {
    const current = getVehicleAlarms(v);
    current[key] = !current[key];
    const newSettingsList = ALL_ALARM_TYPES.filter(item => current[item.id]).map(item => item.id);
    const newAlarmSettingsStr = newSettingsList.join(',');

    const updatedV: Vehicle = {
      ...v,
      settings: {
        ...(v.settings || {}),
        alarmSettings: newAlarmSettingsStr,
        accNotify: newSettingsList.includes('acc'),
        speedNotify: newSettingsList.includes('velocidade'),
        powerNotify: newSettingsList.includes('bateria'),
        shockNotify: newSettingsList.includes('choque'),
        geofenceNotify: newSettingsList.includes('cerca')
      } as any
    };

    if (onUpdateVehicle) {
      onUpdateVehicle(updatedV);
      showToast(`✅ Alertas atualizados para o veículo ${v.name}`);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filterTab === 'unread') return !n.read;
    if (filterTab === 'critical') return n.severity === 'critical' || n.type === 'battery' || n.type === 'speed';
    return true;
  });

  return (
    <div className="flex-grow flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-950 text-white px-4 py-3.5 flex items-center justify-between shrink-0 border-b border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToMap}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all cursor-pointer flex items-center justify-center"
            title="Voltar ao Mapa"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg tracking-tight">Central de Notificações</h2>
              <p className="text-xs text-slate-400 font-medium">15 Opções de Alertas Disponíveis por Veículo</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500">Perm: {notificationPermissionStatus}</span>
            <button 
              onClick={async () => {
                await LocalNotifications.schedule({
                  notifications: [{
                    title: "Teste",
                    body: "Teste 5s",
                    id: 9999,
                    schedule: { at: new Date(Date.now() + 5000) },
                    channelId: "padrao"
                  }]
                });
                showToast("Notif agendada");
              }}
              className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded"
            >
              Testar
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterTab('settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filterTab === 'settings' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Escolher por Carro</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6">
        
        {/* Top Permission Banner if not granted */}
        {notificationPermissionStatus !== 'granted' && (
          <div className="bg-blue-600 text-white p-4 rounded-3xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl p-2 bg-white/10 rounded-2xl">🔔</span>
              <div>
                <strong className="block text-sm font-black">Ativar Notificações Push Nativas</strong>
                <p className="text-xs text-blue-100">Receba alarmes instantâneos mesmo quando o aplicativo estiver minimizado.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="px-4 py-2.5 bg-white text-blue-700 font-black text-xs rounded-2xl shadow hover:bg-blue-50 transition-all cursor-pointer shrink-0"
            >
              Ativar Agora
            </button>
          </div>
        )}

        {/* Navigation / Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                filterTab === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Todas ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('unread')}
              className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                filterTab === 'unread' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Não lidas ({notifications.filter(n => !n.read).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('critical')}
              className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                filterTab === 'critical' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Críticos
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('settings')}
              className={`px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                filterTab === 'settings' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>15 Alertas por Carro</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllNotificationsAsRead}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>Marcar lidas</span>
            </button>
            <button
              type="button"
              onClick={clearNotifications}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Limpar tudo</span>
            </button>
          </div>
        </div>

        {/* Content based on active tab */}
        {filterTab === 'settings' ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <span>🚗</span> Escolher Alertas e Notificações por Veículo
                </h3>
                <p className="text-xs text-gray-500">Selecione exatamente quais avisos você deseja ativar ou desativar para cada veículo.</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Vehicle Selector Pills */}
              {vehicles.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                    Selecione o Veículo para Configurar:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {vehicles.map(v => {
                      const isSelected = (activeVehicle?.id === v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedCarId(v.id)}
                          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 border cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-102'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <Car className="w-4 h-4" />
                          <span>{v.name}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                            {v.licensePlate || 'Sem placa'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Checkboxes Card for Selected Vehicle */}
              {activeVehicle ? (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-100 text-blue-700 rounded-xl font-bold">🚘</div>
                      <div>
                        <strong className="block text-sm font-black text-gray-900">{activeVehicle.name}</strong>
                        <span className="text-xs text-gray-500 font-mono font-semibold">{activeVehicle.licensePlate || 'GRA-2026'} • {activeVehicle.trackerNumber || 'IMEI Registrado'}</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                      15 Opções Disponíveis
                    </span>
                  </div>

                  {(() => {
                    const alarms = getVehicleAlarms(activeVehicle);
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {ALL_ALARM_TYPES.map(item => {
                          const isChecked = Boolean(alarms[item.id]);
                          return (
                            <label
                              key={item.id}
                              className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
                                isChecked ? 'bg-white border-blue-300 ring-1 ring-blue-200' : 'bg-gray-50/80 border-gray-200 opacity-75'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleVehicleAlarm(activeVehicle, item.id)}
                                className="w-5 h-5 text-blue-600 rounded-lg accent-blue-600 mt-0.5 cursor-pointer shrink-0"
                              />
                              <div>
                                <strong className="block text-xs font-extrabold text-gray-900">{item.title}</strong>
                                <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">{item.desc}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 text-xs">Nenhum veículo cadastrado</div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <strong className="block text-xs font-black text-amber-900">⚡ Otimização contra Suspensão do Android</strong>
                <p className="text-[11px] text-amber-800">Para garantir que os alertas selecionados cheguem sem atraso com o app fechado.</p>
              </div>
              <button
                type="button"
                onClick={requestBatteryOptimizationExemption}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer shrink-0"
              >
                Definir Sem Restrições
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  showToast('✅ Configurações salvas!');
                  setFilterTab('all');
                }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-md transition-all cursor-pointer"
              >
                Concluir Configuração
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
                <div className="text-4xl mb-3">📭</div>
                <h3 className="text-base font-bold text-gray-800 mb-1">Nenhuma notificação encontrada</h3>
                <p className="text-xs text-gray-400">Os alertas de velocidade, ignição e cercas aparecerão aqui.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                    notif.read ? 'bg-white border-gray-200 opacity-80' : 'bg-blue-50/40 border-blue-200 shadow-sm'
                  }`}
                >
                  <div className={`p-2.5 rounded-2xl text-xl shrink-0 ${
                    notif.severity === 'critical' || notif.type === 'battery' ? 'bg-red-100 text-red-600' :
                    notif.type === 'speed' ? 'bg-amber-100 text-amber-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {notif.type === 'battery' ? '🛡️' : notif.type === 'speed' ? '⚡' : notif.type === 'geofence' ? '📍' : '🔔'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-extrabold text-sm text-gray-900 truncate">
                        {notif.title}
                        {notif.vehicleName && (
                          <span className="ml-2 text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">
                            {notif.vehicleName}
                          </span>
                        )}
                      </h4>
                      <span className="text-[10px] text-gray-400 font-mono shrink-0">
                        {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {notif.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
