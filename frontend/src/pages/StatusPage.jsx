import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { BookviaLogo } from '@/components/BookviaLogo';
import { Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const STATUS_META = {
  operational: {
    label: { es: 'Operativo', en: 'Operational' },
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-900/40',
    Icon: CheckCircle2,
  },
  degraded: {
    label: { es: 'Degradado', en: 'Degraded' },
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-900/40',
    Icon: AlertTriangle,
  },
  down: {
    label: { es: 'Caído', en: 'Down' },
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-900/40',
    Icon: XCircle,
  },
};

export default function StatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const lang = (typeof window !== 'undefined' && window.localStorage?.getItem('bookvia-lang')) === 'en' ? 'en' : 'es';

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const res = await axios.get(`${BACKEND}/api/status`, { timeout: 12000 });
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Unable to reach API');
      setData({
        overall: 'down',
        checked_at: new Date().toISOString(),
        components: [{ name: 'API', status: 'down', latency_ms: 0, message: 'Backend unreachable' }],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const overall = data?.overall || 'operational';
  const OverallIcon = STATUS_META[overall]?.Icon || CheckCircle2;
  const overallMeta = STATUS_META[overall] || STATUS_META.operational;

  return (
    <div className="min-h-screen bg-background" data-testid="status-page">
      {/* Minimal header — no Navbar dependency for resilience */}
      <header className="border-b border-border/50 py-4">
        <div className="container-app flex items-center justify-between">
          <Link to="/" data-testid="status-logo-link">
            <BookviaLogo size="text-xl" />
          </Link>
          <button
            onClick={fetchStatus}
            disabled={refreshing}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
            data-testid="status-refresh-btn"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {lang === 'es' ? 'Actualizar' : 'Refresh'}
          </button>
        </div>
      </header>

      <main className="container-app py-12 max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-2">
          {lang === 'es' ? 'Estado del sistema' : 'System Status'}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {lang === 'es'
            ? 'Estado en tiempo real de la plataforma Bookvia. Se actualiza automáticamente cada minuto.'
            : 'Real-time status of the Bookvia platform. Auto-refreshes every minute.'}
        </p>

        {/* Overall banner */}
        <Card className={`mb-6 border-2 ${overallMeta.border} ${overallMeta.bg}`} data-testid="status-overall-banner">
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`p-3 rounded-full ${overallMeta.bg} ${overallMeta.border} border`}>
              <OverallIcon className={`h-7 w-7 ${overallMeta.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-lg font-bold font-heading ${overallMeta.color}`} data-testid="status-overall-label">
                {overall === 'operational'
                  ? (lang === 'es' ? 'Todos los sistemas operativos' : 'All systems operational')
                  : overall === 'degraded'
                  ? (lang === 'es' ? 'Algunos sistemas degradados' : 'Some systems are degraded')
                  : (lang === 'es' ? 'Hay problemas activos' : 'Active issues detected')}
              </p>
              {data?.checked_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === 'es' ? 'Última verificación:' : 'Last checked:'}{' '}
                  {new Date(data.checked_at).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Components list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading">
              {lang === 'es' ? 'Componentes' : 'Components'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {loading && !data && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {lang === 'es' ? 'Verificando estado...' : 'Checking status...'}
              </div>
            )}
            {data?.components?.map(c => {
              const meta = STATUS_META[c.status] || STATUS_META.operational;
              const Icon = meta.Icon;
              return (
                <div
                  key={c.name}
                  className={`flex items-center justify-between gap-3 p-4 rounded-xl border ${meta.border} ${meta.bg}`}
                  data-testid={`status-component-${c.name.toLowerCase()}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`h-5 w-5 shrink-0 ${meta.color}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {c.latency_ms > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums" data-testid={`status-latency-${c.name.toLowerCase()}`}>
                        {c.latency_ms} ms
                      </span>
                    )}
                    <span className={`text-xs font-semibold ${meta.color}`}>
                      {meta.label[lang]}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {error && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            {lang === 'es' ? 'Error de conexión:' : 'Connection error:'} {error}
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-8 text-center">
          {lang === 'es' ? '¿Reportar un problema?' : 'Report an issue?'}{' '}
          <Link to="/contacto" className="text-[#F05D5E] hover:underline">
            {lang === 'es' ? 'Contáctanos' : 'Contact us'}
          </Link>
        </p>
      </main>
    </div>
  );
}
