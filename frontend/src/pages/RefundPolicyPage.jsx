import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Clock, Ban, RefreshCw, AlertCircle, Mail } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useI18n } from '@/lib/i18n';

/**
 * Public legal page — Refund & no-show policy for clients and businesses.
 * Required by Profeco (MX) before charging consumers online.
 * Linked from Footer, checkout flow and HelpPage.
 */
export default function RefundPolicyPage() {
  const { language } = useI18n();
  const t = (es, en) => (language === 'es' ? es : en);

  return (
    <div className="min-h-screen bg-background pt-20 pb-20 px-4">
      <SEOHead
        title={t('Politica de cancelaciones y reembolsos', 'Cancellation & refund policy')}
        description={t(
          'Reglas claras de cancelacion, reembolsos, no-shows y disputas en Bookvia.',
          'Clear rules for cancellation, refunds, no-shows and disputes on Bookvia.'
        )}
        canonical="https://www.bookvia.app/refund-policy"
      />
      <div className="max-w-3xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-3 flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-[#F05D5E]" />
            {t('Politica de cancelaciones y reembolsos', 'Cancellation & refund policy')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('Vigencia:', 'Effective:')} <strong>Junio 2026</strong> · {t('Bookvia opera bajo la legislacion mexicana (LFPC).', 'Bookvia operates under Mexican law (LFPC).')}
          </p>
        </header>

        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <CardContent className="p-5 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-950 leading-relaxed">
              <p className="font-semibold">{t('Importante', 'Important')}</p>
              <p className="mt-1">{t(
                'Cada negocio configura su propia ventana de cancelacion (24h por defecto). Las reglas exactas se muestran al confirmar tu reserva. Si pagaste un anticipo en linea, aplican las condiciones de esta politica.',
                'Each business sets its own cancellation window (24h by default). Exact rules are shown when you confirm your booking. If you paid a deposit online, the conditions of this policy apply.'
              )}</p>
            </div>
          </CardContent>
        </Card>

        <Section icon={<Clock className="h-5 w-5" />} title={t('1. Cancelaciones por el cliente', '1. Cancellations by the client')}>
          <ul className="space-y-2 list-disc pl-5 text-sm">
            <li>{t('Si cancelas dentro del margen del negocio (por defecto 24 horas antes), recibes el 100% del anticipo de regreso, menos la comision fija de $8 MXN.', 'If you cancel within the business window (default 24 hours before), you get 100% of your deposit back, minus the $8 MXN flat fee.')}</li>
            <li>{t('Si cancelas fuera del margen, el anticipo se queda con el negocio como compensacion por el horario reservado.', 'If you cancel outside the window, the deposit stays with the business as compensation for the reserved slot.')}</li>
            <li>{t('Para reagendar sin perder anticipo, usa "Mis citas" > "Reagendar" antes de que termine la ventana de cancelacion.', 'To reschedule without losing your deposit, use "My bookings" > "Reschedule" before the cancellation window ends.')}</li>
            <li>{t('Los reembolsos llegan en 5-7 dias habiles al metodo de pago original.', 'Refunds arrive in 5-7 business days to your original payment method.')}</li>
          </ul>
        </Section>

        <Section icon={<Ban className="h-5 w-5" />} title={t('2. No-show (no se presento a la cita)', '2. No-show (did not attend)')}>
          <ul className="space-y-2 list-disc pl-5 text-sm">
            <li>{t('Si pagaste anticipo y no llegas a tu cita sin avisar, el anticipo NO se reembolsa. El negocio bloqueo ese horario para ti.', 'If you paid a deposit and do not show up without notice, the deposit is NOT refunded. The business held that slot for you.')}</li>
            <li>{t('Si fue cobro en local y no llegas, el negocio puede reportarte. 3 no-shows confirmados afectan tu historial publico en Bookvia.', 'If it was pay-at-location and you do not show up, the business may report you. 3 confirmed no-shows affect your public Bookvia history.')}</li>
            <li>{t('Avisar al negocio aunque sea con 1 hora de anticipacion via telefono o WhatsApp evita que se marque como no-show. Si llegas tarde, comunicate con el negocio para ver si te pueden atender.', 'Calling/WhatsApping the business with at least 1 hour notice avoids the no-show mark. If you arrive late, contact the business to check if they can still attend you.')}</li>
          </ul>
        </Section>

        <Section icon={<RefreshCw className="h-5 w-5" />} title={t('3. Cancelacion por el negocio', '3. Cancellation by the business')}>
          <ul className="space-y-2 list-disc pl-5 text-sm">
            <li>{t('Si el negocio cancela tu cita por cualquier motivo (sin que sea tu falta), recibes el 100% del anticipo Y la comision de $8 MXN de regreso.', 'If the business cancels your booking (not your fault), you get 100% of the deposit AND the $8 MXN fee back.')}</li>
            <li>{t('El reembolso es automatico al confirmar la cancelacion. No tienes que hacer nada.', 'The refund is automatic when cancellation is confirmed. No action required.')}</li>
            <li>{t('Si el negocio cancela mas de 3 veces sin justificacion, Bookvia investiga y puede suspender al negocio.', 'If a business cancels more than 3 times without justification, Bookvia investigates and may suspend them.')}</li>
          </ul>
        </Section>

        <Section icon={<AlertCircle className="h-5 w-5" />} title={t('4. Disputas (problemas en el servicio)', '4. Disputes (issues with the service)')}>
          <ul className="space-y-2 list-disc pl-5 text-sm">
            <li>{t('Si el servicio no fue como se anunciaba, intenta resolverlo primero con el negocio.', 'If the service was not as advertised, try to resolve it with the business first.')}</li>
            <li>{t('Si no llegan a un acuerdo, envia un correo a contacto@bookvia.com en un plazo maximo de 7 dias desde la cita, con: nombre del negocio, fecha, hora, descripcion del problema y fotos si aplica.', 'If you cannot reach an agreement, email contacto@bookvia.com within 7 days of the appointment with: business name, date, time, description and photos if applicable.')}</li>
            <li>{t('Bookvia mediara dentro de 3 dias habiles. La decision considera ambas partes y la evidencia presentada.', 'Bookvia mediates within 3 business days. The decision considers both parties and the evidence provided.')}</li>
            <li>{t('Reembolsos por disputas no son automaticos: se evaluan caso por caso.', 'Refunds for disputes are not automatic: evaluated case by case.')}</li>
          </ul>
        </Section>

        <Section icon={<ShieldCheck className="h-5 w-5" />} title={t('5. Comisiones', '5. Fees')}>
          <ul className="space-y-2 list-disc pl-5 text-sm">
            <li><strong>$8 MXN</strong> {t('por transaccion: comision fija de Bookvia (procesamiento de pago y comprobante). NO se reembolsa en cancelaciones por el cliente.', 'per transaction: Bookvia flat fee (payment processing & receipt). NOT refunded on client-side cancellations.')}</li>
            <li><strong>8.5%</strong> {t('comision al negocio sobre cada anticipo (no afecta al cliente).', 'commission to the business on each deposit (does not affect the client).')}</li>
            <li>{t('Sin cargos ocultos. El total exacto se muestra antes de confirmar el pago.', 'No hidden charges. The exact total is shown before confirming payment.')}</li>
          </ul>
        </Section>

        <Section icon={<Mail className="h-5 w-5" />} title={t('6. Contacto', '6. Contact')}>
          <p className="text-sm">
            {t('Para dudas sobre esta politica o solicitud de reembolso especifica, escribe a', 'For questions about this policy or specific refund requests, email')}{' '}
            <a href="mailto:contacto@bookvia.com" className="text-[#F05D5E] underline">contacto@bookvia.com</a>{t(' con el ID de tu reserva. Atendemos Lunes a Viernes, 9 a.m. a 6 p.m. (CDMX).', ' with your booking ID. We respond Mon-Fri, 9 a.m. to 6 p.m. (CDMX).')}
          </p>
        </Section>

        <div className="mt-10 text-center">
          <Link to="/help">
            <Button variant="outline" data-testid="refund-back-to-help">
              {t('Volver al Centro de Ayuda', 'Back to Help Center')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-heading font-bold mb-3 flex items-center gap-2 text-foreground">
        <span className="text-[#F05D5E]">{icon}</span>
        {title}
      </h2>
      <div className="text-foreground/90 leading-relaxed">{children}</div>
    </section>
  );
}
