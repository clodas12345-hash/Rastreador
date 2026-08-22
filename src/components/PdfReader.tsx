import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Download, 
  Maximize2, 
  Minimize2, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Printer, 
  List, 
  BookOpen, 
  Copy, 
  Check, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Eye
} from 'lucide-react';

interface PdfReaderProps {
  pdfUrl?: string;
  title?: string;
}

export default function PdfReader({ 
  pdfUrl = "/manual-tk303g.pdf", 
  title = "Manual de Instruções - Rastreador Coban TK303G" 
}: PdfReaderProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages] = useState<number>(12); // Standard manual page count
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [readingTheme, setReadingTheme] = useState<'light' | 'dark' | 'sepia'>('light');

  const containerRef = useRef<HTMLDivElement>(null);

  const sections = [
    { page: 1, title: '1. Visão Geral e Especificações Técnicas', desc: 'Recursos do módulo, frequência GSM e precisão GPS' },
    { page: 2, title: '2. Instalação e Inserção do SIM Card', desc: 'Esquema elétrico (12V/24V) e posição do chip' },
    { page: 3, title: '3. Inicialização e Cadastro Admin', desc: 'Comandos begin123456 e admin123456' },
    { page: 4, title: '4. Configuração APN e GPRS', desc: 'Conexão com plataforma web e servidores' },
    { page: 5, title: '5. Rastreamento e Posição em Tempo Real', desc: 'Chamada telefônica e envio de coordenadas' },
    { page: 6, title: '6. Bloqueio e Desbloqueio do Motor', desc: 'Relé de corte: stop123456 e resume123456' },
    { page: 7, title: '7. Alarme de Cerca e Movimento', desc: 'stock123456 e move123456' },
    { page: 8, title: '8. Alarmes de Excesso de Velocidade e Bateria', desc: 'speed123456 e alerta de corte de energia' },
    { page: 9, title: '9. Botão SOS e Escuta de Áudio', desc: 'Monitoramento de som ambiente do veículo' },
    { page: 10, title: '10. Modos de Economia de Energia', desc: 'Sleep mode por tempo e por choque' },
    { page: 11, title: '11. Diagnóstico por LEDs', desc: 'Padrão de piscadas dos LEDs GSM e GPS' },
    { page: 12, title: '12. Guia de Solução de Problemas', desc: 'Tabela de erros comuns e soluções' },
  ];

  const quickCommands = [
    { cmd: 'begin123456', label: 'Inicializar aparelho', category: 'Configuração' },
    { cmd: 'admin123456 11999999999', label: 'Cadastrar número administrador', category: 'Segurança' },
    { cmd: 'password123456 654321', label: 'Alterar senha padrão', category: 'Segurança' },
    { cmd: 'stop123456', label: 'Bloquear motor / corte de combustível', category: 'Controle' },
    { cmd: 'resume123456', label: 'Desbloquear motor', category: 'Controle' },
    { cmd: 'check123456', label: 'Verificar status do rastreador', category: 'Diagnóstico' },
    { cmd: 'gprs123456', label: 'Ativar modo GPRS / Plataforma', category: 'Rede' },
  ];

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error("Erro ao ativar tela cheia:", err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handlePrint = () => {
    const win = window.open(pdfUrl, '_blank');
    if (win) {
      win.focus();
      win.print();
    }
  };

  const filteredSections = sections.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCommands = quickCommands.filter(c =>
    c.cmd.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Construct source URL with page hash and zoom
  const pdfSource = `${pdfUrl}#page=${currentPage}&zoom=${zoom}`;

  return (
    <div 
      ref={containerRef}
      className={`rounded-xl border shadow-sm transition-all flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-0 bg-gray-900 text-white p-2' : 'bg-white border-gray-200'
      }`}
    >
      {/* Reader Header / Toolbar */}
      <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 ${
        readingTheme === 'dark' ? 'bg-gray-800 text-white border-gray-700' : 
        readingTheme === 'sepia' ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-slate-50 border-gray-200 text-gray-800'
      }`}>
        {/* Title and Badges */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 text-white rounded-lg shadow-sm">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base leading-tight">{title}</h3>
            <p className="text-xs opacity-75 flex items-center gap-2 mt-0.5">
              <span>Modelo: Coban TK303G / GPS303</span>
              <span className="inline-block w-1 h-1 rounded-full bg-current opacity-50"></span>
              <span>PDF Interativo</span>
            </p>
          </div>
        </div>

        {/* Reader Controls Toolbar */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Search Toggle / Input */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-2.5 opacity-50" />
            <input 
              type="text" 
              placeholder="Pesquisar comando ou tópico..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 sm:w-48"
            />
          </div>

          {/* Page Navigation */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-1 text-xs">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded disabled:opacity-40"
              title="Página Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-1.5 font-medium">
              Pág. {currentPage} / {totalPages}
            </span>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded disabled:opacity-40"
              title="Próxima Página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-1 text-xs">
            <button 
              onClick={() => setZoom(prev => Math.max(50, prev - 25))}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-1 font-mono text-[11px] min-w-[36px] text-center">{zoom}%</span>
            <button 
              onClick={() => setZoom(prev => Math.min(200, prev + 25))}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setZoom(100)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-[10px] font-bold text-blue-600"
              title="Resetar Zoom"
            >
              100%
            </button>
          </div>

          {/* Reading Theme Toggle */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-1">
            <button 
              onClick={() => setReadingTheme('light')}
              className={`p-1 rounded ${readingTheme === 'light' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'opacity-60'}`}
              title="Modo Claro"
            >
              <Sun className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setReadingTheme('sepia')}
              className={`p-1 rounded ${readingTheme === 'sepia' ? 'bg-amber-200 text-amber-900' : 'opacity-60'}`}
              title="Modo Leitura Conforto (Sépia)"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setReadingTheme('dark')}
              className={`p-1 rounded ${readingTheme === 'dark' ? 'bg-gray-900 text-white' : 'opacity-60'}`}
              title="Modo Escuro"
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>

          {/* Index Toggle */}
          <button 
            onClick={() => setShowToc(!showToc)}
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              showToc 
                ? 'bg-blue-600 text-white border-blue-600' 
                : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
            }`}
            title="Índice do Manual"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Índice</span>
          </button>

          {/* Actions */}
          <button 
            onClick={handlePrint}
            className="p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-600"
            title="Imprimir Manual"
          >
            <Printer className="w-4 h-4" />
          </button>

          <a 
            href={pdfUrl}
            download="Manual_TK303G_Coban.pdf"
            className="p-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1 shadow-sm"
            title="Baixar Arquivo PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Download</span>
          </a>

          <button 
            onClick={toggleFullscreen}
            className="p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-600"
            title={isFullscreen ? "Sair da Tela Cheia" : "Modo Tela Cheia"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Body with Sidebar TOC and Embedded PDF */}
      <div className={`flex flex-col lg:flex-row flex-grow min-h-[650px] relative overflow-hidden ${
        readingTheme === 'dark' ? 'bg-gray-900 text-gray-100' :
        readingTheme === 'sepia' ? 'bg-amber-50 text-amber-950' : 'bg-gray-100 text-gray-800'
      }`}>
        
        {/* Table of Contents & Quick Command Panel */}
        {showToc && (
          <div className={`w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r overflow-y-auto p-4 space-y-6 ${
            readingTheme === 'dark' ? 'border-gray-800 bg-gray-850' :
            readingTheme === 'sepia' ? 'border-amber-200 bg-amber-100/60' : 'border-gray-200 bg-white'
          }`}>
            
            {/* Quick SMS Commands Cheat Sheet */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                  <span>📱</span> Comandos SMS Rápidos
                </h4>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                  Clique p/ Copiar
                </span>
              </div>

              <div className="space-y-2">
                {filteredCommands.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => handleCopy(item.cmd)}
                    className="p-2.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer transition-all group relative"
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400 group-hover:underline">
                        {item.cmd}
                      </code>
                      <button className="p-1 text-gray-400 group-hover:text-blue-600">
                        {copiedCommand === item.cmd ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Index / Sections List */}
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5 opacity-80">
                <List className="w-3.5 h-3.5 text-blue-600" /> Capítulos e Tópicos
              </h4>
              <div className="space-y-1.5">
                {filteredSections.map((sec) => (
                  <button
                    key={sec.page}
                    onClick={() => setCurrentPage(sec.page)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-start gap-2.5 ${
                      currentPage === sec.page 
                        ? 'bg-blue-600 text-white font-medium shadow-sm' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      currentPage === sec.page ? 'bg-blue-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      P. {sec.page}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold leading-tight">{sec.title}</p>
                      <p className={`text-[10px] mt-0.5 ${currentPage === sec.page ? 'text-blue-100' : 'opacity-70'}`}>
                        {sec.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Embedded PDF Canvas / Viewer */}
        <div className="flex-1 flex flex-col h-full bg-slate-200 dark:bg-gray-950 p-2 sm:p-4 overflow-hidden relative">
          
          <div className="w-full h-full rounded-lg overflow-hidden border border-gray-300 dark:border-gray-800 bg-white shadow-inner flex flex-col">
            {/* Native Browser PDF Object Embed with Custom Style */}
            <object 
              data={pdfSource} 
              type="application/pdf" 
              className="w-full h-full flex-grow min-h-[550px]"
            >
              <iframe 
                src={pdfSource} 
                className="w-full h-full border-none min-h-[550px]"
                title="Leitor de PDF do Manual"
              >
                <div className="p-8 text-center bg-white flex flex-col items-center justify-center h-full">
                  <FileText className="w-16 h-16 text-blue-600 mb-4 animate-bounce" />
                  <h3 className="text-lg font-bold text-gray-800 mb-2">Visualizador de PDF do Manual</h3>
                  <p className="text-sm text-gray-600 max-w-md mb-6">
                    O arquivo PDF do manual do rastreador Track 303G está pronto para leitura e download.
                  </p>
                  <a 
                    href={pdfUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg shadow hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir PDF em Nova Aba
                  </a>
                </div>
              </iframe>
            </object>
          </div>

          {/* Bottom Reader Navigation Status Bar */}
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Documento Carregado: TK303G Manual (Coban)
            </span>
            <div className="flex items-center gap-3">
              <span>Página {currentPage} de {totalPages}</span>
              <a 
                href={pdfUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                Abrir em janela externa <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
