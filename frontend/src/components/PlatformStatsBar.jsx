import { Building2, CalendarCheck, Star, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/**
 * Platform trust metrics shown right below the hero.
 *
 * Two display modes keep the homepage honest while bookings are still
 * ramping up:
 *   * `bookings >= 50` OR `reviews >= 10`  →  real numbers with +/k suffix
 *   * otherwise → qualitative "early days" copy so a dashboard of `0`s
 *     never makes the platform look dead.
 */
export function PlatformStatsBar({ stats }) {
  const { language } = useI18n();

  if (!stats) return null;

  const bookings = Number(stats.bookings) || 0;
  const businesses = Number(stats.businesses) || 0;
  const reviews = Number(stats.reviews) || 0;
  const avgRating = Number(stats.avg_rating) || 0;

  const hasMomentum = bookings >= 50 || reviews >= 10;

  const format = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : `${n}+`);

  const items = hasMomentum
    ? [
        { icon: Building2, value: format(businesses), label: language === 'es' ? 'Negocios verificados' : 'Verified businesses' },
        { icon: CalendarCheck, value: format(bookings), label: language === 'es' ? 'Reservas completadas' : 'Bookings completed' },
        { icon: Star, value: avgRating > 0 ? `${avgRating.toFixed(1)} / 5` : '—', label: language === 'es' ? 'Calificacion promedio' : 'Average rating', accent: true },
        { icon: ShieldCheck, value: language === 'es' ? '100%' : '100%', label: language === 'es' ? 'Pagos protegidos' : 'Protected payments' },
      ]
    : [
        { icon: Building2, value: businesses > 0 ? `${businesses}` : '—', label: language === 'es' ? 'Negocios activos' : 'Active businesses' },
        { icon: ShieldCheck, value: language === 'es' ? 'Si' : 'Yes', label: language === 'es' ? 'Reembolso garantizado' : 'Guaranteed refund' },
        { icon: CalendarCheck, value: language === 'es' ? '$50 MXN' : '$50 MXN', label: language === 'es' ? 'Compensacion por no-show' : 'No-show compensation' },
        { icon: Star, value: language === 'es' ? 'CDMX' : 'Mexico City', label: language === 'es' ? 'Beta abierta' : 'Open beta' },
      ];

  return (
    <section
      className="py-6 sm:py-8 border-b bg-white"
      data-testid="platform-stats-bar"
    >
      <div className="container-app">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {items.map((it) => (
            <div
              key={it.label}
              className="flex items-center gap-3 px-2 sm:px-4"
              data-testid={`stat-${it.label}`}
            >
              <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl shrink-0 ${it.accent ? 'bg-[#F05D5E]/10 text-[#F05D5E]' : 'bg-slate-100 text-slate-700'}`}>
                <it.icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-heading font-bold leading-tight truncate">{it.value}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{it.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
