import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { businessesAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Persistent banner shown on every business dashboard page when the business
 * has not finished onboarding their Stripe Connect Express account. Without
 * a connected account, the business cannot receive payments and is hidden
 * from the public marketplace listing.
 *
 * Renders nothing once the account is fully onboarded
 * (charges_enabled && payouts_enabled).
 */
export default function StripeConnectRequiredBanner() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    businessesAPI.connectStatus()
      .then((res) => { if (!cancelled) setStatus(res.data); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const fullyEnabled = status?.connected && status?.charges_enabled && status?.payouts_enabled && status?.details_submitted;

  if (loading || fullyEnabled) return null;

  const handleConnect = async () => {
    setRedirecting(true);
    try {
      const res = await businessesAPI.connectOnboard();
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('No se pudo generar el link de Stripe');
        setRedirecting(false);
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Error al iniciar onboarding';
      toast.error(msg);
      setRedirecting(false);
    }
  };

  const isStarted = status?.connected && !fullyEnabled;
  const heading = isStarted
    ? 'Termina tu registro con Stripe para recibir pagos'
    : 'Conecta tu cuenta bancaria para empezar a recibir pagos';
  const subtext = isStarted
    ? 'Tu cuenta esta a medias. Tu negocio NO aparecera en busquedas hasta completar el registro.'
    : 'Tu negocio NO aparecera en busquedas y NO podras recibir reservas hasta conectar Stripe.';

  return (
    <div
      data-testid="stripe-connect-required-banner"
      className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="rounded-full bg-amber-200 p-2 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-900" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-950 leading-tight">{heading}</p>
            <p className="text-sm text-amber-900 mt-0.5">{subtext}</p>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button
            onClick={handleConnect}
            disabled={redirecting}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="stripe-connect-banner-cta"
          >
            {redirecting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirigiendo...</>
            ) : (
              <><ExternalLink className="w-4 h-4 mr-2" />{isStarted ? 'Terminar' : 'Conectar Stripe'}</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/business/finance')}
            className="border-amber-300 text-amber-900 hover:bg-amber-100"
            data-testid="stripe-connect-banner-finance"
          >
            Mas info
          </Button>
        </div>
      </div>
    </div>
  );
}
