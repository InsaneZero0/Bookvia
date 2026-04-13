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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
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
  Award, Users, Briefcase, Navigation, Link2
} from 'lucide-react';

// ─── Day name helper ──────────────────────────────────
const DAY_NAMES_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Photo Gallery ────────────────────────────────────
function PhotoGrid({ photos, name }) {
  const [showAll, setShowAll] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [carouselApi, setCarouselApi] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const displayPhotos = photos.length > 0 ? photos : [
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=400',
    'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400',
    'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=400',
  ];

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on('select', onSelect);
    onSelect();
    return () => carouselApi.off('select', onSelect);
  }, [carouselApi]);

  return (
    <>
      <div className="relative h-[280px] md:h-[420px] overflow-hidden">
        {/* Desktop: grid layout */}
        <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-1.5 h-full">
          <div className="col-span-2 row-span-2 relative overflow-hidden rounded-l-xl cursor-pointer" onClick={() => setLightboxIdx(0)}>
            <img src={displayPhotos[0]} alt={name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          {displayPhotos.slice(1, 5).map((photo, i) => (
            <div key={i} className={`relative overflow-hidden cursor-pointer ${i === 1 ? 'rounded-tr-xl' : ''} ${i === 3 ? 'rounded-br-xl' : ''}`} onClick={() => setLightboxIdx(i + 1)}>
              <img src={photo} alt={`${name} ${i + 2}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
              {i === 3 && displayPhotos.length > 5 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-lg hover:bg-black/60 transition-colors"
                  data-testid="show-all-photos"
                >
                  +{displayPhotos.length - 5} fotos
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Mobile: swipeable carousel */}
        <div className="md:hidden h-full relative">
          <Carousel opts={{ loop: true, align: 'start' }} setApi={setCarouselApi} className="h-full">
            <CarouselContent className="h-[280px] -ml-0">
              {displayPhotos.map((photo, i) => (
                <CarouselItem key={i} className="pl-0 basis-full h-full" onClick={() => setLightboxIdx(i)}>
                  <img src={photo} alt={`${name} ${i + 1}`} className="w-full h-full object-cover" />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          {/* Dot indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {displayPhotos.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => carouselApi?.scrollTo(i)}
                className={`w-2 h-2 rounded-full transition-all ${currentSlide === i ? 'bg-white w-4' : 'bg-white/50'}`}
                data-testid={`photo-dot-${i}`}
              />
            ))}
            {displayPhotos.length > 8 && (
              <span className="text-white text-[10px] font-medium ml-1">+{displayPhotos.length - 8}</span>
            )}
          </div>
          {/* Counter */}
          <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full z-10">
            {currentSlide + 1}/{displayPhotos.length}
          </div>
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
              <img key={i} src={photo} alt={`${name} ${i + 1}`} className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => { setShowAll(false); setLightboxIdx(i); }} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox - fullscreen single photo */}
      <Dialog open={lightboxIdx !== null} onOpenChange={() => setLightboxIdx(null)}>
        <DialogContent className="max-w-5xl p-0 bg-black/95 border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>Foto {(lightboxIdx || 0) + 1}</DialogDescription>
          </DialogHeader>
          {lightboxIdx !== null && (
            <div className="relative flex items-center justify-center min-h-[50vh] max-h-[90vh]">
              <img
                src={displayPhotos[lightboxIdx]}
                alt={`${name} ${lightboxIdx + 1}`}
                className="max-w-full max-h-[85vh] object-contain"
              />
              {displayPhotos.length > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIdx((lightboxIdx - 1 + displayPhotos.length) % displayPhotos.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-colors"
                    data-testid="lightbox-prev"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => setLightboxIdx((lightboxIdx + 1) % displayPhotos.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-colors"
                    data-testid="lightbox-next"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-sm bg-black/40 px-3 py-1 rounded-full">
                {lightboxIdx + 1} / {displayPhotos.length}
              </div>
            </div>
          )}
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
function getOpenStatus(workers, language) {
  const now = new Date();
  const today = (now.getDay() + 6) % 7; // JS Sunday=0 -> Monday=0
  const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

  let isOpen = false;
  let nextOpenText = '';

  // Check if open right now
  workers.forEach(w => {
    const daySchedule = w.schedule?.[String(today)];
    if (daySchedule?.is_available && daySchedule.blocks?.length > 0) {
      daySchedule.blocks.forEach(block => {
        if (currentTime >= block.start_time && currentTime < block.end_time) {
          isOpen = true;
        }
      });
    }
  });

  if (isOpen) {
    // Find closing time today
    let latestClose = '00:00';
    workers.forEach(w => {
      const ds = w.schedule?.[String(today)];
      if (ds?.is_available) {
        ds.blocks?.forEach(b => {
          if (currentTime >= b.start_time && currentTime < b.end_time && b.end_time > latestClose) {
            latestClose = b.end_time;
          }
        });
      }
    });
    nextOpenText = language === 'es' ? `Cierra a las ${latestClose}` : `Closes at ${latestClose}`;
  } else {
    // Find next opening
    const dayNames = language === 'es'
      ? ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let offset = 0; offset < 7; offset++) {
      const checkDay = (today + offset) % 7;
      for (const w of workers) {
        const ds = w.schedule?.[String(checkDay)];
        if (ds?.is_available && ds.blocks?.length > 0) {
          const firstBlock = ds.blocks[0];
          if (offset === 0 && firstBlock.start_time > currentTime) {
            nextOpenText = language === 'es' ? `Abre hoy a las ${firstBlock.start_time}` : `Opens today at ${firstBlock.start_time}`;
            return { isOpen, nextOpenText };
          } else if (offset === 1) {
            nextOpenText = language === 'es' ? `Abre manana a las ${firstBlock.start_time}` : `Opens tomorrow at ${firstBlock.start_time}`;
            return { isOpen, nextOpenText };
          } else if (offset > 1) {
            nextOpenText = language === 'es' ? `Abre ${dayNames[checkDay]} a las ${firstBlock.start_time}` : `Opens ${dayNames[checkDay]} at ${firstBlock.start_time}`;
            return { isOpen, nextOpenText };
          }
        }
      }
    }
  }

  return { isOpen, nextOpenText };
}

function BusinessHours({ workers, language, business }) {
  const dayNames = language === 'es' ? DAY_NAMES_ES : DAY_NAMES_EN;

  // Merge all worker schedules to get business hours (fallback)
  // Prefer business_hours from business document if set
  const mergedHours = {};
  const bizHours = business?.business_hours;
  for (let day = 0; day < 7; day++) {
    if (bizHours && bizHours[String(day)]) {
      const bh = bizHours[String(day)];
      mergedHours[day] = bh.is_open ? { open: bh.open_time, close: bh.close_time } : null;
    } else {
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
  }

  // Group consecutive days with same hours
  const groups = [];
  let i = 0;
  while (i < 7) {
    const current = mergedHours[i];
    const currentKey = current ? `${current.open}-${current.close}` : 'closed';
    let j = i + 1;
    while (j < 7) {
      const next = mergedHours[j];
      const nextKey = next ? `${next.open}-${next.close}` : 'closed';
      if (nextKey !== currentKey) break;
      j++;
    }
    groups.push({ startDay: i, endDay: j - 1, hours: current });
    i = j;
  }

  const today = (new Date().getDay() + 6) % 7;
  const { isOpen, nextOpenText } = getOpenStatus(workers, language);

  return (
    <div className="space-y-1">
      {/* Open/Closed status */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b">
        <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${isOpen ? 'text-emerald-600' : 'text-red-500'}`}>
          <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
          {isOpen ? (language === 'es' ? 'Abierto ahora' : 'Open now') : (language === 'es' ? 'Cerrado' : 'Closed')}
        </span>
        {nextOpenText && <span className="text-xs text-muted-foreground">&mdash; {nextOpenText}</span>}
      </div>

      {/* Grouped hours */}
      {groups.map((g, idx) => {
        const isToday = today >= g.startDay && today <= g.endDay;
        const label = g.startDay === g.endDay
          ? dayNames[g.startDay]
          : `${dayNames[g.startDay]} - ${dayNames[g.endDay]}`;

        return (
          <div key={idx} className={`flex justify-between items-center py-2 px-3 rounded-lg text-sm ${isToday ? 'bg-[#F05D5E]/5 font-medium' : ''}`}>
            <span className={isToday ? 'text-[#F05D5E] font-semibold' : ''}>{label}</span>
            <span className={g.hours ? '' : 'text-muted-foreground'}>
              {g.hours ? `${g.hours.open} - ${g.hours.close}` : (language === 'es' ? 'Cerrado' : 'Closed')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Share Button ──────────────────────────────────────
function ShareButton({ business, language }) {
  const [showMenu, setShowMenu] = useState(false);
  const shareUrl = window.location.href;
  const shareText = language === 'es'
    ? `Mira ${business.name} en Bookvia - ${business.description || 'Reserva tu cita ahora'}`
    : `Check out ${business.name} on Bookvia - ${business.description || 'Book your appointment now'}`;

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: business.name, text: shareText, url: shareUrl });
    } catch {
      setShowMenu(true);
    }
  };

  const handleWhatsApp = () => {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
    window.open(waUrl, '_blank');
    setShowMenu(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success(language === 'es' ? 'Enlace copiado al portapapeles' : 'Link copied to clipboard');
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="rounded-full gap-1.5"
        onClick={navigator.share ? handleNativeShare : () => setShowMenu(!showMenu)}
        data-testid="share-button"
      >
        <Share2 className="h-4 w-4" />
        {language === 'es' ? 'Compartir' : 'Share'}
      </Button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg py-1 w-48" data-testid="share-menu">
            <button
              className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2 transition-colors"
              onClick={handleWhatsApp}
              data-testid="share-whatsapp"
            >
              <svg className="h-4 w-4 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </button>
            <button
              className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2 transition-colors"
              onClick={handleCopyLink}
              data-testid="share-copy-link"
            >
              <Link2 className="h-4 w-4 text-muted-foreground" />
              {language === 'es' ? 'Copiar enlace' : 'Copy link'}
            </button>
          </div>
        </>
      )}
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
  const [selectedWorker, setSelectedWorker] = useState(null); // null = not selected, {id, name} = specific worker
  const [availableSlots, setAvailableSlots] = useState([]);
  const [serviceWorkers, setServiceWorkers] = useState([]); // workers that offer the selected service
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingNotes, setBookingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Client data (for business users booking on behalf of clients)
  const [clientData, setClientData] = useState({ name: '', email: '', phone: '', info: '' });

  // Refs for scroll-to-section
  const servicesRef = useRef(null);
  const teamRef = useRef(null);
  const reviewsRef = useRef(null);
  const locationRef = useRef(null);
  const hoursRef = useRef(null);

  // Check if the logged-in user is a business
  const isBizUser = isAuthenticated && user?.role === 'business';

  // ─── Data Loading ─────────────────────────────────
  useEffect(() => {
    loadBusiness();
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    if (selectedDate && selectedService && selectedWorker && business) {
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
      const workerId = selectedWorker?.id;
      const res = await bookingsAPI.getAvailability(business.id, dateStr, selectedService?.id, workerId);
      const slots = Array.isArray(res.data?.slots) ? res.data.slots : [];
      setAvailableSlots(slots);
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

  const startBooking = async (service) => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/business/${slug}` } } });
      return;
    }
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedWorker(null);
    setAvailableSlots([]);
    setServiceWorkers([]);
    setClientData({ name: '', email: '', phone: '', info: '' });
    setBookingStep(1);
    setBookingOpen(true);
    // Load workers for this service
    try {
      const res = await businessesAPI.getWorkers(business.id, false, service.id);
      setServiceWorkers(Array.isArray(res.data) ? res.data : []);
    } catch { setServiceWorkers([]); }
  };

  // Step mapping: business users have an extra step (client data)
  // Business: 1=Fecha, 2=Datos, 3=Profesional, 4=Hora, 5=Confirmar
  // Regular:  1=Fecha, 2=Profesional, 3=Hora, 4=Confirmar
  const stepProfesional = isBizUser ? 3 : 2;
  const stepHora = isBizUser ? 4 : 3;
  const stepConfirmar = isBizUser ? 5 : 4;

  const handleClientDataNext = () => {
    if (!clientData.name.trim()) {
      toast.error(language === 'es' ? 'El nombre es obligatorio' : 'Name is required');
      return;
    }
    setBookingStep(stepProfesional);
  };

  const handleWorkerSelect = (worker) => {
    setSelectedWorker(worker);
    setSelectedTime(null);
    setAvailableSlots([]);
    setBookingStep(stepHora);
  };

  const handleTimeSelect = (slot) => {
    setSelectedTime(slot.time);
    setBookingStep(stepConfirmar);
  };

  const handleConfirmBooking = async () => {
    setSubmitting(true);
    try {
      const payload = {
        business_id: business.id,
        service_id: selectedService.id,
        worker_id: selectedWorker.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        notes: bookingNotes || null,
        is_home_service: false,
      };
      // If business user, add client data and skip_payment flag
      if (isBizUser) {
        payload.client_name = clientData.name;
        payload.client_email = clientData.email || null;
        payload.client_phone = clientData.phone || null;
        payload.client_info = clientData.info || null;
        payload.skip_payment = true;
      }
      await bookingsAPI.create(payload);
      toast.success(language === 'es' ? 'Cita registrada con exito' : 'Appointment registered successfully');
      setBookingOpen(false);
      if (isBizUser) {
        navigate('/business/dashboard');
      } else {
        navigate('/bookings');
      }
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
            <div className="flex items-start gap-4">
              {(business.logo_url || business.cover_photo) && (
                <img src={business.logo_url || business.cover_photo} alt={business.name} className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm shrink-0" data-testid="business-logo" />
              )}
              <div className="space-y-2">
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
              {workers.length > 0 && (() => {
                const { isOpen, nextOpenText } = getOpenStatus(workers, language);
                return (
                  <button onClick={() => scrollTo(hoursRef)} className="flex items-center gap-1.5 hover:text-foreground transition-colors" data-testid="open-status-badge">
                    <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
                    <span className={`font-medium ${isOpen ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isOpen ? (language === 'es' ? 'Abierto' : 'Open') : (language === 'es' ? 'Cerrado' : 'Closed')}
                    </span>
                    {nextOpenText && <span className="text-xs hidden sm:inline">{nextOpenText}</span>}
                  </button>
                );
              })()}
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {business.address}, {business.city}, {business.state}
              </span>
            </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleFavorite} data-testid="favorite-button" className="rounded-full gap-1.5">
              <Heart className={`h-4 w-4 ${isFavorite ? 'fill-[#F05D5E] text-[#F05D5E]' : ''}`} />
              {isFavorite ? (language === 'es' ? 'Guardado' : 'Saved') : (language === 'es' ? 'Guardar' : 'Save')}
            </Button>
            <ShareButton business={business} language={language} />
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
              { label: language === 'es' ? 'Horarios' : 'Hours', ref: hoursRef },
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
              <section ref={hoursRef} className="scroll-mt-32" data-testid="hours-section">
                <h2 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#F05D5E]" />
                  {language === 'es' ? 'Horarios de apertura' : 'Opening hours'}
                </h2>
                <div className="rounded-xl border p-4">
                  <BusinessHours workers={workers} language={language} business={business} />
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
      {(
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
      )}

      {/* ─── Booking Dialog ─────────────────────────── */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{language === 'es' ? 'Reservar cita' : 'Book appointment'}</DialogTitle>
            <DialogDescription>{selectedService?.name} — {formatCurrency(selectedService?.price || 0)} — {selectedService?.duration_minutes || 60} min</DialogDescription>
          </DialogHeader>

          {/* Steps indicator */}
          <div className="flex items-center justify-center gap-1.5 py-3">
            {(isBizUser ? [
              { n: 1, label: language === 'es' ? 'Fecha' : 'Date' },
              { n: 2, label: language === 'es' ? 'Datos' : 'Data' },
              { n: 3, label: language === 'es' ? 'Profesional' : 'Professional' },
              { n: 4, label: language === 'es' ? 'Hora' : 'Time' },
              { n: 5, label: language === 'es' ? 'Confirmar' : 'Confirm' },
            ] : [
              { n: 1, label: language === 'es' ? 'Fecha' : 'Date' },
              { n: 2, label: language === 'es' ? 'Profesional' : 'Professional' },
              { n: 3, label: language === 'es' ? 'Hora' : 'Time' },
              { n: 4, label: language === 'es' ? 'Confirmar' : 'Confirm' },
            ]).map((step, idx, arr) => (
              <div key={step.n} className="flex items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${bookingStep >= step.n ? 'bg-[#F05D5E] text-white' : 'bg-muted text-muted-foreground'}`}>
                  {step.n}
                </div>
                <span className="text-xs hidden sm:inline">{step.label}</span>
                {idx < arr.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* Step 1: Date */}
          {bookingStep === 1 && (
            <div className="space-y-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { setSelectedDate(date); setBookingStep(isBizUser ? 2 : stepProfesional); }}
                disabled={(date) => date < new Date()}
                locale={language === 'es' ? es : enUS}
                className="rounded-md border mx-auto"
              />
            </div>
          )}

          {/* Step 2 (Business only): Client Data */}
          {isBizUser && bookingStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{format(selectedDate, 'EEEE, d MMMM', { locale: language === 'es' ? es : enUS })}</p>
                <Button variant="ghost" size="sm" onClick={() => setBookingStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />{language === 'es' ? 'Cambiar' : 'Change'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{language === 'es' ? 'Datos del cliente:' : 'Client information:'}</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">{language === 'es' ? 'Nombre *' : 'Name *'}</Label>
                  <Input
                    placeholder={language === 'es' ? 'Nombre del cliente' : 'Client name'}
                    value={clientData.name}
                    onChange={e => setClientData(p => ({ ...p, name: e.target.value }))}
                    data-testid="client-name-input"
                  />
                </div>
                <div>
                  <Label className="text-xs">{language === 'es' ? 'Correo electronico' : 'Email'}</Label>
                  <Input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={clientData.email}
                    onChange={e => setClientData(p => ({ ...p, email: e.target.value }))}
                    data-testid="client-email-input"
                  />
                </div>
                <div>
                  <Label className="text-xs">{language === 'es' ? 'Telefono' : 'Phone'}</Label>
                  <Input
                    type="tel"
                    placeholder="+52 123 456 7890"
                    value={clientData.phone}
                    onChange={e => setClientData(p => ({ ...p, phone: e.target.value }))}
                    data-testid="client-phone-input"
                  />
                </div>
                <div>
                  <Label className="text-xs">{language === 'es' ? 'Informacion adicional' : 'Additional info'}</Label>
                  <Textarea
                    placeholder={language === 'es' ? 'Notas sobre el cliente...' : 'Notes about the client...'}
                    value={clientData.info}
                    onChange={e => setClientData(p => ({ ...p, info: e.target.value }))}
                    rows={2}
                    data-testid="client-info-input"
                  />
                </div>
              </div>
              <Button className="w-full btn-coral" onClick={handleClientDataNext} data-testid="client-data-next">
                {language === 'es' ? 'Continuar' : 'Continue'}
              </Button>
            </div>
          )}

          {/* Step: Worker Selection */}
          {bookingStep === stepProfesional && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{format(selectedDate, 'EEEE, d MMMM', { locale: language === 'es' ? es : enUS })}</p>
                <Button variant="ghost" size="sm" onClick={() => setBookingStep(isBizUser ? 2 : 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />{language === 'es' ? 'Cambiar' : 'Change'}
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">{language === 'es' ? 'Selecciona quien te atendera:' : 'Select who will attend you:'}</p>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {serviceWorkers.map(worker => (
                  <button
                    key={worker.id}
                    onClick={() => handleWorkerSelect(worker)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-[#F05D5E] hover:bg-[#F05D5E]/5 transition-all text-left"
                    data-testid={`worker-${worker.id}`}
                  >
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {worker.photo_url ? (
                        <img src={worker.photo_url} alt={worker.name} className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{worker.name}</p>
                      {worker.bio && <p className="text-xs text-muted-foreground line-clamp-1">{worker.bio}</p>}
                    </div>
                  </button>
                ))}

                {serviceWorkers.length === 0 && (
                  <p className="text-sm text-center text-muted-foreground py-4">
                    {language === 'es' ? 'No hay profesionales disponibles para este servicio' : 'No professionals available for this service'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step: Time */}
          {bookingStep === stepHora && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{format(selectedDate, 'EEEE, d MMMM', { locale: language === 'es' ? es : enUS })}</p>
                  <p className="text-xs text-muted-foreground">{selectedWorker?.name}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setBookingStep(stepProfesional); setSelectedWorker(null); setAvailableSlots([]); }}>
                  <ChevronLeft className="h-4 w-4 mr-1" />{language === 'es' ? 'Cambiar' : 'Change'}
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
                      <span className="text-[10px] text-muted-foreground">{formatTime(slot.time)} - {formatTime(slot.end_time)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">{language === 'es' ? 'No hay horarios disponibles' : 'No slots available'}</p>
                </div>
              )}
            </div>
          )}

          {/* Step: Confirm */}
          {bookingStep === stepConfirmar && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setBookingStep(stepHora)}>
                <ChevronLeft className="h-4 w-4 mr-1" />{language === 'es' ? 'Cambiar hora' : 'Change time'}
              </Button>

              <div className="rounded-xl bg-muted/30 border p-4 space-y-3">
                {[
                  { label: language === 'es' ? 'Servicio' : 'Service', value: selectedService?.name },
                  { label: language === 'es' ? 'Duracion' : 'Duration', value: `${selectedService?.duration_minutes || 60} min` },
                  { label: language === 'es' ? 'Fecha' : 'Date', value: selectedDate ? format(selectedDate, 'PPP', { locale: language === 'es' ? es : enUS }) : '' },
                  { label: language === 'es' ? 'Horario' : 'Time', value: selectedTime ? `${formatTime(selectedTime)} - ${formatTime((() => { const [h, m] = selectedTime.split(':').map(Number); const end = new Date(2000, 0, 1, h, m + (selectedService?.duration_minutes || 60)); return `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`; })())}` : '' },
                  { label: language === 'es' ? 'Profesional' : 'Professional', value: selectedWorker?.name },
                  ...(isBizUser && clientData.name ? [
                    { label: language === 'es' ? 'Cliente' : 'Client', value: clientData.name },
                    ...(clientData.email ? [{ label: 'Email', value: clientData.email }] : []),
                    ...(clientData.phone ? [{ label: language === 'es' ? 'Telefono' : 'Phone', value: clientData.phone }] : []),
                  ] : []),
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
                {!isBizUser && business.requires_deposit && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{language === 'es' ? 'Anticipo' : 'Deposit'}</span>
                    <span>{formatCurrency(business.deposit_amount)}</span>
                  </div>
                )}
                {isBizUser && (
                  <div className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {language === 'es' ? 'Sin anticipo — registro directo' : 'No deposit — direct registration'}
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
                  : isBizUser
                    ? (language === 'es' ? 'Registrar cita' : 'Register appointment')
                    : (language === 'es' ? 'Confirmar reserva' : 'Confirm booking')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
