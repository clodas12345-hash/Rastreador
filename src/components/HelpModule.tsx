import React, { useState, useRef } from 'react';
import { 
  Info, 
  MapPin, 
  Sliders, 
  Lock, 
  Target, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Copy, 
  HelpCircle, 
  BookOpen, 
  ShieldCheck, 
  Route, 
  FileText, 
  Volume2, 
  Cpu, 
  RotateCcw, 
  Trash2, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  ShieldAlert, 
  X, 
  Download, 
  Upload, 
  Database, 
  HardDrive, 
  Search, 
  Sparkles, 
  Smartphone, 
  Car, 
  Activity, 
  Filter, 
  Bell, 
  Play, 
  Radio, 
  Shield,
  ArrowLeft 
} from 'lucide-react';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';
import { db, cleanFirestoreData } from '../lib/firebase';
import PdfReader from './PdfReader';

interface HelpModuleProps {
  vehicles?: any[];
  setVehicles?: React.Dispatch<React.SetStateAction<any[]>>;
  handleDeleteVehicle?: (id: string) => Promise<void>;
  clearNotifications?: () => void;
  showToast?: (msg: string) => void;
  onBackToMap?: () => void;
}

export default function HelpModule({
  vehicles = [],
  setVehicles,
  handleDeleteVehicle,
  clearNotifications,
  showToast,
  onBackToMap
}: HelpModuleProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'rastreamento' | 'comandos' | 'dashboard' | 'audio' | 'backup' | 'manual'>('all');
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  // Collapsible Section States
  const [showStatusColors, setShowStatusColors] = useState<boolean>(false);
  const [showSpeedAlerts, setShowSpeedAlerts] = useState<boolean>(false);
  const [showPdfReader, setShowPdfReader] = useState<boolean>(false);
  const [showResetPanel, setShowResetPanel] = useState<boolean>(false);
  const [showBackupPanel, setShowBackupPanel] = useState<boolean>(false);

  // Backup & Restore States
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFileData, setRestoreFileData] = useState<{
    filename: string;
    raw: any;
    summary: {
      vehiclesCount: number;
      peopleCount: number;
      notificationsCount: number;
      audioCount: number;
      routesCount: number;
      exportDate?: string;
    };
  } | null>(null);

  // Modals & Reset States
  const [showFactoryModal, setShowFactoryModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Permission & Notification States
  const [permissionStatus, setPermissionStatus] = useState<{
    notifications: string;
    geolocation: string;
    microphone: string;
  }>({
    notifications: typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
    geolocation: 'prompt',
    microphone: 'prompt'
  });

  const checkBrowserPermissions = async () => {
    const notif = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
    let geo = 'prompt';
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const res = await navigator.permissions.query({ name: 'geolocation' as any });
        geo = res.state;
      } catch (e) {
        geo = 'supported';
      }
    }
    let mic = 'prompt';
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const res = await navigator.permissions.query({ name: 'microphone' as any });
        mic = res.state;
      } catch (e) {
        mic = 'supported';
      }
    }
    setPermissionStatus({
      notifications: notif,
      geolocation: geo,
      microphone: mic
    });
  };

  React.useEffect(() => {
    checkBrowserPermissions();
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        setPermissionStatus(prev => ({ ...prev, notifications: res }));
        if (res === 'granted') {
          if (showToast) showToast('🔔 Permissão de notificações concedida com sucesso!');
          new Notification('GKD Rastreador', { body: 'Sistema de notificações e alertas operando perfeitamente!' });
        } else {
          if (showToast) showToast('⚠️ Permissão de notificações negada ou bloqueada.');
        }
      } catch (e) {
        if (showToast) showToast('❌ Erro ao solicitar permissão de notificações.');
      }
    } else {
      if (showToast) showToast('❌ Navegador não suporta notificações nativas.');
    }
  };

  const testGeolocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermissionStatus(prev => ({ ...prev, geolocation: 'granted' }));
          if (showToast) showToast(`📍 GPS Autorizado! Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}`);
        },
        (err) => {
          setPermissionStatus(prev => ({ ...prev, geolocation: 'denied' }));
          if (showToast) showToast('⚠️ Geolocalização negada ou indisponível.');
        },
        { timeout: 5000 }
      );
    } else {
      if (showToast) showToast('❌ Geolocalização não suportada.');
    }
  };

  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
      if (showToast) showToast('🎙️ Microfone autorizado e operacional para escuta de cabine!');
    } catch (e) {
      setPermissionStatus(prev => ({ ...prev, microphone: 'denied' }));
      if (showToast) showToast('⚠️ Permissão de microfone negada ou indisponível.');
    }
  };

  // Selection Checkboxes for Factory Reset
  const [selectedItems, setSelectedItems] = useState({
    carros: true,
    notificacoes: true,
    gravacoes: true,
    rotas: true,
    cache: true
  });

  const allSelected = Object.values(selectedItems).every(Boolean);

  const toggleSelectAll = () => {
    const nextState = !allSelected;
    setSelectedItems({
      carros: nextState,
      notificacoes: nextState,
      gravacoes: nextState,
      rotas: nextState,
      cache: nextState
    });
  };

  const toggleItem = (key: keyof typeof selectedItems) => {
    setSelectedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const executeFactoryReset = async () => {
    setIsProcessing(true);
    try {
      let deletedCount = 0;

      // Deletar veículos no Firestore/Estado
      if (vehicles && vehicles.length > 0 && handleDeleteVehicle) {
        const toDelete = vehicles.filter(v => selectedItems.carros);

        for (const v of toDelete) {
          await handleDeleteVehicle(v.id);
          deletedCount++;
        }
      }

      // Notificações
      if (selectedItems.notificacoes) {
        if (clearNotifications) clearNotifications();
        localStorage.removeItem('app_notifications');
      }

      // Gravações de Áudio / Cabine
      if (selectedItems.gravacoes) {
        localStorage.removeItem('gkd_registrador_records');
      }

      // Cache Local
      if (selectedItems.cache) {
        localStorage.removeItem('app_vehicles_cache');
      }

      if (showToast) {
        showToast(`⚙️ Reinicialização de fábrica concluída! (${deletedCount} itens e dados removidos)`);
      }

      setShowFactoryModal(false);
      setConfirmStep(false);
    } catch (err) {
      console.error('Erro ao reiniciar de fábrica:', err);
      if (showToast) showToast('❌ Ocorreu um erro ao reiniciar os dados.');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeDeleteAll = async () => {
    setIsProcessing(true);
    try {
      // Excluir TODOS os veículos
      if (vehicles && vehicles.length > 0 && handleDeleteVehicle) {
        for (const v of vehicles) {
          await handleDeleteVehicle(v.id);
        }
      }
      if (setVehicles) {
        setVehicles([]);
      }

      // Limpar todas as notificações
      if (clearNotifications) clearNotifications();

      // Limpar todos os registros locais
      localStorage.removeItem('app_notifications');
      localStorage.removeItem('gkd_registrador_records');
      localStorage.removeItem('app_vehicles_cache');
      localStorage.clear();

      if (showToast) {
        showToast('🚨 EXCLUSÃO TOTAL CONCLUÍDA! O sistema foi completamente zerado de fábrica.');
      }

      setShowDeleteAllModal(false);
    } catch (err) {
      console.error('Erro ao excluir tudo:', err);
      if (showToast) showToast('❌ Ocorreu um erro ao excluir todos os dados.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Gerar e baixar arquivo de backup (.json) para salvar no celular/PC
  const handleDownloadBackup = () => {
    try {
      const backupData = {
        appName: 'GKD_RASTREADOR_VEICULOS',
        exportDate: new Date().toISOString(),
        version: '1.0',
        vehicles: vehicles || [],
        localStorageData: {
          app_notifications: localStorage.getItem('app_notifications'),
          gkd_registrador_records: localStorage.getItem('gkd_registrador_records'),
          app_vehicles_cache: localStorage.getItem('app_vehicles_cache'),
          gkd_saved_routes: localStorage.getItem('gkd_saved_routes'),
        }
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `backup_rastreador_gkd_${dateStr}_${timeStr}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (showToast) {
        showToast(`📁 Backup baixado com sucesso! Arquivo salvo em seu dispositivo: ${filename}`);
      }
    } catch (err) {
      console.error('Erro ao gerar backup:', err);
      if (showToast) showToast('❌ Erro ao exportar arquivo de backup.');
    }
  };

  // Processar arquivo de backup enviado pelo usuário
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Arquivo JSON inválido.');
        }

        const vList = Array.isArray(parsed.vehicles)
          ? parsed.vehicles
          : (Array.isArray(parsed) ? parsed : []);

        const vehiclesCount = vList.length;

        let notificationsCount = 0;
        if (parsed.localStorageData?.app_notifications) {
          try {
            const notifs = JSON.parse(parsed.localStorageData.app_notifications);
            if (Array.isArray(notifs)) notificationsCount = notifs.length;
          } catch (e) {}
        }

        let audioCount = 0;
        if (parsed.localStorageData?.gkd_registrador_records) {
          try {
            const audios = JSON.parse(parsed.localStorageData.gkd_registrador_records);
            if (Array.isArray(audios)) audioCount = audios.length;
          } catch (e) {}
        }

        let routesCount = 0;
        if (parsed.localStorageData?.gkd_saved_routes) {
          try {
            const rts = JSON.parse(parsed.localStorageData.gkd_saved_routes);
            if (Array.isArray(rts)) routesCount = rts.length;
          } catch (e) {}
        }

        setRestoreFileData({
          filename: file.name,
          raw: parsed,
          summary: {
            vehiclesCount,
            notificationsCount,
            audioCount,
            routesCount,
            exportDate: parsed.exportDate ? new Date(parsed.exportDate).toLocaleString('pt-BR') : undefined
          }
        });
        setShowRestoreModal(true);
      } catch (err) {
        console.error('Erro ao ler arquivo de backup:', err);
        if (showToast) showToast('❌ O arquivo selecionado não é um backup válido do sistema.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Restaurar todos os dados do backup
  const executeRestore = async () => {
    if (!restoreFileData) return;
    setIsProcessing(true);

    try {
      const data = restoreFileData.raw;
      const vList = Array.isArray(data.vehicles) ? data.vehicles : (Array.isArray(data) ? data : []);

      // 1. Restaurar dados no LocalStorage
      if (data.localStorageData) {
        if (data.localStorageData.app_notifications) {
          localStorage.setItem('app_notifications', data.localStorageData.app_notifications);
        }
        if (data.localStorageData.gkd_registrador_records) {
          localStorage.setItem('gkd_registrador_records', data.localStorageData.gkd_registrador_records);
        }
        if (data.localStorageData.app_vehicles_cache) {
          localStorage.setItem('app_vehicles_cache', data.localStorageData.app_vehicles_cache);
        }
        if (data.localStorageData.gkd_saved_routes) {
          localStorage.setItem('gkd_saved_routes', data.localStorageData.gkd_saved_routes);
        }
      } else {
        localStorage.setItem('app_vehicles_cache', JSON.stringify(vList));
      }

      // 2. Restaurar veículos no Firestore e estado
      if (vList.length > 0) {
        for (const item of vList) {
          try {
            const docId = item.id && item.id !== 'new' ? item.id : undefined;
            const vehiclePayload = {
              name: item.name || 'Dispositivo Restaurado',
              type: item.type || 'carro',
              color: item.color || '#3b82f6',
              photoUrl: item.photoUrl || '',
              iconType: item.iconType || 'car',
              licensePlate: item.licensePlate || '',
              status: item.status || 'Offline',
              trackerNumber: item.trackerNumber || '',
              phoneNumber: item.phoneNumber || '',
              lat: item.lat ?? -23.5505,
              lng: item.lng ?? -46.6333,
              speed: item.speed || 0,
              fuel: item.fuel || 100,
              sharpTurns: item.sharpTurns || 0,
              harshBraking: item.harshBraking || 0,
              totalMileage: item.totalMileage || 0,
              dailyMileage: item.dailyMileage || 0,
              commandQueue: item.commandQueue || [],
              settings: item.settings || {}
            };

            const cleanedPayload = cleanFirestoreData(vehiclePayload);
            if (docId) {
              await setDoc(doc(db, 'cars', docId), cleanedPayload, { merge: true });
            } else {
              await addDoc(collection(db, 'cars'), cleanedPayload);
            }
          } catch (e) {
            console.warn('Erro ao restaurar item no Firestore:', e);
          }
        }

        if (setVehicles) {
          setVehicles(vList);
        }
      }

      if (showToast) {
        showToast(`🎉 BACKUP RESTAURADO COM SUCESSO! (${vList.length} itens, notificações e gravações recuperados)`);
      }

      setShowRestoreModal(false);
      setRestoreFileData(null);
    } catch (err) {
      console.error('Erro na restauração do backup:', err);
      if (showToast) showToast('❌ Ocorreu um erro ao restaurar os dados.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(cmd);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const toggleTopic = (id: string) => {
    setExpandedTopic(expandedTopic === id ? null : id);
  };

  // Comprehensive System Topics
  const allTopics = [
    {
      id: 'posicao',
      category: 'rastreamento',
      title: '1. Rastreamento de Veículos em Tempo Real',
      icon: <MapPin className="w-5 h-5 text-blue-600" />,
      shortDesc: 'Funcionamento do mapa interativo, frequências de busca e troca de camadas.',
      details: [
        '🚗 **Busca de Veículos (Carros / Caminhões / Motos / Vans):** Sincronização em tempo real via Flespi sem consumo desnecessário.',
        '🗺️ **Camadas de Mapa (Modo Noturno):** Alternância rápida entre Padrão (OpenStreetMap), Noturno (Dark Mode ideal para ambientes de monitoramento), Satélite, Híbrido e Relevo no ícone de camadas no topo da tela.',
        '📍 **Marcadores Interativos & Street View:** Clique sobre qualquer veículo no mapa para ver a caixa de telemetria completa (Velocidade, Bateria, Endereço e Odômetro). Agora inclui um quadro em miniatura com a imagem real do **Street View** do local onde o veículo está estacionado.',
        '💬 **Consulta Imediata por SMS:** Envie o comando `where,123456#` ou `check123456` para receber as coordenadas GPS diretamente no celular.'
      ],
      commands: [
        { cmd: 'where,123456#', label: 'Consultar posição GPS atual via SMS' },
        { cmd: 'check123456', label: 'Verificar status geral do rastreador' }
      ]
    },
    {
      id: 'dashboard-analytics',
      category: 'dashboard',
      title: '2. Dashboard da Frota e Métricas Analíticas',
      icon: <Activity className="w-5 h-5 text-emerald-600" />,
      shortDesc: 'Visão geral com gráficos Recharts, estatísticas e gerenciamento de frota.',
      details: [
        '📊 **KPIs Principais:** Contagem total de unidades, veículos em movimento, parados, quilometragem total e média de velocidade.',
        '⚡ **KPIs de Telemetria:** Quilometragem diária acumulada, frenagens bruscas e curvas fechadas registradas.',
        '👁️ **Botão Mostrar/Ocultar Aparelhos:** Oculta ou exibe rapidamente a lista de dispositivos no dashboard para focar nos gráficos.',
        '📈 **Gráficos Dinâmicos:** Gráfico de pizza com status da frota e gráfico de barras comparando a quilometragem percorrida.'
      ],
      commands: []
    },
    {
      id: 'controle',
      category: 'comandos',
      title: '3. Controle de Ignição, Corte de Combustível e Fila Offline',
      icon: <Sliders className="w-5 h-5 text-red-600" />,
      shortDesc: 'Comandos de bloqueio, religamento e enfileiramento inteligente para aparelhos sem sinal.',
      details: [
        '🛑 **Bloqueio do Motor (`stop123456`):** Envia sinal de corte do relé de combustível em casos de emergência ou furto.',
        '🟢 **Desbloqueio (`resume123456`):** Restaura o funcionamento normal do motor do veículo.',
        '⏳ **Fila de Comandos Offline:** Se o rastreador estiver desligado ou em área de sombra (sem rede), os comandos não são perdidos! Eles entram na **Fila de Espera**.',
        '❌ **Cancelamento na Fila:** Você pode cancelar qualquer comando pendente na fila com um único clique antes de o rastreador reconectar.',
        '🔄 **Simulação de Reagendamento:** O sistema testa automaticamente o envio e executa a fila de comandos assim que o sinal de rede é restabelecido.'
      ],
      commands: [
        { cmd: 'stop123456', label: 'Bloquear motor (Corta combustível)' },
        { cmd: 'resume123456', label: 'Desbloquear funcionamento do motor' },
        { cmd: 'acc,123456,on#', label: 'Ativar aviso de ignição ligada' }
      ]
    },
    {
      id: 'audio-ecuta',
      category: 'audio',
      title: '4. Módulo de Áudio, Escuta de Cabine e Voz',
      icon: <Volume2 className="w-5 h-5 text-purple-600" />,
      shortDesc: 'Gravação local de áudio via microfone e comando de escuta secreta do TK303G.',
      details: [
        '🎙️ **Gravador de Áudio Embutido:** Grave notas de voz ou áudios da central utilizando o microfone do seu navegador ou celular.',
        '🎧 **Reprodução e Download:** Ouça os áudios salvos na aba Áudio/Escuta e faça download dos arquivos MP3/WAV a qualquer momento.',
        '📞 **Modo Escuta Secreta TK303G (`monitor123456`):** Altera o modo do rastreador para escuta ambiente. Ao ligar para o número do chip, o aparelho atende silenciosamente e ativa o microfone embutido.',
        '🚗 **Retorno ao Modo Rastreador (`tracker123456`):** Retorna o equipamento ao modo de envio de posições normais.'
      ],
      commands: [
        { cmd: 'monitor123456', label: 'Ativar Modo Escuta (Microfone da Cabine)' },
        { cmd: 'tracker123456', label: 'Retornar ao Modo Rastreamento Normal' }
      ]
    },
    {
      id: 'alarms',
      category: 'comandos',
      title: '5. Sensores de Segurança, Bateria e Alertas Antifurto',
      icon: <Lock className="w-5 h-5 text-cyan-600" />,
      shortDesc: 'Ativação do alarme por choque, vibração, corte de bateria e limite de velocidade.',
      details: [
        '🛡️ **Armar Alarme (`arm123456`):** Ativa o modo de segurança. Qualquer abertura de porta, vibração ou tentativa de partida acionará os alertas da central.',
        '🔓 **Desarmar Alarme (`disarm123456`):** Desativa os sensores de choque para uso normal.',
        '⚠️ **Alerta de Excesso de Velocidade (`speed123456 080`):** Define um limite de velocidade em km/h. Se ultrapassado, gera alerta sonoro e notificação.',
        '🔋 **Alerta de Corte de Bateria:** Notificação automática se o rastreador for desconectado da bateria do veículo.'
      ],
      commands: [
        { cmd: 'arm123456', label: 'Ativar alarme antifurto (Arm)' },
        { cmd: 'disarm123456', label: 'Desativar alarme (Disarm)' },
        { cmd: 'speed,123456,100#', label: 'Configurar limite de velocidade para 100 km/h' }
      ]
    },
    {
      id: 'cerca',
      category: 'rastreamento',
      title: '6. Cerca Geográfica (Geofence Virtual)',
      icon: <Target className="w-5 h-5 text-orange-600" />,
      shortDesc: 'Delimitação de áreas de segurança com avisos de entrada e saída.',
      details: [
        '⭕ **Criação de Raio Seguro:** Configure um perímetro virtual ao redor de garagens, empresas, pátios ou residências.',
        '🔔 **Avisos Instantâneos:** Receba notificações visuais e sonoras assim que o veículo ultrapassar a linha demarcada.',
        '🛠️ **Ativação por SMS:** Defina cercas remotamente através de comando SMS `stockade123456,0000M`.'
      ],
      commands: [
        { cmd: 'stockade123456,0000M', label: 'Ativar cerca com raio personalizado' },
        { cmd: 'nostockade123456', label: 'Desativar cerca geográfica' }
      ]
    },
    {
      id: 'notificacoes-central',
      category: 'dashboard',
      title: '7. Central de Alertas e Notificações Sonoras',
      icon: <Bell className="w-5 h-5 text-amber-600" />,
      shortDesc: 'Histórico completo de eventos, avisos de iginção, excesso de velocidade e botão de limpar.',
      details: [
        '🔔 **Sino de Notificações:** No topo do aplicativo, acesse o painel com o histórico de todos os eventos registrados.',
        '🔊 **Avisos Sonoros:** O aplicativo emite um bipe de alerta sempre que uma violação de velocidade, saída de cerca ou alarme de bateria ocorrer.',
        '🧹 **Limpeza e Gerenciamento:** Marque notificações como lidas ou limpe o histórico completo facilmente.'
      ],
      commands: []
    },
    {
      id: 'trajetoria-rotas',
      category: 'rastreamento',
      title: '8. Trajetória, Histórico de Percursos e Rotas Gravadas',
      icon: <Route className="w-5 h-5 text-indigo-600" />,
      shortDesc: 'Visualização e reprodução do percurso histórico dos veículos no mapa.',
      details: [
        '🛣️ **Linha do Percurso:** Desenho contínuo no mapa mostrando o trajeto exato percorrido no dia ou período selecionado.',
        '📍 **Pontos de Telemetria:** Exibe paradas, horários, velocidades máximas e endereços ao longo do trajeto.',
        '💾 **Salvamento de Rotas:** Armazena histórico de viagens para consulta posterior e auditoria de gastos com combustível.'
      ],
      commands: [
        { cmd: 'tracker123456', label: 'Ativar envio contínuo de posições GPRS' }
      ]
    },
    {
      id: 'backup-restore-guide',
      category: 'backup',
      title: '9. Backup Completo e Restauração de Dados em Arquivo JSON',
      icon: <HardDrive className="w-5 h-5 text-emerald-600" />,
      shortDesc: 'Como exportar toda a base de dados para o celular/PC e restaurar tudo com 1 clique.',
      details: [
        '💾 **Exportação em 1 Clique:** Baixe um arquivo `.json` contendo toda a Frota de Veículos, Notificações, Gravações de Áudio e Rotas do aplicativo.',
        '📁 **Armazenamento Seguro:** Guarde o arquivo na memória do celular, Google Drive, WhatsApp ou computador.',
        '📤 **Restauração Inteligente:** O sistema lê o arquivo, mostra um **Resumo Completo do Backup** antes de confirmar e restaura tudo no banco de dados Firestore e no LocalStorage.',
        '🔒 **Proteção contra Perdas:** Garante que você nunca perca o cadastro da sua frota mesmo se formatar o aparelho ou trocar de navegador.'
      ],
      commands: []
    },
    {
      id: 'factory-reset-guide',
      category: 'backup',
      title: '10. Reset de Fábrica Personalizável e Exclusão Total Zerada',
      icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
      shortDesc: 'Ferramentas de limpeza seletiva de categorias ou reinicialização zerada completa.',
      details: [
        '⚙️ **Reset de Fábrica Seletivo:** Escolha exatamente quais categorias de dados quer deletar usando as caixas de seleção (Veículos, Notificações, Gravações de Áudio, Trajetórias ou Cache Local).',
        '🔴 **Exclusão Total Zerada:** Botão especial para limpar a base de dados do Firestore e LocalStorage por completo, deixando o aplicativo limpo como de fábrica.',
        '⚠️ **Camadas de Segurança:** Pop-up de confirmação dupla com alertas visuais para evitar exclusões acidentais.'
      ],
      commands: [
        { cmd: 'begin123456', label: 'Reset de fábrica no hardware TK303G' }
      ]
    },
    {
      id: 'sem-internet',
      category: 'comandos',
      title: '11. Esclarecimento: Rastreador Sem Internet vs. Comandos SMS',
      icon: <HelpCircle className="w-5 h-5 text-amber-600" />,
      shortDesc: 'O que fazer se o chip do rastreador ficar sem crédito de dados GPRS.',
      details: [
        '🌐 **Transmissão via Internet (GPRS):** Para atualizar o mapa em tempo real, o chip SIM dentro do rastreador precisa de saldo ou plano de dados ativo.',
        '📲 **Operação sem Internet via SMS:** Se os dados do chip acabarem, o mapa ficará estático, mas os **comandos via SMS continuam funcionando perfeitamente**!',
        '📞 Você pode enviar `where`, `stop` e `arm` via SMS do celular para o número do chip e receber as respostas sem depender de sinal de internet.',
        '📶 **Configuração do APN:** Envie o comando de APN da sua operadora (Ex: Claro `apn,123456,claro.com.br#`, Vivo `apn,123456,zap.vivo.com.br#`, TIM `apn,123456,tim.br#`).'
      ],
      commands: [
        { cmd: 'apn,123456,zap.vivo.com.br#', label: 'Configurar APN da Vivo' },
        { cmd: 'apn,123456,claro.com.br#', label: 'Configurar APN da Claro' },
        { cmd: 'apn,123456,tim.br#', label: 'Configurar APN da TIM' }
      ]
    },
    {
      id: 'hardware-vs-app',
      category: 'manual',
      title: '12. Rastreador Físico (TK303G / Hardware) e Telemetria Veicular',
      icon: <Cpu className="w-5 h-5 text-gray-800" />,
      shortDesc: 'Diferenças de arquitetura, tempo de resposta e relés físicos de corte.',
      details: [
        '🏎️ **Rastreador de Hardware (Ex: TK303G / Coban):** Funciona com relé elétrico conectado diretamente na bomba de combustível do veículo. Comandos SMS/GPRS cortam o motor **instantaneamente** e funcionam em milissegundos sem depender de sistema operacional.',
        '📡 **Transmissão Contínua:** Os módulos GPS e GSM integrados ao veículo transmitem telemetria contínua via GPRS e respondem instantaneamente a comandos SMS de bloqueio e rastreio.'
      ],
      commands: []
    }
  ];

  // Search and Tab Filtering
  const filteredTopics = allTopics.filter(t => {
    const matchesTab = activeTab === 'all' || t.category === activeTab;
    const matchesQuery = searchQuery.trim() === '' || 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.shortDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.details.some(d => d.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.commands.some(c => c.cmd.toLowerCase().includes(searchQuery.toLowerCase()) || c.label.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesTab && matchesQuery;
  });

  return (
    <div className="flex-grow flex flex-col h-full bg-gray-50 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-8 space-y-8">
        
        {/* Header with Search Input */}
        <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-blue-950 p-6 sm:p-8 rounded-2xl text-white shadow-lg space-y-4 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Central de Conhecimento e Esclarecimentos</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                <Info className="w-7 h-7 text-blue-400 shrink-0" />
                Guia Completo do Sistema de Rastreamento
              </h2>
              <p className="text-xs sm:text-sm text-blue-100/80 mt-1 max-w-2xl leading-relaxed">
                Acesse abaixo todas as explicações intuitivas sobre Rastreamento Vivo, Dashboard, Fila de Comandos SMS, Módulo de Áudio, Backup JSON, Reset de Fábrica e Manual do TK303G.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {onBackToMap && (
                <button
                  type="button"
                  onClick={onBackToMap}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 text-xs sm:text-sm cursor-pointer border border-blue-400/40 shrink-0 active:scale-95"
                  title="Voltar ao Mapa de Rastreamento em Tempo Real"
                >
                  <MapPin className="w-4 h-4" />
                  <span>Ver Mapa Ao Vivo</span>
                </button>
              )}
              <div className="shrink-0 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 text-center">
                <span className="block text-2xl font-black text-white">{vehicles.length}</span>
                <span className="text-[10px] text-blue-200 uppercase font-semibold">Itens Monitorados</span>
              </div>
            </div>
          </div>

          {/* Quick Search Bar */}
          <div className="relative z-10 pt-2 flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-grow w-full flex items-center">
              <Search className="w-5 h-5 absolute left-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Pesquise por qualquer palavra-chave (ex: 'bloquear', 'áudio', '1 min', '3s', 'backup', 'senha', 'cerca')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 rounded-xl bg-white text-gray-900 placeholder-gray-500 text-xs sm:text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <a
              href="https://wa.me/5511953292570?text=Olá!%20Tenho%20uma%20sugestão%20para%20o%20aplicativo%20GKD%20Messenger:"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-5 py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-xs sm:text-sm uppercase tracking-wider cursor-pointer border border-emerald-300 active:scale-95"
            >
              <span className="text-lg">💬</span>
              <span>Fale Conosco (WhatsApp)</span>
            </a>
          </div>
        </div>

        {/* Status de Notificações e Autorizações (Tudo OK) */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-emerald-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Central de Autorizações do Sistema</span>
                  <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase">Tudo OK ✅</span>
                </h3>
                <p className="text-xs text-emerald-200/80 mt-0.5">
                  Verifique e teste rapidamente as permissões de geolocalização (GPS) e microfone (Áudio).
                </p>
              </div>
            </div>

            <button
              onClick={checkBrowserPermissions}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-white/20 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Atualizar Status</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Geolocalização */}
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" /> Geolocalização
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                    permissionStatus.geolocation === 'granted' ? 'bg-emerald-500 text-slate-950' : 'bg-teal-500/60 text-white'
                  }`}>
                    {permissionStatus.geolocation}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">GPS para rastreamento no mapa e celular.</p>
              </div>
              <button
                onClick={testGeolocation}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
              >
                <span>Testar GPS / Posição</span>
              </button>
            </div>

            {/* Microfone */}
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4" /> Microfone / Áudio
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                    permissionStatus.microphone === 'granted' ? 'bg-emerald-500 text-slate-950' : 'bg-cyan-500/60 text-white'
                  }`}>
                    {permissionStatus.microphone}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">Escuta de cabine e gravador de voz.</p>
              </div>
              <button
                onClick={testMicrophone}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
              >
                <span>Testar Microfone</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span>Todos ({allTopics.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('rastreamento')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'rastreamento' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Rastreamento (1m / 3s)</span>
          </button>
          <button
            onClick={() => setActiveTab('comandos')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'comandos' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Comandos SMS & Fila</span>
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Dashboard & Métricas</span>
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'audio' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Áudio & Escuta</span>
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'backup' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Backup & Reset</span>
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'manual' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Manual TK303G</span>
          </button>
        </div>

        {/* Expandable Topics List */}
        <div className="space-y-4">
          {filteredTopics.length === 0 ? (
            <div className="p-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-300">
              <Search className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-gray-800">Nenhum tópico encontrado</h3>
              <p className="text-xs text-gray-500 mt-1">Tente pesquisar por outro termo ou mude o filtro de categoria acima.</p>
            </div>
          ) : (
            filteredTopics.map((topic) => {
              const isExpanded = expandedTopic === topic.id;
              return (
                <div 
                  key={topic.id}
                  className={`border rounded-2xl transition-all overflow-hidden bg-white ${
                    isExpanded ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <button
                    onClick={() => toggleTopic(topic.id)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-200 shrink-0">
                        {topic.icon}
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-gray-900">{topic.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{topic.shortDesc}</p>
                      </div>
                    </div>
                    <div className="p-2 text-gray-400 shrink-0">
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-blue-600" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-5 sm:p-6 border-t border-gray-100 bg-white space-y-5 animate-fadeIn">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2.5 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" /> Esclarecimento Detalhado e Funcionamento
                        </h4>
                        <ul className="space-y-2.5">
                          {topic.details.map((detail, idx) => (
                            <li key={idx} className="flex items-start text-xs sm:text-sm text-gray-700 leading-relaxed">
                              <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-2.5 shrink-0"></span>
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {topic.commands && topic.commands.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5 flex items-center gap-1.5">
                            <span>📱</span> Comandos SMS Relacionados (Clique para copiar)
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {topic.commands.map((c, idx) => (
                              <div
                                key={idx}
                                onClick={() => handleCopy(c.cmd)}
                                className="p-3 rounded-xl border border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50/40 cursor-pointer transition-all group flex items-center justify-between"
                              >
                                <div>
                                  <code className="text-xs font-mono font-bold text-blue-700 group-hover:underline">
                                    {c.cmd}
                                  </code>
                                  <p className="text-[11px] text-gray-500 mt-0.5">{c.label}</p>
                                </div>
                                <div className="p-1 text-gray-400 group-hover:text-blue-600">
                                  {copiedCommand === c.cmd ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Significado das Cores e Status do Sinal */}
        <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl overflow-hidden transition-all">
          <button
            onClick={() => setShowStatusColors(!showStatusColors)}
            className="w-full p-4.5 flex items-center justify-between text-left hover:bg-blue-100/40 transition-colors cursor-pointer"
          >
            <h3 className="text-sm font-bold text-blue-900 flex items-center">
              <span className="text-lg mr-2">🟢</span> Significado das Cores de Status e Conexão GPS
            </h3>
            <div className="p-1 text-blue-600">
              {showStatusColors ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </button>

          {showStatusColors && (
            <div className="p-5 pt-1 border-t border-blue-100/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs text-gray-700 animate-fadeIn">
              <div className="flex items-start space-x-2.5 bg-white p-3.5 rounded-xl border border-blue-100 shadow-sm">
                <span className="inline-block px-2 py-1 font-mono font-bold bg-green-100 text-green-700 border border-green-300 rounded-lg shrink-0">🟢 Verde</span>
                <div>
                  <strong className="text-gray-900 block mb-0.5">Em Movimento / Ligado / Conectado</strong>
                  <p className="text-gray-600 mt-0.5">Veículo com ignição ligada ou em deslocamento. Para celulares: aparelho transmitindo localizações a cada 3 segundos em tempo real.</p>
                </div>
              </div>
              <div className="flex items-start space-x-2.5 bg-white p-3.5 rounded-xl border border-blue-100 shadow-sm">
                <span className="inline-block px-2 py-1 font-mono font-bold bg-gray-200 text-gray-700 border border-gray-300 rounded-lg shrink-0">⚪ Cinza</span>
                <div>
                  <strong className="text-gray-900 block mb-0.5">Parado / Desligado</strong>
                  <p className="text-gray-600 mt-0.5">Indica veículo estacionado com ignição desligada em modo de espera normal.</p>
                </div>
              </div>
              <div className="flex items-start space-x-2.5 bg-white p-3.5 rounded-xl border border-blue-100 shadow-sm">
                <span className="inline-block px-2 py-1 font-mono font-bold bg-red-100 text-red-700 border border-red-300 animate-pulse rounded-lg shrink-0">🔴 Vermelho</span>
                <div>
                  <strong className="text-gray-900 block mb-0.5">Offline / Bateria Desconectada / Alarme</strong>
                  <p className="text-gray-600 mt-0.5">Perda de sinal GSM, aparelho desligado, corte de alimentação principal ou violação de segurança.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Significado das Cores de Velocidade */}
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl overflow-hidden transition-all">
          <button
            onClick={() => setShowSpeedAlerts(!showSpeedAlerts)}
            className="w-full p-4.5 flex items-center justify-between text-left hover:bg-amber-100/40 transition-colors cursor-pointer"
          >
            <h3 className="text-sm font-bold text-amber-900 flex items-center">
              <span className="text-lg mr-2">🎨</span> Alertas Visuais e Limites de Velocidade
            </h3>
            <div className="p-1 text-amber-600">
              {showSpeedAlerts ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </button>

          {showSpeedAlerts && (
            <div className="p-5 pt-1 border-t border-amber-100/80 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-700 animate-fadeIn">
              <div className="flex items-start space-x-2.5 bg-white p-3.5 rounded-xl border border-amber-100 shadow-sm">
                <span className="inline-block px-2 py-1 font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100 rounded-lg shrink-0">⚡ 45 km/h</span>
                <div>
                  <strong className="text-gray-900 block mb-0.5">Azul Padrão (Velocidade Normal)</strong>
                  Indica que o veículo está trafegando dentro dos limites normais configurados.
                </div>
              </div>
              <div className="flex items-start space-x-2.5 bg-white p-3.5 rounded-xl border border-amber-100 shadow-sm">
                <span className="inline-block px-2 py-1 font-mono font-bold bg-red-100 text-red-700 border border-red-300 animate-pulse rounded-lg shrink-0">⚡ 85 km/h</span>
                <div>
                  <strong className="text-gray-900 block mb-0.5">Vermelho Pisca-Pisca (Excesso de Velocidade)</strong>
                  Ocorreu ultrapassagem do limite estipulado. Emite som de alerta e gera notificação na central.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Leitor do Manual do Usuário PDF TK303G */}
        <div className="pt-6 border-t border-gray-200">
          <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <button
              onClick={() => setShowPdfReader(!showPdfReader)}
              className="w-full p-4.5 flex items-center justify-between text-left bg-gray-50 hover:bg-gray-100/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900">Manual de Instruções - Rastreador Coban TK303G (PDF Interativo)</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Clique para ler o manual completo com busca, sumário por página e modo escuro.</p>
                </div>
              </div>
              <div className="p-1 text-gray-500">
                {showPdfReader ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </button>

            {showPdfReader && (
              <div className="p-4 sm:p-6 border-t border-gray-200 animate-fadeIn">
                <PdfReader 
                  pdfUrl="/manual-tk303g.pdf" 
                  title="Manual de Instruções - Rastreador Coban TK303G" 
                />
              </div>
            )}
          </div>
        </div>

        {/* Painel de Backup e Restauração de Dados (JSON) */}
        <div className="pt-6 border-t border-gray-200">
          <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-2xl text-white shadow-xl border border-emerald-800/50 overflow-hidden transition-all">
            <button
              onClick={() => setShowBackupPanel(!showBackupPanel)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-900/60 rounded-xl border border-emerald-700/50">
                  <HardDrive className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">💾 Backup Completo & Restauração de Dados (Arquivo JSON)</h3>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Salve uma cópia de segurança de todos os veículos, áudios e histórico em um arquivo JSON.
                  </p>
                </div>
              </div>
              <div className="p-1 text-slate-400">
                {showBackupPanel ? <ChevronUp className="w-5 h-5 text-emerald-400" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </button>

            {showBackupPanel && (
              <div className="p-5 pt-3 border-t border-emerald-900/40 space-y-4 animate-fadeIn">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Gere uma cópia de segurança completa em formato JSON contendo a frota de veículos, histórico de notificações, gravações da cabine e rotas. Salve na pasta do seu computador ou celular para poder restaurar a qualquer momento.
                </p>

                <input
                  type="file"
                  accept=".json,application/json"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="flex flex-wrap sm:flex-nowrap gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-4 py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer border border-emerald-300 active:scale-95"
                  >
                    <Download className="w-4 h-4 text-slate-950" />
                    <span>📥 Baixar Backup (Arquivo JSON)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold px-4 py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer border border-cyan-300 active:scale-95"
                  >
                    <Upload className="w-4 h-4 text-slate-950" />
                    <span>📤 Carregar & Restaurar Backup</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Painel de Gestão de Dados e Reset */}
        <div className="pt-6 border-t border-gray-200">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-red-950 rounded-2xl text-white shadow-xl border border-red-900/40 overflow-hidden transition-all">
            <button
              onClick={() => setShowResetPanel(!showResetPanel)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-900/60 rounded-xl border border-red-700/50">
                  <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse shrink-0" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Reset de Fábrica & Gestão Seletiva de Dados</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Reiniciar dados por categorias específicas ou realizar a exclusão total zerada do sistema.
                  </p>
                </div>
              </div>
              <div className="p-1 text-slate-400">
                {showResetPanel ? <ChevronUp className="w-5 h-5 text-red-400" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </button>

            {showResetPanel && (
              <div className="p-5 pt-3 border-t border-red-900/40 space-y-4 animate-fadeIn">
                <p className="text-xs text-slate-300">
                  Escolha quais categorias de dados você deseja excluir no reset de fábrica ou execute a exclusão total e zeramento completo.
                </p>

                <div className="flex flex-wrap sm:flex-nowrap gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItems({
                        carros: true,
                        notificacoes: true,
                        gravacoes: true,
                        rotas: true,
                        cache: true
                      });
                      setConfirmStep(false);
                      setShowFactoryModal(true);
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-4 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer border border-amber-300 active:scale-95"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-950" />
                    <span>⚙️ Reset de Fábrica Seletivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDeleteAllModal(true)}
                    className="bg-red-600 hover:bg-red-700 text-white font-extrabold px-4 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer border border-red-500 active:scale-95"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                    <span>🔴 Excluir Tudo (Zero Absoluto)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal: Reset de Fábrica Seletivo */}
      {showFactoryModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 space-y-5 relative overflow-hidden">
            <button
              onClick={() => {
                setShowFactoryModal(false);
                setConfirmStep(false);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">⚙️ Reset de Fábrica Seletivo</h3>
                <p className="text-xs text-gray-500">Selecione quais dados você deseja remover do sistema.</p>
              </div>
            </div>

            {!confirmStep ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-amber-50/70 border border-amber-200/80 rounded-xl p-3">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-amber-700" /> Seleção de Categorias:
                  </span>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {allSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
                    <span>{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  <label
                    onClick={() => toggleItem('carros')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedItems.carros ? 'bg-amber-50/50 border-amber-400 ring-1 ring-amber-400/20' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🚗</span>
                      <div>
                        <strong className="text-xs font-bold text-gray-900 block">Frota e Veículos</strong>
                        <span className="text-[10px] text-gray-500">Carros e Rastreadores ({vehicles.length})</span>
                      </div>
                    </div>
                    {selectedItems.carros ? <CheckSquare className="w-5 h-5 text-amber-600 shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                  </label>



                  <label
                    onClick={() => toggleItem('notificacoes')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedItems.notificacoes ? 'bg-amber-50/50 border-amber-400 ring-1 ring-amber-400/20' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🔔</span>
                      <div>
                        <strong className="text-xs font-bold text-gray-900 block">Notificações e Alertas</strong>
                        <span className="text-[10px] text-gray-500">Histórico da Central</span>
                      </div>
                    </div>
                    {selectedItems.notificacoes ? <CheckSquare className="w-5 h-5 text-amber-600 shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                  </label>

                  <label
                    onClick={() => toggleItem('gravacoes')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedItems.gravacoes ? 'bg-amber-50/50 border-amber-400 ring-1 ring-amber-400/20' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🎙️</span>
                      <div>
                        <strong className="text-xs font-bold text-gray-900 block">Gravações de Áudio</strong>
                        <span className="text-[10px] text-gray-500">Registros do Registrador</span>
                      </div>
                    </div>
                    {selectedItems.gravacoes ? <CheckSquare className="w-5 h-5 text-amber-600 shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                  </label>

                  <label
                    onClick={() => toggleItem('rotas')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedItems.rotas ? 'bg-amber-50/50 border-amber-400 ring-1 ring-amber-400/20' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🗺️</span>
                      <div>
                        <strong className="text-xs font-bold text-gray-900 block">Trajetórias & Rotas</strong>
                        <span className="text-[10px] text-gray-500">Histórico de Percursos</span>
                      </div>
                    </div>
                    {selectedItems.rotas ? <CheckSquare className="w-5 h-5 text-amber-600 shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                  </label>

                  <label
                    onClick={() => toggleItem('cache')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedItems.cache ? 'bg-amber-50/50 border-amber-400 ring-1 ring-amber-400/20' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">⚡</span>
                      <div>
                        <strong className="text-xs font-bold text-gray-900 block">Cache Local</strong>
                        <span className="text-[10px] text-gray-500">Dados temporários</span>
                      </div>
                    </div>
                    {selectedItems.cache ? <CheckSquare className="w-5 h-5 text-amber-600 shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                  </label>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFactoryModal(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!Object.values(selectedItems).some(Boolean)}
                    onClick={() => setConfirmStep(true)}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <span>Avançar para Confirmação</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-900">⚠️ Confirmar Exclusão Selecionada</h4>
                    <p className="text-xs text-red-700 mt-1">
                      Você está prestes a apagar os dados marcados. Esta operação removerá definitivamente esses registros!
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-xs text-gray-700 space-y-1">
                  <strong>Itens que serão apagados:</strong>
                  <ul className="list-disc list-inside text-[11px] text-gray-600 space-y-0.5 mt-1">
                    {selectedItems.carros && <li>Veículos e Carros da frota</li>}

                    {selectedItems.notificacoes && <li>Notificações e Avisos da central</li>}
                    {selectedItems.gravacoes && <li>Gravações de áudio e arquivos de voz</li>}
                    {selectedItems.rotas && <li>Trajetórias e histórico de rotas</li>}
                    {selectedItems.cache && <li>Cache local e dados armazenados no navegador</li>}
                  </ul>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setConfirmStep(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={executeFactoryReset}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span>Confirmar Reset de Fábrica</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Excluir Tudo Zerado */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-red-500 space-y-5 text-center relative">
            <button
              onClick={() => setShowDeleteAllModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto animate-bounce border border-red-200">
              <AlertTriangle className="w-9 h-9" />
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-gray-900">🔴 ALERTA DE EXCLUSÃO TOTAL</h3>
              <p className="text-xs text-red-600 font-bold mt-1">ESTA AÇÃO IRÁ APAGAR TUDO NO SISTEMA!</p>
            </div>

            <p className="text-xs text-gray-600 bg-red-50 border border-red-100 p-3.5 rounded-xl text-left leading-relaxed">
              Você está prestes a excluir <strong>TODOS OS VEÍCULOS</strong>, <strong>TODAS AS GRAVAÇÕES DE ÁUDIO</strong>, <strong>HISTÓRICO DE NOTIFICAÇÕES</strong> e <strong>ROTAS</strong> do aplicativo. O sistema será totalmente limpo e zerado como novo.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={executeDeleteAll}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer border border-red-500 active:scale-95"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>🔥 SIM, QUERO APAGAR TUDO DEFINITIVAMENTE</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setShowDeleteAllModal(false)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer"
              >
                Cancelar e Manter Dados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Restauração do Backup */}
      {showRestoreModal && restoreFileData && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-5 relative overflow-hidden">
            <button
              onClick={() => {
                setShowRestoreModal(false);
                setRestoreFileData(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="p-3 bg-cyan-100 text-cyan-800 rounded-xl">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">📤 Confirmar Restauração de Backup</h3>
                <p className="text-xs text-gray-500">Arquivo selecionado: <strong className="text-gray-800">{restoreFileData.filename}</strong></p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3.5 text-xs text-cyan-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-cyan-950">
                  <Database className="w-4 h-4 text-cyan-700" /> Resumo do Arquivo de Backup:
                </p>
                {restoreFileData.summary.exportDate && (
                  <p className="text-[11px] text-cyan-800">📅 Data da cópia: <strong>{restoreFileData.summary.exportDate}</strong></p>
                )}
                <ul className="list-disc list-inside text-[11px] text-cyan-800 space-y-1 mt-2">
                  <li>🚗 Veículos no backup: <strong>{restoreFileData.summary.vehiclesCount}</strong></li>
                  <li>🔔 Histórico de notificações: <strong>{restoreFileData.summary.notificationsCount}</strong></li>
                  <li>🎙️ Gravações de áudio: <strong>{restoreFileData.summary.audioCount}</strong></li>
                  <li>🗺️ Rotas gravadas: <strong>{restoreFileData.summary.routesCount}</strong></li>
                </ul>
              </div>

              <p className="text-xs text-gray-600 bg-amber-50 border border-amber-200 p-3 rounded-xl leading-relaxed">
                ⚠️ <strong>Atenção:</strong> A restauração irá importar veículos, notificações e gravações contidos neste arquivo para o seu aplicativo e banco de dados.
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setShowRestoreModal(false);
                  setRestoreFileData(null);
                }}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={executeRestore}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>Restaurar Backup Agora</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
