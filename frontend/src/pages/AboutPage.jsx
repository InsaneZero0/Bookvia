import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Target,
  Heart,
  Zap,
  Shield,
  Globe,
  ChevronRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { JsonLd, organizationSchema } from '@/components/JsonLd';

export default function AboutPage() {
  const { language } = useI18n();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const t = (es, en) => (language === 'es' ? es : en);

  const values = [
    {
      icon: Heart,
      title: t('Pasión por el servicio', 'Service-first mindset'),
      description: t(
        'Creemos que cada cita cuenta. Diseñamos cada flujo pensando en que tanto el cliente como el negocio terminen contentos.',
        'Every appointment counts. We design every flow so both the client and the business walk away happy.'
      ),
    },
    {
      icon: Shield,
      title: t('Confianza y seguridad', 'Trust and security'),
      description: t(
        'Verificamos la identidad de cada negocio antes de aprobarlo. Los pagos viajan por Stripe, nunca tocamos tu tarjeta.',
        'We verify each business before approving it. Payments go through Stripe — we never see your card.'
      ),
    },
    {
      icon: Zap,
      title: t('Simplicidad antes que adornos', 'Simplicity over flair'),
      description: t(
        'Reservar debe tomar 30 segundos, no 30 minutos. Si una función estorba al usuario, la quitamos.',
        'Booking should take 30 seconds, not 30 minutes. If a feature gets in the way, we remove it.'
      ),
    },
    {
      icon: Globe,
      title: t('Hecho en México, para América', 'Built in Mexico, for the Americas'),
      description: t(
        'Empezamos en México y crecemos hacia Estados Unidos. Pesos y dólares, español e inglés, sin perder identidad.',
        'We start in Mexico and grow toward the United States. Pesos and dollars, Spanish and English, no identity lost.'
      ),
    },
  ];

  const stack = [
    t('Pagos con Stripe (PCI DSS Level 1)', 'Stripe payments (PCI DSS Level 1)'),
    t('Hosting en Cloudflare + Vercel', 'Cloudflare + Vercel hosting'),
    t('Datos cifrados en tránsito y en reposo', 'Data encrypted in transit and at rest'),
    t('Cumplimiento con la LFPDPPP (México)', 'Compliant with LFPDPPP (Mexico)'),
  ];

  return (
    <div className="min-h-screen bg-[#fcf7ba]/40" data-testid="about-page">
      <JsonLd data={organizationSchema} id="jsonld-about-org" />
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#fcf7ba] via-[#fcf7ba]/70 to-white pt-20 pb-16">
        <div className="absolute top-10 -right-20 w-72 h-72 rounded-full bg-[#F05D5E]/10 blur-3xl" />
        <div className="container-app relative">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              {t('Sobre Bookvia', 'About Bookvia')}
            </span>
            <h1 className="font-heading font-bold text-4xl sm:text-5xl lg:text-6xl text-slate-900 leading-tight">
              {t(
                'Reservar servicios profesionales debería ser tan fácil como pedir un Uber.',
                'Booking professional services should be as easy as ordering an Uber.'
              )}
            </h1>
            <p className="mt-6 text-lg text-slate-700 leading-relaxed max-w-2xl">
              {t(
                'Bookvia es la plataforma que conecta a clientes con negocios de servicios en México y Estados Unidos. Reservas en segundos, pagos seguros y la confianza de saber con quién agendas.',
                'Bookvia is the platform that connects clients with service businesses in Mexico and the United States. Book in seconds, pay securely, and know exactly who you are scheduling with.'
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-white">
        <div className="container-app grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-3">
              <Target className="h-3.5 w-3.5" />
              {t('Nuestra misión', 'Our mission')}
            </span>
            <h2 className="font-heading font-bold text-3xl text-slate-900 mb-4">
              {t(
                'Que ningún cliente pierda una cita por un mal sistema de reservas.',
                'No client should miss an appointment because of a bad booking system.'
              )}
            </h2>
            <p className="text-slate-700 leading-relaxed">
              {t(
                'Cuando un cliente quiere reservar un servicio, suele perder tiempo llamando, esperando respuesta en WhatsApp o llegando al local sin la garantía de que lo atiendan. Cuando un negocio quiere agendar bien, suele depender de una libreta y un celular que no para. Bookvia existe para que ese proceso desaparezca: el cliente reserva en segundos, el negocio recibe la cita organizada, y ambos quedan tranquilos.',
                'When a client wants to book a service, they often waste time calling, waiting on WhatsApp, or showing up without a guarantee. When a business wants to manage their schedule, they often rely on a paper book and a phone that never stops ringing. Bookvia exists to make that process disappear: the client books in seconds, the business receives the appointment cleanly, and both stay at ease.'
              )}
            </p>
          </div>
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-3">
              <Heart className="h-3.5 w-3.5" />
              {t('Nuestra historia', 'Our story')}
            </span>
            <h2 className="font-heading font-bold text-3xl text-slate-900 mb-4">
              {t(
                'Nació de un problema real, no de una hoja en blanco.',
                'Born from a real problem, not from a blank page.'
              )}
            </h2>
            <p className="text-slate-700 leading-relaxed">
              {t(
                'El proyecto comenzó en 2025 después de pasar demasiadas horas tratando de coordinar una cita en un salón de la ciudad. Llamadas que nunca contestaban, mensajes que se perdían, anticipos que no quedaban claros. Si esto pasaba en un solo servicio, pasaba en miles. La idea fue simple: una plataforma donde reservar un servicio profesional fuera tan natural como buscar un restaurante en Google. Hoy seguimos puliendo cada detalle con esa misma intención.',
                'The project started in 2025 after spending too many hours trying to schedule an appointment at a salon in town. Calls that were never answered, messages that got lost, deposits that were unclear. If it was happening for one service, it was happening for thousands. The idea was simple: a platform where booking a professional service felt as natural as searching for a restaurant on Google. We keep polishing every detail with that same intent.'
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-slate-50">
        <div className="container-app">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              {t('Lo que nos mueve', 'What drives us')}
            </span>
            <h2 className="font-heading font-bold text-3xl text-slate-900">
              {t('Cuatro principios, sin negociación.', 'Four non-negotiable principles.')}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {values.map((v) => (
              <div
                key={v.title}
                className="bg-white rounded-2xl p-6 border border-border/50 hover:border-[#F05D5E]/40 hover:shadow-md transition-all"
                data-testid={`value-${v.title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="h-11 w-11 rounded-xl bg-[#F05D5E]/10 flex items-center justify-center mb-4">
                  <v.icon className="h-5 w-5 text-[#F05D5E]" />
                </div>
                <h3 className="font-heading font-bold text-base text-slate-900 mb-2">{v.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / Stack */}
      <section className="py-16 bg-white">
        <div className="container-app max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-3">
              <Shield className="h-3.5 w-3.5" />
              {t('Sobre la seguridad', 'On security')}
            </span>
            <h2 className="font-heading font-bold text-3xl text-slate-900">
              {t(
                'Tu información se trata con el mismo cuidado que tu dinero.',
                'Your information is treated with the same care as your money.'
              )}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {stack.map((line) => (
              <div
                key={line}
                className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-sm text-slate-800 font-medium">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#1a2844] relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-[#F05D5E]/20 blur-3xl" />
        <div className="container-app relative text-center max-w-2xl mx-auto">
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-white mb-4">
            {t('¿Listo para reservar tu próxima cita?', 'Ready to book your next appointment?')}
          </h2>
          <p className="text-white/80 mb-8">
            {t(
              'Crea tu cuenta gratis y descubre los negocios cerca de ti.',
              'Create your free account and discover the businesses near you.'
            )}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-[#F05D5E] hover:bg-[#F05D5E]/90 text-white font-semibold text-sm transition-colors"
              data-testid="about-cta-register"
            >
              {t('Crear cuenta gratis', 'Create free account')}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              to="/for-business"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/20 transition-colors"
              data-testid="about-cta-business"
            >
              <Building2 className="h-4 w-4" />
              {t('Soy un negocio', 'I am a business')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
