import React, { useState, useEffect } from 'react';
import { Vehicle, SavedRoute, Driver, FineRecord } from '../types';
import { 
  Calculator, FileText, Download, Fuel, DollarSign, Calendar, 
  Printer, Share2, CheckCircle2, AlertTriangle, ShieldAlert, 
  BatteryCharging, Power, PhoneCall, RefreshCw, Layers, ArrowRight,
  TrendingDown, TrendingUp, Clock, Gauge, MapPin, Zap, Plus, Trash2
} from 'lucide-react';

interface RelatoriosConsumoProps {
  vehicles: Vehicle[];
  savedRoutes?: SavedRoute[];
  drivers?: Driver[];
  onOpenSOSModal?: (vehicle: Vehicle) => void;
  showToast?: (msg: string) => void;
}

const FINES_STORAGE_KEY = 'gkd_fleet_fines_v1';

export default function RelatoriosConsumoModule({
  vehicles,
  savedRoutes = [],
  drivers = [],
  onOpenSOSModal,
  showToast
}: RelatoriosConsumoProps) {
  const [activeTab, setActiveTab] = useState<'consumo' | 'relatorios' | 'multas' | 'sleep_sos'>('consumo');

  // State for Consumo Calculator (Option 1)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [fuelType, setFuelType] = useState<'gasolina' | 'etanol' | 'diesel' | 'gnv'>('gasolina');
  const [fuelPrice, setFuelPrice] = useState<number>(5.89);
  const [autonomyKmL, setAutonomyKmL] = useState<number>(11.5);
  const [customDistanceKm, setCustomDistanceKm] = useState<number>(100);
  const [monthlyEstimatedKm, setMonthlyEstimatedKm] = useState<number>(1500);

  // State for Relatórios Generator (Option 2)
  const [reportVehicleId, setReportVehicleId] = useState<string>('todos');
  const [dateRange, setDateRange] = useState<'hoje' | 'ontem' | '7dias' | '30dias'>('7dias');
  const [reportType, setReportType] = useState<'completo' | 'sintetico' | 'paradas' | 'velocidade'>('completo');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string>('');

  // State for Multas no Período (Option 3)
  const [fines, setFines] = useState<FineRecord[]>(() => {
    try {
      const raw = localStorage.getItem(FINES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [fineVehicleId, setFineVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [fineDriverName, setFineDriverName] = useState<string>('');
  const [fineDate, setFineDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [fineAmount, setFineAmount] = useState<number>(195.23);
  const [fineDescription, setFineDescription] = useState<string>('Excesso de velocidade até 20% acima do limite');
  const [fineFilterVehicle, setFineFilterVehicle] = useState<string>('todos');
  const [fineFilterPeriod, setFineFilterPeriod] = useState<'todos' | '7dias' | '30dias' | '90dias'>('30dias');

  useEffect(() => {
    try {
      localStorage.setItem(FINES_STORAGE_KEY, JSON.stringify(fines));
    } catch {}
  }, [fines]);

  // State for Sleep & SOS (Option 5)
  const [sosPhoneNumber, setSosPhoneNumber] = useState<string>('(11) 99876-5432');
  const [sosContactName, setSosContactName] = useState<string>('Central de Segurança GKD');

  const activeVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  // Calculations for Option 1
  const calculatedLiters = customDistanceKm / (autonomyKmL || 1);
  const calculatedCostR$ = calculatedLiters * fuelPrice;
  const costPerKm = fuelPrice / (autonomyKmL || 1);

  const monthlyLiters = monthlyEstimatedKm / (autonomyKmL || 1);
  const monthlyCostR$ = monthlyLiters * fuelPrice;

  // Handle Save Fine
  const handleSaveFine = () => {
    if (!fineDescription.trim() || isNaN(fineAmount) || fineAmount <= 0) {
      if (showToast) showToast('⚠️ Preencha a descrição da multa e o valor em R$.');
      return;
    }

    const newFine: FineRecord = {
      id: `fine-${Date.now()}`,
      vehicleId: fineVehicleId || vehicles[0]?.id || 'v1',
      driverName: fineDriverName.trim() || 'Motorista Não Atribuído',
      date: fineDate || new Date().toISOString().split('T')[0],
      amount: Number(fineAmount),
      description: fineDescription.trim()
    };

    setFines(prev => [newFine, ...prev]);
    if (showToast) showToast(`🚨 Multa de R$ ${newFine.amount.toFixed(2)} cadastrada com sucesso!`);
    setFineDescription('');
  };

  const handleDeleteFine = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro de multa?')) {
      setFines(prev => prev.filter(f => f.id !== id));
      if (showToast) showToast('🗑️ Registro de multa removido.');
    }
  };

  // Filtered fines
  const filteredFines = fines.filter(f => {
    if (fineFilterVehicle !== 'todos' && f.vehicleId !== fineFilterVehicle) return false;
    if (fineFilterPeriod !== 'todos') {
      const fineMs = new Date(f.date).getTime();
      const nowMs = Date.now();
      const diffDays = (nowMs - fineMs) / (1000 * 60 * 60 * 24);
      if (fineFilterPeriod === '7dias' && diffDays > 7) return false;
      if (fineFilterPeriod === '30dias' && diffDays > 30) return false;
      if (fineFilterPeriod === '90dias' && diffDays > 90) return false;
    }
    return true;
  });

  const totalFinesAmount = filteredFines.reduce((acc, f) => acc + (f.amount || 0), 0);

  // Handle Export CSV
  const handleExportCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      const selectedVehicles = reportVehicleId === 'todos' ? vehicles : vehicles.filter(v => v.id === reportVehicleId);
      
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Placa,Veiculo,Odometro Total (km),Odometro Dia (km),Velocidade Atual (km/h),Nivel Bateria (%),Status\n";

      selectedVehicles.forEach(v => {
        csvContent += `"${v.licensePlate}","${v.name}",${v.totalMileage || 0},${v.dailyMileage || 0},${v.speed || 0},${v.batteryLevel || 100},"${v.status}"\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Relatorio_GKD_Rastreador_${dateRange}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsExporting(false);
      setExportSuccessMsg('Relatório CSV baixado com sucesso!');
      setTimeout(() => setExportSuccessMsg(''), 4000);
    }, 600);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const handleTriggerSOS = (vehicle: Vehicle) => {
    const text = encodeURIComponent(
      `🚨 *ALERTA DE PÂNICO / S.O.S* 🚨\nVeículo: ${vehicle.name} (${vehicle.licensePlate})\nLocalização Atual: https://maps.google.com/?q=${vehicle.lat},${vehicle.lng}\nVelocidade: ${vehicle.speed} km/h\nData/Hora: ${new Date().toLocaleString('pt-BR')}`
    );
    const cleanPhone = sosPhoneNumber.replace(/\D/g, '');
    window.open(`https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${text}`, '_blank');
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-400 text-sm font-semibold uppercase tracking-wider mb-1">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Gestão Avançada de Frota</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Consumo, Relatórios & Multas
          </h1>
          <p className="text-gray-300 text-sm mt-1 max-w-2xl">
            Cálculo financeiro em R$, controle retroativo de multas no período, exportação de relatórios e recursos SOS.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-white/10 p-1.5 rounded-xl border border-white/20 self-start md:self-auto flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('consumo')}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'consumo'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>1. Consumo</span>
          </button>
          <button
            onClick={() => setActiveTab('relatorios')}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'relatorios'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>2. Relatórios</span>
          </button>
          <button
            onClick={() => setActiveTab('multas')}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'multas'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>3. Multas no Período</span>
          </button>
          <button
            onClick={() => setActiveTab('sleep_sos')}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'sleep_sos'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>5. Sleep & SOS</span>
          </button>
        </div>
      </div>

      {exportSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center space-x-3 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">{exportSuccessMsg}</span>
        </div>
      )}

      {/* TAB 1: CALCULADORA DE CONSUMO E CUSTO EM REAIS (R$) */}
      {activeTab === 'consumo' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-5">
              <div className="flex items-center space-x-3 border-b border-gray-100 pb-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base">Parâmetros de Combustível</h2>
                  <p className="text-xs text-gray-500">Ajuste os valores para obter o cálculo exato</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                  Selecione o Veículo
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 font-medium cursor-pointer"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.licensePlate})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                  Tipo de Combustível
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'gasolina', label: 'Gasolina', defaultPrice: 5.89 },
                    { id: 'etanol', label: 'Etanol', defaultPrice: 3.99 },
                    { id: 'diesel', label: 'Diesel S10', defaultPrice: 6.19 },
                    { id: 'gnv', label: 'GNV m³', defaultPrice: 4.69 }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFuelType(f.id as any);
                        setFuelPrice(f.defaultPrice);
                      }}
                      className={`p-2.5 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                        fuelType === f.id
                          ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                  Preço por Litro / m³ (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={fuelPrice}
                    onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                  Autonomia do Veículo (Km/L)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={autonomyKmL}
                    onChange={(e) => setAutonomyKmL(parseFloat(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-2 text-xs font-semibold text-gray-400">km/L</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-gray-700 uppercase">
                    Distância de Trajeto
                  </label>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    {customDistanceKm} km
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="1000"
                  step="5"
                  value={customDistanceKm}
                  onChange={(e) => setCustomDistanceKm(parseInt(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                  Projeção Mensal de Rodagem (Km)
                </label>
                <input
                  type="number"
                  step="100"
                  value={monthlyEstimatedKm}
                  onChange={(e) => setMonthlyEstimatedKm(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                      Custo do Trajeto
                    </span>
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-emerald-900">
                    R$ {calculatedCostR$.toFixed(2)}
                  </div>
                  <p className="text-xs text-emerald-700 mt-1 font-medium">
                    Para percorrer {customDistanceKm} km
                  </p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">
                      Combustível Necessário
                    </span>
                    <Fuel className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-blue-900">
                    {calculatedLiters.toFixed(1)} Litros
                  </div>
                  <p className="text-xs text-blue-700 mt-1 font-medium">
                    Consumo médio de {autonomyKmL} km/L
                  </p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 p-5 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">
                      Custo por Km
                    </span>
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-2xl font-black text-purple-900">
                    R$ {costPerKm.toFixed(2)}
                  </div>
                  <p className="text-xs text-purple-700 mt-1 font-medium">
                    Valor direto por cada km rodado
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="font-bold text-gray-900 text-base flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    <span>Orçamento & Projeção Mensal do Veículo</span>
                  </h3>
                  <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg">
                    {activeVehicle?.name} ({activeVehicle?.licensePlate})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <span className="text-xs font-medium text-gray-500 uppercase">Gasto Estimado no Mês</span>
                    <div className="text-xl font-black text-gray-900">
                      R$ {monthlyCostR$.toFixed(2)}
                    </div>
                    <span className="text-xs text-gray-500 block">Com base em {monthlyEstimatedKm.toLocaleString('pt-BR')} km rodados</span>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <span className="text-xs font-medium text-gray-500 uppercase">Litros Totais Estimados</span>
                    <div className="text-xl font-black text-gray-900">
                      {monthlyLiters.toFixed(1)} L
                    </div>
                    <span className="text-xs text-gray-500 block">Abastecimento mensal sugerido</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">
                    Comparativo Rápido com Todos os Veículos Cadastrados
                  </h4>
                  <div className="space-y-2">
                    {vehicles.map((v) => {
                      const vDailyKm = Number((v.dailyMileage || 0).toFixed(1));
                      const vEstLiters = vDailyKm / (autonomyKmL || 1);
                      const vEstCost = vEstLiters * fuelPrice;

                      return (
                        <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                          <div className="flex items-center space-x-3">
                            <span className="font-bold text-gray-800 text-sm">{v.name}</span>
                            <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                              {v.licensePlate}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-900">
                              R$ {vEstCost.toFixed(2)} / dia
                            </span>
                            <span className="text-xs text-gray-500 block">
                              {vDailyKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km rodados hoje
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GERADOR DE RELATÓRIOS EM PDF / EXCEL */}
      {activeTab === 'relatorios' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">Gerador de Relatórios Executivos</h2>
                  <p className="text-xs text-gray-500">Exporte históricos de trajeto, paradas e telemetria em PDF ou CSV/Excel</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExporting ? 'Exportando...' : 'Exportar Excel / CSV'}</span>
                </button>
                <button
                  onClick={handlePrintPDF}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Salvar PDF</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Filtrar por Veículo
                </label>
                <select
                  value={reportVehicleId}
                  onChange={(e) => setReportVehicleId(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white cursor-pointer"
                >
                  <option value="todos">Todos os Veículos da Frota</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.licensePlate})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Período do Relatório
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as any)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white cursor-pointer"
                >
                  <option value="hoje">Hoje</option>
                  <option value="ontem">Ontem</option>
                  <option value="7dias">Últimos 7 Dias</option>
                  <option value="30dias">Últimos 30 Dias</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Tipo de Detalhamento
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white cursor-pointer"
                >
                  <option value="completo">Completo (Resumo + Paradas + Alertas)</option>
                  <option value="sintetico">Sintético (Apenas Totais de KM)</option>
                  <option value="paradas">Registro de Paradas e Ignicão</option>
                  <option value="velocidade">Excesso de Velocidade</option>
                </select>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-6 bg-white space-y-6 print:border-none print:p-0">
              <div className="flex justify-between items-start border-b border-gray-200 pb-4">
                <div>
                  <h3 className="text-xl font-extrabold text-blue-900">GKD RASTREADOR GPS</h3>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Relatório Gerencial de Telemetria e Trajetos</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p><strong>Emissão:</strong> {new Date().toLocaleString('pt-BR')}</p>
                  <p><strong>Período:</strong> {dateRange.toUpperCase()}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold uppercase">
                      <th className="p-2.5">Veículo</th>
                      <th className="p-2.5">Placa</th>
                      <th className="p-2.5 text-right">Km Rodados</th>
                      <th className="p-2.5 text-right">Vel. Máxima</th>
                      <th className="p-2.5 text-right">Bateria (12V)</th>
                      <th className="p-2.5">Status Atual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(reportVehicleId === 'todos' ? vehicles : vehicles.filter(v => v.id === reportVehicleId)).map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="p-2.5 font-bold text-gray-900">{v.name}</td>
                        <td className="p-2.5 text-gray-600 font-mono">{v.licensePlate}</td>
                        <td className="p-2.5 text-right font-bold text-gray-800">{Number(v.dailyMileage || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</td>
                        <td className="p-2.5 text-right font-semibold text-gray-700">{v.speed || 0} km/h</td>
                        <td className="p-2.5 text-right font-semibold text-gray-700">{v.externalVoltage ? `${v.externalVoltage.toFixed(1)}V` : '—'}</td>
                        <td className="p-2.5">
                          {(() => {
                            const isOff = v.status === 'Offline' || v.status === 'NoBattery';
                            const isLig = !isOff && (v.status === 'Moving' || v.status === 'IgnitionOn' || (v.speed || 0) >= 4);
                            return (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isOff ? 'bg-red-100 text-red-800 border border-red-200' :
                                isLig ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}>
                                {isOff ? '🔴 Sem Sinal' : isLig ? '🔵 Ligado' : '🟢 Com Sinal'}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MULTAS NO PERÍODO */}
      {activeTab === 'multas' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">Controle de Multas & Infrações no Período</h2>
                  <p className="text-xs text-gray-500">Registre e consulte multas por período, veículo ou motorista com data personalizada</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 px-4 py-2 rounded-2xl">
                <span className="text-xs font-bold text-amber-900 uppercase">Total de Multas no Período:</span>
                <span className="text-lg font-black text-red-600 font-mono">
                  R$ {totalFinesAmount.toFixed(2)} ({filteredFines.length})
                </span>
              </div>
            </div>

            {/* Cadastrar Nova Multa Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" /> Registrar Nova Multa
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Veículo:</label>
                  <select
                    value={fineVehicleId}
                    onChange={(e) => setFineVehicleId(e.target.value)}
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Motorista Infrator:</label>
                  <input
                    type="text"
                    placeholder="Ex: Carlos Silva"
                    value={fineDriverName}
                    onChange={(e) => setFineDriverName(e.target.value)}
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Data da Infração (Calendário):</label>
                  <input
                    type="date"
                    value={fineDate}
                    onChange={(e) => setFineDate(e.target.value)}
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Valor da Multa (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fineAmount}
                    onChange={(e) => setFineAmount(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold font-mono text-red-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Descrição / Infração:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Excesso de velocidade acima de 20%, Avanço de semáforo..."
                    value={fineDescription}
                    onChange={(e) => setFineDescription(e.target.value)}
                    className="flex-1 p-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleSaveFine}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer whitespace-nowrap"
                  >
                    Salvar Multa
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Bar for Fines */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Filtrar por Veículo
                </label>
                <select
                  value={fineFilterVehicle}
                  onChange={(e) => setFineFilterVehicle(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white cursor-pointer"
                >
                  <option value="todos">Todos os Veículos</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Filtrar Período de Apuração
                </label>
                <select
                  value={fineFilterPeriod}
                  onChange={(e) => setFineFilterPeriod(e.target.value as any)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white cursor-pointer"
                >
                  <option value="todos">Todo o Histórico</option>
                  <option value="7dias">Últimos 7 Dias</option>
                  <option value="30dias">Últimos 30 Dias</option>
                  <option value="90dias">Últimos 90 Dias</option>
                </select>
              </div>
            </div>

            {/* Fines Table */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold uppercase">
                    <th className="p-3">Data</th>
                    <th className="p-3">Veículo</th>
                    <th className="p-3">Motorista</th>
                    <th className="p-3">Descrição da Infração</th>
                    <th className="p-3 text-right">Valor</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFines.map(f => {
                    const veh = vehicles.find(v => v.id === f.vehicleId);
                    return (
                      <tr key={f.id} className="hover:bg-gray-50">
                        <td className="p-3 font-mono font-bold text-gray-700">{new Date(f.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                        <td className="p-3 font-bold text-gray-900">{veh ? veh.name : 'Veículo'} ({veh?.licensePlate || ''})</td>
                        <td className="p-3 font-semibold text-gray-800">{f.driverName}</td>
                        <td className="p-3 text-gray-600">{f.description}</td>
                        <td className="p-3 text-right font-black text-red-600 font-mono text-sm">R$ {f.amount.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteFine(f.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Excluir multa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredFines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400">
                        Nenhum registro de multa encontrado para este período ou veículo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MODOS SLEEP E BOTÃO DE PÂNICO / SOS */}
      {activeTab === 'sleep_sos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-red-200 shadow-sm space-y-5">
            <div className="flex items-center space-x-3 border-b border-red-100 pb-3">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Botão de Pânico / S.O.S de Emergência</h2>
                <p className="text-xs text-gray-500">Envio instantâneo de alerta com localização via WhatsApp e SMS</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Número de Emergência Cadastrado
                </label>
                <input
                  type="text"
                  value={sosPhoneNumber}
                  onChange={(e) => setSosPhoneNumber(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-red-500"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Contato de Emergência
                </label>
                <input
                  type="text"
                  value={sosContactName}
                  onChange={(e) => setSosContactName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <h3 className="text-xs font-bold text-gray-700 uppercase mb-3">Disparar SOS por Veículo</h3>
              <div className="space-y-2">
                {vehicles.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                    <div>
                      <span className="font-bold text-red-950 text-sm block">{v.name}</span>
                      <span className="text-xs text-red-700">{v.licensePlate} • {v.speed} km/h</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTriggerSOS(v)}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold flex items-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>DISPARAR S.O.S</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm space-y-5">
            <div className="flex items-center space-x-3 border-b border-blue-100 pb-3">
              <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                <BatteryCharging className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Modo Hibernação / Standby Inteligente</h2>
                <p className="text-xs text-gray-500">Protege a bateria do veículo e do rastreador quando estacionado</p>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs leading-relaxed flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block mb-0.5">Economia Automática de Bateria (12V)</strong>
                Quando o veículo fica estacionado por mais de 10 minutos com ignição desligada, o GPS entra em modo de hibernação de baixo consumo e acorda instantaneamente ao detectar movimento ou ignição.
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-700 uppercase">Estado da Hibernação por Veículo</h3>
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center space-x-3">
                    <Power className={`w-5 h-5 ${v.settings?._sleepModeEnabled ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <div>
                      <span className="font-bold text-gray-900 text-sm block">{v.name} ({v.licensePlate})</span>
                      <span className="text-xs text-gray-500">
                        Bateria 12V: {v.externalVoltage ? `${v.externalVoltage.toFixed(1)}V` : '13.8V'}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    v.settings?._sleepModeEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {v.settings?._sleepModeEnabled ? 'Modo Sleep Ativo' : 'Standby Normal'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
