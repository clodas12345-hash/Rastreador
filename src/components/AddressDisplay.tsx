import React, { useState, useEffect } from 'react';
import { getRealAddress, getCachedAddress } from '../lib/geocoding';

export function AddressDisplay({ lat, lng }: { lat: number; lng: number }) {
  const [address, setAddress] = useState<string>(() => getCachedAddress(lat, lng) || 'Consultando endereço real...');
  const [loading, setLoading] = useState(!getCachedAddress(lat, lng));

  useEffect(() => {
    let isMounted = true;
    if (!lat || !lng) {
      setAddress('Localização não definida');
      setLoading(false);
      return;
    }
    const cached = getCachedAddress(lat, lng);
    if (cached) {
      setAddress(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    getRealAddress(lat, lng).then(addr => {
      if (isMounted) {
        setAddress(addr);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [lat, lng]);

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-700 min-w-0">
      {loading ? (
        <span className="text-gray-400 italic text-[11px] animate-pulse">Buscando endereço exato...</span>
      ) : (
        <span className="truncate font-medium text-[11px] leading-tight text-gray-800" title={address}>
          {address}
        </span>
      )}
    </div>
  );
}

export default AddressDisplay;
