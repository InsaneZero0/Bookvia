import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { XCircle, ArrowLeft, RefreshCcw } from 'lucide-react';

export default function PaymentCancelPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const bookingId = searchParams.get('booking_id');

  return (
    <div className="min-h-screen px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="payment-cancel-page">
      <div className="max-w-lg mx-auto">
        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-amber-600" />
            </div>
            <CardTitle className="text-2xl font-heading">
              {language === 'es' ? 'Pago Cancelado' : 'Payment Cancelled'}
            </CardTitle>
            <CardDescription>
              {language === 'es' 
                ? 'El proceso de pago fue cancelado. Tu reserva sigue en espera.'
                : 'The payment process was cancelled. Your booking is still on hold.'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-sm">
              <p className="text-amber-700 dark:text-amber-300">
                {language === 'es' 
                  ? 'Tu reserva permanecerá bloqueada por 30 minutos. Si no completas el pago, el horario se liberará automáticamente.'
                  : 'Your booking will remain on hold for 30 minutes. If you don\'t complete the payment, the slot will be released automatically.'}
              </p>
            </div>
            
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => navigate('/dashboard/bookings')} 
                className="w-full h-12 btn-coral"
                data-testid="retry-payment-btn"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {language === 'es' ? 'Ver mis citas y reintentar' : 'View my appointments and retry'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => navigate('/')}
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {language === 'es' ? 'Volver al inicio' : 'Back to home'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
