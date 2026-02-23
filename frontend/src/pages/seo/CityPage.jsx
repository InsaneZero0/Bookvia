import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Building2, ChevronRight, Star, Clock } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import api from '@/api/api';

/**
 * CityPage - Landing page for a city
 * Route: /{country}/{city} (e.g., /mx/cdmx)
 * Shows categories and featured businesses in that city
 */
export default function CityPage() {
  const { country, city } = useParams();
  const [cityData, setCityData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch city info
        const citiesRes = await api.get(`/api/seo/cities/${country.toUpperCase()}`);
        const cityInfo = citiesRes.data.find(
          c => c.slug.toLowerCase() === city.toLowerCase()
        );
        
        setCityData(cityInfo || { name: city, slug: city });
        
        // Fetch categories
        const categoriesRes = await api.get('/api/seo/categories');
        setCategories(categoriesRes.data || []);
        
        // Fetch businesses for this city
        const businessesRes = await api.get(`/api/seo/businesses/${country}/${city}`);
        setBusinesses(businessesRes.data?.businesses || []);
        
      } catch (err) {
        console.error('Error fetching city data:', err);
        setError('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [country, city]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-16">
          <div className="animate-pulse">
            <div className="h-12 bg-muted rounded w-1/2 mb-8"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-40 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cityName = cityData?.name || city;
  const countryCode = country.toUpperCase();

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEOHead
        title={`Servicios profesionales en ${cityName} | Bookvia`}
        description={`Reserva citas con los mejores profesionales en ${cityName}. Belleza, salud, bienestar y más.`}
        canonical={`/${country.toLowerCase()}/${city.toLowerCase()}`}
        keywords={`reservas ${cityName}, citas ${cityName}, servicios ${cityName}`}
      />

      {/* Header */}
      <section className="bg-gradient-to-r from-coral/10 to-teal/10 py-12">
        <div className="container-app">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-muted-foreground mb-4 flex-wrap">
            <Link to="/" className="hover:text-foreground">Inicio</Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <Link to={`/${country.toLowerCase()}`} className="hover:text-foreground">
              {countryCode === 'MX' ? 'México' : countryCode}
            </Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="text-foreground font-medium">{cityName}</span>
          </nav>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-teal/20 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-teal" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground">
                {cityName}
              </h1>
              <p className="text-muted-foreground mt-1">
                {businesses.length > 0 ? `${businesses.length}+ negocios disponibles` : 'Encuentra servicios profesionales'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-12">
        <div className="container-app">
          <h2 className="text-2xl font-heading font-bold mb-6 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-coral" />
            Categorías en {cityName}
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((category) => (
              <Link
                key={category.slug}
                to={`/${country.toLowerCase()}/${city.toLowerCase()}/${category.slug}`}
                className="group relative block bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200"
                data-testid={`category-link-${category.slug}`}
              >
                {category.image_url ? (
                  <div className="h-32 overflow-hidden">
                    <img
                      src={category.image_url}
                      alt={category.name_es}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  </div>
                ) : (
                  <div className="h-32 bg-muted"></div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="font-semibold text-white drop-shadow-md">
                    {category.name_es}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Businesses */}
      {businesses.length > 0 && (
        <section className="py-12 bg-muted/30">
          <div className="container-app">
            <h2 className="text-2xl font-heading font-bold mb-6 flex items-center gap-2">
              <Star className="w-6 h-6 text-coral" />
              Negocios destacados en {cityName}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {businesses.slice(0, 6).map((business) => (
                <Link
                  key={business.id}
                  to={`/${country.toLowerCase()}/${city.toLowerCase()}/${business.slug}`}
                  className="group block bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-all"
                  data-testid={`business-card-${business.slug}`}
                >
                  {/* Business Image */}
                  <div className="h-40 bg-muted overflow-hidden">
                    {business.photos?.[0] || business.logo_url ? (
                      <img
                        src={business.photos?.[0] || business.logo_url}
                        alt={business.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-coral/20 to-teal/20">
                        <Building2 className="w-12 h-12 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  
                  {/* Business Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-foreground group-hover:text-coral transition-colors line-clamp-1">
                      {business.name}
                    </h3>
                    
                    {business.category_name && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {business.category_name}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 mt-3">
                      {business.rating > 0 && (
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{business.rating.toFixed(1)}</span>
                          <span className="text-muted-foreground">
                            ({business.review_count})
                          </span>
                        </div>
                      )}
                      
                      {business.requires_deposit && (
                        <span className="text-xs bg-coral/10 text-coral px-2 py-1 rounded-full">
                          Anticipo requerido
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {businesses.length > 6 && (
              <div className="text-center mt-8">
                <Link
                  to={`/search?city=${city}`}
                  className="inline-flex items-center gap-2 btn-coral px-6 py-3 rounded-full"
                >
                  Ver todos los negocios
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* No businesses message */}
      {businesses.length === 0 && (
        <section className="py-12 bg-muted/30">
          <div className="container-app text-center">
            <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Próximamente en {cityName}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Estamos expandiendo nuestra red de profesionales. 
              Pronto tendrás servicios disponibles en esta ciudad.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
