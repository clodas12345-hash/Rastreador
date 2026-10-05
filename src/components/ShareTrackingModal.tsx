import React, { useState } from 'react';
import { Vehicle } from '../types';
import { X, Share2, MessageSquare, Phone, Copy, Check, Clock, Link as LinkIcon, ShieldCheck } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { safeSetDoc } from '../utils/firestoreWrapper';
import { db, cleanFirestoreData } from '../lib/firebase';

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

  // Generates a unique tracking token and individual URL for this specific vehicle
  const token = `tr_${vehicle.id}_${Date.now().toString(36)}`;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://aistudio.google.com';
  const queryParams = new URLSearchParams({
    trackToken: token,
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
  const publicTrackingUrl = `${baseUrl}?${queryParams.toString()}`;

  const formatCleanPhone = (raw: string) => {
    return raw.replace(/[^0-9]/g, '');
  };

  const getFormattedMessage = () => {
    return `🚗 *Acompanhe o veículo ${vehicle.name} em tempo real no mapa*\n\n` +
      `*Veículo:* ${vehicle.name} (${vehicle.licensePlate || 'GRA-2026'})\n` +
      `*Status:* ${vehicle.speed > 0 ? `Em Movimento (${Math.round(vehicle.speed)} km/h)` : 'Parado / Conectado'}\n` +
      `*Link Individual de Rastreio Vivo:* ${publicTrackingUrl}\n\n` +
      `⏳ _Link exclusivo deste veículo, válido pelas próximas ${expirationHours} hora(s)._`;
  };

  const handleSaveTokenToCloud = async () => {
    setIsGenerating(true);
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
      await safeSetDoc(doc(db, 'tracking_links', token), cleanFirestoreData(trackingSession));
    } catch (e) {
      console.warn('Tracking link cloud save warning:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendWhatsApp = async () => {
    await handleSaveTokenToCloud();
    const cleanPhone = formatCleanPhone(recipientPhone);
    const text = encodeURIComponent(getFormattedMessage());
    
    let waUrl = '';
    if (cleanPhone && cleanPhone.length >= 8) {
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      waUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${text}`;
    } else {
      waUrl = `https://api.whatsapp.com/send?text=${text}`;
    }

    window.open(waUrl, '_blank');
    if (showToast) showToast('💬 Abrindo WhatsApp para envio do link de rastreio...');
    onClose();
  };

  const handleSendSMS = async () => {
    await handleSaveTokenToCloud();
    const cleanPhone = formatCleanPhone(recipientPhone);
    const text = encodeURIComponent(
      `Rastreio ao vivo do ${vehicle.name}: ${publicTrackingUrl} (Valido por ${expirationHours}h)`
    );

    let smsUrl = '';
    if (cleanPhone) {
      smsUrl = `sms:${cleanPhone}?body=${text}`;
    } else {
      smsUrl = `sms:?body=${text}`;
    }

    window.location.href = smsUrl;
    if (showToast) showToast('📱 Abrindo aplicativo de SMS para envio...');
    onClose();
  };

  const handleCopyLink = async () => {
    await handleSaveTokenToCloud();
    try {
      await navigator.clipboard.writeText(publicTrackingUrl);
      setCopied(true);
      if (showToast) showToast('📋 Link de rastreio ao vivo copiado!');
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      if (showToast) showToast('📋 Link copiado com sucesso!');
    }
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
                Envie o mapa em tempo real por WhatsApp ou SMS
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
        <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl mb-4 flex items-center justify-between">
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

        <div className="space-y-4">
          {/* Recipient Phone (Optional) */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              Telefone do Destinatário (Opcional):
            </label>
            <input
              type="text"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="Ex: 11987654321 (ou deixe em branco)"
              className="w-full bg-gray-50 border border-gray-200 font-mono text-xs rounded-xl p-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
            />
          </div>

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

          {/* Action Buttons: WhatsApp & SMS */}
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
              onClick={handleCopyLink}
              disabled={isGenerating}
              className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-gray-200"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-gray-600" />}
              <span>{copied ? 'Link Copiado!' : 'Copiar Link de Rastreio'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
