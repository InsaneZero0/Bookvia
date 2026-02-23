import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { paymentsAPI, bookingsAPI } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { CheckCircle2, Calendar, Clock, MapPin, Loader2 } from 'lucide-react';

export default function PaymentSuccessPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  
  const sessionId = searchParams.get('session_id');
  const bookingId = searchParams.get('booking_id');

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        if (sessionId) {
          const response = await paymentsAPI.getCheckoutStatus(sessionId);
          setPaymentStatus(response.data);
          
          // Get booking details
          if (bookingId || response.data.booking_id) {
            const bookings = await bookingsAPI.getMy({});
            const foundBooking = bookings.data.find(b => b.id === (bookingId || response.data.booking_id));
            if (foundBooking) {
              setBooking(foundBooking);
            }
          }
        }
      } catch (err) {
        console.error('Error verifying payment:', err);
        setError(language === 'es' ? 'Error al verificar el pago' : 'Error verifying payment');
      } finally {
        setLoading(false);
      }
    };
    
    verifyPayment();
  }, [sessionId, bookingId, language]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#F05D5E] mx-auto mb-4" />
          <p className="text-muted-foreground">
            {language === 'es' ? 'Verificando pago...' : 'Verifying payment...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-20 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-900 dark:to-slate-800" data-testid="payment-success-page">
      <div className="max-w-lg mx-auto">
        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-heading text-green-700 dark:text-green-400">
              {language === 'es' ? '¡Pago Confirmado!' : 'Payment Confirmed!'}
            </CardTitle>
            <CardDescription>
              {language === 'es' 
                ? 'Tu anticipo ha sido procesado exitosamente' 
                : 'Your deposit has been processed successfully'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {paymentStatus && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <h3 className="font-medium mb-2">
                  {language === 'es' ? 'Detalles del pago' : 'Payment details'}
                </h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium">{language === 'es' ? 'Monto:' : 'Amount:'}</span>{' '}
                    ${(paymentStatus.amount_total / 100).toFixed(2)} {paymentStatus.currency?.toUpperCase()}
                  </p>
                  <p>
                    <span className="font-medium">{language === 'es' ? 'Estado:' : 'Status:'}</span>{' '}
                    <span className="text-green-600 font-medium">
                      {paymentStatus.payment_status === 'paid' 
                        ? (language === 'es' ? 'Pagado' : 'Paid') 
                        : paymentStatus.payment_status}
                    </span>
                  </p>
                </div>
              </div>
            )}
            
            {booking && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3">
                  {language === 'es' ? 'Tu cita' : 'Your appointment'}
                </h3>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-lg">{booking.business_name}</p>
                  <p className="text-muted-foreground">{booking.service_name}</p>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(booking.date).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{booking.time} - {booking.end_time}</span>
                  </div>
                  {booking.worker_name && (
                    <p className="text-muted-foreground">
                      {language === 'es' ? 'Con:' : 'With:'} {booking.worker_name}
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm">
              <p className="text-blue-700 dark:text-blue-300">
                {language === 'es' 
                  ? 'Recibirás un correo de confirmación con los detalles de tu reserva.'
                  : 'You will receive a confirmation email with your booking details.'}
              </p>
            </div>
            
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => navigate('/dashboard/bookings')} 
                className="w-full h-12 btn-coral"
                data-testid="view-bookings-btn"
              >
                {language === 'es' ? 'Ver mis citas' : 'View my appointments'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => navigate('/')}
                className="w-full"
              >
                {language === 'es' ? 'Volver al inicio' : 'Back to home'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
