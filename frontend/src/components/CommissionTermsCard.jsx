import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard, Calendar, ShieldCheck, FileText, AlertTriangle,
  Copy, RefreshCw, Eye, Download, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  COMMISSION_TERMS_VERSION as CURRENT_VERSION,
  STRIPE_FEE_PCT,
} from '@/lib/commissionTerms';
import CommissionBreakdownModal from './CommissionBreakdownModal';
import { businessesAPI } from '@/lib/api';

/**
 * Read-only card showing the commission terms the business has accepted,
 * with the legal hash, snapshot of the values they agreed to, and a
 * "Re-aceptar nueva versión" button when CURRENT_VERSION > stored version.
 *
 * Renders on BusinessSettingsPage → "Comisiones" tab.
 */
export default function CommissionTermsCard({ privateInfo, onRefresh, language = 'es' }) {
  const t = (es, en) => (language === 'es' ? es : en);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const terms = privateInfo?.commission_terms;
  const hasAccepted = !!terms?.accepted_at;
  const storedVersion = terms?.version;
  const isOutdated = hasAccepted && storedVersion && storedVersion !== CURRENT_VERSION;
  const requiresDeposit = privateInfo?.requires_deposit;

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

  const copyHash = () => {
    if (!terms?.hash) return;
    navigator.clipboard.writeText(terms.hash);
    toast.success(t('Hash copiado', 'Hash copied'));
  };

  const handleAccept = async ({ version, hash, snapshot }) => {
    setSubmitting(true);
    try {
      await businessesAPI.acceptCommissionTerms({ version, hash, snapshot });
      toast.success(t('Términos actualizados', 'Terms updated'));
      onRefresh?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error', 'Error'));
    }
    setSubmitting(false);
  };

  const [downloadingLegal, setDownloadingLegal] = useState(false);
  const handleDownloadLegalFile = async () => {
    setDownloadingLegal(true);
    try {
      const res = await businessesAPI.downloadLegalFile();
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const rfc = privateInfo?.rfc || 'negocio';
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `expediente_bookvia_${rfc}_${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('Expediente descargado', 'Legal file downloaded'));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error al descargar', 'Download error'));
    }
    setDownloadingLegal(false);
  };

  // Legal file download card — available regardless of deposit config
  const legalFileCard = (
    <Card className="mt-4" data-testid="legal-file-download-card">
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#F05D5E]" />
          {t('Expediente legal del negocio', 'Business legal file')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t(
            'Descarga un PDF con todos tus datos fiscales, documentos KYC, T&C aceptados, términos de comisiones con hashes y QR de verificación pública. Útil para entregar a tu contador o en caso de auditorías CONDUSEF/SAT.',
            'Download a PDF with your tax data, KYC documents, accepted T&C, commission terms with hashes and public-verification QR. Useful for your accountant or CONDUSEF/SAT audits.',
          )}
        </p>
        <Button
          className="mt-3 bg-slate-900 hover:bg-slate-800 text-white"
          onClick={handleDownloadLegalFile}
          disabled={downloadingLegal || submitting}
          data-testid="download-legal-file-btn"
        >
          {downloadingLegal
            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            : <Download className="h-4 w-4 mr-1.5" />}
          {t('Descargar expediente en PDF', 'Download legal file PDF')}
        </Button>
        <p className="text-[11px] text-muted-foreground mt-2">
          {t(
            '* Cada descarga queda registrada en tu bitácora de auditoría.',
            '* Each download is recorded in your audit log.',
          )}
        </p>
      </CardContent>
    </Card>
  );

  // Negocios sin anticipo no necesitan ver este bloque
  if (!requiresDeposit) {
    return (
      <>
        <Card data-testid="commission-terms-not-applicable">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
            {t(
              'Tu negocio no cobra anticipos, así que no aplica el esquema de comisiones de Bookvia. Si quieres activarlo, edita tu información en Ajustes → Cobros.',
              'Your business does not collect deposits, so the Bookvia fee schedule does not apply. To activate it, edit your settings.',
            )}
          </CardContent>
        </Card>
        {legalFileCard}
      </>
    );
  }

  return (
    <>
    <Card data-testid="commission-terms-card">
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[#F05D5E]" />
          {t('Comisiones aceptadas', 'Accepted fee terms')}
          {isOutdated && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 ml-1">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {t('Versión nueva disponible', 'New version available')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAccepted ? (
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3" data-testid="commission-terms-pending">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">
                {t('Aún no has aceptado los términos', 'You have not accepted the terms yet')}
              </p>
              <p className="text-amber-900/80 text-xs mt-1 leading-relaxed">
                {t(
                  'Para que tu negocio pueda cobrar anticipos cumpliendo con la regulación vigente, debes leer y aceptar el desglose completo de comisiones.',
                  'To collect deposits in compliance with current regulations, you must read and accept the full fee breakdown.',
                )}
              </p>
              <Button
                size="sm"
                className="mt-3 bg-[#F05D5E] hover:bg-[#F05D5E]/90 text-white"
                onClick={() => setShowModal(true)}
                data-testid="open-commission-modal-btn"
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                {t('Revisar y aceptar', 'Review and accept')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Resumen actual */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SummaryRow
                icon={ShieldCheck}
                label={t('Versión aceptada', 'Accepted version')}
                value={storedVersion || '—'}
                accent
              />
              <SummaryRow
                icon={Calendar}
                label={t('Fecha de aceptación', 'Accepted at')}
                value={fmtDate(terms.accepted_at)}
              />
              <SummaryRow
                icon={Calendar}
                label={t('Calendario de liquidación', 'Payout calendar')}
                value={t(
                  'Corte día 20 · Depósito día 1°',
                  'Cutoff day 20 · Payout day 1',
                )}
                full
              />
            </div>

            {/* Snapshot de fees aceptados */}
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                {t('Fees vigentes en tu acuerdo', 'Fees you agreed to')}
              </p>
              <div className="text-sm space-y-1.5">
                <Row label={t('Comisión por transacción (IVA incluido)', 'Transaction fee (VAT included)')}>
                  {((terms.snapshot?.fees?.commission_pct ?? STRIPE_FEE_PCT) * 100).toFixed(1)}%
                </Row>
                <Row label={t('Suscripción mensual', 'Monthly subscription')}>
                  ${(terms.snapshot?.fees?.subscription_monthly_mxn ?? 49.99).toFixed(2)} MXN
                </Row>
              </div>
            </div>

            {/* Hash legal */}
            <div className="rounded-lg border border-dashed border-slate-300 p-3 bg-slate-50/60">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
                    {t('Hash legal del documento (SHA-256)', 'Legal document hash (SHA-256)')}
                  </p>
                  <code className="text-[10px] text-slate-700 break-all block mt-0.5" data-testid="commission-hash">
                    {terms.hash || '—'}
                  </code>
                </div>
                <Button size="sm" variant="ghost" onClick={copyHash} disabled={!terms.hash} data-testid="copy-commission-hash-btn">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                {t(
                  'Este código identifica de manera única los términos exactos que aceptaste. Si Bookvia cambia algún fee o condición, deberás re-aceptar y se generará un hash nuevo.',
                  'This code uniquely identifies the exact terms you accepted. If Bookvia changes any fee or condition, you will need to re-accept and a new hash will be generated.',
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowModal(true)}
                data-testid="view-commission-terms-btn"
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                {t('Ver desglose completo', 'View full breakdown')}
              </Button>
              {isOutdated && (
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => setShowModal(true)}
                  data-testid="reaccept-commission-terms-btn"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {t(`Aceptar nueva versión (${CURRENT_VERSION})`, `Accept new version (${CURRENT_VERSION})`)}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <CommissionBreakdownModal
        open={showModal}
        onOpenChange={setShowModal}
        language={language}
        initialAmount={Number(privateInfo?.deposit_amount) || 500}
        onAccept={handleAccept}
      />
    </Card>

    {legalFileCard}
    </>
  );
}

function SummaryRow({ icon: Icon, label, value, accent = false, full = false }) {
  return (
    <div className={`rounded-md border ${accent ? 'border-[#F05D5E]/40 bg-[#F05D5E]/5' : 'border-slate-200 bg-white'} p-3 ${full ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-[#F05D5E]' : 'text-slate-500'}`} />
        <span className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">{label}</span>
      </div>
      <p className={`text-sm font-medium ${accent ? 'text-[#F05D5E] font-heading' : ''}`}>{value}</p>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}
