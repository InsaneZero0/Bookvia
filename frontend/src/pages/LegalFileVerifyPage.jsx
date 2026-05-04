import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, FileText, Copy, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { businessesAPI } from '@/lib/api';

/**
 * Public route rendered when someone scans the QR embedded in a Bookvia
 * legal expediente PDF. Shows minimal, non-sensitive attestation that the
 * document was indeed issued by Bookvia on a specific date.
 *
 * Route: /verificar-expediente/:fileId
 */
export default function LegalFileVerifyPage() {
  const { fileId } = useParams();
  const [state, setState] = useState({ loading: true, ok: false, data: null, error: null });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await businessesAPI.verifyLegalFile(fileId);
        if (data?.ok) {
          setState({ loading: false, ok: true, data, error: null });
        } else {
          setState({ loading: false, ok: false, data: null, error: data?.error || 'No encontrado' });
        }
      } catch (e) {
        setState({ loading: false, ok: false, data: null, error: 'Error al verificar el folio' });
      }
    })();
  }, [fileId]);

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-MX', {
        dateStyle: 'long', timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-10">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6" data-testid="legal-file-verify-header">
          <div className="text-3xl font-heading font-bold text-[#F05D5E]">bookvia</div>
          <p className="text-sm text-muted-foreground mt-1">Verificación pública de expediente legal</p>
        </div>

        <Card>
          <CardContent className="p-6">
            {state.loading ? (
              <div className="text-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">Verificando folio…</p>
              </div>
            ) : state.ok ? (
              <div className="space-y-4" data-testid="legal-file-verify-ok">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 shrink-0" />
                  <div>
                    <h1 className="text-xl font-heading font-bold text-emerald-700">
                      Expediente auténtico
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Este folio fue emitido por Bookvia y los datos coinciden.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-sm">
                  <Row label="Folio interno">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded" data-testid="verify-file-id">
                      {state.data.file_id}
                    </code>
                  </Row>
                  <Row label="Razón social">
                    <span data-testid="verify-legal-name">{state.data.legal_name || '—'}</span>
                  </Row>
                  <Row label="RFC (enmascarado)">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                      {state.data.rfc_masked || '—'}
                    </code>
                  </Row>
                  <Row label="Código público Bookvia">
                    <Badge className="bg-[#F05D5E]/10 text-[#F05D5E] border-[#F05D5E]/30">
                      {state.data.public_code || '—'}
                    </Badge>
                  </Row>
                  <Row label="Emitido el">
                    <span>{fmtDate(state.data.issued_at)}</span>
                  </Row>
                  <Row label="Versión del formato">
                    <Badge variant="outline">{state.data.file_version}</Badge>
                  </Row>
                </div>

                <div className="rounded-md bg-slate-50 border border-dashed border-slate-300 p-3 mt-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
                        Hash SHA-256 del documento
                      </p>
                      <code className="text-[10px] break-all block mt-1 text-slate-700" data-testid="verify-hash">
                        {state.data.content_hash}
                      </code>
                    </div>
                    <button
                      onClick={() => copy(state.data.content_hash)}
                      className="p-1 rounded hover:bg-slate-200"
                      title="Copiar"
                    >
                      <Copy className="h-3.5 w-3.5 text-slate-600" />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-snug">
                    Compara este hash con el que aparece al pie del PDF que tienes. Si coincide,
                    el documento no ha sido alterado.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-md p-2.5 mt-4">
                  <Shield className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    Bookvia no entrega datos sensibles (INE, CLABE completa, dirección exacta) en
                    esta verificación pública. Solo las personas autorizadas con el PDF original
                    pueden ver la información completa.
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-10" data-testid="legal-file-verify-error">
                <XCircle className="h-12 w-12 text-red-500 mx-auto" />
                <h1 className="text-xl font-heading font-bold mt-3">Folio no encontrado</h1>
                <p className="text-sm text-muted-foreground mt-2">{state.error}</p>
                <p className="text-xs text-muted-foreground mt-4">
                  Verifica el folio al pie del PDF. Si el problema persiste, escribe a
                  <strong className="mx-1">soporte@bookvia.app</strong>.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <a href="/" className="text-xs text-muted-foreground hover:text-[#F05D5E]">
            ← Volver al sitio de Bookvia
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
        {label}
      </span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}
