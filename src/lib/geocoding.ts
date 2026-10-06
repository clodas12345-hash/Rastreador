// Real Reverse Geocoding Service with OpenStreetMap Nominatim & Photon + Road Speed Limit Detection + Caching

export interface RoadSpeedInfo {
  speedLimit: number;
  roadName: string;
  roadType: string;
}

interface GeocodeCache {
  [coordKey: string]: string;
}

interface RoadSpeedCache {
  [coordKey: string]: RoadSpeedInfo;
}

const addressCache: GeocodeCache = {};
const roadSpeedCache: RoadSpeedCache = {};
const pendingRequests: { [coordKey: string]: Promise<string> } = {};
const pendingSpeedRequests: { [coordKey: string]: Promise<RoadSpeedInfo> } = {};

// Load cache from localStorage on startup if available
try {
  const saved = localStorage.getItem('geo_address_cache');
  if (saved) {
    Object.assign(addressCache, JSON.parse(saved));
  }
  const savedSpeed = localStorage.getItem('geo_speed_cache');
  if (savedSpeed) {
    Object.assign(roadSpeedCache, JSON.parse(savedSpeed));
  }
} catch (e) {
  // ignore
}

function getCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function saveCache() {
  try {
    localStorage.setItem('geo_address_cache', JSON.stringify(addressCache));
    localStorage.setItem('geo_speed_cache', JSON.stringify(roadSpeedCache));
  } catch (e) {
    // ignore quota errors
  }
}

/**
 * Returns cached address synchronously if available, otherwise null.
 */
export function getCachedAddress(lat: number, lng: number): string | null {
  if (!lat || !lng) return 'Localização não definida';
  const key = getCoordKey(lat, lng);
  return addressCache[key] || null;
}

/**
 * Returns cached road speed limit synchronously if available, otherwise null.
 */
export function getCachedRoadSpeed(lat: number, lng: number, vehicleType?: string): RoadSpeedInfo | null {
  if (!lat || !lng) return null;
  const key = getCoordKey(lat, lng);
  const info = roadSpeedCache[key];
  if (!info) return null;
  
  // Apply vehicle type restriction (e.g. trucks and buses capped at 90 or 80 km/h)
  if ((vehicleType === 'truck' || vehicleType === 'bus') && info.speedLimit > 90) {
    return { ...info, speedLimit: 90 };
  }
  return info;
}

/**
 * Analyzes road name and type to determine the Brazilian CTB speed limit.
 */
export function determineRoadSpeedLimit(roadName: string, roadType?: string, maxspeedTag?: string, vehicleType?: string): RoadSpeedInfo {
  const cleanName = (roadName || '').trim();
  const lowerName = cleanName.toLowerCase();
  const lowerType = (roadType || '').toLowerCase();
  let calculatedLimit = 60; // Padrão de via urbana
  let detectedType = 'Via Urbana / Arterial (60 km/h)';

  // 1. Tag explícita de maxspeed do OpenStreetMap / satélite
  if (maxspeedTag) {
    const parsed = parseInt(maxspeedTag.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed >= 20 && parsed <= 140) {
      calculatedLimit = parsed;
      detectedType = `Regulamentada via OSM (${parsed} km/h)`;
    }
  } else if (
    // 2. Rodovias Federais e Estaduais de Alta Velocidade (100 a 110 km/h)
    lowerName.includes('rodovia') ||
    lowerName.includes('rod.') ||
    lowerName.includes('autoestrada') ||
    lowerName.includes('autopista') ||
    /\b(br|sp|pr|mg|rj|rs|sc|go|ms|mt|ba|ce|pe|df|es|ma|pa|pb|pi|rn|ro|rr|se|to)-\d{2,3}\b/i.test(cleanName) ||
    lowerName.includes('dutra') ||
    lowerName.includes('ayrton senna') ||
    lowerName.includes('carvalho pinto') ||
    lowerName.includes('bandeirantes') ||
    lowerName.includes('anhanguera') ||
    lowerName.includes('castello branco') ||
    lowerName.includes('castelo branco') ||
    lowerName.includes('imigrantes') ||
    lowerName.includes('anchieta') ||
    lowerName.includes('rodoanel') ||
    lowerName.includes('fernão dias') ||
    lowerName.includes('fernao dias') ||
    lowerName.includes('régis bittencourt') ||
    lowerName.includes('regis bittencourt') ||
    lowerName.includes('raposo tavares') ||
    lowerType === 'motorway' ||
    lowerType === 'motorway_link'
  ) {
    calculatedLimit = 110;
    detectedType = 'Rodovia / Autoestrada (110 km/h)';
  } else if (
    // 3. Vias Expressas e Marginais (80 a 90 km/h)
    lowerName.includes('marginal tietê') ||
    lowerName.includes('marginal tiete') ||
    lowerName.includes('marginal pinheiros') ||
    lowerName.includes('marginal') ||
    lowerName.includes('via expressa') ||
    lowerName.includes('pista expressa') ||
    lowerName.includes('linha vermelha') ||
    lowerName.includes('linha amarela') ||
    lowerName.includes('eixo monumental') ||
    lowerName.includes('anel viário') ||
    lowerName.includes('anel viario') ||
    lowerName.includes('perimetral') ||
    lowerName.includes('contorno') ||
    lowerType === 'trunk' ||
    lowerType === 'trunk_link'
  ) {
    calculatedLimit = 80;
    detectedType = 'Via de Trânsito Rápido / Expressa (80 km/h)';
  } else if (
    // 4. Avenidas e Vias Arteriais Principais (60 km/h)
    lowerName.includes('avenida') ||
    lowerName.includes('av.') ||
    lowerName.includes('av ') ||
    lowerName.includes('viaduto') ||
    lowerName.includes('elevado') ||
    lowerName.includes('ponte') ||
    lowerName.includes('radial') ||
    lowerName.includes('túnel') ||
    lowerName.includes('tunel') ||
    lowerType === 'primary' ||
    lowerType === 'primary_link' ||
    lowerType === 'secondary' ||
    lowerType === 'secondary_link'
  ) {
    calculatedLimit = 60;
    detectedType = 'Avenida / Via Arterial (60 km/h)';
  } else if (
    // 5. Estradas Vicinais / Interurbanas (60 a 80 km/h)
    lowerName.includes('estrada') ||
    lowerName.includes('estr.') ||
    lowerName.includes('rodovia municipal')
  ) {
    calculatedLimit = 60;
    detectedType = 'Estrada Vicinal (60 km/h)';
  } else if (
    // 6. Ruas Coletoras e Avenidas de Bairro (50 km/h)
    lowerName.includes('alameda') ||
    lowerName.includes('praça') ||
    lowerName.includes('praca') ||
    lowerType === 'tertiary' ||
    lowerType === 'tertiary_link'
  ) {
    calculatedLimit = 50;
    detectedType = 'Via Coletora / Bairro (50 km/h)';
  } else if (
    // 7. Ruas Locais / Residenciais Estritas (40 a 50 km/h)
    lowerName.includes('travessa') ||
    lowerName.includes('viela') ||
    lowerName.includes('beco') ||
    lowerName.includes('passagem') ||
    lowerType === 'residential' ||
    lowerType === 'unclassified'
  ) {
    calculatedLimit = 40;
    detectedType = 'Via Residencial / Local (40 km/h)';
  } else if (
    // 8. Vias Internas, Estacionamentos e Condomínios (20 a 30 km/h)
    lowerName.includes('estacionamento') ||
    lowerName.includes('condomínio') ||
    lowerName.includes('condominio') ||
    lowerName.includes('garagem') ||
    lowerName.includes('pátio') ||
    lowerName.includes('patio') ||
    lowerType === 'service' ||
    lowerType === 'living_street' ||
    lowerType === 'pedestrian' ||
    lowerType === 'parking_aisle'
  ) {
    calculatedLimit = 30;
    detectedType = 'Via de Serviço / Estacionamento (30 km/h)';
  }

  // Ajuste para veículos pesados (caminhões e ônibus têm teto de 90 km/h pelo CTB)
  if ((vehicleType === 'truck' || vehicleType === 'bus') && calculatedLimit > 90) {
    calculatedLimit = 90;
    detectedType = `${detectedType} [Pesados 90 km/h]`;
  }

  return {
    speedLimit: calculatedLimit,
    roadName: cleanName || 'Via Identificada por Satélite',
    roadType: detectedType
  };
}

/**
 * Formats a clean Brazilian address string from Nominatim OSM reverse geocode
 */
function formatOsmAddress(data: any): string {
  if (!data || !data.address) return data?.display_name || 'Endereço identificado';
  const addr = data.address;
  const parts: string[] = [];

  // Road / Street / Avenue
  const road = addr.road || addr.street || addr.pedestrian || addr.footway || addr.avenue || addr.highway;
  const houseNumber = addr.house_number || addr.street_number;
  if (road) {
    parts.push(houseNumber ? `${road}, ${houseNumber}` : road);
  }

  // Neighborhood / Suburb
  const neighborhood = addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter;
  if (neighborhood) {
    parts.push(neighborhood);
  }

  // City & State
  const city = addr.city || addr.town || addr.municipality || addr.village;
  const state = addr.state || addr['ISO3166-2-lvl4']?.split('-')[1] || '';
  if (city) {
    parts.push(state ? `${city} - ${state}` : city);
  }

  // Postcode
  if (addr.postcode) {
    parts.push(`CEP ${addr.postcode}`);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return data.display_name || 'Endereço identificado';
}

function formatPhotonAddress(props: any): string {
  if (!props) return '';
  const parts: string[] = [];
  const road = props.street || props.name;
  if (road) {
    parts.push(props.housenumber ? `${road}, ${props.housenumber}` : road);
  }
  const district = props.locality || props.district || props.suburb;
  if (district && district !== road) {
    parts.push(district);
  }
  const city = props.city || props.town || props.village;
  const state = props.state;
  if (city) {
    parts.push(state ? `${city} - ${state}` : city);
  }
  if (props.postcode) {
    parts.push(`CEP ${props.postcode}`);
  }
  return parts.length > 0 ? parts.join(', ') : (props.name || '');
}

/**
 * Fetches real reverse geocoded address asynchronously from OpenStreetMap Nominatim or Photon.
 * Completely avoids legacy Google Maps Geocoder which requires active billing.
 */
export async function getRealAddress(lat: number, lng: number): Promise<string> {
  if (!lat || !lng || (lat === 0 && lng === 0)) {
    return 'Localização GPS não capturada';
  }

  const key = getCoordKey(lat, lng);
  if (addressCache[key]) {
    return addressCache[key];
  }

  if (pendingRequests[key]) {
    return pendingRequests[key];
  }

  const promise = (async () => {
    // 1. Primary: OpenStreetMap Nominatim Reverse Geocoding
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1`;
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
      });
      if (response.ok) {
        const data = await response.json();
        const formatted = formatOsmAddress(data);
        if (formatted) {
          addressCache[key] = formatted;
          
          const roadName = data.address?.road || data.address?.street || data.address?.highway || data.name || '';
          const roadType = data.type || data.category || '';
          const maxspeed = data.extratags?.maxspeed || '';
          const speedInfo = determineRoadSpeedLimit(roadName, roadType, maxspeed);
          roadSpeedCache[key] = speedInfo;

          saveCache();
          return formatted;
        }
      }
    } catch {
      // Graceful fallback to secondary geocoder
    }

    // 2. Secondary: Photon OSM Reverse Geocoding
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
      const response = await fetch(photonUrl);
      if (response.ok) {
        const data = await response.json();
        const feature = data.features?.[0];
        if (feature?.properties) {
          const formatted = formatPhotonAddress(feature.properties);
          if (formatted) {
            addressCache[key] = formatted;

            const roadName = feature.properties.street || feature.properties.name || '';
            const speedInfo = determineRoadSpeedLimit(roadName);
            roadSpeedCache[key] = speedInfo;

            saveCache();
            return formatted;
          }
        }
      }
    } catch {
      // Graceful fallback to coordinates
    }

    // 3. Coordinate fallback
    const fallback = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
    addressCache[key] = fallback;
    return fallback;
  })();

  pendingRequests[key] = promise;
  try {
    const result = await promise;
    return result;
  } finally {
    delete pendingRequests[key];
  }
}

/**
 * Fetches real road speed limit by satellite coordinate asynchronously.
 */
export async function getRealRoadSpeedLimit(lat: number, lng: number, vehicleType?: string): Promise<RoadSpeedInfo> {
  if (!lat || !lng || (lat === 0 && lng === 0)) {
    return { speedLimit: 60, roadName: 'GPS Desconhecido', roadType: 'Padrão (60 km/h)' };
  }

  const key = getCoordKey(lat, lng);
  const cached = getCachedRoadSpeed(lat, lng, vehicleType);
  if (cached) {
    return cached;
  }

  if (pendingSpeedRequests[key]) {
    return pendingSpeedRequests[key];
  }

  const promise = (async () => {
    // 1. If address already exists in cache, deduce from it
    const cachedAddr = addressCache[key];
    if (cachedAddr) {
      const parts = cachedAddr.split(',');
      const candidateName = parts[0] || '';
      const deduced = determineRoadSpeedLimit(candidateName, undefined, undefined, vehicleType);
      roadSpeedCache[key] = deduced;
      saveCache();
      return deduced;
    }

    // 2. Fetch real address (which will populate roadSpeedCache automatically)
    await getRealAddress(lat, lng);
    const updated = roadSpeedCache[key];
    if (updated) {
      if ((vehicleType === 'truck' || vehicleType === 'bus') && updated.speedLimit > 90) {
        return { ...updated, speedLimit: 90 };
      }
      return updated;
    }

    const fallback: RoadSpeedInfo = {
      speedLimit: 50,
      roadName: 'Via Urbana',
      roadType: 'Avenida / Via Urbana (50 km/h)'
    };
    roadSpeedCache[key] = fallback;
    saveCache();
    return fallback;
  })();

  pendingSpeedRequests[key] = promise;
  try {
    const result = await promise;
    return result;
  } finally {
    delete pendingSpeedRequests[key];
  }
}

