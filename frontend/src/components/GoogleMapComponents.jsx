import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const LIBRARIES = ['places'];
const DEFAULT_CENTER = { lat: 19.4326, lng: -99.1332 }; // CDMX

export function useGoogleMaps() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });
  return { isLoaded, loadError };
}

export default function GoogleMapDraggable({ lat, lng, onPositionChange, height = '260px', draggable = true }) {
  const { isLoaded } = useGoogleMaps();
  const [markerPos, setMarkerPos] = useState({ lat: lat || DEFAULT_CENTER.lat, lng: lng || DEFAULT_CENTER.lng });
  const mapRef = useRef(null);

  useEffect(() => {
    if (lat && lng) {
      setMarkerPos({ lat, lng });
      if (mapRef.current) {
        mapRef.current.panTo({ lat, lng });
      }
    }
  }, [lat, lng]);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const onMarkerDragEnd = useCallback((e) => {
    const newLat = e.latLng.lat();
    const newLng = e.latLng.lng();
    setMarkerPos({ lat: newLat, lng: newLng });
    onPositionChange?.(newLat, newLng);
  }, [onPositionChange]);

  const onMapClick = useCallback((e) => {
    if (!draggable) return;
    const newLat = e.latLng.lat();
    const newLng = e.latLng.lng();
    setMarkerPos({ lat: newLat, lng: newLng });
    onPositionChange?.(newLat, newLng);
  }, [draggable, onPositionChange]);

  if (!isLoaded) {
    return (
      <div style={{ height, width: '100%', borderRadius: '12px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        data-testid="google-map-loading">
        <span style={{ color: '#888', fontSize: '14px' }}>Cargando mapa...</span>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ height, width: '100%', borderRadius: '12px' }}
      center={markerPos}
      zoom={16}
      onLoad={onLoad}
      onClick={onMapClick}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        zoomControl: true,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      }}
      data-testid="google-map"
    >
      <Marker
        position={markerPos}
        draggable={draggable}
        onDragEnd={onMarkerDragEnd}
      />
    </GoogleMap>
  );
}

export function GooglePlacesAutocomplete({ value, onChange, onSelect, placeholder, language = 'es', countryCode = 'mx', className }) {
  const { isLoaded } = useGoogleMaps();
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: countryCode },
      fields: ['address_components', 'geometry', 'formatted_address', 'name'],
      types: ['address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;

      const components = {};
      for (const comp of place.address_components || []) {
        for (const type of comp.types) {
          components[type] = comp.long_name;
          if (type === 'administrative_area_level_1') {
            components['state_short'] = comp.short_name;
          }
        }
      }

      onSelect?.({
        formatted_address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        street: components.route || '',
        street_number: components.street_number || '',
        colony: components.sublocality_level_1 || components.sublocality || components.neighborhood || '',
        city: components.locality || components.administrative_area_level_2 || '',
        state: components.administrative_area_level_1 || '',
        zip: components.postal_code || '',
        country: components.country || '',
      });
    });

    autocompleteRef.current = autocomplete;
  }, [isLoaded, countryCode, onSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      className={className || 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'}
      data-testid="google-places-autocomplete"
    />
  );
}

export function GoogleMapStatic({ lat, lng, height = '200px' }) {
  const { isLoaded } = useGoogleMaps();

  if (!isLoaded || !lat || !lng) {
    return (
      <div style={{ height, width: '100%', borderRadius: '12px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#888', fontSize: '14px' }}>Cargando mapa...</span>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ height, width: '100%', borderRadius: '12px' }}
      center={{ lat, lng }}
      zoom={15}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        zoomControl: false,
        draggable: false,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      }}
      data-testid="google-map-static"
    >
      <Marker position={{ lat, lng }} />
    </GoogleMap>
  );
}
