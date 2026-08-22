import { RoutePoint } from '../types';

/**
 * Service to snap GPS route points to actual road geometry and curved streets using Google Maps DirectionsService
 * and Catmull-Rom spline curve interpolation as an instant fallback.
 */

// Cache for snapped route polylines to avoid excessive API requests
const routeGeometryCache = new Map<string, { lat: number; lng: number }[]>();

/**
 * Generates smooth Catmull-Rom spline curves between discrete GPS waypoints
 * so that lines naturally curve along streets instead of rendering as jagged, hard straight chords.
 */
export function generateCurvedSmoothPath(points: { lat: number; lng: number }[], segmentsPerCurve: number = 8): { lat: number; lng: number }[] {
  if (!points || points.length < 2) return points;
  if (points.length === 2) {
    // Intermediate point for slight realistic curvature
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
 * Snaps historical GPS coordinates to real Google Maps road network paths using DirectionsService.
 * If there are multiple waypoints, it processes them in batches of driving routes and falls back
 * to high-fidelity Catmull-Rom curved spline smoothing.
 */
export async function getRoadSnappedPath(
  points: RoutePoint[] | { lat: number; lng: number }[]
): Promise<{ lat: number; lng: number }[]> {
  if (!points || points.length < 2) return points;

  // Generate cache key
  const cacheKey = `${points.length}_${points[0].lat.toFixed(4)}_${points[0].lng.toFixed(4)}_${points[points.length - 1].lat.toFixed(4)}`;
  if (routeGeometryCache.has(cacheKey)) {
    return routeGeometryCache.get(cacheKey)!;
  }

  // Check if Google Maps JS API is available
  if (typeof google === 'undefined' || !google.maps || !google.maps.DirectionsService) {
    const smoothed = generateCurvedSmoothPath(points, 8);
    routeGeometryCache.set(cacheKey, smoothed);
    return smoothed;
  }

  try {
    const directionsService = new google.maps.DirectionsService();

    // Sample waypoints if there are too many (Google Directions limit is 25 waypoints per request)
    const sampledPoints: { lat: number; lng: number }[] = [];
    
    // We filter out stationary points (distance < 10 meters) to improve road-snapping accuracy
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      if (sampledPoints.length === 0) {
        sampledPoints.push({ lat: current.lat, lng: current.lng });
      } else {
        const last = sampledPoints[sampledPoints.length - 1];
        const dist = Math.hypot(current.lat - last.lat, current.lng - last.lng);
        // Distance roughly > 0.0001 deg (~11 meters) or last point
        if (dist > 0.0001 || i === points.length - 1) {
          sampledPoints.push({ lat: current.lat, lng: current.lng });
        }
      }
    }

    if (sampledPoints.length < 2) {
      return generateCurvedSmoothPath(points, 8);
    }

    // Process chunks to follow the exact street geometry
    const fullStreetPolyline: { lat: number; lng: number }[] = [];
    const CHUNK_SIZE = 10; // 1 origin + 8 waypoints + 1 dest

    for (let start = 0; start < sampledPoints.length - 1; start += CHUNK_SIZE - 1) {
      const chunk = sampledPoints.slice(start, start + CHUNK_SIZE);
      if (chunk.length < 2) break;

      const origin = chunk[0];
      const destination = chunk[chunk.length - 1];
      const waypoints = chunk.slice(1, chunk.length - 1).map(pt => ({
        location: new google.maps.LatLng(pt.lat, pt.lng),
        stopover: false
      }));

      try {
        const result = await new Promise<google.maps.DirectionsResult | null>((resolve) => {
          directionsService.route(
            {
              origin: new google.maps.LatLng(origin.lat, origin.lng),
              destination: new google.maps.LatLng(destination.lat, destination.lng),
              waypoints: waypoints,
              travelMode: google.maps.TravelMode.DRIVING,
              optimizeWaypoints: false,
            },
            (response, status) => {
              if (status === google.maps.DirectionsStatus.OK && response) {
                resolve(response);
              } else {
                resolve(null);
              }
            }
          );
        });

        if (result && result.routes && result.routes[0] && result.routes[0].overview_path) {
          const overviewPath = result.routes[0].overview_path.map(p => ({
            lat: p.lat(),
            lng: p.lng(),
          }));
          fullStreetPolyline.push(...overviewPath);
        } else {
          // Chunk fallback: smooth curve for this chunk
          const curvedChunk = generateCurvedSmoothPath(chunk, 6);
          fullStreetPolyline.push(...curvedChunk);
        }
      } catch {
        // Individual chunk failure fallback
        const curvedChunk = generateCurvedSmoothPath(chunk, 6);
        fullStreetPolyline.push(...curvedChunk);
      }
    }

    if (fullStreetPolyline.length > 2) {
      // Remove duplicate adjoining points
      const cleaned = fullStreetPolyline.filter((pt, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        return Math.abs(pt.lat - prev.lat) > 0.000001 || Math.abs(pt.lng - prev.lng) > 0.000001;
      });
      routeGeometryCache.set(cacheKey, cleaned);
      return cleaned;
    }

    const fallbackSmooth = generateCurvedSmoothPath(points, 8);
    routeGeometryCache.set(cacheKey, fallbackSmooth);
    return fallbackSmooth;
  } catch (e) {
    console.warn('Road snap error, using Catmull-Rom spline curves:', e);
    const fallbackSmooth = generateCurvedSmoothPath(points, 8);
    routeGeometryCache.set(cacheKey, fallbackSmooth);
    return fallbackSmooth;
  }
}
