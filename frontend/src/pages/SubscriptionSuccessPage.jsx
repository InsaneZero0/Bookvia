import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI } from '@/lib/api';
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

export default function SubscriptionSuccessPage() {
  const { language } = useI18n();
  const { isAuthenticated } = useAuth();
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
      if (res.data?.status === 'active' || res.data?.trial) {
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
            <p className="text-muted-foreground">{language === 'es' ? 'Verificando tu suscripción...' : 'Verifying your subscription...'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-background" data-testid="subscription-success-page">
      <Card className="max-w-md w-full shadow-lg">
        <CardContent className="p-8 text-center space-y-5">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-heading font-bold">
            {language === 'es' ? '¡Suscripción activada!' : 'Subscription activated!'}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {language === 'es'
              ? 'Tu primer mes es GRATIS. Después de 30 días se cobrará $39 MXN al mes automáticamente. Puedes cancelar en cualquier momento desde tu panel.'
              : 'Your first month is FREE. After 30 days, $39 MXN will be charged monthly. You can cancel anytime from your dashboard.'}
          </p>
          <Button className="btn-coral w-full h-12" onClick={() => navigate('/business/dashboard')} data-testid="go-to-dashboard">
            {language === 'es' ? 'Ir a mi panel' : 'Go to my dashboard'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
