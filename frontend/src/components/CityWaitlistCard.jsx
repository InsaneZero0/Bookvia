import { useState, useEffect } from 'react';
import { MapPin, Sparkles, Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import api from '@/lib/api';
import { toast } from 'sonner';

/**
 * CityWaitlistCard
 *
 * Lead-capture card shown when search returns zero businesses for a
 * specific city. Anchors the brand promise ("estamos expandiendo") and
 * turns an otherwise-lost visitor into a nurture email.
 *
 * Props:
 *   city?: string          - resolved city name to personalise copy
 *   country_code?: string  - ISO code, defaults to MX
 *   categoryId?: string    - optional context on category being searched
 *   source?: string        - analytics tag (e.g. "search_empty", "home_no_city")
 */
export function CityWaitlistCard({ city, country_code = 'MX', categoryId, source = 'search_empty' }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [already, setAlready] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let abort = false;
    api.get('/waitlist/stats', { params: { country_code } })
      .then(res => { if (!abort) setStats(res.data); })
      .catch(() => {});
    return () => { abort = true; };
  }, [country_code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !city) return;
    setSubmitting(true);
    try {
      const res = await api.post('/waitlist', {
        email: email.trim(),
        city,
        country_code,
        category_id: categoryId || null,
        source,
      });
      setDone(true);
      setAlready(!!res.data.already_subscribed);
    } catch (err) {
      toast.error(err?.response?.data?.detail?.[0]?.msg || t('No se pudo registrar, intenta de nuevo.'));
    }
    setSubmitting(false);
  };

  const cityWaiting = stats?.top_cities?.find(c => c.city?.toLowerCase() === city?.toLowerCase())?.count || 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#fcf7ba]/40 via-white to-[#F05D5E]/5 p-6 sm:p-8 text-center"
      data-testid="city-waitlist-card"
    >
      <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-4">
        {done ? <CheckCircle2 className="h-7 w-7 text-emerald-400" /> : <MapPin className="h-7 w-7 text-[#F05D5E]" />}
      </div>

      {!done ? (
        <>
          <h2 className="font-heading text-xl sm:text-2xl font-bold mb-2 leading-tight">
            {city
              ? `${t('Aun no tenemos negocios en')} ${city}`
              : t('Selecciona tu ciudad')}
          </h2>
          <p className="text-sm text-muted-foreground mb-1 max-w-md mx-auto">
            {t('Estamos expandiendo rapido por todo Mexico. Dejanos tu correo y te avisamos apenas abramos tu zona.')}
          </p>
          {cityWaiting > 0 && (
            <p className="text-xs text-[#F05D5E] font-semibold mb-4 flex items-center justify-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {cityWaiting} {t('personas ya estan esperando en')} {city}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2 max-w-md mx-auto" data-testid="waitlist-form">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('tu@correo.com')}
                className="pl-9 h-11"
                data-testid="waitlist-email-input"
                disabled={submitting}
              />
            </div>
            <Button
              type="submit"
              className="h-11 bg-slate-900 hover:bg-slate-800 text-white shrink-0"
              disabled={submitting || !city}
              data-testid="waitlist-submit"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('Avisame')}
            </Button>
          </form>

          <p className="text-[11px] text-muted-foreground mt-3">
            {t('Sin spam, sin compartir tus datos. Puedes darte de baja cuando quieras.')}
          </p>
        </>
      ) : (
        <>
          <h2 className="font-heading text-xl sm:text-2xl font-bold mb-2 leading-tight text-emerald-700">
            {already ? t('Ya estabas en la lista') : t('Listo, estas en la lista')}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t('Te enviamos un correo apenas abramos negocios en')} <strong>{city}</strong>. {t('Mientras tanto, puedes explorar todos los negocios disponibles en otras zonas.')}
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => { setDone(false); setEmail(''); setAlready(false); }}
            data-testid="waitlist-another-city-btn"
          >
            {t('Registrar otra ciudad')}
          </Button>
        </>
      )}
    </div>
  );
}
