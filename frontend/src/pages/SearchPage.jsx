import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BusinessCard } from '@/components/BusinessCard';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { useCountry } from '@/lib/countryContext';
import { businessesAPI, categoriesAPI, usersAPI } from '@/lib/api';
import { Search, SlidersHorizontal, MapPin, X, Filter, List, Map as MapIcon, Star, ArrowRight, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';

const GMAP_LIBRARIES = ['places'];

function SearchGoogleMap({ businesses, navigate, language }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY,
    libraries: GMAP_LIBRARIES,
  });
  const [selectedBiz, setSelectedBiz] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || businesses.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    businesses.forEach(b => {
      if (b.latitude && b.longitude) bounds.extend({ lat: b.latitude, lng: b.longitude });
    });
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, { padding: 50 });
  }, [isLoaded, businesses]);

  if (!isLoaded) {
    return <div className="h-full flex items-center justify-center bg-muted"><p className="text-sm text-muted-foreground">Cargando mapa...</p></div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={{ height: '100%', width: '100%' }}
      center={{ lat: 23.6345, lng: -102.5528 }}
      zoom={5}
      onLoad={map => { mapRef.current = map; }}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
    >
      {businesses.map(biz => (
        <Marker
          key={biz.id}
          position={{ lat: biz.latitude, lng: biz.longitude }}
          onClick={() => setSelectedBiz(biz)}
        />
      ))}
      {selectedBiz && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'white', borderRadius: 12, padding: '12px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          minWidth: 220, zIndex: 10,
        }}>
          <button onClick={() => setSelectedBiz(null)} style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>x</button>
          <p style={{ fontWeight: 600, fontSize: 14 }}>{selectedBiz.name}</p>
          <p style={{ fontSize: 12, color: '#666' }}>{selectedBiz.address}, {selectedBiz.city}</p>
          {selectedBiz.rating > 0 && (
            <p style={{ fontSize: 12, marginTop: 4 }}>
              <Star style={{ width: 12, height: 12, display: 'inline', fill: '#facc15', color: '#facc15' }} /> {selectedBiz.rating.toFixed(1)}
            </p>
          )}
          <button
            onClick={() => navigate(`/business/${selectedBiz.slug}`)}
            style={{ fontSize: 12, color: '#F05D5E', fontWeight: 600, marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {language === 'es' ? 'Ver perfil' : 'View profile'} →
          </button>
        </div>
      )}
    </GoogleMap>
  );
}

export default function SearchPage() {
  const { t, language } = useI18n();
  const { isAuthenticated } = useAuth();
  const { countryCode } = useCountry();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState([]);
  const [featuredBusinesses, setFeaturedBusinesses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [hoveredBiz, setHoveredBiz] = useState(null);

  // Filters
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [categoryId, setCategoryId] = useState(searchParams.get('category') || '');
  const [minRating, setMinRating] = useState([parseFloat(searchParams.get('rating')) || 0]);
  const [homeService, setHomeService] = useState(searchParams.get('home_service') === 'true');
  const [requiresDeposit, setRequiresDeposit] = useState(searchParams.get('deposit') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'relevance');
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [onlyFeatured, setOnlyFeatured] = useState(searchParams.get('featured') === 'true');
  const [openNow, setOpenNow] = useState(searchParams.get('open_now') === 'true');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locatingUser, setLocatingUser] = useState(false);

  useEffect(() => {
    loadCategories();
    loadCities();
    loadFavorites();
    loadFeatured();
  }, [countryCode]);

  useEffect(() => {
    loadBusinesses();
  }, [categoryId, city, minRating, homeService, requiresDeposit, sortBy, onlyFeatured, page, countryCode, userLocation]);

  // Show category browse view when no specific filters/query are active
  const showCategoriesView = !query && !city && (!categoryId || categoryId === 'all') &&
    !homeService && !onlyFeatured && minRating[0] === 0 && requiresDeposit === 'all' &&
    sortBy === 'relevance' && !userLocation;

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === categoryId || c.slug === categoryId),
    [categories, categoryId]
  );

  const handleCategorySelect = (cat) => {
    setCategoryId(cat.id);
    const params = new URLSearchParams(searchParams);
    params.set('category', cat.id);
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToCategories = () => {
    clearFilters();
    setSearchParams({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadFeatured = async () => {
    try {
      const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
      const res = await fetch(`${baseUrl}/api/businesses/featured?limit=3${countryCode ? `&country_code=${countryCode}` : ''}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFeaturedBusinesses(Array.isArray(data) ? data : []);
    } catch {
      setFeaturedBusinesses([]);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await categoriesAPI.getAll();
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch { setCategories([]); }
  };

  const loadCities = async () => {
    try {
      const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
      const res = await fetch(`${baseUrl}/api/cities?country_code=${countryCode}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCities(Array.isArray(data) ? data : []);
    } catch {
      setCities([]);
    }
  };

  const loadFavorites = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await usersAPI.getFavorites();
      setFavorites((Array.isArray(res.data) ? res.data : []).map(b => b.id));
    } catch { setFavorites([]); }
  };

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const params = {
        query: query || undefined,
        category_id: categoryId && categoryId !== 'all' ? categoryId : undefined,
        city: city || undefined,
        country_code: countryCode || undefined,
        min_rating: minRating[0] > 0 ? minRating[0] : undefined,
        is_home_service: homeService || undefined,
        page, limit: 20,
      };
      if (userLocation) {
        params.user_lat = userLocation.lat;
        params.user_lng = userLocation.lng;
        if (sortBy === 'nearest') params.sort = 'nearest';
      }
      const res = await businessesAPI.search(params);
      setBusinesses(Array.isArray(res.data) ? res.data : []);
    } catch { setBusinesses([]); }
    finally { setLoading(false); }
  };

  const requestLocation = () => {
    if (userLocation) {
      // Already have location, just switch to nearest sort and clear restrictive filters
      setSortBy('nearest');
      setCity('');
      setCategoryId('');
      setMinRating([0]);
      setOnlyFeatured(false);
      return;
    }
    if (!navigator.geolocation) {
      toast.error(language === 'es' ? 'Tu navegador no soporta geolocalizacion' : 'Your browser does not support geolocation');
      return;
    }
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortBy('nearest');
        // Clear restrictive filters so more businesses appear
        setCity('');
        setCategoryId('');
        setMinRating([0]);
        setOnlyFeatured(false);
        setLocatingUser(false);
        toast.success(language === 'es' ? 'Ubicacion obtenida. Mostrando negocios cercanos.' : 'Location obtained. Showing nearby businesses.');
      },
      () => {
        toast.error(language === 'es' ? 'No pudimos obtener tu ubicacion. Permite el acceso en tu navegador.' : 'Could not get your location. Allow access in your browser.');
        setLocatingUser(false);
      },
      { timeout: 10000 }
    );
  };

  const handleSearch = (e) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (city) params.set('city', city);
    if (categoryId && categoryId !== 'all') params.set('category', categoryId);
    if (minRating[0] > 0) params.set('rating', minRating[0].toString());
    if (homeService) params.set('home_service', 'true');
    if (requiresDeposit !== 'all') params.set('deposit', requiresDeposit);
    if (sortBy !== 'relevance') params.set('sort', sortBy);
    if (onlyFeatured) params.set('featured', 'true');
    setSearchParams(params);
    setFiltersOpen(false);
    loadBusinesses();
  };

  const handleFavorite = async (businessId) => {
    if (!isAuthenticated) { navigate('/login'); return; }
    try {
      if (favorites.includes(businessId)) {
        await usersAPI.removeFavorite(businessId);
        setFavorites(prev => prev.filter(id => id !== businessId));
        toast.success(language === 'es' ? 'Eliminado de favoritos' : 'Removed from favorites');
      } else {
        await usersAPI.addFavorite(businessId);
        setFavorites(prev => [...prev, businessId]);
        toast.success(language === 'es' ? 'Agregado a favoritos' : 'Added to favorites');
      }
    } catch { toast.error('Error'); }
  };

  const clearFilters = () => {
    setQuery(''); setCity(''); setCategoryId(''); setMinRating([0]);
    setHomeService(false); setRequiresDeposit('all'); setSortBy('relevance');
    setPriceRange([0, 5000]); setOnlyFeatured(false); setOpenNow(false); setSearchParams({});
  };

  const hasActiveFilters = query || city || categoryId || minRating[0] > 0 || homeService ||
    requiresDeposit !== 'all' || sortBy !== 'relevance' || onlyFeatured || openNow;

  const mappableBusinesses = useMemo(
    () => businesses.filter(b => b.latitude && b.longitude),
    [businesses]
  );

  // Filter results client-side: open now toggle
  const filteredBusinesses = useMemo(
    () => openNow ? businesses.filter(b => b.is_open_now === true) : businesses,
    [businesses, openNow]
  );

  const filteredMappable = useMemo(
    () => filteredBusinesses.filter(b => b.latitude && b.longitude),
    [filteredBusinesses]
  );

  const sortChips = [
    { id: 'relevance', label_es: 'Relevancia', label_en: 'Relevance' },
    { id: 'nearest', label_es: 'Más cercanos', label_en: 'Nearest' },
    { id: 'rating', label_es: 'Mejor calificados', label_en: 'Top rated' },
    { id: 'reviews', label_es: 'Más reseñas', label_en: 'Most reviews' },
    { id: 'newest', label_es: 'Más recientes', label_en: 'Newest' },
  ];

  const FilterContent = () => (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{language === 'es' ? 'Categoría' : 'Category'}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger data-testid="filter-category" className="h-9">
            <SelectValue placeholder={language === 'es' ? 'Todas' : 'All'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === 'es' ? 'Todas las categorías' : 'All categories'}</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{language === 'es' ? cat.name_es : cat.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{language === 'es' ? 'Ciudad' : 'City'}</Label>
        <Select value={city || 'all'} onValueChange={(v) => setCity(v === 'all' ? '' : v)}>
          <SelectTrigger data-testid="filter-city" className="h-9">
            <SelectValue placeholder={language === 'es' ? 'Todas' : 'All'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === 'es' ? 'Todas las ciudades' : 'All cities'}</SelectItem>
            {cities.map(c => <SelectItem key={c.slug} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{language === 'es' ? 'Calificación mínima' : 'Min rating'}: {minRating[0]} <Star className="inline h-3 w-3 fill-yellow-400 text-yellow-400" /></Label>
        <Slider value={minRating} onValueChange={setMinRating} min={0} max={5} step={0.5} className="py-3" data-testid="filter-rating" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{language === 'es' ? 'Precio' : 'Price'}: ${priceRange[0]} - ${priceRange[1]}</Label>
        <Slider value={priceRange} onValueChange={setPriceRange} min={0} max={5000} step={100} className="py-3" data-testid="filter-price" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">{language === 'es' ? 'Anticipo' : 'Deposit'}</Label>
        <Select value={requiresDeposit} onValueChange={setRequiresDeposit}>
          <SelectTrigger data-testid="filter-deposit" className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === 'es' ? 'Todos' : 'All'}</SelectItem>
            <SelectItem value="no">{language === 'es' ? 'Sin anticipo' : 'No deposit'}</SelectItem>
            <SelectItem value="yes">{language === 'es' ? 'Con anticipo' : 'With deposit'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2.5 pt-2">
        <div className="flex items-center gap-2">
          <Checkbox id="home-service" checked={homeService} onCheckedChange={setHomeService} data-testid="filter-home-service" />
          <Label htmlFor="home-service" className="cursor-pointer text-xs">{language === 'es' ? 'Servicio a domicilio' : 'Home service'}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="featured" checked={onlyFeatured} onCheckedChange={setOnlyFeatured} data-testid="filter-featured" />
          <Label htmlFor="featured" className="cursor-pointer text-xs">{language === 'es' ? 'Solo destacados' : 'Featured only'}</Label>
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t">
        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters} className="flex-1 h-9 text-xs">
            <X className="h-3.5 w-3.5 mr-1" />{language === 'es' ? 'Limpiar' : 'Clear'}
          </Button>
        )}
        <Button onClick={handleSearch} className="flex-1 btn-coral h-9 text-xs">{language === 'es' ? 'Aplicar' : 'Apply'}</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="search-page">

      {/* ── Search Header (compact) ────────────────── */}
      <div className="bg-muted/30 border-b border-border sticky top-16 z-30 backdrop-blur-sm">
        <div className="container-app py-3">
          <form onSubmit={handleSearch} className="flex flex-col lg:flex-row gap-2 lg:items-center">
            {/* Main search row */}
            <div className="flex flex-1 gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={language === 'es' ? '¿Qué servicio buscas?' : 'Search service...'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10 h-10 bg-white border-border/60"
                  data-testid="search-input"
                />
              </div>
              <div className="relative w-32 sm:w-44 shrink-0">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={language === 'es' ? 'Ciudad' : 'City'}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="pl-10 h-10 bg-white border-border/60"
                  data-testid="search-city"
                />
              </div>
              <Button type="submit" className="h-10 btn-coral shrink-0 px-4" data-testid="search-button">
                <Search className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{language === 'es' ? 'Buscar' : 'Search'}</span>
              </Button>
            </div>

            {/* Secondary actions row - neutral pills */}
            <div className="flex items-center gap-1.5 lg:ml-auto">
              <button
                type="button"
                onClick={requestLocation}
                disabled={locatingUser}
                className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition-colors border ${
                  sortBy === 'nearest'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-border/60 hover:bg-slate-50'
                }`}
                data-testid="nearby-button"
              >
                {locatingUser ? (
                  <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5" />
                )}
                {locatingUser
                  ? (language === 'es' ? 'Ubicando...' : 'Locating...')
                  : (language === 'es' ? 'Cerca de ti' : 'Near you')}
              </button>

              {/* View Toggle - neutral segmented */}
              <div className="hidden md:inline-flex items-center bg-white border border-border/60 rounded-full p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 h-8 inline-flex items-center gap-1 text-xs font-medium rounded-full transition-colors ${
                    viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  data-testid="view-list-toggle"
                >
                  <List className="h-3.5 w-3.5" />{language === 'es' ? 'Lista' : 'List'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('map')}
                  className={`px-3 h-8 inline-flex items-center gap-1 text-xs font-medium rounded-full transition-colors ${
                    viewMode === 'map' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  data-testid="view-map-toggle"
                >
                  <MapIcon className="h-3.5 w-3.5" />{language === 'es' ? 'Mapa' : 'Map'}
                </button>
              </div>

              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-9 md:hidden rounded-full px-3 text-xs" data-testid="mobile-filters-button">
                    <Filter className="h-3.5 w-3.5 mr-1.5" />{language === 'es' ? 'Filtros' : 'Filters'}
                    {hasActiveFilters && <Badge className="ml-1 h-4 w-4 p-0 text-[10px] bg-[#F05D5E]">!</Badge>}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader><SheetTitle>{language === 'es' ? 'Filtros' : 'Filters'}</SheetTitle></SheetHeader>
                  <div className="mt-4"><FilterContent /></div>
                </SheetContent>
              </Sheet>
            </div>
          </form>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────── */}
      <div className="container-app py-6">
        {showCategoriesView ? (
          /* ═════════════ CATEGORIES BROWSE VIEW ═════════════ */
          <div className="space-y-10" data-testid="categories-browse-view">
            {/* Hero copy */}
            <div className="text-center max-w-2xl mx-auto pt-2">
              <h1 className="font-heading font-bold text-3xl sm:text-4xl mb-2 text-slate-900">
                {language === 'es' ? '¿Qué necesitas hoy?' : 'What do you need today?'}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                {language === 'es'
                  ? 'Elige una categoría para ver los negocios disponibles cerca de ti.'
                  : 'Pick a category to see available businesses near you.'}
              </p>
            </div>

            {/* Categories grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="categories-grid">
              {categories.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] rounded-2xl bg-slate-100 animate-pulse" />
                ))
              ) : categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-border/50 hover:border-[#F05D5E]/40 transition-all hover:shadow-lg text-left"
                  data-testid={`category-card-${cat.slug}`}
                >
                  {cat.image_url ? (
                    <img
                      src={cat.image_url}
                      alt={language === 'es' ? cat.name_es : cat.name_en}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#F05D5E]/30 to-[#1a2844]/30" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                    <h3 className="font-heading font-bold text-white text-base sm:text-lg leading-tight line-clamp-2">
                      {language === 'es' ? cat.name_es : cat.name_en}
                    </h3>
                    <p className="text-xs text-white/85 mt-0.5">
                      {cat.business_count > 0
                        ? `${cat.business_count} ${language === 'es' ? (cat.business_count === 1 ? 'negocio' : 'negocios') : (cat.business_count === 1 ? 'business' : 'businesses')}`
                        : (language === 'es' ? 'Próximamente' : 'Coming soon')}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Quick actions row */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={requestLocation}
                disabled={locatingUser}
                className="h-9 px-4 inline-flex items-center gap-1.5 rounded-full text-xs font-medium bg-white border border-border/60 text-slate-700 hover:bg-slate-50 transition-colors"
                data-testid="cat-view-nearby"
              >
                <MapPin className="h-3.5 w-3.5" />
                {language === 'es' ? 'Mostrar negocios cerca de ti' : 'Show businesses near me'}
              </button>
              <button
                type="button"
                onClick={() => { setSortBy('rating'); }}
                className="h-9 px-4 inline-flex items-center gap-1.5 rounded-full text-xs font-medium bg-white border border-border/60 text-slate-700 hover:bg-slate-50 transition-colors"
                data-testid="cat-view-all"
              >
                <Star className="h-3.5 w-3.5" />
                {language === 'es' ? 'Ver todos los negocios' : 'View all businesses'}
              </button>
            </div>

            {/* Featured businesses preview */}
            {featuredBusinesses.length > 0 && (
              <div className="pt-6 border-t border-border/40" data-testid="featured-section">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <h2 className="font-heading font-bold text-xl text-slate-900">
                      {language === 'es' ? 'Destacados de la semana' : 'Featured this week'}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === 'es' ? 'Los mejor calificados de la plataforma' : 'Top rated on the platform'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featuredBusinesses.slice(0, 3).map(b => (
                    <BusinessCard
                      key={b.id}
                      business={b}
                      onFavorite={handleFavorite}
                      isFavorite={favorites.includes(b.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
        /* ═════════════ RESULTS VIEW (categories browse skipped) ═════════════ */
        <>
        {/* Breadcrumb when a category is selected */}
        {selectedCategory && (
          <div className="flex items-center gap-2 mb-4 text-sm" data-testid="category-breadcrumb">
            <button
              onClick={handleBackToCategories}
              className="text-muted-foreground hover:text-[#F05D5E] transition-colors"
              data-testid="back-to-categories"
            >
              {language === 'es' ? 'Categorías' : 'Categories'}
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-slate-900">
              {language === 'es' ? selectedCategory.name_es : selectedCategory.name_en}
            </span>
          </div>
        )}
        <div className="flex gap-6">

          {/* Desktop Filters Sidebar */}
          <aside className="hidden md:block w-56 flex-shrink-0">
            <div className="sticky top-24">
              <h3 className="font-heading font-bold text-sm mb-4 flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                {language === 'es' ? 'Filtros' : 'Filters'}
                {hasActiveFilters && <Badge variant="outline" className="text-[10px] h-4 px-1">{language === 'es' ? 'Activos' : 'Active'}</Badge>}
              </h3>
              <FilterContent />
            </div>
          </aside>

          {/* Results Area */}
          <main className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-xl font-heading font-bold">
                  {sortBy === 'nearest' && userLocation
                    ? (language === 'es' ? 'Negocios cerca de ti' : 'Businesses near you')
                    : query ? `"${query}"` : (language === 'es' ? 'Todos los negocios' : 'All businesses')}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredBusinesses.length} {language === 'es' ? 'resultados' : 'results'}
                  {city && ` ${language === 'es' ? 'en' : 'in'} ${city}`}
                  {openNow && ` · ${language === 'es' ? 'abiertos ahora' : 'open now'}`}
                  {sortBy === 'nearest' && userLocation && businesses.length > 0 && businesses[0]?.distance_km != null && (
                    <> &mdash; {language === 'es' ? 'el más cercano a' : 'closest at'} {businesses[0].distance_km} km</>
                  )}
                </p>
              </div>

              {/* Mobile View Toggle */}
              <div className="flex md:hidden items-center bg-white border border-border/60 rounded-full p-0.5">
                <button type="button" onClick={() => setViewMode('list')} className={`p-1.5 rounded-full ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                  <List className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setViewMode('map')} className={`p-1.5 rounded-full ${viewMode === 'map' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                  <MapIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Quick chips: Open now + Sort */}
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-border/50" data-testid="sort-chips-row">
              <button
                type="button"
                onClick={() => setOpenNow(v => !v)}
                className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium border transition-colors ${
                  openNow
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-border/60 hover:bg-emerald-50 hover:border-emerald-300'
                }`}
                data-testid="open-now-chip"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${openNow ? 'bg-white' : 'bg-emerald-500'}`} />
                {language === 'es' ? 'Abierto ahora' : 'Open now'}
              </button>

              <span className="hidden sm:inline-block w-px h-5 bg-border/60 mx-1" />

              <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">
                {language === 'es' ? 'Ordenar:' : 'Sort:'}
              </span>
              {sortChips.map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSortBy(chip.id)}
                  className={`h-8 px-3 inline-flex items-center rounded-full text-xs font-medium border transition-colors ${
                    sortBy === chip.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-border/60 hover:bg-slate-50'
                  }`}
                  data-testid={`sort-chip-${chip.id}`}
                >
                  {language === 'es' ? chip.label_es : chip.label_en}
                </button>
              ))}
            </div>

            {/* Proximity info banner */}
            {sortBy === 'nearest' && userLocation && !loading && businesses.length > 0 && (
              <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300" data-testid="proximity-banner">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>
                  {(() => {
                    const withDist = businesses.filter(b => b.distance_km != null);
                    const closestDist = withDist.length > 0 ? withDist[0].distance_km : null;
                    const farthestDist = withDist.length > 0 ? withDist[withDist.length - 1].distance_km : null;
                    if (withDist.length === 0) {
                      return language === 'es'
                        ? 'Los negocios mostrados aún no han configurado su ubicación exacta.'
                        : 'Shown businesses have not set their exact location yet.';
                    }
                    return language === 'es'
                      ? `Mostrando ${withDist.length} negocios de ${closestDist} km a ${farthestDist} km de distancia.`
                      : `Showing ${withDist.length} businesses from ${closestDist} km to ${farthestDist} km away.`;
                  })()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs text-emerald-600 hover:text-emerald-800"
                  onClick={() => { setSortBy('relevance'); setUserLocation(null); }}
                  data-testid="clear-proximity"
                >
                  <X className="h-3 w-3 mr-1" />{language === 'es' ? 'Quitar' : 'Clear'}
                </Button>
              </div>
            )}

            {/* No results with proximity */}
            {sortBy === 'nearest' && userLocation && !loading && businesses.length === 0 && (
              <div className="text-center py-12">
                <MapPin className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <h2 className="text-lg font-heading font-bold mb-2">
                  {language === 'es' ? 'No encontramos negocios cerca de ti' : 'No businesses found near you'}
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === 'es'
                    ? 'Intenta buscar en otra ciudad o quita el filtro de cercanía.'
                    : 'Try searching in another city or remove the proximity filter.'}
                </p>
                <Button variant="outline" onClick={() => { setSortBy('relevance'); setUserLocation(null); }}>
                  {language === 'es' ? 'Ver todos los negocios' : 'View all businesses'}
                </Button>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1,2,3,4].map(i => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-[4/3]" />
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : viewMode === 'list' ? (
              /* ── List View ──────────────────────────── */
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="results-list">
                {filteredBusinesses.length > 0 ? filteredBusinesses.map(business => (
                  <div key={business.id} onMouseEnter={() => setHoveredBiz(business.id)} onMouseLeave={() => setHoveredBiz(null)}>
                    <BusinessCard business={business} onFavorite={handleFavorite} isFavorite={favorites.includes(business.id)} />
                  </div>
                )) : (
                  <div className="col-span-full">
                    <Card className="p-8 sm:p-12 text-center border-dashed" data-testid="no-results-card">
                      <div className="max-w-md mx-auto space-y-4">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#F05D5E]/10 mx-auto">
                          <MapPin className="h-8 w-8 text-[#F05D5E]" />
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-lg mb-1">
                            {language === 'es'
                              ? (city && query
                                ? `No hay negocios de "${query}" en ${city}`
                                : city
                                  ? `Aún no hay negocios en ${city}`
                                  : query
                                    ? `No encontramos resultados para "${query}"`
                                    : 'No encontramos resultados')
                              : (city && query
                                ? `No "${query}" businesses in ${city}`
                                : city
                                  ? `No businesses in ${city} yet`
                                  : query
                                    ? `No results for "${query}"`
                                    : 'No results found')}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {language === 'es'
                              ? 'Estamos creciendo. Pronto habrá más opciones disponibles.'
                              : "We're growing. More options will be available soon."}
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                          {hasActiveFilters && (
                            <Button onClick={clearFilters} variant="outline" size="sm" data-testid="clear-filters-btn">
                              <X className="h-3.5 w-3.5 mr-1" />
                              {language === 'es' ? 'Limpiar filtros' : 'Clear filters'}
                            </Button>
                          )}
                          <Button
                            onClick={() => navigate('/business/register')}
                            size="sm"
                            className="btn-coral"
                            data-testid="register-business-empty-cta"
                          >
                            {language === 'es' ? '¿Tienes un negocio? Regístralo aquí' : 'Have a business? Register it here'}
                            <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              /* ── Map View ───────────────────────────── */
              <div className="grid lg:grid-cols-2 gap-4" data-testid="results-map-view">
                {/* Map */}
                <div className="h-[500px] lg:h-[calc(100vh-200px)] rounded-xl overflow-hidden border sticky top-24" data-testid="search-map">
                  <SearchGoogleMap businesses={filteredMappable} navigate={navigate} language={language} />
                </div>

                {/* Side List */}
                <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                  {filteredBusinesses.length > 0 ? filteredBusinesses.map(biz => (
                    <Card
                      key={biz.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${hoveredBiz === biz.id ? 'border-[#F05D5E] shadow-md' : 'border-border/60'}`}
                      onClick={() => navigate(`/business/${biz.slug}`)}
                      onMouseEnter={() => setHoveredBiz(biz.id)}
                      onMouseLeave={() => setHoveredBiz(null)}
                      data-testid={`map-result-${biz.id}`}
                    >
                      <CardContent className="p-3 flex gap-3">
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                          <img
                            src={biz.photos?.[0] || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200'}
                            alt={biz.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-heading font-semibold text-sm truncate">{biz.name}</h3>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            <MapPin className="inline h-3 w-3 mr-0.5" />{biz.address}, {biz.city}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {biz.rating > 0 && (
                              <span className="flex items-center gap-0.5 text-xs">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                <span className="font-medium">{biz.rating.toFixed(1)}</span>
                                <span className="text-muted-foreground">({biz.review_count})</span>
                              </span>
                            )}
                            {biz.category_name && <Badge variant="secondary" className="text-[10px] h-4">{biz.category_name}</Badge>}
                            {biz.next_available_text && (
                              <span className="text-[10px] font-medium text-emerald-600">{biz.next_available_text}</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">{language === 'es' ? 'No hay resultados' : 'No results'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
