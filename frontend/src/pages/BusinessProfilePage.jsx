import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from '@/components/StarRating';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { businessesAPI, servicesAPI, bookingsAPI, reviewsAPI, usersAPI } from '@/lib/api';
import { formatCurrency, formatDate, formatTime, getInitials } from '@/lib/utils';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  MapPin, Clock, Phone, Mail, Star, Heart, Share2, CheckCircle2,
  ArrowLeft, Calendar as CalendarIcon, User, ChevronRight
} from 'lucide-react';

export default function BusinessProfilePage() {
  const { slug } = useParams();
  const { t, language } = useI18n();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  // Booking state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingNotes, setBookingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadBusiness();
  }, [slug]);

  useEffect(() => {
    if (selectedDate && selectedService && business) {
      loadAvailability();
    }
  }, [selectedDate, selectedService, business]);

  const loadBusiness = async () => {
    try {
      const [bizRes, servRes, workersRes, reviewsRes] = await Promise.all([
        businessesAPI.getBySlug(slug),
        businessesAPI.getBySlug(slug).then(r => servicesAPI.getByBusiness(r.data.id)),
        businessesAPI.getBySlug(slug).then(r => businessesAPI.getWorkers(r.data.id)),
        businessesAPI.getBySlug(slug).then(r => reviewsAPI.getByBusiness(r.data.id)),
      ]);

      setBusiness(bizRes.data);
      setServices(servRes.data);
      setWorkers(workersRes.data);
      setReviews(reviewsRes.data);

      // Check if favorite
      if (isAuthenticated) {
        const favsRes = await usersAPI.getFavorites();
        setIsFavorite(favsRes.data.some(f => f.id === bizRes.data.id));
      }
    } catch (error) {
      console.error('Error loading business:', error);
      toast.error(language === 'es' ? 'Error al cargar negocio' : 'Error loading business');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await bookingsAPI.getAvailability(business.id, dateStr, selectedService?.id);
      setAvailableSlots(res.data.slots);
    } catch (error) {
      console.error('Error loading availability:', error);
    }
  };

  const handleFavorite = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

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
    } catch (error) {
      toast.error(language === 'es' ? 'Error al actualizar favoritos' : 'Error updating favorites');
    }
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
      const bookingData = {
        business_id: business.id,
        service_id: selectedService.id,
        worker_id: selectedWorker.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        notes: bookingNotes || null,
        is_home_service: false,
      };

      await bookingsAPI.create(bookingData);
      toast.success(t('booking.success'));
      setBookingOpen(false);
      navigate('/bookings');
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Error al crear reserva' : 'Error creating booking');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="h-64 md:h-96">
          <Skeleton className="w-full h-full" />
        </div>
        <div className="container-app py-8">
          <Skeleton className="h-12 w-1/2 mb-4" />
          <Skeleton className="h-6 w-3/4 mb-8" />
          <div className="grid md:grid-cols-3 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            {language === 'es' ? 'Negocio no encontrado' : 'Business not found'}
          </h2>
          <Button onClick={() => navigate('/search')}>{t('common.back')}</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 bg-background" data-testid="business-profile-page">
      {/* Hero Image */}
      <div className="relative h-64 md:h-96 overflow-hidden">
        <img
          src={business.photos?.[0] || business.logo_url || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200'}
          alt={business.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 text-white hover:bg-white/20"
          data-testid="back-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.back')}
        </Button>

        {/* Actions */}
        <div className="absolute top-4 right-4 flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={handleFavorite}
            data-testid="favorite-button"
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-[#F05D5E] text-[#F05D5E]' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigator.share?.({ title: business.name, url: window.location.href })}
          >
            <Share2 className="h-5 w-5" />
          </Button>
        </div>

        {/* Business Info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <div className="container-app">
            <div className="flex flex-wrap gap-2 mb-3">
              {business.badges?.map(badge => (
                <Badge key={badge} className="bg-[#F05D5E] text-white border-0">
                  {badge === 'nuevo' ? t('badge.new') : badge === 'verificado' ? t('badge.verified') : badge}
                </Badge>
              ))}
              {business.status === 'pending' && (
                <Badge variant="outline" className="border-yellow-400 text-yellow-400">
                  {language === 'es' ? 'En revisión' : 'Under review'}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-heading font-bold">{business.name}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-white/90">
              {business.rating > 0 && (
                <div className="flex items-center gap-1">
                  <StarRating rating={business.rating} size="small" />
                  <span className="text-sm">({business.review_count} {t('business.reviews')})</span>
                </div>
              )}
              <span className="flex items-center gap-1 text-sm">
                <MapPin className="h-4 w-4" />
                {business.city}, {business.state}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container-app py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <Tabs defaultValue="services" className="w-full">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="services" data-testid="tab-services">{t('business.services')}</TabsTrigger>
                <TabsTrigger value="about" data-testid="tab-about">{t('business.about')}</TabsTrigger>
                <TabsTrigger value="reviews" data-testid="tab-reviews">{t('business.reviews')}</TabsTrigger>
              </TabsList>

              {/* Services Tab */}
              <TabsContent value="services" className="mt-6 space-y-4">
                {services.length > 0 ? services.map(service => (
                  <Card key={service.id} className="overflow-hidden hover:border-[#F05D5E]/30 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-heading font-bold text-lg">{service.name}</h3>
                        {service.description && (
                          <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {service.duration_minutes} {t('booking.minutes')}
                          </span>
                          {service.is_home_service && (
                            <Badge variant="outline">
                              {language === 'es' ? 'A domicilio' : 'Home service'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xl font-bold text-[#F05D5E]">
                          {formatCurrency(service.price)}
                        </p>
                        <Button
                          className="mt-2 btn-coral text-sm px-4 py-2"
                          onClick={() => startBooking(service)}
                          disabled={business.status !== 'approved'}
                          data-testid={`book-service-${service.id}`}
                        >
                          {t('business.bookNow')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )) : (
                  <Card className="p-8 text-center">
                    <p className="text-muted-foreground">
                      {language === 'es' ? 'No hay servicios disponibles' : 'No services available'}
                    </p>
                  </Card>
                )}
              </TabsContent>

              {/* About Tab */}
              <TabsContent value="about" className="mt-6 space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-heading font-bold text-lg mb-3">{t('business.about')}</h3>
                    <p className="text-muted-foreground leading-relaxed">{business.description}</p>
                  </CardContent>
                </Card>

                {/* Staff */}
                {workers.length > 0 && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-heading font-bold text-lg mb-4">{t('business.staff')}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {workers.map(worker => (
                          <div key={worker.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                            <Avatar>
                              <AvatarImage src={worker.photo_url} />
                              <AvatarFallback className="bg-[#F05D5E] text-white">
                                {getInitials(worker.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{worker.name}</p>
                              {worker.bio && (
                                <p className="text-xs text-muted-foreground">{worker.bio}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Location */}
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-heading font-bold text-lg mb-3">{t('business.location')}</h3>
                    <p className="text-muted-foreground flex items-start gap-2">
                      <MapPin className="h-5 w-5 text-[#F05D5E] mt-0.5 flex-shrink-0" />
                      {business.address}, {business.city}, {business.state} {business.zip_code}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Reviews Tab */}
              <TabsContent value="reviews" className="mt-6 space-y-4">
                {reviews.length > 0 ? reviews.map(review => (
                  <Card key={review.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <Avatar>
                          <AvatarImage src={review.user_photo} />
                          <AvatarFallback className="bg-slate-200">
                            {getInitials(review.user_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{review.user_name}</p>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(review.created_at, language === 'es' ? 'es-MX' : 'en-US')}
                            </span>
                          </div>
                          <StarRating rating={review.rating} size="small" showValue={false} />
                          {review.comment && (
                            <p className="text-sm text-muted-foreground mt-2">{review.comment}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )) : (
                  <Card className="p-8 text-center">
                    <p className="text-muted-foreground">
                      {language === 'es' ? 'Aún no hay reseñas' : 'No reviews yet'}
                    </p>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Book Card */}
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h3 className="font-heading font-bold text-lg mb-4">
                  {language === 'es' ? 'Reservar cita' : 'Book appointment'}
                </h3>
                {business.status === 'approved' ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      {language === 'es' 
                        ? 'Selecciona un servicio para comenzar tu reserva'
                        : 'Select a service to start your booking'}
                    </p>
                    {services.slice(0, 3).map(service => (
                      <Button
                        key={service.id}
                        variant="outline"
                        className="w-full justify-between mb-2 h-auto py-3"
                        onClick={() => startBooking(service)}
                      >
                        <div className="text-left">
                          <p className="font-medium">{service.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {service.duration_minutes} min
                          </p>
                        </div>
                        <span className="font-bold text-[#F05D5E]">
                          {formatCurrency(service.price)}
                        </span>
                      </Button>
                    ))}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <Badge variant="outline" className="mb-2 border-yellow-400 text-yellow-600">
                      {language === 'es' ? 'En revisión' : 'Under review'}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {language === 'es' 
                        ? 'Este negocio está siendo verificado y no acepta reservas aún'
                        : 'This business is being verified and is not accepting bookings yet'}
                    </p>
                  </div>
                )}

                {/* Contact Info */}
                <div className="border-t border-border mt-6 pt-6 space-y-3">
                  <a href={`tel:${business.phone}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground">
                    <Phone className="h-4 w-4" />
                    {business.phone}
                  </a>
                  <a href={`mailto:${business.email}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground">
                    <Mail className="h-4 w-4" />
                    {business.email}
                  </a>
                </div>

                {/* Deposit Info */}
                {business.requires_deposit && (
                  <div className="border-t border-border mt-4 pt-4">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#F05D5E]" />
                      {t('booking.deposit')}: {formatCurrency(business.deposit_amount)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Booking Dialog */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {language === 'es' ? 'Reservar cita' : 'Book appointment'}
            </DialogTitle>
            <DialogDescription>
              {selectedService?.name} - {formatCurrency(selectedService?.price || 0)}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 py-4">
            {[1, 2, 3].map(step => (
              <div
                key={step}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  bookingStep >= step 
                    ? 'bg-[#F05D5E] text-white' 
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step}
              </div>
            ))}
          </div>

          {/* Step 1: Select Date */}
          {bookingStep === 1 && (
            <div className="space-y-4">
              <h4 className="font-medium">{t('booking.selectDate')}</h4>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  setBookingStep(2);
                }}
                disabled={(date) => date < new Date()}
                locale={language === 'es' ? es : enUS}
                className="rounded-md border mx-auto"
              />
            </div>
          )}

          {/* Step 2: Select Time */}
          {bookingStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{t('booking.selectTime')}</h4>
                <Button variant="ghost" size="sm" onClick={() => setBookingStep(1)}>
                  {t('common.back')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {format(selectedDate, 'PPP', { locale: language === 'es' ? es : enUS })}
              </p>
              {availableSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                  {availableSlots.map((slot, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      className="flex flex-col h-auto py-3"
                      onClick={() => handleTimeSelect(slot)}
                      data-testid={`time-slot-${idx}`}
                    >
                      <span className="font-bold">{formatTime(slot.time)}</span>
                      <span className="text-xs text-muted-foreground">{slot.worker_name}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {language === 'es' ? 'No hay horarios disponibles para esta fecha' : 'No slots available for this date'}
                </p>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {bookingStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{language === 'es' ? 'Confirmar reserva' : 'Confirm booking'}</h4>
                <Button variant="ghost" size="sm" onClick={() => setBookingStep(2)}>
                  {t('common.back')}
                </Button>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'es' ? 'Servicio' : 'Service'}</span>
                    <span className="font-medium">{selectedService?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'es' ? 'Fecha' : 'Date'}</span>
                    <span className="font-medium">{format(selectedDate, 'PPP', { locale: language === 'es' ? es : enUS })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'es' ? 'Hora' : 'Time'}</span>
                    <span className="font-medium">{formatTime(selectedTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'es' ? 'Profesional' : 'Professional'}</span>
                    <span className="font-medium">{selectedWorker?.name}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 mt-2">
                    <span className="font-medium">{t('booking.total')}</span>
                    <span className="font-bold text-[#F05D5E]">{formatCurrency(selectedService?.price || 0)}</span>
                  </div>
                  {business.requires_deposit && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('booking.deposit')}</span>
                      <span>{formatCurrency(business.deposit_amount)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {language === 'es' ? 'Notas (opcional)' : 'Notes (optional)'}
                </label>
                <Textarea
                  placeholder={language === 'es' ? 'Alguna indicación especial...' : 'Any special instructions...'}
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                className="w-full btn-coral"
                onClick={handleConfirmBooking}
                disabled={submitting}
                data-testid="confirm-booking-button"
              >
                {submitting 
                  ? (language === 'es' ? 'Confirmando...' : 'Confirming...') 
                  : t('booking.confirm')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
