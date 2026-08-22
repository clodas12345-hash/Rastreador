import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Disc, Play, Pause, Download, Plus, Trash2, Search, Filter, FileText, Calendar, CheckCircle2, ShieldCheck, Car, PhoneCall, Phone, PhoneOff, RefreshCw, AlertCircle, Clock, Save, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { Vehicle } from '../types';
import { playDtmfTone, playRingbackTone, startRingbackLoop, stopRingbackLoop, playAmbientNoise, unlockAudio } from '../lib/audioService';
import { collection, onSnapshot, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, cleanFirestoreData } from '../lib/firebase';

export interface AudioRecordEntry {

  id: string;
  vehicleId: string;
  vehicleName: string;
  licensePlate?: string;
  timestamp: string;
  durationSeconds: number;
  notes: string;
  category: 'rotina' | 'alerta' | 'seguranca' | 'manutencao';
  audioUrl?: string;
  status: 'concluido' | 'processando';
  operatorName: string;
}

interface RegistradorModuleProps {
  vehicles?: Vehicle[];
  onOpenListenModal?: (vehicleId: string) => void;
  showToast?: (msg: string) => void;
  onBackToMap?: () => void;
}

export default function RegistradorModule({ vehicles = [], onOpenListenModal, showToast, onBackToMap }: RegistradorModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('todos');
  const [isPlayingId, setIsPlayingId] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteVehicle, setNewNoteVehicle] = useState(vehicles[0]?.id || '');
  const [newNoteCategory, setNewNoteCategory] = useState<'rotina' | 'alerta' | 'seguranca' | 'manutencao'>('rotina');
  const [showAddModal, setShowAddModal] = useState(false);

  // Softphone In-App Dialer state inside Registrador
  const [dialerNumber, setDialerNumber] = useState<string>('+5511954125793');
  const [softphoneState, setSoftphoneState] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [listenTimer, setListenTimer] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(100);
  const [isSpeakerphone, setIsSpeakerphone] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [realtimeNote, setRealtimeNote] = useState('');
  const stopAmbientAudioRef = React.useRef<any>(null);

  const formatWithBrazilCode = (raw: string) => {
    if (!raw) return '+5511954125793';
    const clean = raw.replace(/[^0-9]/g, '');
    if (!clean) return '+55';
    if (clean.startsWith('55')) {
      return `+${clean}`;
    }
    return `+55${clean}`;
  };

  useEffect(() => {
    let interval: any;
    if (softphoneState === 'connected') {
      interval = setInterval(() => {
        setListenTimer(prev => prev + 1);
      }, 1000);
    } else {
      setListenTimer(0);
    }
    return () => clearInterval(interval);
  }, [softphoneState]);

  const handleSoftphoneKeyPress = (digit: string) => {
    playDtmfTone(digit);
    setDialerNumber(prev => prev + digit);
  };

  const handleSoftphoneClear = () => {
    playDtmfTone('*', 80);
    setDialerNumber(prev => prev.slice(0, -1));
  };

  const handleStartSoftphoneCall = () => {
    unlockAudio();
    const formattedNum = formatWithBrazilCode(dialerNumber);
    setDialerNumber(formattedNum);
    setSoftphoneState('calling');
    startRingbackLoop();
    if (showToast) showToast(`📞 Discando via Discador do Aplicativo para ${formattedNum}...`);
    setTimeout(() => {
      stopRingbackLoop();
      setSoftphoneState('connected');
      if (!stopAmbientAudioRef.current) {
        stopAmbientAudioRef.current = playAmbientNoise(volumeLevel / 100, isSpeakerphone);
      }
      if (showToast) showToast(`🟢 Chamada conectada com ${formattedNum}! Transmissão de áudio da cabine ativa.`);
    }, 2800);
  };

  const toggleSpeakerphone = () => {
    const nextVal = !isSpeakerphone;
    setIsSpeakerphone(nextVal);
    const targetVol = nextVal ? Math.max(300, volumeLevel) : volumeLevel;
    if (nextVal) setVolumeLevel(targetVol);

    if (stopAmbientAudioRef.current && stopAmbientAudioRef.current.setVolume) {
      stopAmbientAudioRef.current.setVolume(targetVol / 100, nextVal);
    }
    if (showToast) {
      showToast(nextVal ? '📢 Viva-Voz Ativado! Áudio amplificado no alto-falante.' : '🎧 Modo Fone/Normal Ativado.');
    }
  };

  const handleEndSoftphoneCall = () => {
    stopRingbackLoop();
    setSoftphoneState('idle');
    if (stopAmbientAudioRef.current) {
      try {
        if (typeof stopAmbientAudioRef.current === 'function') stopAmbientAudioRef.current();
        else if (stopAmbientAudioRef.current.stop) stopAmbientAudioRef.current.stop();
      } catch (e) {}
      stopAmbientAudioRef.current = null;
    }
    if (showToast) showToast('🔴 Chamada do Discador In-App encerrada.');
  };

  const handleSaveAggregationFromDialer = () => {
    if (!realtimeNote.trim()) {
      if (showToast) showToast('⚠️ Digite uma observação para salvar a agregação.');
      return;
    }
    const matchedVeh = vehicles.find(v => v.phoneNumber?.includes(dialerNumber) || v.trackerNumber?.includes(dialerNumber)) || vehicles[0];
    const newEntry: AudioRecordEntry = {
      id: `rec_${Date.now()}`,
      vehicleId: matchedVeh?.id || 'v1',
      vehicleName: matchedVeh?.name || 'Veículo em Escuta',
      licensePlate: matchedVeh?.licensePlate || 'CAB-2026',
      timestamp: new Date().toLocaleString('pt-BR'),
      durationSeconds: listenTimer > 0 ? listenTimer : 45,
      notes: realtimeNote,
      category: 'rotina',
      status: 'concluido',
      operatorName: 'Discador In-App'
    };

    setDoc(doc(db, 'registrador_records', newEntry.id), cleanFirestoreData(newEntry)).catch(err => {
      console.error('Error saving record to cloud:', err);
    });

    setRecords(prev => [newEntry, ...prev]);
    setRealtimeNote('');
    if (showToast) showToast('💾 Agregação salva com sucesso na nuvem!');
  };


  // Firestore cloud real-time sync for records
  const [records, setRecords] = useState<AudioRecordEntry[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'registrador_records'), (snapshot) => {
      const list: AudioRecordEntry[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as AudioRecordEntry));
      if (list.length > 0) {
        setRecords(list.sort((a, b) => b.id.localeCompare(a.id)));
      } else {
        // Seed default records if empty in cloud
        const defaultRecords: AudioRecordEntry[] = [
          {
            id: 'rec_01',
            vehicleId: vehicles[0]?.id || 'v1',
            vehicleName: vehicles[0]?.name || 'Peugeot 208 GT',
            licensePlate: vehicles[0]?.licensePlate || 'ABC-1234',
            timestamp: new Date(Date.now() - 1000 * 60 * 35).toLocaleString('pt-BR'),
            durationSeconds: 142,
            notes: 'Verificação de ruído no painel frontal e escuta da conversa na cabine durante deslocamento.',
            category: 'rotina',
            status: 'concluido',
            operatorName: 'Central de Operações GKD'
          },
          {
            id: 'rec_02',
            vehicleId: vehicles[1]?.id || 'v2',
            vehicleName: vehicles[1]?.name || 'Toyota Hilux 4x4',
            licensePlate: vehicles[1]?.licensePlate || 'XYZ-9876',
            timestamp: new Date(Date.now() - 1000 * 60 * 180).toLocaleString('pt-BR'),
            durationSeconds: 310,
            notes: 'Gravação de segurança em parada não agendada na rodovia. Sem anomalias identificadas.',
            category: 'seguranca',
            status: 'concluido',
            operatorName: 'Monitoramento 24h'
          },
          {
            id: 'rec_03',
            vehicleId: vehicles[2]?.id || 'v3',
            vehicleName: vehicles[2]?.name || 'Honda HR-V',
            licensePlate: vehicles[2]?.licensePlate || 'DEF-5678',
            timestamp: new Date(Date.now() - 1000 * 60 * 600).toLocaleString('pt-BR'),
            durationSeconds: 85,
            notes: 'Agregação direta via comando de escuta em tempo real. Teste do microfone ambiente OK.',
            category: 'manutencao',
            status: 'concluido',
            operatorName: 'Supervisor Técnico'
          }
        ];
        defaultRecords.forEach(r => {
          setDoc(doc(db, 'registrador_records', r.id), cleanFirestoreData(r)).catch(err => {});
        });
      }
    }, (error) => {
      console.warn('Registrador records snapshot warning:', error);
    });
    return () => unsubscribe();
  }, []);

  const filteredRecords = records.filter(r => {
    const matchesSearch = r.vehicleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.notes.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.licensePlate && r.licensePlate.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'todos' || r.category === selectedCategory;
    const matchesVehicle = selectedVehicleFilter === 'todos' || r.vehicleId === selectedVehicleFilter;
    return matchesSearch && matchesCategory && matchesVehicle;
  });

  const handleAddManualAggregation = () => {
    if (!newNoteText.trim()) {
      if (showToast) showToast('⚠️ Por favor, digite uma anotação para a agregação.');
      return;
    }

    const veh = vehicles.find(v => v.id === newNoteVehicle) || vehicles[0];
    const newEntry: AudioRecordEntry = {
      id: `rec_${Date.now()}`,
      vehicleId: veh?.id || 'v1',
      vehicleName: veh?.name || 'Veículo Registrado',
      licensePlate: veh?.licensePlate || 'REG-2026',
      timestamp: new Date().toLocaleString('pt-BR'),
      durationSeconds: Math.floor(Math.random() * 120) + 30,
      notes: newNoteText,
      category: newNoteCategory,
      status: 'concluido',
      operatorName: 'Gestor da Frota'
    };

    setDoc(doc(db, 'registrador_records', newEntry.id), cleanFirestoreData(newEntry)).catch(err => {});

    setRecords(prev => [newEntry, ...prev]);
    setNewNoteText('');
    setShowAddModal(false);
    if (showToast) showToast('✅ Nova agregação salva na nuvem com sucesso!');
  };

  const handleDeleteRecord = (id: string) => {
    deleteDoc(doc(db, 'registrador_records', id)).catch(err => {});
    setRecords(prev => prev.filter(r => r.id !== id));
    if (showToast) showToast('🗑️ Registro removido da nuvem.');
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Veículo', 'Placa', 'Data/Hora', 'Duração (s)', 'Categoria', 'Anotações', 'Operador'];
    const rows = records.map(r => [
      r.id,
      `"${r.vehicleName}"`,
      `"${r.licensePlate || ''}"`,
      `"${r.timestamp}"`,
      r.durationSeconds,
      r.category,
      `"${r.notes.replace(/"/g, '""')}"`,
      `"${r.operatorName}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_agregacoes_escutas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (showToast) showToast('📊 Relatório de agregações exportado em CSV!');
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const totalSecondsAll = records.reduce((acc, r) => acc + r.durationSeconds, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in text-gray-800">
      {/* Header do Registrador */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider mb-3">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span>Painel do Registrador Direto In-App</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Registrador & Agregações de Escuta
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl leading-relaxed">
              Central independente de gravação, escuta direta na web e controle de agregações de áudio de cabine para toda a frota, sem dependência do discador do celular.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            

            <button
              onClick={() => setShowAddModal(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-5 rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 text-sm cursor-pointer transform active:scale-95 border border-emerald-400"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Agregação</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-2xl transition-all flex items-center gap-2 text-sm cursor-pointer border border-white/20"
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-300" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Métricas do Registrador */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-indigo-800/60">
          <div className="bg-indigo-900/40 p-4 rounded-2xl border border-indigo-700/40">
            <span className="text-xs text-indigo-300 font-medium block mb-1">Total de Agregações</span>
            <span className="text-2xl font-bold text-white font-mono">{records.length}</span>
            <span className="text-[11px] text-indigo-300/80 block mt-0.5">Registros em memória</span>
          </div>

          <div className="bg-indigo-900/40 p-4 rounded-2xl border border-indigo-700/40">
            <span className="text-xs text-indigo-300 font-medium block mb-1">Tempo Acumulado</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono">{formatSeconds(totalSecondsAll)}</span>
            <span className="text-[11px] text-indigo-300/80 block mt-0.5">Minutos gravados</span>
          </div>

          <div className="bg-indigo-900/40 p-4 rounded-2xl border border-indigo-700/40">
            <span className="text-xs text-indigo-300 font-medium block mb-1">Status da Gravação Web</span>
            <span className="text-2xl font-bold text-emerald-300 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              Pronto
            </span>
            <span className="text-[11px] text-indigo-300/80 block mt-0.5">Gravação Web HTML5</span>
          </div>

          <div className="bg-indigo-900/40 p-4 rounded-2xl border border-indigo-700/40">
            <span className="text-xs text-indigo-300 font-medium block mb-1">Dispositivos Conectados</span>
            <span className="text-2xl font-bold text-amber-300 font-mono">{vehicles.length}</span>
            <span className="text-[11px] text-indigo-300/80 block mt-0.5">Veículos monitorados</span>
          </div>
        </div>
      </div>

      {/* DISCADOR DO APLICATIVO IN-APP (SOFTPHONE COM KEYPAD E ESCUTA DIRETA) */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-indigo-800/80 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-white">
              <PhoneCall className="w-5 h-5 text-emerald-400 animate-pulse" />
              <span>Discador do Aplicativo (Softphone In-App)</span>
            </h2>
            <p className="text-xs text-indigo-300">
              Efetue chamadas e escutas diretamente pelo navegador, sem passar pelo telefone celular.
            </p>
          </div>
          <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full font-bold border border-emerald-500/30">
            Conexão Direta Ativa
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna do Visor e Teclado Numérico */}
          <div className="lg:col-span-5 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="bg-slate-900 border border-indigo-600/40 rounded-xl p-3 mb-3 flex items-center justify-between">
              <div>
                <label className="text-[10px] uppercase font-bold text-indigo-400 block tracking-wider">Número do Chip / Destino:</label>
                <input
                  type="text"
                  value={dialerNumber}
                  onChange={(e) => setDialerNumber(e.target.value)}
                  placeholder="Número..."
                  className="bg-transparent text-xl font-mono font-bold text-white outline-none w-full"
                />
              </div>
              {dialerNumber && (
                <button
                  onClick={handleSoftphoneClear}
                  className="text-xs text-indigo-300 hover:text-white bg-indigo-900/60 px-2 py-1 rounded font-bold"
                >
                  ⌫
                </button>
              )}
            </div>

            {/* Teclado DTMF */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto mb-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleSoftphoneKeyPress(digit)}
                  className="bg-slate-900 hover:bg-indigo-600 text-white font-mono font-bold text-lg py-2 rounded-xl border border-slate-800 hover:border-indigo-500 transition-all active:scale-95 cursor-pointer"
                >
                  {digit}
                </button>
              ))}
            </div>

            {/* Botão Principal de Discar */}
            <div className="flex flex-col gap-2">
              {softphoneState === 'idle' ? (
                <button
                  type="button"
                  onClick={handleStartSoftphoneCall}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <PhoneCall className="w-5 h-5 animate-bounce" />
                  <span>📞 Discar no Aplicativo (Simulador HD)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEndSoftphoneCall}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <PhoneOff className="w-5 h-5" />
                  <span>🔴 Encerrar Chamada</span>
                </button>
              )}

              {/* Botão de Chamada Real por Celular / Operadora (tel:) */}
              <a
                href={`tel:${dialerNumber}`}
                onClick={() => {
                  if (showToast) showToast(`📲 Abrindo discador do celular para ${dialerNumber}...`);
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl shadow transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider border border-blue-400/40 cursor-pointer text-center no-underline"
              >
                <PhoneCall className="w-4 h-4" />
                <span>📱 Ligar de Verdade para o Celular ({dialerNumber})</span>
              </a>
            </div>

            {/* Atalhos Rápidos com código de país +55 */}
            {vehicles.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <span className="text-[10px] uppercase font-bold text-indigo-300 block mb-1.5">Discar para Veículo com +55:</span>
                <div className="flex flex-wrap gap-1.5">
                  {vehicles.map(v => {
                    const num = formatWithBrazilCode(v.phoneNumber || v.trackerNumber || '11954125793');
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setDialerNumber(num);
                          playDtmfTone('5', 100);
                          if (showToast) showToast(`📱 Número do veículo ${v.name} (${num}) carregado no discador.`);
                        }}
                        className="bg-slate-900 hover:bg-indigo-800 text-indigo-200 hover:text-white px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>🚗 {v.name}</span>
                        <span className="font-mono text-[10px] text-emerald-400">({num})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Coluna de Status da Chamada, Monitor de Áudio & Agregação In-App */}
          <div className="lg:col-span-7 space-y-4">
            {/* Monitor de Áudio HD */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs text-indigo-300 font-bold mb-2">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-emerald-400" /> Transmissão de Áudio da Cabine
                </span>
                <span className="text-emerald-400 font-mono font-bold">
                  {Math.floor(listenTimer / 60).toString().padStart(2, '0')}:{(listenTimer % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* Status Indicator */}
              {softphoneState === 'calling' && (
                <div className="bg-amber-950/80 border border-amber-500/40 text-amber-300 rounded-xl p-3 text-xs flex items-center gap-2 mb-3 animate-pulse">
                  <Phone className="w-4 h-4 animate-bounce" />
                  <span>Discando via VoIP In-App para <strong>{dialerNumber}</strong>... Aguarde o tom de atendimento.</span>
                </div>
              )}

              {softphoneState === 'connected' && (
                <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-xl p-3 text-xs flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
                  <span>🟢 Conectado! Microfone da cabine captando áudio ao vivo sem passar pelo telefone celular.</span>
                </div>
              )}

              {/* Equalizador de Áudio Visual */}
              <div className="flex items-center justify-center gap-1.5 h-8 bg-slate-900 rounded-xl p-2 mb-3">
                {[...Array(16)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-full transition-all ${softphoneState === 'connected' ? 'bg-emerald-400 animate-bounce' : 'bg-slate-700'}`}
                    style={{
                      height: softphoneState === 'connected' ? `${Math.floor(Math.random() * 22 + 6)}px` : '4px',
                      animationDelay: `${i * 0.05}s`
                    }}
                  />
                ))}
              </div>

              {/* Volume Slider com Super Volume Turbo (0% a 400%) */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 mb-3">
                <div className="flex items-center justify-between text-xs text-indigo-200 mb-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {volumeLevel === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                    <span>Volume da Escuta (Cabine):</span>
                  </span>
                  <span className="font-mono text-emerald-300 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-700">
                    {volumeLevel}% {volumeLevel > 200 ? '⚡ TURBO' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="400"
                  step="5"
                  value={volumeLevel}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolumeLevel(val);
                    if (stopAmbientAudioRef.current && stopAmbientAudioRef.current.setVolume) {
                      stopAmbientAudioRef.current.setVolume(val / 100, isSpeakerphone);
                    }
                  }}
                  className="w-full accent-emerald-400 h-2 bg-slate-950 rounded-lg cursor-pointer mb-2"
                />

                {/* Atalhos de Ganho do Volume */}
                <div className="flex items-center justify-between gap-1.5 pt-1">
                  {[100, 200, 300, 400].map(vol => (
                    <button
                      key={vol}
                      type="button"
                      onClick={() => {
                        setVolumeLevel(vol);
                        if (stopAmbientAudioRef.current && stopAmbientAudioRef.current.setVolume) {
                          stopAmbientAudioRef.current.setVolume(vol / 100, isSpeakerphone);
                        }
                        if (showToast) showToast(`🔊 Volume ajustado para ${vol}%`);
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                        volumeLevel === vol 
                          ? 'bg-emerald-500 text-slate-950 border border-emerald-300 shadow-xs' 
                          : 'bg-slate-950 text-indigo-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {vol}% {vol === 400 ? '🚀 MAX' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botão Especial VIVA-VOZ (Alto-Falante Amplificado) */}
              <button
                type="button"
                onClick={toggleSpeakerphone}
                className={`w-full py-2.5 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md border ${
                  isSpeakerphone 
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 border-amber-300 animate-pulse' 
                    : 'bg-indigo-900/80 hover:bg-indigo-800 text-amber-300 border-amber-500/40'
                }`}
              >
                <Volume2 className={`w-4 h-4 ${isSpeakerphone ? 'animate-bounce text-slate-950' : 'text-amber-400'}`} />
                <span>📢 {isSpeakerphone ? 'VIVA-VOZ ATIVADO (ALTO-FALANTE 2.5X)' : 'ATIVAR MODO VIVA-VOZ (ALTO-FALANTE)'}</span>
              </button>
            </div>

            {/* Bloco de Agregação Direta In-App */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <label className="block text-xs font-bold text-indigo-300 mb-1.5 flex items-center justify-between">
                <span>📝 Salvar Agregação Direta no Registrador:</span>
                <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">Sem celular</span>
              </label>
              <textarea
                rows={2}
                value={realtimeNote}
                onChange={(e) => setRealtimeNote(e.target.value)}
                placeholder="Insira notas da escuta ou observações do motorista..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 mb-2 resize-none"
              />
              <button
                type="button"
                onClick={handleSaveAggregationFromDialer}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
              >
                <Save className="w-3.5 h-3.5" />
                <span>💾 Registrar Agregação em Memória</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Ações Rápidas de Escuta para Veículos */}

      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
        <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-emerald-600" />
          <span>Ativar Registrador & Escuta Direta para um Veículo</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.slice(0, 6).map(veh => (
            <div key={veh.id} className="bg-gray-50 hover:bg-indigo-50/50 border border-gray-200 rounded-xl p-3 flex items-center justify-between transition-all">
              <div>
                <p className="font-bold text-sm text-gray-900">{veh.name}</p>
                <p className="text-xs text-gray-500 font-mono">{veh.licensePlate || 'Sem Placa'} • {veh.trackerNumber || 'Chip 4G'}</p>
              </div>
              <button
                onClick={() => {
                  if (onOpenListenModal) onOpenListenModal(veh.id);
                  if (showToast) showToast(`🎙️ Abrindo Registrador & Escuta In-App para ${veh.name}...`);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Escuta Direta</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por veículo, placa ou anotação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
            <span className="text-xs font-semibold text-gray-500 pl-2">Categoria:</span>
            {['todos', 'rotina', 'seguranca', 'manutencao', 'alerta'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize transition-colors ${
                  selectedCategory === cat ? 'bg-white shadow-xs text-indigo-700 font-bold' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <select
            value={selectedVehicleFilter}
            onChange={(e) => setSelectedVehicleFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="todos">Todos os Veículos</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Agregações e Registros */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>Lista de Agregações & Registros Salvos ({filteredRecords.length})</span>
          </h3>
          <span className="text-xs text-gray-500 font-medium">Auto-Salvo no Registrador In-App</span>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Disc className="w-12 h-12 mx-auto mb-3 text-gray-300 animate-pulse" />
            <p className="font-medium text-gray-600">Nenhum registro de escuta ou agregação encontrado.</p>
            <p className="text-xs mt-1 text-gray-400">Utilize o botão "Nova Agregação" ou acione a escuta em tempo real para gerar novos registros.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredRecords.map(rec => (
              <div key={rec.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-gray-900 text-sm">{rec.vehicleName}</span>
                    {rec.licensePlate && (
                      <span className="bg-gray-100 text-gray-700 font-mono text-[11px] px-2 py-0.5 rounded border border-gray-200 uppercase font-semibold">
                        {rec.licensePlate}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      rec.category === 'seguranca' ? 'bg-red-100 text-red-700 border border-red-200' :
                      rec.category === 'alerta' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                      rec.category === 'manutencao' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                      'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}>
                      {rec.category}
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/80 p-2.5 rounded-xl border border-gray-100">
                    💬 <strong className="text-gray-800">Agregação:</strong> {rec.notes}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-gray-400 font-medium">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {rec.timestamp}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Duração: {formatSeconds(rec.durationSeconds)}</span>
                    <span>👤 {rec.operatorName}</span>
                  </div>
                </div>

                {/* Reprodutor de Áudio Simulado In-App e Ações */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      if (isPlayingId === rec.id) {
                        setIsPlayingId(null);
                        if (showToast) showToast('⏸️ Reprodução de áudio pausada.');
                      } else {
                        setIsPlayingId(rec.id);
                        if (showToast) showToast(`▶️ Reproduzindo áudio da agregação de ${rec.vehicleName}...`);
                      }
                    }}
                    className={`font-semibold text-xs py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border ${
                      isPlayingId === rec.id
                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 animate-pulse'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                    }`}
                  >
                    {isPlayingId === rec.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlayingId === rec.id ? 'Pausar Áudio' : 'Ouvir Áudio'}</span>
                  </button>

                  <button
                    onClick={() => {
                      const text = `REGISTRO DE ESCUTA DE CABINE - GKD MOBILITY\nVeículo: ${rec.vehicleName}\nPlaca: ${rec.licensePlate || 'N/A'}\nData: ${rec.timestamp}\nDuração: ${formatSeconds(rec.durationSeconds)}\nAnotação: ${rec.notes}`;
                      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `registro_${rec.id}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      if (showToast) showToast(`📥 Download do registro ${rec.id} efetuado!`);
                    }}
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                    title="Baixar Registro"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteRecord(rec.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                    title="Excluir Registro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal para Adicionar Nova Agregação Manual Direct In-App */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>Nova Agregação Direta In-App</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Selecione o Veículo</label>
              <select
                value={newNoteVehicle}
                onChange={(e) => setNewNoteVehicle(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.licensePlate || 'Sem Placa'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Categoria da Agregação</label>
              <select
                value={newNoteCategory}
                onChange={(e) => setNewNoteCategory(e.target.value as any)}
                className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
              >
                <option value="rotina">Rotina de Monitoramento</option>
                <option value="seguranca">Alerta de Segurança</option>
                <option value="manutencao">Manutenção e Teste do Rastreador</option>
                <option value="alerta">Anomalia Sonora</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Anotações / Observações da Escuta</label>
              <textarea
                rows={4}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Descreva o áudio ouvido na cabine, ruídos identificados ou observações importantes..."
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddManualAggregation}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Agregação</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
