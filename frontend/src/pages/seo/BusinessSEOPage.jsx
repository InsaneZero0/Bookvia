import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  MapPin, 
  Star, 
  Clock, 
  Phone, 
  ChevronRight,
  Calendar,
  Building2,
  Heart,
  Share2
} from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { seoAPI } from '@/lib/api';

/**
 * BusinessSEOPage - Business detail page with SEO URLs
 * Route: /{country}/{city}/{business-slug} (e.g., /mx/cdmx/salon-maria)
 * This page differs from BusinessProfilePage in that it uses the SEO URL structure
 */
export default function BusinessSEOPage() {
  const { country, city, slug, slugOrCategory } = useParams();
  const navigate = useNavigate();
  
  // Handle both direct route and SEORouter
  const businessSlug = slug || slugOrCategory;
  
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!businessSlug) return;
    
    const fetchBusiness = async () => {
      try {
        setLoading(true);
        
        // Fetch business details using SEO endpoint
        const res = await seoAPI.getBusiness(country, city, businessSlug);
        
        if (res.data.error) {
          setError('Negocio no encontrado');
          return;
        }
        
        setBusiness(res.data);
        
      } catch (err) {
        console.error('Error fetching business:', err);
        setError('Error al cargar el negocio');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBusiness();
  }, [country, city, slug]);

  // Redirect to booking flow
  const handleBookNow = () => {
    if (business?.slug) {
      navigate(`/business/${business.slug}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-16">
          <div className="animate-pulse">
            <div className="h-64 bg-muted rounded-xl mb-8"></div>
            <div className="h-8 bg-muted rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-muted rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-16 text-center">
          <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {error || 'Negocio no encontrado'}
          </h1>
          <p className="text-muted-foreground mb-6">
            El negocio que buscas no existe o ha sido removido.
          </p>
          <Link
            to={`/${country.toLowerCase()}/${city.toLowerCase()}`}
            className="inline-flex items-center gap-2 text-coral hover:underline"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Ver negocios en {city}
          </Link>
        </div>
      </div>
    );
  }

  const cityName = business.city || city;
  const countryCode = country.toUpperCase();

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEOHead
        title={`${business.name} - ${cityName} | Bookvia`}
        description={business.description?.slice(0, 160) || `Reserva una cita en ${business.name}, ${cityName}. Agenda online fácil y rápido.`}
        canonical={`/${country.toLowerCase()}/${city.toLowerCase()}/${slug}`}
        ogImage={business.photos?.[0] || business.logo_url}
        keywords={`${business.name}, ${cityName}, reservas, citas`}
      />

      {/* Hero Section */}
      <section className="relative">
        {/* Cover Image */}
        <div className="h-64 md:h-80 bg-muted overflow-hidden">
          {business.photos?.[0] ? (
            <img
              src={business.photos[0]}
              alt={business.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-coral/30 to-teal/30"></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
        </div>

        {/* Business Info Overlay */}
        <div className="container-app relative -mt-20">
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Logo */}
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl overflow-hidden border-4 border-background shadow-lg flex-shrink-0 bg-muted">
                {business.logo_url ? (
                  <img
                    src={business.logo_url}
                    alt={`${business.name} logo`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-coral to-teal">
                    <span className="text-4xl font-bold text-white">
                      {business.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                {/* Breadcrumb */}
                <nav className="flex items-center text-sm text-muted-foreground mb-2 flex-wrap gap-1">
                  <Link to={`/${country.toLowerCase()}`} className="hover:text-foreground">
                    {countryCode === 'MX' ? 'México' : countryCode}
                  </Link>
                  <ChevronRight className="w-3 h-3 mx-1" />
                  <Link to={`/${country.toLowerCase()}/${city.toLowerCase()}`} className="hover:text-foreground">
                    {cityName}
                  </Link>
                  <ChevronRight className="w-3 h-3 mx-1" />
                  <span className="text-foreground">{business.category_name || 'Servicios'}</span>
                </nav>

                <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
                  {business.name}
                </h1>

                <div className="flex flex-wrap items-center gap-4 mt-3">
                  {business.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                      <span className="font-semibold">{business.rating.toFixed(1)}</span>
                      <span className="text-muted-foreground">
                        ({business.review_count} reseñas)
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{business.address}, {cityName}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 mt-6">
                  <button
                    onClick={handleBookNow}
                    className="btn-coral px-6 py-3 rounded-full font-semibold flex items-center gap-2"
                    data-testid="book-now-btn"
                  >
                    <Calendar className="w-5 h-5" />
                    Reservar cita
                  </button>
                  
                  <button 
                    className="px-4 py-3 border border-border rounded-full hover:bg-muted transition-colors"
                    data-testid="favorite-btn"
                  >
                    <Heart className="w-5 h-5" />
                  </button>
                  
                  <button 
                    className="px-4 py-3 border border-border rounded-full hover:bg-muted transition-colors"
                    data-testid="share-btn"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12">
        <div className="container-app">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Description */}
              {business.description && (
                <div>
                  <h2 className="text-xl font-heading font-semibold mb-4">Sobre nosotros</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {business.description}
                  </p>
                </div>
              )}

              {/* Services */}
              {business.services?.length > 0 && (
                <div>
                  <h2 className="text-xl font-heading font-semibold mb-4">Servicios</h2>
                  <div className="space-y-3">
                    {business.services.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <h3 className="font-medium text-foreground">{service.name}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                            <Clock className="w-4 h-4" />
                            {service.duration_minutes} min
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-semibold text-coral">
                            ${service.price.toLocaleString()} MXN
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviews */}
              {business.recent_reviews?.length > 0 && (
                <div>
                  <h2 className="text-xl font-heading font-semibold mb-4">Reseñas recientes</h2>
                  <div className="space-y-4">
                    {business.recent_reviews.map((review, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-card border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < review.rating
                                  ? 'text-yellow-500 fill-yellow-500'
                                  : 'text-muted'
                              }`}
                            />
                          ))}
                        </div>
                        {review.comment && (
                          <p className="text-muted-foreground">{review.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Contact Card */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold text-foreground mb-4">Información de contacto</h3>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-foreground">{business.address}</p>
                      <p className="text-sm text-muted-foreground">
                        {cityName}, {business.state}
                      </p>
                    </div>
                  </div>
                  
                  {business.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-muted-foreground" />
                      <a href={`tel:${business.phone}`} className="text-coral hover:underline">
                        {business.phone}
                      </a>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleBookNow}
                  className="w-full btn-coral mt-6 py-3 rounded-lg font-semibold"
                  data-testid="sidebar-book-btn"
                >
                  Reservar ahora
                </button>
              </div>

              {/* Deposit Notice */}
              {business.requires_deposit && (
                <div className="bg-coral/10 border border-coral/20 rounded-xl p-4">
                  <h4 className="font-semibold text-coral mb-2">Anticipo requerido</h4>
                  <p className="text-sm text-muted-foreground">
                    Este negocio requiere un anticipo de ${business.deposit_amount?.toLocaleString() || '50'} MXN para confirmar tu cita.
                  </p>
                </div>
              )}

              {/* Gallery */}
              {business.photos?.length > 1 && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4">Galería</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {business.photos.slice(0, 4).map((photo, idx) => (
                      <div
                        key={idx}
                        className="aspect-square rounded-lg overflow-hidden"
                      >
                        <img
                          src={photo}
                          alt={`${business.name} foto ${idx + 1}`}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
