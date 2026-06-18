import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Search, Calendar, Sparkles, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

const STORAGE_KEY = 'bookvia.onboarding.shown';

/**
 * First-time client onboarding — 3 simple steps shown the very first time a
 * client logs in (or registers and lands on /search). Persisted in
 * localStorage so it never shows twice.
 *
 * Skip and "Got it" both mark it as completed.
 */
export default function ClientOnboardingTour() {
  const { language } = useI18n();
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const t = (es, en) => (language === 'es' ? es : en);

  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  // Only for logged-in clients (not businesses or admin) and only once
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return;
    if (user?.role && user.role !== 'user') return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch { /* ignore */ }
    const timer = setTimeout(() => setVisible(true), 700);
    return () => clearTimeout(timer);
  }, [isAuthenticated, user, loading]);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  const steps = [
    {
      icon: <Search className="h-7 w-7" />,
      title: t('Encuentra el servicio que necesitas', 'Find the service you need'),
      body: t(
        'Busca por categoria, barrio o nombre del negocio. Filtra por precio, calificacion o cercania para encontrar lo que mejor te queda.',
        'Search by category, neighborhood or business name. Filter by price, rating or proximity to find the best match.'
      ),
    },
    {
      icon: <Calendar className="h-7 w-7" />,
      title: t('Elige fecha y hora en segundos', 'Pick date and time in seconds'),
      body: t(
        'Cada negocio te muestra sus horarios disponibles en tiempo real. Sin llamadas, sin esperar respuesta. Recibes la confirmacion al instante.',
        'Each business shows their available times in real time. No calls, no waiting for an answer. Instant confirmation.'
      ),
    },
    {
      icon: <Sparkles className="h-7 w-7" />,
      title: t('Listo. Te recordamos antes', 'Done. We remind you before'),
      body: t(
        'Te llega correo y notificacion para que no se te olvide. Despues puedes calificar tu experiencia y ganar puntos para futuras reservas.',
        'You get email and notification so you do not forget. After, you can rate your experience and earn points for future bookings.'
      ),
    },
  ];

  if (!visible) return null;
  const cur = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      data-testid="client-onboarding-tour"
    >
      <div className="w-full max-w-md bg-background rounded-2xl shadow-2xl overflow-hidden">
        {/* Header / progress */}
        <div className="relative px-6 pt-5">
          <button
            onClick={finish}
            className="absolute top-3 right-3 p-1.5 rounded-full text-muted-foreground hover:bg-muted"
            data-testid="onboarding-skip-btn"
            aria-label="Skip onboarding"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5 mb-5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-[#F05D5E]' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6">
          <div className="h-14 w-14 rounded-2xl bg-[#F05D5E]/10 text-[#F05D5E] flex items-center justify-center mb-4">
            {cur.icon}
          </div>
          <h2 className="text-xl font-heading font-bold mb-2" data-testid={`onboarding-step-${step + 1}-title`}>
            {cur.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{cur.body}</p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={finish}
            data-testid="onboarding-skip-text-btn"
          >
            {t('Saltar', 'Skip')}
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                data-testid="onboarding-back-btn"
              >
                {t('Atras', 'Back')}
              </Button>
            )}
            {isLast ? (
              <Button
                className="btn-coral"
                size="sm"
                onClick={() => { finish(); navigate('/search'); }}
                data-testid="onboarding-finish-btn"
              >
                {t('Empezar a buscar', 'Start searching')}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button
                className="btn-coral"
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                data-testid="onboarding-next-btn"
              >
                {t('Siguiente', 'Next')}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
