import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { businessesAPI } from '@/lib/api';
import { CheckCircle2, Loader2, Mail, Home } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

/**
 * LFPDPPP-compliant 1-click unsubscribe page. Renders the user's email and
 * a single button to confirm unsubscription. No login required (token-based).
 */
export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token invalido');
      setLoading(false);
      return;
    }
    businessesAPI.unsubscribeInfo(token)
      .then((res) => setInfo(res.data))
      .catch((err) => setError(err?.response?.data?.detail || 'No se pudo cargar la informacion'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await businessesAPI.unsubscribe(token);
      setDone(true);
      toast.success('Cancelacion confirmada');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al cancelar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F4ED] px-4 py-12" data-testid="unsubscribe-page">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="p-8 text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#F05D5E]/10">
            <Mail className="h-8 w-8 text-[#F05D5E]" />
          </div>
          {loading && (
            <div className="flex items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando...
            </div>
          )}
          {!loading && error && (
            <>
              <h1 className="text-xl font-bold text-red-600">Error</h1>
              <p className="text-sm text-slate-600">{error}</p>
            </>
          )}
          {!loading && info && !done && (info.already_unsubscribed ? (
            <>
              <h1 className="text-xl font-bold text-slate-900">Ya estas dado de baja</h1>
              <p className="text-sm text-slate-600">
                El correo <span className="font-semibold">{info.email}</span> no recibe mas correos de Bookvia.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900">Cancelar suscripcion a correos</h1>
              <p className="text-sm text-slate-600">
                Vas a dejar de recibir correos de Bookvia en{' '}
                <span className="font-semibold">{info.email}</span>.
              </p>
              <p className="text-xs text-slate-500">
                Seguiras recibiendo correos transaccionales esenciales (confirmaciones, facturas).
              </p>
              <Button
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full bg-[#F05D5E] hover:bg-[#D94A4B] text-white"
                data-testid="unsubscribe-confirm-btn"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
                ) : (
                  'Confirmar cancelacion'
                )}
              </Button>
            </>
          ))}
          {done && (
            <>
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h1 className="text-xl font-bold text-slate-900">Listo, todo cancelado</h1>
              <p className="text-sm text-slate-600">
                Ya no recibiras correos promocionales de Bookvia.
              </p>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-slate-500"
            data-testid="unsubscribe-home-btn"
          >
            <Home className="h-4 w-4 mr-1.5" />
            Volver al inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
