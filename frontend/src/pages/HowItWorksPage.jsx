import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, CalendarCheck, CreditCard, Smile, Sparkles, ShieldCheck, Bell } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useI18n } from '@/lib/i18n';

/**
 * Public marketing page — "How it works" for end users (clients).
 * Counterpart to /for-business (the businesses funnel).
 *
 * Goal: convert a cold visitor into a registered client in 30 seconds.
 */
export default function HowItWorksPage() {
  const { language } = useI18n();
  const t = (es, en) => (language === 'es' ? es : en);

  const steps = [
    {
      icon: <Search className="h-7 w-7" />,
      title: t('1. Encuentra lo que necesitas', '1. Find what you need'),
      body: t(
        'Busca por servicio o categoria (barberia, spa, dentista, gimnasio...). Filtra por ubicacion, precio, calificacion. Ve fotos reales y opiniones verificadas.',
        'Search by service or category (barber, spa, dentist, gym...). Filter by location, price, rating. See real photos and verified reviews.'
      ),
    },
    {
      icon: <CalendarCheck className="h-7 w-7" />,
      title: t('2. Elige fecha y hora', '2. Pick date and time'),
      body: t(
        'Selecciona el horario disponible que mas te convenga. Sin llamadas, sin esperas. Si el negocio tiene varios profesionales, eliges con quien atenderte.',
        'Pick an available time that works for you. No phone calls, no waiting. If the business has multiple pros, pick who you want.'
      ),
    },
    {
      icon: <CreditCard className="h-7 w-7" />,
      title: t('3. Confirma y paga (o paga en el local)', '3. Confirm and pay (or pay at the location)'),
      body: t(
        'Si el negocio pide anticipo, pagas una parte para apartar tu lugar con tarjeta o transferencia. Si no, simplemente reservas y pagas en el local. Tu cita queda confirmada al instante.',
        'If the business requires a deposit, you pay part to hold your slot by card or transfer. If not, you just book and pay at the location. Your slot is confirmed instantly.'
      ),
    },
    {
      icon: <Smile className="h-7 w-7" />,
      title: t('4. Disfruta el servicio', '4. Enjoy the service'),
      body: t(
        'Recibes correo y notificacion con todos los detalles. Te recordamos antes para que no se te olvide. Despues puedes calificar al negocio y ayudar a otros.',
        'You get email and notification with all details. We remind you so you do not forget. After, you can rate the business and help others.'
      ),
    },
  ];

  const perks = [
    { icon: <ShieldCheck className="h-5 w-5" />, title: t('Pagos seguros', 'Secure payments'), body: t('Procesado por Stripe (PCI Nivel 1). Tu tarjeta nunca se guarda en nuestros servidores.', 'Powered by Stripe (PCI Level 1). Your card never lives on our servers.') },
    { icon: <Bell className="h-5 w-5" />, title: t('Recordatorios automaticos', 'Automatic reminders'), body: t('Te recordamos 24 horas antes y 1 hora antes para que llegues a tiempo.', 'We remind you 24 hours before and 1 hour before so you arrive on time.') },
    { icon: <Sparkles className="h-5 w-5" />, title: t('Solo negocios verificados', 'Verified businesses only'), body: t('Cada negocio en Bookvia paso un proceso de verificacion de identidad y documentos.', 'Every business on Bookvia goes through identity and document verification.') },
  ];

  return (
    <div className="min-h-screen bg-background pt-20 pb-20 px-4">
      <SEOHead
        title={t('Como funciona Bookvia', 'How Bookvia works')}
        description={t(
          'Reserva citas en barberias, spas, gimnasios y servicios profesionales en 3 pasos. Confirmacion instantanea, pagos seguros, recordatorios automaticos.',
          'Book appointments at barbers, spas, gyms and professional services in 3 steps. Instant confirmation, secure payments, automatic reminders.'
        )}
        canonical="https://www.bookvia.app/como-funciona"
      />
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <section className="text-center mb-16">
          <p className="text-sm font-semibold text-[#F05D5E] mb-3 tracking-wide uppercase">{t('Sin llamadas. Sin esperas.', 'No calls. No waiting.')}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold leading-tight mb-4">
            {t('Reserva en 4 pasos', 'Book in 4 steps')}
            <span className="text-[#F05D5E]">.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t(
              'Desde una barberia hasta un dentista. Encuentra negocios verificados cerca de ti y agenda en segundos.',
              'From a barber to a dentist. Find verified businesses near you and book in seconds.'
            )}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/search">
              <Button className="btn-coral" size="lg" data-testid="howitworks-cta-search">
                {t('Buscar un servicio', 'Find a service')}
              </Button>
            </Link>
            <Link to="/register">
              <Button variant="outline" size="lg" data-testid="howitworks-cta-register">
                {t('Crear cuenta gratis', 'Create free account')}
              </Button>
            </Link>
          </div>
        </section>

        {/* Steps */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {steps.map((s, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow" data-testid={`howitworks-step-${i + 1}`}>
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-xl bg-[#F05D5E]/10 text-[#F05D5E] flex items-center justify-center mb-4">
                  {s.icon}
                </div>
                <h3 className="text-lg font-heading font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Perks */}
        <section className="bg-muted/40 rounded-2xl p-8 mb-16">
          <h2 className="text-2xl font-heading font-bold text-center mb-8">{t('Por que Bookvia', 'Why Bookvia')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {perks.map((p, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex h-12 w-12 rounded-full bg-white items-center justify-center text-[#F05D5E] mb-3">
                  {p.icon}
                </div>
                <h3 className="font-semibold mb-1">{p.title}</h3>
                <p className="text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="text-center py-8 border-t">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold mb-3">{t('Listo para tu primera reserva?', 'Ready for your first booking?')}</h2>
          <p className="text-muted-foreground mb-6">{t('Es gratis y solo toma 1 minuto.', 'It is free and takes 1 minute.')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/search">
              <Button className="btn-coral" size="lg" data-testid="howitworks-bottom-cta">
                {t('Explorar negocios', 'Browse businesses')}
              </Button>
            </Link>
            <Link to="/help">
              <Button variant="ghost" size="lg" data-testid="howitworks-help-link">
                {t('Tengo otra pregunta', 'I have another question')}
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
