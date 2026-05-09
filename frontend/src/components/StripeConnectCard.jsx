import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { businessesAPI } from '@/lib/api';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2, AlertTriangle, Loader2, ExternalLink, ShieldCheck } from 'lucide-react';

/**
 * Stripe Connect Express card — Phase A onboarding UI.
 *
 * Shows status of the business's Connect account, with CTAs to:
 *  - Start onboarding (if no account yet)
 *  - Resume onboarding (if started but incomplete)
 *  - Open Stripe Express dashboard (once fully onboarded)
 */
export default function StripeConnectCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const refresh = async () => {
    try {
      const res = await businessesAPI.connectStatus();
      setStatus(res.data);
    } catch (err) {
      console.error('Connect status error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // If redirected back from Stripe onboarding, refresh once more and clean URL
    if (searchParams.get('connect_return') === '1' || searchParams.get('connect_refresh') === '1') {
      const returning = searchParams.get('connect_return') === '1';
      if (returning) toast.success('Validando tu cuenta Stripe...');
      setTimeout(refresh, 800);
      const sp = new URLSearchParams(searchParams);
      sp.delete('connect_return');
      sp.delete('connect_refresh');
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOnboard = async () => {
    setStarting(true);
    try {
      const res = await businessesAPI.connectOnboard();
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('No se pudo generar el link de Stripe');
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Error al iniciar onboarding';
      toast.error(msg);
      setStarting(false);
    }
  };

  const handleDashboard = async () => {
    try {
      const res = await businessesAPI.connectDashboardLink();
      if (res.data?.url) window.open(res.data.url, '_blank');
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Error al abrir dashboard';
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <Card data-testid="stripe-connect-card-loading">
        <CardContent className="py-8 flex items-center justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando estado Stripe Connect...
        </CardContent>
      </Card>
    );
  }

  const fullyEnabled = status?.connected && status?.charges_enabled && status?.payouts_enabled && status?.details_submitted;
  const started = status?.connected && !fullyEnabled;

  return (
    <Card data-testid="stripe-connect-card" className="border-indigo-100">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              Cuenta Stripe Connect
            </CardTitle>
            <CardDescription className="mt-1">
              Conecta tu cuenta para recibir pagos directamente de tus clientes.
            </CardDescription>
          </div>
          {fullyEnabled && (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" data-testid="stripe-connect-status-active">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Activo
            </Badge>
          )}
          {started && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100" data-testid="stripe-connect-status-pending">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Pendiente
            </Badge>
          )}
          {!status?.connected && (
            <Badge variant="outline" data-testid="stripe-connect-status-none">No conectado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.connected && (
          <>
            <div className="rounded-lg bg-indigo-50 p-4 text-sm text-slate-700 space-y-2">
              <p className="font-medium text-indigo-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                ¿Por qué conectar Stripe?
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                <li>Recibe pagos directamente en tu cuenta (no en una cuenta intermediaria).</li>
                <li>Stripe gestiona el cumplimiento y seguridad de los cobros.</li>
                <li>Transparencia total: cada transferencia es visible en tu dashboard Stripe.</li>
                <li>Los payouts a tu banco siguen el mismo calendario: corte día 20, pago día 1°.</li>
              </ul>
            </div>
            <Button
              onClick={handleOnboard}
              disabled={starting}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              data-testid="stripe-connect-start-btn"
            >
              {starting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirigiendo a Stripe...</>
              ) : (
                <><ExternalLink className="w-4 h-4 mr-2" />Conectar con Stripe</>
              )}
            </Button>
          </>
        )}

        {started && (
          <>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
              <p className="font-medium flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-4 h-4" />
                Tu cuenta Stripe está incompleta
              </p>
              <p className="text-amber-800 mb-2">
                Para poder recibir pagos, termina el proceso de verificación en Stripe.
              </p>
              {status?.requirements_due?.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-xs uppercase text-amber-700 mb-1">Información pendiente:</p>
                  <ul className="list-disc pl-5 text-xs space-y-0.5 text-amber-900">
                    {status.requirements_due.slice(0, 6).map((req) => (
                      <li key={req}>{req.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <Button
              onClick={handleOnboard}
              disabled={starting}
              className="w-full bg-amber-600 hover:bg-amber-700"
              data-testid="stripe-connect-resume-btn"
            >
              {starting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirigiendo...</>
              ) : (
                <><ExternalLink className="w-4 h-4 mr-2" />Terminar verificación</>
              )}
            </Button>
          </>
        )}

        {fullyEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs uppercase text-emerald-700 font-medium">Cobros</p>
                <p className="text-emerald-900 font-semibold flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" /> Habilitados
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs uppercase text-emerald-700 font-medium">Payouts</p>
                <p className="text-emerald-900 font-semibold flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" /> Habilitados
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500">ID de cuenta: <span className="font-mono">{status.account_id}</span></p>
            <Button
              onClick={handleDashboard}
              variant="outline"
              className="w-full"
              data-testid="stripe-connect-dashboard-btn"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir dashboard de Stripe
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
