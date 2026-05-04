import { useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { reviewsAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';

const REASONS = [
  { value: 'fake',      label: 'Resena falsa o no es cliente real' },
  { value: 'offensive', label: 'Lenguaje ofensivo, insultos o acoso' },
  { value: 'off_topic', label: 'No habla del servicio ni del negocio' },
  { value: 'spam',      label: 'Spam, publicidad o datos personales' },
  { value: 'other',     label: 'Otro (describe abajo)' },
];

/**
 * Inline "Reportar" button + modal for a review.
 * - Requires login; if user is anon it shows a soft toast asking to sign in.
 * - Once submitted, the button stays disabled in the local session even if
 *   the backend silently dedupes.
 */
export function ReviewReportButton({ reviewId, compact = false }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('fake');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleClick = () => {
    if (!user) {
      toast.info(t('Inicia sesion para reportar'));
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const res = await reviewsAPI.report(reviewId, reason, detail);
      if (res.data.already_reported) {
        toast.info(t('Ya habias reportado esta resena. Nuestro equipo la revisara.'));
      } else {
        toast.success(t('Gracias. Revisaremos el reporte pronto.'));
      }
      setDone(true);
      setOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t('No se pudo enviar el reporte'));
    }
    setSubmitting(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={done}
        className={`inline-flex items-center gap-1 transition-colors ${
          compact ? 'text-[11px]' : 'text-xs'
        } ${done
          ? 'text-muted-foreground cursor-default'
          : 'text-muted-foreground/70 hover:text-red-500'
        }`}
        data-testid={`report-review-${reviewId}`}
        aria-label={t('Reportar resena')}
      >
        <Flag className="h-3 w-3" />
        {done ? t('Reportada') : t('Reportar')}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="report-review-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Flag className="h-5 w-5 text-red-500" />
              {t('Reportar resena')}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {t('Cuentanos por que crees que esta resena debe revisarse. Nuestro equipo la evaluara en menos de 48h.')}
          </p>

          <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
            {REASONS.map(r => (
              <div key={r.value} className="flex items-start gap-2">
                <RadioGroupItem value={r.value} id={`reason-${r.value}`} className="mt-1" />
                <Label htmlFor={`reason-${r.value}`} className="text-sm font-normal cursor-pointer leading-snug">
                  {t(r.label)}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div>
            <Label className="text-xs text-muted-foreground">{t('Detalles (opcional)')}</Label>
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, 500))}
              rows={3}
              placeholder={t('Aporta contexto que nos ayude a decidir...')}
              className="mt-1"
              data-testid="report-detail-textarea"
            />
            <p className="text-[10px] text-muted-foreground text-right mt-1">{detail.length} / 500</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              {t('Cancelar')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-red-500 hover:bg-red-600 text-white"
              data-testid="submit-report-btn"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Flag className="h-4 w-4 mr-1" />}
              {t('Enviar reporte')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
