import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { businessesAPI } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Calendar, Users, XCircle, Clock, Star, Minus
} from 'lucide-react';

const COLORS = ['#F05D5E', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

export default function ReportsTab({ language }) {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, [period]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await businessesAPI.getReports(period);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const t = (es_text, en_text) => language === 'es' ? es_text : en_text;

  const periodLabels = {
    week: t('7 dias', '7 days'),
    month: t('30 dias', '30 days'),
    quarter: t('90 dias', '90 days'),
    year: t('1 ano', '1 year'),
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-32" />
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t('No se pudieron cargar los reportes', 'Could not load reports')}
        </CardContent>
      </Card>
    );
  }

  const { summary, daily_chart, top_services, top_clients, peak_hours, peak_days } = data;

  const ChangeIndicator = ({ value, suffix = '%' }) => {
    if (value === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> {t('Sin cambio', 'No change')}</span>;
    const isUp = value > 0;
    return (
      <span className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
        {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {isUp ? '+' : ''}{value}{suffix} {t('vs periodo anterior', 'vs prev period')}
      </span>
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.name === t('Ingresos', 'Revenue') ? formatCurrency(p.value) : p.value}
          </p>
        ))}
      </div>
    );
  };

  // Cancellation chart data
  const cancelData = summary.cancelled > 0 ? [
    { name: t('Por cliente', 'By client'), value: summary.cancelled_by_user },
    { name: t('Por negocio', 'By business'), value: summary.cancelled_by_business },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6" data-testid="reports-tab">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('Reportes', 'Reports')}</h2>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {Object.entries(periodLabels).map(([key, label]) => (
            <Button
              key={key}
              variant={period === key ? 'default' : 'ghost'}
              size="sm"
              className={`text-xs h-8 ${period === key ? 'bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90' : ''}`}
              onClick={() => setPeriod(key)}
              data-testid={`period-${key}`}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card data-testid="report-revenue-card">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-emerald-50"><DollarSign className="h-4 w-4 text-emerald-600" /></div>
              <span className="text-xs text-muted-foreground">{t('Ingresos', 'Revenue')}</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(summary.revenue)}</p>
            <ChangeIndicator value={summary.revenue_change} />
          </CardContent>
        </Card>
        <Card data-testid="report-bookings-card">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-blue-50"><Calendar className="h-4 w-4 text-blue-600" /></div>
              <span className="text-xs text-muted-foreground">{t('Total citas', 'Total bookings')}</span>
            </div>
            <p className="text-xl font-bold">{summary.total_bookings}</p>
            <ChangeIndicator value={summary.bookings_change} />
          </CardContent>
        </Card>
        <Card data-testid="report-completed-card">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-violet-50"><Users className="h-4 w-4 text-violet-600" /></div>
              <span className="text-xs text-muted-foreground">{t('Completadas', 'Completed')}</span>
            </div>
            <p className="text-xl font-bold">{summary.completed + summary.confirmed}</p>
            <span className="text-xs text-muted-foreground">{summary.completed} {t('completadas', 'completed')} + {summary.confirmed} {t('confirmadas', 'confirmed')}</span>
          </CardContent>
        </Card>
        <Card data-testid="report-cancel-card">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-red-50"><XCircle className="h-4 w-4 text-red-500" /></div>
              <span className="text-xs text-muted-foreground">{t('Cancelaciones', 'Cancellations')}</span>
            </div>
            <p className="text-xl font-bold">{summary.cancelled}</p>
            <span className="text-xs text-muted-foreground">{t('Tasa', 'Rate')}: {summary.cancel_rate}%</span>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card data-testid="revenue-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('Ingresos y Citas', 'Revenue & Bookings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily_chart} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name={t('Ingresos', 'Revenue')} fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="bookings" name={t('Citas', 'Bookings')} fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Two columns: Top Services + Top Clients */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Top Services */}
        <Card data-testid="top-services-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-500" />
              {t('Servicios mas populares', 'Most popular services')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top_services.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('Sin datos', 'No data')}</p>
            ) : (
              <div className="space-y-3">
                {top_services.map((s, i) => {
                  const maxBookings = top_services[0]?.bookings || 1;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <span>{s.bookings} {t('citas', 'bookings')}</span>
                          <span className="font-medium text-foreground">{formatCurrency(s.revenue)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(s.bookings / maxBookings) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card data-testid="top-clients-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4 text-blue-500" />
              {t('Clientes frecuentes', 'Frequent clients')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top_clients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('Sin datos', 'No data')}</p>
            ) : (
              <div className="space-y-2.5">
                {top_clients.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#F05D5E] to-[#f0787a] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {c.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.visits} {t('visitas', 'visits')}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatCurrency(c.total_spent)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two columns: Peak Days + Peak Hours */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Peak Days */}
        <Card data-testid="peak-days-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-violet-500" />
              {t('Dias mas ocupados', 'Busiest days')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={peak_days} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="bookings" name={t('Citas', 'Bookings')} fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Peak Hours */}
        <Card data-testid="peak-hours-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-500" />
              {t('Horarios pico', 'Peak hours')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {peak_hours.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('Sin datos', 'No data')}</p>
            ) : (
              <div className="space-y-2">
                {peak_hours.map((h, i) => {
                  const max = peak_hours[0]?.bookings || 1;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-mono w-12 text-right text-muted-foreground">{h.hour}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                          style={{ width: `${(h.bookings / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length], minWidth: h.bookings > 0 ? '24px' : '0' }}
                        >
                          <span className="text-[10px] font-bold text-white">{h.bookings}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancellation breakdown */}
      {cancelData.length > 0 && (
        <Card data-testid="cancel-breakdown-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-red-500" />
              {t('Desglose de cancelaciones', 'Cancellation breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={cancelData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={4} dataKey="value">
                      {cancelData.map((_, i) => <Cell key={i} fill={i === 0 ? '#F05D5E' : '#3B82F6'} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {cancelData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: i === 0 ? '#F05D5E' : '#3B82F6' }} />
                    <span className="text-sm">{d.name}: <strong>{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
