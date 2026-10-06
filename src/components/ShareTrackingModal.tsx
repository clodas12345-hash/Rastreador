import React, { useState } from 'react';
import { Vehicle } from '../types';
import { X, Share2, MessageSquare, Phone, Copy, Check, Clock, Link as LinkIcon, ShieldCheck } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { safeSetDoc } from '../utils/firestoreWrapper';
import { db, cleanFirestoreData } from '../lib/firebase';
import { PUBLIC_APP_URL } from '../config';

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

  // Use useMemo to ensure the token and URL are stable while the modal is open
  const { token, publicTrackingUrl } = React.useMemo(() => {
    const t = `tr_${vehicle.id}_${Date.now().toString(36)}`;
    
    // CRITICAL: If on a native platform (APK), origin is 'http://localhost' which cannot be shared.
    // We use the known PUBLIC_APP_URL instead.
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const origin = (typeof window !== 'undefined' && !isLocalhost) ? window.location.origin : PUBLIC_APP_URL;
    const cleanOrigin = origin.replace(/\/+$/, '');
    const cleanPath = (typeof window !== 'undefined' && !isLocalhost) ? (window.location.pathname || '/') : '/';
    const baseUrl = `${cleanOrigin}${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`.replace(/\/+$/, '') + '/';
    
    const params = new URLSearchParams({
      trackToken: t,
      vehicleId: String(vehicle.id || ''),
      imei: String(vehicle.trackerNumber || ''),
      vName: String(vehicle.name || 'Veículo'),
      vPlate: String(vehicle.licensePlate || ''),
      vColor: String(vehicle.color || '#2563eb'),
      vIcon: String(vehicle.iconType || 'car'),
      vLat: String(vehicle.lat || -23.514971),
      vLng: String(vehicle.lng || -46.548199),
      expH: String(expirationHours)
    });
    
    return {
      token: t,
      publicTrackingUrl: `${baseUrl}?${params.toString()}`
    };
  }, [vehicle.id, expirationHours]);

  const formatCleanPhone = (raw: string) => {
    return raw.replace(/[^0-9]/g, '');
  };

  const getFormattedMessage = () => {
    return `🚗 *Acompanhe o veículo ${vehicle.name} em tempo real no mapa*\n\n` +
      `*Veículo:* ${vehicle.name} (${vehicle.licensePlate || 'GRA-2026'})\n` +
      `*Status:* ${vehicle.speed > 0 ? `Em Movimento (${Math.round(vehicle.speed)} km/h)` : 'Parado / Conectado'}\n` +
      `*Link de Acompanhamento:* ${publicTrackingUrl}\n\n` +
      `⏳ _Link exclusivo deste veículo, válido por ${expirationHours} hora(s)._`;
  };

  const handleSaveTokenToCloud = async () => {
    const expMs = Date.now() + (parseInt(expirationHours, 10) * 3600 * 1000);
    const trackingSession = {
      token,
      vehicleId: vehicle.id,
      trackerNumber: vehicle.trackerNumber || '',
      vehicleName: vehicle.name,
      licensePlate: vehicle.licensePlate || '',
      color: vehicle.color || '#2563eb',
      iconType: vehicle.iconType || 'car',
      lat: vehicle.lat || -23.514971,
      lng: vehicle.lng || -46.548199,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expMs).toISOString(),
      expiresTimestamp: expMs,
      active: true
    };

    try {
      safeSetDoc(doc(db, 'tracking_links', token), cleanFirestoreData(trackingSession)).catch(err => {
        console.warn('Silent cloud save fail:', err);
      });
    } catch (e) {
      console.warn('Tracking link cloud save warning:', e);
    }
  };

  const handleSendWhatsApp = async () => {
    setIsGenerating(true);
    await handleSaveTokenToCloud();
    const cleanPhone = formatCleanPhone(recipientPhone);
    const text = getFormattedMessage();
    
    // Native sharing preferred on Android/iOS (only send text to prevent duplicate 2nd link)
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: `Rastreio do ${vehicle.name}`,
          text: text,
          dialogTitle: 'Compartilhar Rastreio ao Vivo'
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
    const text = `Rastreio ao vivo do ${vehicle.name}: ${publicTrackingUrl} (Valido por ${expirationHours}h)`;

    if (Capacitor.isNativePlatform()) {
       try {
         await Share.share({
           title: `Rastreio do ${vehicle.name}`,
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
    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url: publicTrackingUrl });
      } catch (e) {
        window.open(publicTrackingUrl, '_blank');
      }
    } else {
      window.open(publicTrackingUrl, '_blank');
    }
  };

  const handleCopyLink = async () => {
    setIsGenerating(true);
    await handleSaveTokenToCloud();
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(publicTrackingUrl);
        setCopied(true);
        if (showToast) showToast('📋 Link de rastreio copiado!');
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = publicTrackingUrl;
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

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn pointer-events-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 border border-gray-200 text-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl text-xl font-bold">
              🔗
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900">
                Compartilhar Rastreio ao Vivo
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Envie o mapa exclusivo deste veículo em tempo real
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

        {/* Vehicle Summary Pill */}
        <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🚘</span>
            <div>
              <strong className="block text-xs font-black text-gray-900">{vehicle.name}</strong>
              <span className="text-[10px] text-emerald-800 font-mono font-bold">{vehicle.licensePlate || 'Sem placa'}</span>
            </div>
          </div>
          <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2.5 py-1 rounded-full shadow-xs">
            Ao Vivo 🟢
          </span>
        </div>

        <div className="space-y-3">
          {/* Expiration Hours Selector */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              Validade Temporária do Link:
            </label>
            <select
              value={expirationHours}
              onChange={(e) => setExpirationHours(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl p-2.5 text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
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
                onClick={handleCopyLink}
                className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                title="Copiar link para a área de transferência"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* Action Buttons: WhatsApp, SMS & Test Open */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isGenerating}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4 fill-white" />
              <span>Enviar Rastreio via WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleSendSMS}
              disabled={isGenerating}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold text-xs rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              <span>Enviar Rastreio via SMS</span>
            </button>

            <button
              type="button"
              onClick={handleOpenLinkInBrowser}
              className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-200"
            >
              <LinkIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Abrir e Testar Visualização do Link</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
