import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Star, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// Leaflet's default icon uses webpack image imports that break with CRA builds,
// so we ship inline SVG icons sized to match our aesthetic.
const makePinIcon = (color) =>
  L.divIcon({
    className: 'bookvia-map-pin',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -32],
    html: `
      <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="${color}"/>
        <circle cx="14" cy="14" r="5" fill="white"/>
      </svg>`,
  });

const BIZ_ICON = makePinIcon('#F05D5E');
const USER_ICON = L.divIcon({
  className: 'bookvia-user-pin',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: `
    <span style="display:block;width:16px;height:16px;border-radius:50%;
                 background:#1e40af;border:3px solid white;
                 box-shadow:0 0 0 2px rgba(30,64,175,0.25);"></span>`,
});

/** Fits the map bounds to all pins every time the business list or user
 *  location changes. Lives inside MapContainer to access the instance. */
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

/**
 * Leaflet-powered search map. Zero-cost (OpenStreetMap tiles) replacement
 * for the previous Google Maps integration.
 */
export function SearchLeafletMap({ businesses, navigate, userLocation }) {
  const { language } = useI18n();
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);

  // Defer mount until layout settles so Leaflet measures the right height.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const mappable = businesses.filter(b => b.latitude && b.longitude);
  const points = mappable.map(b => [b.latitude, b.longitude]);
  if (userLocation) points.push([userLocation.lat, userLocation.lng]);

  const defaultCenter = userLocation
    ? [userLocation.lat, userLocation.lng]
    : mappable.length
      ? [mappable[0].latitude, mappable[0].longitude]
      : [23.6345, -102.5528]; // Mexico center

  if (!ready) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">
          {language === 'es' ? 'Cargando mapa...' : 'Loading map...'}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full" data-testid="search-leaflet-map">
      <MapContainer
        center={defaultCenter}
        zoom={userLocation ? 13 : 5}
        scrollWheelZoom
        className="h-full w-full rounded-xl"
        style={{ minHeight: 420 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={USER_ICON}>
            <Popup>
              <span className="text-xs font-semibold">
                {language === 'es' ? 'Tu ubicación' : 'Your location'}
              </span>
            </Popup>
          </Marker>
        )}

        {mappable.map(biz => (
          <Marker
            key={biz.id}
            position={[biz.latitude, biz.longitude]}
            icon={BIZ_ICON}
          >
            <Popup minWidth={220}>
              <div className="space-y-1">
                <p className="font-heading font-bold text-sm leading-tight">{biz.name}</p>
                <p className="text-xs text-slate-500 leading-tight">
                  {biz.address ? `${biz.address}, ${biz.city}` : biz.city}
                </p>
                {biz.rating > 0 && (
                  <p className="text-xs flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="font-semibold">{biz.rating.toFixed(1)}</span>
                    {biz.review_count > 0 && (
                      <span className="text-slate-400">({biz.review_count})</span>
                    )}
                  </p>
                )}
                {biz.distance_km != null && (
                  <p className="text-xs text-[#F05D5E] font-semibold">
                    {biz.distance_km} km {language === 'es' ? 'de ti' : 'from you'}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/business/${biz.slug || biz.id}`)}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#F05D5E] hover:underline"
                >
                  {language === 'es' ? 'Ver perfil' : 'View profile'}
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
