import React, { useState } from 'react';
import { Vehicle } from '../types';
import { Clock, Send, CheckCircle2, AlertTriangle, ArrowLeft, Radio, Zap, Settings, Wifi } from 'lucide-react';

interface IntervaloReportModuleProps {
  vehicles: Vehicle[];
  sendFlespiCommand: (imeiOrTarget: string, commandPayload: string, vehicleName?: string) => Promise<any>;
  showToast: (msg: string) => void;
  onBackToMap: () => void;
}

const REPORT_INTERVALS = [
  { id: '10s', label: '10 Segundos (Tempo Real Extremo)', cmd: 'fix010s010m***n123456', desc: 'Ideal para escoltas ou perseguições (consome mais bateria e dados)' },
  { id: '20s', label: '20 Segundos (Rápido)', cmd: 'fix020s020m***n123456', desc: 'Alta precisão em deslocamentos urbanos' },
  { id: '30s', label: '30 Segundos (Padrão Recomendado)', cmd: 'fix030s030m***n123456', desc: 'Equilíbrio perfeito entre precisão de curvas e economia' },
  { id: '1m', label: '1 Minuto (Econômico)', cmd: 'fix060s060m***n123456', desc: 'Bom para frotas de entrega e logística geral' },
  { id: '2m', label: '2 Minutos (Moderado)', cmd: 'fix120s120m***n123456', desc: 'Economia moderada de dados GPRS' },
  { id: '5m', label: '5 Minutos (Econômico)', cmd: 'fix300s300m***n123456', desc: 'Monitoramento de longa distância' },
  { id: '10m', label: '10 Minutos (Standby / Repouso)', cmd: 'fix600s600m***n123456', desc: 'Mínimo tráfego de dados' },
];

export default function IntervaloReportModule({
  vehicles = [],
  sendFlespiCommand,
  showToast,
  onBackToMap
}: IntervaloReportModuleProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [selectedIntervalId, setSelectedIntervalId] = useState<string>('30s');
  const [customCmd, setCustomCmd] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [resultLog, setResultLog] = useState<string | null>(null);

  const targetVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  const handleApplyInterval = async () => {
    if (!targetVehicle) {
      showToast('⚠️ Selecione um veículo.');
      return;
    }

    const selectedOpt = REPORT_INTERVALS.find(i => i.id === selectedIntervalId);
    const pwd = targetVehicle.settings?.smsPassword || '123456';
    const rawCmd = customCmd.trim() || selectedOpt?.cmd || 'fix030s030m***n123456';
    const commandPayload = rawCmd.replace('123456', pwd).replace('***n', pwd);

    setIsSending(true);
    setResultLog(null);

    try {
      const imei = targetVehicle.trackerNumber || targetVehicle.name;
      const res = await sendFlespiCommand(imei, commandPayload, targetVehicle.name);

      if (res && res.success) {
        setResultLog(`✅ Comando [${commandPayload}] enviado com sucesso para ${targetVehicle.name}! (Flespi Device ID: ${res.deviceId || 'N/A'})`);
        showToast(`🚀 Intervalo de relatório aplicado para ${targetVehicle.name}!`);
      } else {
        setResultLog(`⚠️ O comando foi enfileirado no Flespi para ${targetVehicle.name}, mas a resposta indicou pendência de socket.`);
        showToast(`📡 Comando enfileirado na API Flespi.`);
      }
    } catch (err: any) {
      setResultLog(`❌ Erro ao enviar comando Flespi: ${err.message || 'Falha de rede'}`);
      showToast(`❌ Erro ao enviar comando.`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-4xl w-full mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">
              Painel de Configuração de Intervalo GPS
            </h1>
            <p className="text-xs text-gray-500">
              Defina a cadência de envio de posições dos rastreadores via API Flespi (GPRS/TCP)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToMap}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Mapa</span>
        </button>
      </div>

      {/* Main Form */}
      <div className="max-w-4xl w-full mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
          
          {/* 1. Selecionar Veículo */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              1. Selecionar Veículo / Rastreador:
            </label>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm font-semibold text-gray-800 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none cursor-pointer"
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  🚗 {v.name} (IMEI/Tracker: {v.trackerNumber || 'Não definido'}) - Placa: {v.licensePlate || 'N/A'}
                </option>
              ))}
            </select>
            {targetVehicle && (
              <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                  <Radio className="w-3 h-3 animate-pulse" /> ID/IMEI: {targetVehicle.trackerNumber || targetVehicle.name}
                </span>
                <span>Senha SMS: <strong className="font-mono">{targetVehicle.settings?.smsPassword || '123456'}</strong></span>
              </div>
            )}
          </div>

          {/* 2. Selecionar Intervalo */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
              2. Escolha o Intervalo de Relatório (Report Rate):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REPORT_INTERVALS.map(item => {
                const isSelected = selectedIntervalId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedIntervalId(item.id);
                      setCustomCmd(item.cmd);
                    }}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 shadow-sm ring-2 ring-blue-300'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-extrabold text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                        {item.label}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      {item.desc}
                    </p>
                    <div className="font-mono text-[11px] bg-white/80 border border-gray-200 px-2 py-1 rounded text-gray-700">
                      Comando: <strong className="text-blue-700">{item.cmd}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Comando Personalizado (Opcional) */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              3. Comando Personalizado Flespi / Protocolo TK303G (Opcional):
            </label>
            <input
              type="text"
              value={customCmd}
              onChange={(e) => setCustomCmd(e.target.value)}
              placeholder="Ex: fix030s030m***n123456"
              className="w-full border border-gray-300 rounded-xl p-3 text-sm font-mono text-gray-800 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              O token de senha do veículo (<code className="font-mono text-gray-600">123456</code>) será aplicado automaticamente.
            </p>
          </div>

          {/* Action Button */}
          <button
            type="button"
            disabled={isSending || !targetVehicle}
            onClick={handleApplyInterval}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-98 disabled:opacity-50 text-white font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSending ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Transmitindo Comando via API Flespi...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Aplicar e Enviar Comando Flespi para {targetVehicle?.name || 'Veículo'}</span>
              </>
            )}
          </button>

          {/* Result Log */}
          {resultLog && (
            <div className={`p-4 rounded-xl text-xs font-medium border ${
              resultLog.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
              resultLog.startsWith('🚀') ? 'bg-blue-50 border-blue-200 text-blue-900' :
              'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              {resultLog}
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-400/30 shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div className="space-y-1 text-xs text-slate-300">
            <strong className="text-white block font-bold">Como funciona a entrega via Flespi GW</strong>
            <p>
              O painel envia o comando diretamente para a fila de comandos (<code className="text-blue-300 font-mono">commands-queue</code>) do dispositivo na nuvem Flespi. Assim que o rastreador se comunicar via GPRS (seja no próximo pacote ou instantaneamente se o socket TCP estiver ativo), ele executará a instrução e ajustará o envio para a nova cadência selecionada.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
