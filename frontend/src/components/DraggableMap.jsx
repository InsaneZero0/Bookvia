import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon (webpack breaks Leaflet's default icon paths)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function DraggableMap({ lat, lng, onPositionChange, height = '220px' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const defaultLat = lat || 19.4326;
    const defaultLng = lng || -99.1332;

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onPositionChange?.(pos.lat, pos.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Force a resize check after render
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker & view when lat/lng change externally
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !lat || !lng) return;
    const newLatLng = L.latLng(lat, lng);
    markerRef.current.setLatLng(newLatLng);
    mapInstanceRef.current.setView(newLatLng, 16, { animate: true });
  }, [lat, lng]);

  return (
    <div
      ref={mapRef}
      style={{ height, width: '100%', borderRadius: '12px', zIndex: 0 }}
      data-testid="interactive-map"
    />
  );
}
