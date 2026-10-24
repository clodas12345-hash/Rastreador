import React, { useState, useEffect } from 'react';
import { Vehicle, Driver } from '../types';
import { 
  User, Award, AlertTriangle, ShieldCheck, Phone, FileText, 
  Plus, Trash2, Edit3, ArrowLeft, Star, Zap, Gauge, Search,
  CheckCircle2, Car, Sparkles, Sliders, BatteryCharging
} from 'lucide-react';
import { collection, doc } from 'firebase/firestore';
import { safeSetDoc, safeDeleteDoc, safeOnSnapshot } from '../utils/firestoreWrapper';
import { db, cleanFirestoreData, isFirestoreEnabled } from '../lib/firebase';

interface MotoristasModuleProps {
  vehicles: Vehicle[];
  onUpdateVehicle?: (updated: Vehicle) => void;
  onBackToMap?: () => void;
  showToast?: (msg: string) => void;
}

export default function MotoristasModule({
  vehicles,
  onUpdateVehicle,
  onBackToMap,
  showToast
}: MotoristasModuleProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    cpf: string;
    cnhNumber: string;
    cnhCategory: 'A' | 'B' | 'AB' | 'C' | 'D' | 'E';
    cnhDueDate: string;
    phoneNumber: string;
    assignedVehicleId: string;
    photoUrl: string;
  }>({
    name: '',
    cpf: '',
    cnhNumber: '',
    cnhCategory: 'B',
    cnhDueDate: '',
    phoneNumber: '',
    assignedVehicleId: vehicles[0]?.id || '',
    photoUrl: ''
  });

  // Carregar motoristas do Firestore e expurgar dados fictícios herdados
  useEffect(() => {
    const unsubscribe = safeOnSnapshot(collection(db, 'drivers'), (snapshot) => {
      const list: Driver[] = snapshot.docs.map((docSnap: any) => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Driver));

      // Expurgar motoristas mock/fictícios ou incompletos ("William", "Carlos Eduardo", etc.)
      const realList: Driver[] = [];
      list.forEach(d => {
        const nameLower = (d.name || '').toLowerCase();
        const isMock = d.id === 'driver-1' || 
          d.id === 'driver-2' || 
          nameLower.includes('carlos eduardo') || 
          nameLower.includes('roberto alencar') ||
          nameLower.includes('william') ||
          (nameLower === 'william' && (!d.cpf || d.cpf.includes('Não informado'))) ||
          (!d.cpf && !d.cnhNumber && (!d.phoneNumber || d.phoneNumber.trim() === '+55 11' || d.phoneNumber.trim() === ''));

        if (isMock) {
          // Deletar permanentemente do Firestore para garantir dados 100% reais
          safeDeleteDoc(doc(db, 'drivers', d.id)).catch(() => {});
        } else {
          realList.push(d);
        }
      });

      setDrivers(realList);
    }, (error) => {
      console.warn('Drivers fetch error:', error);
      setDrivers([]);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenAddModal = (driverToEdit?: Driver) => {
    if (driverToEdit) {
      setEditingDriver(driverToEdit);
      setFormData({
        name: driverToEdit.name,
        cpf: driverToEdit.cpf,
        cnhNumber: driverToEdit.cnhNumber,
        cnhCategory: driverToEdit.cnhCategory,
        cnhDueDate: driverToEdit.cnhDueDate,
        phoneNumber: driverToEdit.phoneNumber,
        assignedVehicleId: driverToEdit.assignedVehicleId || '',
        photoUrl: driverToEdit.photoUrl || ''
      });
    } else {
      setEditingDriver(null);
      setFormData({
        name: '',
        cpf: '',
        cnhNumber: '',
        cnhCategory: 'B',
        cnhDueDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
        phoneNumber: '+55 11 ',
        assignedVehicleId: vehicles[0]?.id || '',
        photoUrl: ''
      });
    }
    setShowAddModal(true);
  };

  const handleSaveDriver = async () => {
    if (!formData.name.trim()) {
      if (showToast) showToast('⚠️ Digite o nome completo do motorista.');
      return;
    }

    const driverId = editingDriver ? editingDriver.id : `driver-${Date.now()}`;
    const assignedVeh = vehicles.find(v => v.id === formData.assignedVehicleId);
    const harshBraking = assignedVeh?.harshBraking ?? 0;
    const sharpTurns = assignedVeh?.sharpTurns ?? 0;
    const isOverspeeding = (assignedVeh?.speed ?? 0) > (assignedVeh?.settings?.speedLimit ?? 60);
    const overspeed = isOverspeeding ? 1 : 0;
    const deductions = (harshBraking * 3) + (sharpTurns * 2) + (overspeed * 5);
    const calculatedSafetyScore = Math.max(0, Math.min(100, 100 - deductions));

    const newDriver: Driver = {
      id: driverId,
      name: formData.name.trim(),
      cpf: formData.cpf.trim(),
      cnhNumber: formData.cnhNumber.trim(),
      cnhCategory: formData.cnhCategory,
      cnhDueDate: formData.cnhDueDate,
      phoneNumber: formData.phoneNumber.trim(),
      assignedVehicleId: formData.assignedVehicleId,
      photoUrl: formData.photoUrl,
      safetyScore: calculatedSafetyScore,
      harshBrakingCount: harshBraking,
      sharpTurnsCount: sharpTurns,
      overspeedCount: overspeed,
      idleTimeMinutes: editingDriver ? editingDriver.idleTimeMinutes : 0,
      totalTripsCount: editingDriver ? editingDriver.totalTripsCount : 0,
      totalKmDriven: assignedVeh ? Math.round(assignedVeh.totalMileage || assignedVeh.dailyMileage || 0) : 0
    };

    try {
      await safeSetDoc(doc(db, 'drivers', newDriver.id), cleanFirestoreData(newDriver));
      if (showToast) showToast(`✅ Motorista "${newDriver.name}" salvo com sucesso!`);
      setShowAddModal(false);
    } catch (e) {
      console.error('Error saving driver:', e);
      if (showToast) showToast('❌ Erro ao salvar dados do motorista.');
    }
  };

  const handleDeleteDriver = async (driverId: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir o cadastro do motorista ${name}?`)) {
      try {
        await safeDeleteDoc(doc(db, 'drivers', driverId));
        if (showToast) showToast('🗑️ Cadastro do motorista removido.');
      } catch (e) {
        console.error('Error deleting driver:', e);
      }
    }
  };

  const filteredDrivers = drivers.filter(d => 
    (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.cpf || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.cnhNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getScoreBadge = (score: number) => {
    if (score >= 90) return { label: '🌟 Excelente', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    if (score >= 75) return { label: '🟢 Bom', color: 'bg-green-100 text-green-800 border-green-300' };
    if (score >= 60) return { label: '🟡 Regular', color: 'bg-amber-100 text-amber-800 border-amber-300' };
    return { label: '🔴 Atenção', color: 'bg-red-100 text-red-800 border-red-300' };
  };

  // Média Eco-Driving estritamente baseada na telemetria real dos veículos vinculados aos motoristas cadastrados
  const averageScore = drivers.length > 0 
    ? Math.round(
        drivers.reduce((acc, d) => {
          const v = vehicles.find(veh => veh.id === d.assignedVehicleId);
          const hb = v?.harshBraking ?? 0;
          const st = v?.sharpTurns ?? 0;
          const os = (v?.speed ?? 0) > (v?.settings?.speedLimit ?? 60) ? 1 : 0;
          const pen = (hb * 3) + (st * 2) + (os * 5);
          return acc + Math.max(0, 100 - pen);
        }, 0) / drivers.length
      )
    : 100;

  const fleetWithDriverCount = drivers.filter(d => d.assignedVehicleId && vehicles.some(v => v.id === d.assignedVehicleId)).length;

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
                <User className="w-6 h-6 text-blue-600" />
                Cadastro de Motoristas & Ranking Eco-Driving
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 font-medium">
                Gestão de condutores com vínculo direto à telemetria real dos veículos da frota
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Motorista Real
            </button>
          </div>
        </div>

        {/* Top Summary Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
              <User className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase block">Motoristas Cadastrados</span>
              <span className="text-2xl font-black text-gray-900">{drivers.length}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase block">Média de Pontuação Eco-Driving</span>
              <span className="text-2xl font-black text-emerald-600">
                {averageScore} / 100
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase block">Frota Com Motorista</span>
              <span className="text-2xl font-black text-purple-700">
                {fleetWithDriverCount} {fleetWithDriverCount === 1 ? 'Veículo' : 'Veículos'}
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar motorista por nome, CPF ou número de CNH..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
        </div>

        {/* Driver List / Eco-Driving Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {filteredDrivers.map(driver => {
            const assignedVeh = vehicles.find(v => v.id === driver.assignedVehicleId);
            
            // Telemetria 100% real do veículo vinculado
            const harshBraking = assignedVeh?.harshBraking ?? 0;
            const sharpTurns = assignedVeh?.sharpTurns ?? 0;
            const isOverspeeding = (assignedVeh?.speed ?? 0) > (assignedVeh?.settings?.speedLimit ?? 60);
            const overspeed = isOverspeeding ? 1 : 0;
            
            const totalKm = assignedVeh 
              ? Math.round(assignedVeh.totalMileage || assignedVeh.dailyMileage || 0)
              : (driver.totalKmDriven || 0);
              
            // Score calculado a partir das infrações reais de telemetria
            const infractionsPenalty = (harshBraking * 3) + (sharpTurns * 2) + (overspeed * 5);
            const computedScore = Math.max(0, Math.min(100, 100 - infractionsPenalty));
              
            const scoreBadge = getScoreBadge(computedScore);

            return (
              <div key={driver.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  {/* Header Card */}
                  <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-lg border-2 border-blue-200 shrink-0">
                        {driver.photoUrl ? (
                          <img src={driver.photoUrl} alt={driver.name} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          driver.name.charAt(0)
                        )}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-gray-900 text-base leading-snug">{driver.name}</h3>
                        <span className="text-xs text-gray-500 font-mono block">CPF: {driver.cpf || 'Não informado'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenAddModal(driver)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar Motorista"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteDriver(driver.id, driver.name)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Excluir Motorista"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* CNH e Veículo Vinculado */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl border border-gray-100 mb-3">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">CNH ({driver.cnhCategory || 'B'})</span>
                      <span className="font-bold text-gray-800 font-mono">{driver.cnhNumber || 'Não informada'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">Veículo Atual</span>
                      <span className="font-bold text-blue-700 truncate block">
                        {assignedVeh ? `🚘 ${assignedVeh.name}` : 'Nenhum'}
                      </span>
                    </div>
                  </div>

                  {/* Eco-Driving Score Section */}
                  <div className="mb-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3.5 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                        <Award className="w-4 h-4 text-amber-400" /> Pontuação Eco-Driving
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-black border ${scoreBadge.color}`}>
                        {scoreBadge.label}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-3xl font-black font-mono text-emerald-400">{computedScore}</span>
                      <span className="text-xs text-slate-300 font-bold">/ 100 pontos</span>
                    </div>

                    {/* Barra de Score */}
                    <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          computedScore >= 90 ? 'bg-emerald-400' :
                          computedScore >= 75 ? 'bg-green-400' :
                          computedScore >= 60 ? 'bg-amber-400' : 'bg-red-500'
                        }`}
                        style={{ width: `${computedScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Métricas Telemétricas de Condução */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-red-50 p-2 rounded-xl border border-red-100">
                      <span className="text-[10px] text-red-600 font-bold block">Freadas Bruscas</span>
                      <span className="font-black text-red-700 text-sm font-mono">{harshBraking}</span>
                    </div>

                    <div className="bg-amber-50 p-2 rounded-xl border border-amber-100">
                      <span className="text-[10px] text-amber-700 font-bold block">Curvas Rápidas</span>
                      <span className="font-black text-amber-800 text-sm font-mono">{sharpTurns}</span>
                    </div>

                    <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
                      <span className="text-[10px] text-blue-600 font-bold block">Excesso Veloc.</span>
                      <span className="font-black text-blue-700 text-sm font-mono">{overspeed}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>📞 {driver.phoneNumber || 'Sem telefone'}</span>
                  <span className="font-bold text-gray-700 font-mono">{totalKm.toLocaleString('pt-BR')} km guiados</span>
                </div>
              </div>
            );
          })}

          {filteredDrivers.length === 0 && (
            <div className="col-span-full bg-white rounded-2xl p-8 border border-gray-200 shadow-sm text-center">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-bold text-gray-800 text-base mb-1">
                {searchTerm ? 'Nenhum motorista encontrado com este filtro' : 'Nenhum motorista cadastrado ainda'}
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                {searchTerm 
                  ? 'Tente buscar por outro termo ou limpe a busca.' 
                  : 'Cadastre os condutores da sua frota para vincular a telemetria dos veículos e monitorar infrações e pontuação Eco-Driving real.'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => handleOpenAddModal()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  Cadastrar Primeiro Motorista
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Cadastrar / Editar Motorista */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 border border-gray-200">
            <h3 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              <span>{editingDriver ? 'Editar Motorista' : 'Cadastrar Novo Motorista'}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Preencha os dados de identificação e vincule a um veículo da frota
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nome Completo:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Carlos Eduardo Silva"
                  className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">CPF:</label>
                  <input
                    type="text"
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                    placeholder="Ex: 341.892.108-44"
                    className="w-full bg-gray-50 border border-gray-200 font-mono text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Telefone / WhatsApp:</label>
                  <input
                    type="text"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="Ex: +55 11 98765-4321"
                    className="w-full bg-gray-50 border border-gray-200 font-mono text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-xs font-bold text-gray-700 block mb-1">Cat. CNH:</label>
                  <select
                    value={formData.cnhCategory}
                    onChange={(e) => setFormData({ ...formData, cnhCategory: e.target.value as any })}
                    className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="A">A (Moto)</option>
                    <option value="B">B (Carro)</option>
                    <option value="AB">AB (Moto e Carro)</option>
                    <option value="C">C (Caminhão)</option>
                    <option value="D">D (Ônibus/Van)</option>
                    <option value="E">E (Carreta)</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-bold text-gray-700 block mb-1">Número CNH:</label>
                  <input
                    type="text"
                    value={formData.cnhNumber}
                    onChange={(e) => setFormData({ ...formData, cnhNumber: e.target.value })}
                    placeholder="Ex: 08912347101"
                    className="w-full bg-gray-50 border border-gray-200 font-mono text-xs rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Veículo Vinculado:</label>
                <select
                  value={formData.assignedVehicleId}
                  onChange={(e) => setFormData({ ...formData, assignedVehicleId: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">Sem veículo (Livre)</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      🚘 {v.name} ({v.licensePlate || 'Sem placa'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Visualização da Telemetria Real do Veículo Vinculado */}
              {(() => {
                const selectedVeh = vehicles.find(v => v.id === formData.assignedVehicleId);
                if (selectedVeh) {
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-emerald-600" /> Sensores do Veículo ({selectedVeh.name})
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                          Telemetria 100% Real
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-white p-2 rounded-xl border border-gray-200">
                          <span className="text-[10px] text-gray-500 font-bold block">Freadas</span>
                          <span className="font-black text-gray-800 font-mono">{selectedVeh.harshBraking || 0}</span>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-gray-200">
                          <span className="text-[10px] text-gray-500 font-bold block">Curvas</span>
                          <span className="font-black text-gray-800 font-mono">{selectedVeh.sharpTurns || 0}</span>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-gray-200">
                          <span className="text-[10px] text-gray-500 font-bold block">Velocidade</span>
                          <span className="font-black text-blue-700 font-mono">{selectedVeh.speed || 0} km/h</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-500 flex justify-between pt-1 font-medium">
                        <span>Odômetro: <strong className="text-gray-800 font-mono">{Math.round(selectedVeh.totalMileage || selectedVeh.dailyMileage || 0).toLocaleString('pt-BR')} km</strong></span>
                        <span>Placa: <strong className="text-gray-800 font-mono">{selectedVeh.licensePlate || 'S/ placa'}</strong></span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    ℹ️ Selecione um veículo da frota acima para vincular os dados telemétricos e pontuação Eco-Driving real a este motorista.
                  </div>
                );
              })()}
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
                onClick={() => handleSaveDriver()}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Salvar Motorista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
