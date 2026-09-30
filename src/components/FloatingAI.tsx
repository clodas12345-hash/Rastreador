import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, Paperclip, Sparkles, Car, ShieldCheck, Wrench, Zap } from 'lucide-react';
import { Vehicle, Driver } from '../types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  files?: string[];
  actionBtn?: {
    label: string;
    onClick: () => void;
  };
}

interface FloatingAIProps {
  vehicles?: Vehicle[];
  drivers?: Driver[];
  onSelectModule?: (module: string) => void;
  onSelectVehicle?: (v: Vehicle) => void;
}

export default function FloatingAI({
  vehicles = [],
  drivers = [],
  onSelectModule,
  onSelectVehicle
}: FloatingAIProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      role: 'assistant', 
      content: '🤖 Olá! Sou o GKD Copilot AI. Posso analisar sua frota, responder dúvidas sobre a telemetria, motoristas ou acionar o bloqueio de segurança.' 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    setInput('');

    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsLoading(true);

    setTimeout(() => {
      const queryLower = userQuery.toLowerCase();
      let replyText = '';
      let actionBtn: ChatMessage['actionBtn'] | undefined;

      // Smart Assistant NLP logic
      if (queryLower.includes('quantos') || queryLower.includes('total') || queryLower.includes('carro') || queryLower.includes('frota')) {
        const onlineCount = vehicles.filter(v => v.status !== 'Offline').length;
        const movingCount = vehicles.filter(v => (v.speed && v.speed > 0) || v.status === 'Moving').length;
        replyText = `📊 Sua frota possui **${vehicles.length} veículo(s)** cadastrados.\n• **${onlineCount}** online/conectados\n• **${movingCount}** em movimento agora.`;
        if (onSelectModule) {
          actionBtn = {
            label: '📍 Ver no Mapa de Rastreamento',
            onClick: () => onSelectModule('rastreamento')
          };
        }
      } else if (queryLower.includes('motorista') || queryLower.includes('condutor') || queryLower.includes('ranking') || queryLower.includes('cnh')) {
        replyText = `👤 Você tem **${drivers.length} motorista(s)** cadastrados na frota.\n• Média de pontuação Eco-Driving: **92/100** (Excelente).`;
        if (onSelectModule) {
          actionBtn = {
            label: '👤 Abrir Módulo de Motoristas',
            onClick: () => onSelectModule('motoristas')
          };
        }
      } else if (queryLower.includes('óleo') || queryLower.includes('oleo') || queryLower.includes('manutenção') || queryLower.includes('revisão') || queryLower.includes('pneu')) {
        replyText = `🔧 O painel de **Manutenção e Troca de Óleo** monitora os ciclos de peças por quilometragem real. Tudo está atualizado com o odômetro do GPS.`;
        if (onSelectModule) {
          actionBtn = {
            label: '🔧 Abrir Quadro de Manutenção',
            onClick: () => onSelectModule('manutencao')
          };
        }
      } else if (queryLower.includes('bloque') || queryLower.includes('corte') || queryLower.includes('desligar') || queryLower.includes('parar')) {
        replyText = `🔒 O **Bloqueio Seguro (Safe Block)** aguarda a ignição desligar para cortar a bomba de combustível de forma 100% segura sem sobravoltagem na via.`;
        if (onSelectModule) {
          actionBtn = {
            label: '⚙️ Abrir Terminal de Ferramentas',
            onClick: () => onSelectModule('ferramentas')
          };
        }
      } else {
        replyText = `🤖 Entendido! Analisei a telemetria dos ${vehicles.length} veículos em tempo real. Como posso te ajudar agora? (Você pode perguntar sobre motoristas, troca de óleo, localização ou bloqueios).`;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: replyText, actionBtn }]);
      setIsLoading(false);
    }, 600);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-auto">
      {isOpen && (
        <div className="bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-700 w-[350px] sm:w-[380px] h-[500px] flex flex-col mb-4 overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/20 rounded-xl text-lg">🤖</div>
              <div>
                <h3 className="font-extrabold text-sm text-white">GKD Copilot AI</h3>
                <span className="text-[10px] text-blue-100 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Telemática Inteligente
                </span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="hover:bg-white/20 p-1.5 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-none font-medium' 
                    : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-none shadow'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {msg.actionBtn && (
                    <button
                      type="button"
                      onClick={() => {
                        msg.actionBtn?.onClick();
                        setIsOpen(false);
                      }}
                      className="mt-2.5 w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow text-[11px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {msg.actionBtn.label}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700 text-slate-400 rounded-2xl rounded-bl-none p-3 px-4 flex items-center space-x-1.5 shadow">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900 flex items-center gap-2 shrink-0">
            <input
              type="text"
              placeholder="Pergunte sobre motoristas, óleo, frota..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl shadow transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white p-3.5 rounded-full shadow-2xl flex items-center gap-2 border-2 border-white transition-transform active:scale-95 cursor-pointer"
        title="Assistente IA GKD Copilot"
      >
        <span className="text-xl">🤖</span>
        <span className="font-extrabold text-xs hidden sm:inline">GKD AI Copilot</span>
      </button>
    </div>
  );
}
