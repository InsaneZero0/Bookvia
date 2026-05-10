import { useEffect, useState } from 'react';
import { businessesAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, Loader2, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Phase D — Persistent banner shown on business dashboard pages when the
 * subscription is past_due or unpaid. Provides a single CTA to open the
 * Stripe billing portal where the business can update its card.
 *
 * Renders nothing when subscription is healthy (active/trialing/none).
 */
export default function SubscriptionPastDueBanner() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    businessesAPI.getSubscriptionStatus()
      .then((res) => { if (!cancelled) setStatus(res.data); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  const subStatus = status?.subscription_status || status?.status;
  const isPastDue = subStatus === 'past_due';
  const isUnpaid = subStatus === 'unpaid' || subStatus === 'canceled';
  if (!isPastDue && !isUnpaid) return null;

  const handleOpenPortal = async () => {
    setRedirecting(true);
    try {
      const res = await businessesAPI.billingPortal();
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('No se pudo abrir el portal de pago');
        setRedirecting(false);
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Error al abrir el portal';
      toast.error(msg);
      setRedirecting(false);
    }
  };

  const isCritical = isUnpaid;
  const bgClass = isCritical ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50';
  const iconClass = isCritical ? 'text-red-700 bg-red-200' : 'text-orange-800 bg-orange-200';
  const titleClass = isCritical ? 'text-red-950' : 'text-orange-950';
  const subClass = isCritical ? 'text-red-900' : 'text-orange-900';
  const btnClass = isCritical ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700';

  const heading = isCritical
    ? 'Tu cuenta esta suspendida por falta de pago'
    : 'Tu pago mensual fallo - actualiza tu tarjeta';
  const subtext = isCritical
    ? 'Tu negocio NO aparece en busquedas y NO recibe nuevas reservas. Actualiza tu metodo de pago para reactivarlo.'
    : 'Tienes 7 dias antes de que tu cuenta sea suspendida. Actualiza tu tarjeta ahora.';

  return (
    <div
      data-testid="subscription-past-due-banner"
      className={`mb-4 rounded-xl border-2 ${bgClass} p-4 shadow-sm`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className={`rounded-full p-2 shrink-0 ${iconClass}`}>
            {isCritical ? <ShieldOff className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold leading-tight ${titleClass}`}>{heading}</p>
            <p className={`text-sm mt-0.5 ${subClass}`}>{subtext}</p>
          </div>
        </div>
        <Button
          onClick={handleOpenPortal}
          disabled={redirecting}
          className={`text-white sm:shrink-0 ${btnClass}`}
          data-testid="subscription-update-card-btn"
        >
          {redirecting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirigiendo...</>
          ) : (
            <><CreditCard className="w-4 h-4 mr-2" />Actualizar tarjeta</>
          )}
        </Button>
      </div>
    </div>
  );
}
