import { useState, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  FileText, Shield, CreditCard, RotateCcw, Cookie, Download, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';

const LAST_UPDATED = '2026-06-12';
const LEGAL_VERSION = '1.2';

/**
 * Unified Legal Center — Terms, Privacy, Commission, Refunds, Cookies — in a single
 * page with sidebar tabs (deep-linkable via ?doc=<id>).
 */
export default function LegalPage() {
  const { language } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = (es, en) => (language === 'es' ? es : en);
  const printRef = useRef(null);

  const DOCS = useMemo(() => [
    { id: 'terms', icon: FileText, label_es: 'Términos de servicio', label_en: 'Terms of service' },
    { id: 'privacy', icon: Shield, label_es: 'Política de privacidad', label_en: 'Privacy policy' },
    { id: 'commissions', icon: CreditCard, label_es: 'Comisiones y cobros', label_en: 'Commissions & fees' },
    { id: 'refunds', icon: RotateCcw, label_es: 'Política de reembolsos', label_en: 'Refunds policy' },
    { id: 'cookies', icon: Cookie, label_es: 'Política de cookies', label_en: 'Cookies policy' },
  ], []);

  const initialDoc = DOCS.find(d => d.id === searchParams.get('doc'))?.id || 'terms';
  const [activeDoc, setActiveDocState] = useState(initialDoc);
  const setActiveDoc = (id) => {
    setActiveDocState(id);
    const params = new URLSearchParams(searchParams);
    params.set('doc', id);
    setSearchParams(params, { replace: true });
  };

  const handlePrint = () => {
    window.print();
  };

  const lastUpdatedLabel = new Date(LAST_UPDATED).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const activeDocMeta = DOCS.find(d => d.id === activeDoc) || DOCS[0];

  return (
    <div className="min-h-screen bg-background" data-testid="legal-page">
      <div className="container-app max-w-6xl py-10">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">
            {t('Centro Legal', 'Legal Center')}
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            {t('Última actualización:', 'Last updated:')} <span className="font-medium">{lastUpdatedLabel}</span>
            <Badge variant="secondary" className="font-mono text-[10px]">v{LEGAL_VERSION}</Badge>
          </div>
        </header>

        <div className="grid lg:grid-cols-[240px_1fr] gap-8">
          {/* Sidebar - sticky on desktop */}
          <aside className="lg:sticky lg:top-20 lg:self-start" data-testid="legal-sidebar">
            <nav className="space-y-1 print:hidden">
              {DOCS.map(d => {
                const Icon = d.icon;
                const active = activeDoc === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setActiveDoc(d.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2.5 ${
                      active ? 'bg-[#F05D5E]/10 text-[#F05D5E] border-l-2 border-[#F05D5E]' : 'hover:bg-muted text-muted-foreground'
                    }`}
                    data-testid={`legal-tab-${d.id}`}
                  >
                    <Icon className="h-4 w-4" />
                    {language === 'es' ? d.label_es : d.label_en}
                  </button>
                );
              })}
            </nav>
            <Button variant="outline" size="sm" className="w-full mt-4 print:hidden" onClick={handlePrint} data-testid="legal-print-btn">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {t('Descargar / imprimir', 'Download / print')}
            </Button>
          </aside>

          {/* Document content */}
          <article ref={printRef} className="prose prose-sm max-w-[720px] dark:prose-invert prose-headings:font-heading prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground" data-testid={`legal-content-${activeDoc}`}>
            <h2 className="text-2xl font-heading font-bold mb-1">
              {language === 'es' ? activeDocMeta.label_es : activeDocMeta.label_en}
            </h2>
            <p className="text-xs text-muted-foreground italic m-0 mb-6">
              Bookvia · v{LEGAL_VERSION} · {lastUpdatedLabel}
            </p>

            {activeDoc === 'terms' && <TermsContent language={language} />}
            {activeDoc === 'privacy' && <PrivacyContent language={language} />}
            {activeDoc === 'commissions' && <CommissionsContent language={language} />}
            {activeDoc === 'refunds' && <RefundsContent language={language} />}
            {activeDoc === 'cookies' && <CookiesContent language={language} />}

            <hr className="my-8" />
            <p className="text-xs text-muted-foreground">
              {t('Si tienes preguntas sobre este documento, escríbenos a ', 'For questions about this document, email ')}
              <Link to="/ayuda" className="text-[#F05D5E] hover:underline">contacto@bookvia.com</Link>
              {t(' o visita nuestro ', ' or visit our ')}
              <Link to="/ayuda" className="text-[#F05D5E] hover:underline">{t('centro de ayuda', 'help center')}</Link>.
            </p>
          </article>
        </div>
      </div>
    </div>
  );
}

// ============================ DOCUMENT CONTENT ============================

function TermsContent({ language }) {
  if (language === 'en') {
    return (
      <>
        <h3>1. Acceptance of terms</h3>
        <p>By accessing or using Bookvia (the «Platform»), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Platform.</p>
        <h3>2. Service description</h3>
        <p>Bookvia is an online marketplace that connects service businesses (barbershops, spas, etc.) with end customers, allowing online booking and optional online deposit collection.</p>
        <h3>3. Business accounts</h3>
        <ul>
          <li>Businesses pay a $49.99 MXN monthly subscription after a 30-day free trial.</li>
          <li>Businesses may choose to collect online deposits or charge in person.</li>
          <li>If collecting deposits online, the business must complete Stripe Connect onboarding.</li>
          <li>Bookvia holds deposit funds and releases them monthly on the 20th to the business&apos;s Stripe Connect account.</li>
        </ul>
        <h3>4. Client accounts</h3>
        <p>Clients may book services, pay deposits when required, and cancel within each business&apos;s published cancellation window.</p>
        <h3>5. Prohibited use</h3>
        <p>You may not use the Platform for fraudulent, illegal or harmful purposes. Bookvia reserves the right to suspend or terminate accounts that violate these terms.</p>
        <h3>6. Limitation of liability</h3>
        <p>Bookvia acts solely as an intermediary. The quality of services delivered is the sole responsibility of the contracting business. Bookvia is not liable for service-related damages.</p>
        <h3>7. Governing law</h3>
        <p>These terms are governed by Mexican law. Any dispute will be resolved in the courts of Querétaro, México.</p>
        <h3>8. Changes</h3>
        <p>We may update these terms. We will notify you of material changes via email or in-app notification at least 7 days in advance.</p>
      </>
    );
  }
  return (
    <>
      <h3>1. Aceptación de los términos</h3>
      <p>Al acceder o usar Bookvia (la «Plataforma»), aceptas estar legalmente obligado por estos Términos de Servicio. Si no estás de acuerdo, por favor no uses la Plataforma.</p>

      <h3>2. Descripción del servicio</h3>
      <p>Bookvia es un marketplace en línea que conecta negocios de servicio (barberías, spas, salones, consultorios, etc.) con clientes finales, permitiendo reservas en línea y cobro opcional de anticipos electrónicos.</p>

      <h3>3. Cuentas de negocio</h3>
      <ul>
        <li>Los negocios pagan una mensualidad de <strong>$49.99 MXN</strong> después de un periodo gratuito de <strong>30 días</strong>.</li>
        <li>Los negocios pueden elegir si cobran anticipo en línea o si cobran completamente en su establecimiento.</li>
        <li>Si decide cobrar anticipos en línea, el negocio debe completar el proceso de verificación de Stripe Connect.</li>
        <li>Bookvia retiene los anticipos cobrados y los libera mensualmente el <strong>día 20</strong> a la cuenta Stripe Connect del negocio, descontando una comisión del <strong>8.5%</strong> y una cuota fija de <strong>$8 MXN</strong> pagada por el cliente.</li>
        <li>El negocio puede cambiar entre las modalidades de cobro cada 30 días.</li>
      </ul>

      <h3>4. Cuentas de cliente</h3>
      <p>Los clientes pueden reservar servicios, pagar anticipos cuando sea requerido por el negocio y cancelar sus reservas dentro del margen publicado por cada negocio (típicamente 24 horas antes).</p>

      <h3>5. Uso prohibido</h3>
      <p>No puedes usar la Plataforma para fines fraudulentos, ilegales o dañinos, incluyendo —pero no limitado a— suplantación de identidad, lavado de dinero, contenido ofensivo, spam, o explotar fallas de seguridad. Bookvia se reserva el derecho de suspender o terminar cuentas que violen estos términos.</p>

      <h3>6. Limitación de responsabilidad</h3>
      <p>Bookvia actúa exclusivamente como <strong>intermediario tecnológico</strong>. La calidad, oportunidad, seguridad y resultado de los servicios prestados es responsabilidad exclusiva del negocio contratado. Bookvia no es responsable de daños derivados de la ejecución del servicio.</p>

      <h3>7. Propiedad intelectual</h3>
      <p>Todo el contenido de Bookvia (marca, logotipos, código, diseño) es propiedad de Bookvia y está protegido por leyes de derechos de autor. El contenido que los negocios y usuarios suben sigue siendo de su propiedad, pero conceden a Bookvia una licencia no exclusiva para mostrarlo en la Plataforma.</p>

      <h3>8. Ley aplicable</h3>
      <p>Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia se resolverá ante los tribunales competentes de Querétaro, México, renunciando a cualquier otro fuero que pudiera corresponder.</p>

      <h3>9. Cambios a los términos</h3>
      <p>Podemos actualizar estos términos en el futuro. Te notificaremos cualquier cambio material por correo electrónico o notificación dentro de la app con al menos 7 días de anticipación. El uso continuado de la Plataforma después de la fecha efectiva constituye tu aceptación.</p>
    </>
  );
}

function PrivacyContent({ language }) {
  if (language === 'en') {
    return (
      <>
        <h3>1. Information we collect</h3>
        <ul>
          <li><strong>Account data:</strong> name, email, phone, role.</li>
          <li><strong>Business data:</strong> business name, address, services, prices, photos, bank details for Stripe Connect.</li>
          <li><strong>Booking data:</strong> services booked, dates, amounts, ratings.</li>
          <li><strong>Payment data:</strong> processed by Stripe; we never store card numbers.</li>
          <li><strong>Technical data:</strong> IP, browser, device, usage events (Sentry).</li>
        </ul>
        <h3>2. How we use it</h3>
        <p>To provide the service, communicate updates, prevent fraud, comply with legal obligations and improve the Platform.</p>
        <h3>3. Who we share with</h3>
        <p>Stripe (payments), Resend (email), Cloudinary (image hosting), Sentry (error monitoring), Twilio (SMS, when active). We do not sell your data.</p>
        <h3>4. Your rights (ARCO / LFPDPPP)</h3>
        <p>Access, rectification, cancellation, and opposition to the processing of your personal data. Email contacto@bookvia.com to exercise these rights.</p>
        <h3>5. Data retention</h3>
        <p>Account data is retained while the account is active and 30 days after decommission. Bookings are retained 5 years for tax/legal reasons.</p>
      </>
    );
  }
  return (
    <>
      <h3>1. Información que recolectamos</h3>
      <ul>
        <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, teléfono y rol (cliente / negocio / administrador).</li>
        <li><strong>Datos del negocio:</strong> razón social, dirección, categoría, servicios, precios, fotos, datos bancarios para Stripe Connect (CLABE, RFC, régimen fiscal).</li>
        <li><strong>Datos de reservas:</strong> servicios reservados, fechas, montos, calificaciones, reseñas.</li>
        <li><strong>Datos de pago:</strong> procesados por <strong>Stripe</strong>. Bookvia <strong>nunca almacena números de tarjeta</strong>.</li>
        <li><strong>Datos técnicos:</strong> dirección IP, tipo de navegador, dispositivo y eventos de uso (a través de Sentry para monitoreo de errores).</li>
      </ul>

      <h3>2. Cómo la usamos</h3>
      <p>Para prestar el servicio (procesar reservas y pagos), comunicarte actualizaciones, prevenir fraude, cumplir obligaciones legales/fiscales y mejorar la Plataforma. <strong>No usamos tus datos para publicidad de terceros.</strong></p>

      <h3>3. Con quién compartimos</h3>
      <p>Únicamente con los proveedores tecnológicos necesarios para operar:</p>
      <ul>
        <li><strong>Stripe</strong> (procesamiento de pagos y Stripe Connect).</li>
        <li><strong>Resend</strong> (entrega de correos transaccionales).</li>
        <li><strong>Cloudinary</strong> (alojamiento de imágenes y respaldos).</li>
        <li><strong>Sentry</strong> (monitoreo de errores).</li>
        <li><strong>Twilio</strong> (mensajería SMS, cuando esté activo).</li>
        <li>Autoridades, cuando lo exija la ley.</li>
      </ul>
      <p><strong>No vendemos tus datos personales a terceros.</strong></p>

      <h3>4. Derechos ARCO (LFPDPPP)</h3>
      <p>De conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, tienes derecho a <strong>Acceder, Rectificar, Cancelar u Oponerte</strong> al tratamiento de tus datos personales. Para ejercer estos derechos, escribe a <a href="mailto:contacto@bookvia.com">contacto@bookvia.com</a> con asunto «ARCO - [accion solicitada]».</p>

      <h3>5. Retención de datos</h3>
      <p>Los datos de cuenta se conservan mientras la cuenta esté activa, más 30 días después de darla de baja (período de gracia para reactivación). Las reservas y comprobantes fiscales se conservan <strong>5 años</strong> por requisitos del SAT.</p>

      <h3>6. Seguridad</h3>
      <p>Usamos TLS/HTTPS en todas las comunicaciones, bcrypt para contraseñas, tokens JWT con expiración, y respaldos diarios cifrados. Si detectamos una violación de seguridad, te notificaremos en menos de 72 horas.</p>

      <h3>7. Menores</h3>
      <p>Bookvia no está dirigido a menores de 18 años. Si descubrimos una cuenta de un menor, la eliminaremos.</p>
    </>
  );
}

function CommissionsContent({ language }) {
  if (language === 'en') {
    return (
      <>
        <h3>1. Monthly subscription</h3>
        <p>All businesses pay <strong>$49.99 MXN/month</strong> after a 30-day free trial. Charged via Stripe Subscription.</p>
        <h3>2. Online deposit commission (optional)</h3>
        <p>If you choose to charge deposits online:</p>
        <ul>
          <li><strong>+$8 MXN fixed fee</strong> charged to the client per booking with deposit.</li>
          <li><strong>8.5% commission</strong> deducted from the deposit before transferring to the business.</li>
          <li>Minimum commission: $8.50 MXN per deposit (whichever is higher).</li>
        </ul>
        <h3>3. Settlement</h3>
        <p>Funds are released on the 20th of each month to the business&apos;s Stripe Connect account. Stripe then forwards to the linked bank within 1-2 business days.</p>
      </>
    );
  }
  return (
    <>
      <h3>1. Mensualidad</h3>
      <p>Todos los negocios pagan una <strong>mensualidad de $49.99 MXN</strong> después de un periodo gratuito de 30 días. El cobro es automático vía Stripe Subscription al método de pago registrado. Si el cargo falla, te notificaremos por email y tendrás 7 días para regularizar antes de que la cuenta se suspenda.</p>

      <h3>2. Comisión por anticipo en línea (opcional)</h3>
      <p>Si decides cobrar anticipos a través de Bookvia, aplicarán los siguientes cargos por cada reserva:</p>
      <ul>
        <li><strong>$8 MXN fijos</strong> cobrados directamente al <strong>cliente</strong> (etiquetado como «Cuota Bookvia» en su recibo).</li>
        <li><strong>8.5%</strong> descontados del anticipo del <strong>negocio</strong> antes de la transferencia.</li>
        <li><strong>Comisión mínima:</strong> $8.50 MXN por anticipo, lo que sea mayor.</li>
      </ul>
      <p><strong>Ejemplo práctico:</strong> anticipo de $200 MXN.</p>
      <ul>
        <li>Cliente paga: $200 + $8 = <strong>$208 MXN</strong>.</li>
        <li>Bookvia retiene: $200 − 8.5% ($17) = <strong>$183 MXN para el negocio</strong> (se libera día 20).</li>
        <li>Bookvia ingresa: $8 (cliente) + $17 (negocio) = <strong>$25 MXN</strong> por reserva.</li>
      </ul>

      <h3>3. Liquidación de anticipos</h3>
      <p>Los anticipos se acumulan en el saldo Stripe de Bookvia hasta el día 20 de cada mes. Ese día, el administrador ejecuta un batch de transferencias a las cuentas Stripe Connect de cada negocio. Stripe entonces deposita el dinero en el banco vinculado del negocio en 1-2 días hábiles.</p>

      <h3>4. Cambio de modalidad</h3>
      <p>Puedes cambiar entre «cobro anticipo en linea» y «cobro en local» con un cooldown de 30 días entre cambios, para garantizar estabilidad a tus clientes.</p>

      <h3>5. Sin costos ocultos</h3>
      <p>No cobramos costos de instalación, comisión por registro, ni costos de cancelación. La mensualidad y las comisiones por anticipo son los únicos cargos.</p>
    </>
  );
}

function RefundsContent({ language }) {
  if (language === 'en') {
    return (
      <>
        <h3>1. Refunds for online deposits</h3>
        <p>If you cancel a booking <strong>within the cancellation window</strong> set by the business (typically 24 hours before), your deposit is refunded automatically to your original payment method within 5-7 business days.</p>
        <h3>2. Late cancellations</h3>
        <p>Cancellations outside the published window are non-refundable.</p>
        <h3>3. Monthly subscription refunds</h3>
        <p>Subscriptions are non-refundable after the 30-day free trial. You can cancel anytime; you keep access until the next billing date.</p>
      </>
    );
  }
  return (
    <>
      <h3>1. Reembolsos de anticipos en línea</h3>
      <p>Si cancelas una reserva <strong>dentro del margen de cancelación</strong> que el negocio publicó (típicamente 24 horas antes), tu anticipo se reembolsará automáticamente a tu método de pago original en un plazo de <strong>5 a 7 días hábiles</strong>. El reembolso es 100% del monto del anticipo; los $8 MXN de cuota Bookvia <strong>no son reembolsables</strong>.</p>

      <h3>2. Cancelaciones tardías</h3>
      <p>Las cancelaciones realizadas fuera del margen publicado <strong>no son reembolsables</strong>. El monto del anticipo se entrega al negocio en su liquidación del día 20.</p>

      <h3>3. No-show (cliente no llegó)</h3>
      <p>Si el cliente no se presenta a la cita, el anticipo se considera consumido y se entrega al negocio. No procede reembolso.</p>

      <h3>4. Servicio no prestado por el negocio</h3>
      <p>Si el negocio cancela la cita o no presta el servicio, recibirás un reembolso completo del anticipo. Si el negocio se niega a reembolsar, escribe a <a href="mailto:contacto@bookvia.com">contacto@bookvia.com</a> con el número de reserva para que medirámos.</p>

      <h3>5. Mensualidad del negocio</h3>
      <p>La mensualidad no es reembolsable después del periodo de 30 días gratis. Puedes cancelar la suscripción cuando quieras desde tu panel; mantendrás acceso hasta la siguiente fecha de cobro.</p>

      <h3>6. Contracargos (chargebacks)</h3>
      <p>Si un cliente disputa un cargo con su banco, Bookvia colaborará con la investigación. Si el contracargo se confirma, el negocio es responsable del monto disputado más una cuota de procesamiento de $250 MXN.</p>
    </>
  );
}

function CookiesContent({ language }) {
  if (language === 'en') {
    return (
      <>
        <h3>1. What are cookies?</h3>
        <p>Small files stored in your browser to remember your session and preferences.</p>
        <h3>2. What we use</h3>
        <ul>
          <li><strong>Essential:</strong> session JWT, language, theme.</li>
          <li><strong>Analytics:</strong> page views, performance (via Sentry).</li>
        </ul>
        <p>We do not use third-party advertising cookies.</p>
      </>
    );
  }
  return (
    <>
      <h3>1. ¿Qué son las cookies?</h3>
      <p>Las cookies son pequeños archivos que se guardan en tu navegador para recordar tu sesión y preferencias.</p>

      <h3>2. Qué cookies usamos</h3>
      <ul>
        <li><strong>Esenciales (siempre activas):</strong> token JWT de sesión, idioma seleccionado, tema (claro/oscuro), preferencias de notificaciones.</li>
        <li><strong>Analítica (anónimas):</strong> métricas de uso y monitoreo de errores a través de Sentry. No identifican personalmente al usuario.</li>
      </ul>

      <h3>3. Publicidad de terceros</h3>
      <p><strong>No usamos cookies publicitarias de terceros.</strong> No compartimos tu actividad con redes de publicidad.</p>

      <h3>4. Cómo gestionarlas</h3>
      <p>Puedes borrar o bloquear cookies desde la configuración de tu navegador. Si bloqueas las cookies esenciales, no podrás iniciar sesión en Bookvia.</p>
    </>
  );
}
