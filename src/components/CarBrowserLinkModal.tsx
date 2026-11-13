import React, { useState } from 'react';
import { X, Copy, Check, MessageSquare, ExternalLink, QrCode, Monitor, Sparkles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { PUBLIC_APP_URL } from '../config';

interface CarBrowserLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export default function CarBrowserLinkModal({
  isOpen,
  onClose,
  showToast
}: CarBrowserLinkModalProps) {
  const [copied, setCopied] = useState(false);

  // Computes clean public URL for the car's browser / multimedia
  const carBrowserUrl = React.useMemo(() => {
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const origin = (typeof window !== 'undefined' && !isLocalhost) ? window.location.origin : PUBLIC_APP_URL;
    const cleanOrigin = origin.replace(/\/+$/, '');
    return `${cleanOrigin}/?mode=carplay`;
  }, []);

  if (!isOpen) return null;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=svg&data=${encodeURIComponent(carBrowserUrl)}`;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(carBrowserUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = carBrowserUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      if (showToast) showToast('📋 Link da Central Multimídia copiado com sucesso!');
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      if (showToast) showToast('❌ Erro ao copiar link.');
    }
  };

  const handleSendWhatsApp = async () => {
    const message = `🚗 *Link de Rastreamento para Navegador do Carro / Multimídia*\n\n` +
      `Abra este link no navegador da central multimídia ou tablet do carro para acompanhar todos os veículos da frota ao vivo, em tela cheia e sem precisar digitar senha:\n\n` +
      `${carBrowserUrl}\n\n` +
      `⚡ *Recursos na multimídia:*\n` +
      `• Mapa dinâmico em tempo real\n` +
      `• Alternância rápida entre Peugeot 208, Onix Plus e visão da frota\n` +
      `• Modo tela cheia e visual diurno/noturno`;

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: 'Link para Multimídia do Carro',
          text: message,
          dialogTitle: 'Compartilhar Link do Carro'
        });
        if (showToast) showToast('✅ Menu de envio aberto!');
        return;
      } catch (e) {
        console.warn('Native share failed:', e);
      }
    }

    const encoded = encodeURIComponent(message);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    if (Capacitor.isNativePlatform()) {
      Browser.open({ url: waUrl }).catch(() => { window.location.href = waUrl; });
    } else {
      window.open(waUrl, '_blank');
    }
    if (showToast) showToast('💬 Abrindo WhatsApp...');
  };

  const handleOpenTest = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url: carBrowserUrl });
      } catch (e) {
        window.open(carBrowserUrl, '_blank');
      }
    } else {
      window.open(carBrowserUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn pointer-events-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200 text-gray-900 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-2xl shadow-inner shrink-0">
              🚗
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-white tracking-tight">
                  Navegador do Carro / Multimídia
                </h3>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Público
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Link permanente sem login para acompanhar todos os carros
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer shrink-0"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          
          {/* Key Advantages Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Otimizado para Telas de Carros & Centrais Multimídia</span>
            </div>
            <ul className="text-slate-600 space-y-1.5 pl-6 list-disc text-[11px] sm:text-xs">
              <li><strong>Sem login / sem senha:</strong> abre direto na tela da multimídia ou tablet.</li>
              <li><strong>Todos os carros ao vivo:</strong> Peugeot 208 e Onix Plus monitorados simultaneamente.</li>
              <li><strong>Botão de alternância tátil:</strong> toque na tela para focar no Peugeot, no Onix ou em ambos.</li>
              <li><strong>Modo Tela Cheia:</strong> elimina barras do navegador para parecer um app de fábrica.</li>
            </ul>
          </div>

          {/* Link Box */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">
              Link de Acesso Público:
            </label>
            <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-xl p-1.5">
              <input
                type="text"
                readOnly
                value={carBrowserUrl}
                className="bg-transparent text-xs font-mono font-bold text-blue-700 flex-1 outline-none px-2 select-all truncate"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm ${
                  copied 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                }`}
                title="Copiar link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-gradient-to-b from-gray-50 to-white border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-32 h-32 bg-white rounded-xl p-2 shadow-md border border-gray-200 shrink-0 flex items-center justify-center">
              <img
                src={qrCodeUrl}
                alt="QR Code para Navegador do Carro"
                className="w-full h-full object-contain"
                loading="eager"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 font-bold text-xs text-gray-800">
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>Escanear com a Câmera ou Celular</span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Aponte a câmera do seu celular ou tablet no carro para o QR Code acima para abrir instantaneamente no navegador do painel.
              </p>
              <div className="pt-1">
                <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full inline-block">
                  ?mode=carplay
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4 fill-white" />
              <span>Enviar via WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleOpenTest}
              className="py-3 px-4 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Abrir e Testar Visualização</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>🚗 Link sem expiração para multimídia</span>
          <button
            type="button"
            onClick={onClose}
            className="font-bold text-gray-700 hover:text-gray-900 px-3 py-1 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
