import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BusinessCard } from '@/components/BusinessCard';
import { StarRating } from '@/components/StarRating';
import { useI18n } from '@/lib/i18n';
import { categoriesAPI, businessesAPI, utilityAPI } from '@/lib/api';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { 
  Search, MapPin, CalendarIcon, ArrowRight, CheckCircle2, 
  Sparkles, Heart, Dumbbell, Flower2, Scale, Briefcase, Car, PawPrint
} from 'lucide-react';

const iconMap = {
  Sparkles: Sparkles,
  Heart: Heart,
  Dumbbell: Dumbbell,
  Flower2: Flower2,
  Scale: Scale,
  Briefcase: Briefcase,
  Car: Car,
  PawPrint: PawPrint,
};

export default function HomePage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [featuredBusinesses, setFeaturedBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Seed data first (idempotent) - ignore errors
      await utilityAPI.seed().catch(() => {});
      
      const [catRes, bizRes] = await Promise.all([
        categoriesAPI.getAll(),
        businessesAPI.getFeatured(8),
      ]);
      
      // Ensure we always have arrays
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setFeaturedBusinesses(Array.isArray(bizRes.data) ? bizRes.data : []);
    } catch (error) {
      console.error('Error loading data:', error);
      // Set empty arrays on error
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
    { icon: Search, title: t('howItWorks.step1.title'), desc: t('howItWorks.step1.desc') },
    { icon: CheckCircle2, title: t('howItWorks.step2.title'), desc: t('howItWorks.step2.desc') },
    { icon: CalendarIcon, title: t('howItWorks.step3.title'), desc: t('howItWorks.step3.desc') },
    { icon: Sparkles, title: t('howItWorks.step4.title'), desc: t('howItWorks.step4.desc') },
  ];

  return (
    <div className="min-h-screen" data-testid="home-page">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1551386234-48770e28e791?auto=format&fit=crop&q=80&w=2070"
            alt="Hero background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/40" />
        </div>

        <div className="relative z-10 container-app text-center text-white py-20">
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            <Badge className="bg-[#F05D5E]/20 text-[#F05D5E] border-[#F05D5E]/30 text-sm px-4 py-1">
              {language === 'es' ? '🎉 Lanzamiento en México' : '🎉 Launching in Mexico'}
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-heading font-extrabold tracking-tight leading-tight">
              {t('hero.title')}
            </h1>
            
            <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
              {t('hero.subtitle')}
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="mt-12">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-2 max-w-4xl mx-auto border border-white/20">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      placeholder={t('hero.search.service')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 h-14 bg-white border-0 text-slate-900 placeholder:text-slate-500 rounded-xl"
                      data-testid="search-service-input"
                    />
                  </div>
                  
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      placeholder={t('hero.search.city')}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="pl-12 h-14 bg-white border-0 text-slate-900 placeholder:text-slate-500 rounded-xl"
                      data-testid="search-city-input"
                    />
                  </div>
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-14 bg-white border-0 text-slate-900 justify-start font-normal rounded-xl hover:bg-slate-50"
                        data-testid="search-date-button"
                      >
                        <CalendarIcon className="mr-2 h-5 w-5 text-slate-400" />
                        {date ? format(date, 'PPP', { locale: language === 'es' ? es : enUS }) : t('hero.search.date')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={(date) => date < new Date()}
                        locale={language === 'es' ? es : enUS}
                      />
                    </PopoverContent>
                  </Popover>
                  
                  <Button 
                    type="submit" 
                    className="h-14 btn-coral text-lg rounded-xl"
                    data-testid="search-submit-button"
                  >
                    {t('hero.search.button')}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/50 rounded-full flex justify-center pt-2">
            <div className="w-1 h-2 bg-white/50 rounded-full" />
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="section-padding bg-background" data-testid="categories-section">
        <div className="container-app">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tight">
              {t('categories.title')}
            </h2>
            <p className="text-muted-foreground mt-2">
              {t('categories.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {(Array.isArray(categories) ? categories : []).map((category, index) => {
              const IconComponent = iconMap[category.icon] || Sparkles;
              return (
                <Card
                  key={category.id}
                  className="group cursor-pointer overflow-hidden border-0 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                  onClick={() => navigate(`/search?category=${category.id}`)}
                  data-testid={`category-card-${category.slug}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={category.image_url || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400'}
                      alt={language === 'es' ? category.name_es : category.name_en}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="flex items-center gap-2 text-white">
                        <div className="p-2 rounded-xl bg-[#F05D5E]">
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-lg">
                            {language === 'es' ? category.name_es : category.name_en}
                          </h3>
                          <p className="text-xs text-white/70">
                            {category.business_count} {language === 'es' ? 'negocios' : 'businesses'}
                          </p>
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

      {/* Featured Businesses */}
      {featuredBusinesses.length > 0 && (
        <section className="section-padding bg-muted/30" data-testid="featured-section">
          <div className="container-app">
            <div className="flex items-end justify-between mb-12">
              <div>
                <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tight">
                  {t('featured.title')}
                </h2>
                <p className="text-muted-foreground mt-2">
                  {t('featured.subtitle')}
                </p>
              </div>
              <Button 
                variant="ghost" 
                onClick={() => navigate('/search')}
                className="hidden md:flex text-[#F05D5E] hover:text-[#F05D5E]/80"
                data-testid="view-all-featured"
              >
                {t('featured.viewAll')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredBusinesses.map((business) => (
                <BusinessCard key={business.id} business={business} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="section-padding bg-background" data-testid="how-it-works-section">
        <div className="container-app">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tight">
              {t('howItWorks.title')}
            </h2>
            <p className="text-muted-foreground mt-2">
              {t('howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div 
                key={index} 
                className="relative text-center group"
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-full h-0.5 bg-gradient-to-r from-[#F05D5E] to-transparent" />
                )}
                <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-[#F05D5E]/10 text-[#F05D5E] mb-6 group-hover:bg-[#F05D5E] group-hover:text-white transition-all duration-300">
                  <step.icon className="h-10 w-10" />
                  <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#F05D5E] text-white text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                </div>
                <h3 className="font-heading font-bold text-xl mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business CTA */}
      <section className="section-padding bg-slate-900 dark:bg-slate-950 text-white" data-testid="business-cta-section">
        <div className="container-app">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <Badge className="bg-[#F05D5E]/20 text-[#F05D5E] border-[#F05D5E]/30">
                {t('cta.business.free')}
              </Badge>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold tracking-tight">
                {t('cta.business.title')}
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                {t('cta.business.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="btn-coral text-lg"
                  onClick={() => navigate('/business/register')}
                  data-testid="register-business-cta"
                >
                  {t('cta.business.button')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => navigate('/for-business')}
                >
                  {language === 'es' ? 'Más información' : 'Learn more'}
                </Button>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=800"
                alt="Business owner"
                className="rounded-2xl shadow-2xl"
              />
              <div className="absolute -bottom-6 -left-6 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">+2,500</p>
                    <p className="text-xs text-slate-500">
                      {language === 'es' ? 'Negocios activos' : 'Active businesses'}
                    </p>
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
