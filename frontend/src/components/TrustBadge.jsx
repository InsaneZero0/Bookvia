import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { businessesAPI } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const LABEL_COPY = {
  excellent: { es: 'Excelente', en: 'Excellent' },
  good: { es: 'Confiable', en: 'Trusted' },
  fair: { es: 'Aceptable', en: 'Fair' },
  poor: { es: 'Bajo', en: 'Low' },
};

const STYLE_BY_LABEL = {
  excellent: { Icon: ShieldCheck, ring: 'border-emerald-500 text-emerald-700 bg-emerald-50' },
  good: { Icon: Shield, ring: 'border-sky-500 text-sky-700 bg-sky-50' },
  fair: { Icon: ShieldAlert, ring: 'border-amber-500 text-amber-700 bg-amber-50' },
  poor: { Icon: ShieldX, ring: 'border-rose-500 text-rose-700 bg-rose-50' },
};

export function TrustBadge({ businessId, compact = false }) {
  const { language } = useI18n();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!businessId) return;
    businessesAPI.getTrustScore?.(businessId)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [businessId]);

  if (!data) return null;

  const style = STYLE_BY_LABEL[data.label] || STYLE_BY_LABEL.fair;
  const Icon = style.Icon;
  const label = (LABEL_COPY[data.label] || LABEL_COPY.fair)[language] || LABEL_COPY[data.label]?.es;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.ring}`}
        data-testid={`trust-badge-${businessId}`}
        title={`${language === 'es' ? 'Confianza' : 'Trust'}: ${data.score}/100`}
      >
        <Icon className="h-3 w-3" />
        {data.score}
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold cursor-help ${style.ring}`}
            data-testid={`trust-badge-${businessId}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label} · {data.score}
            {data.is_provisional && (
              <span className="text-[9px] uppercase opacity-70 ml-1">
                {language === 'es' ? 'nuevo' : 'new'}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-semibold mb-1">
            {language === 'es' ? 'Score de confianza Bookvia' : 'Bookvia trust score'}
          </p>
          <p className="text-xs">
            {language === 'es'
              ? `Calculado a partir de ${data.completed_appointments} citas completadas, ${data.review_count} reseñas, ${data.completion_rate_pct}% tasa de cumplimiento.`
              : `Computed from ${data.completed_appointments} completed bookings, ${data.review_count} reviews, ${data.completion_rate_pct}% completion rate.`}
          </p>
          {data.is_provisional && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {language === 'es'
                ? 'Score provisional: pocos datos aun.'
                : 'Provisional score: limited data so far.'}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default TrustBadge;
