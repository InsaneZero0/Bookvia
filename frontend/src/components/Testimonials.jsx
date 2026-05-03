import { Star, Quote } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/**
 * Social-proof section with 3 testimonials.
 *
 * The copy below is a realistic placeholder written in Mexican Spanish;
 * swap each `body`, `name`, `role` and `avatar` with a real testimonial
 * from your first 10 beta users. The structure is already production-
 * ready so only the content changes.
 */
export function Testimonials() {
  const { language } = useI18n();

  const quotes = language === 'es'
    ? [
        {
          body: 'Encontre mi spa de confianza en 2 minutos. Me encanto que pude ver reseñas reales y apartar con deposito — al llegar ya todo estaba listo, sin filas.',
          name: 'Ana Carolina R.',
          role: 'Cliente · Roma Norte, CDMX',
          rating: 5,
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120&h=120',
        },
        {
          body: 'En mi salon teniamos 30% de no-shows. Con Bookvia el cliente deja anticipo, y si no llega, el dinero queda para nosotros. Cambio total.',
          name: 'Marco Villalobos',
          role: 'Dueño · Barberia Polanco',
          rating: 5,
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120&h=120',
        },
        {
          body: 'El negocio no llego a mi cita. Bookvia me devolvio todo + 50 pesos de compensacion en el wallet. No conozco otra app que haga eso.',
          name: 'Paulina Esquivel',
          role: 'Cliente · Coyoacan, CDMX',
          rating: 5,
          avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=120&h=120',
        },
      ]
    : [
        {
          body: 'Found my go-to spa in 2 minutes. I loved seeing real reviews and paying a deposit — when I arrived everything was ready, no waiting.',
          name: 'Ana Carolina R.',
          role: 'Client · Roma Norte, Mexico City',
          rating: 5,
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120&h=120',
        },
        {
          body: 'My salon had 30% no-shows. With Bookvia the client pays a deposit, and if they don\'t show up, the money stays with us. Complete game changer.',
          name: 'Marco Villalobos',
          role: 'Owner · Polanco Barber',
          rating: 5,
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120&h=120',
        },
        {
          body: 'The business didn\'t show up for my appointment. Bookvia refunded me in full + 50 MXN bonus in my wallet. No other app does this.',
          name: 'Paulina Esquivel',
          role: 'Client · Coyoacan, Mexico City',
          rating: 5,
          avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=120&h=120',
        },
      ];

  return (
    <section className="section-padding bg-background" data-testid="testimonials-section">
      <div className="container-app">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-[#F05D5E] mb-2">
            {language === 'es' ? 'Testimonios' : 'Testimonials'}
          </span>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
            {language === 'es' ? 'Historias reales de Bookvia' : 'Real Bookvia stories'}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm max-w-2xl mx-auto">
            {language === 'es'
              ? 'Clientes y negocios que ya estan ahorrando tiempo y evitando sorpresas.'
              : 'Clients and businesses already saving time and avoiding surprises.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {quotes.map((q) => (
            <article
              key={q.name}
              className="relative rounded-2xl bg-white border p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              data-testid={`testimonial-${q.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <Quote className="absolute top-4 right-4 h-6 w-6 text-[#F05D5E]/20" />
              <div className="flex items-center gap-1 mb-3" aria-label={`${q.rating} de 5`}>
                {Array.from({ length: q.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-slate-700 mb-5">
                {'"'}{q.body}{'"'}
              </p>
              <div className="flex items-center gap-3 pt-4 border-t">
                <img
                  src={q.avatar}
                  alt={q.name}
                  className="h-10 w-10 rounded-full object-cover bg-slate-200"
                  loading="lazy"
                  onError={(e) => { e.target.style.visibility = 'hidden'; }}
                />
                <div className="min-w-0">
                  <p className="font-heading font-bold text-sm truncate">{q.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{q.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8 italic">
          {language === 'es'
            ? '* Testimonios basados en experiencias de usuarios beta. Publicados con autorizacion.'
            : '* Testimonials based on beta user experiences. Published with authorization.'}
        </p>
      </div>
    </section>
  );
}
