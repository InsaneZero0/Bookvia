import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { financeAPI, businessesAPI } from '@/lib/api';
import { toast } from 'sonner';
import { WhatsAppSupportButton } from '@/components/WhatsAppSupport';
import StripeConnectCard from '@/components/StripeConnectCard';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Clock, CheckCircle2,
  AlertTriangle, Calendar, ArrowRight, Receipt, CreditCard, Ban,
  FileDown, Loader2
} from 'lucide-react';

const STATUS_COLORS = {
  created: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
  refund_partial: 'bg-orange-100 text-orange-800',
  refund_full: 'bg-red-100 text-red-800',
  no_show_payout: 'bg-blue-100 text-blue-800',
  business_cancel_fee: 'bg-purple-100 text-purple-800',
  expired: 'bg-slate-100 text-slate-800',
  pending: 'bg-amber-100 text-amber-800',
  held: 'bg-red-100 text-red-800',
};

const STATUS_LABELS = {
  es: {
    created: 'Pendiente',
    paid: 'Pagado',
    refund_partial: 'Reembolso parcial',
    refund_full: 'Reembolso completo',
    no_show_payout: 'No-show',
    business_cancel_fee: 'Penalidad',
    expired: 'Expirado',
    pending: 'Pendiente',
    held: 'Retenido',
  },
  en: {
    created: 'Pending',
    paid: 'Paid',
    refund_partial: 'Partial refund',
    refund_full: 'Full refund',
    no_show_payout: 'No-show',
    business_cancel_fee: 'Penalty',
    expired: 'Expired',
    pending: 'Pending',
    held: 'Held',
  }
};

export default function BusinessFinancePage() {
  const { language } = useI18n();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== 'business') {
      navigate('/business/login');
      return;
    }
    loadData();
  }, [isAuthenticated, user, authLoading]);

  const [fundsState, setFundsState] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const handleDownloadStatement = async (settlementId) => {
    setDownloadingId(settlementId);
    try {
      const res = await businessesAPI.downloadSettlementStatement(settlementId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estado_de_cuenta_bookvia_${settlementId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(language === 'es' ? 'Estado de cuenta descargado' : 'Statement downloaded');
    } catch (e) {
      toast.error(e?.response?.data?.detail
        || (language === 'es' ? 'Error al descargar' : 'Download error'));
    }
    setDownloadingId(null);
  };

  // Auto-download when the email link `?statement=<id>` is used
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('statement');
    if (sid && settlements.length && settlements.some(x => x.id === sid)) {
      handleDownloadStatement(sid);
      // Clean the query param so reload doesn't retrigger
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlements]);

  const loadData = async () => {
    try {
      const [summaryRes, transactionsRes, settlementsRes, fundsStateRes] = await Promise.all([
        financeAPI.getSummary(),
        financeAPI.getTransactions({ limit: 50 }),
        financeAPI.getSettlements({}),
        financeAPI.getFundsState().catch(() => ({ data: null })),
      ]);
      setSummary(summaryRes.data);
      setTransactions(transactionsRes.data);
      setSettlements(settlementsRes.data);
      setFundsState(fundsStateRes.data);
    } catch (error) {
      console.error('Error loading finance data:', error);
      toast.error(language === 'es' ? 'Error al cargar datos financieros' : 'Error loading finance data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat(language === 'es' ? 'es-MX' : 'en-US', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredTransactions = statusFilter === 'all' 
    ? transactions 
    : transactions.filter(t => t.status === statusFilter);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="business-finance-page">
      <div className="container-app py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold">
              {language === 'es' ? 'Panel Financiero' : 'Financial Dashboard'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'es' ? 'Resumen de ingresos y liquidaciones' : 'Revenue and settlements summary'}
            </p>
          </div>
          {summary?.next_settlement_date && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                {language === 'es' ? 'Próxima liquidación' : 'Next settlement'}
              </p>
              <p className="font-bold flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(summary.next_settlement_date)}
              </p>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'Ingresos brutos' : 'Gross revenue'}
                  </p>
                  <p className="text-2xl font-bold text-green-600" data-testid="gross-revenue">
                    {formatCurrency(summary?.gross_revenue || 0)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'Comisiones (8%)' : 'Fees (8%)'}
                  </p>
                  <p className="text-2xl font-bold text-amber-600" data-testid="total-fees">
                    {formatCurrency(summary?.total_fees || 0)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Receipt className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'Reembolsos + Penalidades' : 'Refunds + Penalties'}
                  </p>
                  <p className="text-2xl font-bold text-red-600" data-testid="total-deductions">
                    {formatCurrency((summary?.total_refunds || 0) + (summary?.total_penalties || 0))}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'Neto ganado' : 'Net earnings'}
                  </p>
                  <p className="text-2xl font-bold text-blue-600" data-testid="net-earnings">
                    {formatCurrency(summary?.net_earnings || 0)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Funds State Pipeline (NEW - Fase 3) */}
        {fundsState && (
          <Card className="mb-6 border-[#F05D5E]/20" data-testid="funds-state-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-base">
                    {language === 'es' ? 'Flujo de tu dinero' : 'Your money pipeline'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {language === 'es' 
                      ? 'Asi viaja cada anticipo desde el cobro hasta tu cuenta. Solo el dinero "Listo para pagar" se incluye en tu corte mensual.'
                      : 'Here is how each deposit flows from charge to your bank account. Only "Ready to pay" funds are included in your monthly settlement.'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200" data-testid="funds-state-pending">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    {language === 'es' ? '1. En espera' : '1. On hold'}
                  </p>
                  <p className="text-lg font-bold mt-1">{formatCurrency(fundsState.in_hold || 0)}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-1">
                    {language === 'es' ? 'Cita aun no se realiza' : 'Appointment not yet held'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200" data-testid="funds-state-grace">
                  <p className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">
                    {language === 'es' ? '2. Periodo de gracia' : '2. Grace period'}
                  </p>
                  <p className="text-lg font-bold mt-1 text-amber-800">{formatCurrency(fundsState.in_grace || 0)}</p>
                  <p className="text-[10px] text-amber-700 leading-tight mt-1">
                    {language === 'es' ? '24h despues de completar' : '24h after completion'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200" data-testid="funds-state-cleared">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">
                    {language === 'es' ? '3. Listo para pagar' : '3. Ready to pay'}
                  </p>
                  <p className="text-lg font-bold mt-1 text-emerald-800">{formatCurrency(fundsState.pending_payout || 0)}</p>
                  <p className="text-[10px] text-emerald-700 leading-tight mt-1">
                    {language === 'es' ? 'Se paga el dia 1 del mes' : 'Paid on the 1st of the month'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200" data-testid="funds-state-disputed">
                  <p className="text-[11px] uppercase tracking-wide text-rose-700 font-semibold">
                    {language === 'es' ? 'En revision' : 'Under review'}
                  </p>
                  <p className="text-lg font-bold mt-1 text-rose-800">{formatCurrency(fundsState.disputed || 0)}</p>
                  <p className="text-[10px] text-rose-700 leading-tight mt-1">
                    {language === 'es' ? 'Cliente reporto problema' : 'Client reported issue'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payout Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'Pendiente de pago' : 'Pending payout'}
                  </p>
                  <p className="text-xl font-bold" data-testid="pending-payout">
                    {formatCurrency(summary?.pending_payout || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'Ya pagado' : 'Already paid'}
                  </p>
                  <p className="text-xl font-bold" data-testid="paid-payout">
                    {formatCurrency(summary?.paid_payout || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Ban className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'Retenido' : 'Held'}
                  </p>
                  <p className="text-xl font-bold" data-testid="held-payout">
                    {formatCurrency(summary?.held_payout || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          <StripeConnectCard />
        </div>

        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="transactions" data-testid="transactions-tab">
              {language === 'es' ? 'Transacciones' : 'Transactions'}
            </TabsTrigger>
            <TabsTrigger value="settlements" data-testid="settlements-tab">
              {language === 'es' ? 'Liquidaciones' : 'Settlements'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-6">
            {/* Filters */}
            <div className="flex items-center gap-4 mb-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={language === 'es' ? 'Filtrar por estado' : 'Filter by status'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'es' ? 'Todos' : 'All'}</SelectItem>
                  <SelectItem value="paid">{STATUS_LABELS[language].paid}</SelectItem>
                  <SelectItem value="refund_partial">{STATUS_LABELS[language].refund_partial}</SelectItem>
                  <SelectItem value="refund_full">{STATUS_LABELS[language].refund_full}</SelectItem>
                  <SelectItem value="no_show_payout">{STATUS_LABELS[language].no_show_payout}</SelectItem>
                  <SelectItem value="business_cancel_fee">{STATUS_LABELS[language].business_cancel_fee}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredTransactions.length > 0 ? (
              <div className="space-y-3">
                {filteredTransactions.map(tx => (
                  <Card key={tx.id} data-testid={`transaction-${tx.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            tx.status === 'paid' || tx.status === 'no_show_payout' 
                              ? 'bg-green-100' 
                              : tx.status.includes('refund') 
                                ? 'bg-orange-100' 
                                : 'bg-slate-100'
                          }`}>
                            <CreditCard className={`h-5 w-5 ${
                              tx.status === 'paid' || tx.status === 'no_show_payout' 
                                ? 'text-green-600' 
                                : tx.status.includes('refund') 
                                  ? 'text-orange-600' 
                                  : 'text-slate-600'
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium">
                              {tx.booking_id ? `Booking #${tx.booking_id.slice(0, 8)}` : 'Transacción'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(tx.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Badge className={STATUS_COLORS[tx.status]}>
                              {STATUS_LABELS[language][tx.status] || tx.status}
                            </Badge>
                          </div>
                          <div className="mt-1">
                            <span className={`font-bold ${
                              tx.status === 'paid' || tx.status === 'no_show_payout' 
                                ? 'text-green-600' 
                                : tx.status.includes('refund') || tx.status === 'business_cancel_fee'
                                  ? 'text-red-600' 
                                  : ''
                            }`}>
                              {tx.status === 'paid' || tx.status === 'no_show_payout'
                                ? `+${formatCurrency(tx.payout_amount)}`
                                : tx.status.includes('refund')
                                  ? `-${formatCurrency(tx.refund_amount || 0)}`
                                  : tx.status === 'business_cancel_fee'
                                    ? `-${formatCurrency(tx.fee_amount)}`
                                    : formatCurrency(tx.amount_total)
                              }
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {language === 'es' ? 'Fee:' : 'Fee:'} {formatCurrency(tx.fee_amount)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Receipt className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-heading font-bold text-xl mb-2">
                  {language === 'es' ? 'Sin transacciones' : 'No transactions'}
                </h3>
                <p className="text-muted-foreground">
                  {language === 'es' 
                    ? 'Las transacciones aparecerán aquí cuando recibas pagos'
                    : 'Transactions will appear here when you receive payments'}
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settlements" className="mt-6">
            {settlements.length > 0 ? (
              <div className="space-y-3">
                {settlements.map(settlement => (
                  <Card key={settlement.id} data-testid={`settlement-${settlement.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{settlement.period_key}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(settlement.period_start)} - {formatDate(settlement.period_end)}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge className={STATUS_COLORS[settlement.status]}>
                            {STATUS_LABELS[language][settlement.status] || settlement.status}
                          </Badge>
                          <p className="font-bold text-lg mt-1">
                            {formatCurrency(settlement.net_payout)}
                          </p>
                          {settlement.payout_reference && (
                            <p className="text-xs text-muted-foreground">
                              Ref: {settlement.payout_reference}
                            </p>
                          )}
                        </div>
                      </div>
                      {settlement.held_reason && (
                        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {settlement.held_reason}
                        </div>
                      )}
                      {/* Settlement breakdown */}
                      <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">{language === 'es' ? 'Bruto' : 'Gross'}</p>
                          <p className="font-medium">{formatCurrency(settlement.gross_paid)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{language === 'es' ? 'Comisiones' : 'Fees'}</p>
                          <p className="font-medium text-amber-600">-{formatCurrency(settlement.total_fees)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{language === 'es' ? 'Reembolsos' : 'Refunds'}</p>
                          <p className="font-medium text-red-600">-{formatCurrency(settlement.total_refunds)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{language === 'es' ? 'Penalidades' : 'Penalties'}</p>
                          <p className="font-medium text-red-600">-{formatCurrency(settlement.total_penalties)}</p>
                        </div>
                      </div>

                      {/* Download statement PDF */}
                      <div className="mt-4 pt-3 border-t flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {language === 'es'
                            ? 'Descarga el estado de cuenta detallado con todas las transacciones, fees y hash de verificación.'
                            : 'Download the detailed statement with all transactions, fees and verification hash.'}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadStatement(settlement.id)}
                          disabled={downloadingId === settlement.id}
                          data-testid={`download-statement-${settlement.id}`}
                        >
                          {downloadingId === settlement.id
                            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
                          {language === 'es' ? 'Descargar PDF' : 'Download PDF'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Wallet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-heading font-bold text-xl mb-2">
                  {language === 'es' ? 'Sin liquidaciones' : 'No settlements'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {language === 'es' 
                    ? 'Las liquidaciones se generan automáticamente cada mes (corte día 20 · depósito día 1°)'
                    : 'Settlements are generated automatically every month (cutoff day 20 · payout day 1)'}
                </p>
                <WhatsAppSupportButton
                  context={language === 'es' ? 'mis liquidaciones / corte mensual' : 'my settlements / monthly cutoff'}
                  dataTestId="finance-empty-whatsapp-btn"
                >
                  {language === 'es' ? '¿Dudas con tu corte? Escríbenos' : 'Questions about your cutoff?'}
                </WhatsAppSupportButton>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
