import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Copy, Check, MessageSquare, ExternalLink, QrCode, Download, Car, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { PUBLIC_APP_URL } from '../config';
import { shortenUrl } from '../utils/urlShortener';
import { Vehicle } from '../types';

interface CarBrowserLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles?: Vehicle[];
  showToast?: (msg: string) => void;
}

const NONCES_STORAGE_KEY = 'car_link_nonces_v1';

function loadSavedNonces(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NONCES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}

export default function CarBrowserLinkModal({
  isOpen,
  onClose,
  vehicles = [],
  showToast
}: CarBrowserLinkModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    vehicles.length > 0 ? vehicles[0].id : 'all'
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shortUrls, setShortUrls] = useState<Record<string, string>>({});
  const [isShortening, setIsShortening] = useState<boolean>(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [nonces, setNonces] = useState<Record<string, string>>(loadSavedNonces);

  // Sync selectedTargetId if vehicles list loads or changes
  useEffect(() => {
    if (!isOpen) return;
    if (
      selectedTargetId !== 'all' &&
      !vehicles.some((v) => v.id === selectedTargetId)
    ) {
      setSelectedTargetId(vehicles.length > 0 ? vehicles[0].id : 'all');
    }
  }, [isOpen, vehicles, selectedTargetId]);

  const cleanOrigin = useMemo(() => {
    const isPrivateOrLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('ais-dev-'));
    const origin =
      typeof window !== 'undefined' && !isPrivateOrLocal
        ? window.location.origin
        : PUBLIC_APP_URL;
    return origin.replace(/\/+$/, '');
  }, []);

  const buildRawTargetUrl = useCallback(
    (idKey: string, nonceMap: Record<string, string>): string => {
      const nonce = nonceMap[idKey];
      if (idKey === 'all') {
        return nonce
          ? `${cleanOrigin}/?mode=carplay&r=${encodeURIComponent(nonce)}`
          : `${cleanOrigin}/?mode=carplay`;
      }
      const v = vehicles.find((veh) => veh.id === idKey);
      if (!v) return `${cleanOrigin}/?mode=carplay`;
      const params = new URLSearchParams({
        v: String(v.id || ''),
        imei: String(v.trackerNumber || ''),
        vName: String(v.name || ''),
        vPlate: String(v.licensePlate || '')
      });
      if (nonce) params.set('r', nonce);
      return `${cleanOrigin}/?${params.toString()}`;
    },
    [cleanOrigin, vehicles]
  );

  // Raw URLs for each vehicle and for the full fleet
  const rawTargets = useMemo(() => {
    const map: Record<string, string> = {
      all: buildRawTargetUrl('all', nonces)
    };
    vehicles.forEach((v) => {
      map[v.id] = buildRawTargetUrl(v.id, nonces);
    });
    return map;
  }, [buildRawTargetUrl, vehicles, nonces]);

  // Shorten all target URLs in parallel when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsShortening(true);

    const entries = Object.entries(rawTargets) as Array<[string, string]>;
    Promise.all(
      entries.map(async ([id, raw]) => {
        const shortened = await shortenUrl(raw);
        return [id, shortened || raw] as const;
      })
    )
      .then((results) => {
        if (!active) return;
        const nextMap: Record<string, string> = {};
        results.forEach(([id, url]) => {
          nextMap[id] = url;
        });
        setShortUrls(nextMap);
      })
      .finally(() => {
        if (active) setIsShortening(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, rawTargets]);

  const handleRecreateLink = async (idKey: string, label?: string) => {
    const freshNonce = Math.random().toString(36).substring(2, 7);
    const nextNonces = { ...nonces, [idKey]: freshNonce };
    setNonces(nextNonces);
    try {
      localStorage.setItem(NONCES_STORAGE_KEY, JSON.stringify(nextNonces));
    } catch (e) {}

    setRegeneratingId(idKey);
    const nextRaw = buildRawTargetUrl(idKey, nextNonces);
    try {
      const shortened = await shortenUrl(nextRaw, { forceRefresh: true });
      setShortUrls((prev) => ({ ...prev, [idKey]: shortened || nextRaw }));
      if (showToast) {
        showToast(
          label
            ? `🔄 Novo link criado para "${label}"!`
            : '🔄 Novo link criado com sucesso!'
        );
      }
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRecreateAllLinks = async () => {
    const baseNonce = Math.random().toString(36).substring(2, 6);
    const nextNonces: Record<string, string> = {
      ...nonces,
      all: `${baseNonce}a`
    };
    vehicles.forEach((v, idx) => {
      nextNonces[v.id] = `${baseNonce}${idx}`;
    });
    setNonces(nextNonces);
    try {
      localStorage.setItem(NONCES_STORAGE_KEY, JSON.stringify(nextNonces));
    } catch (e) {}

    setRegeneratingId('__all__');
    setIsShortening(true);
    try {
      const ids = ['all', ...vehicles.map((v) => v.id)];
      const results = await Promise.all(
        ids.map(async (id) => {
          const raw = buildRawTargetUrl(id, nextNonces);
          const shortened = await shortenUrl(raw, { forceRefresh: true });
          return [id, shortened || raw] as const;
        })
      );
      const nextMap: Record<string, string> = {};
      results.forEach(([id, url]) => {
        nextMap[id] = url;
      });
      setShortUrls(nextMap);
      if (showToast) showToast('🔄 Todos os links foram recriados com sucesso!');
    } finally {
      setRegeneratingId(null);
      setIsShortening(false);
    }
  };

  if (!isOpen) return null;

  const selectedVehicle = vehicles.find((v) => v.id === selectedTargetId) || null;
  const activeUrl =
    shortUrls[selectedTargetId] ||
    rawTargets[selectedTargetId] ||
    rawTargets.all;

  const directHtmlHref = selectedVehicle?.trackerNumber
    ? `/multimidia?imei=${encodeURIComponent(String(selectedVehicle.trackerNumber))}`
    : '/multimidia';

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=svg&data=${encodeURIComponent(
    activeUrl
  )}`;

  const copyToClipboard = async (urlToCopy: string, label: string, idKey: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = urlToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedId(idKey);
      if (showToast) showToast(`📋 Link de "${label}" copiado com sucesso!`);
      setTimeout(() => {
        setCopiedId((prev) => (prev === idKey ? null : prev));
      }, 2500);
    } catch {
      if (showToast) showToast('❌ Erro ao copiar link.');
    }
  };

  const sendViaWhatsApp = async (urlToShare: string, targetVehicle: Vehicle | null) => {
    const titleLabel = targetVehicle
      ? `${targetVehicle.name}${targetVehicle.licensePlate ? ` (${targetVehicle.licensePlate})` : ''}`
      : 'Todos os Carros da Frota';

    const message = targetVehicle
      ? `🚗 *Link de Rastreamento — ${titleLabel}*\n\n` +
        `Abra este link no navegador do carro, celular ou central multimídia para acompanhar apenas o veículo *${titleLabel}* em tempo real e sem precisar de senha:\n\n` +
        `${urlToShare}`
      : `🚗 *Link de Rastreamento — Frota Completa*\n\n` +
        `Abra este link no navegador da central multimídia ou tablet para acompanhar todos os veículos da frota ao vivo e sem precisar de senha:\n\n` +
        `${urlToShare}`;

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: `Link — ${titleLabel}`,
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
      Browser.open({ url: waUrl }).catch(() => {
        window.location.href = waUrl;
      });
    } else {
      window.open(waUrl, '_blank');
    }
    if (showToast) showToast('💬 Abrindo WhatsApp...');
  };

  const handleOpenTest = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url: activeUrl });
      } catch {
        window.open(activeUrl, '_blank');
      }
    } else {
      window.open(activeUrl, '_blank');
    }
  };

  const isSelectedRegenerating =
    regeneratingId === selectedTargetId || regeneratingId === '__all__';

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
                  Links por Carro / Multimídia
                </h3>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Público
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Link exclusivo para cada veículo ou para toda a frota
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
          {/* Individual Links List for Every Vehicle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                <Car className="w-4 h-4 text-blue-600" />
                <span>Links Individuais ({vehicles.length})</span>
              </span>
              <div className="flex items-center gap-2">
                {isShortening && (
                  <span className="text-[10px] text-blue-600 font-semibold animate-pulse">
                    Gerando...
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRecreateAllLinks}
                  disabled={regeneratingId !== null}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                  title="Recriar todos os links agora"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${
                      regeneratingId === '__all__' ? 'animate-spin text-blue-600' : ''
                    }`}
                  />
                  <span>Recriar Todos</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {vehicles.map((v) => {
                const vUrl = shortUrls[v.id] || rawTargets[v.id] || '';
                const isSelected = selectedTargetId === v.id;
                const isCopied = copiedId === v.id;
                const isRegen = regeneratingId === v.id || regeneratingId === '__all__';
                const isMoving =
                  v.status === 'Moving' ||
                  v.status === 'IgnitionOn' ||
                  (v.speed || 0) >= 4;
                const isOffline =
                  v.status === 'Offline' || v.status === 'NoBattery';

                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedTargetId(v.id)}
                    className={`rounded-2xl p-2.5 border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                        : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOffline
                              ? 'bg-red-500'
                              : isMoving
                              ? 'bg-blue-500 animate-pulse'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <span className="text-xs font-black text-gray-900 truncate">
                          {v.name}
                        </span>
                        {v.licensePlate && (
                          <span className="text-[10px] font-mono font-bold bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                            {v.licensePlate}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono font-bold text-blue-700 truncate mt-0.5 pl-3.5">
                        {vUrl}
                      </p>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleRecreateLink(v.id, v.name)}
                        disabled={regeneratingId !== null}
                        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
                        title={`Recriar link do ${v.name}`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRegen ? 'animate-spin text-blue-600' : ''}`} />
                      </button>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(vUrl, v.name, v.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                        title={`Copiar link do ${v.name}`}
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => sendViaWhatsApp(vUrl, v)}
                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer"
                        title={`Enviar link do ${v.name} no WhatsApp`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 fill-white" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Option for Full Fleet Link */}
              <div
                onClick={() => setSelectedTargetId('all')}
                className={`rounded-2xl p-2.5 border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  selectedTargetId === 'all'
                    ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                    : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🗺️</span>
                    <span className="text-xs font-black text-gray-900">
                      Todos os Carros (Frota Completa)
                    </span>
                  </div>
                  <p className="text-[11px] font-mono font-bold text-indigo-700 truncate mt-0.5 pl-5">
                    {shortUrls.all || rawTargets.all}
                  </p>
                </div>

                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleRecreateLink('all', 'Todos os Carros')}
                    disabled={regeneratingId !== null}
                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
                    title="Recriar link de toda a frota"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        regeneratingId === 'all' || regeneratingId === '__all__'
                          ? 'animate-spin text-indigo-600'
                          : ''
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        shortUrls.all || rawTargets.all,
                        'Todos os Carros',
                        'all'
                      )
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      copiedId === 'all'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                    title="Copiar link de toda a frota"
                  >
                    {copiedId === 'all' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === 'all' ? 'Copiado' : 'Copiar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      sendViaWhatsApp(shortUrls.all || rawTargets.all, null)
                    }
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer"
                    title="Enviar link de todos os carros no WhatsApp"
                  >
                    <MessageSquare className="w-3.5 h-3.5 fill-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Selected Target QR Code & Link Detail */}
          <div className="bg-gradient-to-b from-gray-50 to-white border border-gray-200 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-gray-700 uppercase tracking-wide truncate">
                QR Code:{' '}
                <span className="text-blue-700">
                  {selectedVehicle ? selectedVehicle.name : 'Todos os Carros'}
                </span>
              </span>
              <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                {activeUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="w-28 h-28 bg-white rounded-xl p-1.5 shadow-md border border-gray-200 shrink-0 flex items-center justify-center">
                <img
                  src={qrCodeUrl}
                  alt="QR Code do Veículo"
                  className="w-full h-full object-contain"
                  loading="eager"
                />
              </div>
              <div className="space-y-2 flex-1 min-w-0 w-full">
                <div className="flex items-center justify-center sm:justify-start gap-1.5 font-bold text-xs text-gray-800">
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  <span>Escanear com a Câmera ou Celular</span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  {selectedVehicle
                    ? `Abre o rastreamento exclusivo do ${selectedVehicle.name} sem senha e direto no mapa.`
                    : 'Abre a tela completa com todos os veículos da frota ao vivo.'}
                </p>
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleRecreateLink(
                        selectedTargetId,
                        selectedVehicle ? selectedVehicle.name : 'Todos os Carros'
                      )
                    }
                    disabled={regeneratingId !== null}
                    className="py-2 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[11px] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                    title="Gerar um novo link para este veículo"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isSelectedRegenerating ? 'animate-spin' : ''}`}
                    />
                    <span>Recriar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => sendViaWhatsApp(activeUrl, selectedVehicle)}
                    className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <MessageSquare className="w-3.5 h-3.5 fill-white" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenTest}
                    className="py-2 px-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Testar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Direct HTML Download Fallback for Car Browsers that block cookies */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2 text-[11px] text-amber-950">
            <p className="font-bold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>A multimídia mostrou "blocking a required security cookie"?</span>
            </p>
            <p className="text-amber-900 leading-relaxed">
              Alguns navegadores nativos de multimídias bloqueiam cookies de segurança. Use o{' '}
              <strong>Google Chrome</strong> na multimídia ou baixe o painel direto{' '}
              {selectedVehicle ? `do ${selectedVehicle.name}` : 'da frota'}:
            </p>
            <a
              href={directHtmlHref}
              download={
                selectedVehicle
                  ? `multimidia-${selectedVehicle.id}.html`
                  : 'multimidia-gps.html'
              }
              className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>
                Baixar Painel Direto (
                {selectedVehicle ? selectedVehicle.name : 'Todos os Carros'})
              </span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>🚗 Clique em qualquer carro acima para ver seu QR Code</span>
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
