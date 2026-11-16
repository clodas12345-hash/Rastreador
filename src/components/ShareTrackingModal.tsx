import React, { useState } from 'react';
import { Vehicle } from '../types';
import { X, Share2, MessageSquare, Phone, Copy, Check, Clock, Link as LinkIcon, ShieldCheck, RefreshCw } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { safeSetDoc } from '../utils/firestoreWrapper';
import { db, cleanFirestoreData } from '../lib/firebase';
import { PUBLIC_APP_URL } from '../config';
import { getVehicleDynamicColor } from '../utils/vehicleColors';
import { shortenUrl } from '../utils/urlShortener';

interface ShareTrackingModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export default function ShareTrackingModal({
  vehicle,
  onClose,
  showToast
}: ShareTrackingModalProps) {
  const [recipientPhone, setRecipientPhone] = useState('');
  const [expirationHours, setExpirationHours] = useState('2');
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'individual' | 'car'>('individual');

  const [regenCounter, setRegenCounter] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const token = React.useMemo(() => {
    const rand = Math.random().toString(36).substring(2, 7);
    return rand.padEnd(5, '0');
  }, [vehicle.id, regenCounter]);

  const { rawTrackingUrl, rawCarBrowserUrl } = React.useMemo(() => {
    // CRITICAL: Never share localhost (APK) or private ais-dev- preview URLs externally.
    // Always use PUBLIC_APP_URL when running in dev preview or native container.
    const isPrivateOrLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('ais-dev-'));
    const origin = (typeof window !== 'undefined' && !isPrivateOrLocal) ? window.location.origin : PUBLIC_APP_URL;
    const cleanOrigin = origin.replace(/\/+$/, '');

    const params = new URLSearchParams({
      trackToken: token,
      vehicleId: String(vehicle.id || ''),
      imei: String(vehicle.trackerNumber || '')
    });

    const carParams = new URLSearchParams({
      v: String(vehicle.id || ''),
      imei: String(vehicle.trackerNumber || ''),
      vName: String(vehicle.name || ''),
      vPlate: String(vehicle.licensePlate || '')
    });
    if (regenCounter > 0) {
      carParams.set('r', token);
    }

    return {
      rawTrackingUrl: `${cleanOrigin}/?${params.toString()}`,
      rawCarBrowserUrl: `${cleanOrigin}/?${carParams.toString()}`
    };
  }, [token, vehicle.id, vehicle.trackerNumber, vehicle.name, vehicle.licensePlate, regenCounter]);

  const [publicTrackingUrl, setPublicTrackingUrl] = useState<string>(rawTrackingUrl);
  const [carBrowserUrl, setCarBrowserUrl] = useState<string>(rawCarBrowserUrl);

  React.useEffect(() => {
    let active = true;
    const force = regenCounter > 0;
    Promise.all([
      shortenUrl(rawTrackingUrl, { forceRefresh: force }).then((u) => {
        if (active && u) setPublicTrackingUrl(u);
      }),
      shortenUrl(rawCarBrowserUrl, { forceRefresh: force }).then((u) => {
        if (active && u) setCarBrowserUrl(u);
      })
    ]).finally(() => {
      if (active) setIsRegenerating(false);
    });
    return () => { active = false; };
  }, [rawTrackingUrl, rawCarBrowserUrl, regenCounter]);

  const handleRecreateLink = () => {
    setIsRegenerating(true);
    setRegenCounter((c) => c + 1);
    if (showToast) showToast('🔄 Recriando novo link...');
  };

  const activeUrl = activeTab === 'car' ? carBrowserUrl : publicTrackingUrl;

  const formatCleanPhone = (raw: string) => {
    return raw.replace(/[^0-9]/g, '');
  };

  const getFormattedMessage = () => {
    if (activeTab === 'car') {
      return `🚗 *Link Permanente — ${vehicle.name} (${vehicle.licensePlate || 'Rastreamento'})*\n\n` +
        `Abra este link no navegador do carro, celular ou central multimídia para acompanhar o *${vehicle.name}* em tempo real, sem expiração e sem login:\n\n` +
        `${carBrowserUrl}`;
    }
    return `🚗 Acompanhe o veículo ${vehicle.name} em tempo real no mapa:\n\n` +
      `Veículo: ${vehicle.name} (${vehicle.licensePlate || 'GRA-2026'})\n` +
      `Status: ${vehicle.speed > 0 ? `Em Movimento (${Math.round(vehicle.speed)} km/h)` : 'Parado / Conectado'}\n\n` +
      `Link de Acompanhamento:\n${publicTrackingUrl}\n\n` +
      `⏳ Válido por ${expirationHours} hora(s).`;
  };

  const handleSaveTokenToCloud = React.useCallback(async () => {
    if (activeTab === 'car') return; // Car browser link needs no temporary token
    const expMs = Date.now() + (parseInt(expirationHours, 10) * 3600 * 1000);
    const trackingSession = {
      token,
      vehicleId: vehicle.id,
      trackerNumber: vehicle.trackerNumber || '',
      vehicleName: vehicle.name,
      licensePlate: vehicle.licensePlate || '',
      color: getVehicleDynamicColor(vehicle),
      iconType: vehicle.iconType || 'car',
      lat: vehicle.lat || -23.514971,
      lng: vehicle.lng || -46.548199,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expMs).toISOString(),
      expiresTimestamp: expMs,
      active: true
    };

    try {
      await safeSetDoc(doc(db, 'tracking_links', token), cleanFirestoreData(trackingSession));
    } catch (e) {
      console.warn('Tracking link cloud save warning:', e);
    }
  }, [activeTab, expirationHours, token, vehicle]);

  React.useEffect(() => {
    handleSaveTokenToCloud();
  }, [handleSaveTokenToCloud]);

  const handleSendWhatsApp = async () => {
    setIsGenerating(true);
    await handleSaveTokenToCloud();
    const cleanPhone = formatCleanPhone(recipientPhone);
    const text = getFormattedMessage();
    
    // Native sharing preferred on Android/iOS (only send text to prevent duplicate 2nd link)
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: activeTab === 'car' ? 'Link para Multimídia do Carro' : `Rastreio do ${vehicle.name}`,
          text: text,
          dialogTitle: 'Compartilhar Link ao Vivo'
        });
        if (showToast) showToast('✅ Abrindo menu de compartilhamento...');
        setIsGenerating(false);
        onClose();
        return;
      } catch (e) {
        console.warn('Native share failed, falling back to URL', e);
      }
    }

    // Web Fallback
    const encodedText = encodeURIComponent(text);
    let waUrl = '';
    if (cleanPhone && cleanPhone.length >= 8) {
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      waUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;
    } else {
      waUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
    }

    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: waUrl });
      } else {
        window.open(waUrl, '_blank');
      }
      if (showToast) showToast('💬 Abrindo WhatsApp...');
    } catch (e) {
      window.location.href = waUrl;
    }
    
    setIsGenerating(false);
    onClose();
  };

  const handleSendSMS = async () => {
    setIsGenerating(true);
    await handleSaveTokenToCloud();
    const cleanPhone = formatCleanPhone(recipientPhone);
    const text = activeTab === 'car'
      ? `Acompanhe os carros na multimídia: ${carBrowserUrl}`
      : `Rastreio ao vivo do ${vehicle.name}: ${publicTrackingUrl} (Valido por ${expirationHours}h)`;

    if (Capacitor.isNativePlatform()) {
       try {
         await Share.share({
           title: activeTab === 'car' ? 'Link para Multimídia' : `Rastreio do ${vehicle.name}`,
           text: text
         });
         setIsGenerating(false);
         onClose();
         return;
       } catch (e) {}
    }

    const encodedText = encodeURIComponent(text);
    let smsUrl = '';
    if (cleanPhone) {
      smsUrl = `sms:${cleanPhone}?body=${encodedText}`;
    } else {
      smsUrl = `sms:?body=${encodedText}`;
    }

    window.location.href = smsUrl;
    if (showToast) showToast('📱 Abrindo SMS...');
    setIsGenerating(false);
    onClose();
  };

  const handleOpenLinkInBrowser = async () => {
    await handleSaveTokenToCloud();
    const targetUrl = activeUrl;
    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url: targetUrl });
      } catch (e) {
        window.open(targetUrl, '_blank');
      }
    } else {
      window.open(targetUrl, '_blank');
    }
  };

  const handleCopyLink = async () => {
    setIsGenerating(true);
    await handleSaveTokenToCloud();
    const targetUrl = activeUrl;
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(targetUrl);
        setCopied(true);
        if (showToast) showToast(activeTab === 'car' ? '📋 Link do Carro copiado!' : '📋 Link de rastreio copiado!');
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = targetUrl;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        if (showToast) showToast('📋 Link copiado!');
      } catch (err) {
        if (showToast) showToast('❌ Erro ao copiar. Tente selecionar manualmente.');
      }
      document.body.removeChild(textArea);
    }
    
    setIsGenerating(false);
    setTimeout(() => setCopied(false), 3000);
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=svg&data=${encodeURIComponent(activeUrl)}`;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn pointer-events-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 border border-gray-200 text-gray-900 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-2xl text-xl font-bold">
              🔗
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900">
                Compartilhar Rastreamento
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Links públicos em tempo real para web e multimídia
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Individual vs Car Browser */}
        <div className="grid grid-cols-2 bg-gray-100 p-1 rounded-2xl mb-3 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('individual')}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'individual'
                ? 'bg-white shadow text-gray-900 ring-1 ring-gray-200'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>🚘</span>
            <span className="truncate">{vehicle.name}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('car')}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'car'
                ? 'bg-slate-900 text-white shadow ring-2 ring-blue-500/40'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>🚗</span>
            <span className="truncate">Navegador do Carro</span>
          </button>
        </div>

        {activeTab === 'car' ? (
          /* Car Browser / Multimídia Mode */
          <div className="space-y-3 animate-fadeIn">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-3 rounded-2xl shadow-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black flex items-center gap-1.5 text-white">
                  🚗 Modo Central Multimídia / Painel
                </span>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Sem Senha
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                Link público permanente e exclusivo do <strong>{vehicle.name}</strong>, sem expiração e sem senha.
              </p>
            </div>

            {/* Generated Link Input with Copy */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Link da Multimídia:
              </label>
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-1.5">
                <input
                  type="text"
                  readOnly
                  value={carBrowserUrl}
                  className="bg-transparent text-[11px] font-mono font-bold text-blue-700 flex-1 outline-none px-2 truncate select-all"
                />
                <button
                  type="button"
                  onClick={handleRecreateLink}
                  disabled={isRegenerating}
                  className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  title="Recriar novo link"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                  title="Copiar link do carro"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-20 h-20 bg-white p-1 rounded-xl shadow border border-gray-200 shrink-0 flex items-center justify-center">
                <img src={qrCodeUrl} alt="QR Code" className="w-full h-full object-contain" />
              </div>
              <div className="text-xs space-y-1">
                <strong className="text-gray-900 block font-bold text-[11px]">Escanear no Carro:</strong>
                <p className="text-[10px] text-gray-600 leading-tight">
                  Aponte a câmera do celular ou tablet para abrir direto no navegador veicular.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4 fill-white" />
                <span>Enviar Link da Multimídia no WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleOpenLinkInBrowser}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-300"
              >
                <LinkIcon className="w-3.5 h-3.5 text-slate-600" />
                <span>Testar Visualização na Web</span>
              </button>
            </div>
          </div>
        ) : (
          /* Individual Vehicle Mode */
          <div className="space-y-3 animate-fadeIn">
            {/* Vehicle Summary Pill */}
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚘</span>
                <div>
                  <strong className="block text-xs font-black text-gray-900">{vehicle.name}</strong>
                  <span className="text-[10px] text-emerald-800 font-mono font-bold">{vehicle.licensePlate || 'Sem placa'}</span>
                </div>
              </div>
              <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-xs">
                Ao Vivo 🟢
              </span>
            </div>

            {/* Expiration Hours Selector */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Validade Temporária do Link:
              </label>
              <select
                value={expirationHours}
                onChange={(e) => setExpirationHours(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2 text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="1">⏱️ Válido por 1 hora</option>
                <option value="2">⏱️ Válido por 2 horas (Recomendado)</option>
                <option value="4">⏱️ Válido por 4 horas</option>
                <option value="8">⏱️ Válido por 8 horas (Turno Completo)</option>
                <option value="24">⏱️ Válido por 24 horas</option>
              </select>
            </div>

            {/* Generated Link Input with Copy */}
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Link Gerado:
              </label>
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-1.5">
                <input
                  type="text"
                  readOnly
                  value={publicTrackingUrl}
                  className="bg-transparent text-[11px] font-mono font-medium text-gray-600 flex-1 outline-none px-2 truncate select-all"
                />
                <button
                  type="button"
                  onClick={handleRecreateLink}
                  disabled={isRegenerating}
                  className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  title="Recriar novo link"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                  title="Copiar link"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Action Buttons: WhatsApp, SMS & Test Open */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={isGenerating}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4 fill-white" />
                <span>Enviar Rastreio via WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleSendSMS}
                disabled={isGenerating}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                <span>Enviar Rastreio via SMS</span>
              </button>

              <button
                type="button"
                onClick={handleOpenLinkInBrowser}
                className="w-full py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-200"
              >
                <LinkIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Abrir e Testar Visualização do Link</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
