import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { bookingsAPI, paymentsAPI, reviewsAPI, usersAPI } from '@/lib/api';
import { formatTime, getStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Calendar, Clock, User, ChevronRight, AlertTriangle, XCircle, 
  CreditCard, Timer, CheckCircle2, AlertCircle, Ban, Star, RefreshCw, Loader2
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
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadBookings();
    
    // Refresh every 30 seconds to update countdowns
    const interval = setInterval(loadBookings, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, authLoading]);

  // Deep-link from smart reminder email: ?action=cancel|reschedule&id=<booking_id>
  // Also: ?confirm=<booking_id> (post-appointment "todo bien")
  // Also: ?dispute=<booking_id> (post-appointment "reportar problema")
  useEffect(() => {
    if (loading) return;
    const action = searchParams.get('action');
    const id = searchParams.get('id');
    const confirmId = searchParams.get('confirm');
    const disputeId = searchParams.get('dispute');

    // Handle post-appointment confirm from email link
    if (confirmId) {
      const target = [...upcomingBookings, ...pastBookings].find(b => b.id === confirmId);
      if (target && target.status === 'completed' && !target.client_confirmed_ok_at && !target.has_dispute) {
        handleConfirmOk(target);
      } else if (target?.client_confirmed_ok_at) {
        toast.info(language === 'es' ? 'Ya confirmaste esta cita' : 'You already confirmed this booking');
      }
      setSearchParams({}, { replace: true });
      return;
    }
    if (disputeId) {
      const target = [...upcomingBookings, ...pastBookings].find(b => b.id === disputeId);
      if (target && target.status === 'completed' && !target.has_dispute) {
        setDisputeDialog({ open: true, booking: target });
      }
      setSearchParams({}, { replace: true });
      return;
    }

    if (!action || !id) return;
    const target = upcomingBookings.find(b => b.id === id);
    if (!target) {
      toast.error(language === 'es' ? 'No encontramos la cita en tu lista' : 'We could not find that booking');
      setSearchParams({}, { replace: true });
      return;
    }
    if (action === 'cancel') {
      setCancelDialog({ open: true, booking: target, refundTo: 'card' });
    } else if (action === 'reschedule') {
      setRescheduleModal({ open: true, booking: target });
      setRescheduleDate(null);
      setRescheduleSlots([]);
      setRescheduleTime(null);
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, upcomingBookings, pastBookings, searchParams]);

  const [confirmingOk, setConfirmingOk] = useState(null);
  const [refundChoiceLoading, setRefundChoiceLoading] = useState(null);
  const handleRefundChoice = async (booking, destination) => {
    if (!booking || refundChoiceLoading === booking.id) return;
    setRefundChoiceLoading(booking.id);
    try {
      const res = await bookingsAPI.refundChoice(booking.id, destination);
      toast.success(res.data?.message || (language === 'es' ? 'Eleccion registrada' : 'Choice saved'));
      await loadBookings();
    } catch (err) {
      const msg = err.response?.data?.detail || (language === 'es' ? 'No se pudo procesar' : 'Could not process');
      toast.error(msg);
    } finally {
      setRefundChoiceLoading(null);
    }
  };
  const handleConfirmOk = async (booking) => {
    if (!booking || confirmingOk === booking.id) return;
    setConfirmingOk(booking.id);
    try {
      await bookingsAPI.confirmOk(booking.id);
      toast.success(
        language === 'es'
          ? 'Gracias por confirmar! El negocio recibira su pago en la proxima liquidacion.'
          : 'Thanks for confirming! The business will receive payment in the next settlement.'
      );
      await loadBookings();
    } catch (err) {
      const msg = err.response?.data?.detail || (language === 'es' ? 'No se pudo confirmar' : 'Could not confirm');
      toast.error(msg);
    } finally {
      setConfirmingOk(null);
    }
  };

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

  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    // Best-effort fetch of wallet balance for booking checkout UX
    (async () => {
      try {
        const res = await usersAPI.getWallet();
        setWalletBalance(Number(res.data?.balance || 0));
      } catch { /* ignore */ }
    })();
  }, []);

  const handlePayDeposit = async (booking) => {
    setPaymentLoading(booking.id);
    
    // If wallet has any balance, ask whether to use it
    let useWallet = false;
    if (walletBalance > 0) {
      const totalNeeded = (Number(booking.deposit_amount) || 0) + 8.00;
      const willCover = walletBalance >= totalNeeded;
      const msg = language === 'es'
        ? `Tienes $${walletBalance.toFixed(2)} MXN en tu saldo Bookvia.\n\n${willCover ? 'Tu saldo cubre el total ($' + totalNeeded.toFixed(2) + ' MXN). ¿Pagar con saldo?' : 'Tu saldo cubre $' + walletBalance.toFixed(2) + ' MXN, el resto ($' + (totalNeeded - walletBalance).toFixed(2) + ' MXN) se cobrara a tu tarjeta. ¿Aplicar saldo?'}`
        : `You have $${walletBalance.toFixed(2)} MXN in your Bookvia wallet.\n\n${willCover ? 'Your wallet covers the total ($' + totalNeeded.toFixed(2) + ' MXN). Pay with wallet?' : 'Your wallet covers $' + walletBalance.toFixed(2) + ' MXN; the remainder ($' + (totalNeeded - walletBalance).toFixed(2) + ' MXN) will be charged to your card. Apply wallet?'}`;
      useWallet = window.confirm(msg);
    }
    
    try {
      const response = await paymentsAPI.createDepositCheckout(booking.id, useWallet);
      // If paid entirely with wallet, redirect to local success page
      if (response.data?.wallet_only) {
        toast.success(language === 'es' ? 'Reserva confirmada con tu saldo Bookvia' : 'Booking confirmed with your Bookvia wallet');
        // Navigate to success page instead of Stripe
        window.location.href = response.data.redirect_url || '/bookings';
        return;
      }
      // Otherwise redirect to Stripe Checkout
      window.location.href = response.data.url;
    } catch (error) {
      const message = error.response?.data?.detail || 
        (language === 'es' ? 'Error al crear sesión de pago' : 'Error creating payment session');
      toast.error(message);
      setPaymentLoading(null);
    }
  };

  const [cancelDialog, setCancelDialog] = useState({ open: false, booking: null, refundTo: 'card', preview: null, previewLoading: false });
  const [disputeDialog, setDisputeDialog] = useState({ open: false, booking: null });
  const [disputeReason, setDisputeReason] = useState('');
  const [noShowDialog, setNoShowDialog] = useState({ open: false, booking: null });
  const [noShowDescription, setNoShowDescription] = useState('');

  const submitNoShow = async () => {
    const b = noShowDialog.booking;
    if (!b) return;
    const desc = noShowDescription.trim();
    if (desc.length < 10) {
      toast.error(language === 'es' ? 'Describe lo que paso con al menos 10 caracteres' : 'Please describe what happened (min 10 characters)');
      return;
    }
    try {
      await bookingsAPI.reportNoShow(b.id, desc);
      toast.success(
        language === 'es'
          ? 'Reporte enviado. Bookvia notifico al negocio para responder en 24h.'
          : 'Report sent. Bookvia notified the business to respond within 24h.'
      );
      setNoShowDialog({ open: false, booking: null });
      setNoShowDescription('');
      loadBookings();
    } catch (err) {
      const msg = err.response?.data?.detail || (language === 'es' ? 'Error al reportar' : 'Error reporting');
      toast.error(msg);
    }
  };

  const submitDispute = async () => {
    const b = disputeDialog.booking;
    if (!b) return;
    const reason = disputeReason.trim();
    if (reason.length < 10) {
      toast.error(language === 'es' ? 'Describe el problema con al menos 10 caracteres' : 'Please describe the issue with at least 10 characters');
      return;
    }
    try {
      await bookingsAPI.raiseDispute(b.id, reason);
      toast.success(language === 'es' ? 'Reporte enviado. Bookvia revisara el caso pronto.' : 'Report submitted. Bookvia will review the case soon.');
      setDisputeDialog({ open: false, booking: null });
      setDisputeReason('');
      loadBookings();
    } catch (err) {
      const msg = err.response?.data?.detail || (language === 'es' ? 'Error al reportar problema' : 'Error reporting problem');
      toast.error(msg);
    }
  };

  const handleCancelClick = (bookingId) => {
    const booking = upcomingBookings.find(b => b.id === bookingId);
    if (!booking) return;
    setCancelDialog({ open: true, booking, refundTo: 'card', preview: null, previewLoading: true });
    // Fetch preview (so user sees refund / late-cancel warning BEFORE confirming)
    bookingsAPI.getCancellationPreview(bookingId)
      .then((res) => {
        setCancelDialog((s) => (s.booking?.id === bookingId ? { ...s, preview: res.data, previewLoading: false } : s));
      })
      .catch(() => {
        setCancelDialog((s) => (s.booking?.id === bookingId ? { ...s, preview: null, previewLoading: false } : s));
      });
  };

  const confirmCancel = async () => {
    const booking = cancelDialog.booking;
    if (!booking) return;
    const bookingId = booking.id;
    setCancelLoading(bookingId);
    try {
      const response = await bookingsAPI.cancelByUser(bookingId, 'Usuario canceló', cancelDialog.refundTo);
      
      if (response.data.refund) {
        const r = response.data.refund;
        const amt = r.refund_amount || 0;
        if (amt > 0) {
          if (r.refund_to === 'wallet') {
            toast.success(language === 'es' 
              ? `Cita cancelada. $${amt.toFixed(2)} MXN agregados a tu saldo Bookvia (disponible al instante).` 
              : `Booking cancelled. $${amt.toFixed(2)} MXN added to your Bookvia wallet (instantly available).`);
          } else {
            toast.success(language === 'es' 
              ? `Cita cancelada. Reembolso de $${amt.toFixed(2)} MXN a tu tarjeta (5-10 dias habiles).` 
              : `Booking cancelled. Refund of $${amt.toFixed(2)} MXN to your card (5-10 business days).`);
          }
        } else {
          toast.success(language === 'es' ? 'Cita cancelada (sin reembolso por politica de tiempo).' : 'Booking cancelled (no refund per time policy).');
        }
      } else {
        toast.success(language === 'es' ? 'Cita cancelada' : 'Booking cancelled');
      }
      
      setCancelDialog({ open: false, booking: null, refundTo: 'card', preview: null, previewLoading: false });
      loadBookings();
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Error al cancelar' : 'Error cancelling');
      toast.error(message);
    } finally {
      setCancelLoading(null);
    }
  };

  const handleCancel = (bookingId) => handleCancelClick(bookingId);

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
      const res = await bookingsAPI.reschedule(bk.id, dateStr, rescheduleTime);
      const remaining = res.data?.remaining_reschedules;
      let msg = language === 'es' ? 'Cita reagendada exitosamente' : 'Appointment rescheduled successfully';
      if (typeof remaining === 'number') {
        msg += language === 'es'
          ? remaining > 0
            ? `. Tienes ${remaining} reagendamiento${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'} para esta cita.`
            : '. Este fue tu ultimo reagendamiento permitido para esta cita.'
          : remaining > 0
            ? `. You have ${remaining} reschedule${remaining === 1 ? '' : 's'} left for this booking.`
            : '. This was the last allowed reschedule for this booking.';
      }
      toast.success(msg);
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
                  {(() => {
                    if (booking.status !== 'confirmed') return null;
                    const reschedulesUsed = Number(booking.reschedule_count || 0);
                    const reschedulesLeft = Math.max(0, 2 - reschedulesUsed);
                    // Matches the business's cancellation window (1-72h).
                    // Fallback to 2h if the backend hasn't sent it.
                    const cutoff = Number(booking.reschedule_cutoff_hours) || 2;
                    const canReschedule = booking.hours_until_appointment > cutoff && reschedulesLeft > 0;

                    return (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReschedule(booking)}
                          className="text-blue-600 hover:bg-blue-50"
                          disabled={!canReschedule}
                          title={
                            booking.hours_until_appointment <= cutoff
                              ? (language === 'es'
                                  ? `Solo puedes reagendar con mas de ${cutoff} hora${cutoff === 1 ? '' : 's'} de anticipacion`
                                  : `You can only reschedule more than ${cutoff} hour${cutoff === 1 ? '' : 's'} in advance`)
                              : reschedulesLeft === 0
                              ? (language === 'es' ? 'Ya alcanzaste el limite de 2 reagendamientos' : 'You reached the 2-reschedule limit')
                              : ''
                          }
                          data-testid={`reschedule-booking-${booking.id}`}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          {language === 'es' ? 'Reagendar' : 'Reschedule'}
                          {reschedulesUsed > 0 && (
                            <span className="ml-1 text-[10px] opacity-70">({reschedulesUsed}/2)</span>
                          )}
                        </Button>
                      </>
                    );
                  })()}
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

              {/* No-show button (visible from 30min before to 4h after, only confirmed bookings without report) */}
              {booking.status === 'confirmed' && !booking.no_show_report && booking.deposit_paid && (() => {
                const apptDate = new Date(booking.appointment_date || `${booking.date}T${booking.time}`);
                const minSince = (Date.now() - apptDate.getTime()) / (1000 * 60);
                if (minSince < -30 || minSince > 240) return null;
                return (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 text-rose-700 hover:bg-rose-50 px-2 border border-rose-200"
                    onClick={() => setNoShowDialog({ open: true, booking })}
                    data-testid={`no-show-booking-${booking.id}`}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" />
                    {language === 'es' ? 'El negocio no me atendio' : 'Business didn\'t show up'}
                  </Button>
                );
              })()}
              {booking.no_show_report && !booking.no_show_report.resolved && (
                <div className="mt-3 flex items-center gap-1 text-xs text-rose-700 bg-rose-50 px-2 py-1.5 rounded">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>
                    {language === 'es'
                      ? 'Reporte enviado. Bookvia esta esperando respuesta del negocio.'
                      : 'Report sent. Bookvia is awaiting business response.'}
                  </span>
                </div>
              )}

              {/* Post-appointment confirmation card (only completed bookings within 24h grace, no existing dispute, not yet confirmed) */}
              {booking.status === 'completed' && booking.completed_at && !booking.has_dispute && !booking.client_confirmed_ok_at && (() => {
                const completedAt = new Date(booking.completed_at);
                const hoursSince = (Date.now() - completedAt.getTime()) / (1000 * 60 * 60);
                if (hoursSince > 24) return null;
                const hoursLeft = Math.max(0, 24 - hoursSince);
                const hoursLeftLabel = hoursLeft >= 1
                  ? `${Math.ceil(hoursLeft)} ${language === 'es' ? 'horas' : 'hours'}`
                  : `${Math.ceil(hoursLeft * 60)} ${language === 'es' ? 'min' : 'min'}`;
                return (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 dark:border-emerald-800 p-3.5">
                    <div className="flex items-start gap-2 mb-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                          {language === 'es' ? '¿Que tal estuvo tu cita?' : 'How was your appointment?'}
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 leading-relaxed">
                          {language === 'es'
                            ? `Si confirmas que todo bien, el negocio recibe su pago al instante. Si no, se libera en ${hoursLeftLabel}.`
                            : `If you confirm all went well, the business is paid right away. Otherwise it auto-releases in ${hoursLeftLabel}.`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs"
                        disabled={confirmingOk === booking.id}
                        onClick={() => handleConfirmOk(booking)}
                        data-testid={`confirm-ok-booking-${booking.id}`}
                      >
                        {confirmingOk === booking.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                        {language === 'es' ? 'Si, todo bien' : 'Yes, all good'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 h-8 px-3 text-xs"
                        onClick={() => setDisputeDialog({ open: true, booking })}
                        data-testid={`dispute-booking-${booking.id}`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                        {language === 'es' ? 'Reportar problema' : 'Report a problem'}
                      </Button>
                    </div>
                  </div>
                );
              })()}
              {booking.status === 'completed' && booking.client_confirmed_ok_at && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300 px-2.5 py-1.5 rounded">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {language === 'es' ? 'Confirmaste que todo estuvo bien. Gracias!' : 'You confirmed all went well. Thank you!'}
                </div>
              )}
              {booking.has_dispute && (
                <div className="mt-3 flex items-center gap-1 text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {language === 'es' ? 'Problema reportado - Bookvia revisara el caso' : 'Problem reported - Bookvia is reviewing'}
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

              {/* Refund-destination chooser: only when business cancelled and client hasn't picked yet */}
              {booking.status === 'cancelled'
                && booking.cancelled_by === 'business'
                && booking.refund_pending
                && booking.refund_destination_choice === 'pending'
                && booking.refund_amount > 0 && (
                <div className="mt-3 rounded-lg border-2 border-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/10 dark:border-emerald-800 p-4" data-testid={`refund-chooser-${booking.id}`}>
                  <div className="flex items-start gap-2 mb-3">
                    <CreditCard className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-900 dark:text-emerald-200 text-sm">
                        {language === 'es' ? `¿Donde quieres recibir tus $${booking.refund_amount?.toFixed(2)} MXN?` : `Where do you want to receive your $${booking.refund_amount?.toFixed(2)} MXN?`}
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                        {language === 'es'
                          ? 'El negocio cancelo tu cita. Elige como recibir el reembolso completo.'
                          : 'The business cancelled your booking. Choose how to receive your full refund.'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-auto py-2.5 flex flex-col items-start"
                      disabled={refundChoiceLoading === booking.id}
                      onClick={() => handleRefundChoice(booking, 'wallet')}
                      data-testid={`refund-wallet-${booking.id}`}
                    >
                      <span className="font-semibold text-xs">
                        {language === 'es' ? '⚡ Saldo Bookvia' : '⚡ Bookvia wallet'}
                      </span>
                      <span className="text-[10px] opacity-90 font-normal">
                        {language === 'es' ? 'Instantaneo (segundos)' : 'Instant (seconds)'}
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 h-auto py-2.5 flex flex-col items-start"
                      disabled={refundChoiceLoading === booking.id}
                      onClick={() => handleRefundChoice(booking, 'card')}
                      data-testid={`refund-card-${booking.id}`}
                    >
                      <span className="font-semibold text-xs">
                        {language === 'es' ? '💳 Tarjeta' : '💳 Card'}
                      </span>
                      <span className="text-[10px] opacity-80 font-normal">
                        {language === 'es' ? '5-10 dias habiles' : '5-10 business days'}
                      </span>
                    </Button>
                  </div>
                  {refundChoiceLoading === booking.id && (
                    <p className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> {language === 'es' ? 'Procesando...' : 'Processing...'}
                    </p>
                  )}
                </div>
              )}
              {booking.status === 'cancelled'
                && booking.cancelled_by === 'business'
                && booking.refund_destination_choice === 'wallet'
                && booking.refund_amount > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300 px-2.5 py-1.5 rounded">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {language === 'es'
                    ? `Reembolso de $${booking.refund_amount?.toFixed(2)} acreditado a tu saldo Bookvia`
                    : `$${booking.refund_amount?.toFixed(2)} refunded to your Bookvia wallet`}
                </div>
              )}
              {booking.status === 'cancelled'
                && booking.cancelled_by === 'business'
                && booking.refund_destination_choice === 'card'
                && booking.refund_amount > 0 && (
                <div className="mt-3 flex items-start gap-1.5 text-xs text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 px-2.5 py-1.5 rounded">
                  <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {language === 'es'
                    ? `Reembolso de $${booking.refund_amount?.toFixed(2)} en proceso. Aparecera en tu tarjeta en 5-10 dias habiles.`
                    : `Refund of $${booking.refund_amount?.toFixed(2)} in process. Will appear in your card in 5-10 business days.`}
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
          {(() => {
            // Split: cancelled bookings get their own tab.
            const isCancelled = (b) => b.status === 'cancelled';
            const upcomingActive = upcomingBookings.filter(b => !isCancelled(b));
            const pastActive = pastBookings.filter(b => !isCancelled(b));
            const cancelledAll = [...upcomingBookings, ...pastBookings]
              .filter(isCancelled)
              .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
            return (
              <>
                <TabsList className="grid grid-cols-3 w-full max-w-xl">
                  <TabsTrigger value="upcoming" data-testid="upcoming-tab">
                    {language === 'es' ? 'Próximas' : 'Upcoming'} ({upcomingActive.length})
                  </TabsTrigger>
                  <TabsTrigger value="past" data-testid="past-tab">
                    {language === 'es' ? 'Pasadas' : 'Past'} ({pastActive.length})
                  </TabsTrigger>
                  <TabsTrigger value="cancelled" data-testid="cancelled-tab">
                    {language === 'es' ? 'Canceladas' : 'Cancelled'} ({cancelledAll.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="upcoming" className="mt-6 space-y-4">
                  {upcomingActive.length > 0 ? (
                    upcomingActive.map(booking => (
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
                  {pastActive.length > 0 ? (
                    pastActive.map(booking => (
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

                <TabsContent value="cancelled" className="mt-6 space-y-4" data-testid="cancelled-tab-content">
                  {cancelledAll.length > 0 ? (
                    cancelledAll.map(booking => (
                      <BookingCard key={booking.id} booking={booking} showActions={false} />
                    ))
                  ) : (
                    <Card className="p-12 text-center">
                      <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        {language === 'es' ? 'No tienes citas canceladas' : 'No cancelled appointments'}
                      </p>
                    </Card>
                  )}
                </TabsContent>
              </>
            );
          })()}
        </Tabs>

        {/* Cancel Dialog with Refund Choice */}
        <Dialog open={cancelDialog.open} onOpenChange={(open) => !open && setCancelDialog({ open: false, booking: null, refundTo: 'card', preview: null, previewLoading: false })}>
          <DialogContent className="max-w-md" data-testid="cancel-booking-dialog">
            <DialogHeader>
              <DialogTitle>{language === 'es' ? 'Cancelar cita' : 'Cancel booking'}</DialogTitle>
              <DialogDescription>
                {cancelDialog.booking && (
                  <span>{cancelDialog.booking.service_name} — {cancelDialog.booking.business_name}</span>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* Live cancellation preview from backend (shows refund / late-cancel) */}
            {cancelDialog.previewLoading ? (
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground text-center">
                {language === 'es' ? 'Calculando tu reembolso...' : 'Calculating your refund...'}
              </div>
            ) : cancelDialog.preview?.summary && (() => {
              const isLate = cancelDialog.preview?.client_impact?.policy === 'late_cancellation_no_refund';
              const palette = isLate
                ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100';
              const Icon = isLate ? AlertTriangle : CheckCircle2;
              return (
                <div className={`rounded-lg border p-3.5 space-y-2 ${palette}`} data-testid="cancel-preview-client">
                  <div className="flex items-start gap-2">
                    <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                    <p className="text-sm font-bold leading-snug">
                      {language === 'es' ? cancelDialog.preview.summary.title_es : cancelDialog.preview.summary.title_en}
                    </p>
                  </div>
                  <ul className="space-y-1 text-xs leading-relaxed pl-6 list-disc opacity-95">
                    {(language === 'es' ? cancelDialog.preview.summary.lines_es : cancelDialog.preview.summary.lines_en).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            
            {(() => {
              const b = cancelDialog.booking;
              if (!b) return null;
              const hoursUntil = b.hours_until_appointment;
              const hasDeposit = b.status === 'confirmed' && b.deposit_paid && (b.deposit_amount > 0);
              const refundEligible = hasDeposit && hoursUntil > 24;
              const refundAmount = refundEligible ? Number((b.deposit_amount * 0.915).toFixed(2)) : 0;
              
              return (
                <div className="space-y-3 text-sm">
                  {hasDeposit ? (
                    refundEligible ? (
                      <>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800">
                          <p className="font-semibold">
                            {language === 'es' ? 'Tienes derecho a reembolso' : 'You qualify for a refund'}
                          </p>
                          <p className="text-xs mt-1">
                            {language === 'es' 
                              ? `Estas cancelando con ${Math.round(hoursUntil)}h de anticipacion. Recibiras $${refundAmount.toFixed(2)} MXN (91.5% del anticipo). La cuota Bookvia ($8.00) no se reembolsa.`
                              : `You are cancelling ${Math.round(hoursUntil)}h in advance. You will receive $${refundAmount.toFixed(2)} MXN (91.5% of deposit). Bookvia fee ($8.00) is non-refundable.`}
                          </p>
                        </div>
                        
                        <div>
                          <p className="font-medium mb-2">
                            {language === 'es' ? '¿Como quieres recibir el reembolso?' : 'How would you like your refund?'}
                          </p>
                          <div className="space-y-2">
                            <label className={`flex items-start gap-2 p-3 rounded-lg border-2 cursor-pointer transition ${cancelDialog.refundTo === 'wallet' ? 'border-[#F05D5E] bg-[#F05D5E]/5' : 'border-slate-200'}`} data-testid="refund-option-wallet">
                              <input type="radio" name="refundTo" value="wallet" checked={cancelDialog.refundTo === 'wallet'} onChange={() => setCancelDialog(d => ({ ...d, refundTo: 'wallet' }))} className="mt-0.5" />
                              <div className="flex-1">
                                <p className="font-semibold flex items-center gap-1">
                                  💰 {language === 'es' ? 'Saldo Bookvia' : 'Bookvia Wallet'}
                                  <Badge variant="secondary" className="text-[10px] h-4 ml-1">⚡ {language === 'es' ? 'Al instante' : 'Instant'}</Badge>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {language === 'es' 
                                    ? `Disponible inmediatamente. Usa $${refundAmount.toFixed(2)} en tu proxima reserva.`
                                    : `Available immediately. Use $${refundAmount.toFixed(2)} on your next booking.`}
                                </p>
                              </div>
                            </label>
                            <label className={`flex items-start gap-2 p-3 rounded-lg border-2 cursor-pointer transition ${cancelDialog.refundTo === 'card' ? 'border-[#F05D5E] bg-[#F05D5E]/5' : 'border-slate-200'}`} data-testid="refund-option-card">
                              <input type="radio" name="refundTo" value="card" checked={cancelDialog.refundTo === 'card'} onChange={() => setCancelDialog(d => ({ ...d, refundTo: 'card' }))} className="mt-0.5" />
                              <div className="flex-1">
                                <p className="font-semibold">🏦 {language === 'es' ? 'A tu tarjeta' : 'To your card'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {language === 'es' 
                                    ? `Llega en 5-10 dias habiles a la tarjeta original.`
                                    : `Arrives in 5-10 business days to original card.`}
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 text-xs">
                        {language === 'es' 
                          ? `Estas cancelando con menos de 24h de anticipacion. Segun la politica del negocio, NO se reembolsa el anticipo.`
                          : `You are cancelling less than 24h in advance. According to the business's policy, the deposit is NOT refunded.`}
                      </div>
                    )
                  ) : (
                    <p className="text-muted-foreground">
                      {language === 'es' 
                        ? '¿Estas seguro que deseas cancelar esta cita?'
                        : 'Are you sure you want to cancel this booking?'}
                    </p>
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setCancelDialog({ open: false, booking: null, refundTo: 'card' })} data-testid="cancel-dialog-back">
                      {language === 'es' ? 'Volver' : 'Back'}
                    </Button>
                    <Button className="flex-1 bg-rose-600 hover:bg-rose-700" onClick={confirmCancel} disabled={cancelLoading === b.id} data-testid="cancel-dialog-confirm">
                      {cancelLoading === b.id 
                        ? <Loader2 className="h-4 w-4 animate-spin" /> 
                        : (language === 'es' ? 'Confirmar cancelacion' : 'Confirm cancel')}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* No-Show Dialog */}
        <Dialog open={noShowDialog.open} onOpenChange={(open) => !open && (setNoShowDialog({ open: false, booking: null }), setNoShowDescription(''))}>
          <DialogContent className="max-w-md" data-testid="no-show-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-rose-700" />
                {language === 'es' ? 'El negocio no me atendio' : "Business didn't show up"}
              </DialogTitle>
              <DialogDescription>
                {language === 'es'
                  ? 'Si llegaste a tu cita y el negocio estaba cerrado o no te atendieron, repórtalo aquí. Bookvia notificara al negocio y tendra 24 horas para responder con evidencia.'
                  : 'If you arrived to your appointment and the business was closed or did not attend, report it here. Bookvia will notify the business and they will have 24 hours to respond with evidence.'}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">
                {language === 'es' ? '¿Que pasara despues?' : 'What happens next?'}
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>{language === 'es' ? 'Bookvia notifica al negocio inmediatamente.' : 'Bookvia notifies the business immediately.'}</li>
                <li>{language === 'es' ? 'Si el negocio responde, Bookvia revisara ambas versiones.' : 'If the business responds, Bookvia will review both sides.'}</li>
                <li>{language === 'es' ? 'Si NO responde en 24h: te reembolsamos automaticamente $108.00 + $50 de compensacion en tu saldo Bookvia.' : 'If they do NOT respond within 24h: we automatically refund $108.00 + $50 compensation to your Bookvia wallet.'}</li>
              </ul>
            </div>
            <textarea
              value={noShowDescription}
              onChange={(e) => setNoShowDescription(e.target.value)}
              placeholder={language === 'es' ? 'Describe que paso (minimo 10 caracteres). Ej: "Llegue a las 10:00 y el negocio estaba cerrado, toque y nadie respondio."' : 'Describe what happened (min 10 chars).'}
              className="w-full min-h-[100px] p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              maxLength={500}
              data-testid="no-show-description-input"
            />
            <p className="text-[11px] text-muted-foreground">{noShowDescription.length}/500</p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setNoShowDialog({ open: false, booking: null }); setNoShowDescription(''); }} data-testid="no-show-cancel">
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button className="flex-1 bg-rose-700 hover:bg-rose-800" onClick={submitNoShow} data-testid="no-show-submit">
                {language === 'es' ? 'Enviar reporte' : 'Submit report'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dispute Dialog */}
        <Dialog open={disputeDialog.open} onOpenChange={(open) => !open && (setDisputeDialog({ open: false, booking: null }), setDisputeReason(''))}>
          <DialogContent className="max-w-md" data-testid="dispute-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                {language === 'es' ? 'Reportar un problema' : 'Report a problem'}
              </DialogTitle>
              <DialogDescription>
                {language === 'es'
                  ? 'Si tuviste algun inconveniente con el servicio, describe brevemente lo que paso. Bookvia revisara el caso y se pondra en contacto contigo.'
                  : 'If you had an issue with the service, briefly describe what happened. Bookvia will review the case and contact you.'}
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder={language === 'es' ? 'Describe el problema (minimo 10 caracteres)...' : 'Describe the problem (min 10 characters)...'}
              className="w-full min-h-[120px] p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F05D5E]"
              maxLength={500}
              data-testid="dispute-reason-input"
            />
            <p className="text-[11px] text-muted-foreground">
              {disputeReason.length}/500
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setDisputeDialog({ open: false, booking: null }); setDisputeReason(''); }} data-testid="dispute-cancel">
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button className="flex-1 bg-rose-600 hover:bg-rose-700" onClick={submitDispute} data-testid="dispute-submit">
                {language === 'es' ? 'Enviar reporte' : 'Submit report'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
            
            {(() => {
              const used = Number(rescheduleModal.booking?.reschedule_count || 0);
              const left = Math.max(0, 2 - used);
              const cutoff = Number(rescheduleModal.booking?.reschedule_cutoff_hours) || 2;
              return (
                <div className="flex items-start gap-2 p-3 bg-blue-50 text-blue-800 rounded-lg text-xs leading-relaxed" data-testid="reschedule-policy-notice">
                  <RefreshCw className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {language === 'es'
                        ? `Te quedan ${left} reagendamiento${left === 1 ? '' : 's'} para esta cita`
                        : `You have ${left} reschedule${left === 1 ? '' : 's'} left for this booking`}
                    </p>
                    <p>
                      {language === 'es'
                        ? `Politica: maximo 2 reagendamientos sin costo. Debes hacerlo con al menos ${cutoff} hora${cutoff === 1 ? '' : 's'} de anticipacion. Tu anticipo se mantiene.`
                        : `Policy: up to 2 free reschedules. Must be at least ${cutoff} hour${cutoff === 1 ? '' : 's'} in advance. Your deposit is preserved.`}
                    </p>
                  </div>
                </div>
              );
            })()}

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
