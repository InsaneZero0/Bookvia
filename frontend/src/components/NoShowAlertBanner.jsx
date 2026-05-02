import { useState, useEffect } from 'react';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { bookingsAPI } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';

/**
 * Banner that surfaces no-show reports against this business.
 * Shows on the Business Dashboard. Forces a response: if the business does not
 * respond within 24h, Bookvia auto-resolves in favor of the client.
 */
export function NoShowAlertBanner({ bookings = [], onResolved }) {
  const { language } = useI18n();
  const [pending, setPending] = useState([]);
  const [activeReport, setActiveReport] = useState(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const open = (bookings || []).filter(
      b => b.no_show_report && !b.no_show_report.resolved && !b.no_show_report.business_response
    );
    setPending(open);
  }, [bookings]);

  if (!pending || pending.length === 0) return null;

  const submitResponse = async () => {
    if (!activeReport) return;
    if (response.trim().length < 10) {
      toast.error(language === 'es' ? 'Describe tu version con al menos 10 caracteres' : 'Describe your side with at least 10 characters');
      return;
    }
    setSubmitting(true);
    try {
      await bookingsAPI.respondNoShow(activeReport.id, response.trim(), '');
      toast.success(language === 'es' ? 'Respuesta enviada. Bookvia revisara el caso.' : 'Response submitted. Bookvia will review.');
      setActiveReport(null);
      setResponse('');
      onResolved?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || (language === 'es' ? 'Error al responder' : 'Error responding'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatHoursLeft = (autoResolveAt) => {
    if (!autoResolveAt) return '';
    const ms = new Date(autoResolveAt).getTime() - Date.now();
    const hours = Math.max(0, ms / (1000 * 60 * 60));
    if (hours < 1) {
      const mins = Math.max(0, Math.round(hours * 60));
      return language === 'es' ? `${mins} min restantes` : `${mins} min left`;
    }
    return language === 'es' ? `${hours.toFixed(1)} h restantes` : `${hours.toFixed(1)}h left`;
  };

  return (
    <>
      <div
        className="mb-4 rounded-lg border-2 border-rose-300 bg-rose-50 p-4 shadow-sm"
        data-testid="no-show-alert-banner"
      >
        <div className="flex items-start gap-3">
          <AlertOctagon className="h-6 w-6 text-rose-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-rose-900 text-sm">
              {language === 'es'
                ? `URGENTE: ${pending.length} cliente${pending.length === 1 ? '' : 's'} report${pending.length === 1 ? 'o' : 'aron'} que no le${pending.length === 1 ? '' : 's'} atendiste`
                : `URGENT: ${pending.length} client${pending.length === 1 ? '' : 's'} reported you didn't attend`}
            </p>
            <p className="text-xs text-rose-800 mt-1">
              {language === 'es'
                ? 'Tienes 24 horas desde el reporte para responder con tu version. Si no respondes, se procesara reembolso automatico al cliente y se aplicara strike a tu negocio.'
                : 'You have 24 hours from the report to respond. If you do not respond, automatic refund + strike will apply.'}
            </p>
            <div className="mt-2 space-y-1.5">
              {pending.slice(0, 3).map((bk) => (
                <div key={bk.id} className="flex items-center justify-between gap-2 bg-white border border-rose-200 rounded p-2">
                  <div className="text-xs text-rose-900 min-w-0">
                    <p className="font-semibold truncate">{bk.user_name || bk.client_name || 'Cliente'}</p>
                    <p className="text-rose-700">
                      {bk.date} {bk.time} · {bk.service_name}
                      {' · '}
                      <span className="font-semibold">{formatHoursLeft(bk.no_show_report?.auto_resolve_at)}</span>
                    </p>
                    {bk.no_show_report?.description && (
                      <p className="text-[11px] mt-0.5 italic">"{bk.no_show_report.description.slice(0, 100)}{bk.no_show_report.description.length > 100 ? '…' : ''}"</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="bg-rose-700 hover:bg-rose-800 shrink-0"
                    onClick={() => { setActiveReport(bk); setResponse(''); }}
                    data-testid={`no-show-respond-btn-${bk.id}`}
                  >
                    {language === 'es' ? 'Responder' : 'Respond'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!activeReport} onOpenChange={(open) => !open && (setActiveReport(null), setResponse(''))}>
        <DialogContent className="max-w-md" data-testid="no-show-response-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-rose-700" />
              {language === 'es' ? 'Responder al reporte' : 'Respond to report'}
            </DialogTitle>
            <DialogDescription>
              {language === 'es'
                ? 'Describe que paso desde tu lado. Bookvia revisara ambas versiones antes de tomar una decision.'
                : 'Describe what happened from your side. Bookvia will review both sides before deciding.'}
            </DialogDescription>
          </DialogHeader>
          {activeReport?.no_show_report?.description && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900">
              <p className="font-semibold mb-1">{language === 'es' ? 'Reporte del cliente:' : 'Client report:'}</p>
              <p>"{activeReport.no_show_report.description}"</p>
            </div>
          )}
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder={language === 'es' ? 'Tu version (minimo 10 caracteres). Ej: "El cliente nunca llego a su cita, mostre la sala vacia a las 10:15."' : 'Your side (min 10 chars).'}
            className="w-full min-h-[110px] p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            maxLength={500}
            data-testid="no-show-response-input"
          />
          <p className="text-[11px] text-muted-foreground">{response.length}/500</p>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => { setActiveReport(null); setResponse(''); }} data-testid="no-show-response-cancel">
              {language === 'es' ? 'Cerrar' : 'Close'}
            </Button>
            <Button className="flex-1 bg-rose-700 hover:bg-rose-800" onClick={submitResponse} disabled={submitting} data-testid="no-show-response-submit">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (language === 'es' ? 'Enviar respuesta' : 'Submit response')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default NoShowAlertBanner;
