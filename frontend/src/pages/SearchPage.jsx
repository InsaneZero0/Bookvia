import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { BusinessCard } from '@/components/BusinessCard';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { businessesAPI, categoriesAPI, usersAPI } from '@/lib/api';
import { Search, SlidersHorizontal, MapPin, X, Filter } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';

export default function SearchPage() {
  const { t, language } = useI18n();
  const { isAuthenticated, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [businesses, setBusinesses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  
  // Filters
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [categoryId, setCategoryId] = useState(searchParams.get('category') || '');
  const [minRating, setMinRating] = useState([parseFloat(searchParams.get('rating')) || 0]);
  const [homeService, setHomeService] = useState(searchParams.get('home_service') === 'true');
  const [page, setPage] = useState(1);
  
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    loadCategories();
    loadFavorites();
  }, []);

  useEffect(() => {
    loadBusinesses();
  }, [categoryId, city, minRating, homeService, page]);

  const loadCategories = async () => {
    try {
      const res = await categoriesAPI.getAll();
      setCategories(res.data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadFavorites = async () => {
    if (isAuthenticated) {
      try {
        const res = await usersAPI.getFavorites();
        setFavorites(res.data.map(b => b.id));
      } catch (error) {
        console.error('Error loading favorites:', error);
      }
    }
  };

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const params = {
        query: query || undefined,
        category_id: categoryId || undefined,
        city: city || undefined,
        min_rating: minRating[0] > 0 ? minRating[0] : undefined,
        is_home_service: homeService || undefined,
        page,
        limit: 20,
      };
      const res = await businessesAPI.search(params);
      setBusinesses(res.data);
    } catch (error) {
      console.error('Error loading businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (city) params.set('city', city);
    if (categoryId) params.set('category', categoryId);
    if (minRating[0] > 0) params.set('rating', minRating[0].toString());
    if (homeService) params.set('home_service', 'true');
    setSearchParams(params);
    loadBusinesses();
  };

  const handleFavorite = async (businessId) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

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
    } catch (error) {
      toast.error(language === 'es' ? 'Error al actualizar favoritos' : 'Error updating favorites');
    }
  };

  const clearFilters = () => {
    setQuery('');
    setCity('');
    setCategoryId('');
    setMinRating([0]);
    setHomeService(false);
    setSearchParams({});
  };

  const hasActiveFilters = query || city || categoryId || minRating[0] > 0 || homeService;

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Category */}
      <div className="space-y-2">
        <Label>{language === 'es' ? 'Categoría' : 'Category'}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger data-testid="filter-category">
            <SelectValue placeholder={language === 'es' ? 'Todas las categorías' : 'All categories'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">
              {language === 'es' ? 'Todas las categorías' : 'All categories'}
            </SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>
                {language === 'es' ? cat.name_es : cat.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rating */}
      <div className="space-y-2">
        <Label>{language === 'es' ? 'Calificación mínima' : 'Minimum rating'}: {minRating[0]}</Label>
        <Slider
          value={minRating}
          onValueChange={setMinRating}
          min={0}
          max={5}
          step={0.5}
          className="py-4"
          data-testid="filter-rating"
        />
      </div>

      {/* Home Service */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="home-service"
          checked={homeService}
          onCheckedChange={setHomeService}
          data-testid="filter-home-service"
        />
        <Label htmlFor="home-service" className="cursor-pointer">
          {language === 'es' ? 'Servicio a domicilio' : 'Home service'}
        </Label>
      </div>

      {/* Clear & Apply */}
      <div className="flex gap-2 pt-4">
        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters} className="flex-1">
            <X className="h-4 w-4 mr-2" />
            {language === 'es' ? 'Limpiar' : 'Clear'}
          </Button>
        )}
        <Button onClick={handleSearch} className="flex-1 btn-coral">
          {language === 'es' ? 'Aplicar' : 'Apply'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="search-page">
      {/* Search Header */}
      <div className="bg-muted/30 border-b border-border">
        <div className="container-app py-6">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={t('hero.search.service')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-12 h-12"
                data-testid="search-input"
              />
            </div>
            <div className="relative flex-1 md:max-w-xs">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={t('hero.search.city')}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="pl-12 h-12"
                data-testid="search-city"
              />
            </div>
            <Button type="submit" className="h-12 btn-coral" data-testid="search-button">
              {t('hero.search.button')}
            </Button>
            
            {/* Mobile Filters */}
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-12 md:hidden" data-testid="mobile-filters-button">
                  <Filter className="h-5 w-5 mr-2" />
                  {language === 'es' ? 'Filtros' : 'Filters'}
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{language === 'es' ? 'Filtros' : 'Filters'}</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <FilterContent />
                </div>
              </SheetContent>
            </Sheet>
          </form>
        </div>
      </div>

      <div className="container-app py-8">
        <div className="flex gap-8">
          {/* Desktop Filters Sidebar */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h3 className="font-heading font-bold text-lg mb-6 flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5" />
                  {language === 'es' ? 'Filtros' : 'Filters'}
                </h3>
                <FilterContent />
              </CardContent>
            </Card>
          </aside>

          {/* Results */}
          <main className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-heading font-bold">
                  {query ? `${language === 'es' ? 'Resultados para' : 'Results for'} "${query}"` : t('nav.search')}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {businesses.length} {language === 'es' ? 'negocios encontrados' : 'businesses found'}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-[4/3]" />
                    <CardContent className="p-4 space-y-3">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : businesses.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {businesses.map(business => (
                  <BusinessCard
                    key={business.id}
                    business={business}
                    onFavorite={handleFavorite}
                    isFavorite={favorites.includes(business.id)}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <div className="max-w-md mx-auto">
                  <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-heading font-bold text-xl mb-2">
                    {language === 'es' ? 'No encontramos resultados' : 'No results found'}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {language === 'es' 
                      ? 'Intenta con otros términos de búsqueda o ajusta los filtros'
                      : 'Try different search terms or adjust filters'}
                  </p>
                  <Button onClick={clearFilters} variant="outline">
                    {language === 'es' ? 'Limpiar filtros' : 'Clear filters'}
                  </Button>
                </div>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
