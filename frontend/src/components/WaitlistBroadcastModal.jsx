import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Send, Mail, Building2, Users } from 'lucide-react';
import { adminAPI } from '@/lib/api';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

const DEFAULT_MESSAGE = (city) =>
  `Ya estamos en ${city}! Gracias por esperarnos.\n\nEntra a Bookvia para reservar con los primeros negocios disponibles. Tu saldo esta protegido y si el negocio no llega, te devolvemos tu dinero mas $50 MXN de compensacion.\n\nEquipo Bookvia`;

/**
 * BroadcastModal
 * Sends a launch email to every waitlist subscriber in a given city.
 * Lets the admin hand-pick up to 5 featured businesses to embed in the
 * email (rendered as a 2-column grid by the backend).
 */
export function WaitlistBroadcastModal({ open, city, country_code = 'MX', onClose, onSent }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedBizIds, setSelectedBizIds] = useState([]);
  const [onlyUnnotified, setOnlyUnnotified] = useState(true);
  const [sending, setSending] = useState(false);

  const refreshPreview = useCallback(async () => {
    if (!city) return;
    setLoading(true);
    try {
      const res = await adminAPI.previewWaitlistBroadcast(city, country_code, onlyUnnotified);
      setPreview(res.data);
    } catch {
      toast.error(t('No se pudo cargar la vista previa'));
    }
    setLoading(false);
  }, [city, country_code, onlyUnnotified, t]);

  useEffect(() => {
    if (open && city) {
      setSubject(`Bookvia llego a ${city}`);
      setMessage(DEFAULT_MESSAGE(city));
      setSelectedBizIds([]);
      refreshPreview();
    }
  }, [open, city, refreshPreview]);

  const toggleBiz = (id) => {
    setSelectedBizIds((prev) => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) {
        toast.info(t('Maximo 5 negocios por correo'));
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSend = async () => {
    if (!subject.trim() || message.trim().length < 20) {
      toast.error(t('Completa asunto y mensaje (minimo 20 caracteres).'));
      return;
    }
    const recipients = preview?.recipient_count || 0;
    if (!window.confirm(t(`Enviar correo a ${recipients} personas en ${city}?`))) return;
    setSending(true);
    try {
      const res = await adminAPI.sendWaitlistBroadcast({
        city,
        country_code,
        subject,
        message,
        business_ids: selectedBizIds,
        only_unnotified: onlyUnnotified,
      });
      const { sent_count = 0, failed_count = 0, failed = [] } = res.data;
      if (sent_count > 0) {
        toast.success(t(`Enviado a ${sent_count} personas en ${city}`));
      }
      if (failed_count > 0) {
        toast.error(t(`${failed_count} fallaron: ${failed[0]?.error || ''}`), { duration: 8000 });
      }
      onSent?.();
      if (sent_count > 0 && failed_count === 0) onClose?.();
      else refreshPreview();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error al enviar'));
    }
    setSending(false);
  };

  if (!city) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="broadcast-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Send className="h-5 w-5 text-[#F05D5E]" />
            {t('Anunciar llegada a')} {city}
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t('Cargando...')}</p>
        ) : preview && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t('Destinatarios')}</p>
                <p className="font-heading font-bold text-lg">{preview.recipient_count}</p>
              </div>
            </div>
            <div className="rounded-lg border p-3 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t('Negocios disponibles')}</p>
                <p className="font-heading font-bold text-lg">{preview.businesses?.length || 0}</p>
              </div>
            </div>
          </div>
        )}

        {/* Subject */}
        <div className="space-y-1">
          <Label htmlFor="bcast-subject">{t('Asunto del correo')}</Label>
          <Input
            id="bcast-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 120))}
            maxLength={120}
            data-testid="broadcast-subject-input"
          />
          <p className="text-[10px] text-muted-foreground text-right">{subject.length} / 120</p>
        </div>

        {/* Message */}
        <div className="space-y-1">
          <Label htmlFor="bcast-msg">{t('Mensaje')}</Label>
          <Textarea
            id="bcast-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
            rows={6}
            placeholder={t('Escribe el cuerpo del correo...')}
            data-testid="broadcast-message-textarea"
          />
          <p className="text-[10px] text-muted-foreground text-right">{message.length} / 2000</p>
        </div>

        {/* Featured business picker */}
        {preview?.businesses?.length > 0 && (
          <div className="space-y-2">
            <Label>{t('Elige hasta 5 negocios para incluir en el correo')}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
              {preview.businesses.map(b => {
                const checked = selectedBizIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBiz(b.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                      checked ? 'border-[#F05D5E] bg-[#F05D5E]/5' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    data-testid={`broadcast-biz-${b.id}`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleBiz(b.id)} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {b.category_name || '-'}
                        {b.rating ? ` · ${b.rating.toFixed(1)} ★` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedBizIds.length > 0 && (
              <Badge className="bg-[#F05D5E]/10 text-[#F05D5E]">
                {selectedBizIds.length} {t('seleccionados')}
              </Badge>
            )}
          </div>
        )}

        {/* Only unnotified */}
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <Checkbox
            id="only-unnotified"
            checked={onlyUnnotified}
            onCheckedChange={setOnlyUnnotified}
            data-testid="broadcast-only-unnotified"
          />
          <Label htmlFor="only-unnotified" className="text-xs cursor-pointer leading-tight">
            {t('Enviar solo a quienes no han recibido un anuncio previo (recomendado).')}
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>{t('Cancelar')}</Button>
          <Button
            onClick={handleSend}
            disabled={sending || !preview || preview.recipient_count === 0}
            className="bg-[#F05D5E] hover:bg-[#c94b4c] text-white"
            data-testid="broadcast-send-btn"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
            {sending ? t('Enviando...') : t('Enviar broadcast')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
