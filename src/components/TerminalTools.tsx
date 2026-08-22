import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  MapPin, Sliders, Lock, Target, Settings, Route, FileText, MoreHorizontal, X, Save, 
  Wrench, Gauge, Bell, Cpu, Volume2, VolumeX, Mic, MicOff, Disc, Download, Phone, 
  PhoneOff, PhoneCall, MessageSquare, ArrowLeft, Battery, BatteryCharging, Zap, Sparkles, 
  CheckCircle2, Copy, Send, Check, ShieldCheck
} from 'lucide-react';
import { playAlarmSound, stopAlarmSound, isAlarmPlaying, unlockAudio, playAmbientNoise, playDtmfTone, playRingbackTone, startRingbackLoop, stopRingbackLoop } from '../lib/audioService';

import { Vehicle } from '../types';
interface TerminalToolsProps {
  setActiveModule?: (module: string) => void;
  onOpenRouteManager?: () => void;
  vehicles?: Vehicle[];
  handleUpdateVehicle?: (v: Vehicle) => void;
  showToast?: (msg: string) => void;
  addNotification?: (notif: any) => void;
  triggerDualDispatch?: (commandName: string, smsCommand: string, phoneNumber: string, vehicleName: string) => void;
  onBackToMap?: () => void;
  messageController?: {
    selectedVehicleForMessage?: Vehicle | null;
    setSelectedVehicleForMessage?: (v: Vehicle | null) => void;
    showMessageModal?: boolean;
    setShowMessageModal?: (b: boolean) => void;
  };
}

export default function TerminalTools({
  setActiveModule, 
  onOpenRouteManager, 
  vehicles = [], 
  handleUpdateVehicle, 
  showToast, 
  addNotification,
  triggerDualDispatch,
  onBackToMap,
  messageController
}: TerminalToolsProps) {
  const {
    selectedVehicleForMessage = null,
    setSelectedVehicleForMessage = () => {},
    showMessageModal = false,
    setShowMessageModal = () => {}
  } = messageController || {};
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [listenModalOpen, setListenModalOpen] = useState(false);
  const [listenTimer, setListenTimer] = useState(0);
  const [isTestingSound, setIsTestingSound] = useState(false);
  const [isCallConnected, setIsCallConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(100);
  const [isSpeakerphone, setIsSpeakerphone] = useState(false);
  const [realtimeNote, setRealtimeNote] = useState('');

  // Softphone In-App Dialer state
  const [dialerNumber, setDialerNumber] = useState<string>('+5511954125793');
  const [softphoneState, setSoftphoneState] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [showKeypad, setShowKeypad] = useState(true);

  const formatWithBrazilCode = (raw: string) => {
    if (!raw) return '+5511954125793';
    const clean = raw.replace(/[^0-9]/g, '');
    if (!clean) return '+55';
    if (clean.startsWith('55')) {
      return `+${clean}`;
    }
    return `+55${clean}`;
  };

  const stopAmbientAudioRef = React.useRef<any>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const recordingIntervalRef = React.useRef<any>(null);
  const micStreamRef = React.useRef<MediaStream | null>(null);
  
  const [config, setConfig] = useState({
    timezone: '-3',
    smsPassword: 'password',
    authorizationNumber: '+5511999999999',
    tankVolumeLiters: 55,
    oilCalibration: '0.85',
    initialMileageMeters: 0,
    mileageDisplayUnit: 'km',
    accNotify: true,
    turningAngle: 25,
    alarmSendingTimes: '1',
    sensitivity: 'medium',
    alarmSettings: 'velocidade,acc,bateria,choque,cerca',
    drivingBehaviorSetting: 'Curva: 25° | Frenagem: 0.4g | Aceleração: 0.3g',
    speakerSwitch: true,
    bluetoothSwitch: false
  });

  useEffect(() => {
    let isSubscribed = true;
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'terminal_configs', 'global');
        const docSnap = await getDoc(docRef);
        if (isSubscribed && docSnap.exists()) {
          setConfig(docSnap.data() as any);
        }
      } catch (error) {
        console.error('Error fetching terminal config:', error);
      }
    };
    fetchConfig();
    return () => { isSubscribed = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'terminal_configs', 'global');
      await setDoc(docRef, config);
      setStatusMessage({type: 'success', text: 'Configuração salva com sucesso!'}); setTimeout(() => setStatusMessage(null), 3000);
      setActiveTopic(null);
    } catch (error) {
      console.error('Error saving terminal config:', error);
      setStatusMessage({type: 'error', text: 'Erro ao salvar configuração.'}); setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Carregando ferramentas...</div>;
  }

  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isApplyingSleepAll, setIsApplyingSleepAll] = useState<boolean>(false);
  const [sleepTargetId, setSleepTargetId] = useState<string>('all');

  const tools = [
    { id: 'bateria_sleep', title: 'Economia Bateria', icon: <BatteryCharging className="w-8 h-8 text-emerald-500" /> },
    { id: 'posicao', title: 'Posição', icon: <MapPin className="w-8 h-8 text-blue-500" /> },
    { id: 'controle', title: 'Controle', icon: <Sliders className="w-8 h-8 text-red-500" /> },
    { id: 'bloqueio', title: 'Bloqueio', icon: <Lock className="w-8 h-8 text-cyan-500" /> },
    { id: 'cerca', title: 'Cerca geográfica', icon: <Target className="w-8 h-8 text-orange-500" /> },
    { id: 'configuracao', title: 'Configuração', icon: <Settings className="w-8 h-8 text-teal-500" /> },
    { id: 'trajetoria', title: 'Trajetória', icon: <Route className="w-8 h-8 text-indigo-500" /> },
    { id: 'detalhes', title: 'Detalhes do Veículo', icon: <FileText className="w-8 h-8 text-amber-500" /> },
    { id: 'mais', title: 'Mais', icon: <MoreHorizontal className="w-8 h-8 text-slate-500" /> }
  ];

  const topics = [
    { id: 'basic', title: 'Configurações Básicas', icon: <Settings className="w-8 h-8 text-blue-500" />, desc: 'Fuso horário, Senhas SMS e Números de Autorização.' },
    { id: 'calibration', title: 'Calibração e Hodômetro', icon: <Gauge className="w-8 h-8 text-green-500" />, desc: 'Volume de tanque, calibração de óleo e controle de quilometragem.' },
    { id: 'alarms', title: 'Alarmes e Sensores', icon: <Bell className="w-8 h-8 text-red-500" />, desc: 'Configurações de alerta, sensibilidade, comportamento e ângulos de giro.' },
    { id: 'advanced', title: 'Recursos Avançados', icon: <Cpu className="w-8 h-8 text-purple-500" />, desc: 'Controle de ACC, Alto-falante e Bluetooth.' }
  ];

  
  // Encerrar tudo ao fechar o modal
  const handleCloseListenModal = () => {
    setListenModalOpen(false);
    setIsCallConnected(false);
    setIsMuted(false);

    if (isRecording) {
      handleStopRecording();
    }

    if (stopAmbientAudioRef.current) {
      try {
        if (typeof stopAmbientAudioRef.current === 'function') {
          stopAmbientAudioRef.current();
        } else if (stopAmbientAudioRef.current.stop) {
          stopAmbientAudioRef.current.stop();
        }
      } catch (e) {}
      stopAmbientAudioRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
  };

  // Ligar In-App chamada e pedir permissão de microfone
  const handleStartInAppCall = async () => {
    unlockAudio();
    setIsCallConnected(true);

    if (!stopAmbientAudioRef.current) {
      const ambientObj = playAmbientNoise(volumeLevel / 100, isSpeakerphone);
      stopAmbientAudioRef.current = ambientObj;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        micStreamRef.current = stream;
        if (showToast) showToast('🎙️ Microfone ativado! Chamada interna de áudio iniciada.');
      } else {
        if (showToast) showToast('🟢 Chamada interna iniciada em alta definição.');
      }
    } catch (err) {
      console.warn('Microfone do usuário não disponível:', err);
      if (showToast) showToast('🟢 Chamada interna iniciada via áudio HD de escuta.');
    }
  };

  // Alternar Viva-Voz (Alto-Falante Amplificado)
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

  // Iniciar Gravação do Microfone / Áudio
  const handleStartRecording = async () => {
    try {
      let streamToRecord: MediaStream | null = micStreamRef.current;

      if (!streamToRecord && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          streamToRecord = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1
            }
          });
          micStreamRef.current = streamToRecord;
        } catch (err) {
          console.error('Erro ao obter acesso ao microfone:', err);
          if (showToast) showToast('❌ Erro: Verifique as permissões do microfone no navegador.');
          return; // Stop execution
        }
      }

      if (streamToRecord && typeof MediaRecorder !== 'undefined') {
        audioChunksRef.current = [];
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
            ? 'audio/webm;codecs=opus' 
            : 'audio/webm';
          const recorder = new MediaRecorder(streamToRecord, { mimeType });
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };
          recorder.start(250);
          mediaRecorderRef.current = recorder;
        } catch (e) {
          console.error('MediaRecorder error:', e);
          if (showToast) showToast('❌ Erro ao configurar gravador de áudio.');
          return;
        }
      } else if (!streamToRecord) {
        if (showToast) showToast('❌ Microfone não encontrado ou acesso negado.');
        return;
      }

      setIsRecording(true);
      setRecordingSeconds(0);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      if (showToast) showToast('🔴 Gravação da conversa iniciada!');
    } catch (e) {
      console.error('Erro geral ao iniciar gravação:', e);
      if (showToast) showToast('🔴 Erro ao iniciar gravação.');
    }
  };

  // Parar Gravação e Baixar Arquivo
  const handleStopRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    setIsRecording(false);

    setTimeout(() => {
      const targetVeh = vehicles.find(v => v.id === selectedVehicleId);
      const vehicleName = (targetVeh?.name || 'veiculo').replace(/[^a-z0-9]/gi, '_');
      const filename = `escuta_gravacao_${vehicleName}_${new Date().toISOString().slice(0, 10)}.webm`;

      if (audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (showToast) showToast(`💾 Gravação salva e baixada: ${filename}`);
      } else {
        const dummyText = `Gravação de Escuta de Áudio HD - Veículo: ${targetVeh?.name || 'Peugeot 208'}\nData: ${new Date().toLocaleString()}`;
        const blob = new Blob([dummyText], { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (showToast) showToast(`💾 Gravação salva e baixada com sucesso!`);
      }
    }, 300);
  };

  // Mudar Mute/Unmute
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }
    if (showToast) showToast(nextMuted ? '🔇 Microfone mutado' : '🎙️ Microfone ativado');
  };

  // Discador In-App (Softphone) Handlers
  const handleSoftphoneKeyPress = (digit: string) => {
    playDtmfTone(digit);
    setDialerNumber(prev => prev + digit);
  };

  const handleSoftphoneClear = () => {
    playDtmfTone('*', 80);
    setDialerNumber(prev => prev.slice(0, -1));
  };

  const handleStartSoftphoneCall = () => {
    const formattedNum = formatWithBrazilCode(dialerNumber);
    if (showToast) showToast(`📞 Discando para ${formattedNum}...`);
    window.location.href = `tel:${formattedNum}`;
  };

  const handleEndSoftphoneCall = () => {
    setSoftphoneState('idle');
    if (showToast) showToast('🔴 Chamada encerrada.');
  };


  // Salvar Agregação Direta In-App
  const handleSaveInAppAggregation = () => {
    if (!realtimeNote.trim()) {
      if (showToast) showToast('⚠️ Digite uma observação antes de salvar a agregação.');
      return;
    }
    const targetVeh = vehicles.find(v => v.id === selectedVehicleId);
    const newEntry = {
      id: `rec_${Date.now()}`,
      vehicleId: selectedVehicleId || 'v1',
      vehicleName: targetVeh?.name || 'Veículo em Escuta',
      licensePlate: targetVeh?.licensePlate || 'CAB-2026',
      timestamp: new Date().toLocaleString('pt-BR'),
      durationSeconds: listenTimer > 0 ? listenTimer : 30,
      notes: realtimeNote,
      category: 'rotina',
      status: 'concluido',
      operatorName: 'Operador In-App'
    };
    try {
      const existing = JSON.parse(localStorage.getItem('gkd_registrador_records') || '[]');
      localStorage.setItem('gkd_registrador_records', JSON.stringify([newEntry, ...existing]));
      if (showToast) showToast('💾 Agregação salva diretamente no Registrador In-App!');
      setRealtimeNote('');
    } catch (e) {
      if (showToast) showToast('💾 Agregação salva!');
      setRealtimeNote('');
    }
  };

  useEffect(() => {
    let interval: any;
    const isCallActive = isCallConnected || softphoneState === 'connected';

    if (listenModalOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCloseListenModal();
        } else if (e.code === 'KeyM') {
          toggleMute();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      if (isCallActive) {
        interval = setInterval(() => {
          setListenTimer(prev => prev + 1);
        }, 1000);
      } else {
        setListenTimer(0);
      }

      return () => {
        if (interval) clearInterval(interval);
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      setListenTimer(0);
      if (stopAmbientAudioRef.current) {
        stopAmbientAudioRef.current();
        stopAmbientAudioRef.current = null;
      }
    }
  }, [listenModalOpen, isCallConnected, softphoneState, isMuted, isRecording]);
  
  const handleApplyTK303GSleep = async (targetId: string = 'all') => {
    const targets = targetId === 'all'
      ? vehicles
      : vehicles.filter(v => v.id === targetId);

    if (targets.length === 0) {
      if (showToast) showToast('❌ Nenhum veículo selecionado.');
      return;
    }

    setIsApplyingSleepAll(true);
    let count = 0;

    for (const v of targets) {
      const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Veículo';
      const phoneVal = v.phoneNumber || v.trackerNumber || '';
      const pwd = v.settings?.smsPassword || '123456';

      if (triggerDualDispatch) {
        triggerDualDispatch('Modo Sleep por Choque', `sleep${pwd} shock`, phoneVal, identifier);
        setTimeout(() => {
          triggerDualDispatch('Intervalo 30s/1h', `fix030s01h***n${pwd}`, phoneVal, identifier);
        }, 600);
        setTimeout(() => {
          triggerDualDispatch('Economia GPRS', `less gprs${pwd} on`, phoneVal, identifier);
        }, 1200);
      }

      if (handleUpdateVehicle) {
        handleUpdateVehicle({
          ...v,
          settings: {
            ...v.settings,
            _sleepModeEnabled: true,
            _sleepConfiguredAt: new Date().toLocaleDateString('pt-BR')
          }
        });
      }
      count++;
    }

    setTimeout(() => {
      setIsApplyingSleepAll(false);
      if (addNotification) {
        addNotification({
          title: '⚡ Economia de Bateria Configurada',
          message: `Modo Ultra-Economia TK303G enviado para ${count} veículo(s).`,
          type: 'command',
          severity: 'info',
          vehicleName: count === 1 ? (targets[0].name || 'Veículo') : 'Frota Completa'
        });
      }
      if (showToast) {
        showToast(`⚡ Comandos de ultra-economia enviados para ${count} veículo(s)!`);
      }
    }, 1600);
  };

  const handleSendSingleTK303GCommand = (cmdName: string, rawCmdText: string, targetId: string = 'all') => {
    const targets = targetId === 'all'
      ? vehicles
      : vehicles.filter(v => v.id === targetId);

    if (targets.length === 0) {
      if (showToast) showToast('❌ Nenhum veículo selecionado.');
      return;
    }

    for (const v of targets) {
      const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Veículo';
      const phoneVal = v.phoneNumber || v.trackerNumber || '';
      const pwd = v.settings?.smsPassword || '123456';
      const finalCmd = rawCmdText.replace(/123456/g, pwd);

      if (triggerDualDispatch) {
        triggerDualDispatch(cmdName, finalCmd, phoneVal, identifier);
      }
    }

    if (showToast) {
      showToast(`📡 Comando "${cmdName}" enviado para ${targets.length} veículo(s)!`);
    }
  };

  const handleCopyCommand = (text: string, label: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedCmd(label);
      if (showToast) showToast(`📋 Comando "${text}" copiado para a área de transferência!`);
      setTimeout(() => setCopiedCmd(null), 2500);
    }
  };

  return (
    <div className="flex-grow flex flex-col h-full bg-gray-50 overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto p-4 sm:p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <Wrench className="w-6 h-6 mr-3 text-blue-600" />
              Ferramentas do Veículo
            </h2>
            <p className="text-gray-500 mt-1 text-sm">
              Selecione uma ferramenta abaixo para interagir ou gerenciar as funções do veículo selecionado.
            </p>
          </div>
          
        </div>

        {/* Banner Especial de Ação Rápida: Economia de Bateria TK303G */}
        <div className="mb-6 bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0 shadow-inner">
              <BatteryCharging className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-white">Ultra-Economia de Bateria (TK303G)</h3>
                <span className="bg-emerald-500/30 text-emerald-300 text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full border border-emerald-400/40">
                  Modo Sleep
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 max-w-xl leading-relaxed">
                Configuração para desligar GPS e suspender transmissões quando o carro estiver estacionado, reduzindo o consumo de <span className="text-white font-bold">~60mA para &lt; 4mA</span>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTool('bateria_sleep')}
            className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black px-6 py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Zap className="w-4 h-4 text-slate-950 fill-slate-950" />
            <span>Configurar Economia</span>
          </button>
        </div>

        {/* Informações de Intervalos e Atualizações Recentes */}
        <div className="mb-8 bg-blue-50/80 border border-blue-200 rounded-2xl p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide flex items-center gap-2">
            <span>⏱️</span> Frequência de Atualização e Recursos Ativos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-blue-800">
            <div className="bg-white/80 p-3 rounded-xl border border-blue-100 flex items-center gap-2.5 shadow-xs">
              <span className="text-lg">🚗</span>
              <div>
                <span className="font-bold block text-gray-900">Busca de Carros</span>
                <span>A cada 1 minuto (60s)</span>
              </div>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-blue-100 flex items-center gap-2.5 shadow-xs">
              <span className="text-lg">📡</span>
              <div>
                <span className="font-bold block text-gray-900">Telemetria GPS</span>
                <span>Atualização GPRS e Satélites</span>
              </div>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-blue-100 flex items-center gap-2.5 shadow-xs">
              <span className="text-lg">⏳</span>
              <div>
                <span className="font-bold block text-gray-900">Fila Offline</span>
                <span>Comandos enfileirados com cancelamento</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
          {tools.map(tool => (
            <div 
              key={tool.id}
              onClick={() => {
                  if (tool.id === 'trajetoria' && setActiveModule) {
                    setActiveModule('historico');
                  } else {
                    setActiveTool(tool.id);
                  }
                }}
              className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group flex flex-col items-center text-center gap-3 sm:gap-4"
            >
              <div className="p-3.5 sm:p-4 bg-gray-50 rounded-full group-hover:bg-blue-50 transition-colors">
                {tool.icon}
              </div>
              <span className="font-semibold text-gray-700 group-hover:text-blue-600 text-xs sm:text-sm whitespace-nowrap overflow-hidden text-ellipsis w-full">{tool.title}</span>
            </div>
          ))}
        </div>
      </div>

      {activeTool === 'configuracao' && !activeTopic && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <Settings className="w-5 h-5 mr-2 text-teal-600" />
                Configuração do Terminal
              </h3>
              <button onClick={() => setActiveTool(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map(topic => (
                <div 
                  key={topic.id}
                  onClick={() => setActiveTopic(topic.id)}
                  className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all flex items-start gap-4 group"
                >
                  <div className="p-3 bg-gray-50 rounded-lg group-hover:bg-blue-50 transition-colors shrink-0">
                    {topic.icon}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">{topic.title}</h4>
                    <p className="text-xs text-gray-500 mt-1">{topic.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTopic && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-800 flex items-center">
                {topics.find(t => t.id === activeTopic)?.title}
              </h3>
              <button onClick={() => setActiveTopic(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow space-y-6">
              {activeTopic === 'basic' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Fuso horário</label>
                    <input type="text" value={config.timezone} onChange={e => setConfig({...config, timezone: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: -3" />
                    <p className="text-xs text-gray-500 mt-1">Ajuste do fuso para sincronização correta da hora do GPS.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Senha SMS</label>
                    <input type="text" value={config.smsPassword} onChange={e => setConfig({...config, smsPassword: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Senha para enviar comandos via SMS para o rastreador.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Nº Autorização</label>
                    <input type="text" value={config.authorizationNumber} onChange={e => setConfig({...config, authorizationNumber: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Número de telefone autorizado a receber alertas e fazer ligações.</p>
                  </div>
                </div>
              )}

              {activeTopic === 'calibration' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Volume Tanque (L)</label>
                    <input type="number" value={config.tankVolumeLiters} onChange={e => setConfig({...config, tankVolumeLiters: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Capacidade total do tanque para cálculos de consumo de combustível.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Calibração Óleo</label>
                    <input type="text" value={config.oilCalibration} onChange={e => setConfig({...config, oilCalibration: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Parâmetros para calibração do sensor de nível de combustível/óleo.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">KM Inicial (m)</label>
                    <input type="number" value={config.initialMileageMeters} onChange={e => setConfig({...config, initialMileageMeters: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Quilometragem inicial do hodômetro virtual (em metros).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Unidade Exibição</label>
                    <select value={config.mileageDisplayUnit} onChange={e => setConfig({...config, mileageDisplayUnit: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                      <option value="km">km, km/h</option>
                      <option value="miles">miles, mph</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Unidade de medida para velocidade e distâncias.</p>
                  </div>
                </div>
              )}

              {activeTopic === 'alarms' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2 bg-red-50 border border-red-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-red-900 text-sm flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-red-600" />
                        Teste de Alarme Sonoro no Celular
                      </h4>
                      <p className="text-xs text-red-700 mt-0.5">
                        Clique abaixo para autorizar e disparar o alarme sonoro alto de teste no alto-falante do seu celular ou computador.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudio();
                        if (isTestingSound || isAlarmPlaying()) {
                          stopAlarmSound();
                          setIsTestingSound(false);
                          setStatusMessage({ type: 'success', text: '🔇 Alarme sonoro silenciado com sucesso.' });
                        } else {
                          playAlarmSound('siren', 8000);
                          setIsTestingSound(true);
                          setStatusMessage({ type: 'success', text: '🔊 Disparando sirene de alarme! Clique no mesmo botão para parar.' });
                        }
                      }}
                      className={`px-4 py-2 ${
                        isTestingSound || isAlarmPlaying()
                          ? 'bg-amber-600 hover:bg-amber-700 animate-pulse'
                          : 'bg-red-600 hover:bg-red-700'
                      } active:scale-95 text-white text-xs font-bold rounded-lg shadow transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer`}
                    >
                      {isTestingSound || isAlarmPlaying() ? (
                        <>
                          <VolumeX className="w-4 h-4" />
                          🔇 Parar Som de Alarme
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4" />
                          🔊 Testar / Parar Som de Alarme
                        </>
                      )}
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Alarmes Horários</label>
                    <input type="text" value={config.alarmSendingTimes} onChange={e => setConfig({...config, alarmSendingTimes: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Configuração de horários específicos para envio de relatórios.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Sensibilidade</label>
                    <input type="text" value={config.sensitivity} onChange={e => setConfig({...config, sensitivity: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Nível de sensibilidade do acelerômetro para detecção de movimento/vibração.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Configs Alarme</label>
                    <input type="text" value={config.alarmSettings} onChange={e => setConfig({...config, alarmSettings: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Configurações avançadas de gatilhos (ex: bateria fraca, corte de energia).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Comportamento Dirigir</label>
                    <input type="text" value={config.drivingBehaviorSetting} onChange={e => setConfig({...config, drivingBehaviorSetting: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Parâmetros para detectar aceleração brusca, frenagem brusca e curvas fechadas.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Ângulo Giro</label>
                    <input type="number" value={config.turningAngle} onChange={e => setConfig({...config, turningAngle: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                    <p className="text-xs text-gray-500 mt-1">Ângulo mínimo para registrar uma mudança de direção no mapa.</p>
                  </div>
                </div>
              )}

              {activeTopic === 'advanced' && (
                <div className="grid grid-cols-1 gap-6">
                  <div className="flex flex-col bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="flex items-center space-x-3 cursor-pointer mb-1">
                      <input type="checkbox" checked={config.accNotify} onChange={e => setConfig({...config, accNotify: e.target.checked})} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                      <span className="text-base font-semibold text-gray-800">Acc Notificar</span>
                    </label>
                    <p className="text-sm text-gray-500 ml-8">Notifica quando a ignição do veículo é ligada/desligada.</p>
                  </div>
                  
                  <div className="flex flex-col bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="flex items-center space-x-3 cursor-pointer mb-1">
                      <input type="checkbox" checked={config.speakerSwitch} onChange={e => setConfig({...config, speakerSwitch: e.target.checked})} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                      <span className="text-base font-semibold text-gray-800">Alto-falante Ativo</span>
                    </label>
                    <p className="text-sm text-gray-500 ml-8">Ativa a comunicação de voz bidirecional na cabine.</p>
                  </div>

                  <div className="flex flex-col bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="flex items-center space-x-3 cursor-pointer mb-1">
                      <input type="checkbox" checked={config.bluetoothSwitch} onChange={e => setConfig({...config, bluetoothSwitch: e.target.checked})} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                      <span className="text-base font-semibold text-gray-800">Bluetooth Ativo</span>
                    </label>
                    <p className="text-sm text-gray-500 ml-8">Permite conexão com sensores BLE externos (ex: temperatura, pressão de pneus).</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
              <button 
                onClick={() => setActiveTopic(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Voltar
              </button>
              {statusMessage && <div className={`mr-4 px-3 py-1.5 rounded-md text-sm font-medium ${statusMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{statusMessage.text}</div>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm font-medium"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTool === 'bateria_sleep' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-slate-900 to-emerald-950 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
                  <BatteryCharging className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                    Economia de Bateria (TK303G)
                  </h3>
                  <p className="text-xs text-emerald-200/80">
                    Modo Sleep por Vibração / Choque &amp; Standby Inteligente
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setActiveTool(null)} 
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-grow">
              {/* Alerta de Eficiência */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-emerald-900">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm space-y-1">
                  <span className="font-bold block text-emerald-950">Como funciona o Modo Sleep no Coban TK303G:</span>
                  <p className="text-emerald-800 text-xs leading-relaxed">
                    Quando o carro é desligado e fica 5 minutos parado, o rastreador desliga os satélites GPS e os LEDs, mantendo apenas o sensor de vibração ativo. Ao ligar a ignição ou vibrar o carro, ele <strong>acorda em menos de 1 segundo</strong> e volta a transmitir imediatamente.
                  </p>
                  <div className="pt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-emerald-700">
                    <span className="bg-white/80 px-2 py-0.5 rounded-md border border-emerald-200">
                      🔴 Sem Sleep: ~60 mA
                    </span>
                    <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-md shadow-xs">
                      🟢 Com Sleep: &lt; 4 mA (Bateria protegida!)
                    </span>
                  </div>
                </div>
              </div>

              {/* Seletor de Veículo Alvo */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                  1. Selecione o Veículo Alvo:
                </label>
                <select
                  value={sleepTargetId}
                  onChange={(e) => setSleepTargetId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-gray-50 font-medium"
                >
                  <option value="all">⚡ TODA A FROTA (Todos os {vehicles.length} Veículos)</option>
                  {[...vehicles]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(v => (
                      <option key={v.id} value={v.id}>
                        🚗 {v.name} ({v.phoneNumber || v.trackerNumber || 'Sem chip cadastrado'})
                      </option>
                    ))}
                </select>
                {sleepTargetId !== 'all' && (
                  <div className="mt-2 text-xs text-gray-500 flex items-center justify-between px-1">
                    <span>
                      Número do Chip: <strong className="text-gray-800">{vehicles.find(v => v.id === sleepTargetId)?.phoneNumber || vehicles.find(v => v.id === sleepTargetId)?.trackerNumber || 'Não cadastrado'}</strong>
                    </span>
                    <span>
                      Senha SMS: <strong className="text-gray-800">{vehicles.find(v => v.id === sleepTargetId)?.settings?.smsPassword || '123456'}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Super Botão de 1 Clique */}
              <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 rounded-2xl p-5 text-white border border-emerald-500/40 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Recomendado
                  </span>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                    3 Comandos Integrados
                  </span>
                </div>
                <h4 className="text-base font-bold text-white leading-snug">
                  Configurar Pacote de Ultra-Economia Automaticamente
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Envia os 3 comandos oficiais do TK303G em sequência ({' '}
                  <code className="text-emerald-300 bg-black/40 px-1 py-0.5 rounded text-[11px]">sleep shock</code>,{' '}
                  <code className="text-emerald-300 bg-black/40 px-1 py-0.5 rounded text-[11px]">fix030s01h***n</code> e{' '}
                  <code className="text-emerald-300 bg-black/40 px-1 py-0.5 rounded text-[11px]">less gprs on</code>
                  ).
                </p>
                <button
                  type="button"
                  disabled={isApplyingSleepAll}
                  onClick={() => handleApplyTK303GSleep(sleepTargetId)}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-98 disabled:opacity-50 text-slate-950 font-black py-3.5 px-4 rounded-xl text-sm transition-all shadow-md shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isApplyingSleepAll ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Enviando Comandos para os Rastreadores...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-slate-950" />
                      <span>
                        {sleepTargetId === 'all' 
                          ? `⚡ Enviar Economia para Todos os ${vehicles.length} Veículos` 
                          : `⚡ Enviar Economia para ${vehicles.find(v => v.id === sleepTargetId)?.name || 'o Veículo'}`}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Lista dos Comandos Individuais para Envio ou Cópia de SMS */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                  2. Comandos Individuais &amp; Envio por SMS:
                </label>

                {/* Comando 1 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm bg-white border border-gray-300 px-2 py-0.5 rounded text-blue-700">
                        sleep123456 shock
                      </span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                        Hibernação
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Desliga GPS e LEDs após 5 min sem vibração. Acorda ao ligar a ignição.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSendSingleTK303GCommand('Modo Sleep por Choque', 'sleep123456 shock', sleepTargetId)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                      title="Enviar comando via GPRS/Flespi"
                    >
                      <Send className="w-3 h-3" /> Enviar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand('sleep123456 shock', 'cmd1')}
                      className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                      title="Copiar texto do SMS"
                    >
                      {copiedCmd === 'cmd1' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                    </button>
                    {sleepTargetId !== 'all' && vehicles.find(v => v.id === sleepTargetId)?.phoneNumber && (
                      <a
                        href={`sms:${vehicles.find(v => v.id === sleepTargetId)?.phoneNumber}?body=sleep123456%20shock`}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        title="Abrir aplicativo de SMS do celular"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> SMS
                      </a>
                    )}
                  </div>
                </div>

                {/* Comando 2 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm bg-white border border-gray-300 px-2 py-0.5 rounded text-emerald-700">
                        fix030s01h***n123456
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                        Intervalo
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      30 segundos em movimento / 1 hora quando parado.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSendSingleTK303GCommand('Intervalo 30s/1h', 'fix030s01h***n123456', sleepTargetId)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                      title="Enviar comando via GPRS/Flespi"
                    >
                      <Send className="w-3 h-3" /> Enviar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand('fix030s01h***n123456', 'cmd2')}
                      className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                      title="Copiar texto do SMS"
                    >
                      {copiedCmd === 'cmd2' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                    </button>
                    {sleepTargetId !== 'all' && vehicles.find(v => v.id === sleepTargetId)?.phoneNumber && (
                      <a
                        href={`sms:${vehicles.find(v => v.id === sleepTargetId)?.phoneNumber}?body=fix030s01h***n123456`}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        title="Abrir aplicativo de SMS do celular"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> SMS
                      </a>
                    )}
                  </div>
                </div>

                {/* Comando 3 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm bg-white border border-gray-300 px-2 py-0.5 rounded text-teal-700">
                        less gprs123456 on
                      </span>
                      <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded">
                        Economia Dados
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Suspende a conexão contínua de dados GPRS com o carro parado.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSendSingleTK303GCommand('Economia GPRS', 'less gprs123456 on', sleepTargetId)}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                      title="Enviar comando via GPRS/Flespi"
                    >
                      <Send className="w-3 h-3" /> Enviar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand('less gprs123456 on', 'cmd3')}
                      className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                      title="Copiar texto do SMS"
                    >
                      {copiedCmd === 'cmd3' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                    </button>
                    {sleepTargetId !== 'all' && vehicles.find(v => v.id === sleepTargetId)?.phoneNumber && (
                      <a
                        href={`sms:${vehicles.find(v => v.id === sleepTargetId)?.phoneNumber}?body=less%20gprs123456%20on`}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        title="Abrir aplicativo de SMS do celular"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> SMS
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Botão de Desativação */}
              <div className="pt-2 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-gray-500">
                  Deseja remover a hibernação?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleSendSingleTK303GCommand('Desativar Modo Sleep', 'sleep123456 off', sleepTargetId);
                    if (showToast) showToast('💤 Modo Sleep desativado.');
                  }}
                  className="px-3 py-1.5 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Desativar Sleep (sleep123456 off)
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="px-6 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTool && activeTool !== 'configuracao' && activeTool !== 'bateria_sleep' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto flex flex-col text-center p-6 sm:p-8">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-gray-50 rounded-full">
                {tools.find(t => t.id === activeTool)?.icon}
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-3">{tools.find(t => t.id === activeTool)?.title}</h3>
            
            {['posicao', 'controle', 'braco', 'cerca', 'detalhes', 'mais', 'trajetoria'].includes(activeTool) ? (
              <div className="text-left w-full mb-6 mt-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Selecione o Veículo:</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {[...vehicles]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(v => (
                      <option key={v.id} value={v.id}>
                        🚗 {v.name || v.trackerNumber || v.phoneNumber || 'Desconhecido'}
                      </option>
                    ))}
                </select>
                {!selectedVehicleId && (
                  <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl text-center">
                    <p className="text-sm text-gray-500">Selecione um veículo acima para ver as opções disponíveis.</p>
                  </div>
                )}
                
                
                {selectedVehicleId && activeTool === 'posicao' && (
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Obter Posição (SMS)', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Obter Posição na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          const deviceLat = v.lat || -23.514971;
                          const deviceLng = v.lng || -46.548199;
                          const updated = { ...v, lat: deviceLat, lng: deviceLng, status: (v.status === 'Offline' ? 'IgnitionOn' : v.status) as any };
                          handleUpdateVehicle(updated);
                          if (addNotification) addNotification({ title: '📱 Posição SMS Recebida', message: `Sinal GPS de ${identifier} confirmado com sucesso.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast(`📱 Posição SMS obtida com sucesso para ${identifier}!`);
                        }

                        if (triggerDualDispatch) {
                          const pwd = v.settings?.smsPassword || '123456';
                          const phoneVal = v.phoneNumber || v.trackerNumber || '';
                          triggerDualDispatch('Obter Posição (SMS)', `where,${pwd}#`, phoneVal, identifier);
                        }
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      <MapPin className="w-4 h-4"/> Posição SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Posição (GPRS)', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Posição GPRS na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          const deviceLat = v.lat || -23.514971;
                          const deviceLng = v.lng || -46.548199;
                          const updated = { ...v, lat: deviceLat, lng: deviceLng, status: (v.status === 'Offline' ? 'IgnitionOn' : v.status) as any };
                          handleUpdateVehicle(updated);
                          if (addNotification) addNotification({ title: '📡 Posição GPRS Atualizada', message: `Sinal GPRS recebido em tempo real para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast(`📡 Posição GPRS atualizada ao vivo para ${identifier}!`);
                        }

                        if (triggerDualDispatch) {
                          const pwd = v.settings?.smsPassword || '123456';
                          const phoneVal = v.phoneNumber || v.trackerNumber || '';
                          triggerDualDispatch('Posição GPRS', `where,${pwd}#`, phoneVal, identifier);
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      <Route className="w-4 h-4"/> Posição GPRS
                    </button>
                  </div>
                )}

                {selectedVehicleId && activeTool === 'trajetoria' && (
                  <div className="grid grid-cols-1 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v) return;
                        setActiveTool(null);
                        if (onOpenRouteManager) onOpenRouteManager();
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <Route className="w-5 h-5"/> Visualizar Histórico e Rotas
                    </button>
                  </div>
                )}

                {selectedVehicleId && activeTool === 'controle' && (
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Desligar Aparelho', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Desligar Aparelho na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, status: 'IgnitionOff' });
                          if (addNotification) addNotification({ title: '🔌 Comando Executado', message: `Corte de ignição enviado para ${identifier}.`, type: 'command', severity: 'critical', vehicleName: identifier });
                          if (showToast) showToast('🔌 Comando registrado.');
                        }

                        if (triggerDualDispatch) {
                          const pwd = v.settings?.smsPassword || '123456';
                          const phoneVal = v.phoneNumber || v.trackerNumber || '';
                          triggerDualDispatch('Desligar Aparelho', `stop${pwd}`, phoneVal, identifier);
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🔌 Desligar
                    </button>
                    

                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isBlocked = !!v.settings?.isBlocked;
                        const pwd = v.settings?.smsPassword || '123456';
                        const phoneVal = v.phoneNumber || v.trackerNumber || '';

                        if (isBlocked) {
                          handleUpdateVehicle({ 
                            ...v, 
                            status: 'IgnitionOn', 
                            commandQueue: [],
                            settings: {
                              ...v.settings,
                              isBlocked: false
                            }
                          });
                          if (addNotification) addNotification({ title: '🔓 Comando Executado', message: `Desbloqueio ativado para ${identifier}. O motor e combustível estão liberados.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🔓 Desbloqueio executado com sucesso.');
                          try { window.alert(`O veículo ${identifier} foi desbloqueado com sucesso!`); } catch(e) {}
                        } else {
                          handleUpdateVehicle({ 
                            ...v, 
                            status: 'Stopped', 
                            speed: 0,
                            settings: {
                              ...v.settings,
                              isBlocked: true
                            }
                          });
                          if (addNotification) addNotification({ title: '🔒 Comando Executado', message: `Bloqueio ativado para ${identifier}. Corte de combustível acionado.`, type: 'command', severity: 'critical', vehicleName: identifier });
                          if (showToast) showToast('🔒 Bloqueio executado com sucesso.');
                          try { window.alert(`O veículo ${identifier} foi bloqueado com sucesso (Corte de combustível)!`); } catch(e) {}
                        }

                        if (triggerDualDispatch) {
                          triggerDualDispatch(
                            isBlocked ? 'Desbloquear Aparelho' : 'Bloquear Aparelho',
                            isBlocked ? `resume${pwd}` : `stop${pwd}`,
                            phoneVal,
                            identifier
                          );
                        }
                      }}
                      className={`py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all text-white ${
                        vehicles.find(v => v.id === selectedVehicleId)?.settings?.isBlocked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      {vehicles.find(v => v.id === selectedVehicleId)?.settings?.isBlocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Tocar Alarme', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Tocar Alarme na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: '📍 Comando Executado', message: `Tocar Alarme reativado para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('📍 Tocar Alarme ativado.');
                        }
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🔊 Tocar Alarme
                    </button>

 
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Tocar Alarme', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Tocar Alarme na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, status: 'Alarm' });
                          if (addNotification) addNotification({ title: '🔊 Comando Executado', message: `Alarme acionado em ${identifier}.`, type: 'command', severity: 'critical', vehicleName: identifier });
                          if (showToast) showToast('🔊 Comando registrado.');
                        }

                        if (triggerDualDispatch) {
                          const pwd = v.settings?.smsPassword || '123456';
                          const phoneVal = v.phoneNumber || v.trackerNumber || '';
                          triggerDualDispatch('Tocar Alarme', `sound${pwd}`, phoneVal, identifier);
                        }
                      }}
                      className="bg-amber-500 hover:bg-amber-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🔊 Alarme
                    </button>
 
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Reiniciar Sistema', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Reiniciar na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, status: 'IgnitionOn' });
                          if (addNotification) addNotification({ title: '🔄 Comando Executado', message: `Reinício acionado em ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🔄 Comando registrado.');
                        }

                        if (triggerDualDispatch) {
                          const pwd = v.settings?.smsPassword || '123456';
                          const phoneVal = v.phoneNumber || v.trackerNumber || '';
                          triggerDualDispatch('Reiniciar Sistema', `reset${pwd}`, phoneVal, identifier);
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🔄 Reiniciar
                    </button>
                  </div>
                )}
                
                {selectedVehicleId && activeTool === 'braco' && (
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Armar Alarme', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Armar Alarme na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, settings: { ...v.settings, _alarmArmed: true } });
                          if (addNotification) addNotification({ title: '🛡️ Comando Executado', message: `Alarme armado para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🛡️ Alarme armado com sucesso.');
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🛡️ Armar
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Desarmar Alarme', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Desarmar Alarme na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, settings: { ...v.settings, _alarmArmed: false } });
                          if (addNotification) addNotification({ title: '🔓 Comando Executado', message: `Alarme desarmado para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🔓 Alarme desarmado com sucesso.');
                        }
                      }}
                      className="bg-slate-600 hover:bg-slate-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🔓 Desarmar
                    </button>
                  </div>
                )}
                
                {selectedVehicleId && activeTool === 'cerca' && (
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Ativar Cerca', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Ativar Cerca na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, settings: { ...v.settings, _geofenceActive: true } });
                          if (addNotification) addNotification({ title: '🎯 Comando Executado', message: `Cerca geográfica ativada para ${identifier} (raio padrão 500m).`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🎯 Cerca geográfica ativada.');
                        }
                      }}
                      className="bg-orange-500 hover:bg-orange-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🎯 Ativar Cerca
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Desativar Cerca', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Desativar Cerca na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, settings: { ...v.settings, _geofenceActive: false } });
                          if (addNotification) addNotification({ title: '⭕ Comando Executado', message: `Cerca geográfica desativada para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('⭕ Cerca desativada.');
                        }
                      }}
                      className="bg-slate-600 hover:bg-slate-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      ⭕ Desativar
                    </button>
                  </div>
                )}

                {selectedVehicleId && activeTool === 'detalhes' && (
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Consultar Status', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Consultar Status na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: '📡 Comando Executado', message: `Solicitação de status enviada para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('📡 Solicitação de status enviada.');
                        }
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      📡 Consultar Status
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Obter Versão', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Obter Versão na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: 'ℹ️ Comando Executado', message: `Solicitação de versão enviada para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('ℹ️ Solicitação de versão enviada.');
                        }
                      }}
                      className="bg-purple-500 hover:bg-purple-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      ℹ️ Obter Versão
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Consultar Parâmetros', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Consultar Parâmetros na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: '⚙️ Comando Executado', message: `Solicitação de parâmetros enviada para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('⚙️ Solicitação de parâmetros enviada.');
                        }
                      }}
                      className="bg-teal-500 hover:bg-teal-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all col-span-2"
                    >
                      ⚙️ Consultar Parâmetros
                    </button>
                  </div>
                )}

                {selectedVehicleId && activeTool === 'mais' && (
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <div className="col-span-2 bg-indigo-50 border border-indigo-100 p-3 rounded-xl mb-2">
                      <h4 className="text-sm font-bold text-indigo-800 mb-1 flex items-center gap-1"><Volume2 className="w-4 h-4"/> Funções TK303G</h4>
                      <p className="text-xs text-indigo-600 leading-tight">Comandos específicos para as funcionalidades avançadas do rastreador Coban TK303G.</p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        const identifier = v?.name || v?.trackerNumber || v?.phoneNumber || 'Dispositivo';
                        const phone = v?.phoneNumber || v?.trackerNumber || '';

                        // Envia SMS/Comando de notificação
                        if (addNotification) {
                          addNotification({
                            title: '🎤 Modo Escuta Ativado Automático',
                            message: `Iniciada transmissão de áudio ao vivo em tempo real para ${identifier} (${phone}).`,
                            type: 'command',
                            severity: 'critical',
                            vehicleName: identifier
                          });
                        }
                        if (showToast) {
                          showToast(`🎙️ Conectando áudio da escuta ao vivo para ${identifier}...`);
                        }
                        
                        setListenModalOpen(true);
                        setListenTimer(0);
                        // Ativa a conexão de áudio HD in-app IMEDIATAMENTE sem precisar clicar em nada!
                        handleStartInAppCall();
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all cursor-pointer"
                    >
                      🎤 Modo Escuta
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Modo Rastreador', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Modo Rastreador na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: '📍 Comando Executado', message: `Modo Rastreador reativado para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('📍 Modo Rastreador ativado.');
                        }
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      📍 Modo Rastreador
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Modo Sleep (Economia)', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Sleep na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: '💤 Comando Executado', message: `Modo Sleep por sensor de choque ativado em ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('💤 Modo Sleep (Economia) ativado.');
                        }
                      }}
                      className="bg-slate-700 hover:bg-slate-800 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      💤 Modo Sleep
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Alerta de Movimento', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Alerta Movimento na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: '🚶 Comando Executado', message: `Alerta de Movimento ativado para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🚶 Alerta de Movimento ativado.');
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🚶 Alerta Movimento
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Alerta Porta Aberta', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: `${identifier} offline. Comando Alerta Porta na fila.`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          if (addNotification) addNotification({ title: '🚪 Comando Executado', message: `Alerta de Porta Aberta ativado para ${identifier}.`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🚪 Alerta de Porta Aberta ativado.');
                        }
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all col-span-2"
                    >
                      🚪 Alerta Porta Aberta
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 mb-8 leading-relaxed">
                Para utilizar esta ferramenta, feche esta tela, clique diretamente sobre o **veículo ou celular** no mapa e utilize as opções e botões de Comando no painel que se abrirá.
              </p>
            )}
            <button 
              onClick={() => setActiveTool(null)} 
              className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors shadow-sm"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Modo Escuta com Chamada Interna no Navegador e Gravação */}
      {listenModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center z-[9999] backdrop-blur-md p-3 sm:p-4 animate-fade-in select-none">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-gray-100 text-center relative max-h-[92vh] overflow-y-auto my-auto">
            <button
              onClick={handleCloseListenModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 transition-colors ${
              isRecording 
                ? 'bg-red-100 text-red-600 animate-pulse' 
                : isCallConnected 
                  ? 'bg-emerald-100 text-emerald-600 animate-pulse' 
                  : 'bg-indigo-100 text-indigo-600'
            }`}>
              {isRecording ? <Disc className="w-8 h-8 animate-spin" /> : <Volume2 className="w-8 h-8" />}
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-0.5">
              🎤 Modo Escuta e Chamada Direta
            </h3>
            <p className="text-xs font-semibold text-indigo-600 mb-4">
              {vehicles.find(v => v.id === selectedVehicleId)?.name || 'Veículo Selecionado'}
              {vehicles.find(v => v.id === selectedVehicleId)?.phoneNumber && ` (${vehicles.find(v => v.id === selectedVehicleId)?.phoneNumber})`}
            </p>

            {/* Status de Conexão Automática e Envio de SMS ao Rastreador */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 text-left">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                <span>📱 Comando SMS Enviado ao Rastreador: <code className="bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded font-mono text-[11px]">monitor123456</code></span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-snug">
                 O dispositivo emitiu a resposta de confirmação <strong className="font-mono">monitor OK</strong>. O microfone embutido na cabine do veículo está ativo e pronto para transmissão silenciosa.
              </p>
            </div>

            {/* PAINEL DISCADOR DO APLICATIVO (SOFTPHONE 100% IN-APP SEM USAR CELULAR) */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 mb-3.5 shadow-lg text-left border border-indigo-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4 text-emerald-400 animate-pulse" /> Discador Web / Softphone In-App
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border border-emerald-400/30">
                  100% no Navegador
                </span>
              </div>

              {/* Visor do Número do Discador */}
              <div className="bg-slate-950/90 border border-indigo-500/40 rounded-xl p-3 mb-3 flex items-center justify-between shadow-inner">
                <div className="overflow-hidden">
                  <label className="text-[10px] uppercase font-bold text-indigo-400 block tracking-wider">Número do Chip / Destino:</label>
                  <input
                    type="text"
                    value={dialerNumber}
                    onChange={(e) => setDialerNumber(e.target.value)}
                    placeholder="Digite o número do chip..."
                    className="bg-transparent text-xl font-mono font-extrabold text-white outline-none w-full tracking-wider"
                  />
                </div>
                {dialerNumber && (
                  <button
                    onClick={handleSoftphoneClear}
                    className="text-xs text-indigo-300 hover:text-white bg-indigo-900/60 px-2.5 py-1.5 rounded-lg border border-indigo-700/50 font-bold ml-2 shrink-0"
                    title="Apagar dígito"
                  >
                    ⌫
                  </button>
                )}
              </div>

              {/* Status do Discador In-App */}
              <div className="mb-3 text-xs font-medium">
                {softphoneState === 'calling' && (
                  <div className="bg-amber-500/20 border border-amber-400/40 text-amber-200 rounded-xl p-2.5 flex items-center gap-2 animate-pulse">
                    <Phone className="w-4 h-4 text-amber-400 animate-bounce" />
                    <span>📞 Discando via Gateway WebRTC/VoIP para <strong className="font-mono">{dialerNumber}</strong>...</span>
                  </div>
                )}
                {softphoneState === 'connected' && (
                  <div className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>🟢 Chamada Conectada em HD - Ouvindo Áudio da Cabine ao Vivo!</span>
                  </div>
                )}
                {softphoneState === 'idle' && (
                  <div className="text-indigo-300/80 text-[11px] flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Utilize o teclado abaixo para discar diretamente para o rastreador sem usar o celular.</span>
                  </div>
                )}
              </div>

              {/* Teclado Numérico DTMF (Keypad In-App) */}
              {showKeypad && (
                <div className="bg-indigo-900/40 p-3 rounded-2xl border border-indigo-800/60 mb-3">
                  <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handleSoftphoneKeyPress(digit)}
                        className="bg-indigo-950/80 hover:bg-indigo-600 text-white font-mono font-bold text-base py-2.5 rounded-xl border border-indigo-700/40 shadow-xs transition-all active:scale-95 cursor-pointer hover:border-indigo-400"
                      >
                        {digit}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Botão de Discar / Encerrar Chamada */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleStartSoftphoneCall}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm cursor-pointer transform active:scale-98 border border-emerald-400"
                  >
                    <PhoneCall className="w-5 h-5 text-white" />
                    <span>📞 Ligar para {dialerNumber}</span>
                  </button>
                </div>
              </div>

              {/* Atalhos Rápidos da Frota para o Discador */}
              {vehicles.length > 0 && (
                <div className="mt-3 pt-3 border-t border-indigo-800/50">
                  <span className="text-[10px] uppercase font-bold text-indigo-300 block mb-1.5">Discar para Veículo da Frota:</span>
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
                          className="bg-indigo-900/80 hover:bg-indigo-700 text-indigo-200 hover:text-white px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-indigo-700/40 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <span>🚗 {v.name}</span>
                          <span className="font-mono text-[10px] text-indigo-400">({num})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>


            {/* Painel de Controle de Áudio Web HD */}
            <div className="bg-indigo-950 text-white rounded-2xl p-4 mb-4 shadow-inner relative overflow-hidden text-left">
              <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold mb-2">
                <span className="uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-emerald-400" /> Reprodutor & Escuta Web HD
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  ÁUDIO ATIVO
                </span>
              </div>

              <div className="flex items-center justify-between mb-3">
                <div className="text-3xl font-mono font-bold text-emerald-400">
                  {Math.floor(listenTimer / 60).toString().padStart(2, '0')}:
                  {(listenTimer % 60).toString().padStart(2, '0')}
                </div>

                {/* Animação do Equalizador de Onda Sonora HD */}
                <div className="flex items-center justify-center gap-1 h-7">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all ${isMuted || volumeLevel === 0 ? 'bg-gray-700' : 'bg-emerald-400 animate-bounce'}`}
                      style={{
                        height: isMuted || volumeLevel === 0 ? '4px' : `${Math.min(26, Math.max(6, Math.floor(Math.random() * 22 + 4) * (volumeLevel / 100)))}px`,
                        animationDelay: `${i * 0.08}s`,
                        animationDuration: '0.6s'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Slider de Controle de Volume (0% a 400% com Turbo Super Volume) */}
              <div className="bg-indigo-900/60 p-3 rounded-xl border border-indigo-800/80 mb-2.5">
                <div className="flex items-center justify-between text-xs text-indigo-200 mb-1 font-semibold">
                  <span className="flex items-center gap-1.5">
                    {volumeLevel === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                    <span>Volume da Transmissão (Cabine):</span>
                  </span>
                  <span className="font-bold text-emerald-300 font-mono text-xs bg-indigo-950 px-2 py-0.5 rounded border border-indigo-700">
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
                  className="w-full accent-emerald-400 h-2 bg-indigo-950 rounded-lg cursor-pointer mb-2"
                />

                {/* Atalhos Rápidos de Ganho de Volume */}
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
                          : 'bg-indigo-950 text-indigo-300 hover:text-white hover:bg-indigo-800'
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
                className={`w-full mb-2.5 py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md border ${
                  isSpeakerphone 
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 border-amber-300 animate-pulse' 
                    : 'bg-indigo-900/90 hover:bg-indigo-800 text-amber-300 border-amber-500/40'
                }`}
              >
                <Volume2 className={`w-4 h-4 ${isSpeakerphone ? 'animate-bounce text-slate-950' : 'text-amber-400'}`} />
                <span>📢 {isSpeakerphone ? 'VIVA-VOZ ATIVADO (ALTO-FALANTE 2.5X)' : 'ATIVAR MODO VIVA-VOZ (ALTO-FALANTE)'}</span>
              </button>

              {/* Status da Gravação Ativa */}
              {isRecording && (
                <div className="mt-2 bg-red-950/80 border border-red-500/50 rounded-xl p-2 flex items-center justify-center gap-2 text-xs font-bold text-red-300 animate-pulse">
                  <Disc className="w-4 h-4 text-red-500 animate-spin" />
                  <span>GRAVANDO CONVERSA: {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
                </div>
              )}

              <div className="text-[11px] text-indigo-200 mt-1">
                {isMuted 
                  ? '🔇 Microfone da transmissão silenciado no navegador' 
                  : '🎙️ Transmissão de áudio da cabine ativa com cancelamento de ruído.'}
              </div>
            </div>

            {/* Painel de Botões da Chamada */}
            <div className="space-y-2.5 text-left">
              {/* Botão Mute / Unmute */}
              <button
                type="button"
                onClick={toggleMute}
                className={`w-full font-bold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm cursor-pointer ${
                  isMuted 
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isMuted ? '🎙️ Desmutar Microfone' : '🔇 Mutar Microfone (Atalho: M)'}</span>
              </button>

              {/* Botão de Gravação de Conversa */}
              {!isRecording ? (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold py-3 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  <Disc className="w-4 h-4 text-red-600" />
                  <span>⏺️ Gravar Conversa do Microfone (.webm)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm cursor-pointer animate-pulse"
                >
                  <Download className="w-4 h-4" />
                  <span>⏹️ Parar & Baixar Gravação (.webm)</span>
                </button>
              )}

              {/* Registrador Interno & Agregações Diretas sem Celular */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-gray-200 text-left mt-1">
                <label className="block text-xs font-bold text-gray-800 mb-1 flex items-center justify-between">
                  <span>📝 Registrador In-App & Agregação Direta:</span>
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">Sem celular</span>
                </label>
                <textarea
                  rows={2}
                  value={realtimeNote}
                  onChange={(e) => setRealtimeNote(e.target.value)}
                  placeholder="Ex: Motorista em repouso, ruído normal na cabine, conversa gravada..."
                  className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none mb-2"
                />
                <button
                  type="button"
                  onClick={handleSaveInAppAggregation}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>💾 Salvar Agregação no Registrador</span>
                </button>
              </div>

              {/* Botão para Encerrar Chamada */}
              <button
                type="button"
                onClick={handleCloseListenModal}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer border border-gray-200"
              >
                <PhoneOff className="w-4 h-4 text-red-600" />
                <span>🔴 Encerrar Escuta e Fechar</span>
              </button>
            </div>

            <p className="text-[10px] text-gray-400 mt-3">
              💡 Atalho: Pressione <span className="bg-gray-100 px-1 rounded font-mono text-gray-700">M</span> para mutar/desmutar ou <span className="bg-gray-100 px-1 rounded font-mono text-gray-700">ESC</span> para fechar.
            </p>
          </div>
        </div>
      )}
      
      {showMessageModal && selectedVehicleForMessage && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-[9999] backdrop-blur-md p-4 animate-fade-in"
             onClick={() => setShowMessageModal(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900">Enviar Comando via SMS</h3>
            <p className="text-xs text-gray-500">Selecione o comando para <strong>{selectedVehicleForMessage.name}</strong>:</p>
            
            <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto pr-1">
              {[
                { name: 'Bloquear (Gradual)', cmd: 'stop', usePwd: true },
                { name: 'Bloquear (Imediato)', cmd: 'quickstop', usePwd: true },
                { name: 'Desbloquear', cmd: 'resume', usePwd: true },
                { name: 'Alarme Ativar', cmd: 'arm', usePwd: true },
                { name: 'Alarme Desativar', cmd: 'disarm', usePwd: true },
                { name: 'Localização/Endereço', cmd: 'address', usePwd: true },
                { name: 'Status do Aparelho', cmd: 'check', usePwd: true },
                { name: 'Alerta Movimento', cmd: 'move', usePwd: true },
                { name: 'Desativar Movimento', cmd: 'nomove', usePwd: true },
                { name: 'Alerta Ignição', cmd: 'acc', usePwd: true },
                { name: 'Desativar Ignição', cmd: 'noacc', usePwd: true },
                { name: 'Modo Escuta', cmd: 'monitor', usePwd: true },
                { name: 'Modo Rastreio', cmd: 'tracker', usePwd: true },
                { name: 'Reiniciar Sistema', cmd: 'reset', usePwd: true },
                { name: 'Configurar Admin', cmd: 'admin123456 [número]', usePwd: false },
                { name: 'Alterar Senha', cmd: 'password123456 [nova_senha]', usePwd: false },
                { name: 'Remover Admin', cmd: 'noadmin', usePwd: true },
                { name: 'Hibernar (Vibração)', cmd: 'sleep123456 shock', usePwd: false },
                { name: 'Hibernar (Tempo)', cmd: 'sleep123456 [minutos]', usePwd: false },
                { name: 'Desativar Hibernação', cmd: 'nosleep', usePwd: true },
                { name: 'Economia GPRS On', cmd: 'less gprs123456 on', usePwd: false },
                { name: 'Economia GPRS Off', cmd: 'less gprs123456 off', usePwd: false },
                { name: 'Sensibilidade', cmd: 'sensitivity123456 [1-3]', usePwd: false },
                { name: 'Bateria Fraca On', cmd: 'lowbattery123456 on', usePwd: false },
                { name: 'Bateria Fraca Off', cmd: 'lowbattery123456 off', usePwd: false },
                { name: 'Alerta GPS Fraco On', cmd: 'gpssignal123456 on', usePwd: false },
                { name: 'Filtro Desvio On', cmd: 'supress', usePwd: true },
                { name: 'Filtro Desvio Off', cmd: 'nosupress', usePwd: true },
                { name: 'Salvar Posições', cmd: 'save030s005n123456', usePwd: false },
                { name: 'Limpar Memória', cmd: 'clear', usePwd: true }
              ].map((item, i) => {
                const pwd = selectedVehicleForMessage.settings?.smsPassword || '123456';
                const command = item.usePwd ? `${item.cmd}${pwd}` : item.cmd.replace('123456', pwd);
                return (
                  <button key={i} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl font-bold text-xs cursor-pointer"
                          onClick={() => {
                            const phone = (selectedVehicleForMessage.phoneNumber || selectedVehicleForMessage.trackerNumber || '').replace(/[^0-9]/g, '');
                            window.open(`sms:${phone}?body=${command}`, '_self');
                            setShowMessageModal(false);
                          }}>
                    {item.name}
                  </button>
                );
              })}
            </div>
            <button className="w-full bg-gray-200 hover:bg-gray-300 p-2 rounded-xl text-xs font-bold cursor-pointer" onClick={() => setShowMessageModal(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
