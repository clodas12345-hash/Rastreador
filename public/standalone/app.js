// Rastreador GPS Mobile - Standalone Web App
document.addEventListener('DOMContentLoaded', () => {
  let watchId = null;
  let currentRoute = [];
  let totalDistance = 0;
  let startTime = null;
  let map = null;
  let marker = null;
  let polyline = null;
  let savedRoutes = [];

  try {
    savedRoutes = JSON.parse(localStorage.getItem('rastreador_routes') || '[]');
  } catch (e) {
    savedRoutes = [];
  }

  // DOM Elements
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const statusBadge = document.getElementById('statusBadge');
  const speedEl = document.getElementById('speedEl');
  const distanceEl = document.getElementById('distanceEl');
  const timeEl = document.getElementById('timeEl');
  const coordsEl = document.getElementById('coordsEl');
  const historyList = document.getElementById('historyList');
  const tabTracker = document.getElementById('tabTracker');
  const tabHistory = document.getElementById('tabHistory');
  const viewTracker = document.getElementById('viewTracker');
  const viewHistory = document.getElementById('viewHistory');

  // Initialize Leaflet Map
  function initMap() {
    if (typeof L === 'undefined') return;
    if (map) return;
    
    map = L.map('map', { zoomControl: true }).setView([-23.5505, -46.6333], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    polyline = L.polyline([], { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(map);

    // Initial GPS lock for map center
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (map && currentRoute.length === 0) {
            map.setView([lat, lng], 16);
            if (!marker) {
              marker = L.marker([lat, lng]).addTo(map);
            } else {
              marker.setLatLng([lat, lng]);
            }
            coordsEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }

  setTimeout(initMap, 300);

  // Tab Navigation
  tabTracker.addEventListener('click', () => {
    tabTracker.classList.add('active');
    tabHistory.classList.remove('active');
    viewTracker.classList.remove('hidden');
    viewHistory.classList.add('hidden');
    if (map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  });

  tabHistory.addEventListener('click', () => {
    tabHistory.classList.add('active');
    tabTracker.classList.remove('active');
    viewHistory.classList.remove('hidden');
    viewTracker.classList.add('hidden');
    renderHistory();
  });

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      if (savedRoutes.length === 0) return;
      if (confirm('Deseja realmente apagar todo o histórico de rotas salvas?')) {
        savedRoutes = [];
        localStorage.removeItem('rastreador_routes');
        renderHistory();
      }
    });
  }

  // Start Tracking
  btnStart.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    currentRoute = [];
    totalDistance = 0;
    startTime = Date.now();
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
    statusBadge.className = 'status-badge online';
    statusBadge.innerHTML = '<span class="status-dot"></span> Rastreando';

    if (polyline) polyline.setLatLngs([]);
    distanceEl.textContent = '0.00 km';
    timeEl.textContent = '00:00';
    speedEl.textContent = '0.0 km/h';

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const rawSpeed = position.coords.speed;
        const speedKmh = rawSpeed !== null && rawSpeed > 0 ? (rawSpeed * 3.6) : 0;
        const timestamp = Date.now();

        coordsEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        speedEl.textContent = `${Math.max(0, speedKmh).toFixed(1)} km/h`;

        const newPoint = { lat, lng, speed: Number(speedKmh.toFixed(1)), timestamp };

        if (currentRoute.length > 0) {
          const last = currentRoute[currentRoute.length - 1];
          const dist = getDistanceFromLatLonInKm(last.lat, last.lng, lat, lng);
          if (dist >= 0.003) { // > 3 metros de deslocamento
            totalDistance += dist;
            distanceEl.textContent = `${totalDistance.toFixed(2)} km`;
            currentRoute.push(newPoint);
          }
        } else {
          currentRoute.push(newPoint);
        }

        // Update Map
        if (map) {
          const latlngs = currentRoute.map(p => [p.lat, p.lng]);
          polyline.setLatLngs(latlngs);
          if (marker) {
            marker.setLatLng([lat, lng]);
          } else {
            marker = L.marker([lat, lng]).addTo(map);
          }
          map.panTo([lat, lng]);
        }
      },
      (error) => {
        console.warn('Sinal GPS instável:', error.message);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    // Timer loop
    if (window.timerInterval) clearInterval(window.timerInterval);
    window.timerInterval = setInterval(() => {
      if (!startTime) return;
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
  });

  // Stop Tracking & Save
  btnStop.addEventListener('click', () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (window.timerInterval) {
      clearInterval(window.timerInterval);
    }

    btnStop.classList.add('hidden');
    btnStart.classList.remove('hidden');
    statusBadge.className = 'status-badge offline';
    statusBadge.innerHTML = '<span class="status-dot"></span> Parado';

    if (currentRoute.length > 1) {
      const now = new Date();
      const routeRecord = {
        id: Date.now(),
        date: now.toLocaleDateString('pt-BR'),
        time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        distanceKm: totalDistance.toFixed(2),
        duration: timeEl.textContent,
        points: currentRoute
      };
      savedRoutes.unshift(routeRecord);
      localStorage.setItem('rastreador_routes', JSON.stringify(savedRoutes));
      alert('Trajeto finalizado e salvo com sucesso no histórico!');
    } else {
      alert('Rastreamento finalizado (poucos pontos registrados).');
    }
  });

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  function renderHistory() {
    if (savedRoutes.length === 0) {
      historyList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 24px; font-size: 0.9rem;">Nenhum trajeto salvo ainda.</p>';
      return;
    }

    historyList.innerHTML = savedRoutes.map((r, index) => `
      <div class="history-item">
        <div>
          <strong style="font-size: 0.9rem;">Trajeto #${savedRoutes.length - index}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${r.date} às ${r.time}</div>
          <div class="stop-tag">${r.distanceKm} km • ${r.duration}</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-primary" style="width: auto; min-height: 36px; padding: 6px 12px; font-size: 0.8rem;" onclick="window.viewSavedRoute(${r.id})">Ver no Mapa</button>
          <button class="btn btn-danger" style="width: auto; min-height: 36px; padding: 6px 10px; font-size: 0.8rem;" onclick="window.deleteSavedRoute(${r.id})">✕</button>
        </div>
      </div>
    `).join('');
  }

  window.viewSavedRoute = function(id) {
    const route = savedRoutes.find(r => r.id === id);
    if (!route || !route.points || route.points.length === 0) return;
    tabTracker.click();
    if (map) {
      const latlngs = route.points.map(p => [p.lat, p.lng]);
      polyline.setLatLngs(latlngs);
      if (marker) {
        marker.setLatLng(latlngs[latlngs.length - 1]);
      } else {
        marker = L.marker(latlngs[latlngs.length - 1]).addTo(map);
      }
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }
  };

  window.deleteSavedRoute = function(id) {
    if (confirm('Deseja excluir este trajeto do histórico?')) {
      savedRoutes = savedRoutes.filter(r => r.id !== id);
      localStorage.setItem('rastreador_routes', JSON.stringify(savedRoutes));
      renderHistory();
    }
  };
});
