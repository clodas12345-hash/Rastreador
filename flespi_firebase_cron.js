const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch'); // Assumes node-fetch v2 is installed in the functions folder

admin.initializeApp();
const db = admin.firestore();

// ⚠️ IMPORTANT: Replace with your actual Flespi Token
const FLESPI_TOKEN = "YOUR_FLESPI_TOKEN_HERE";

exports.dailyFlespiHistorySync = functions.pubsub.schedule('55 23 * * *').timeZone('America/Sao_Paulo').onRun(async (context) => {
    console.log("Iniciando sincronização diária de trajetos do Flespi...");
    
    try {
        // 1. Fetch all devices from Flespi
        const devRes = await fetch(`https://flespi.io/gw/devices/all`, {
            headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
        });
        const devData = await devRes.json();
        
        if (!devData || !devData.result) {
            console.error("Falha ao obter dispositivos do Flespi.");
            return null;
        }

        // 2. Define Time Range (Today from 00:00:00 to 23:59:59)
        const now = new Date();
        // Adjust for timezone if needed, this uses UTC. For precise local time, use moment.js or luxon in production
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        
        const fromTs = Math.floor(startOfDay.getTime() / 1000);
        const toTs = Math.floor(endOfDay.getTime() / 1000);
        
        const queryData = encodeURIComponent(JSON.stringify({from: fromTs, to: toTs}));
        
        const formatDateBr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

        // 3. Process each device
        for (const device of devData.result) {
            const imei = device.configuration?.ident;
            const deviceName = device.name || 'Veículo';
            
            console.log(`Processando dispositivo ${deviceName} (ID: ${device.id}, IMEI: ${imei})...`);
            
            const msgRes = await fetch(`https://flespi.io/gw/devices/${device.id}/messages?data=${queryData}`, {
                headers: { 'Authorization': `FlespiToken ${FLESPI_TOKEN}` }
            });
            const msgData = await msgRes.json();
            
            if (!msgData || !msgData.result || msgData.result.length === 0) {
                console.log(`Sem mensagens para ${deviceName} hoje.`);
                continue;
            }
            
            // 4. Parse Telemetry
            let routePoints = [];
            let dist = 0;
            let movingTimeMs = 0;
            let idleTimeMs = 0;
            let stoppedTimeMs = 0;
            let maxSpeed = 0;
            let speedSum = 0;
            let speedCount = 0;
            
            for (const msg of msgData.result) {
                if (msg['position.latitude'] && msg['position.longitude']) {
                    routePoints.push({
                        lat: msg['position.latitude'],
                        lng: msg['position.longitude'],
                        speed: msg['position.speed'] || 0,
                        ignition: msg['engine.ignition.status'] === true,
                        timestamp: ((msg.timestamp || 0) * 1000).toString()
                    });
                }
            }
            
            if (routePoints.length === 0) continue;

            // Calculate Stats (Distance, Time, Speed)
            for (let i = 1; i < routePoints.length; i++) {
                const p1 = routePoints[i-1];
                const p2 = routePoints[i];

                const R = 6371; // km
                const dLat = (p2.lat - p1.lat) * Math.PI / 180;
                const dLon = (p2.lng - p1.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                dist += R * c;

                const t1 = parseInt(p1.timestamp || '0', 10);
                const t2 = parseInt(p2.timestamp || '0', 10);
                const diffMs = Math.abs(t2 - t1);

                if (diffMs > 0 && diffMs < 1000 * 60 * 60 * 4) { 
                    if (p1.ignition) {
                        if ((p1.speed || 0) > 2) movingTimeMs += diffMs;
                        else idleTimeMs += diffMs;
                    } else {
                        stoppedTimeMs += diffMs;
                    }
                }

                if ((p2.speed || 0) > maxSpeed) maxSpeed = p2.speed || 0;
                if ((p2.speed || 0) > 0) {
                    speedSum += p2.speed || 0;
                    speedCount++;
                }
            }
            
            const avgSpeed = speedCount > 0 ? speedSum / speedCount : 0;
            
            // 5. Construct Document
            const savedRoute = {
                name: `Trajeto de ${formatDateBr} (Auto)`,
                vehicleId: device.id.toString(), // Using Flespi ID or map to your DB vehicle ID
                vehicleName: deviceName,
                points: routePoints,
                createdAt: new Date().toISOString(),
                distanceKm: Number(dist.toFixed(1)),
                stats: {
                    movingTimeMs,
                    idleTimeMs,
                    stoppedTimeMs,
                    maxSpeed: Number(maxSpeed.toFixed(1)),
                    avgSpeed: Number(avgSpeed.toFixed(1))
                }
            };

            // 6. Save to Firestore
            await db.collection('trajetos').add(savedRoute);
            console.log(`✅ Trajeto salvo para ${deviceName}: ${dist.toFixed(1)} km, ${routePoints.length} posições.`);
        }
        
        console.log("Sincronização diária concluída com sucesso!");
        
    } catch (error) {
        console.error("Erro geral na sincronização:", error);
    }
    
    return null;
});
