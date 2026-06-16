import { useState, useRef } from 'react';
import { AlertCircle, Upload, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { businessesAPI } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const FIELD_META = {
  ine: { es: 'INE / Identificación oficial', en: 'INE / Official ID', payload: 'ine_url' },
  rfc: { es: 'RFC', en: 'RFC', payload: 'rfc_url' },
  constancia: { es: 'Constancia de situación fiscal', en: 'Tax status certificate', payload: 'constancia_url' },
  comprobante_bancario: { es: 'Comprobante bancario / CLABE', en: 'Bank statement / CLABE', payload: 'proof_of_address_url' },
  cover_photo: { es: 'Foto de portada del negocio', en: 'Cover photo', payload: 'cover_photo_url' },
  logo: { es: 'Logo', en: 'Logo', payload: 'logo_url' },
};

/**
 * Banner shown to business owners when admin requested document corrections.
 * Allows them to re-upload the flagged docs and resubmit for review.
 */
export function RevisionRequestBanner({ biz, language, onResubmitted }) {
  const rev = biz?.revision_request || {};
  const fieldsToFix = Array.isArray(rev.fields_to_fix) ? rev.fields_to_fix : [];
  const isResubmitted = rev.status === 'resubmitted';

  const [uploadingField, setUploadingField] = useState(null);
  const [newUrls, setNewUrls] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputsRef = useRef({});

  const tt = (es, en) => (language === 'es' ? es : en);

  const handleUpload = async (fieldKey, file) => {
    if (!file) return;
    setUploadingField(fieldKey);
    try {
      const res = await businessesAPI.uploadPublicFile(file);
      const url = res.data?.url || res.data?.secure_url;
      if (!url) throw new Error('No URL returned');
      setNewUrls(prev => ({ ...prev, [fieldKey]: url }));
      toast.success(tt('Archivo subido', 'File uploaded'));
    } catch (e) {
      toast.error(e.response?.data?.detail || tt('Error subiendo archivo', 'Upload error'));
    }
    setUploadingField(null);
  };

  const handleResubmit = async () => {
    if (Object.keys(newUrls).length === 0) {
      toast.error(tt('Sube al menos un documento corregido', 'Upload at least one corrected document'));
      return;
    }
    setSubmitting(true);
    try {
      // Map field keys to API payload keys
      const payload = {};
      Object.entries(newUrls).forEach(([k, v]) => {
        const meta = FIELD_META[k];
        if (meta) payload[meta.payload] = v;
      });
      await businessesAPI.resubmitDocuments(payload);
      toast.success(tt(
        'Documentos enviados a revisión. Te avisaremos cuando el admin revise.',
        'Documents sent for review. We will notify you when admin reviews.'
      ));
      setNewUrls({});
      if (onResubmitted) onResubmitted();
    } catch (e) {
      toast.error(e.response?.data?.detail || tt('Error al enviar', 'Error sending'));
    }
    setSubmitting(false);
  };

  if (isResubmitted) {
    return (
      <Card className="mb-6 border-blue-500/50 bg-blue-50 dark:bg-blue-900/20" data-testid="revision-resubmitted-banner">
        <CardContent className="p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-blue-900 dark:text-blue-100 text-sm">
              {tt('Documentos enviados para revisión', 'Documents sent for review')}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              {tt(
                'El equipo Bookvia revisará tus documentos. Mientras tanto, tu perfil no aparece en búsquedas.',
                'The Bookvia team is reviewing your documents. Your profile is hidden from searches in the meantime.'
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-amber-500/60 bg-amber-50 dark:bg-amber-900/20" data-testid="revision-request-banner">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900 dark:text-amber-100 text-base">
              {tt('Tu perfil necesita correcciones', 'Your profile needs corrections')}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              {tt(
                'Tu perfil no aparece en búsquedas hasta que actualices los documentos y los aprobemos.',
                'Your profile is hidden from search until you update the documents and we approve them.'
              )}
            </p>
          </div>
        </div>

        {rev.reason && (
          <div className="bg-white/80 dark:bg-amber-950/40 rounded-md p-3 border border-amber-300/50">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">
              {tt('Comentario del equipo Bookvia:', 'Bookvia team comment:')}
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{rev.reason}</p>
          </div>
        )}

        {fieldsToFix.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              {tt('Documentos a corregir:', 'Documents to fix:')}
            </p>
            <div className="space-y-2">
              {fieldsToFix.map((fk) => {
                const meta = FIELD_META[fk];
                if (!meta) return null;
                const uploaded = !!newUrls[fk];
                const isUploading = uploadingField === fk;
                return (
                  <div key={fk} className="flex items-center gap-2 p-2 rounded-md bg-white/60 dark:bg-amber-950/30 border border-amber-200/60">
                    <span className="flex-1 text-sm text-amber-900 dark:text-amber-100">{tt(meta.es, meta.en)}</span>
                    {uploaded ? (
                      <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {tt('Listo', 'Ready')}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
                        disabled={isUploading}
                        onClick={() => fileInputsRef.current[fk]?.click()}
                        data-testid={`revision-upload-${fk}`}
                      >
                        {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        <span className="ml-1">{tt('Subir', 'Upload')}</span>
                      </Button>
                    )}
                    <input
                      ref={(el) => { fileInputsRef.current[fk] = el; }}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => handleUpload(fk, e.target.files?.[0])}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleResubmit}
            disabled={submitting || Object.keys(newUrls).length === 0}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="revision-resubmit-btn"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {tt('Reenviar para revisión', 'Resubmit for review')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
