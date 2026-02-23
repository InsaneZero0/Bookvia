import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { MapPin, Building2, ChevronRight, Star, Filter, Clock } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { seoAPI, categoriesAPI } from '@/lib/api';

/**
 * CategoryPage - Listing page for businesses in a category
 * Route: /{country}/{city}/{category} (e.g., /mx/cdmx/belleza-estetica)
 * Shows all businesses in that category for the city
 */
export default function CategoryPage() {
  const { country, city, category } = useParams();
  const [searchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  
  const [cityData, setCityData] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch city info
        const citiesRes = await seoAPI.getCities(country.toUpperCase());
        const cityInfo = citiesRes.data.find(
          c => c.slug.toLowerCase() === city.toLowerCase()
        );
        setCityData(cityInfo || { name: city, slug: city });
        
        // Fetch categories to get category info
        const categoriesRes = await seoAPI.getCategories();
        const catInfo = categoriesRes.data.find(
          c => c.slug.toLowerCase() === category.toLowerCase()
        );
        setCategoryData(catInfo || { name_es: category, slug: category });
        
        // Fetch businesses for this city and category
        const businessesRes = await seoAPI.getBusinesses(country, city, category, page);
        setBusinesses(businessesRes.data?.businesses || []);
        setTotalPages(businessesRes.data?.pages || 1);
        
      } catch (err) {
        console.error('Error fetching category data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [country, city, category, page]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-16">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
            <div className="h-12 bg-muted rounded w-2/3 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-muted rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cityName = cityData?.name || city;
  const categoryName = categoryData?.name_es || category;
  const countryCode = country.toUpperCase();

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEOHead
        title={`${categoryName} en ${cityName} | Bookvia`}
        description={`Encuentra los mejores servicios de ${categoryName.toLowerCase()} en ${cityName}. Reserva online fácil y rápido.`}
        canonical={`/${country.toLowerCase()}/${city.toLowerCase()}/${category.toLowerCase()}`}
        keywords={`${categoryName.toLowerCase()}, ${cityName}, reservas, citas`}
      />

      {/* Header */}
      <section className="bg-gradient-to-r from-coral/10 to-teal/10 py-12">
        <div className="container-app">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-muted-foreground mb-4 flex-wrap gap-1">
            <Link to="/" className="hover:text-foreground">Inicio</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <Link to={`/${country.toLowerCase()}`} className="hover:text-foreground">
              {countryCode === 'MX' ? 'México' : countryCode}
            </Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <Link to={`/${country.toLowerCase()}/${city.toLowerCase()}`} className="hover:text-foreground">
              {cityName}
            </Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-foreground font-medium">{categoryName}</span>
          </nav>
          
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              {categoryData?.image_url && (
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-lg">
                  <img
                    src={categoryData.image_url}
                    alt={categoryName}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div>
                <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground">
                  {categoryName}
                </h1>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {cityName}
                  <span className="text-foreground/50">•</span>
                  {businesses.length} resultados
                </p>
              </div>
            </div>
            
            {/* Future: Filter button */}
            <button 
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
              data-testid="filter-btn"
            >
              <Filter className="w-4 h-4" />
              Filtrar
            </button>
          </div>
        </div>
      </section>

      {/* Business Grid */}
      <section className="py-12">
        <div className="container-app">
          {businesses.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {businesses.map((business) => (
                  <Link
                    key={business.id}
                    to={`/${country.toLowerCase()}/${city.toLowerCase()}/${business.slug}`}
                    className="group block bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-all"
                    data-testid={`business-card-${business.slug}`}
                  >
                    {/* Business Image */}
                    <div className="h-48 bg-muted overflow-hidden relative">
                      {business.photos?.[0] || business.logo_url ? (
                        <img
                          src={business.photos?.[0] || business.logo_url}
                          alt={business.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-coral/20 to-teal/20">
                          <Building2 className="w-16 h-16 text-muted-foreground/50" />
                        </div>
                      )}
                      
                      {/* Badge */}
                      {business.is_featured && (
                        <span className="absolute top-3 right-3 bg-coral text-white text-xs px-2 py-1 rounded-full">
                          Destacado
                        </span>
                      )}
                    </div>
                    
                    {/* Business Info */}
                    <div className="p-5">
                      <h3 className="font-semibold text-lg text-foreground group-hover:text-coral transition-colors line-clamp-1">
                        {business.name}
                      </h3>
                      
                      {business.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {business.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-1">
                          {business.rating > 0 ? (
                            <>
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              <span className="font-medium">{business.rating.toFixed(1)}</span>
                              <span className="text-sm text-muted-foreground">
                                ({business.review_count} reseñas)
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground">Nuevo</span>
                          )}
                        </div>
                        
                        {business.requires_deposit && (
                          <span className="text-xs bg-coral/10 text-coral px-2 py-1 rounded-full">
                            Anticipo
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-12">
                  {[...Array(totalPages)].map((_, i) => (
                    <Link
                      key={i}
                      to={`/${country.toLowerCase()}/${city.toLowerCase()}/${category.toLowerCase()}?page=${i + 1}`}
                      className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                        page === i + 1
                          ? 'bg-coral text-white'
                          : 'bg-muted hover:bg-muted/80 text-foreground'
                      }`}
                    >
                      {i + 1}
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">
                No hay resultados
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                No encontramos negocios de {categoryName.toLowerCase()} en {cityName}. 
                Prueba con otra categoría o ciudad.
              </p>
              <Link
                to={`/${country.toLowerCase()}/${city.toLowerCase()}`}
                className="inline-flex items-center gap-2 text-coral hover:underline"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Ver todas las categorías
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Related categories */}
      <section className="py-12 bg-muted/30">
        <div className="container-app">
          <h2 className="text-xl font-heading font-semibold mb-6">
            Otras categorías en {cityName}
          </h2>
          <div className="flex flex-wrap gap-3">
            {/* Show other categories (excluding current) */}
            {['belleza-estetica', 'salud', 'spa-masajes', 'fitness-bienestar']
              .filter(slug => slug !== category.toLowerCase())
              .slice(0, 4)
              .map((catSlug) => (
                <Link
                  key={catSlug}
                  to={`/${country.toLowerCase()}/${city.toLowerCase()}/${catSlug}`}
                  className="px-4 py-2 bg-card border border-border rounded-full hover:border-coral hover:text-coral transition-colors text-sm"
                >
                  {catSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Link>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
