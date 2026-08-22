import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { Geofence } from '../types';

export default function GeofenceLayer({ geofences }: { geofences: Geofence[] }) {
  const map = useMap();
  const circlesRef = useRef<Record<string, google.maps.Circle>>({});

  useEffect(() => {
    if (!map) return;

    // Remove obsolete
    const currentIds = new Set(geofences.map(g => g.id));
    Object.keys(circlesRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        circlesRef.current[id].setMap(null);
        delete circlesRef.current[id];
      }
    });

    // Update or add
    geofences.forEach(g => {
      if (circlesRef.current[g.id]) {
        circlesRef.current[g.id].setCenter({ lat: g.lat, lng: g.lng });
        circlesRef.current[g.id].setRadius(g.radius);
        circlesRef.current[g.id].setOptions({ fillColor: g.color, strokeColor: g.color });
      } else {
        const circle = new google.maps.Circle({
          map,
          center: { lat: g.lat, lng: g.lng },
          radius: g.radius,
          fillColor: g.color,
          fillOpacity: 0.2,
          strokeColor: g.color,
          strokeOpacity: 0.8,
          strokeWeight: 2,
          clickable: false
        });
        circlesRef.current[g.id] = circle;
      }
    });

    return () => {
      // Cleanup on unmount
      Object.keys(circlesRef.current).forEach(id => circlesRef.current[id].setMap(null));
      circlesRef.current = {};
    };
  }, [map, geofences]);

  return null;
}
