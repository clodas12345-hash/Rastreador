import { RoutePoint } from '../types';

/**
 * Service to generate smooth, natural curved trajectories along GPS coordinates
 * using mathematical Catmull-Rom spline interpolation.
 * Does not require external billing or Directions API quota.
 */

// In-memory cache for smoothed polyline paths
const routeGeometryCache = new Map<string, { lat: number; lng: number }[]>();

/**
 * Generates smooth Catmull-Rom spline curves between discrete GPS waypoints
 * so that lines naturally curve along streets instead of rendering as jagged, hard straight chords.
 */
export function generateCurvedSmoothPath(
  points: { lat: number; lng: number }[],
  segmentsPerCurve: number = 6
): { lat: number; lng: number }[] {
  if (!points || points.length < 2) return points || [];
  
  if (points.length === 2) {
    const mid = {
      lat: (points[0].lat + points[1].lat) / 2,
      lng: (points[0].lng + points[1].lng) / 2,
    };
    return [points[0], mid, points[1]];
  }

  const smoothPoints: { lat: number; lng: number }[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;

    for (let t = 0; t < segmentsPerCurve; t++) {
      const u = t / segmentsPerCurve;
      const u2 = u * u;
      const u3 = u2 * u;

      // Catmull-Rom Spline Formula
      const lat = 0.5 * (
        (2 * p1.lat) +
        (-p0.lat + p2.lat) * u +
        (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * u2 +
        (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * u3
      );

      const lng = 0.5 * (
        (2 * p1.lng) +
        (-p0.lng + p2.lng) * u +
        (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * u2 +
        (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * u3
      );

      smoothPoints.push({ lat, lng });
    }
  }

  // Push the final destination point
  smoothPoints.push(points[points.length - 1]);

  return smoothPoints;
}

/**
 * Snaps historical GPS coordinates to smooth natural paths using Catmull-Rom curved spline smoothing.
 * Runs 100% in-browser, instantaneous and free from API rate limits or billing errors.
 */
export async function getRoadSnappedPath(
  points: RoutePoint[] | { lat: number; lng: number }[]
): Promise<{ lat: number; lng: number }[]> {
  if (!points || points.length < 2) return points as { lat: number; lng: number }[];

  // Generate cache key
  const cacheKey = `${points.length}_${points[0].lat.toFixed(4)}_${points[0].lng.toFixed(4)}_${points[points.length - 1].lat.toFixed(4)}`;
  if (routeGeometryCache.has(cacheKey)) {
    return routeGeometryCache.get(cacheKey)!;
  }

  // Filter stationary duplicates (within 3 meters) to produce ultra-clean paths
  const cleanPoints: { lat: number; lng: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (cleanPoints.length === 0) {
      cleanPoints.push({ lat: pt.lat, lng: pt.lng });
    } else {
      const last = cleanPoints[cleanPoints.length - 1];
      const dist = Math.hypot(pt.lat - last.lat, pt.lng - last.lng);
      if (dist > 0.00003 || i === points.length - 1) {
        cleanPoints.push({ lat: pt.lat, lng: pt.lng });
      }
    }
  }

  const smoothed = generateCurvedSmoothPath(cleanPoints, 6);
  routeGeometryCache.set(cacheKey, smoothed);
  return smoothed;
}
