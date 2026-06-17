import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Mail, Loader2, FileWarning, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

/**
 * Admin tool — bulk detect/repair businesses whose legal documents were lost
 * on Railway's ephemeral disk before the Cloudinary migration. Lets the admin
 * see the affected list and trigger a single bulk re-upload request email
 * for everyone at once.
 */
export default function BrokenDocsBulkRequestCard({ t, language }) {
  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState([]);
  const [count, setCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/businesses/with-broken-docs');
      setCount(res.data?.count || 0);
      setBusinesses(res.data?.businesses || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleBulkRequest = async () => {
    setProcessing(true);
    try {
      const res = await api.post('/admin/businesses/bulk-request-redocs');
      const affected = res.data?.affected_count || 0;
      const skipped = res.data?.skipped_count || 0;
      toast.success(
        language === 'es'
          ? `Solicitud enviada a ${affected} negocios${skipped ? ` (${skipped} ya tenían solicitud activa)` : ''}.`
          : `Request sent to ${affected} businesses${skipped ? ` (${skipped} already had open requests)` : ''}.`
      );
      setConfirmOpen(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (language === 'es' ? 'Error al enviar solicitud' : 'Failed to send'));
    } finally {
      setProcessing(false);
    }
  };

  const fieldLabels = {
    ine: 'INE',
    constancia: t('Constancia fiscal', 'Tax cert'),
    comprobante_bancario: t('Comprob. bancario', 'Bank proof'),
    logo: 'Logo',
    cover_photo: t('Portada', 'Cover'),
  };

  return (
    <Card data-testid="broken-docs-bulk-card" className={count > 0 ? 'border-amber-300 bg-amber-50/40' : ''}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-heading flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-amber-600" />
          {t('Archivos legales perdidos', 'Lost legal documents')}
          <Badge className={count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}>
            {count}
          </Badge>
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          data-testid="broken-docs-refresh-btn"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : t('Recargar', 'Refresh')}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('Buscando negocios afectados...', 'Scanning businesses...')}</p>
        ) : count === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
            {t('Ningun negocio tiene archivos perdidos.', 'No business has lost files.')}
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-amber-200 bg-white p-3 mb-4 text-sm text-amber-950 leading-relaxed">
              <p className="font-semibold flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                {t('Que paso?', 'What happened?')}
              </p>
              <p className="text-xs">
                {t(
                  `Estos negocios subieron sus documentos antes de la migracion a Cloudinary. Los archivos se almacenaron en el disco temporal de Railway y se perdieron al reiniciar el contenedor. NO se pueden recuperar.`,
                  `These businesses uploaded their documents before the Cloudinary migration. The files were stored on Railway's ephemeral disk and got wiped on container restart. They cannot be recovered.`
                )}
              </p>
              <p className="text-xs mt-2">
                {t(
                  'Al solicitar re-subida masiva, marcaremos a cada negocio como "necesita revision" y se enviara un correo automatico pidiendo que vuelva a subir solo los archivos perdidos.',
                  'Bulk request will mark each business as "needs revision" and send an automatic email asking them to re-upload only the missing files.'
                )}
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">{t('Negocio', 'Business')}</th>
                    <th className="text-left px-3 py-2">{t('Email', 'Email')}</th>
                    <th className="text-left px-3 py-2">{t('Estado', 'Status')}</th>
                    <th className="text-left px-3 py-2">{t('Archivos perdidos', 'Missing files')}</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b) => (
                    <tr key={b.id} className="border-t hover:bg-slate-50" data-testid={`broken-doc-row-${b.id}`}>
                      <td className="px-3 py-2 font-medium">{b.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{b.email}</td>
                      <td className="px-3 py-2 text-xs">
                        <Badge variant="outline" className="capitalize">{b.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {b.broken_fields.map((f) => (
                            <Badge key={f} className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">
                              {fieldLabels[f] || f}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <Button
                onClick={() => setConfirmOpen(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="broken-docs-bulk-action-btn"
              >
                <Mail className="h-4 w-4 mr-2" />
                {t(`Solicitar re-subida masiva (${count})`, `Bulk request re-upload (${count})`)}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="broken-docs-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t('Confirmar solicitud masiva', 'Confirm bulk request')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(
              `Se enviara correo y notificacion a ${count} negocios, y todos pasaran a estado "needs_revision" hasta que vuelvan a subir sus documentos. Continuar?`,
              `Email and in-app notification will be sent to ${count} businesses, and all will move to "needs_revision" until they re-upload. Continue?`
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={processing}>
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button
              onClick={handleBulkRequest}
              disabled={processing}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="broken-docs-confirm-btn"
            >
              {processing
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('Enviando...', 'Sending...')}</>
                : <><Mail className="h-4 w-4 mr-2" />{t('Confirmar y enviar', 'Confirm and send')}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
