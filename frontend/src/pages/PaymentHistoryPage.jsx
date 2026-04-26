import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { paymentsAPI } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  CreditCard, Calendar, Clock, CheckCircle2, XCircle, Timer,
  ArrowLeft, Receipt, TrendingUp
} from 'lucide-react';

const STATUS_MAP = {
  completed: { label_es: 'Completado', label_en: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  pending: { label_es: 'Pendiente', label_en: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Timer },
  failed: { label_es: 'Fallido', label_en: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  refunded: { label_es: 'Reembolsado', label_en: 'Refunded', color: 'bg-blue-100 text-blue-700', icon: ArrowLeft },
  held: { label_es: 'Retenido', label_en: 'Held', color: 'bg-orange-100 text-orange-700', icon: Timer },
};

export default function PaymentHistoryPage() {
  const { language } = useI18n();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/login'); return; }
    loadTransactions();
  }, [isAuthenticated, authLoading]);

  const loadTransactions = async () => {
    try {
      const res = await paymentsAPI.getMyTransactions();
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? transactions
    : transactions.filter(t => t.status === filter);

  const totalPaid = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.amount_total || t.amount || 0), 0);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8 max-w-3xl">
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-32 mb-8" />
          {[1, 2, 3].map(i => (
            <Card key={i} className="mb-3">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="payment-history-page">
      <div className="container-app py-8 max-w-3xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> {language === 'es' ? 'Volver' : 'Back'}
            </Button>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold flex items-center gap-2">
              <Receipt className="h-7 w-7 text-[#F05D5E]" />
              {language === 'es' ? 'Historial de pagos' : 'Payment history'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {transactions.length} {language === 'es' ? 'transacciones' : 'transactions'}
            </p>
          </div>
        </div>

        {/* Summary Card */}
        {transactions.length > 0 && (
          <Card className="mb-6 border-[#F05D5E]/20 bg-gradient-to-r from-[#F05D5E]/5 to-transparent" data-testid="payment-summary">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  {language === 'es' ? 'Total pagado' : 'Total paid'}
                </p>
                <p className="text-2xl font-bold text-[#F05D5E] mt-0.5">
                  {formatCurrency(totalPaid, 'MXN')}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-[#F05D5E]/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-[#F05D5E]" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={setFilter} className="mb-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all" data-testid="filter-all">
              {language === 'es' ? 'Todos' : 'All'}
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="filter-completed">
              {language === 'es' ? 'Pagados' : 'Paid'}
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="filter-pending">
              {language === 'es' ? 'Pendientes' : 'Pending'}
            </TabsTrigger>
            <TabsTrigger value="refunded" data-testid="filter-refunded">
              {language === 'es' ? 'Reembolsos' : 'Refunds'}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Transaction List */}
        {filtered.length === 0 ? (
          <div className="text-center py-16" data-testid="no-transactions">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h2 className="text-lg font-heading font-bold mb-1">
              {language === 'es' ? 'Sin transacciones' : 'No transactions'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {filter === 'all'
                ? (language === 'es' ? 'Aún no has realizado ningún pago.' : 'You haven\'t made any payments yet.')
                : (language === 'es' ? 'No hay transacciones con este filtro.' : 'No transactions with this filter.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="transactions-list">
            {filtered.map(tx => {
              const statusInfo = STATUS_MAP[tx.status] || STATUS_MAP.pending;
              const StatusIcon = statusInfo.icon;
              const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
              }) : '';

              return (
                <Card key={tx.id} className="hover:shadow-sm transition-shadow" data-testid={`transaction-${tx.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${statusInfo.color}`}>
                          <StatusIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {tx.description || tx.service_name || (language === 'es' ? 'Pago de anticipo' : 'Deposit payment')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {tx.business_name || ''}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {dateStr}
                            </span>
                            {tx.stripe_session_id && (
                              <span className="flex items-center gap-1">
                                <CreditCard className="h-3 w-3" />
                                Stripe
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-base">
                          {formatCurrency(tx.amount_total || tx.amount || 0, tx.currency?.toUpperCase() || 'MXN')}
                        </p>
                        <Badge variant="outline" className={`text-[10px] mt-1 ${statusInfo.color}`}>
                          {language === 'es' ? statusInfo.label_es : statusInfo.label_en}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
