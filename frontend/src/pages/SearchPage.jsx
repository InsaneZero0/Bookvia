import { useState, useEffect, useMemo } from 'react';
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
import { Search, SlidersHorizontal, MapPin, X, Filter, List, Map as MapIcon, Star, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';

// Lazy load map to avoid SSR issues
let MapContainer, TileLayer, Marker, Popup, useMap;
try {
  const RL = require('react-leaflet');
  MapContainer = RL.MapContainer;
  TileLayer = RL.TileLayer;
  Marker = RL.Marker;
  Popup = RL.Popup;
  useMap = RL.useMap;
} catch { /* Leaflet not available */ }

// Import leaflet CSS
try { require('leaflet/dist/leaflet.css'); } catch {}

// Fix leaflet default icon issue
try {
  const L = require('leaflet');
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
} catch {}

// Map bounds updater component
function MapBoundsUpdater({ businesses }) {
  const map = useMap();
  useEffect(() => {
    const coords = businesses.filter(b => b.latitude && b.longitude).map(b => [b.latitude, b.longitude]);
    if (coords.length > 0) {
      const L = require('leaflet');
      map.fitBounds(L.latLngBounds(coords).pad(0.1));
    }
  }, [businesses, map]);
  return null;
}

export default function SearchPage() {
  const { t, language } = useI18n();
  const { isAuthenticated } = useAuth();
  const { countryCode } = useCountry();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState([]);
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
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locatingUser, setLocatingUser] = useState(false);

  useEffect(() => {
    loadCategories();
    loadCities();
    loadFavorites();
  }, [countryCode]);

  useEffect(() => {
    loadBusinesses();
  }, [categoryId, city, minRating, homeService, requiresDeposit, sortBy, onlyFeatured, page, countryCode, userLocation]);

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
      setSortBy('nearest');
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
        setLocatingUser(false);
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
    setPriceRange([0, 5000]); setOnlyFeatured(false); setSearchParams({});
  };

  const hasActiveFilters = query || city || categoryId || minRating[0] > 0 || homeService ||
    requiresDeposit !== 'all' || sortBy !== 'relevance' || onlyFeatured;

  const mappableBusinesses = useMemo(
    () => businesses.filter(b => b.latitude && b.longitude),
    [businesses]
  );

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
        <Label className="text-xs font-medium">{language === 'es' ? 'Ordenar por' : 'Sort by'}</Label>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger data-testid="filter-sort" className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">{language === 'es' ? 'Relevancia' : 'Relevance'}</SelectItem>
            <SelectItem value="nearest">{language === 'es' ? 'Mas cercanos' : 'Nearest'}</SelectItem>
            <SelectItem value="rating">{language === 'es' ? 'Mejor calificados' : 'Top rated'}</SelectItem>
            <SelectItem value="reviews">{language === 'es' ? 'Mas resenas' : 'Most reviews'}</SelectItem>
            <SelectItem value="newest">{language === 'es' ? 'Mas recientes' : 'Newest'}</SelectItem>
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

      {/* ── Search Header ────────────────────────────── */}
      <div className="bg-muted/30 border-b border-border">
        <div className="container-app py-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={language === 'es' ? '¿Qué servicio buscas?' : 'Search service...'} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10 h-11" data-testid="search-input" />
            </div>
            <div className="relative flex-1 sm:max-w-[200px]">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={language === 'es' ? 'Ciudad' : 'City'} value={city} onChange={(e) => setCity(e.target.value)} className="pl-10 h-11" data-testid="search-city" />
            </div>
            <Button type="submit" className="h-11 btn-coral" data-testid="search-button">
              <Search className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Buscar' : 'Search'}
            </Button>
            <Button
              type="button"
              variant={sortBy === 'nearest' ? 'default' : 'outline'}
              className={`h-11 ${sortBy === 'nearest' ? 'bg-[#F05D5E] hover:bg-[#F05D5E]/90 text-white' : ''}`}
              onClick={requestLocation}
              disabled={locatingUser}
              data-testid="nearby-button"
            >
              {locatingUser ? (
                <><span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />{language === 'es' ? 'Ubicando...' : 'Locating...'}</>
              ) : (
                <><MapPin className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Cerca de ti' : 'Near you'}</>
              )}
            </Button>

            {/* View Toggle */}
            <div className="hidden md:flex items-center border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-2.5 flex items-center gap-1 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[#F05D5E] text-white' : 'hover:bg-muted'}`}
                data-testid="view-list-toggle"
              >
                <List className="h-4 w-4" />{language === 'es' ? 'Lista' : 'List'}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`px-3 py-2.5 flex items-center gap-1 text-xs font-medium transition-colors ${viewMode === 'map' ? 'bg-[#F05D5E] text-white' : 'hover:bg-muted'}`}
                data-testid="view-map-toggle"
              >
                <MapIcon className="h-4 w-4" />{language === 'es' ? 'Mapa' : 'Map'}
              </button>
            </div>

            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-11 md:hidden" data-testid="mobile-filters-button">
                  <Filter className="h-4 w-4 mr-1.5" />{language === 'es' ? 'Filtros' : 'Filters'}
                  {hasActiveFilters && <Badge className="ml-1 h-4 w-4 p-0 text-[10px] bg-[#F05D5E]">!</Badge>}
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader><SheetTitle>{language === 'es' ? 'Filtros' : 'Filters'}</SheetTitle></SheetHeader>
                <div className="mt-4"><FilterContent /></div>
              </SheetContent>
            </Sheet>
          </form>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────── */}
      <div className="container-app py-6">
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
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-heading font-bold">
                  {query ? `"${query}"` : (language === 'es' ? 'Todos los negocios' : 'All businesses')}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {businesses.length} {language === 'es' ? 'resultados' : 'results'}
                  {city && ` ${language === 'es' ? 'en' : 'in'} ${city}`}
                </p>
              </div>

              {/* Mobile View Toggle */}
              <div className="flex md:hidden items-center border rounded-lg overflow-hidden">
                <button type="button" onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-[#F05D5E] text-white' : ''}`}>
                  <List className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setViewMode('map')} className={`p-2 ${viewMode === 'map' ? 'bg-[#F05D5E] text-white' : ''}`}>
                  <MapIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

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
                {businesses.length > 0 ? businesses.map(business => (
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
                  {MapContainer ? (
                    <MapContainer
                      center={[23.6345, -102.5528]} // Mexico center
                      zoom={5}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={true}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {mappableBusinesses.map(biz => (
                        <Marker key={biz.id} position={[biz.latitude, biz.longitude]}>
                          <Popup>
                            <div className="min-w-[180px]">
                              <p className="font-bold text-sm">{biz.name}</p>
                              <p className="text-xs text-gray-500">{biz.address}, {biz.city}</p>
                              {biz.rating > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                  <span className="text-xs font-medium">{biz.rating.toFixed(1)}</span>
                                </div>
                              )}
                              <button
                                className="text-xs text-[#F05D5E] font-medium mt-2 hover:underline"
                                onClick={() => navigate(`/business/${biz.slug}`)}
                              >
                                {language === 'es' ? 'Ver perfil' : 'View profile'} →
                              </button>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                      <MapBoundsUpdater businesses={mappableBusinesses} />
                    </MapContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-muted">
                      <p className="text-sm text-muted-foreground">{language === 'es' ? 'Mapa no disponible' : 'Map not available'}</p>
                    </div>
                  )}
                </div>

                {/* Side List */}
                <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                  {businesses.length > 0 ? businesses.map(biz => (
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
                          <div className="flex items-center gap-2 mt-1.5">
                            {biz.rating > 0 && (
                              <span className="flex items-center gap-0.5 text-xs">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                <span className="font-medium">{biz.rating.toFixed(1)}</span>
                                <span className="text-muted-foreground">({biz.review_count})</span>
                              </span>
                            )}
                            {biz.category_name && <Badge variant="secondary" className="text-[10px] h-4">{biz.category_name}</Badge>}
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
      </div>
    </div>
  );
}
