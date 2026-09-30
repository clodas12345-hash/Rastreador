import React, { useState, useEffect } from 'react';
import { Vehicle, VehicleSettings } from '../types';
import { 
  ArrowLeft, Wrench, Gauge, Calendar, AlertTriangle, CheckCircle2, 
  Clock, Plus, Trash2, DollarSign, ShieldCheck, Car, RefreshCw, 
  Sparkles, FileText, ChevronRight
} from 'lucide-react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { safeSetDoc, safeDeleteDoc } from '../utils/firestoreWrapper';
import { db, cleanFirestoreData } from '../lib/firebase';

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  vehicleName: string;
  serviceType: string; // 'Troca de Óleo' | 'Pneus / Alinhamento' | 'Pastilhas de Freio' | 'Correia Dentada' | 'Revisão Geral'
  date: string;
  kmAtService: number;
  nextServiceKm: number;
  cost: number;
  workshopName: string;
  notes: string;
}

interface ManutencaoModuleProps {
  vehicles: Vehicle[];
  onUpdateVehicle: (updated: Vehicle) => void;
  onBackToMap?: () => void;
  showToast?: (msg: string) => void;
}

export default function ManutencaoModule({
  vehicles,
  onUpdateVehicle,
  onBackToMap,
  showToast
}: ManutencaoModuleProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [serviceType, setServiceType] = useState('Troca de Óleo e Filtro');
  const [cost, setCost] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [notes, setNotes] = useState('');
  const [customIntervalKm, setCustomIntervalKm] = useState('10000');

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  // Carregar histórico do Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'maintenance_records'), (snapshot) => {
      const list: MaintenanceRecord[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as MaintenanceRecord));
      setRecords(list.sort((a, b) => b.id.localeCompare(a.id)));
    }, (error) => {
      console.warn('Maintenance records warn:', error);
    });

    return () => unsubscribe();
  }, []);

  if (!selectedVehicle) {
    return (
      <div className="flex-1 p-6 bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 font-bold">Nenhum veículo cadastrado na frota.</p>
      </div>
    );
  }

  const currentKm = Math.round(selectedVehicle.totalMileage || 0);

  // Manutenções Padrão Calculadas
  const maintenanceCategories = [
    {
      id: 'oleo',
      name: 'Troca de Óleo e Filtro',
      icon: '🛢️',
      intervalKm: 10000,
      description: 'Recomendado a cada 10.000 km ou 12 meses',
      color: 'blue'
    },
    {
      id: 'pneus',
      name: 'Rodízio e Alinhamento de Pneus',
      icon: '🛞',
      intervalKm: 10000,
      description: 'Manter desgaste uniforme e calibragem correta',
      color: 'amber'
    },
    {
      id: 'freios',
      name: 'Pastilhas e Discos de Freio',
      icon: '🛑',
      intervalKm: 20000,
      description: 'Inspeção e substituição periódica de fricção',
      color: 'rose'
    },
    {
      id: 'correia',
      name: 'Correia Dentada / Kit Transmissão',
      icon: '⚙️',
      intervalKm: 50000,
      description: 'Substituição preventiva do motor',
      color: 'purple'
    },
    {
      id: 'revisao',
      name: 'Revisão Geral Preventiva',
      icon: '🔧',
      intervalKm: 10000,
      description: 'Velas, filtros, suspensão e fluidos em geral',
      color: 'emerald'
    }
  ];

  // Filtrar histórico do veículo selecionado
  const vehicleRecords = records.filter(r => r.vehicleId === selectedVehicle.id);

  // Calcular status de cada item de manutenção
  const getItemStatus = (category: typeof maintenanceCategories[0]) => {
    // Procura o último serviço dessa categoria no histórico
    const lastService = vehicleRecords.find(r => r.serviceType.toLowerCase().includes(category.name.toLowerCase().slice(0, 8)));
    const lastKm = lastService ? lastService.kmAtService : 0;
    const nextKm = lastKm + category.intervalKm;
    const remainingKm = nextKm - currentKm;

    let status: 'ok' | 'warning' | 'expired' = 'ok';
    if (remainingKm <= 0) {
      status = 'expired';
    } else if (remainingKm <= 1000) {
      status = 'warning';
    }

    const pctUsed = Math.min(100, Math.max(0, ((currentKm - lastKm) / category.intervalKm) * 100));

    return {
      lastKm,
      nextKm,
      remainingKm,
      status,
      pctUsed,
      lastDate: lastService ? lastService.date : 'Pendente de registro'
    };
  };

  const handleRegisterService = async (categoryName?: string) => {
    const sType = categoryName || serviceType;
    const interval = parseInt(customIntervalKm, 10) || 10000;
    const costNum = parseFloat(cost) || 0;

    const newRecord: MaintenanceRecord = {
      id: `maint-${Date.now()}`,
      vehicleId: selectedVehicle.id,
      vehicleName: selectedVehicle.name,
      serviceType: sType,
      date: new Date().toLocaleDateString('pt-BR'),
      kmAtService: currentKm,
      nextServiceKm: currentKm + interval,
      cost: costNum,
      workshopName: workshopName || 'Oficina Credenciada',
      notes: notes || 'Manutenção de rotina realizada com sucesso.'
    };

    try {
      await safeSetDoc(doc(db, 'maintenance_records', newRecord.id), cleanFirestoreData(newRecord));
      
      // Atualiza configurações de óleo se for troca de óleo
      if (sType.toLowerCase().includes('óleo') || sType.toLowerCase().includes('oleo')) {
        const updatedSettings: VehicleSettings = {
          ...(selectedVehicle.settings || {} as any),
          oilCalibration: currentKm.toString()
        };
        onUpdateVehicle({ ...selectedVehicle, settings: updatedSettings });
      }

      if (showToast) showToast(`✅ Manutenção "${sType}" registrada com sucesso!`);
      setShowAddModal(false);
      setCost('');
      setWorkshopName('');
      setNotes('');
    } catch (e) {
      console.error('Error adding maintenance record:', e);
      if (showToast) showToast('❌ Erro ao salvar registro de manutenção.');
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await safeDeleteDoc(doc(db, 'maintenance_records', id));
      if (showToast) showToast('🗑️ Registro de manutenção excluído.');
    } catch (e) {
      console.error('Error deleting maintenance record:', e);
    }
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
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                title="Voltar ao Mapa"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2">
                <Wrench className="w-6 h-6 text-amber-600" />
                Controle de Manutenção e Troca de Óleo
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 font-medium">
                Acompanhamento preventivo por quilometragem real, trocas de óleo, peças e revisões
              </p>
            </div>
          </div>

          {/* Selector de Veículo */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 hidden sm:inline">Veículo:</span>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="bg-gray-50 border border-gray-200 font-bold text-sm rounded-xl px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  🚘 {v.name} ({v.licensePlate || 'Sem placa'}) - {Math.round(v.totalMileage || 0)} km
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Registrar Serviço
            </button>
          </div>
        </div>

        {/* Vehicle Summary Banner */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-5 rounded-2xl shadow-lg mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl border border-white/30 shrink-0">
              🚘
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-100 block">
                Odômetro Atual do Rastreamento
              </span>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                {selectedVehicle.name}
                <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded text-amber-100">
                  {selectedVehicle.licensePlate || 'BRA-2026'}
                </span>
              </h2>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2.5 rounded-xl text-right">
            <span className="text-[10px] uppercase font-bold text-amber-200 block">Quilometragem Total</span>
            <span className="text-3xl font-black font-mono text-white">
              {currentKm.toLocaleString('pt-BR')} <span className="text-base font-normal">km</span>
            </span>
          </div>
        </div>

        {/* Status das Manutenções / Peças Grid */}
        <h3 className="text-base font-extrabold text-gray-900 mb-3 flex items-center gap-2">
          <span>⚙️</span>
          <span>Status Preventivo das Peças & Componentes</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {maintenanceCategories.map(category => {
            const info = getItemStatus(category);

            return (
              <div 
                key={category.id}
                className={`bg-white rounded-2xl p-4 border transition-all shadow-sm relative overflow-hidden ${
                  info.status === 'expired' ? 'border-red-500 ring-2 ring-red-500/20' :
                  info.status === 'warning' ? 'border-amber-500 ring-2 ring-amber-500/20' :
                  'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl p-2 bg-gray-50 rounded-xl border border-gray-100">{category.icon}</span>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{category.name}</h4>
                      <p className="text-[10px] text-gray-500 font-medium">{category.description}</p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                    info.status === 'expired' ? 'bg-red-100 text-red-700 animate-pulse' :
                    info.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {info.status === 'expired' ? '⚠️ Vencido' :
                     info.status === 'warning' ? '⏰ Atenção' : '🟢 Em dia'}
                  </span>
                </div>

                {/* Progresso de Utilização */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-gray-500">Uso do Intervalo:</span>
                    <span className={info.status === 'expired' ? 'text-red-600 font-black' : 'text-gray-700 font-mono'}>
                      {Math.round(info.pctUsed)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-gray-200">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        info.status === 'expired' ? 'bg-red-600' :
                        info.status === 'warning' ? 'bg-amber-500' :
                        'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, info.pctUsed)}%` }}
                    />
                  </div>
                </div>

                {/* Detalhes de KM */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 mb-3">
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold block">Próxima Troca:</span>
                    <span className="font-bold text-gray-800 font-mono text-xs">
                      {info.nextKm.toLocaleString('pt-BR')} km
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold block">Restante:</span>
                    <span className={`font-bold font-mono text-xs ${
                      info.remainingKm <= 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}>
                      {info.remainingKm <= 0 ? `Excedido ${Math.abs(info.remainingKm)} km` : `${info.remainingKm.toLocaleString('pt-BR')} km`}
                    </span>
                  </div>
                </div>

                {/* Botão Ação */}
                <button
                  type="button"
                  onClick={() => {
                    setServiceType(category.name);
                    setCustomIntervalKm(category.intervalKm.toString());
                    setShowAddModal(true);
                  }}
                  className="w-full py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>✓</span>
                  <span>Registrar Manutenção Realizada</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Tabela de Histórico de Serviços */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                Histórico de Manutenções Realizadas
              </h3>
              <p className="text-xs text-gray-500">
                Registros gravados com data, odômetro, oficinas e notas fiscais
              </p>
            </div>
          </div>

          {vehicleRecords.length === 0 ? (
            <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <span className="text-3xl block mb-2">📋</span>
              <p className="text-gray-600 font-bold text-sm">Nenhum serviço registrado para este veículo ainda.</p>
              <p className="text-xs text-gray-400 mt-1">Clique em "Registrar Serviço" acima para adicionar o primeiro registro de manutenção.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase tracking-wider">
                    <th className="p-3">Serviço Realizado</th>
                    <th className="p-3">Data</th>
                    <th className="p-3">KM do Serviço</th>
                    <th className="p-3">Próxima Revisão</th>
                    <th className="p-3">Oficina</th>
                    <th className="p-3">Valor (R$)</th>
                    <th className="p-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vehicleRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-base">🔧</span>
                        <span>{rec.serviceType}</span>
                      </td>
                      <td className="p-3 text-gray-600 font-mono">{rec.date}</td>
                      <td className="p-3 font-bold text-gray-800 font-mono">{rec.kmAtService.toLocaleString('pt-BR')} km</td>
                      <td className="p-3 text-emerald-700 font-bold font-mono">{rec.nextServiceKm.toLocaleString('pt-BR')} km</td>
                      <td className="p-3 text-gray-600">{rec.workshopName || 'Particular'}</td>
                      <td className="p-3 font-bold text-gray-900">
                        {rec.cost > 0 ? `R$ ${rec.cost.toFixed(2)}` : 'Gratuito'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteRecord(rec.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Excluir registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Adicionar Serviço */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-gray-200">
            <h3 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2">
              <span>🔧</span>
              <span>Registrar Nova Manutenção</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Veículo: <strong>{selectedVehicle.name}</strong> • KM Atual: <strong>{currentKm} km</strong>
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Tipo de Serviço:</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 text-gray-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="Troca de Óleo e Filtro">🛢️ Troca de Óleo e Filtro</option>
                  <option value="Rodízio e Alinhamento de Pneus">🛞 Rodízio e Alinhamento de Pneus</option>
                  <option value="Pastilhas e Discos de Freio">🛑 Pastilhas e Discos de Freio</option>
                  <option value="Correia Dentada / Kit Transmissão">⚙️ Correia Dentada / Kit Transmissão</option>
                  <option value="Revisão Geral Preventiva">🔧 Revisão Geral Preventiva</option>
                  <option value="Outros Serviços">🚗 Outros Serviços</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Intervalo para Próxima Revisão (KM):</label>
                <input
                  type="number"
                  value={customIntervalKm}
                  onChange={(e) => setCustomIntervalKm(e.target.value)}
                  placeholder="Ex: 10000"
                  className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Valor Gasto (R$):</label>
                  <input
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="Ex: 250.00"
                    className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Nome da Oficina:</label>
                  <input
                    type="text"
                    value={workshopName}
                    onChange={(e) => setWorkshopName(e.target.value)}
                    placeholder="Ex: Auto Centro Fix"
                    className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Observações:</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Marcador de óleo 5W30 sintético trocado com filtro original..."
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handleRegisterService()}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Salvar Manutenção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
