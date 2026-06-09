import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Download, Mail } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

const REASON_OPTIONS = [
  { value: 'pause_temporary',   es: 'Pausa temporal',                  en: 'Temporary pause',         hint_es: 'Aparece como pausado, datos preservados 30 dias.' },
  { value: 'permanent_closure', es: 'Cierre permanente del negocio',  en: 'Permanent closure',       hint_es: 'El negocio cerro definitivamente.' },
  { value: 'platform_switch',   es: 'Se cambia a otra plataforma',    en: 'Switching platforms',     hint_es: 'Despedida amable, deja la puerta abierta.' },
  { value: 'low_activity',      es: 'Baja actividad / inactivo',       en: 'Low activity',            hint_es: 'No ha tenido reservas recientes.' },
  { value: 'not_onboarded',     es: 'Onboarding incompleto',          en: 'Onboarding incomplete',   hint_es: 'Nunca termino el registro.' },
  { value: 'owner_request',     es: 'Solicitud del propietario',      en: 'Owner request',           hint_es: 'El dueño pidio la baja explicitamente.' },
  { value: 'other',             es: 'Otro motivo',                    en: 'Other reason',            hint_es: 'Mensaje generico, mas cuidado con el tono.' },
];

export default function DecommissionDialog({ open, onOpenChange, business, language = 'es', onDone }) {
  const [reason, setReason] = useState('owner_request');
  const [note, setNote] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [exportData, setExportData] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const t = (es, en) => (language === 'es' ? es : en);

  const requiredConfirm = (business?.name || 'BAJA').toUpperCase();
  const currentReason = REASON_OPTIONS.find(r => r.value === reason);

  const handleSubmit = async () => {
    if (confirmText.trim().toUpperCase() !== requiredConfirm) {
      toast.error(t('Confirma escribiendo el nombre del negocio', 'Type the business name to confirm'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post(`/admin/businesses/${business.id}/decommission`, {
        reason,
        note: note.trim() || null,
        send_email: sendEmail,
        export_data: exportData,
      });
      toast.success(t('Negocio dado de baja', 'Business decommissioned'));

      // If we got a CSV back, trigger download
      if (res.data?.export_csv && res.data?.csv_filename) {
        const blob = new Blob([res.data.export_csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.data.csv_filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      onDone?.(res.data);
      onOpenChange(false);
      // Reset state for next opening
      setReason('owner_request');
      setNote('');
      setConfirmText('');
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error al dar de baja', 'Decommission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="decommission-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t('Dar de baja negocio', 'Decommission business')}
          </DialogTitle>
          <DialogDescription>
            {t(
              `Este proceso retirara "${business?.name || ''}" de la plataforma con un correo de despedida. Los datos se preservan 30 dias por si decide regresar.`,
              `This will remove "${business?.name || ''}" from the platform with a goodbye email. Data is kept 30 days in case they want back.`,
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium">{t('Motivo', 'Reason')}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger data-testid="decommission-reason-select" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map(r => (
                  <SelectItem key={r.value} value={r.value} data-testid={`decommission-reason-${r.value}`}>
                    {language === 'es' ? r.es : r.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentReason?.hint_es && (
              <p className="text-xs text-muted-foreground mt-1">{language === 'es' ? currentReason.hint_es : ''}</p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">
              {t('Nota interna (opcional)', 'Internal note (optional)')}
            </Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('Solo visible para administradores. Ej: "Hablamos por WhatsApp, prefiere pausar 3 meses"', 'Admin-only. e.g. "Spoke on WhatsApp, prefers a 3-month pause"')}
              rows={2}
              maxLength={1000}
              data-testid="decommission-note"
              className="mt-1 text-sm"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 p-3 bg-muted/30">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={sendEmail} onCheckedChange={setSendEmail} data-testid="decommission-send-email" />
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {t('Enviar correo empatico al propietario', 'Send empathetic email to owner')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('Mensaje adaptado al motivo, invitando a una encuesta de 1 frase.', 'Reason-adapted message, includes a 1-line exit survey.')}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={exportData} onCheckedChange={setExportData} data-testid="decommission-export-data" />
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  {t('Exportar CSV con clientes, reservas y servicios', 'Export CSV of clients, bookings & services')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('Se descarga automaticamente al confirmar. Gesto de buena fe.', 'Auto-downloads on confirm. Good-faith handoff.')}
                </p>
              </div>
            </label>
          </div>

          <div>
            <Label className="text-sm font-medium text-red-600">
              {t(`Para confirmar, escribe el nombre del negocio: ${requiredConfirm}`, `Type the business name to confirm: ${requiredConfirm}`)}
            </Label>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={requiredConfirm}
              className="mt-1 font-mono"
              data-testid="decommission-confirm-input"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} data-testid="decommission-cancel">
            {t('Cancelar', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || confirmText.trim().toUpperCase() !== requiredConfirm}
            data-testid="decommission-confirm-btn"
          >
            {submitting ? t('Procesando...', 'Processing...') : t('Dar de baja', 'Decommission')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
