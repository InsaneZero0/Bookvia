import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CreditCard, MapPin, ArrowRight, AlertCircle, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

/**
 * Card that lets the business owner toggle between:
 *   1) Cobrar anticipo en linea (requires Stripe Connect)
 *   2) Cobro completo en el local (no Stripe needed, dormant if previously connected)
 *
 * Anti-abuse: 30-day cooldown between flips (enforced by backend).
 */
export default function PaymentModeCard({ language = 'es', onChanged }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const t = (es, en) => (language === 'es' ? es : en);

  const fetchState = async () => {
    try {
      const res = await api.get('/businesses/me/payment-mode');
      setState(res.data);
    } catch (e) {
      toast.error(t('No se pudo cargar la modalidad de cobro', 'Could not load payment mode'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchState(); /* eslint-disable-next-line */ }, []);

  const handleConfirm = async () => {
    if (!state) return;
    setSubmitting(true);
    const newMode = !state.requires_deposit;
    try {
      const res = await api.patch('/businesses/me/payment-mode', { requires_deposit: newMode });
      toast.success(t('Modalidad actualizada', 'Mode updated'));
      setConfirmOpen(false);
      await fetchState();
      onChanged?.(res.data);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const status = e?.response?.status;
      if (status === 412 && newMode) {
        // Need Stripe Connect first
        toast.error(detail || t('Conecta tu cuenta Stripe primero', 'Connect Stripe first'));
        setConfirmOpen(false);
        // Try to take them to Stripe Connect onboarding
        try {
          const onboard = await api.post('/stripe-connect/onboard');
          if (onboard.data?.url) {
            window.location.href = onboard.data.url;
            return;
          }
        } catch { /* ignore */ }
      } else if (status === 429) {
        toast.error(detail || t('Espera el periodo de enfriamiento', 'Wait for cooldown'));
        setConfirmOpen(false);
      } else {
        toast.error(detail || t('Error al cambiar modalidad', 'Error changing mode'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">{t('Cargando...', 'Loading...')}</CardContent></Card>
    );
  }
  if (!state) return null;

  const onlineMode = state.requires_deposit;
  const stripeReady = state.stripe_connect_charges_enabled;
  const onCooldown = state.days_until_change > 0;
  const targetMode = !onlineMode; // what they'd switch TO

  return (
    <>
      <Card data-testid="payment-mode-card" className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-heading">
            <CreditCard className="h-4 w-4 text-[#F05D5E]" />
            {t('Modalidad de cobro', 'Payment mode')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current mode card */}
          <div className={`rounded-xl border-2 p-4 ${onlineMode ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20' : 'border-blue-200 bg-blue-50 dark:bg-blue-900/20'}`}>
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl ${onlineMode ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                {onlineMode ? <Sparkles className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm" data-testid="payment-mode-current-label">
                    {onlineMode ? t('Cobras anticipo en linea', 'You charge online deposit') : t('Cobras en el local', 'You charge at location')}
                  </p>
                  <Badge variant="secondary" className="text-[10px] font-mono">{t('Activa', 'Active')}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {onlineMode
                    ? t('El cliente paga el anticipo al reservar. Bookvia retiene el dinero y lo libera el dia 20 de cada mes.', 'Client pays deposit at booking. Bookvia holds funds and releases on the 20th.')
                    : t('El cliente paga todo en tu local cuando llega. No procesamos su tarjeta.', 'Client pays in full at your place. No card processed by Bookvia.')}
                </p>
              </div>
            </div>
          </div>

          {/* Cooldown banner */}
          {onCooldown && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-start gap-2" data-testid="payment-mode-cooldown">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {t(`Podras cambiar de nuevo en ${state.days_until_change} dias`, `You can switch again in ${state.days_until_change} days`)}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {t(`Para dar estabilidad a tus clientes, solo se puede cambiar cada ${state.cooldown_days} dias.`, `For client stability, you can only switch every ${state.cooldown_days} days.`)}
                </p>
              </div>
            </div>
          )}

          {/* Stripe Connect status (only relevant if user is in online mode) */}
          {onlineMode && !stripeReady && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">
                  {t('Tu cuenta de Stripe Connect no esta lista', 'Your Stripe Connect account is not ready')}
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  {t('Completa el onboarding para empezar a recibir anticipos.', 'Complete onboarding to start receiving deposits.')}
                </p>
              </div>
            </div>
          )}

          {/* Switch button */}
          <Button
            variant="outline"
            className="w-full"
            disabled={onCooldown}
            onClick={() => setConfirmOpen(true)}
            data-testid="payment-mode-switch-btn"
          >
            <ArrowRight className="h-4 w-4 mr-1.5" />
            {targetMode
              ? t('Cambiar a: Cobrar anticipo en linea', 'Switch to: Online deposit')
              : t('Cambiar a: Cobro en el local', 'Switch to: Pay at location')}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            {t(`Has cambiado ${state.changes_count} vez(es).`, `Switched ${state.changes_count} time(s).`)}
          </p>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md" data-testid="payment-mode-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {targetMode
                ? t('Activar cobro de anticipos', 'Enable online deposits')
                : t('Dejar de cobrar anticipos', 'Stop online deposits')}
            </DialogTitle>
            <DialogDescription>
              {t('Antes de confirmar, revisa lo que pasara:', 'Before confirming, review what will happen:')}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm py-2">
            {targetMode ? (
              <>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{t('Las nuevas reservas pediran un anticipo en linea al cliente.', 'New bookings will collect an online deposit from the client.')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{t('Bookvia retiene el dinero y lo libera el dia 20 de cada mes a tu cuenta Stripe.', 'Bookvia holds funds and releases on the 20th of each month to your Stripe account.')}</span>
                </li>
                {!stripeReady && (
                  <li className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <span className="text-amber-700">{t('Tu cuenta de Stripe Connect debe estar lista. Te llevaremos a completarla.', 'Your Stripe Connect account must be ready. We will take you there.')}</span>
                  </li>
                )}
              </>
            ) : (
              <>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{t('Reservas YA cobradas siguen su curso (liberacion dia 20).', 'Already-paid bookings keep their flow (released on the 20th).')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{t('Las nuevas reservas seran "cobro en el local".', 'New bookings will be "pay at location".')}</span>
                </li>
                {state.stripe_connect_account_id && (
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{t('Tu cuenta de Stripe queda dormida (no se elimina). Si reactivas anticipos, es 1 click.', 'Your Stripe account stays dormant (not deleted). Re-enabling deposits is 1 click.')}</span>
                  </li>
                )}
              </>
            )}
            <li className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <span className="text-amber-700">
                {t(`Solo podras volver a cambiar despues de ${state.cooldown_days} dias.`, `You can only switch again after ${state.cooldown_days} days.`)}
              </span>
            </li>
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting} data-testid="payment-mode-cancel-btn">
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={submitting} className="btn-coral" data-testid="payment-mode-confirm-btn">
              {submitting ? t('Procesando...', 'Processing...') : t('Confirmar', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
