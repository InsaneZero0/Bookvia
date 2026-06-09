import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, Wallet, RefreshCcw, Calendar, ArrowUpRight, DollarSign, Trophy, MapPin } from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "Finanzas Bookvia" — net financial dashboard.
 * Shows three separate net revenue lines (commissions, subscriptions, total),
 * live Stripe balance, and a 6-month chart.
 */
export default function AdminFinanceDashboardTab() {
  const [data, setData] = useState(null);
  const [topBiz, setTopBiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  const load = async () => {
    setLoading(true);
    try {
      const [res, top] = await Promise.all([
        api.get('/admin/finance/dashboard', { params: { months } }),
        api.get('/admin/finance/top-businesses', { params: { months: Math.min(months, 1), limit: 5 } }),
      ]);
      setData(res.data);
      setTopBiz(top.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [res, top] = await Promise.all([
          api.get('/admin/finance/dashboard', { params: { months } }),
          api.get('/admin/finance/top-businesses', { params: { months: Math.min(months, 1), limit: 5 } }),
        ]);
        if (!cancelled) {
          setData(res.data);
          setTopBiz(top.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [months]);

  if (loading) {
    return (
      <div className="space-y-6" data-testid="admin-finance-loading">
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const t = data?.totals_net || { commissions: 0, subscriptions: 0, total: 0 };
  const bal = data?.current_balance || { available: 0, pending: 0, live: false };
  const settl = data?.settlements || { pending_count: 0, paid_last_30d: 0 };

  return (
    <div className="space-y-6" data-testid="admin-finance-tab">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Finanzas Bookvia</h2>
          <p className="text-sm text-muted-foreground">
            Ganancias NETAS (después de fees Stripe) últimos {months} meses
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[3, 6, 12].map(m => (
            <Button
              key={m}
              size="sm"
              variant={months === m ? 'default' : 'outline'}
              onClick={() => setMonths(m)}
              data-testid={`finance-months-${m}`}
            >
              {m}m
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} data-testid="finance-refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 3 KPIs principales — neto */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500" data-testid="kpi-commissions">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Comisiones (anticipos)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{fmt(t.commissions)}</div>
            <div className="text-xs text-muted-foreground mt-1">8.5% del anticipo + $8 cuota cliente, después de Stripe fee</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500" data-testid="kpi-subscriptions">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-blue-600" />
              Suscripciones ($49/mes)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{fmt(t.subscriptions)}</div>
            <div className="text-xs text-muted-foreground mt-1">Plan mensual de negocios, después de Stripe fee</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500 bg-gradient-to-br from-violet-50 to-transparent" data-testid="kpi-total">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-violet-600" />
              Total NETO Bookvia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-violet-700">{fmt(t.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">Tu ganancia limpia en los últimos {months} meses</div>
          </CardContent>
        </Card>
      </div>

      {/* Saldo Stripe + settlements */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card data-testid="stripe-balance-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5 text-[#F05D5E]" />
              Saldo en Stripe Bookvia
              {bal.live && <Badge variant="secondary" className="ml-auto text-xs">Live</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Disponible para payout</span>
              <span className="text-xl font-semibold text-emerald-600">{fmt(bal.available)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pendiente (en hold de Stripe)</span>
              <span className="text-xl font-semibold text-amber-600">{fmt(bal.pending)}</span>
            </div>
            <div className="pt-3 border-t flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-2xl font-bold">{fmt(bal.available + bal.pending)}</span>
            </div>
            <a href="https://dashboard.stripe.com/balance" target="_blank" rel="noopener noreferrer"
               className="text-xs text-[#F05D5E] hover:underline inline-flex items-center gap-1 mt-2">
              Ver detalle en Stripe <ArrowUpRight className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>

        <Card data-testid="settlements-summary-card">
          <CardHeader>
            <CardTitle className="text-lg">Liquidaciones</CardTitle>
            <CardDescription>Estado del flujo de pagos a negocios</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pendientes de procesar</span>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{settl.pending_count}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pagadas últimos 30 días</span>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{settl.paid_last_30d}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 negocios del mes */}
      <Card data-testid="top-businesses-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-amber-500" />
            Top 5 negocios del mes
          </CardTitle>
          <CardDescription>
            Tus aliados más activos — los embajadores naturales de Bookvia
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topBiz?.items?.length ? (
            <div className="space-y-2">
              {topBiz.items.map((biz, idx) => (
                <div
                  key={biz.business_id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:border-[#F05D5E]/40 hover:bg-muted/30 transition-colors"
                  data-testid={`top-biz-${idx}`}
                >
                  <div className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${
                    idx === 0 ? 'bg-amber-100 text-amber-700' :
                    idx === 1 ? 'bg-slate-100 text-slate-700' :
                    idx === 2 ? 'bg-orange-100 text-orange-800' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {idx + 1}
                  </div>
                  {biz.logo_url ? (
                    <img src={biz.logo_url} alt={biz.name} className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F05D5E]/20 to-[#F05D5E]/10 flex items-center justify-center text-[#F05D5E] font-semibold">
                      {biz.name?.[0]?.toUpperCase() || 'B'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{biz.name}</div>
                    {biz.city ? (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{biz.city}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{biz.bookings} citas</div>
                    <div className="text-xs text-muted-foreground">{fmt(biz.gross_amount)} brutos</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Sin datos suficientes todavía. Cuando empiecen las reservas reales verás aquí a tus 5 mejores aliados.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráfica mensual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolución mensual NETA</CardTitle>
          <CardDescription>Comisiones vs Suscripciones, descontando fees de Stripe</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.monthly_breakdown?.length ? (
            <div style={{ width: '100%', height: 320 }} data-testid="finance-chart">
              <ResponsiveContainer>
                <BarChart data={data.monthly_breakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="commissions_net" fill="#10b981" name="Comisiones" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="subscriptions_net" fill="#3b82f6" name="Suscripciones" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Sin datos suficientes todavía</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
