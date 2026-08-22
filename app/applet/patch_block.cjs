const fs = require('fs');

// 1. Patch src/App.tsx
let appCode = fs.readFileSync('src/App.tsx', 'utf8');

const oldBlockBtn = `                        <button
                          type="button"
                          onClick={(e) => { 
                            e.preventDefault(); e.stopPropagation();
                            const identifier = editingVehicle.name || editingVehicle.trackerNumber || editingVehicle.phoneNumber || 'Dispositivo';
                            const isOfflineOrOff = editingVehicle.status === 'NoBattery' || editingVehicle.status === 'Offline';
                            if (isOfflineOrOff) {
                              const newQueue = [...(editingVehicle.commandQueue || []), { id: Date.now().toString(), name: 'Bloquear Aparelho', timestamp: new Date().toLocaleTimeString() }];
                              const updated = { ...editingVehicle, commandQueue: newQueue };
                              setEditingVehicle(updated);
                              handleUpdateVehicle(updated);
                              addNotification({
                                title: '⏳ Comando Enfileirado: Bloquear Aparelho',
                                message: \`O dispositivo \${identifier} está offline. Comando adicionado à fila de espera.\`,
                                type: 'command',
                                severity: 'warning',
                                vehicleName: identifier
                              });
                              showToast(\`⏳ Comando [Bloquear Aparelho] adicionado à Fila de Espera (\${identifier}).\`);
                            } else {
                              const updated = {...editingVehicle, status: 'Offline' as const};
                              setEditingVehicle(updated);
                              handleUpdateVehicle(updated);
                              addNotification({
                                title: '🔒 Comando Executado: Bloquear Aparelho',
                                message: \`Bloqueio remoto total ativado com sucesso para \${identifier}.\`,
                                type: 'command',
                                severity: 'critical',
                                vehicleName: identifier
                              });
                              showToast(\`🔒 Comando [BLOQUEAR APARELHO] executado com sucesso para (\${identifier})!\`);
                            }
                          }}
                          className="text-xs bg-amber-600 hover:bg-amber-700 active:scale-95 text-white py-2.5 px-3 rounded-lg font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          🔒 Bloquear Aparelho
                        </button>`;

const newBlockBtn = `                        <button
                          type="button"
                          onClick={(e) => { 
                            e.preventDefault(); e.stopPropagation();
                            const identifier = editingVehicle.name || editingVehicle.trackerNumber || editingVehicle.phoneNumber || 'Dispositivo';
                            const isBlocked = editingVehicle.status === 'Offline';
                            if (isBlocked) {
                              const updated = { ...editingVehicle, status: 'IgnitionOn' as const, commandQueue: [] };
                              setEditingVehicle(updated);
                              handleUpdateVehicle(updated);
                              addNotification({
                                title: '🔓 Comando Executado: Desbloquear Aparelho',
                                message: \`Desbloqueio remoto executado com sucesso para \${identifier}. O veículo está liberado.\`,
                                type: 'command',
                                severity: 'info',
                                vehicleName: identifier
                              });
                              showToast(\`🔓 Comando [DESBLOQUEAR APARELHO] executado com sucesso para (\${identifier})!\`);
                              try {
                                window.alert(\`O status de \${identifier} foi alterado para Online / Desbloqueado.\`);
                              } catch(err) {}
                            } else {
                              const updated = { ...editingVehicle, status: 'Offline' as const };
                              setEditingVehicle(updated);
                              handleUpdateVehicle(updated);
                              addNotification({
                                title: '🔒 Comando Executado: Bloquear Aparelho',
                                message: \`Bloqueio remoto total ativado com sucesso para \${identifier}.\`,
                                type: 'command',
                                severity: 'critical',
                                vehicleName: identifier
                              });
                              showToast(\`🔒 Comando [BLOQUEAR APARELHO] executado com sucesso para (\${identifier})!\`);
                              try {
                                window.alert(\`O status de \${identifier} foi alterado para Bloqueado (Offline / Corte de combustível).\`);
                              } catch(err) {}
                            }
                          }}
                          className={\`text-xs active:scale-95 text-white py-2.5 px-3 rounded-lg font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer \${
                            editingVehicle.status === 'Offline' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                          }\`}
                        >
                          {editingVehicle.status === 'Offline' ? '🔓 Desbloquear Aparelho' : '🔒 Bloquear Aparelho'}
                        </button>`;

if (appCode.includes(oldBlockBtn)) {
  appCode = appCode.replace(oldBlockBtn, newBlockBtn);
  fs.writeFileSync('src/App.tsx', appCode);
  console.log('Successfully patched App.tsx');
} else {
  console.log('Warning: oldBlockBtn exact string not found in App.tsx');
}

// 2. Patch src/components/TerminalTools.tsx
let termCode = fs.readFileSync('src/components/TerminalTools.tsx', 'utf8');

const oldTermBlock = `                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isOfflineOrOff = v.status === 'NoBattery' || v.status === 'Offline';
                        if (isOfflineOrOff) {
                          const newQueue = [...(v.commandQueue || []), { id: Date.now().toString(), name: 'Bloquear Aparelho', timestamp: new Date().toLocaleTimeString() }];
                          handleUpdateVehicle({ ...v, commandQueue: newQueue });
                          if (addNotification) addNotification({ title: '⏳ Comando Enfileirado', message: \`\${identifier} offline. Comando Bloquear Aparelho na fila.\`, type: 'command', severity: 'warning', vehicleName: identifier });
                          if (showToast) showToast('⏳ Comando na fila de espera.');
                        } else {
                          handleUpdateVehicle({ ...v, status: 'Offline' });
                          if (addNotification) addNotification({ title: '🔒 Comando Executado', message: \`Bloqueio ativado para \${identifier}.\`, type: 'command', severity: 'critical', vehicleName: identifier });
                          if (showToast) showToast('🔒 Comando registrado.');
                        }
                      }}
                      className="bg-slate-800 hover:bg-slate-900 text-white py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      🔒 Bloquear
                    </button>`;

const newTermBlock = `                    <button
                      type="button"
                      onClick={() => {
                        const v = vehicles.find(v => v.id === selectedVehicleId);
                        if (!v || !handleUpdateVehicle) return;
                        const identifier = v.name || v.trackerNumber || v.phoneNumber || 'Dispositivo';
                        const isBlocked = v.status === 'Offline';
                        if (isBlocked) {
                          handleUpdateVehicle({ ...v, status: 'IgnitionOn', commandQueue: [] });
                          if (addNotification) addNotification({ title: '🔓 Comando Executado', message: \`Desbloqueio ativado para \${identifier}.\`, type: 'command', severity: 'info', vehicleName: identifier });
                          if (showToast) showToast('🔓 Desbloqueio executado com sucesso.');
                        } else {
                          handleUpdateVehicle({ ...v, status: 'Offline' });
                          if (addNotification) addNotification({ title: '🔒 Comando Executado', message: \`Bloqueio ativado para \${identifier}.\`, type: 'command', severity: 'critical', vehicleName: identifier });
                          if (showToast) showToast('🔒 Bloqueio executado com sucesso.');
                        }
                      }}
                      className={\`py-3 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all text-white \${
                        vehicles.find(v => v.id === selectedVehicleId)?.status === 'Offline' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'
                      }\`}
                    >
                      {vehicles.find(v => v.id === selectedVehicleId)?.status === 'Offline' ? '🔓 Desbloquear' : '🔒 Bloquear'}
                    </button>`;

if (termCode.includes(oldTermBlock)) {
  termCode = termCode.replace(oldTermBlock, newTermBlock);
  fs.writeFileSync('src/components/TerminalTools.tsx', termCode);
  console.log('Successfully patched TerminalTools.tsx');
} else {
  console.log('Warning: oldTermBlock exact string not found in TerminalTools.tsx');
}
