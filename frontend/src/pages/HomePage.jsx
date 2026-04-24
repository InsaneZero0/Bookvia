import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BusinessCard } from '@/components/BusinessCard';
import { useI18n } from '@/lib/i18n';
import { useCountry } from '@/lib/countryContext';
import { categoriesAPI, businessesAPI, utilityAPI } from '@/lib/api';
import {
  Search, MapPin, ArrowRight, CheckCircle2,
  Sparkles, Heart, Dumbbell, Flower2, Scale, Briefcase, Car, PawPrint, PartyPopper, HelpCircle, Moon,
  Scissors, Coffee, Music, Camera, Utensils, Palette, Wrench, Stethoscope, GraduationCap, Plane,
  Star, Shield, Clock, Users, CalendarIcon, ChevronDown, Building2, Zap
} from 'lucide-react';

const iconMap = {
  Sparkles, Heart, Dumbbell, Flower2, Scale, Briefcase, Car, PawPrint, PartyPopper, HelpCircle, Moon,
  Scissors, Coffee, Music, Camera, Utensils, Palette, Wrench, Stethoscope, GraduationCap, Plane,
};

export default function HomePage() {
  const { t, language } = useI18n();
  const { countryCode, country } = useCountry();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [featuredBusinesses, setFeaturedBusinesses] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [city, setCity] = useState('');
  const [serviceOpen, setServiceOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [heroCities, setHeroCities] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState(null);
  const [platformStats, setPlatformStats] = useState(null);
  const serviceRef = useRef(null);
  const cityRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (serviceRef.current && !serviceRef.current.contains(e.target)) setServiceOpen(false);
      if (cityRef.current && !cityRef.current.contains(e.target)) { setCityOpen(false); setCitySearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
    fetch(`${baseUrl}/api/cities?country_code=${countryCode}&with_businesses=true`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setHeroCities(Array.isArray(data) ? data : []))
      .catch(() => setHeroCities([]));
  }, [countryCode]);

  useEffect(() => {
    if (!city) { setFilteredCategories(null); return; }
    const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
    fetch(`${baseUrl}/api/categories?city=${encodeURIComponent(city)}&country_code=${countryCode}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setFilteredCategories(Array.isArray(data) ? data : []))
      .catch(() => setFilteredCategories(null));
  }, [city, countryCode]);

  useEffect(() => { loadData(); }, [countryCode]);

  const loadData = async () => {
    try {
      await utilityAPI.seed().catch(() => {});
      const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
      const [catRes, bizRes, citiesRes, statsRes] = await Promise.all([
        categoriesAPI.getAll(),
        businessesAPI.getFeatured(8, countryCode),
        fetch(`${baseUrl}/api/cities?country_code=${countryCode}`).then(r => r.ok ? r.json() : []).catch(() => []),
        utilityAPI.getPlatformStats().catch(() => ({ data: null })),
      ]);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setFeaturedBusinesses(Array.isArray(bizRes.data) ? bizRes.data : []);
      setCities(Array.isArray(citiesRes) ? citiesRes : []);
      if (statsRes?.data) setPlatformStats(statsRes.data);
    } catch {
      setCategories([]);
      setFeaturedBusinesses([]);
      setCities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (selectedCategoryId) {
      params.set('category', selectedCategoryId);
    } else if (searchQuery) {
      params.set('q', searchQuery);
    }
    if (city) params.set('city', city);
    navigate(`/search?${params.toString()}`);
  };

  const countryName = language === 'es' ? country?.name : country?.nameEn;

  const steps = [
    { icon: Search, title: language === 'es' ? 'Busca' : 'Search', desc: language === 'es' ? 'Encuentra el servicio que necesitas cerca de ti' : 'Find the service you need near you' },
    { icon: CheckCircle2, title: language === 'es' ? 'Elige' : 'Choose', desc: language === 'es' ? 'Compara precios, resenas y disponibilidad' : 'Compare prices, reviews and availability' },
    { icon: CalendarIcon, title: language === 'es' ? 'Reserva' : 'Book', desc: language === 'es' ? 'Selecciona fecha, hora y profesional' : 'Select date, time and professional' },
    { icon: Sparkles, title: language === 'es' ? 'Disfruta' : 'Enjoy', desc: language === 'es' ? 'Acude a tu cita y deja tu resena' : 'Attend your appointment and leave a review' },
  ];

  return (
    <div className="min-h-screen" data-testid="home-page">

      {/* ═══ Hero ═══════════════════════════════════ */}
      <section className="relative min-h-[88vh] flex items-center overflow-hidden bg-[#fcf7ba]">
        <div className="absolute inset-0 bg-gradient-to-l from-[#fcf7ba] via-[#fcf7ba]/80 to-white" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#F05D5E]/10 rounded-full blur-3xl" />

        <div className="relative z-10 container-app text-slate-900 py-16 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* LEFT: Text + Search */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left animate-fade-in">
              <Badge className="bg-slate-900/5 text-slate-900 border-slate-900/10 text-sm px-4 py-1.5 backdrop-blur-sm inline-flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[#F05D5E]" />
                {language === 'es' ? 'Disponible 24/7' : 'Available 24/7'}
              </Badge>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-heading font-extrabold tracking-tight leading-[0.95]">
                {language === 'es' ? (
                  <span className="inline-flex flex-wrap justify-center lg:justify-start gap-x-4 gap-y-2">
                    <span className="animate-fade-in" style={{ animationDelay: '0.1s' }}>Busca.</span>
                    <span className="animate-fade-in" style={{ animationDelay: '0.3s' }}>Elige.</span>
                    <span className="text-[#F05D5E] animate-fade-in" style={{ animationDelay: '0.5s' }}>Reserva.</span>
                  </span>
                ) : (
                  <span className="inline-flex flex-wrap justify-center lg:justify-start gap-x-4 gap-y-2">
                    <span className="animate-fade-in" style={{ animationDelay: '0.1s' }}>Search.</span>
                    <span className="animate-fade-in" style={{ animationDelay: '0.3s' }}>Choose.</span>
                    <span className="text-[#F05D5E] animate-fade-in" style={{ animationDelay: '0.5s' }}>Book.</span>
                  </span>
                )}
              </h1>

              <p className="text-base sm:text-lg text-slate-700 max-w-2xl lg:mx-0 mx-auto">
                {language === 'es'
                  ? 'Encuentra servicios cerca de ti, compara opciones y agenda fácil en un solo lugar.'
                  : 'Find services near you, compare options and book easily in one place.'}
              </p>

              {/* Search Bar */}
              <form onSubmit={handleSearch} className="mt-8">
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-2 max-w-3xl lg:mx-0 mx-auto border border-slate-900/10 shadow-xl">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {/* City Dropdown */}
                  <div className="relative" ref={cityRef}>
                    <button type="button"
                      onClick={() => { setCityOpen(!cityOpen); setServiceOpen(false); setTimeout(() => { const el = document.getElementById('hero-city-search'); if (el) el.focus(); }, 100); }}
                      className="flex items-center gap-2 w-full h-14 px-4 bg-white rounded-xl text-left"
                      data-testid="search-city-input">
                      <MapPin className="h-5 w-5 text-slate-400 shrink-0" />
                      <span className={`flex-1 text-sm truncate ${city ? 'text-slate-900' : 'text-slate-400'}`}>
                        {city || (language === 'es' ? 'En que ciudad?' : 'Which city?')}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${cityOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {cityOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border max-h-72 overflow-hidden animate-in fade-in-0 zoom-in-95">
                        <div className="p-2 border-b sticky top-0 bg-white">
                          <input id="hero-city-search" type="text"
                            placeholder={language === 'es' ? 'Buscar ciudad...' : 'Search city...'}
                            value={citySearch} onChange={e => setCitySearch(e.target.value)}
                            className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F05D5E]/30"
                            data-testid="city-search-input" autoComplete="off" />
                        </div>
                        <div className="overflow-y-auto max-h-52">
                          <button type="button"
                            onClick={() => { setCity(''); setSearchQuery(''); setCityOpen(false); setCitySearch(''); }}
                            className={`flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-slate-50 transition-colors text-left border-b ${!city ? 'bg-slate-50 font-medium' : ''}`}>
                            <MapPin className="h-4 w-4 text-slate-400" />
                            <span className="text-slate-700">{language === 'es' ? 'Todas las ciudades' : 'All cities'}</span>
                          </button>
                          {heroCities
                            .filter(c => !citySearch || c.name.toLowerCase().includes(citySearch.toLowerCase()))
                            .map(c => (
                            <button key={c.slug || c.name} type="button"
                              onClick={() => { setCity(c.name); setCityOpen(false); setCitySearch(''); setSearchQuery(''); }}
                              className={`flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-slate-50 transition-colors text-left ${city === c.name ? 'bg-slate-50 font-medium' : ''}`}
                              data-testid={`search-city-${c.slug || c.name}`}>
                              <MapPin className="h-4 w-4 text-[#F05D5E]" />
                              <span className="flex-1 text-slate-700">{c.name}</span>
                              <span className="text-xs text-slate-400">{c.business_count} {language === 'es' ? 'negocios' : 'biz'}</span>
                            </button>
                          ))}
                          {heroCities.filter(c => !citySearch || c.name.toLowerCase().includes(citySearch.toLowerCase())).length === 0 && (
                            <div className="py-4 text-center text-sm text-slate-400">{language === 'es' ? 'No se encontraron ciudades' : 'No cities found'}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Service Dropdown */}
                  <div className="relative" ref={serviceRef}>
                    <button type="button"
                      onClick={() => { setServiceOpen(!serviceOpen); setCityOpen(false); }}
                      className="flex items-center gap-2 w-full h-14 px-4 bg-white rounded-xl text-left"
                      data-testid="search-service-input">
                      <Search className="h-5 w-5 text-slate-400 shrink-0" />
                      <span className={`flex-1 text-sm truncate ${searchQuery ? 'text-slate-900' : 'text-slate-400'}`}>
                        {searchQuery || (language === 'es' ? 'Que servicio buscas?' : 'What service?')}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${serviceOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {serviceOpen && (() => {
                      const displayCats = filteredCategories !== null ? filteredCategories : categories;
                      return displayCats.length > 0 ? (
                      <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border max-h-64 overflow-y-auto animate-in fade-in-0 zoom-in-95">
                        <button type="button"
                          onClick={() => { setSearchQuery(''); setSelectedCategoryId(''); setServiceOpen(false); }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left border-b ${!searchQuery ? 'bg-slate-50 font-medium' : ''}`}>
                          <Search className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="text-slate-700">{language === 'es' ? 'Todos los servicios' : 'All services'}</span>
                        </button>
                        {displayCats.map(cat => {
                          const IconComp = iconMap[cat.icon] || Sparkles;
                          return (
                          <button key={cat.id} type="button"
                            onClick={() => { setSearchQuery(language === 'es' ? cat.name_es : cat.name_en); setSelectedCategoryId(cat.id); setServiceOpen(false); }}
                            className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left ${searchQuery === (language === 'es' ? cat.name_es : cat.name_en) ? 'bg-slate-50 font-medium' : ''}`}
                            data-testid={`search-cat-${cat.id}`}>
                            <div className="w-7 h-7 rounded-lg bg-[#F05D5E]/10 flex items-center justify-center shrink-0">
                              <IconComp className="h-3.5 w-3.5 text-[#F05D5E]" />
                            </div>
                            <span className="flex-1 text-slate-700 text-left">{language === 'es' ? cat.name_es : cat.name_en}</span>
                            {city && <span className="text-xs text-slate-400 shrink-0">{cat.business_count}</span>}
                          </button>
                          );
                        })}
                      </div>
                      ) : (
                      <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border animate-in fade-in-0 zoom-in-95">
                        <div className="py-4 text-center text-sm text-slate-400">{language === 'es' ? 'No hay servicios en esta ciudad' : 'No services in this city'}</div>
                      </div>
                      );
                    })()}
                  </div>
                  <Button type="submit" className="h-14 btn-coral text-base rounded-xl" data-testid="search-submit-button">
                    {language === 'es' ? 'Buscar' : 'Search'} <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            </form>

            {/* Quick trust indicators */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 sm:gap-6 mt-8 pt-6">
              {[
                { icon: Shield, text: language === 'es' ? 'Pagos seguros' : 'Secure payments' },
                { icon: Clock, text: language === 'es' ? 'Reserva 24/7' : 'Book 24/7' },
                { icon: CheckCircle2, text: language === 'es' ? 'Confirmacion inmediata' : 'Instant confirmation' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-2 text-slate-700 text-sm">
                  <item.icon className="h-4 w-4 text-[#F05D5E]" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

            {/* RIGHT: Image + Floating cards */}
            <div className="lg:col-span-5 relative hidden lg:block animate-fade-in" style={{ animationDelay: '0.6s' }}>
              <div className="relative">
                {/* Main image */}
                <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-slate-900/10 aspect-[4/5]">
                  <img
                    src="https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&q=80&w=1200"
                    alt="Cliente disfrutando servicio profesional en Bookvia"
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                </div>

                {/* Floating card 1: Cita confirmada (top-left) */}
                <div className="absolute -top-4 -left-6 bg-white rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-fade-in w-[240px]" style={{ animationDelay: '0.9s' }}>
                  <div className="h-11 w-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {language === 'es' ? 'Cita confirmada' : 'Booking confirmed'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {language === 'es' ? 'Mañana · 3:00 PM' : 'Tomorrow · 3:00 PM'}
                    </div>
                  </div>
                </div>

                {/* Floating card 2: Testimonial (bottom-right) */}
                <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl shadow-2xl p-4 animate-fade-in w-[250px]" style={{ animationDelay: '1.1s' }}>
                  <div className="flex items-center gap-1 mb-2">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-xs text-slate-700 mb-2 leading-snug">
                    {language === 'es'
                      ? '"Reservé en 1 minuto. Excelente!"'
                      : '"Booked in 1 minute. Excellent!"'}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#F05D5E] to-amber-400 flex items-center justify-center text-white text-xs font-bold">
                      A
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Ana M.</div>
                      <div className="text-[10px] text-slate-500">
                        {language === 'es' ? 'Cliente verificado' : 'Verified client'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating card 3: Live booking (middle-right) */}
                <div className="absolute top-1/2 -right-4 -translate-y-1/2 bg-[#F05D5E] rounded-2xl shadow-2xl p-3 flex items-center gap-2 animate-fade-in" style={{ animationDelay: '1.3s' }}>
                  <div className="relative h-2 w-2">
                    <div className="absolute inset-0 bg-white rounded-full animate-ping" />
                    <div className="relative h-2 w-2 bg-white rounded-full" />
                  </div>
                  <span className="text-white text-xs font-semibold whitespace-nowrap">
                    {language === 'es' ? 'Reservando ahora' : 'Booking now'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-5 h-8 border-2 border-slate-900/30 rounded-full flex justify-center pt-1.5">
            <div className="w-1 h-1.5 bg-slate-900/40 rounded-full" />
          </div>
        </div>
      </section>

      {/* ═══ How It Works ═════════════════════════════ */}
      <section className="section-padding bg-background" data-testid="how-it-works-section">
        <div className="container-app">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Como funciona?' : 'How does it work?'}
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

      {/* ═══ Categories ═══════════════════════════════ */}
      <section className="section-padding bg-muted/30" data-testid="categories-section">
        <div className="container-app">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
              {language === 'es' ? 'Explora por categoria' : 'Explore by category'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {language === 'es' ? 'Encuentra exactamente lo que necesitas' : 'Find exactly what you need'}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {categories.map((category) => {
              const IconComponent = iconMap[category.icon] || Sparkles;
              return (
                <Card key={category.id}
                  className="group cursor-pointer overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                  onClick={() => navigate(`/search?category=${category.id}`)}
                  data-testid={`category-card-${category.slug}`}>
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
                        <h3 className="font-heading font-bold text-sm sm:text-base">
                          {language === 'es' ? category.name_es : category.name_en}
                        </h3>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
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

      {/* ═══ Business CTA ═════════════════════════════ */}
      <section className="section-padding bg-slate-900 text-white" data-testid="business-cta-section">
        <div className="container-app">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <Badge className="bg-[#F05D5E]/20 text-[#F05D5E] border-[#F05D5E]/30">
                {language === 'es' ? 'Tienes un negocio?' : 'Have a business?'}
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold tracking-tight leading-tight">
                {language === 'es'
                  ? 'Haz crecer tu negocio con Bookvia'
                  : 'Grow your business with Bookvia'}
              </h2>
              <p className="text-slate-400 leading-relaxed">
                {language === 'es'
                  ? 'Gestiona tus citas, reduce cancelaciones y haz crecer tu negocio con la plataforma de reservas mas completa de Mexico.'
                  : 'Manage appointments, reduce cancellations and grow your business with the most complete booking platform in Mexico.'}
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { icon: CalendarIcon, text: language === 'es' ? 'Agenda inteligente' : 'Smart scheduling' },
                  { icon: Users, text: language === 'es' ? 'Gestion de equipo' : 'Team management' },
                  { icon: Shield, text: language === 'es' ? 'Pagos seguros' : 'Secure payments' },
                  { icon: Zap, text: language === 'es' ? 'Recordatorios automaticos' : 'Auto reminders' },
                ].map(feat => (
                  <div key={feat.text} className="flex items-center gap-2">
                    <feat.icon className="h-4 w-4 text-[#F05D5E] shrink-0" />
                    <span className="text-sm text-slate-300">{feat.text}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button size="lg" className="btn-coral" onClick={() => navigate('/for-business')} data-testid="register-business-cta">
                  {language === 'es' ? 'Conocer mas' : 'Learn more'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <img src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=800" alt="" className="rounded-2xl shadow-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Popular Cities ═════════════════════════════ */}
      {cities.filter(c => c.business_count > 0).length > 0 && (
        <section className="section-padding bg-muted/30" data-testid="cities-section">
          <div className="container-app">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
                {language === 'es' ? 'Ciudades disponibles' : 'Available cities'}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {language === 'es' ? 'Descubre los mejores servicios en tu ciudad' : 'Discover the best services in your city'}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {cities.filter(c => c.business_count > 0).slice(0, 8).map(c => (
                <Card key={c.slug || c.name}
                  className="group cursor-pointer border-0 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                  onClick={() => navigate(`/search?city=${c.name}`)}
                  data-testid={`city-card-${c.slug || c.name}`}>
                  <div className="px-5 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#F05D5E]/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-4 w-4 text-[#F05D5E]" />
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-sm">{c.name}</h3>
                      <p className="text-xs text-muted-foreground">{c.business_count} {language === 'es' ? 'negocios' : 'businesses'}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ Trust Badges ═════════════════════════════ */}
      <section className="py-12 bg-background border-y" data-testid="trust-section">
        <div className="container-app">
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
            {[
              { icon: Shield, label: language === 'es' ? 'Pagos seguros con Stripe' : 'Secure Stripe payments' },
              { icon: Star, label: language === 'es' ? 'Resenas verificadas' : 'Verified reviews' },
              { icon: Clock, label: language === 'es' ? 'Reserva 24/7' : 'Book 24/7' },
              { icon: Building2, label: language === 'es' ? 'Negocios verificados' : 'Verified businesses' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
                <item.icon className="h-5 w-5 text-[#F05D5E]" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
