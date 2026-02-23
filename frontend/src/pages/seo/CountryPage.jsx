import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Building2, ChevronRight, Search } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { seoAPI, categoriesAPI } from '@/lib/api';

/**
 * CountryPage - Landing page for a country
 * Route: /{country} (e.g., /mx)
 * Shows all cities available in that country
 */
export default function CountryPage() {
  const { country } = useParams();
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [countryData, setCountryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch country info
        const countriesRes = await seoAPI.getCountries();
        const countryInfo = countriesRes.data.find(
          c => c.code.toLowerCase() === country.toLowerCase()
        );
        
        if (!countryInfo) {
          setError('País no encontrado');
          return;
        }
        
        setCountryData(countryInfo);
        
        // Fetch cities for this country
        const citiesRes = await seoAPI.getCities(country.toUpperCase());
        setCities(citiesRes.data || []);
        
        // Fetch categories
        const categoriesRes = await categoriesAPI.getAll();
        setCategories(categoriesRes.data || []);
        
      } catch (err) {
        console.error('Error fetching country data:', err);
        setError('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [country]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-16">
          <div className="animate-pulse">
            <div className="h-12 bg-muted rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !countryData) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {error || 'País no encontrado'}
          </h1>
          <Link to="/" className="text-coral hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const countryName = countryData.name_es || country.toUpperCase();

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEOHead
        title={`Bookvia ${countryName} - Reserva servicios profesionales`}
        description={`Encuentra y reserva los mejores servicios profesionales en ${countryName}. Belleza, salud, bienestar y más.`}
        canonical={`/${country.toLowerCase()}`}
        keywords={`reservas, citas, servicios profesionales, ${countryName}`}
      />

      {/* Header */}
      <section className="bg-gradient-to-r from-coral/10 to-teal/10 py-12">
        <div className="container-app">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-muted-foreground mb-4">
            <Link to="/" className="hover:text-foreground">Inicio</Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="text-foreground font-medium">{countryName}</span>
          </nav>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-coral/20 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-coral" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground">
                Servicios en {countryName}
              </h1>
              <p className="text-muted-foreground mt-1">
                {cities.length} ciudades disponibles
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cities Grid */}
      <section className="py-12">
        <div className="container-app">
          <h2 className="text-2xl font-heading font-bold mb-6 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-coral" />
            Ciudades
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {cities.map((city) => (
              <Link
                key={city.slug}
                to={`/${country.toLowerCase()}/${city.slug}`}
                className="group block bg-card border border-border rounded-xl p-6 hover:border-coral hover:shadow-lg transition-all duration-200"
                data-testid={`city-card-${city.slug}`}
              >
                <h3 className="font-semibold text-foreground group-hover:text-coral transition-colors">
                  {city.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {city.state || ''}
                </p>
                {city.business_count > 0 && (
                  <p className="text-xs text-coral mt-2">
                    {city.business_count} negocios
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-12 bg-muted/30">
        <div className="container-app">
          <h2 className="text-2xl font-heading font-bold mb-6 flex items-center gap-2">
            <Search className="w-6 h-6 text-coral" />
            Categorías populares
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.slug}
                to={`/${country.toLowerCase()}/${cities[0]?.slug || 'cdmx'}/${category.slug}`}
                className="group block bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-all"
                data-testid={`category-card-${category.slug}`}
              >
                {category.image_url && (
                  <div className="h-24 overflow-hidden">
                    <img
                      src={category.image_url}
                      alt={category.name_es}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-foreground">
                    {category.name_es}
                  </h3>
                  {category.business_count > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {category.business_count} negocios
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
