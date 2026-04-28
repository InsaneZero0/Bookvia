import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, CheckCircle2, Shield, RotateCcw, Star, MapPin, Coins, BadgeCheck,
  Sparkles, X, Search, Calendar, ChevronRight, ShieldCheck,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { JsonLd, buildFaqSchema } from '@/components/JsonLd';

export default function BenefitsPage() {
  const { language } = useI18n();
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const t = (es, en) => (language === 'es' ? es : en);

  const benefits = [
    {
      icon: Clock,
      title: t('Reserva 24/7, sin llamadas', 'Book 24/7, no calls'),
      desc: t(
        'Olvidate de marcar y que no te contesten. Reserva a las 11 PM si quieres, en 30 segundos.',
        'No more dialing and waiting. Book at 11 PM if you want, in 30 seconds.'
      ),
    },
    {
      icon: CheckCircle2,
      title: t('Confirmacion inmediata', 'Instant confirmation'),
      desc: t(
        'Sabes al instante si tu cita esta confirmada. Sin "te aviso luego" del negocio.',
        'You know right away if your appointment is confirmed. No "I will let you know later".'
      ),
    },
    {
      icon: Shield,
      title: t('Pagos seguros con Stripe', 'Secure payments with Stripe'),
      desc: t(
        'Solo se cobra el anticipo cuando confirmas. Reembolso automatico si el negocio cancela.',
        'Deposit is only charged when you confirm. Automatic refund if the business cancels.'
      ),
    },
    {
      icon: RotateCcw,
      title: t('Cancelacion gratis hasta 24h antes', 'Free cancellation up to 24h before'),
      desc: t(
        'Plan flexible. Se te devuelve el 100% del anticipo, sin tramites.',
        'Flexible plan. You get 100% of your deposit back, no paperwork.'
      ),
    },
    {
      icon: Star,
      title: t('Resenas verificadas', 'Verified reviews'),
      desc: t(
        'Solo los clientes que reservaron por Bookvia pueden dejar resenas. Cero fakes.',
        'Only clients who booked through Bookvia can leave reviews. Zero fakes.'
      ),
    },
    {
      icon: MapPin,
      title: t('Encuentra cerca de ti', 'Find places near you'),
      desc: t(
        'Activa tu ubicacion y ve los negocios ordenados por distancia, con horarios reales.',
        'Enable your location and see businesses sorted by distance with real hours.'
      ),
    },
    {
      icon: Coins,
      title: t('Compara antes de reservar', 'Compare before booking'),
      desc: t(
        'Precios, fotos reales, horarios y resenas — todo en un solo lugar para decidir mejor.',
        'Prices, real photos, hours, and reviews — all in one place to decide better.'
      ),
    },
    {
      icon: BadgeCheck,
      title: t('Negocios verificados', 'Verified businesses'),
      desc: t(
        'Validamos identidad y RFC del dueno. Cada negocio tiene un codigo unico Bookvia.',
        'We validate the owner identity and tax ID. Each business has a unique Bookvia code.'
      ),
    },
  ];

  const compare = [
    { feature: t('Disponible 24/7', 'Available 24/7'), wa: false, bv: true },
    { feature: t('Confirmacion inmediata', 'Instant confirmation'), wa: false, bv: true },
    { feature: t('Recordatorio automatico', 'Automatic reminder'), wa: false, bv: true },
    { feature: t('Cancelacion con reembolso', 'Cancellation with refund'), wa: false, bv: true },
    { feature: t('Comparar precios facil', 'Easy price comparison'), wa: false, bv: true },
    { feature: t('Resenas verificadas', 'Verified reviews'), wa: false, bv: true },
    { feature: t('Pago seguro', 'Secure payment'), wa: false, bv: true },
    { feature: t('Historial de citas en un lugar', 'Appointment history in one place'), wa: false, bv: true },
  ];

  const steps = [
    { n: 1, icon: Search, t: t('Busca', 'Search'), d: t('Encuentra el servicio que necesitas cerca de ti.', 'Find the service you need near you.') },
    { n: 2, icon: Calendar, t: t('Reserva', 'Book'), d: t('Elige fecha y hora. Confirmacion inmediata.', 'Pick date and time. Instant confirmation.') },
    { n: 3, icon: Sparkles, t: t('Disfruta', 'Enjoy'), d: t('Llega tranquilo. Sin filas, sin esperas.', 'Show up relaxed. No lines, no waits.') },
  ];

  const faqs = [
    {
      q: t('¿Cómo se cobra el anticipo?', 'How is the deposit charged?'),
      a: t(
        'El anticipo se cobra solo cuando confirmas la reserva. Se procesa de forma segura por Stripe. Si el negocio cancela, se reembolsa automáticamente al método de pago original.',
        'The deposit is only charged when you confirm the booking. It is processed securely through Stripe. If the business cancels, it is automatically refunded to the original payment method.'
      ),
    },
    {
      q: t('¿Puedo cancelar mi cita?', 'Can I cancel my appointment?'),
      a: t(
        'Sí. Puedes cancelar gratis hasta 24 horas antes de tu cita y se te devuelve el 100% del anticipo. Después de ese plazo aplica la política de cancelación del negocio.',
        'Yes. You can cancel for free up to 24 hours before your appointment and get a 100% refund. After that, the business cancellation policy applies.'
      ),
    },
    {
      q: t('¿Y si el negocio no me atiende cuando llego?', 'What if the business does not honor my appointment?'),
      a: t(
        'Reembolso garantizado. Reportas el caso desde "Mis citas" y nuestro equipo procesa la devolución en menos de 48h hábiles.',
        'Guaranteed refund. Report the case from "My appointments" and our team processes the refund within 48 business hours.'
      ),
    },
    {
      q: t('¿Tengo que descargar una app?', 'Do I need to download an app?'),
      a: t(
        'No. Bookvia funciona desde tu navegador en celular o computadora. No ocupa espacio en tu teléfono ni te pide actualizaciones.',
        'No. Bookvia works from your browser on mobile or desktop. It takes no space on your phone and does not require updates.'
      ),
    },
    {
      q: t('¿Qué tan verificados están los negocios?', 'How verified are the businesses?'),
      a: t(
        'Validamos identidad del dueño, RFC y comprobante de domicilio antes de aprobar cada negocio. Cada uno recibe un código único Bookvia (BV-XXXXX) que aparece en su perfil.',
        'We validate the owner identity, tax ID, and proof of address before approving each business. Each one gets a unique Bookvia code (BV-XXXXX) shown in their profile.'
      ),
    },
    {
      q: t('¿Puedo dejar reseñas?', 'Can I leave reviews?'),
      a: t(
        'Sí, pero solo si reservaste por Bookvia y completaste tu cita. Esto evita reseñas falsas y asegura que cada estrella refleja una experiencia real.',
        'Yes, but only if you booked through Bookvia and completed your appointment. This prevents fake reviews and ensures every star reflects a real experience.'
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#fcf7ba]/40" data-testid="benefits-page">
      <JsonLd data={buildFaqSchema(faqs)} id="jsonld-benefits-faq" />
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#fcf7ba] via-[#fcf7ba]/70 to-white pt-20 pb-14">
        <div className="absolute top-10 -right-20 w-72 h-72 rounded-full bg-[#F05D5E]/10 blur-3xl" />
        <div className="container-app relative text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            {t('Beneficios para ti', 'Benefits for you')}
          </span>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl lg:text-6xl text-slate-900 leading-tight">
            {t('Reserva con confianza.', 'Book with confidence.')}
            <br />
            <span className="text-[#F05D5E]">{t('Reserva con Bookvia.', 'Book with Bookvia.')}</span>
          </h1>
          <p className="mt-6 text-lg text-slate-700 leading-relaxed max-w-2xl mx-auto">
            {t(
              'Todo lo que ganas al reservar tu proxima cita en Bookvia, en un solo vistazo.',
              'Everything you gain when you book your next appointment on Bookvia, at a glance.'
            )}
          </p>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-16 bg-white">
        <div className="container-app">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="bg-white rounded-2xl p-5 border border-border/50 hover:border-[#F05D5E]/40 hover:shadow-md transition-all"
                data-testid={`benefit-${b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              >
                <div className="h-11 w-11 rounded-xl bg-[#F05D5E]/10 flex items-center justify-center mb-3">
                  <b.icon className="h-5 w-5 text-[#F05D5E]" />
                </div>
                <h3 className="font-heading font-bold text-base text-slate-900 mb-1.5 leading-tight">
                  {b.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 bg-slate-50">
        <div className="container-app max-w-3xl">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-3">
              <BadgeCheck className="h-3.5 w-3.5" />
              {t('La diferencia', 'The difference')}
            </span>
            <h2 className="font-heading font-bold text-3xl text-slate-900">
              {t('Reservar por WhatsApp vs reservar con Bookvia', 'Booking by WhatsApp vs booking with Bookvia')}
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-border/50 overflow-hidden shadow-sm" data-testid="comparison-table">
            <div className="grid grid-cols-3 bg-slate-100 text-xs font-semibold uppercase tracking-wider">
              <div className="p-4 text-slate-600">{t('Caracteristica', 'Feature')}</div>
              <div className="p-4 text-center text-slate-600">{t('WhatsApp', 'WhatsApp')}</div>
              <div className="p-4 text-center text-[#F05D5E]">Bookvia</div>
            </div>
            {compare.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 text-sm ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}
              >
                <div className="p-4 text-slate-800 font-medium">{row.feature}</div>
                <div className="p-4 flex items-center justify-center">
                  {row.wa ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <X className="h-5 w-5 text-slate-300" />
                  )}
                </div>
                <div className="p-4 flex items-center justify-center bg-[#F05D5E]/5">
                  {row.bv ? (
                    <CheckCircle2 className="h-5 w-5 text-[#F05D5E]" />
                  ) : (
                    <X className="h-5 w-5 text-slate-300" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 Steps */}
      <section className="py-16 bg-white">
        <div className="container-app max-w-4xl">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              {t('Como funciona', 'How it works')}
            </span>
            <h2 className="font-heading font-bold text-3xl text-slate-900">
              {t('Tu cita en 3 pasos', 'Your appointment in 3 steps')}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.n} className="text-center" data-testid={`benefits-step-${s.n}`}>
                <div className="relative inline-flex items-center justify-center mb-4">
                  <div className="h-16 w-16 rounded-2xl bg-[#F05D5E]/10 flex items-center justify-center">
                    <s.icon className="h-7 w-7 text-[#F05D5E]" />
                  </div>
                  <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                    {s.n}
                  </span>
                </div>
                <h3 className="font-heading font-bold text-lg text-slate-900 mb-1.5">{s.t}</h3>
                <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="py-12 bg-slate-50 border-t border-border/40">
        <div className="container-app">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span><strong>{t('Pagos con Stripe', 'Stripe payments')}</strong></span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-emerald-600" />
              <span><strong>{t('Reembolso garantizado', 'Refund guaranteed')}</strong></span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600" />
              <span><strong>{t('Negocios verificados', 'Verified businesses')}</strong></span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span><strong>{t('Soporte en espanol', 'Spanish support')}</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-white border-t border-border/40">
        <div className="container-app max-w-3xl">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F05D5E] mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              {t('Preguntas frecuentes', 'Frequently asked questions')}
            </span>
            <h2 className="font-heading font-bold text-3xl text-slate-900">
              {t('Las dudas mas comunes, resueltas.', 'The most common questions, answered.')}
            </h2>
          </div>
          <div className="space-y-3" data-testid="benefits-faq-list">
            {faqs.map((f, idx) => (
              <details
                key={f.q}
                className="group bg-white rounded-xl border border-border/50 hover:border-[#F05D5E]/30 transition-colors overflow-hidden"
                data-testid={`faq-item-${idx}`}
              >
                <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3 text-sm font-medium text-slate-900 hover:bg-slate-50">
                  <span className="flex-1">{f.q}</span>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-open:rotate-90 transition-transform shrink-0" />
                </summary>
                <div className="px-5 pb-5 pt-0 text-sm text-slate-600 leading-relaxed border-t border-border/30">
                  <p className="pt-3">{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#1a2844] relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-[#F05D5E]/20 blur-3xl" />
        <div className="container-app relative text-center max-w-2xl mx-auto">
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-white mb-4">
            {t('Tu proxima cita esta a 30 segundos.', 'Your next appointment is 30 seconds away.')}
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
              data-testid="benefits-cta-register"
            >
              {t('Crear cuenta gratis', 'Create free account')}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/20 transition-colors"
              data-testid="benefits-cta-explore"
            >
              <Search className="h-4 w-4" />
              {t('Explorar negocios', 'Explore businesses')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
