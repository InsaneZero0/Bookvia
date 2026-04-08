import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarWidget } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { bookingsAPI, paymentsAPI, reviewsAPI } from '@/lib/api';
import { formatTime, getStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Calendar, Clock, User, ChevronRight, AlertTriangle, XCircle, 
  CreditCard, Timer, CheckCircle2, AlertCircle, Ban, Star, RefreshCw
} from 'lucide-react';

const STATUS_CONFIG = {
  hold: { 
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    icon: Timer,
    label: { es: 'Esperando pago', en: 'Awaiting payment' }
  },
  confirmed: { 
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: CheckCircle2,
    label: { es: 'Confirmada', en: 'Confirmed' }
  },
  completed: { 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    icon: CheckCircle2,
    label: { es: 'Completada', en: 'Completed' }
  },
  cancelled: { 
    color: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    icon: XCircle,
    label: { es: 'Cancelada', en: 'Cancelled' }
  },
  expired: { 
    color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    icon: Ban,
    label: { es: 'Expirada', en: 'Expired' }
  },
  no_show: { 
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: AlertCircle,
    label: { es: 'No asistió', en: 'No show' }
  },
};

export default function UserBookingsPage() {
  const { language } = useI18n();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(null);
  const [reviewModal, setReviewModal] = useState({ open: false, booking: null });
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewedBookings, setReviewedBookings] = useState(new Set());
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, booking: null });
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleTime, setRescheduleTime] = useState(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadBookings();
    
    // Refresh every 30 seconds to update countdowns
    const interval = setInterval(loadBookings, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const loadBookings = async () => {
    try {
      const [upcomingRes, pastRes] = await Promise.all([
        bookingsAPI.getMy({ upcoming: true }),
        bookingsAPI.getMy({ upcoming: false }),
      ]);
      setUpcomingBookings(upcomingRes.data);
      setPastBookings(pastRes.data);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayDeposit = async (booking) => {
    setPaymentLoading(booking.id);
    try {
      const response = await paymentsAPI.createDepositCheckout(booking.id);
      // Redirect to Stripe Checkout
      window.location.href = response.data.url;
    } catch (error) {
      const message = error.response?.data?.detail || 
        (language === 'es' ? 'Error al crear sesión de pago' : 'Error creating payment session');
      toast.error(message);
      setPaymentLoading(null);
    }
  };

  const handleCancel = async (bookingId) => {
    const booking = upcomingBookings.find(b => b.id === bookingId);
    const hoursUntil = booking?.hours_until_appointment;
    
    let message = language === 'es' ? '¿Estás seguro de cancelar esta cita?' : 'Are you sure you want to cancel this booking?';
    
    if (booking?.status === 'confirmed' && booking?.deposit_paid) {
      if (hoursUntil > 24) {
        message += language === 'es' 
          ? '\n\nComo cancelas con más de 24h de anticipación, recibirás un reembolso del 92% del anticipo.'
          : '\n\nSince you are cancelling more than 24h in advance, you will receive a 92% refund of the deposit.';
      } else {
        message += language === 'es'
          ? '\n\nComo cancelas con menos de 24h de anticipación, NO recibirás reembolso del anticipo.'
          : '\n\nSince you are cancelling less than 24h in advance, you will NOT receive a refund of the deposit.';
      }
    }
    
    if (!window.confirm(message)) {
      return;
    }

    setCancelLoading(bookingId);
    try {
      const response = await bookingsAPI.cancelByUser(bookingId, 'Usuario canceló');
      
      if (response.data.refund) {
        toast.success(
          language === 'es' 
            ? `Cita cancelada. Reembolso: $${response.data.refund.refund_amount} MXN` 
            : `Booking cancelled. Refund: $${response.data.refund.refund_amount} MXN`
        );
      } else {
        toast.success(language === 'es' ? 'Cita cancelada' : 'Booking cancelled');
      }
      
      loadBookings();
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Error al cancelar' : 'Error cancelling');
      toast.error(message);
    } finally {
      setCancelLoading(null);
    }
  };

  const openReview = (booking) => {
    setReviewModal({ open: true, booking });
    setReviewRating(0);
    setReviewHover(0);
    setReviewComment('');
  };

  const submitReview = async () => {
    const bk = reviewModal.booking;
    if (!bk || reviewRating < 1) return;
    setReviewLoading(true);
    try {
      await reviewsAPI.create({
        business_id: bk.business_id,
        booking_id: bk.id,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
      });
      toast.success(language === 'es' ? 'Reseña enviada. ¡Gracias!' : 'Review submitted. Thank you!');
      setReviewedBookings(prev => new Set([...prev, bk.id]));
      setReviewModal({ open: false, booking: null });
    } catch (error) {
      const detail = error?.response?.data?.detail || '';
      toast.error(detail || (language === 'es' ? 'Error al enviar reseña' : 'Error submitting review'));
    } finally {
      setReviewLoading(false);
    }
  };

  const openReschedule = (booking) => {
    setRescheduleModal({ open: true, booking });
    setRescheduleDate(null);
    setRescheduleSlots([]);
    setRescheduleTime(null);
  };

  const loadRescheduleSlots = async (date) => {
    const bk = rescheduleModal.booking;
    if (!bk || !date) return;
    setRescheduleDate(date);
    setRescheduleTime(null);
    setSlotsLoading(true);
    try {
      const dateStr = date.toISOString().split('T')[0];
      const res = await bookingsAPI.getAvailability(bk.business_id, dateStr, bk.service_id, bk.worker_id);
      setRescheduleSlots(res.data?.available_slots || []);
    } catch {
      setRescheduleSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const submitReschedule = async () => {
    const bk = rescheduleModal.booking;
    if (!bk || !rescheduleDate || !rescheduleTime) return;
    setRescheduleLoading(true);
    try {
      const dateStr = rescheduleDate.toISOString().split('T')[0];
      await bookingsAPI.reschedule(bk.id, dateStr, rescheduleTime);
      toast.success(language === 'es' ? 'Cita reagendada exitosamente' : 'Appointment rescheduled successfully');
      setRescheduleModal({ open: false, booking: null });
      loadBookings();
    } catch (error) {
      const detail = error?.response?.data?.detail || '';
      toast.error(detail || (language === 'es' ? 'Error al reagendar' : 'Error rescheduling'));
    } finally {
      setRescheduleLoading(false);
    }
  };

  const getHoldCountdown = (booking) => {
    if (booking.status !== 'hold' || !booking.hold_expires_at) return null;
    
    const expiresAt = new Date(booking.hold_expires_at);
    const now = new Date();
    const diffMs = expiresAt - now;
    
    if (diffMs <= 0) return { expired: true };
    
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    const progress = ((30 * 60 * 1000 - diffMs) / (30 * 60 * 1000)) * 100;
    
    return { minutes, seconds, progress };
  };

  const BookingCard = ({ booking, showActions = true }) => {
    const statusConfig = STATUS_CONFIG[booking.status] || STATUS_CONFIG.confirmed;
    const StatusIcon = statusConfig.icon;
    const countdown = getHoldCountdown(booking);

    return (
      <Card 
        className={`overflow-hidden transition-colors ${
          booking.status === 'hold' ? 'border-amber-500/50 bg-amber-50/30 dark:bg-amber-900/10' : ''
        }`} 
        data-testid={`booking-card-${booking.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-muted flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-xs text-muted-foreground uppercase">
                {new Date(booking.date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { month: 'short' })}
              </span>
              <span className="text-2xl font-bold">{new Date(booking.date + 'T12:00:00').getDate()}</span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-heading font-bold text-lg line-clamp-1">{booking.service_name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-1">{booking.business_name}</p>
                </div>
                <Badge className={statusConfig.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label[language]}
                </Badge>
              </div>
              
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatTime(booking.time)} - {formatTime(booking.end_time)}
                </span>
                {booking.worker_name && (
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {booking.worker_name}
                  </span>
                )}
              </div>

              {/* Hold countdown and pay button */}
              {booking.status === 'hold' && countdown && !countdown.expired && (
                <div className="mt-4 p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
                      <Timer className="h-4 w-4" />
                      {language === 'es' ? 'Tiempo para pagar:' : 'Time to pay:'}
                    </span>
                    <span className="font-mono font-bold text-amber-900 dark:text-amber-100">
                      {String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
                    </span>
                  </div>
                  <Progress value={countdown.progress} className="h-2 mb-3" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-700 dark:text-amber-300">
                      {language === 'es' ? 'Anticipo:' : 'Deposit:'} <strong>${booking.deposit_amount} MXN</strong>
                    </span>
                    <Button 
                      onClick={() => handlePayDeposit(booking)}
                      disabled={paymentLoading === booking.id}
                      className="btn-coral"
                      data-testid={`pay-deposit-${booking.id}`}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {paymentLoading === booking.id 
                        ? (language === 'es' ? 'Cargando...' : 'Loading...') 
                        : (language === 'es' ? 'Pagar ahora' : 'Pay now')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Expired hold message */}
              {booking.status === 'hold' && countdown?.expired && (
                <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {language === 'es' 
                      ? 'El tiempo para pagar ha expirado. El horario se liberará pronto.'
                      : 'Payment time has expired. The slot will be released soon.'}
                  </p>
                </div>
              )}

              {/* Confirmed booking - show deposit info */}
              {booking.status === 'confirmed' && booking.deposit_paid && (
                <div className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {language === 'es' 
                    ? `Anticipo pagado: $${booking.deposit_amount} MXN`
                    : `Deposit paid: $${booking.deposit_amount} MXN`}
                </div>
              )}

              {/* Action buttons */}
              {showActions && booking.can_cancel && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {booking.status === 'confirmed' && booking.hours_until_appointment > 24 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openReschedule(booking)}
                      className="text-blue-600 hover:bg-blue-50"
                      data-testid={`reschedule-booking-${booking.id}`}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      {language === 'es' ? 'Reagendar' : 'Reschedule'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancel(booking.id)}
                    disabled={cancelLoading === booking.id}
                    className="text-red-600 hover:bg-red-50"
                    data-testid={`cancel-booking-${booking.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {cancelLoading === booking.id 
                      ? '...' 
                      : (language === 'es' ? 'Cancelar' : 'Cancel')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/business/${booking.business_slug || booking.business_id}`)}
                  >
                    {language === 'es' ? 'Ver negocio' : 'View business'}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}

              {/* Review button for past/completed bookings */}
              {(booking.status === 'completed' || (booking.status === 'confirmed' && booking.date <= new Date().toISOString().split('T')[0])) && !booking.has_review && !reviewedBookings.has(booking.id) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 text-amber-600 border-amber-200 hover:bg-amber-50"
                  onClick={() => openReview(booking)}
                  data-testid={`review-booking-${booking.id}`}
                >
                  <Star className="h-4 w-4 mr-1" />
                  {language === 'es' ? 'Calificar servicio' : 'Rate service'}
                </Button>
              )}
              {(booking.has_review || reviewedBookings.has(booking.id)) && (
                <div className="mt-4 flex items-center gap-1 text-sm text-amber-600">
                  <Star className="h-4 w-4 fill-amber-500" />
                  {language === 'es' ? 'Ya calificaste este servicio' : 'Already rated'}
                </div>
              )}

              {/* Cancellation info */}
              {booking.status === 'cancelled' && booking.cancelled_by && (
                <div className="mt-3 text-sm text-muted-foreground">
                  {language === 'es' ? 'Cancelada por: ' : 'Cancelled by: '}
                  {booking.cancelled_by === 'user' 
                    ? (language === 'es' ? 'ti' : 'you') 
                    : (language === 'es' ? 'el negocio' : 'the business')}
                  {booking.cancellation_reason && ` - ${booking.cancellation_reason}`}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-4 flex gap-4">
                  <Skeleton className="w-16 h-16 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="bookings-page">
      <div className="container-app py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold">
              {language === 'es' ? 'Mis Citas' : 'My Appointments'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'es' ? 'Gestiona tus citas y pagos' : 'Manage your appointments and payments'}
            </p>
          </div>
          <Button className="btn-coral" onClick={() => navigate('/search')} data-testid="new-booking-button">
            {language === 'es' ? 'Nueva reserva' : 'New booking'}
          </Button>
        </div>

        {/* Warnings */}
        {user?.cancellation_count >= 2 && user?.cancellation_count < 4 && (
          <Card className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {language === 'es' 
                  ? `Has cancelado ${user.cancellation_count} citas. Con 4 cancelaciones tu cuenta será suspendida por 15 días.`
                  : `You have cancelled ${user.cancellation_count} appointments. With 4 cancellations your account will be suspended for 15 days.`}
              </p>
            </CardContent>
          </Card>
        )}

        {user?.active_appointments_count >= 4 && (
          <Card className="mb-6 border-blue-500 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {language === 'es' 
                  ? `Tienes ${user.active_appointments_count} de 5 citas activas permitidas.`
                  : `You have ${user.active_appointments_count} of 5 active appointments allowed.`}
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="upcoming" data-testid="upcoming-tab">
              {language === 'es' ? 'Próximas' : 'Upcoming'} ({upcomingBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="past-tab">
              {language === 'es' ? 'Pasadas' : 'Past'} ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-6 space-y-4">
            {upcomingBookings.length > 0 ? (
              upcomingBookings.map(booking => (
                <BookingCard key={booking.id} booking={booking} />
              ))
            ) : (
              <Card className="p-12 text-center">
                <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-heading font-bold text-xl mb-2">
                  {language === 'es' ? 'Sin citas próximas' : 'No upcoming appointments'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {language === 'es' 
                    ? '¿Listo para reservar tu próxima cita?'
                    : 'Ready to book your next appointment?'}
                </p>
                <Button className="btn-coral" onClick={() => navigate('/search')}>
                  {language === 'es' ? 'Explorar negocios' : 'Explore businesses'}
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-6 space-y-4">
            {pastBookings.length > 0 ? (
              pastBookings.map(booking => (
                <BookingCard key={booking.id} booking={booking} showActions={false} />
              ))
            ) : (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">
                  {language === 'es' ? 'No tienes citas pasadas' : 'No past appointments'}
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Review Modal */}
        <Dialog open={reviewModal.open} onOpenChange={(open) => !open && setReviewModal({ open: false, booking: null })}>
          <DialogContent className="max-w-sm" data-testid="review-modal">
            <DialogHeader>
              <DialogTitle>{language === 'es' ? 'Calificar servicio' : 'Rate service'}</DialogTitle>
              <DialogDescription>
                {reviewModal.booking && (
                  <span>{reviewModal.booking.service_name} — {reviewModal.booking.business_name}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 mt-2">
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className="p-1 transition-transform hover:scale-110"
                    onMouseEnter={() => setReviewHover(star)}
                    onMouseLeave={() => setReviewHover(0)}
                    onClick={() => setReviewRating(star)}
                    data-testid={`star-${star}`}
                  >
                    <Star
                      className={`h-9 w-9 transition-colors ${
                        star <= (reviewHover || reviewRating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {reviewRating === 0 && (language === 'es' ? 'Selecciona una calificación' : 'Select a rating')}
                {reviewRating === 1 && (language === 'es' ? 'Muy malo' : 'Very bad')}
                {reviewRating === 2 && (language === 'es' ? 'Malo' : 'Bad')}
                {reviewRating === 3 && (language === 'es' ? 'Regular' : 'Average')}
                {reviewRating === 4 && (language === 'es' ? 'Bueno' : 'Good')}
                {reviewRating === 5 && (language === 'es' ? 'Excelente' : 'Excellent')}
              </p>
              <Textarea
                placeholder={language === 'es' ? 'Escribe una reseña (opcional)' : 'Write a review (optional)'}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                data-testid="review-comment"
              />
              <Button
                className="w-full"
                disabled={reviewRating < 1 || reviewLoading}
                onClick={submitReview}
                data-testid="submit-review-btn"
              >
                {reviewLoading
                  ? (language === 'es' ? 'Enviando...' : 'Submitting...')
                  : (language === 'es' ? 'Enviar calificación' : 'Submit rating')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reschedule Modal */}
        <Dialog open={rescheduleModal.open} onOpenChange={(open) => !open && setRescheduleModal({ open: false, booking: null })}>
          <DialogContent className="max-w-md" data-testid="reschedule-modal">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-blue-600" />
                {language === 'es' ? 'Reagendar cita' : 'Reschedule appointment'}
              </DialogTitle>
              <DialogDescription>
                {rescheduleModal.booking && (
                  <span>{rescheduleModal.booking.service_name} — {rescheduleModal.booking.business_name}</span>
                )}
              </DialogDescription>
            </DialogHeader>

            {rescheduleModal.booking?.deposit_paid && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm" data-testid="no-extra-payment-notice">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {language === 'es'
                  ? 'Tu anticipo ya está pagado. No necesitas pagar de nuevo.'
                  : 'Your deposit is already paid. No extra payment needed.'}
              </div>
            )}

            <div className="space-y-4 mt-2">
              <div>
                <p className="text-sm font-medium mb-2">{language === 'es' ? 'Selecciona nueva fecha' : 'Select new date'}</p>
                <CalendarWidget
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={loadRescheduleSlots}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return date < tomorrow;
                  }}
                  className="rounded-md border mx-auto"
                  data-testid="reschedule-calendar"
                />
              </div>

              {rescheduleDate && (
                <div>
                  <p className="text-sm font-medium mb-2">{language === 'es' ? 'Horarios disponibles' : 'Available times'}</p>
                  {slotsLoading ? (
                    <div className="flex gap-2 flex-wrap">
                      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-20" />)}
                    </div>
                  ) : rescheduleSlots.length > 0 ? (
                    <div className="flex gap-2 flex-wrap max-h-40 overflow-y-auto" data-testid="reschedule-slots">
                      {rescheduleSlots.map(slot => (
                        <Button
                          key={slot.time || slot}
                          variant={rescheduleTime === (slot.time || slot) ? 'default' : 'outline'}
                          size="sm"
                          className={rescheduleTime === (slot.time || slot) ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                          onClick={() => setRescheduleTime(slot.time || slot)}
                          data-testid={`slot-${slot.time || slot}`}
                        >
                          {formatTime(slot.time || slot)}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {language === 'es' ? 'No hay horarios disponibles para esta fecha.' : 'No available times for this date.'}
                    </p>
                  )}
                </div>
              )}

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!rescheduleDate || !rescheduleTime || rescheduleLoading}
                onClick={submitReschedule}
                data-testid="confirm-reschedule-btn"
              >
                {rescheduleLoading
                  ? (language === 'es' ? 'Reagendando...' : 'Rescheduling...')
                  : (language === 'es' ? 'Confirmar nueva fecha' : 'Confirm new date')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
