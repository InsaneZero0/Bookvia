import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Search, Calendar, Sparkles, Shield, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const STORAGE_KEY = 'bookvia-how-it-works-seen';

export function HowItWorksModal() {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage may be unavailable in private mode
    }
  }, []);

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const steps = [
    {
      icon: Search,
      title: language === 'es' ? 'Busca' : 'Search',
      desc: language === 'es'
        ? 'Encuentra el servicio que necesitas cerca de ti.'
        : 'Find the service you need near you.',
    },
    {
      icon: Calendar,
      title: language === 'es' ? 'Reserva' : 'Book',
      desc: language === 'es'
        ? 'Elige fecha y hora. Confirmación inmediata.'
        : 'Pick date and time. Instant confirmation.',
    },
    {
      icon: Sparkles,
      title: language === 'es' ? 'Disfruta' : 'Enjoy',
      desc: language === 'es'
        ? 'Llega tranquilo. Sin filas, sin esperas.'
        : 'Show up relaxed. No lines, no waits.',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="max-w-md sm:max-w-lg p-0 overflow-hidden border-0"
        data-testid="how-it-works-modal"
      >
        {/* Top color bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#F05D5E] via-[#fcf7ba] to-[#F05D5E]" />

        <div className="p-6 sm:p-8">
          <DialogHeader className="text-center sm:text-center mb-2">
            <DialogTitle className="font-heading text-2xl sm:text-3xl text-slate-900">
              {language === 'es' ? '¿Cómo funciona Bookvia?' : 'How does Bookvia work?'}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'es'
                ? 'Reservar nunca fue tan simple.'
                : 'Booking has never been this simple.'}
            </p>
          </DialogHeader>

          {/* Steps */}
          <div className="mt-6 space-y-4">
            {steps.map((step, idx) => (
              <div
                key={step.title}
                className="flex items-start gap-3 sm:gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                data-testid={`how-it-works-step-${idx + 1}`}
              >
                <div className="relative shrink-0">
                  <div className="h-11 w-11 rounded-xl bg-[#F05D5E]/10 flex items-center justify-center">
                    <step.icon className="h-5 w-5 text-[#F05D5E]" />
                  </div>
                  <span className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="font-heading font-bold text-base text-slate-900">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Trust note */}
          <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <Shield className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 leading-relaxed">
              <strong>
                {language === 'es' ? 'Cancelación gratis hasta 24h antes.' : 'Free cancellation up to 24h before.'}
              </strong>{' '}
              {language === 'es'
                ? 'Pagos seguros con Stripe. Reembolso garantizado si tu cita no se cumple.'
                : 'Secure payments with Stripe. Guaranteed refund if your appointment is not honored.'}
            </p>
          </div>

          {/* CTA */}
          <Button
            onClick={handleClose}
            className="w-full mt-6 btn-coral h-11 text-sm font-semibold"
            data-testid="how-it-works-close-btn"
          >
            {language === 'es' ? '¡Entendido, empezar!' : 'Got it, let\'s start!'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
