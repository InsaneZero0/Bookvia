import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard, Info, Calendar, ShieldCheck, AlertTriangle,
  TrendingUp, FileText, Scale,
} from 'lucide-react';

export const COMMISSION_TERMS_VERSION = 'v1-2026-02';

const BOOKVIA_FEE_MXN = 8.20;
const STRIPE_FEE_PCT = 0.085;

/**
 * Modal de transparencia de comisiones que el negocio debe leer y aceptar
 * antes de habilitar anticipos. Se versiona (COMMISSION_TERMS_VERSION).
 *
 * Props:
 *   open, onOpenChange, onAccept, language, initialAmount?
 */
export default function CommissionBreakdownModal({
  open, onOpenChange, onAccept, language = 'es', initialAmount = 500,
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [accepted, setAccepted] = useState(false);

  const es = language === 'es';
  const t = (esStr, enStr) => (es ? esStr : enStr);

  const calc = useMemo(() => {
    const deposit = Math.max(0, Number(amount) || 0);
    const stripeFee = +(deposit * STRIPE_FEE_PCT).toFixed(2);
    const bookviaFee = BOOKVIA_FEE_MXN;
    const clientPays = +(deposit + bookviaFee).toFixed(2);
    const businessReceives = +(deposit - stripeFee).toFixed(2);
    const bookviaKeeps = bookviaFee;
    return { deposit, stripeFee, bookviaFee, clientPays, businessReceives, bookviaKeeps };
  }, [amount]);

  const fmt = (n) =>
    '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleConfirm = () => {
    if (!accepted) return;
    onAccept?.({ version: COMMISSION_TERMS_VERSION });
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[88vh] overflow-y-auto"
        data-testid="commission-breakdown-modal"
      >
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-xl">
            <CreditCard className="h-5 w-5 text-[#F05D5E]" />
            {t('Desglose completo de comisiones', 'Full fee breakdown')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            {t(
              'Antes de continuar, revisa con detalle qué se le cobra al cliente, qué se te descuenta a ti y cómo recibes tu dinero.',
              'Before continuing, review in detail what the client pays, what is deducted from you and how you receive your money.',
            )}
          </p>
        </DialogHeader>

        {/* ─────── Calendario de liquidación ─────── */}
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-start gap-2.5">
            <Calendar className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-blue-900">
                {t('Calendario fijo de liquidaciones', 'Fixed payout calendar')}
              </p>
              <p className="text-blue-900/80 mt-1 leading-relaxed">
                {t(
                  'Corte el día 20 de cada mes. Todo anticipo cobrado del día 1 al día 20 se deposita en tu CLABE el día 1° del mes siguiente. Los cobros del día 21 al fin de mes se incluyen en el siguiente corte.',
                  'Cutoff day 20 each month. Any deposit collected from day 1 to day 20 is paid to your CLABE on the 1st of the following month. Deposits from day 21 to month-end go into the next cycle.',
                )}
              </p>
              <p className="text-xs text-blue-900/70 mt-2">
                {t(
                  '* Las cancelaciones reembolsables reducen tu saldo pendiente. Si el saldo del corte es negativo, se arrastra al siguiente ciclo.',
                  '* Refundable cancellations reduce your pending balance. Negative balances roll into the next cycle.',
                )}
              </p>
            </div>
          </div>
        </div>

        {/* ─────── Simulador en vivo ─────── */}
        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#F05D5E]" />
            <h4 className="font-semibold text-sm">
              {t('Simulador: ¿Cuánto recibes por cada servicio?', 'Simulator: how much do you receive per service?')}
            </h4>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-sm shrink-0">
              {t('Anticipo solicitado (MXN)', 'Deposit amount (MXN)')}
            </Label>
            <Input
              type="number"
              min="100"
              step="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="max-w-[140px]"
              data-testid="commission-sim-amount"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">
                {t('Cliente paga', 'Client pays')}
              </p>
              <p className="text-2xl font-heading font-bold text-emerald-700 tabular-nums mt-0.5">
                {fmt(calc.clientPays)}
              </p>
              <p className="text-[11px] text-emerald-800/70 mt-1">
                {fmt(calc.deposit)} + {fmt(calc.bookviaFee)} {t('fee Bookvia', 'Bookvia fee')}
              </p>
            </div>
            <div className="rounded-md bg-slate-100 border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold">
                {t('Stripe retiene', 'Stripe keeps')}
              </p>
              <p className="text-2xl font-heading font-bold text-slate-700 tabular-nums mt-0.5">
                -{fmt(calc.stripeFee)}
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                {t('8.5% del anticipo', '8.5% of deposit')}
              </p>
            </div>
            <div className="rounded-md bg-[#F05D5E]/10 border-2 border-[#F05D5E] p-3">
              <p className="text-[11px] uppercase tracking-wider text-[#F05D5E] font-semibold">
                {t('Tú recibes', 'You receive')}
              </p>
              <p className="text-2xl font-heading font-bold text-[#F05D5E] tabular-nums mt-0.5">
                {fmt(calc.businessReceives)}
              </p>
              <p className="text-[11px] text-[#F05D5E]/80 mt-1">
                {t('Neto en tu CLABE', 'Net to your CLABE')}
              </p>
            </div>
          </div>
        </div>

        {/* ─────── Tabla transparente ─────── */}
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-[#F05D5E]" />
            <h4 className="font-semibold text-sm">
              {t('Qué se cobra y quién lo paga', 'What is charged and who pays it')}
            </h4>
          </div>

          <div className="divide-y divide-slate-200">
            <FeeRow
              concept={t('Fee fijo Bookvia', 'Bookvia fixed fee')}
              sub={t('IVA incluido · cubre plataforma, soporte, anti-fraude',
                'VAT included · covers platform, support, anti-fraud')}
              amount={fmt(BOOKVIA_FEE_MXN)}
              who="client"
              whoLabel={t('Cliente', 'Client')}
            />
            <FeeRow
              concept={t('Procesamiento Stripe', 'Stripe processing')}
              sub={t('~8.5% aprox. (varía según tarjeta)',
                '~8.5% approx. (varies by card)')}
              amount="8.5%"
              who="business"
              whoLabel={t('Negocio', 'Business')}
            />
            <FeeRow
              concept={t('Reembolso al cliente', 'Client refund')}
              sub={t('Si el cliente cancela en tiempo, el fee fijo Bookvia NO se reembolsa al cliente (lo asume el negocio si decides reembolso completo).',
                'If the client cancels on time, the Bookvia fixed fee is NOT refunded to the client (covered by the business if you offer full refund).')}
              amount={t('Caso por caso', 'Case-by-case')}
              who="business"
              whoLabel={t('Negocio', 'Business')}
            />
            <FeeRow
              concept={t('Suscripción mensual Bookvia', 'Bookvia monthly subscription')}
              sub={t('$49.99 MXN / mes · gratis los primeros días de trial',
                '$49.99 MXN / month · first days trial is free')}
              amount="$49.99"
              who="business"
              whoLabel={t('Negocio', 'Business')}
            />
          </div>
        </div>

        {/* ─────── Próximas retenciones Ley Fintech ─────── */}
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-2.5">
            <Scale className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 flex items-center gap-2">
                {t('Próximamente: retenciones SAT / Ley Fintech', 'Coming soon: SAT withholdings / Fintech Law')}
                <Badge variant="outline" className="border-amber-400 text-amber-700 text-[10px]">
                  {t('Informativo', 'Informational')}
                </Badge>
              </p>
              <p className="text-amber-900/80 mt-1 leading-relaxed">
                {t(
                  'En cumplimiento con la Ley para Regular las Instituciones de Tecnología Financiera y la LISR art. 113-A por plataformas digitales, en los próximos meses aplicaremos automáticamente las retenciones fiscales correspondientes a tu régimen (ISR hasta 4% + IVA hasta 8%, según tu constancia de situación fiscal).',
                  'Under the Fintech Law and LISR art. 113-A for digital platforms, we will soon automatically apply the applicable tax withholdings (up to 4% ISR + up to 8% VAT, based on your tax status certificate).',
                )}
              </p>
              <p className="text-xs text-amber-900/70 mt-2">
                {t(
                  '* Te avisaremos con al menos 30 días de anticipación antes de cualquier cambio. Podrás consultar en tu panel el CFDI de retenciones generado mes a mes.',
                  '* We will notify you with at least 30 days notice before any change. You will be able to see the monthly withholding CFDI in your dashboard.',
                )}
              </p>
            </div>
          </div>
        </div>

        {/* ─────── Reembolsos y disputas ─────── */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-slate-800">
                {t('Reembolsos, disputas y no-shows', 'Refunds, disputes and no-shows')}
              </p>
              <ul className="text-slate-700/90 text-xs mt-1.5 leading-relaxed list-disc pl-4 space-y-1">
                <li>
                  {t(
                    'Cancelación del cliente dentro del margen que tú configures: anticipo reembolsable; el fee Bookvia ($8.20) queda con la plataforma.',
                    'Client cancellation within your configured window: deposit refundable; the Bookvia fee ($8.20) remains with the platform.',
                  )}
                </li>
                <li>
                  {t(
                    'No-show del cliente: el anticipo se libera a tu favor (tras 24h del inicio de cita) y se incluye en el siguiente corte del día 20.',
                    'Client no-show: deposit is released in your favor (24h after appointment start) and included in the next day-20 cutoff.',
                  )}
                </li>
                <li>
                  {t(
                    'Disputa/chargeback del tarjetahabiente: Stripe puede retener el monto disputado hasta resolver (10–30 días). Bookvia te acompaña con evidencia.',
                    'Cardholder dispute/chargeback: Stripe may hold the disputed amount until resolution (10–30 days). Bookvia helps you with evidence.',
                  )}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* ─────── Aceptación ─────── */}
        <div className="rounded-lg border-2 border-[#F05D5E]/40 bg-[#F05D5E]/5 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-commission-terms"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(!!v)}
              className="mt-0.5"
              data-testid="accept-commission-terms-checkbox"
            />
            <Label
              htmlFor="accept-commission-terms"
              className="text-sm leading-relaxed cursor-pointer"
            >
              <span className="font-semibold">
                {t('Entiendo y acepto el esquema de comisiones vigente de Bookvia',
                  'I understand and accept the current Bookvia fee schedule')}
              </span>{' '}
              <span className="text-muted-foreground">
                ({t('versión', 'version')} <code className="text-xs bg-white px-1 rounded border">{COMMISSION_TERMS_VERSION}</code>).{' '}
                {t(
                  'Quedará constancia con fecha y hora en mi expediente de negocio. Seré notificado con al menos 30 días de anticipación antes de cualquier cambio regulatorio (Ley Fintech, retenciones SAT, etc.).',
                  'A timestamped record will be kept in my business file. I will be notified with at least 30 days notice before any regulatory change (Fintech Law, SAT withholdings, etc.).',
                )}
              </span>
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            {t(
              'Puedes consultar este desglose en cualquier momento desde Ajustes → Cobros en tu panel de negocio.',
              'You can review this breakdown anytime from Settings → Payments in your business panel.',
            )}
          </span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            data-testid="commission-cancel-btn"
          >
            {t('Cerrar', 'Close')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!accepted}
            className="bg-[#F05D5E] hover:bg-[#F05D5E]/90 text-white"
            data-testid="commission-accept-btn"
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            {t('Aceptar y continuar', 'Accept and continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeeRow({ concept, sub, amount, who, whoLabel }) {
  const badgeColor = who === 'client'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <div className="py-2.5 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{concept}</p>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5">{sub}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-heading font-bold tabular-nums">{amount}</p>
        <Badge className={`${badgeColor} text-[10px] mt-0.5 font-normal border`}>
          {whoLabel}
        </Badge>
      </div>
    </div>
  );
}
