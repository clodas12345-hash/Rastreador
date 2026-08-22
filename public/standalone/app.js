// Rastreador SPA - Vanilla JS
document.addEventListener('DOMContentLoaded', () => {
  let watchId = null;
  let currentRoute = [];
  let totalDistance = 0;
  let startTime = null;
  let map = null;
  let marker = null;
  let polyline = null;
  let savedRoutes = JSON.parse(localStorage.getItem('rastreador_routes') || '[]');

  // DOM Elements
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const statusBadge = document.getElementById('statusBadge');
  const speedEl = document.getElementById('speedEl');
  const distanceEl = document.getElementById('distanceEl');
  const timeEl = document.getElementById('timeEl');
  const latEl = document.getElementById('latEl');
  const lngEl = document.getElementById('lngEl');
  const historyList = document.getElementById('historyList');
  const tabTracker = document.getElementById('tabTracker');
  const tabHistory = document.getElementById('tabHistory');
  const viewTracker = document.getElementById('viewTracker');
  const viewHistory = document.getElementById('viewHistory');

  // Initialize Leaflet Map
  function initMap() {
    if (typeof L === 'undefined') return;
    map = L.map('map').setView([-23.5505, -46.6333], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    polyline = L.polyline([], { color: '#2563eb', weight: 5 }).addTo(map);
  }

  setTimeout(initMap, 500);

  // Tab Navigation
  tabTracker.addEventListener('click', () => {
    tabTracker.classList.add('active');
    tabHistory.classList.remove('active');
    viewTracker.classList.remove('hidden');
    viewHistory.classList.add('hidden');
    if (map) map.invalidateSize();
  });

  tabHistory.addEventListener('click', () => {
    tabHistory.classList.add('active');
    tabTracker.classList.remove('active');
    viewHistory.classList.remove('hidden');
    viewTracker.classList.add('hidden');
    renderHistory();
  });

  // Start Tracking
  btnStart.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada pelo seu navegador.');
      return;
    }

    currentRoute = [];
    totalDistance = 0;
    startTime = Date.now();
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
    statusBadge.className = 'status-badge online';
    statusBadge.innerHTML = '<span class="status-dot"></span> Rastreando';

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const speed = position.coords.speed ? position.coords.speed * 3.6 : 0; // km/h
        const timestamp = Date.now();

        latEl.textContent = lat.toFixed(5);
        lngEl.textContent = lng.toFixed(5);
        speedEl.textContent = `${Math.max(0, speed).toFixed(1)} km/h`;

        const newPoint = { lat, lng, speed, timestamp };

        if (currentRoute.length > 0) {
          const last = currentRoute[currentRoute.length - 1];
          const dist = getDistanceFromLatLonInKm(last.lat, last.lng, lat, lng);
          if (dist > 0.003) { // > 3 meters
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
        console.error('Erro de GPS:', error);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    // Timer loop
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
    clearInterval(window.timerInterval);

    btnStop.classList.add('hidden');
    btnStart.classList.remove('hidden');
    statusBadge.className = 'status-badge offline';
    statusBadge.innerHTML = '<span class="status-dot"></span> Parado';

    if (currentRoute.length > 1) {
      const routeRecord = {
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR'),
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        distanceKm: totalDistance.toFixed(2),
        duration: timeEl.textContent,
        points: currentRoute
      };
      savedRoutes.unshift(routeRecord);
      localStorage.setItem('rastreador_routes', JSON.stringify(savedRoutes));
      alert('Trajeto salvo com sucesso no histórico!');
    }
  });

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
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
      historyList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum trajeto salvo ainda.</p>';
      return;
    }

    historyList.innerHTML = savedRoutes.map((r, index) => `
      <div class="history-item">
        <div>
          <strong>Trajeto #${savedRoutes.length - index}</strong>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${r.date} às ${r.time}</div>
          <div class="stop-tag">${r.distanceKm} km • ${r.duration}</div>
        </div>
        <button class="btn btn-primary" style="width: auto; padding: 6px 12px; font-size: 0.8rem;" onclick="window.viewSavedRoute(${r.id})">Ver</button>
      </div>
    `).join('');
  }

  window.viewSavedRoute = function(id) {
    const route = savedRoutes.find(r => r.id === id);
    if (!route) return;
    tabTracker.click();
    if (map && route.points.length > 0) {
      const latlngs = route.points.map(p => [p.lat, p.lng]);
      polyline.setLatLngs(latlngs);
      map.fitBounds(polyline.getBounds());
    }
  };
});
