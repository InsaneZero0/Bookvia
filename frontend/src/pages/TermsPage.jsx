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
              <p className="text-slate-600 mt-1">{t('Ultima actualizacion: Abril 2026', 'Last updated: April 2026')}</p>
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

          <h2>{t('4. Reservas y Pagos', '4. Bookings and Payments')}</h2>
          <p>{t(
            'Las reservas estan sujetas a la disponibilidad del negocio. Los anticipos se procesan a traves de Stripe y estan sujetos a las politicas de cancelacion de cada negocio. Bookvia cobra una comision por cada transaccion procesada.',
            'Bookings are subject to business availability. Deposits are processed through Stripe and are subject to each business\'s cancellation policy. Bookvia charges a commission on each processed transaction.'
          )}</p>

          <h2>{t('5. Cancelaciones y Reembolsos', '5. Cancellations and Refunds')}</h2>
          <p>{t(
            'Las politicas de cancelacion varian segun cada negocio. Los reembolsos se procesan de acuerdo con la politica establecida por el negocio al momento de la reserva. Bookvia no es responsable de disputas entre usuarios y negocios.',
            'Cancellation policies vary by business. Refunds are processed according to the policy established by the business at the time of booking. Bookvia is not responsible for disputes between users and businesses.'
          )}</p>

          <h2>{t('6. Suscripciones para Negocios', '6. Business Subscriptions')}</h2>
          <p>{t(
            'Los negocios registrados pagan una suscripcion mensual para acceder a la plataforma. La suscripcion se renueva automaticamente y puede ser cancelada en cualquier momento. No hay contratos a largo plazo.',
            'Registered businesses pay a monthly subscription to access the platform. The subscription renews automatically and can be cancelled at any time. There are no long-term contracts.'
          )}</p>

          <h2>{t('7. Conducta del Usuario', '7. User Conduct')}</h2>
          <p>{t(
            'Los usuarios se comprometen a: no publicar contenido falso o enganoso, no hacer reservas fraudulentas, respetar a los profesionales y otros usuarios, y no utilizar la plataforma para fines ilegales.',
            'Users agree to: not publish false or misleading content, not make fraudulent bookings, respect professionals and other users, and not use the platform for illegal purposes.'
          )}</p>

          <h2>{t('8. Propiedad Intelectual', '8. Intellectual Property')}</h2>
          <p>{t(
            'Todo el contenido de Bookvia, incluyendo marca, logotipo, diseno y codigo, es propiedad de Bookvia. Los negocios conservan los derechos sobre su contenido publicado.',
            'All Bookvia content, including brand, logo, design, and code, is the property of Bookvia. Businesses retain rights to their published content.'
          )}</p>

          <h2>{t('9. Limitacion de Responsabilidad', '9. Limitation of Liability')}</h2>
          <p>{t(
            'Bookvia actua como intermediario entre usuarios y negocios. No somos responsables de la calidad de los servicios prestados por los negocios, ni de danos directos o indirectos derivados del uso de la plataforma.',
            'Bookvia acts as an intermediary between users and businesses. We are not responsible for the quality of services provided by businesses, nor for direct or indirect damages resulting from the use of the platform.'
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
        </div>
      </section>
    </div>
  );
}
