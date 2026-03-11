import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { StarRating } from '@/components/StarRating';
import { BusinessCard } from '@/components/BusinessCard';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { businessesAPI, servicesAPI, bookingsAPI, reviewsAPI, usersAPI } from '@/lib/api';
import { formatCurrency, formatDate, formatTime, getInitials, formatRelativeTime } from '@/lib/utils';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  MapPin, Clock, Phone, Mail, Star, Heart, Share2, CheckCircle2,
  ArrowLeft, Calendar as CalendarIcon, User, ChevronRight, ChevronLeft,
  Globe, Shield, Scissors, ExternalLink, MessageSquare, HelpCircle,
  Award, Users, Briefcase, Navigation
} from 'lucide-react';

// ─── Day name helper ──────────────────────────────────
const DAY_NAMES_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Photo Gallery ────────────────────────────────────
function PhotoGrid({ photos, name }) {
  const [showAll, setShowAll] = useState(false);
  const displayPhotos = photos.length > 0 ? photos : [
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=400',
    'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400',
    'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=400',
  ];

  return (
    <>
      <div className="relative h-[280px] md:h-[420px] overflow-hidden">
        <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-1.5 h-full">
          <div className="col-span-2 row-span-2 relative overflow-hidden rounded-l-xl">
            <img src={displayPhotos[0]} alt={name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          {displayPhotos.slice(1, 5).map((photo, i) => (
            <div key={i} className={`relative overflow-hidden ${i === 1 ? 'rounded-tr-xl' : ''} ${i === 3 ? 'rounded-br-xl' : ''}`}>
              <img src={photo} alt={`${name} ${i + 2}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
              {i === 3 && displayPhotos.length > 5 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-lg hover:bg-black/60 transition-colors"
                  data-testid="show-all-photos"
                >
                  +{displayPhotos.length - 5} fotos
                </button>
              )}
            </div>
          ))}
        </div>
        {/* Mobile: single image */}
        <div className="md:hidden h-full">
          <img src={displayPhotos[0]} alt={name} className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Full gallery dialog */}
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>{displayPhotos.length} fotos</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {displayPhotos.map((photo, i) => (
              <img key={i} src={photo} alt={`${name} ${i + 1}`} className="w-full aspect-square object-cover rounded-lg" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Rating Summary ───────────────────────────────────
function RatingSummary({ rating, reviewCount, reviews }) {
  const distribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => Math.round(r.rating) === star).length,
    pct: reviews.length > 0 ? (reviews.filter(r => Math.round(r.rating) === star).length / reviews.length) * 100 : 0,
  }));

  return (
    <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
      <div className="text-center">
        <p className="text-5xl font-heading font-bold">{rating > 0 ? rating.toFixed(1) : '—'}</p>
        <StarRating rating={rating} showValue={false} size="default" />
        <p className="text-sm text-muted-foreground mt-1">{reviewCount} reseñas</p>
      </div>
      <div className="flex-1 space-y-1.5 w-full">
        {distribution.map(d => (
          <div key={d.star} className="flex items-center gap-2 text-sm">
            <span className="w-3 text-right">{d.star}</span>
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${d.pct}%` }} />
            </div>
            <span className="w-6 text-right text-muted-foreground">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Business Hours ───────────────────────────────────
function BusinessHours({ workers, language }) {
  const dayNames = language === 'es' ? DAY_NAMES_ES : DAY_NAMES_EN;

  // Merge all worker schedules to get business hours
  const mergedHours = {};
  for (let day = 0; day < 7; day++) {
    let earliest = '23:59';
    let latest = '00:00';
    let isOpen = false;

    workers.forEach(w => {
      const daySchedule = w.schedule?.[String(day)];
      if (daySchedule?.is_available && daySchedule.blocks?.length > 0) {
        isOpen = true;
        daySchedule.blocks.forEach(block => {
          if (block.start_time < earliest) earliest = block.start_time;
          if (block.end_time > latest) latest = block.end_time;
        });
      }
    });

    mergedHours[day] = isOpen ? { open: earliest, close: latest } : null;
  }

  const today = (new Date().getDay() + 6) % 7; // JS Sunday=0, we need Monday=0

  return (
    <div className="space-y-2">
      {dayNames.map((name, i) => (
        <div key={i} className={`flex justify-between items-center py-2 px-3 rounded-lg text-sm ${i === today ? 'bg-[#F05D5E]/5 font-medium' : ''}`}>
          <span className={i === today ? 'text-[#F05D5E] font-semibold' : ''}>{name}</span>
          <span className={mergedHours[i] ? '' : 'text-muted-foreground'}>
            {mergedHours[i] ? `${mergedHours[i].open} - ${mergedHours[i].close}` : (language === 'es' ? 'Cerrado' : 'Closed')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function BusinessProfilePage() {
  const { slug } = useParams();
  const { t, language } = useI18n();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Data
  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [similarBusinesses, setSimilarBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  // Booking state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingNotes, setBookingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Refs for scroll-to-section
  const servicesRef = useRef(null);
  const teamRef = useRef(null);
  const reviewsRef = useRef(null);
  const locationRef = useRef(null);

  // ─── Data Loading ─────────────────────────────────
  useEffect(() => {
    loadBusiness();
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    if (selectedDate && selectedService && business) {
      loadAvailability();
    }
  }, [selectedDate, selectedService, selectedWorker]);

  const loadBusiness = async () => {
    setLoading(true);
    try {
      const bizRes = await businessesAPI.getBySlug(slug);
      const biz = bizRes.data;
      setBusiness(biz);

      const [servRes, workersRes, reviewsRes] = await Promise.all([
        servicesAPI.getByBusiness(biz.id),
        businessesAPI.getWorkers(biz.id),
        reviewsAPI.getByBusiness(biz.id),
      ]);

      setServices(Array.isArray(servRes.data) ? servRes.data : []);
      setWorkers(Array.isArray(workersRes.data) ? workersRes.data : []);
      setReviews(Array.isArray(reviewsRes.data) ? reviewsRes.data : []);

      // Load similar businesses
      try {
        const simRes = await businessesAPI.search({ category_id: biz.category_id, limit: 4 });
        const similar = (Array.isArray(simRes.data) ? simRes.data : simRes.data?.businesses || [])
          .filter(b => b.id !== biz.id)
          .slice(0, 4);
        setSimilarBusinesses(similar);
      } catch { setSimilarBusinesses([]); }

      // Check favorite
      if (isAuthenticated) {
        try {
          const favsRes = await usersAPI.getFavorites();
          setIsFavorite((Array.isArray(favsRes.data) ? favsRes.data : []).some(f => f.id === biz.id));
        } catch {}
      }
    } catch (error) {
      console.error('Error loading business:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    setSlotsLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await bookingsAPI.getAvailability(business.id, dateStr, selectedService?.id, selectedWorker?.id || undefined);
      setAvailableSlots(Array.isArray(res.data?.slots) ? res.data.slots : []);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  // ─── Actions ──────────────────────────────────────
  const handleFavorite = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    try {
      if (isFavorite) {
        await usersAPI.removeFavorite(business.id);
        setIsFavorite(false);
        toast.success(language === 'es' ? 'Eliminado de favoritos' : 'Removed from favorites');
      } else {
        await usersAPI.addFavorite(business.id);
        setIsFavorite(true);
        toast.success(language === 'es' ? 'Agregado a favoritos' : 'Added to favorites');
      }
    } catch { toast.error(language === 'es' ? 'Error' : 'Error'); }
  };

  const startBooking = (service) => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/business/${slug}` } } });
      return;
    }
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedWorker(null);
    setAvailableSlots([]);
    setBookingStep(1);
    setBookingOpen(true);
  };

  const handleTimeSelect = (slot) => {
    setSelectedTime(slot.time);
    setSelectedWorker({ id: slot.worker_id, name: slot.worker_name });
    setBookingStep(3);
  };

  const handleConfirmBooking = async () => {
    setSubmitting(true);
    try {
      await bookingsAPI.create({
        business_id: business.id,
        service_id: selectedService.id,
        worker_id: selectedWorker.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        notes: bookingNotes || null,
        is_home_service: false,
      });
      toast.success(language === 'es' ? 'Reserva creada con éxito' : 'Booking created successfully');
      setBookingOpen(false);
      navigate('/bookings');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'es' ? 'Error al crear reserva' : 'Error creating booking'));
    } finally {
      setSubmitting(false);
    }
  };

  const scrollTo = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ─── Loading / Not Found ──────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen pt-16 bg-background">
        <Skeleton className="w-full h-[280px] md:h-[420px]" />
        <div className="container-app py-8 space-y-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-80" />
          </div>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-heading font-bold mb-2">
            {language === 'es' ? 'Negocio no encontrado' : 'Business not found'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {language === 'es' ? 'El negocio que buscas no existe o fue eliminado.' : 'The business you are looking for does not exist.'}
          </p>
          <Button onClick={() => navigate('/search')} className="btn-coral">{language === 'es' ? 'Buscar negocios' : 'Search businesses'}</Button>
        </Card>
      </div>
    );
  }

  const faqs = [
    { q: language === 'es' ? '¿Cómo puedo cancelar mi reserva?' : 'How can I cancel my booking?', a: language === 'es' ? 'Puedes cancelar desde tu panel de reservas hasta 24 horas antes de tu cita sin cargo.' : 'You can cancel from your bookings panel up to 24 hours before your appointment at no charge.' },
    { q: language === 'es' ? '¿Qué métodos de pago aceptan?' : 'What payment methods do you accept?', a: language === 'es' ? 'Aceptamos tarjetas de crédito/débito a través de Stripe. El pago del anticipo se realiza en línea y el resto se paga directamente en el establecimiento.' : 'We accept credit/debit cards via Stripe. Deposit is paid online and the rest at the venue.' },
    { q: language === 'es' ? '¿Puedo reagendar mi cita?' : 'Can I reschedule my appointment?', a: language === 'es' ? 'Sí, puedes reagendar tu cita hasta 12 horas antes desde tu panel de reservas.' : 'Yes, you can reschedule up to 12 hours before from your bookings panel.' },
    { q: language === 'es' ? '¿Es necesario el anticipo?' : 'Is a deposit required?', a: business.requires_deposit ? (language === 'es' ? `Sí, este negocio requiere un anticipo de ${formatCurrency(business.deposit_amount)} para confirmar tu reserva.` : `Yes, this business requires a deposit of ${formatCurrency(business.deposit_amount)} to confirm your booking.`) : (language === 'es' ? 'No, este negocio no requiere anticipo para reservar.' : 'No, this business does not require a deposit.') },
  ];

  // ═══════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════
  return (
    <div className="min-h-screen pt-16 bg-background" data-testid="business-profile-page">

      {/* ─── Photo Grid ─────────────────────────────── */}
      <div className="container-app mt-2">
        <PhotoGrid photos={business.photos || []} name={business.name} />
      </div>

      {/* ─── Header Info ────────────────────────────── */}
      <div className="container-app pt-6 pb-2">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {business.category_name && (
                <Badge variant="secondary" className="text-xs">{business.category_name}</Badge>
              )}
              {business.badges?.map(badge => (
                <Badge key={badge} className="bg-[#F05D5E]/10 text-[#F05D5E] border-[#F05D5E]/20 text-xs">
                  {badge === 'verificado' ? <><Shield className="h-3 w-3 mr-1" />Verificado</> : badge}
                </Badge>
              ))}
              {business.is_featured && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                  <Award className="h-3 w-3 mr-1" />Destacado
                </Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold tracking-tight" data-testid="business-name">
              {business.name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {business.rating > 0 && (
                <button onClick={() => scrollTo(reviewsRef)} className="flex items-center gap-1 hover:text-foreground transition-colors" data-testid="rating-display">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold text-foreground">{business.rating.toFixed(1)}</span>
                  <span>({business.review_count})</span>
                </button>
              )}
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {business.address}, {business.city}, {business.state}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleFavorite} data-testid="favorite-button" className="rounded-full gap-1.5">
              <Heart className={`h-4 w-4 ${isFavorite ? 'fill-[#F05D5E] text-[#F05D5E]' : ''}`} />
              {isFavorite ? (language === 'es' ? 'Guardado' : 'Saved') : (language === 'es' ? 'Guardar' : 'Save')}
            </Button>
            <Button variant="outline" size="sm" className="rounded-full gap-1.5"
              onClick={() => navigator.share?.({ title: business.name, url: window.location.href }).catch(() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success(language === 'es' ? 'Enlace copiado' : 'Link copied');
              })}
            >
              <Share2 className="h-4 w-4" />
              {language === 'es' ? 'Compartir' : 'Share'}
            </Button>
          </div>
        </div>
      </div>

      <Separator className="my-2" />

      {/* ─── Sticky Section Nav ─────────────────────── */}
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-sm border-b">
        <div className="container-app">
          <nav className="flex gap-1 overflow-x-auto py-2 scrollbar-hide" data-testid="section-nav">
            {[
              { label: language === 'es' ? 'Servicios' : 'Services', ref: servicesRef },
              { label: language === 'es' ? 'Equipo' : 'Team', ref: teamRef },
              { label: language === 'es' ? 'Reseñas' : 'Reviews', ref: reviewsRef },
              { label: language === 'es' ? 'Ubicación' : 'Location', ref: locationRef },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => scrollTo(item.ref)}
                className="px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ─── Main Layout ────────────────────────────── */}
      <div className="container-app py-8">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* ═══ Left Column ═══ */}
          <div className="lg:col-span-2 space-y-10">

            {/* ── Services ─────────────────────────── */}
            <section ref={servicesRef} className="scroll-mt-32" data-testid="services-section">
              <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                <Scissors className="h-5 w-5 text-[#F05D5E]" />
                {language === 'es' ? 'Servicios disponibles' : 'Available services'}
              </h2>
              {services.length > 0 ? (
                <div className="space-y-3">
                  {services.map(service => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-border/60 hover:border-[#F05D5E]/30 hover:shadow-sm transition-all group"
                      data-testid={`service-card-${service.id}`}
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <h3 className="font-heading font-semibold group-hover:text-[#F05D5E] transition-colors">{service.name}</h3>
                        {service.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{service.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {service.duration_minutes} min
                          </span>
                          {service.is_home_service && (
                            <Badge variant="outline" className="text-xs py-0 h-5">
                              {language === 'es' ? 'A domicilio' : 'Home service'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <span className="text-lg font-bold text-[#F05D5E]">{formatCurrency(service.price)}</span>
                        <Button
                          size="sm"
                          className="btn-coral text-xs px-5 py-1.5 h-8"
                          onClick={() => startBooking(service)}
                          disabled={business.status !== 'approved'}
                          data-testid={`book-service-${service.id}`}
                        >
                          {language === 'es' ? 'Reservar' : 'Book'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">{language === 'es' ? 'No hay servicios disponibles' : 'No services available'}</p>
                </Card>
              )}
            </section>

            {/* ── Team ─────────────────────────────── */}
            {workers.length > 0 && (
              <section ref={teamRef} className="scroll-mt-32" data-testid="team-section">
                <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#F05D5E]" />
                  {language === 'es' ? 'Nuestro equipo' : 'Our team'}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {workers.map(worker => (
                    <div key={worker.id} className="group p-4 rounded-xl border hover:border-[#F05D5E]/30 hover:shadow-sm transition-all text-center" data-testid={`worker-card-${worker.id}`}>
                      <Avatar className="h-16 w-16 mx-auto mb-3 ring-2 ring-background group-hover:ring-[#F05D5E]/20 transition-all">
                        <AvatarImage src={worker.photo_url} />
                        <AvatarFallback className="bg-[#F05D5E] text-white text-lg font-bold">
                          {getInitials(worker.name)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-heading font-semibold text-sm">{worker.name}</p>
                      {worker.bio && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{worker.bio}</p>
                      )}
                      {worker.service_ids?.length > 0 && (
                        <p className="text-xs text-[#F05D5E] mt-1.5">
                          {worker.service_ids.length} {language === 'es' ? 'servicios' : 'services'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── About ────────────────────────────── */}
            <section className="scroll-mt-32" data-testid="about-section">
              <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-[#F05D5E]" />
                {language === 'es' ? 'Acerca del negocio' : 'About the business'}
              </h2>
              <div className="p-5 rounded-xl bg-muted/30 border">
                <p className="text-muted-foreground leading-relaxed">{business.description || (language === 'es' ? 'Sin descripción disponible.' : 'No description available.')}</p>
                {business.completed_appointments > 0 && (
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                    <div className="text-center">
                      <p className="text-xl font-bold text-[#F05D5E]">{business.completed_appointments}</p>
                      <p className="text-xs text-muted-foreground">{language === 'es' ? 'Citas completadas' : 'Completed appointments'}</p>
                    </div>
                    {business.rating > 0 && (
                      <div className="text-center">
                        <p className="text-xl font-bold text-[#F05D5E]">{business.rating.toFixed(1)}</p>
                        <p className="text-xs text-muted-foreground">{language === 'es' ? 'Calificación' : 'Rating'}</p>
                      </div>
                    )}
                    {workers.length > 0 && (
                      <div className="text-center">
                        <p className="text-xl font-bold text-[#F05D5E]">{workers.length}</p>
                        <p className="text-xs text-muted-foreground">{language === 'es' ? 'Profesionales' : 'Professionals'}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── Business Hours ────────────────────── */}
            {workers.length > 0 && (
              <section data-testid="hours-section">
                <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#F05D5E]" />
                  {language === 'es' ? 'Horarios de apertura' : 'Opening hours'}
                </h2>
                <div className="rounded-xl border p-4">
                  <BusinessHours workers={workers} language={language} />
                </div>
              </section>
            )}

            {/* ── Location ─────────────────────────── */}
            <section ref={locationRef} className="scroll-mt-32" data-testid="location-section">
              <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[#F05D5E]" />
                {language === 'es' ? 'Ubicación' : 'Location'}
              </h2>
              <div className="rounded-xl border overflow-hidden">
                {business.latitude && business.longitude ? (
                  <iframe
                    title="map"
                    width="100%"
                    height="250"
                    style={{ border: 0 }}
                    loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${business.longitude - 0.008}%2C${business.latitude - 0.005}%2C${business.longitude + 0.008}%2C${business.latitude + 0.005}&layer=mapnik&marker=${business.latitude}%2C${business.longitude}`}
                  />
                ) : (
                  <div className="h-[200px] bg-muted flex items-center justify-center">
                    <MapPin className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <p className="text-sm flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-[#F05D5E] mt-0.5 shrink-0" />
                    {business.address}, {business.city}, {business.state} {business.zip_code}
                  </p>
                  {business.latitude && business.longitude && (
                    <Button variant="outline" size="sm" className="rounded-full gap-1.5" asChild>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${business.latitude},${business.longitude}`} target="_blank" rel="noopener noreferrer">
                        <Navigation className="h-4 w-4" />
                        {language === 'es' ? 'Cómo llegar' : 'Get directions'}
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </section>

            {/* ── Reviews ──────────────────────────── */}
            <section ref={reviewsRef} className="scroll-mt-32" data-testid="reviews-section">
              <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-[#F05D5E]" />
                {language === 'es' ? 'Reseñas de clientes' : 'Customer reviews'}
              </h2>

              {reviews.length > 0 ? (
                <div className="space-y-6">
                  <div className="p-5 rounded-xl bg-muted/30 border">
                    <RatingSummary rating={business.rating} reviewCount={business.review_count} reviews={reviews} />
                  </div>

                  <div className="space-y-4">
                    {reviews.map(review => (
                      <div key={review.id} className="p-4 rounded-xl border" data-testid={`review-${review.id}`}>
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={review.user_photo} />
                            <AvatarFallback className="bg-slate-200 text-slate-600 text-sm">
                              {getInitials(review.user_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm">{review.user_name}</p>
                              <span className="text-xs text-muted-foreground">{formatRelativeTime(review.created_at, language === 'es' ? 'es-MX' : 'en-US')}</span>
                            </div>
                            <StarRating rating={review.rating} size="small" showValue={false} />
                            {review.comment && (
                              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{review.comment}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl border">
                  <Star className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">{language === 'es' ? 'Aún no hay reseñas. ¡Sé el primero!' : 'No reviews yet. Be the first!'}</p>
                </div>
              )}
            </section>

            {/* ── FAQ ──────────────────────────────── */}
            <section data-testid="faq-section">
              <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-[#F05D5E]" />
                {language === 'es' ? 'Preguntas frecuentes' : 'Frequently asked questions'}
              </h2>
              <Accordion type="single" collapsible className="rounded-xl border px-4">
                {faqs.map((faq, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className={i === faqs.length - 1 ? 'border-b-0' : ''}>
                    <AccordionTrigger className="text-sm font-medium hover:no-underline">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>

            {/* ── Similar Businesses ────────────────── */}
            {similarBusinesses.length > 0 && (
              <section data-testid="similar-section">
                <h2 className="text-lg font-heading font-bold mb-4">
                  {language === 'es' ? 'Negocios similares' : 'Similar businesses'}
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {similarBusinesses.map(biz => (
                    <BusinessCard key={biz.id} business={biz} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ═══ Right Column — Booking Sidebar ═══ */}
          <div className="hidden lg:block">
            <div className="sticky top-32 space-y-4">
              <Card className="shadow-lg border-border/60" data-testid="booking-sidebar">
                <CardContent className="p-5 space-y-4">
                  {/* Price range */}
                  {services.length > 0 && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-heading font-bold">{formatCurrency(Math.min(...services.map(s => s.price)))}</span>
                      {services.length > 1 && <span className="text-sm text-muted-foreground">- {formatCurrency(Math.max(...services.map(s => s.price)))}</span>}
                    </div>
                  )}

                  {business.status === 'approved' ? (
                    <>
                      {/* Service Selection */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{language === 'es' ? 'Selecciona servicio' : 'Select service'}</label>
                        {services.slice(0, 5).map(service => (
                          <button
                            key={service.id}
                            onClick={() => startBooking(service)}
                            className={`w-full text-left p-3 rounded-lg border transition-all hover:border-[#F05D5E]/50 hover:bg-[#F05D5E]/5 ${selectedService?.id === service.id ? 'border-[#F05D5E] bg-[#F05D5E]/5' : 'border-border/60'}`}
                            data-testid={`sidebar-service-${service.id}`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm font-medium line-clamp-1">{service.name}</p>
                                <p className="text-xs text-muted-foreground">{service.duration_minutes} min</p>
                              </div>
                              <span className="font-bold text-sm text-[#F05D5E]">{formatCurrency(service.price)}</span>
                            </div>
                          </button>
                        ))}
                        {services.length > 5 && (
                          <button onClick={() => scrollTo(servicesRef)} className="w-full text-center text-sm text-[#F05D5E] hover:underline py-1">
                            {language === 'es' ? `Ver ${services.length - 5} más` : `See ${services.length - 5} more`}
                          </button>
                        )}
                      </div>

                      <Separator />

                      {/* Big CTA */}
                      <Button
                        className="w-full btn-coral h-12 text-base"
                        onClick={() => services.length > 0 && startBooking(services[0])}
                        disabled={services.length === 0}
                        data-testid="sidebar-book-now"
                      >
                        <CalendarIcon className="h-5 w-5 mr-2" />
                        {language === 'es' ? 'Reservar ahora' : 'Book now'}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Badge variant="outline" className="border-yellow-400 text-yellow-600 mb-2">
                        {language === 'es' ? 'En revisión' : 'Under review'}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {language === 'es' ? 'Este negocio aún no acepta reservas.' : 'This business is not yet accepting bookings.'}
                      </p>
                    </div>
                  )}

                  <Separator />

                  {/* Contact */}
                  <div className="space-y-2.5">
                    <a href={`tel:${business.phone}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-[#F05D5E] transition-colors">
                      <Phone className="h-4 w-4" /> {business.phone}
                    </a>
                    <a href={`mailto:${business.email}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-[#F05D5E] transition-colors">
                      <Mail className="h-4 w-4" /> {business.email}
                    </a>
                  </div>

                  {business.requires_deposit && (
                    <>
                      <Separator />
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#F05D5E]" />
                        {language === 'es' ? 'Anticipo requerido' : 'Deposit required'}: {formatCurrency(business.deposit_amount)}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Mobile Bottom Bar ──────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t p-3 safe-area-bottom" data-testid="mobile-booking-bar">
        <div className="flex items-center justify-between gap-3">
          <div>
            {services.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{language === 'es' ? 'Desde' : 'From'}</span>
                <span className="text-lg font-bold ml-1">{formatCurrency(Math.min(...services.map(s => s.price)))}</span>
              </>
            )}
          </div>
          <Button
            className="btn-coral px-8"
            onClick={() => services.length > 0 && startBooking(services[0])}
            disabled={services.length === 0 || business.status !== 'approved'}
            data-testid="mobile-book-now"
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            {language === 'es' ? 'Reservar' : 'Book'}
          </Button>
        </div>
      </div>

      {/* ─── Booking Dialog ─────────────────────────── */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{language === 'es' ? 'Reservar cita' : 'Book appointment'}</DialogTitle>
            <DialogDescription>{selectedService?.name} — {formatCurrency(selectedService?.price || 0)}</DialogDescription>
          </DialogHeader>

          {/* Steps */}
          <div className="flex items-center justify-center gap-2 py-3">
            {[
              { n: 1, label: language === 'es' ? 'Fecha' : 'Date' },
              { n: 2, label: language === 'es' ? 'Hora' : 'Time' },
              { n: 3, label: language === 'es' ? 'Confirmar' : 'Confirm' },
            ].map(step => (
              <div key={step.n} className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${bookingStep >= step.n ? 'bg-[#F05D5E] text-white' : 'bg-muted text-muted-foreground'}`}>
                  {step.n}
                </div>
                <span className="text-xs hidden sm:inline">{step.label}</span>
                {step.n < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* Step 1: Date */}
          {bookingStep === 1 && (
            <div className="space-y-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { setSelectedDate(date); setBookingStep(2); }}
                disabled={(date) => date < new Date()}
                locale={language === 'es' ? es : enUS}
                className="rounded-md border mx-auto"
              />
            </div>
          )}

          {/* Step 2: Time */}
          {bookingStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{format(selectedDate, 'EEEE, d MMMM', { locale: language === 'es' ? es : enUS })}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setBookingStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />{language === 'es' ? 'Cambiar fecha' : 'Change date'}
                </Button>
              </div>

              {slotsLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                  {availableSlots.map((slot, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleTimeSelect(slot)}
                      className="flex flex-col items-center py-3 px-2 rounded-lg border hover:border-[#F05D5E] hover:bg-[#F05D5E]/5 transition-all text-center"
                      data-testid={`time-slot-${idx}`}
                    >
                      <span className="font-bold text-sm">{formatTime(slot.time)}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">{slot.worker_name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">{language === 'es' ? 'No hay horarios disponibles para esta fecha' : 'No slots available for this date'}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {bookingStep === 3 && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setBookingStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" />{language === 'es' ? 'Cambiar hora' : 'Change time'}
              </Button>

              <div className="rounded-xl bg-muted/30 border p-4 space-y-3">
                {[
                  { label: language === 'es' ? 'Servicio' : 'Service', value: selectedService?.name },
                  { label: language === 'es' ? 'Fecha' : 'Date', value: selectedDate ? format(selectedDate, 'PPP', { locale: language === 'es' ? es : enUS }) : '' },
                  { label: language === 'es' ? 'Hora' : 'Time', value: selectedTime ? formatTime(selectedTime) : '' },
                  { label: language === 'es' ? 'Profesional' : 'Professional', value: selectedWorker?.name },
                ].map(item => (
                  <div key={item.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium">{item.value}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>{language === 'es' ? 'Total' : 'Total'}</span>
                  <span className="text-[#F05D5E] font-bold">{formatCurrency(selectedService?.price || 0)}</span>
                </div>
                {business.requires_deposit && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{language === 'es' ? 'Anticipo' : 'Deposit'}</span>
                    <span>{formatCurrency(business.deposit_amount)}</span>
                  </div>
                )}
              </div>

              <Textarea
                placeholder={language === 'es' ? 'Notas para el profesional (opcional)...' : 'Notes for the professional (optional)...'}
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={2}
              />

              <Button
                className="w-full btn-coral h-12 text-base"
                onClick={handleConfirmBooking}
                disabled={submitting}
                data-testid="confirm-booking-button"
              >
                {submitting
                  ? (language === 'es' ? 'Confirmando...' : 'Confirming...')
                  : (language === 'es' ? 'Confirmar reserva' : 'Confirm booking')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
