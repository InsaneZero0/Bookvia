import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { BusinessCard } from '@/components/BusinessCard';
import { useI18n } from '@/lib/i18n';
import { categoriesAPI, businessesAPI, utilityAPI } from '@/lib/api';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
  Search, MapPin, CalendarIcon, ArrowRight, CheckCircle2,
  Sparkles, Heart, Dumbbell, Flower2, Scale, Briefcase, Car, PawPrint,
  Star, Shield, Clock, Users, Quote, ChevronLeft, ChevronRight
} from 'lucide-react';

const iconMap = {
  Sparkles, Heart, Dumbbell, Flower2, Scale, Briefcase, Car, PawPrint,
};

const TESTIMONIALS = [
  { name: 'María García', city: 'CDMX', rating: 5, avatar: 'MG', text: 'Encontré mi estilista ideal en minutos. La reserva fue súper fácil y el recordatorio automático me salvó de olvidarla.', service: 'Corte y Color' },
  { name: 'Carlos Rodríguez', city: 'Guadalajara', rating: 5, avatar: 'CR', text: 'Como dueño de barbería, Bookvia me ayudó a organizar mis citas y reducir las cancelaciones. Mis clientes aman la facilidad.', service: 'Barbería Premium' },
  { name: 'Ana Martínez', city: 'Monterrey', rating: 5, avatar: 'AM', text: 'La mejor plataforma para reservar servicios de belleza. Puedo ver reseñas, precios y disponibilidad todo en un mismo lugar.', service: 'Spa Facial' },
  { name: 'Roberto Sánchez', city: 'Puebla', rating: 5, avatar: 'RS', text: 'Reservé un masaje a domicilio en 2 minutos. El terapeuta llegó puntual y todo fue perfecto. Repetiré seguro.', service: 'Masaje Relajante' },
];

const CITIES = [
  { name: 'Ciudad de México', slug: 'cdmx', businesses: 850, image: 'https://images.unsplash.com/photo-1585464231875-d9ef1f5ad396?w=400&h=300&fit=crop' },
  { name: 'Guadalajara', slug: 'guadalajara', businesses: 420, image: 'https://images.unsplash.com/photo-1610403838702-0352e023a502?w=400&h=300&fit=crop' },
  { name: 'Monterrey', slug: 'monterrey', businesses: 380, image: 'https://images.unsplash.com/photo-1622567863958-3be4f3ab0f4d?w=400&h=300&fit=crop' },
  { name: 'Cancún', slug: 'cancun', businesses: 290, image: 'https://images.unsplash.com/photo-1510097467424-192d713fd8b2?w=400&h=300&fit=crop' },
  { name: 'Puebla', slug: 'puebla', businesses: 210, image: 'https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=400&h=300&fit=crop' },
  { name: 'Mérida', slug: 'merida', businesses: 175, image: 'https://images.unsplash.com/photo-1547995886-6dc09384c6e6?w=400&h=300&fit=crop' },
];

export default function HomePage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [featuredBusinesses, setFeaturedBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState(null);
  const [testimonialIdx, setTestimonialIdx] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      await utilityAPI.seed().catch(() => {});
      const [catRes, bizRes] = await Promise.all([
        categoriesAPI.getAll(),
        businessesAPI.getFeatured(8),
      ]);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setFeaturedBusinesses(Array.isArray(bizRes.data) ? bizRes.data : []);
    } catch {
      setCategories([]);
      setFeaturedBusinesses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (city) params.set('city', city);
    if (date) params.set('date', format(date, 'yyyy-MM-dd'));
    navigate(`/search?${params.toString()}`);
  };

  const steps = [
    { icon: Search, title: language === 'es' ? 'Busca' : 'Search', desc: language === 'es' ? 'Encuentra el servicio que necesitas cerca de ti' : 'Find the service you need near you' },
    { icon: CheckCircle2, title: language === 'es' ? 'Elige' : 'Choose', desc: language === 'es' ? 'Compara precios, reseñas y disponibilidad' : 'Compare prices, reviews and availability' },
    { icon: CalendarIcon, title: language === 'es' ? 'Reserva' : 'Book', desc: language === 'es' ? 'Selecciona fecha, hora y profesional' : 'Select date, time and professional' },
    { icon: Sparkles, title: language === 'es' ? 'Disfruta' : 'Enjoy', desc: language === 'es' ? 'Acude a tu cita y deja tu reseña' : 'Attend your appointment and leave a review' },
  ];

  return (
    <div className="min-h-screen" data-testid="home-page">

      {/* Hero */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden bg-slate-900">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1584884013345-88b9cf247c0c?auto=format&fit=crop&q=80&w=2070"
            alt=""
            className="w-full h-full object-cover opacity-30"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900/90 to-[#F05D5E]/20" />
        </div>
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#F05D5E]/5 rounded-full blur-3xl" />

        <div className="relative z-10 container-app text-center text-white py-20">
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <Badge className="bg-white/10 text-white border-white/20 text-sm px-4 py-1.5 backdrop-blur-sm">
              {language === 'es' ? 'La plataforma #1 de reservas en México' : '#1 Booking platform in Mexico'}
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-heading font-extrabold tracking-tight leading-[1.1]">
              {language === 'es' ? (
                <>Reserva servicios<br /><span className="text-[#F05D5E]">profesionales</span> al instante</>
              ) : (
                <>Book professional<br /><span className="text-[#F05D5E]">services</span> instantly</>
              )}
            </h1>

            <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto">
              {language === 'es'
                ? 'Belleza, salud, fitness y más. Encuentra, compara y reserva con los mejores profesionales de tu ciudad.'
                : 'Beauty, health, fitness and more. Find, compare and book with the best professionals in your city.'}
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="mt-10">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-2 max-w-3xl mx-auto border border-white/20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      placeholder={language === 'es' ? '¿Qué servicio buscas?' : 'What service?'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 h-14 bg-white border-0 text-slate-900 placeholder:text-slate-400 rounded-xl"
                      data-testid="search-service-input"
                    />
                  </div>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      placeholder={language === 'es' ? '¿En qué ciudad?' : 'Which city?'}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="pl-12 h-14 bg-white border-0 text-slate-900 placeholder:text-slate-400 rounded-xl"
                      data-testid="search-city-input"
                    />
                  </div>
                  <Button type="submit" className="h-14 btn-coral text-base rounded-xl" data-testid="search-submit-button">
                    {language === 'es' ? 'Buscar' : 'Search'}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            </form>

            {/* Trust Stats */}
            <div className="flex flex-wrap justify-center gap-6 sm:gap-10 mt-8 pt-6">
              {[
                { value: '2,500+', label: language === 'es' ? 'Negocios' : 'Businesses' },
                { value: '50,000+', label: language === 'es' ? 'Reservas' : 'Bookings' },
                { value: '4.8', label: language === 'es' ? 'Calificación promedio' : 'Avg rating', icon: Star },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl sm:text-3xl font-bold flex items-center justify-center gap-1">
                    {stat.icon && <stat.icon className="h-5 w-5 fill-yellow-400 text-yellow-400" />}
                    {stat.value}
                  </p>
                  <p className="text-xs sm:text-sm text-white/50">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-5 h-8 border-2 border-white/30 rounded-full flex justify-center pt-1.5">
            <div className="w-1 h-1.5 bg-white/40 rounded-full" />
          </div>
        </div>
      </section>

      {/* ═══ Categories ═══════════════════════════════ */}
      <section className="section-padding bg-background" data-testid="categories-section">
        <div className="container-app">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Explora por categoría' : 'Explore by category'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {language === 'es' ? 'Encuentra exactamente lo que necesitas' : 'Find exactly what you need'}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {(Array.isArray(categories) ? categories : []).map((category, index) => {
              const IconComponent = iconMap[category.icon] || Sparkles;
              return (
                <Card
                  key={category.id}
                  className="group cursor-pointer overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                  onClick={() => navigate(`/search?category=${category.id}`)}
                  data-testid={`category-card-${category.slug}`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={category.image_url || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400'}
                      alt={language === 'es' ? category.name_es : category.name_en}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="flex items-center gap-2 text-white">
                        <div className="p-1.5 rounded-lg bg-[#F05D5E]">
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-sm sm:text-base">
                            {language === 'es' ? category.name_es : category.name_en}
                          </h3>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ How It Works ═════════════════════════════ */}
      <section className="section-padding bg-muted/30" data-testid="how-it-works-section">
        <div className="container-app">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? '¿Cómo funciona?' : 'How does it work?'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {language === 'es' ? 'Reserva en 4 simples pasos' : 'Book in 4 simple steps'}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative text-center group">
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-px bg-gradient-to-r from-[#F05D5E]/40 to-transparent" />
                )}
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#F05D5E]/10 text-[#F05D5E] mb-4 group-hover:bg-[#F05D5E] group-hover:text-white transition-all duration-300">
                  <step.icon className="h-8 w-8" />
                  <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#F05D5E] text-white text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                </div>
                <h3 className="font-heading font-bold text-base mb-1">{step.title}</h3>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Featured Businesses ══════════════════════ */}
      {featuredBusinesses.length > 0 && (
        <section className="section-padding bg-background" data-testid="featured-section">
          <div className="container-app">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
                  {language === 'es' ? 'Negocios destacados' : 'Featured businesses'}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {language === 'es' ? 'Los mejor valorados por nuestros usuarios' : 'Top rated by our users'}
                </p>
              </div>
              <Button variant="ghost" onClick={() => navigate('/search')} className="hidden md:flex text-[#F05D5E] hover:text-[#D94A4B]" data-testid="view-all-featured">
                {language === 'es' ? 'Ver todos' : 'View all'} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredBusinesses.map(business => (
                <BusinessCard key={business.id} business={business} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ Popular Cities ═══════════════════════════ */}
      <section className="section-padding bg-muted/30" data-testid="cities-section">
        <div className="container-app">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Populares por ciudad' : 'Popular by city'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {language === 'es' ? 'Descubre los mejores servicios en tu ciudad' : 'Discover the best services in your city'}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {CITIES.map(c => (
              <Card
                key={c.slug}
                className="group cursor-pointer overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all duration-300"
                onClick={() => navigate(`/search?city=${c.name}`)}
                data-testid={`city-card-${c.slug}`}
              >
                <div className="relative h-36 sm:h-44 overflow-hidden">
                  <img src={c.image} alt={c.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <h3 className="font-heading font-bold text-sm sm:text-lg">{c.name}</h3>
                    <p className="text-xs text-white/60">{c.businesses}+ {language === 'es' ? 'negocios' : 'businesses'}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Testimonials ═════════════════════════════ */}
      <section className="section-padding bg-background" data-testid="testimonials-section">
        <div className="container-app">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Lo que dicen nuestros usuarios' : 'What our users say'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {language === 'es' ? 'Miles de personas confían en Bookvia' : 'Thousands of people trust Bookvia'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <Card key={i} className="border-border/60 hover:shadow-md transition-shadow" data-testid={`testimonial-${i}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-1">
                    {[...Array(t.rating)].map((_, j) => (
                      <Star key={j} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <Quote className="h-5 w-5 text-[#F05D5E]/30" />
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{t.text}</p>
                  <div className="flex items-center gap-2.5 pt-2 border-t">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-[#F05D5E]/10 text-[#F05D5E] text-xs font-bold">{t.avatar}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs font-medium">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t.city} · {t.service}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Trust Badges ═════════════════════════════ */}
      <section className="py-12 bg-muted/30 border-y" data-testid="trust-section">
        <div className="container-app">
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
            {[
              { icon: Shield, label: language === 'es' ? 'Pagos seguros' : 'Secure payments' },
              { icon: Star, label: language === 'es' ? 'Reseñas verificadas' : 'Verified reviews' },
              { icon: Clock, label: language === 'es' ? 'Reserva 24/7' : 'Book 24/7' },
              { icon: Users, label: language === 'es' ? '+2,500 negocios' : '2,500+ businesses' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
                <item.icon className="h-5 w-5 text-[#F05D5E]" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Business CTA ═════════════════════════════ */}
      <section className="section-padding bg-slate-900 text-white" data-testid="business-cta-section">
        <div className="container-app">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <Badge className="bg-[#F05D5E]/20 text-[#F05D5E] border-[#F05D5E]/30">
                {language === 'es' ? 'Gratis para empezar' : 'Free to start'}
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold tracking-tight leading-tight">
                {language === 'es'
                  ? '¿Tienes un negocio? Únete a Bookvia'
                  : 'Have a business? Join Bookvia'}
              </h2>
              <p className="text-slate-400 leading-relaxed">
                {language === 'es'
                  ? 'Gestiona tus citas, reduce cancelaciones y haz crecer tu negocio. Miles de profesionales ya confían en nosotros.'
                  : 'Manage appointments, reduce cancellations and grow your business. Thousands of professionals already trust us.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" className="btn-coral" onClick={() => navigate('/business/register')} data-testid="register-business-cta">
                  {language === 'es' ? 'Registrar mi negocio' : 'Register my business'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <img src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=800" alt="" className="rounded-2xl shadow-2xl" />
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl p-3 shadow-xl">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">+2,500</p>
                    <p className="text-[10px] text-slate-500">{language === 'es' ? 'Negocios activos' : 'Active businesses'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
