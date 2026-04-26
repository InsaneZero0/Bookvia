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
import { financeAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Clock, CheckCircle2,
  AlertTriangle, Calendar, ArrowRight, Receipt, CreditCard, Ban
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

  const loadData = async () => {
    try {
      const [summaryRes, transactionsRes, settlementsRes] = await Promise.all([
        financeAPI.getSummary(),
        financeAPI.getTransactions({ limit: 50 }),
        financeAPI.getSettlements({}),
      ]);
      setSummary(summaryRes.data);
      setTransactions(transactionsRes.data);
      setSettlements(settlementsRes.data);
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
                <p className="text-muted-foreground">
                  {language === 'es' 
                    ? 'Las liquidaciones se generan automáticamente cada mes'
                    : 'Settlements are generated automatically every month'}
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
