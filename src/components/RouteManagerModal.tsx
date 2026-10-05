import React, { useState, useEffect } from 'react';
import { collection, doc } from 'firebase/firestore';
import { safeAddDoc, safeDeleteDoc, safeOnSnapshot } from '../utils/firestoreWrapper';
import { db, handleFirestoreError, OperationType, cleanFirestoreData, isFirestoreEnabled } from '../lib/firebase';
import { SavedRoute, Vehicle, RoutePoint } from '../types';
import { Route, Play, Pause, Trash2, Eye, Plus, X, Save, Navigation, Clock, Check, RefreshCw } from 'lucide-react';

interface RouteManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  recordingPoints: RoutePoint[];
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSelectRouteForMap: (route: SavedRoute | null) => void;
  onStartPlayback: (route: SavedRoute) => void;
  onStopPlayback: () => void;
  isPlayingPlayback: boolean;
  activeRoute: SavedRoute | null;
}

export default function RouteManagerModal({
  isOpen,
  onClose,
  vehicles,
  recordingPoints,
  isRecording,
  onStartRecording,
  onStopRecording,
  onSelectRouteForMap,
  onStartPlayback,
  onStopPlayback,
  isPlayingPlayback,
  activeRoute
}: RouteManagerModalProps) {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(isFirestoreEnabled);
  const [activeTab, setActiveTab] = useState<'lista' | 'novo'>('lista');

  // Form state for saving a new route
  const [routeName, setRouteName] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles[0]?.id || '');
  const [routeNotes, setRouteNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!isFirestoreEnabled) {
      setLoading(false);
      return;
    }
    const unsubscribe = safeOnSnapshot(collection(db, 'trajetos'), (snapshot) => {
      const list: SavedRoute[] = snapshot.docs.map((docSnap: any) => ({
        id: docSnap.id,
        ...docSnap.data()
      } as SavedRoute));
      setRoutes(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'trajetos');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen]);

  // Set default vehicle ID if available
  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles]);

  if (!isOpen) return null;

  // Calculate distance in km from route points
  const calculateDistance = (pts: RoutePoint[]): number => {
    if (!pts || pts.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const R = 6371; // Earth radius in km
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLng = (p2.lng - p1.lng) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += R * c;
    }
    return Number(total.toFixed(2));
  };

  // Helper to generate simulated sample points if user didn't record live points
  const generateSimulatedPoints = (v: Vehicle | undefined): RoutePoint[] => {
    const baseLat = v ? v.lat : -23.5505;
    const baseLng = v ? v.lng : -46.6333;
    const pts: RoutePoint[] = [];
    const count = 12;
    let currentLat = baseLat;
    let currentLng = baseLng;

    for (let i = 0; i < count; i++) {
      currentLat += (Math.random() - 0.2) * 0.004;
      currentLng += (Math.random() - 0.2) * 0.004;
      pts.push({
        lat: Number(currentLat.toFixed(6)),
        lng: Number(currentLng.toFixed(6)),
        speed: Math.floor(20 + Math.random() * 50),
        timestamp: new Date(Date.now() - (count - i) * 60000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });
    }
    return pts;
  };

  const handleSaveRoute = async () => {
    if (!routeName.trim()) {
      setErrorMsg('Por favor, informe um nome para o trajeto.');
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }

    setSaving(true);
    try {
      const matchedVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];
      
      // Use recorded points if available, otherwise generate simulated route points
      let pointsToSave = recordingPoints.length >= 2 ? recordingPoints : generateSimulatedPoints(matchedVehicle);
      let calculatedDist = calculateDistance(pointsToSave);
      if (calculatedDist === 0) calculatedDist = 4.2;

      const newRoute = {
        name: routeName.trim(),
        vehicleId: matchedVehicle ? matchedVehicle.id : 'v1',
        vehicleName: matchedVehicle ? `${matchedVehicle.name} (${matchedVehicle.licensePlate || 'Sem placa'})` : 'Veículo Geral',
        distanceKm: calculatedDist,
        createdAt: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        points: pointsToSave,
        notes: routeNotes.trim()
      };

      const cleanedRoute = cleanFirestoreData(newRoute);
      await safeAddDoc(collection(db, 'trajetos'), cleanedRoute);
      setSuccessMsg('Trajeto salvo com sucesso no Firestore!');
      setRouteName('');
      setRouteNotes('');
      if (isRecording) onStopRecording();

      setTimeout(() => {
        setSuccessMsg('');
        setActiveTab('lista');
      }, 1500);
    } catch (error) {
      console.error('Erro ao salvar trajeto:', error);
      handleFirestoreError(error, OperationType.WRITE, 'trajetos');
      setErrorMsg('Erro ao salvar o trajeto no banco de dados.'); setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoute = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    try {
      await safeDeleteDoc(doc(db, 'trajetos', id));
      if (activeRoute?.id === id) {
        onSelectRouteForMap(null);
      }
    } catch (error) {
      console.error('Erro ao excluir trajeto:', error);
      handleFirestoreError(error, OperationType.DELETE, `trajetos/${id}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600">
              <Route className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">Gerenciador de Trajetos</h3>
              <p className="text-xs text-gray-500">Grave, salve e visualize trajetos e históricos de deslocamento GPS</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-white px-6 pt-3 gap-4">
          <button
            onClick={() => setActiveTab('lista')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'lista'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Route className="w-4 h-4" />
            Trajetos Salvos ({routes.length})
          </button>
          <button
            onClick={() => setActiveTab('novo')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'novo'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            Salvar Novo Trajeto
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-grow bg-gray-50">
          {activeTab === 'lista' && (
            <div className="space-y-4">
              {/* Quick Record Control Bar */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    {isRecording && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${isRecording ? 'bg-red-500' : 'bg-gray-400'}`}></span>
                  </span>
                  <div>
                    <span className="block font-bold text-sm text-gray-800">
                      {isRecording ? 'Gravação de Trajeto em Andamento' : 'Gravação de Trajeto Parada'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {isRecording
                        ? `${recordingPoints.length} pontos de GPS capturados`
                        : 'Inicie a gravação para registrar o deslocamento em tempo real'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isRecording ? (
                    <button
                      onClick={onStartRecording}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Navigation className="w-4 h-4" />
                      Iniciar Gravação
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={onStopRecording}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('novo');
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        Salvar Gravado ({recordingPoints.length})
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Routes List */}
              {loading ? (
                <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span>Carregando trajetos salvos...</span>
                </div>
              ) : routes.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center border border-dashed border-gray-300">
                  <Route className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h4 className="font-bold text-gray-700 mb-1">Nenhum trajeto salvo encontrado</h4>
                  <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
                    Você pode gravar um percurso ao vivo ou clicar no botão abaixo para criar e salvar um trajeto.
                  </p>
                  <button
                    onClick={() => setActiveTab('novo')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Criar / Salvar Trajeto
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {routes.map(r => {
                    const isSelected = activeRoute?.id === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`bg-white p-4 rounded-xl border transition-all ${
                          isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300 shadow-sm'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-gray-800 text-base">{r.name}</h4>
                              {isSelected && (
                                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  Ativo no Mapa
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
                              {r.createdAt} • {r.vehicleName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                onSelectRouteForMap(r);
                                onClose();
                              }}
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Exibir no Mapa
                            </button>

                            <button
                              onClick={() => {
                                if (isPlayingPlayback && isSelected) {
                                  onStopPlayback();
                                } else {
                                  onStartPlayback(r);
                                  onClose();
                                }
                              }}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                                isPlayingPlayback && isSelected
                                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                  : 'bg-green-50 hover:bg-green-100 text-green-700'
                              }`}
                            >
                              {isPlayingPlayback && isSelected ? (
                                <>
                                  <Pause className="w-3.5 h-3.5" /> Pausar
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5" /> Reproduzir
                                </>
                              )}
                            </button>

                            <button
                              onClick={(e) => handleDeleteRoute(r.id, e)}
                              className={`p-1.5 rounded-lg transition-colors ${deleteConfirmId === r.id ? 'text-red-600 bg-red-100' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                              title={deleteConfirmId === r.id ? "Confirmar Exclusão" : "Excluir Trajeto"}
                            >
                              {deleteConfirmId === r.id ? <span className="text-xs font-bold px-1">Excluir?</span> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-gray-600 pt-2 border-t border-gray-100">
                          <div>
                            <span className="text-gray-400">Distância: </span>
                            <span className="font-bold text-gray-800">{r.distanceKm} km</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Pontos GPS: </span>
                            <span className="font-bold text-gray-800">{r.points?.length || 0}</span>
                          </div>
                          {r.notes && (
                            <div className="truncate max-w-xs text-gray-500 italic">
                              "{r.notes}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'novo' && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-5">
              {successMsg && (
                <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-lg text-sm flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nome do Trajeto *
                </label>
                <input
                  type="text"
                  value={routeName}
                  onChange={e => setRouteName(e.target.value)}
                  placeholder="Ex: Entrega Zona Sul - Turno Manhã"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Veículo Associado
                  </label>
                  <select
                    value={selectedVehicleId}
                    onChange={e => setSelectedVehicleId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.licensePlate ? `(${v.licensePlate})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Origem dos Pontos
                  </label>
                  <div className="p-2.5 border border-gray-200 bg-gray-50 rounded-lg text-xs text-gray-700 font-medium flex items-center justify-between">
                    <span>
                      {recordingPoints.length >= 2
                        ? `✅ ${recordingPoints.length} pontos gravados do GPS`
                        : '⚡ Simulação automática de rota (12 pontos GPS)'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Observações / Detalhes
                </label>
                <textarea
                  value={routeNotes}
                  onChange={e => setRouteNotes(e.target.value)}
                  rows={3}
                  placeholder="Ex: Rota com parada no cliente A e posto de combustível..."
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('lista')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveRoute}
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando no Firestore...' : 'Confirmar e Salvar Trajeto'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
