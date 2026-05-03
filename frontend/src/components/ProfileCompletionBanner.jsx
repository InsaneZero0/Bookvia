import { CheckCircle2, Circle, ChevronRight, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

/**
 * Inline progress banner for the Business Dashboard overview tab.
 * Drives business activation by showing a checklist + % complete with
 * contextual CTAs that switch the parent tab.
 *
 * Auto-hides when `data.is_complete === true`.
 */
export function ProfileCompletionBanner({ data, onGoToTab }) {
  const { language } = useI18n();

  if (!data || data.is_complete) return null;

  const pct = data.percentage ?? 0;
  const firstPending = data.items?.find((i) => !i.done);

  const tone = pct < 40
    ? { ring: 'from-rose-500 to-orange-500', text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' }
    : pct < 80
      ? { ring: 'from-amber-500 to-yellow-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' }
      : { ring: 'from-emerald-500 to-teal-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${tone.border} ${tone.bg} p-4 sm:p-5 mb-6`}
      data-testid="profile-completion-banner"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {/* Radial progress */}
          <div className="relative h-16 w-16 shrink-0">
            <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-slate-200" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none" stroke="url(#grad)" strokeWidth="3"
                strokeDasharray={`${pct}, 100`} strokeLinecap="round"
              />
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" className={tone.ring.split(' ')[0].replace('from-', 'text-')} stopColor="currentColor" />
                  <stop offset="100%" className={tone.ring.split(' ')[1].replace('to-', 'text-')} stopColor="currentColor" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`font-heading font-bold text-sm ${tone.text}`}>{pct}%</span>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-base sm:text-lg font-bold flex items-center gap-2">
              <Sparkles className={`h-4 w-4 ${tone.text}`} />
              {language === 'es' ? 'Completa tu perfil para recibir mas reservas' : 'Complete your profile to get more bookings'}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {language === 'es'
                ? `${data.done_count} de ${data.total_count} pasos listos. Los negocios al 100% reciben hasta 3x mas reservas.`
                : `${data.done_count} of ${data.total_count} steps done. 100% profiles get up to 3x more bookings.`}
            </p>
          </div>
        </div>
        {firstPending && (
          <Button
            onClick={() => onGoToTab?.(firstPending.action_path)}
            className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white"
            data-testid="profile-completion-cta"
          >
            {language === 'es' ? firstPending.label_es : firstPending.label_en}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>

      {/* Checklist */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {data.items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => !it.done && onGoToTab?.(it.action_path)}
            disabled={it.done}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              it.done
                ? 'bg-white/60 text-slate-500 cursor-default'
                : 'bg-white hover:bg-white/90 border border-slate-200 hover:border-slate-300'
            }`}
            data-testid={`completion-item-${it.key}`}
          >
            {it.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-slate-400 shrink-0" />
            )}
            <span className={`truncate ${it.done ? 'line-through' : ''}`}>
              {language === 'es' ? it.label_es : it.label_en}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
