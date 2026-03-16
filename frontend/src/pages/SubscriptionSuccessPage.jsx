import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI } from '@/lib/api';
import { CheckCircle2, ArrowRight, Loader2, Clock, Shield } from 'lucide-react';

export default function SubscriptionSuccessPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      verifySubscription(sessionId);
    } else {
      setStatus('error');
    }
  }, []);

  const verifySubscription = async (sessionId) => {
    try {
      const res = await businessesAPI.getSubscriptionStatus(sessionId);
      if (res.data?.status === 'active' || res.data?.trial || res.data?.subscription_status === 'trialing') {
        setStatus('success');
      } else {
        setStatus('pending');
      }
    } catch {
      setStatus('pending');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-[#F05D5E]" />
            <p className="text-muted-foreground">{language === 'es' ? 'Verificando tu suscripcion...' : 'Verifying your subscription...'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-background px-4" data-testid="subscription-success-page">
      <Card className="max-w-lg w-full shadow-lg">
        <CardContent className="p-8 text-center space-y-6">
          {/* Success icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>

          <h1 className="text-2xl font-heading font-bold" data-testid="success-title">
            {language === 'es' ? 'Tu tarjeta fue registrada correctamente' : 'Your card was registered successfully'}
          </h1>

          {/* Admin approval notice */}
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-5 text-left space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
                {language === 'es' ? 'Pendiente de aprobacion' : 'Pending approval'}
              </p>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed" data-testid="approval-message">
              {language === 'es'
                ? 'Tu negocio ha sido enviado a revision y quedara activo una vez que sea aprobado por el administrador. Te notificaremos cuando tu negocio este visible en la plataforma.'
                : 'Your business has been sent for review and will become active once approved by the administrator. We will notify you when your business is visible on the platform.'}
            </p>
          </div>

          {/* Subscription info */}
          <div className="rounded-xl bg-muted/30 border p-4 text-left space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-600" />
              <p className="text-sm font-medium">
                {language === 'es' ? 'Detalles de tu suscripcion' : 'Subscription details'}
              </p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 pl-6">
              <li>{language === 'es' ? 'Primer mes GRATIS (30 dias de prueba)' : 'First month FREE (30-day trial)'}</li>
              <li>{language === 'es' ? 'Despues de 30 dias: $39 MXN/mes' : 'After 30 days: $39 MXN/month'}</li>
              <li>{language === 'es' ? 'Puedes cancelar en cualquier momento desde tu panel' : 'Cancel anytime from your dashboard'}</li>
            </ul>
          </div>

          <Button className="btn-coral w-full h-12" onClick={() => navigate('/business/dashboard')} data-testid="go-to-dashboard">
            {language === 'es' ? 'Ir a mi panel' : 'Go to my dashboard'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
