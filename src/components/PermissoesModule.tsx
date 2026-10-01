import React, { useState, useEffect } from 'react';
import { 
  Camera, Users, Radio, Image as ImageIcon, MapPin, Mic, 
  Volume2, Bell, Shield, ChevronRight, CheckCircle2, 
  AlertTriangle, ArrowLeft, RefreshCw, Smartphone, Eye
} from 'lucide-react';
import { Vehicle } from '../types';

interface PermissoesModuleProps {
  vehicles: Vehicle[];
  onBackToMap: () => void;
  showToast: (msg: string) => void;
}

export default function PermissoesModule({ vehicles, onBackToMap, showToast }: PermissoesModuleProps) {
  // State for permissions (simulated + actual)
  const [permissions, setPermissions] = useState({
    location: 'prompt', // 'granted' | 'denied' | 'prompt'
    camera: 'prompt',
    contacts: 'prompt',
    nearby: 'prompt',
    photos: 'prompt',
    microphone: 'prompt',
    audio: 'prompt',
    notifications: 'prompt'
  });

  const [unusedAppManagement, setUnusedAppManagement] = useState(() => {
    try {
      return localStorage.getItem('gkd_unused_app_management') !== 'false';
    } catch (e) {
      return true;
    }
  });

  const [activeDetailPermission, setActiveDetailPermission] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  // Sync state initially on load
  useEffect(() => {
    // 1. Geolocation permission check
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        setPermissions(prev => ({ ...prev, location: status.state }));
        status.onchange = () => {
          setPermissions(prev => ({ ...prev, location: status.state }));
        };
      }).catch(() => {});

      // 2. Camera permission check
      navigator.permissions.query({ name: 'camera' as any }).then((status) => {
        setPermissions(prev => ({ ...prev, camera: status.state }));
        status.onchange = () => {
          setPermissions(prev => ({ ...prev, camera: status.state }));
        };
      }).catch(() => {});

      // 3. Microphone permission check
      navigator.permissions.query({ name: 'microphone' as any }).then((status) => {
        setPermissions(prev => ({ ...prev, microphone: status.state }));
        status.onchange = () => {
          setPermissions(prev => ({ ...prev, microphone: status.state }));
        };
      }).catch(() => {});

      // 4. Notifications permission check
      navigator.permissions.query({ name: 'notifications' as any }).then((status) => {
        setPermissions(prev => ({ ...prev, notifications: status.state }));
        status.onchange = () => {
          setPermissions(prev => ({ ...prev, notifications: status.state }));
        };
      }).catch(() => {});
    }

    // Unlocked audio check
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const testCtx = new AudioCtx();
        setPermissions(prev => ({ 
          ...prev, 
          audio: testCtx.state === 'running' ? 'granted' : 'prompt' 
        }));
        testCtx.close();
      }
    } catch (e) {}

    // Simulated/Cached permissions loading from localStorage
    try {
      const cachedPermissions = localStorage.getItem('app_permissions_simulated');
      if (cachedPermissions) {
        const parsed = JSON.parse(cachedPermissions);
        setPermissions(prev => ({ ...prev, ...parsed }));
      }
    } catch (e) {}
  }, []);

  const saveSimulatedPermissions = (updated: typeof permissions) => {
    setPermissions(updated);
    try {
      localStorage.setItem('app_permissions_simulated', JSON.stringify(updated));
    } catch (e) {}
  };

  const handleToggleUnusedAppManagement = () => {
    const nextVal = !unusedAppManagement;
    setUnusedAppManagement(nextVal);
    try {
      localStorage.setItem('gkd_unused_app_management', String(nextVal));
    } catch (e) {}
    showToast(nextVal 
      ? '🔧 Otimização ativada: O app liberará recursos se ficar sem uso.' 
      : '⚠️ Otimização desativada: Permissões não serão revogadas automaticamente.'
    );
  };

  // Trigger actual native web requests
  const requestPermissionNative = async (id: string) => {
    setIsRequesting(true);
    showToast(`Solicitando permissão nativa de ${getPermissionTitle(id)}...`);

    try {
      if (id === 'location') {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            () => {
              const updated = { ...permissions, location: 'granted' };
              saveSimulatedPermissions(updated);
              showToast('✅ Permissão de localização concedida com sucesso!');
              setIsRequesting(false);
            },
            (error) => {
              console.error(error);
              const updated = { ...permissions, location: 'denied' };
              saveSimulatedPermissions(updated);
              showToast('❌ Permissão de localização negada pelo navegador.');
              setIsRequesting(false);
            },
            { enableHighAccuracy: true, timeout: 6000 }
          );
        } else {
          showToast('⚠️ Geolocalização não é suportada neste navegador.');
          setIsRequesting(false);
        }
      } 
      else if (id === 'camera') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          // Stop track immediately after testing success
          stream.getTracks().forEach(track => track.stop());
          const updated = { ...permissions, camera: 'granted' };
          saveSimulatedPermissions(updated);
          showToast('✅ Acesso à câmera concedido e verificado com sucesso!');
        } catch (err) {
          console.error(err);
          const updated = { ...permissions, camera: 'denied' };
          saveSimulatedPermissions(updated);
          showToast('❌ Acesso à câmera negado ou indisponível.');
        }
        setIsRequesting(false);
      } 
      else if (id === 'microphone') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
          const updated = { ...permissions, microphone: 'granted' };
          saveSimulatedPermissions(updated);
          showToast('✅ Acesso ao microfone concedido e verificado!');
        } catch (err) {
          console.error(err);
          const updated = { ...permissions, microphone: 'denied' };
          saveSimulatedPermissions(updated);
          showToast('❌ Acesso ao microfone negado ou indisponível.');
        }
        setIsRequesting(false);
      } 
      else if (id === 'notifications') {
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          const state = permission === 'default' ? 'prompt' : permission;
          const updated = { ...permissions, notifications: state };
          saveSimulatedPermissions(updated);
          if (permission === 'granted') {
            showToast('✅ Permissão de notificações concedida com sucesso!');
            try {
              new Notification('GKD Mobility', {
                body: 'As notificações e alertas de telemetria foram ativados com sucesso!',
                icon: '/1786699612187.png'
              });
            } catch (e) {}
          } else {
            showToast('❌ Notificações nativas negadas ou bloqueadas.');
          }
        } else {
          showToast('⚠️ Notificações não são suportadas neste navegador.');
        }
        setIsRequesting(false);
      } 
      else if (id === 'audio') {
        // Unlock audio context
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
              await ctx.resume();
            }
            ctx.close();
          }
          const updated = { ...permissions, audio: 'granted' };
          saveSimulatedPermissions(updated);
          showToast('✅ Permissão de reprodução de áudio/sirenes liberada!');
        } catch (err) {
          const updated = { ...permissions, audio: 'denied' };
          saveSimulatedPermissions(updated);
          showToast('❌ Erro ao liberar áudio.');
        }
        setIsRequesting(false);
      } 
      else {
        // Simulated toggling for contacts, nearby, photos (since browsers do not have unified APIs)
        setTimeout(() => {
          const current = (permissions as any)[id] || 'prompt';
          const next = current === 'granted' ? 'denied' : 'granted';
          const updated = { ...permissions, [id]: next };
          saveSimulatedPermissions(updated);
          showToast(`✅ Permissão de ${getPermissionTitle(id)} definida como: ${next === 'granted' ? 'Concedida' : 'Negada'}`);
          setIsRequesting(false);
        }, 800);
      }
    } catch (e) {
      console.error(e);
      setIsRequesting(false);
    }
  };

  const forceGrantAllPermissions = () => {
    const grantedAll = {
      location: 'granted',
      camera: 'granted',
      contacts: 'granted',
      nearby: 'granted',
      photos: 'granted',
      microphone: 'granted',
      audio: 'granted',
      notifications: 'granted'
    };
    saveSimulatedPermissions(grantedAll);
    showToast('⚡ Todas as 8 permissões foram simuladas e concedidas com sucesso!');
  };

  const getPermissionTitle = (id: string) => {
    switch (id) {
      case 'camera': return 'Câmera';
      case 'contacts': return 'Contatos e contas';
      case 'nearby': return 'Dispositivos por perto';
      case 'photos': return 'Fotos e vídeos';
      case 'location': return 'Localização';
      case 'microphone': return 'Microfone';
      case 'audio': return 'Música e áudio';
      case 'notifications': return 'Notificações';
      default: return id;
    }
  };

  const getPermissionDescription = (id: string) => {
    switch (id) {
      case 'camera': return 'Utilizado para tirar fotos dos veículos cadastrados diretamente do celular e ler QR Codes de rastreadores para emparelhamento instantâneo.';
      case 'contacts': return 'Permite sincronizar os contatos de sua agenda no aplicativo para enviar mensagens de socorro (SOS) ou links de compartilhamento via WhatsApp e SMS com 1 clique.';
      case 'nearby': return 'Permite buscar e conectar-se a chips OBD2 bluetooth locais, sensores BLE e emissores de telemetria por proximidade física.';
      case 'photos': return 'Permite selecionar fotos de sua galeria de imagens para personalizar os avatares dos carros e anexar documentos de vistorias.';
      case 'location': return 'Real-time GPS de altíssima precisão. Utilizado para marcar sua localização física no mapa em relação à frota, calcular distâncias até os veículos e desenhar rotas.';
      case 'microphone': return 'Habilita a ferramenta de "Escuta de Cabine" e comandos por voz para controlar e ouvir o áudio transmitido pelos microfones embutidos nos rastreadores compatíveis.';
      case 'audio': return 'Permite que o aplicativo emita alertas sonoros de alto volume, sirenes de perigo e sinais de pânico sonoros mesmo em segundo plano.';
      case 'notifications': return 'Envia notificações em tempo real na barra de tarefas do seu celular/computador sobre excesso de velocidade, corte de bateria, invasão de cerca virtual e pânico SOS.';
      default: return '';
    }
  };

  const getPermissionIcon = (id: string, className = "w-5 h-5") => {
    switch (id) {
      case 'camera': return <Camera className={className} />;
      case 'contacts': return <Users className={className} />;
      case 'nearby': return <Radio className={className} />;
      case 'photos': return <ImageIcon className={className} />;
      case 'location': return <MapPin className={className} />;
      case 'microphone': return <Mic className={className} />;
      case 'audio': return <Volume2 className={className} />;
      case 'notifications': return <Bell className={className} />;
      default: return <Shield className={className} />;
    }
  };

  // Notification Test Triggers
  const triggerTestNotification = (type: 'speed' | 'ignition' | 'geofence' | 'battery' | 'panic') => {
    if (typeof window === 'undefined') return;

    // Subtle beep or siren based on type
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        if (type === 'panic' || type === 'battery') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.4);
        } else {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
        }
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.41);
      }
    } catch (e) {}

    let title = '';
    let message = '';

    switch (type) {
      case 'speed':
        title = '⚡ Excesso de Velocidade';
        message = 'O veículo Onix Plus atingiu 82 km/h (Limite regulamentado na via: 60 km/h).';
        break;
      case 'ignition':
        title = '🔑 Ignição Ligada';
        message = 'O motor do veículo Peugeot 208 foi ligado agora pouco na Rua Siqueira.';
        break;
      case 'geofence':
        title = '🎯 Entrada de Cerca Virtual';
        message = 'O veículo Peugeot 208 ENTROU na cerca virtual "Zona Norte - Garagem".';
        break;
      case 'battery':
        title = '🔌 Corte de Energia de Bateria';
        message = 'Alerta crítico: Cabo de alimentação principal (12V) desconectado no Onix Plus!';
        break;
      case 'panic':
        title = '🚨 Alerta de Pânico SOS';
        message = 'Botão de pânico acionado por motorista! Localização compartilhada via SMS e WhatsApp.';
        break;
    }

    // Real Native Notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: '/1786699612187.png'
        });
      } catch (e) {}
    }

    showToast(`${title}: ${message}`);
  };

  const activePermissions = Object.entries(permissions).filter(([_, state]) => state === 'granted');
  const inactivePermissions = Object.entries(permissions).filter(([_, state]) => state !== 'granted');

  return (
    <div className="flex-grow p-4 sm:p-6 overflow-y-auto bg-slate-900 text-white min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Contract: 1 row, back button, title, quick actions */}
        <div className="flex items-center justify-between bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBackToMap}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all cursor-pointer flex items-center justify-center"
              title="Voltar ao mapa"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                <Smartphone className="w-6 h-6 text-blue-500" />
                Permissões do App e Alertas
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Central Android e iOS de acessibilidade do rastreador de alta precisão
              </p>
            </div>
          </div>
          
          <button
            onClick={forceGrantAllPermissions}
            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow active:scale-95 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>Liberar Todas</span>
          </button>
        </div>

        {/* Android-style permissions panel */}
        <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
          
          {/* Internal Title Area from screenshot */}
          <div className="p-5 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-xs font-extrabold text-slate-300 uppercase tracking-widest font-mono">Permissões Ativas</span>
            </div>
            <span className="text-xs text-slate-400 font-bold font-mono">
              {activePermissions.length} de {Object.keys(permissions).length} Habilitadas
            </span>
          </div>

          <div className="divide-y divide-slate-800">
            {/* List of 8 Permissions (Directly matches the provided Screenshot) */}
            {Object.keys(permissions).map((permId) => {
              const isGranted = permissions[permId as keyof typeof permissions] === 'granted';
              return (
                <div 
                  key={permId}
                  onClick={() => setActiveDetailPermission(permId)}
                  className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-900/40 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl border transition-colors ${
                      isGranted 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      {getPermissionIcon(permId, "w-5 h-5")}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                        {getPermissionTitle(permId)}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px] sm:max-w-[450px]">
                        {getPermissionDescription(permId)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 ml-2">
                    <span className={`text-[10px] sm:text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                      isGranted 
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}>
                      {isGranted ? 'Concedida ✅' : 'Não concedida ❌'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section: No Denied Permissions Banner (From Screenshot: "Sem permissão / Nenhuma permissão negada") */}
          <div className="p-5 bg-slate-900/50 border-t border-slate-800">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono mb-2">Sem permissão</h3>
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                {inactivePermissions.length === 0 
                  ? '🎉 Nenhuma permissão negada ou pendente!' 
                  : `⚠️ Há ${inactivePermissions.length} permissões desabilitadas que podem limitar recursos.`}
              </span>
              {inactivePermissions.length > 0 && (
                <button
                  onClick={forceGrantAllPermissions}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                  <span>Liberar Tudo</span>
                </button>
              )}
            </div>
          </div>

          {/* Section: Android Unused Apps Configuration (From Screenshot: "Configurações de apps não usados") */}
          <div className="p-5 bg-slate-900/30 border-t border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Configurações de apps não usados</h3>
            
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  Gerenciar app que não está sendo usado
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-400 leading-tight">
                  Remover permissões, excluir arquivos temporários, parar notificações e arquivar o app para poupar bateria e armazenamento.
                </p>
              </div>

              {/* Slider Toggle Button matching Android */}
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5 select-none">
                <input 
                  type="checkbox" 
                  checked={unusedAppManagement} 
                  onChange={handleToggleUnusedAppManagement}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-800 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

        </div>

        {/* Real-time Notification Test Center Panel */}
        <div className="bg-slate-950 rounded-3xl border border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500 animate-bounce" />
              Painel de Teste de Alertas e Notificações (GKD-Core)
            </h3>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold font-mono">Simulador de Eventos</span>
          </div>

          <p className="text-xs text-slate-400">
            Com as permissões de <strong>Áudio</strong> e <strong>Notificações</strong> concedidas, clique nos botões abaixo para disparar e testar imediatamente a emissão de alertas em tempo real.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              onClick={() => triggerTestNotification('speed')}
              className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center gap-3 transition-all text-left group cursor-pointer active:scale-98"
            >
              <div className="p-2.5 bg-yellow-500/10 text-yellow-400 rounded-xl">⚡</div>
              <div>
                <strong className="text-xs text-white block font-black group-hover:text-yellow-400 transition-colors">Excesso de Velocidade</strong>
                <span className="text-[10px] text-slate-500 font-medium">Testar radar na via</span>
              </div>
            </button>

            <button
              onClick={() => triggerTestNotification('ignition')}
              className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center gap-3 transition-all text-left group cursor-pointer active:scale-98"
            >
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">🔑</div>
              <div>
                <strong className="text-xs text-white block font-black group-hover:text-blue-400 transition-colors">Ignição Ativada</strong>
                <span className="text-[10px] text-slate-500 font-medium">Testar partida de veículo</span>
              </div>
            </button>

            <button
              onClick={() => triggerTestNotification('geofence')}
              className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center gap-3 transition-all text-left group cursor-pointer active:scale-98"
            >
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">🎯</div>
              <div>
                <strong className="text-xs text-white block font-black group-hover:text-emerald-400 transition-colors">Cerca Virtual</strong>
                <span className="text-[10px] text-slate-500 font-medium">Testar invasão de perímetro</span>
              </div>
            </button>

            <button
              onClick={() => triggerTestNotification('battery')}
              className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center gap-3 transition-all text-left group cursor-pointer active:scale-98"
            >
              <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl">🔌</div>
              <div>
                <strong className="text-xs text-white block font-black group-hover:text-red-400 transition-colors">Corte de Energia</strong>
                <span className="text-[10px] text-slate-500 font-medium">Testar perda de 12V</span>
              </div>
            </button>

            <button
              onClick={() => triggerTestNotification('panic')}
              className="p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl flex items-center gap-3 transition-all text-left group cursor-pointer active:scale-98 sm:col-span-2 lg:col-span-1"
            >
              <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl animate-pulse">🚨</div>
              <div>
                <strong className="text-xs text-white block font-black group-hover:text-purple-400 transition-colors">Pânico SOS Urgente</strong>
                <span className="text-[10px] text-slate-500 font-medium">Testar botão físico SMS</span>
              </div>
            </button>
          </div>
        </div>

      </div>

      {/* Detail Modal / Drawer for single permission configuration */}
      {activeDetailPermission && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-5 flex flex-col overflow-hidden max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl">
                  {getPermissionIcon(activeDetailPermission, "w-6 h-6")}
                </div>
                <div>
                  <h3 className="font-black text-base text-white">
                    {getPermissionTitle(activeDetailPermission)}
                  </h3>
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full uppercase">
                    Configuração de Acesso
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setActiveDetailPermission(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {getPermissionDescription(activeDetailPermission)}
              </p>

              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase block font-mono">Status Atual</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    permissions[activeDetailPermission as keyof typeof permissions] === 'granted' 
                      ? 'bg-emerald-500 animate-pulse' 
                      : 'bg-amber-500'
                  }`} />
                  <span className="text-xs font-bold text-white font-mono">
                    {permissions[activeDetailPermission as keyof typeof permissions] === 'granted' 
                      ? 'PERMISSÃO CONCEDIDA ✅' 
                      : 'NÃO CONCEDIDA / DESATIVADA ❌'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-slate-800 shrink-0">
              <button
                disabled={isRequesting}
                onClick={() => requestPermissionNative(activeDetailPermission)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow cursor-pointer active:scale-98"
              >
                {isRequesting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span>Solicitar / Habilitar no Dispositivo</span>
                )}
              </button>

              <button
                onClick={() => {
                  const state = permissions[activeDetailPermission as keyof typeof permissions] === 'granted' ? 'denied' : 'granted';
                  const updated = { ...permissions, [activeDetailPermission]: state };
                  saveSimulatedPermissions(updated);
                  showToast(`Alterado permissão de ${getPermissionTitle(activeDetailPermission)} para: ${state === 'granted' ? 'Permitida' : 'Negada'}`);
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Alternar Estado (Simulado)</span>
              </button>

              <button
                onClick={() => setActiveDetailPermission(null)}
                className="w-full py-2.5 bg-slate-950 text-slate-400 hover:text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
