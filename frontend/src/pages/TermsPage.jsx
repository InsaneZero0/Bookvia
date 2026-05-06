import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function TermsPage() {
  const { language } = useI18n();
  const t = (es, en) => language === 'es' ? es : en;

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen pt-20 bg-background">
      <section className="bg-[#fcf7ba] text-slate-900 py-16 relative overflow-hidden">
        <div className="absolute top-10 right-10 w-72 h-72 bg-[#F05D5E]/10 rounded-full blur-3xl" />
        <div className="container-app relative z-10">
          <nav className="flex items-center text-sm text-slate-600 mb-4">
            <Link to="/" className="hover:text-slate-900">{t('Inicio', 'Home')}</Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="text-slate-900 font-medium">{t('Terminos y Condiciones', 'Terms & Conditions')}</span>
          </nav>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#F05D5E]/15 rounded-full flex items-center justify-center">
              <FileText className="w-8 h-8 text-[#F05D5E]" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold">{t('Terminos y Condiciones', 'Terms & Conditions')}</h1>
              <p className="text-slate-600 mt-1">{t('Ultima actualizacion: 01 Mayo 2026 - Version 2026-05-01', 'Last updated: May 1, 2026 - Version 2026-05-01')}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="container-app py-12">
        <div className="prose prose-slate dark:prose-invert max-w-3xl">
          <h2>{t('1. Aceptacion de los Terminos', '1. Acceptance of Terms')}</h2>
          <p>{t(
            'Al acceder y utilizar la plataforma Bookvia ("la Plataforma"), usted acepta cumplir con estos Terminos y Condiciones. Si no esta de acuerdo con alguna parte de estos terminos, no debera utilizar nuestros servicios.',
            'By accessing and using the Bookvia platform ("the Platform"), you agree to comply with these Terms and Conditions. If you do not agree with any part of these terms, you should not use our services.'
          )}</p>

          <h2>{t('2. Descripcion del Servicio', '2. Description of Service')}</h2>
          <p>{t(
            'Bookvia es una plataforma de reservas en linea que conecta a usuarios con negocios de servicios profesionales. La Plataforma facilita la busqueda, comparacion y reserva de servicios en Mexico y Estados Unidos.',
            'Bookvia is an online booking platform that connects users with professional service businesses. The Platform facilitates searching, comparing, and booking services in Mexico and the United States.'
          )}</p>

          <h2>{t('3. Registro y Cuentas', '3. Registration and Accounts')}</h2>
          <p>{t(
            'Los usuarios deben proporcionar informacion veraz y actualizada al registrarse. Cada usuario es responsable de mantener la confidencialidad de su cuenta y contrasena. Los negocios deben proporcionar documentacion legal valida para su verificacion.',
            'Users must provide truthful and up-to-date information when registering. Each user is responsible for maintaining the confidentiality of their account and password. Businesses must provide valid legal documentation for verification.'
          )}</p>

          <h2>{t('4. Reservas, Anticipos y Pagos', '4. Bookings, Deposits & Payments')}</h2>
          <p>{t(
            'Las reservas estan sujetas a la disponibilidad del negocio. Los anticipos se procesan a traves de Stripe. El monto minimo de anticipo por servicio es de $100 MXN; los negocios solo pueden solicitar anticipo en servicios cuyo precio sea igual o mayor a este monto.',
            'Bookings are subject to business availability. Deposits are processed through Stripe. The minimum deposit amount per service is $100 MXN; businesses can only request a deposit on services priced at or above this amount.'
          )}</p>
          <p>{t(
            'Al reservar una cita con anticipo, el cliente paga el monto del anticipo mas una cuota fija de servicio Bookvia de $8.00 MXN (IVA incluido: subtotal $6.90 + IVA $1.10). Esta cuota cubre la gestion de la reserva, recordatorios automaticos y soporte en la plataforma. La cuota Bookvia es por cita confirmada y no es reembolsable una vez que la reserva queda registrada, salvo que el negocio cancele la cita.',
            'When booking an appointment with a deposit, the client pays the deposit amount plus a fixed $8.00 MXN Bookvia service fee (VAT included: subtotal $6.90 + VAT $1.10). This fee covers booking management, automated reminders, and platform support. The Bookvia fee is charged per confirmed booking and is non-refundable once the booking is registered, unless the business cancels the appointment.'
          )}</p>
          <p>{t(
            'Del monto del anticipo, Bookvia retiene un 8.5% en concepto de cuota de procesamiento de pago, con un piso minimo de $8.50 MXN por transaccion (aplica a anticipos iguales a $100). El negocio recibe el 91.5% restante del anticipo en su liquidacion mensual. Ejemplo: por un anticipo de $100 MXN, el cliente paga $108.00 MXN y el negocio recibe $91.50 MXN.',
            'From the deposit amount, Bookvia retains 8.5% as a payment processing fee, with a floor of $8.50 MXN per transaction (applies when deposit equals $100). The business receives the remaining 91.5% in its monthly settlement. Example: for a $100 MXN deposit, the client pays $108.00 MXN and the business receives $91.50 MXN.'
          )}</p>

          <h2>{t('5. Cancelaciones, Reembolsos y Saldo', '5. Cancellations, Refunds & Wallet')}</h2>
          <p>{t(
            'Cada negocio define su propia ventana de cancelacion (por ejemplo, 24 o 48 horas antes de la cita). Si el cliente cancela dentro de la ventana permitida por el negocio, se le reembolsa el anticipo (91.5%). La cuota de servicio Bookvia de $8.00 MXN no se reembolsa, pues el servicio de gestion ya fue prestado. El cliente podra elegir recibir el reembolso a su tarjeta (5 a 10 dias habiles) o como saldo en su cuenta Bookvia (disponible al instante).',
            'Each business defines its own cancellation window (e.g., 24 or 48 hours before the appointment). If the client cancels within the business\'s allowed window, the deposit (91.5%) is refunded. The $8.00 MXN Bookvia service fee is non-refundable because the management service has already been provided. The client may choose to receive the refund to their card (5 to 10 business days) or as credit in their Bookvia wallet (instantly available).'
          )}</p>
          <p>{t(
            'Reagendamiento: el cliente puede reagendar su cita un maximo de 2 veces sin costo, siempre y cuando lo haga con al menos 2 horas de anticipacion. El anticipo pagado se mantiene en la nueva cita. Una vez alcanzado el limite, solo podra cancelar (sujeto a la politica de cancelacion del negocio).',
            'Rescheduling: the client may reschedule their booking up to 2 times at no cost, provided it is done at least 2 hours in advance. The paid deposit is preserved on the new appointment. Once the limit is reached, only cancellation is available (subject to the business\'s cancellation policy).'
          )}</p>
          <p>{t(
            'Si el cliente cancela fuera de la ventana permitida o no se presenta, no hay reembolso. El anticipo se considera cobrado a favor del negocio.',
            'If the client cancels outside the allowed window or fails to show up, there is no refund. The deposit is considered collected in favor of the business.'
          )}</p>
          <p>{t(
            'Si el negocio cancela la cita, el cliente recibe el reembolso total (anticipo + cuota Bookvia). El monto correspondiente, junto con los costos de procesamiento no recuperables, se descuenta al negocio de su proxima liquidacion. Las cancelaciones recurrentes por parte del negocio podran derivar en la suspension de su cuenta.',
            'If the business cancels the appointment, the client receives a full refund (deposit + Bookvia fee). The corresponding amount, along with non-recoverable processing costs, is deducted from the business\'s next settlement. Recurring cancellations by the business may result in suspension of its account.'
          )}</p>
          <p>{t(
            'El saldo acumulado en la cuenta Bookvia del cliente es intransferible y puede usarse para pagar futuras reservas. El saldo expira 24 meses despues de la ultima transaccion si no es utilizado.',
            'Client wallet balance is non-transferable and may be used to pay for future bookings. Wallet balance expires 24 months after the last transaction if not used.'
          )}</p>

          <h2>{t('6. Suscripciones y Liquidaciones a Negocios', '6. Business Subscriptions & Settlements')}</h2>
          <p>{t(
            'Los negocios registrados pagan una suscripcion mensual para acceder a la plataforma ($49.99 MXN en Mexico, $4.99 USD en Estados Unidos). La suscripcion se renueva automaticamente y puede ser cancelada en cualquier momento. Si la suscripcion es cancelada o la tarjeta rebotada, el negocio dejara de aparecer en los resultados de busqueda hasta regularizarse.',
            'Registered businesses pay a monthly subscription to access the platform ($49.99 MXN in Mexico, $4.99 USD in the United States). The subscription renews automatically and can be cancelled at any time. If the subscription is cancelled or the card is declined, the business will stop appearing in search results until regularized.'
          )}</p>
          <p>{t(
            'Bookvia realiza el corte contable el dia 20 de cada mes y transfiere a los negocios, via SPEI, los importes netos acumulados por servicios completados durante el periodo, el dia 1 del mes siguiente. Solo se liquidan los anticipos correspondientes a citas completadas sin reclamaciones vigentes. Los anticipos de citas no completadas o con reclamaciones abiertas permaneceran retenidos hasta su resolucion.',
            'Bookvia performs accounting cut-off on the 20th of each month and transfers to businesses via SPEI the net accumulated amounts for completed services during the period, on the 1st of the following month. Only deposits corresponding to completed appointments without active claims are settled. Deposits from non-completed appointments or open claims remain withheld until resolution.'
          )}</p>
          <p>{t(
            'Es responsabilidad del negocio proporcionar y mantener actualizada una CLABE bancaria valida a su nombre o al de su empresa. Los depositos fallidos por CLABE incorrecta se mantendran en el saldo del negocio hasta que se corrija.',
            'It is the business\'s responsibility to provide and maintain a valid CLABE account in its name or that of its company. Failed deposits due to incorrect CLABE will remain in the business\'s balance until corrected.'
          )}</p>

          <h2>{t('7. Conducta del Usuario', '7. User Conduct')}</h2>
          <p>{t(
            'Los usuarios se comprometen a: no publicar contenido falso o enganoso, no hacer reservas fraudulentas, respetar a los profesionales y otros usuarios, y no utilizar la plataforma para fines ilegales. El usuario declara ser mayor de edad (18 anos cumplidos) al momento de crear una cuenta. Las cuentas creadas por menores de edad seran suspendidas sin previo aviso.',
            'Users agree to: not publish false or misleading content, not make fraudulent bookings, respect professionals and other users, and not use the platform for illegal purposes. The user declares that they are of legal age (18 years or older) at the time of creating an account. Accounts created by minors will be suspended without notice.'
          )}</p>

          <h2>{t('7.1 Propinas', '7.1 Tips')}</h2>
          <p>{t(
            'Bookvia NO intermedia ni procesa propinas. Si el cliente desea entregar una propina al profesional o al negocio, debera hacerlo directamente en el establecimiento, en efectivo o por el medio que el negocio ofrezca. Las propinas no se registran ni se muestran en Bookvia, y su cobro, reparto y fiscalizacion son responsabilidad exclusiva del negocio.',
            'Bookvia does NOT intermediate or process tips. If the client wishes to leave a tip for the professional or business, it must be done directly at the establishment, in cash or through whatever method the business offers. Tips are neither recorded nor displayed on Bookvia, and their collection, distribution, and tax treatment are the exclusive responsibility of the business.'
          )}</p>

          <h2>{t('7.2 Facturacion (CFDI)', '7.2 Invoicing (CFDI)')}</h2>
          <p>{t(
            'El comprobante fiscal (factura / CFDI) por el servicio prestado debe solicitarse directamente al negocio que ejecuto la cita, ya que es quien presta el servicio final al cliente. Bookvia no emite facturas a nombre de los clientes por servicios contratados a los negocios.',
            'The tax receipt (invoice / CFDI) for the service rendered must be requested directly from the business that performed the appointment, since they are the final service provider to the client. Bookvia does not issue invoices to clients for services contracted with businesses.'
          )}</p>
          <p>{t(
            'Bookvia puede emitir un comprobante fiscal (CFDI) unicamente bajo solicitud del cliente, por las cuotas de servicio que cobra ($8.00 MXN por cita confirmada) y a sus negocios (suscripcion mensual y cuota de procesamiento). Para solicitar factura, contacta contacto@bookvia.app con los datos fiscales dentro del mes calendario de la operacion.',
            'Bookvia may issue a tax receipt (CFDI) only upon client request, for service fees it charges ($8.00 MXN per confirmed booking) and its businesses (monthly subscription and processing fee). To request an invoice, contact contacto@bookvia.app with tax details within the calendar month of the transaction.'
          )}</p>

          <h2>{t('8. Propiedad Intelectual', '8. Intellectual Property')}</h2>
          <p>{t(
            'Todo el contenido de Bookvia, incluyendo marca, logotipo, diseno y codigo, es propiedad de Bookvia. Los negocios conservan los derechos sobre su contenido publicado.',
            'All Bookvia content, including brand, logo, design, and code, is the property of Bookvia. Businesses retain rights to their published content.'
          )}</p>

          <h2>{t('9. Limitacion de Responsabilidad', '9. Limitation of Liability')}</h2>
          <p>{t(
            'Bookvia es una plataforma de intermediacion entre usuarios y negocios. La calidad, seguridad, legalidad e idoneidad de los servicios ofrecidos son responsabilidad exclusiva de cada negocio. Bookvia NO presta, ejecuta ni supervisa los servicios listados en la plataforma.',
            'Bookvia is an intermediation platform between users and businesses. The quality, safety, legality and suitability of the services offered are the exclusive responsibility of each business. Bookvia does NOT provide, perform, or supervise the services listed on the platform.'
          )}</p>
          <p>{t(
            'Es responsabilidad del cliente verificar que el negocio cuente con los permisos, licencias, certificaciones y seguros correspondientes antes de recibir el servicio. Bookvia no sera responsable por lesiones, danos fisicos o morales, perdidas economicas o cualquier otro perjuicio derivado directa o indirectamente del servicio prestado por el negocio.',
            'It is the client\'s responsibility to verify that the business holds the corresponding permits, licenses, certifications and insurance before receiving the service. Bookvia will not be liable for injuries, physical or moral damages, economic losses or any other harm directly or indirectly resulting from the service provided by the business.'
          )}</p>
          <p>{t(
            'En la maxima medida permitida por la ley aplicable, la responsabilidad total de Bookvia frente a un usuario por cualquier reclamacion relacionada con el uso de la plataforma se limitara al monto de las comisiones efectivamente pagadas por dicho usuario a Bookvia durante los 3 meses previos al hecho que origino la reclamacion.',
            'To the maximum extent permitted by applicable law, Bookvia\'s total liability to a user for any claim related to the use of the platform shall be limited to the amount of fees effectively paid by such user to Bookvia during the 3 months prior to the event giving rise to the claim.'
          )}</p>

          <h2>{t('9.1 Privacidad y Datos Personales', '9.1 Privacy & Personal Data')}</h2>
          <p>{t(
            'Bookvia trata los datos personales proporcionados por los usuarios y negocios conforme a la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares (LFPDPPP) de Mexico. El Aviso de Privacidad completo, asi como los medios para ejercer los derechos ARCO (Acceso, Rectificacion, Cancelacion y Oposicion), estan disponibles en la pagina /privacy. Los datos estrictamente necesarios para la operacion (nombre, correo, telefono, direccion, CLABE, RFC en el caso de negocios) se comparten unicamente con el negocio reservado y los procesadores (Stripe, Resend, Cloudinary).',
            'Bookvia processes personal data provided by users and businesses in accordance with the Mexican Federal Law on Protection of Personal Data Held by Private Parties (LFPDPPP). The full Privacy Notice and the means to exercise ARCO rights (Access, Rectification, Cancellation, and Opposition) are available at /privacy. Strictly necessary data for operation (name, email, phone, address, CLABE, RFC for businesses) is shared only with the booked business and the processors (Stripe, Resend, Cloudinary).'
          )}</p>

          <h2>{t('9.2 Ley Aplicable y Jurisdiccion', '9.2 Governing Law & Jurisdiction')}</h2>
          <p>{t(
            'Los presentes Terminos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a la jurisdiccion de los tribunales competentes de la Ciudad de Mexico, renunciando expresamente a cualquier otro fuero que pudiera corresponderles por razon de sus domicilios presentes o futuros.',
            'These Terms are governed by the laws of the United Mexican States. For any dispute, the parties submit to the jurisdiction of the competent courts of Mexico City, expressly waiving any other jurisdiction that may apply due to their current or future domiciles.'
          )}</p>

          <h2>{t('10. Modificaciones', '10. Modifications')}</h2>
          <p>{t(
            'Bookvia se reserva el derecho de modificar estos terminos en cualquier momento. Los cambios seran notificados a los usuarios registrados por correo electronico.',
            'Bookvia reserves the right to modify these terms at any time. Changes will be notified to registered users via email.'
          )}</p>

          <h2>{t('11. Contacto', '11. Contact')}</h2>
          <p>{t(
            'Para cualquier consulta sobre estos terminos, contactanos en: hola@bookvia.app',
            'For any questions about these terms, contact us at: hola@bookvia.app'
          )}</p>

          <h2>{t('12. Historial de versiones', '12. Version history')}</h2>
          <ul>
            <li>
              <strong>v2026-05-01</strong> (01 {t('mayo', 'May')} 2026) -{' '}
              {t(
                'Version inicial publica. Aclaracion del rol de Bookvia como intermediario; propinas y facturas (CFDI) se gestionan entre cliente y negocio; Aviso de Privacidad LFPDPPP y jurisdiccion CDMX.',
                'Initial public version. Clarifies Bookvia\'s role as intermediary; tips and invoices (CFDI) are handled between client and business; LFPDPPP Privacy Notice and Mexico City jurisdiction.'
              )}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
