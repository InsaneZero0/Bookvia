import { useState, useEffect, useRef, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { MapPin, ChevronDown, X } from 'lucide-react';

export function CitySelector({ countryCode, value, onChange, placeholder, required = false }) {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load cities when country changes
  useEffect(() => {
    if (!countryCode) return;
    setLoading(true);
    const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
    fetch(`${baseUrl}/api/cities?country_code=${countryCode}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setCities(Array.isArray(data) ? data : []))
      .catch(() => setCities([]))
      .finally(() => setLoading(false));
  }, [countryCode]);

  const filtered = useMemo(() => {
    if (!search.trim()) return cities;
    const q = search.toLowerCase();
    return cities.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q)
    );
  }, [search, cities]);

  const handleSelect = (cityName) => {
    onChange(cityName);
    setSearch('');
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    onChange(val);
    if (!open) setOpen(true);
  };

  const handleClear = () => {
    onChange('');
    setSearch('');
    inputRef.current?.focus();
  };

  const displayValue = value || '';

  return (
    <div ref={wrapperRef} className="relative" data-testid="city-selector">
      <div
        className={`flex items-center gap-2 h-12 w-full rounded-md border px-3 transition-colors cursor-text ${
          open ? 'border-ring ring-1 ring-ring' : 'border-input'
        }`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={open ? search || displayValue : displayValue}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); setSearch(''); }}
          placeholder={placeholder || (language === 'es' ? 'Selecciona tu ciudad' : 'Select your city')}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          required={required}
          data-testid="city-selector-input"
        />
        {displayValue && (
          <button type="button" onClick={handleClear} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95">
          {loading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {language === 'es' ? 'Cargando ciudades...' : 'Loading cities...'}
            </div>
          ) : filtered.length > 0 ? (
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.map(c => (
                <button
                  key={c.slug || c.name}
                  type="button"
                  onClick={() => handleSelect(c.name)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-left ${
                    c.name === value ? 'bg-muted font-medium' : ''
                  }`}
                  data-testid={`city-option-${c.slug || c.name}`}
                >
                  <MapPin className="h-3.5 w-3.5 text-[#F05D5E] shrink-0" />
                  <span className="flex-1">{c.name}</span>
                  {c.state && <span className="text-xs text-muted-foreground">{c.state}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-3 px-3">
              <p className="text-sm text-muted-foreground text-center mb-1">
                {cities.length === 0
                  ? (language === 'es' ? 'Escribe el nombre de tu ciudad' : 'Type your city name')
                  : (language === 'es' ? 'No se encontró. Puedes escribir tu ciudad' : 'Not found. You can type your city')
                }
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
