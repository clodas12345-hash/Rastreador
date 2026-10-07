import { RoutePoint } from '../types';

/**
 * Service to snap GPS trajectories to real streets and filter out GPS jump/drift spikes ("flying car" lines).
 */

const routeGeometryCache = new Map<string, { lat: number; lng: number }[]>();

/**
 * Calculates approximate distance in meters between two coordinates
 */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Filters out erratic GPS reflections/spikes where the coordinate jumps away and immediately returns
 * (which causes straight lines flying across buildings/cities).
 */
export function filterGpsSpikes(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  if (!points || points.length < 3) return points || [];
  const filtered: { lat: number; lng: number }[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dPrevCurr = distanceMeters(prev, curr);
    const dCurrNext = distanceMeters(curr, next);
    const dPrevNext = distanceMeters(prev, next);

    // If point jumps far away (> 250m) but prev and next are close to each other, it's a GPS cell-tower reflection spike
    if (dPrevCurr > 250 && dCurrNext > 250 && dPrevNext < Math.min(dPrevCurr, dCurrNext) * 0.45) {
      continue;
    }

    // Ignore stationary duplicates (< 4 meters)
    if (dPrevCurr < 4) {
      continue;
    }

    filtered.push(curr);
  }

  const lastPt = points[points.length - 1];
  if (distanceMeters(filtered[filtered.length - 1], lastPt) >= 2) {
    filtered.push(lastPt);
  }

  return filtered;
}

/**
 * Generates clean, road-hugging path without Catmull-Rom overshoot loops on long gaps.
 */
export function generateCurvedSmoothPath(
  points: { lat: number; lng: number }[],
  segmentsPerCurve: number = 4
): { lat: number; lng: number }[] {
  const cleaned = filterGpsSpikes(points);
  if (cleaned.length <= 2) return cleaned;

  const smoothPoints: { lat: number; lng: number }[] = [];

  for (let i = 0; i < cleaned.length - 1; i++) {
    const p0 = i > 0 ? cleaned[i - 1] : cleaned[i];
    const p1 = cleaned[i];
    const p2 = cleaned[i + 1];
    const p3 = i + 2 < cleaned.length ? cleaned[i + 2] : p2;

    const segDist = distanceMeters(p1, p2);

    // Do NOT apply spline curving if points are far apart (> 180m) because Catmull-Rom creates giant flying arcs
    if (segDist > 180) {
      smoothPoints.push(p1);
      continue;
    }

    for (let t = 0; t < segmentsPerCurve; t++) {
      const u = t / segmentsPerCurve;
      const u2 = u * u;
      const u3 = u2 * u;

      const lat =
        0.5 *
        (2 * p1.lat +
          (-p0.lat + p2.lat) * u +
          (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * u2 +
          (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * u3);

      const lng =
        0.5 *
        (2 * p1.lng +
          (-p0.lng + p2.lng) * u +
          (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * u2 +
          (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * u3);

      smoothPoints.push({ lat, lng });
    }
  }

  smoothPoints.push(cleaned[cleaned.length - 1]);
  return smoothPoints;
}

/**
 * Snaps historical GPS coordinates to real streets using OSRM Driving Route/Match service
 * so the vehicle trajectory follows actual roads instead of flying in straight lines over buildings.
 */
export async function getRoadSnappedPath(
  points: RoutePoint[] | { lat: number; lng: number }[]
): Promise<{ lat: number; lng: number }[]> {
  if (!points || points.length < 2) return (points as { lat: number; lng: number }[]) || [];

  const cleaned = filterGpsSpikes(points);
  if (cleaned.length < 2) return cleaned;

  const cacheKey = `osrm_${cleaned.length}_${cleaned[0].lat.toFixed(4)}_${cleaned[0].lng.toFixed(4)}_${cleaned[cleaned.length - 1].lat.toFixed(4)}`;
  if (routeGeometryCache.has(cacheKey)) {
    return routeGeometryCache.get(cacheKey)!;
  }

  try {
    // Sample up to 60 key waypoints to query OSRM street routing rapidly
    const maxWaypoints = 60;
    const step = cleaned.length > maxWaypoints ? (cleaned.length - 1) / (maxWaypoints - 1) : 1;
    const sampled: { lat: number; lng: number }[] = [];

    for (let i = 0; i < (cleaned.length > maxWaypoints ? maxWaypoints : cleaned.length); i++) {
      const idx = Math.min(Math.round(i * step), cleaned.length - 1);
      const pt = cleaned[idx];
      if (sampled.length === 0 || distanceMeters(sampled[sampled.length - 1], pt) > 8) {
        sampled.push(pt);
      }
    }

    if (sampled.length >= 2) {
      const coordsStr = sampled.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length > 1) {
          const roadPath = coords.map((c: [number, number]) => ({ lat: c[1], lng: c[0] }));
          routeGeometryCache.set(cacheKey, roadPath);
          return roadPath;
        }
      }
    }
  } catch (e) {
    // Fallback to spike-filtered path
  }

  const fallback = generateCurvedSmoothPath(cleaned, 4);
  routeGeometryCache.set(cacheKey, fallback);
  return fallback;
}
