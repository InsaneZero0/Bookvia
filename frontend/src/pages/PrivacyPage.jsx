import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function PrivacyPage() {
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
            <span className="text-slate-900 font-medium">{t('Politica de Privacidad', 'Privacy Policy')}</span>
          </nav>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#F05D5E]/15 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-[#F05D5E]" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold">{t('Politica de Privacidad', 'Privacy Policy')}</h1>
              <p className="text-slate-600 mt-1">{t('Ultima actualizacion: Abril 2026', 'Last updated: April 2026')}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="container-app py-12">
        <div className="prose prose-slate dark:prose-invert max-w-3xl">
          <h2>{t('1. Informacion que Recopilamos', '1. Information We Collect')}</h2>
          <p>{t(
            'Recopilamos informacion personal como nombre, correo electronico, numero de telefono y ubicacion cuando te registras. Para negocios, tambien recopilamos documentacion legal (RFC/EIN, identificacion oficial, datos bancarios) necesaria para la verificacion.',
            'We collect personal information such as name, email address, phone number, and location when you register. For businesses, we also collect legal documentation (RFC/EIN, official ID, banking details) necessary for verification.'
          )}</p>

          <h2>{t('2. Uso de la Informacion', '2. Use of Information')}</h2>
          <p>{t(
            'Utilizamos tu informacion para: procesar reservas y pagos, verificar negocios registrados, enviar confirmaciones y recordatorios, mejorar la plataforma, y cumplir con obligaciones legales.',
            'We use your information to: process bookings and payments, verify registered businesses, send confirmations and reminders, improve the platform, and comply with legal obligations.'
          )}</p>

          <h2>{t('3. Procesamiento de Pagos', '3. Payment Processing')}</h2>
          <p>{t(
            'Los pagos se procesan a traves de Stripe, un proveedor certificado PCI-DSS. Bookvia no almacena numeros de tarjeta de credito. Toda la informacion financiera es manejada directamente por Stripe bajo sus propias politicas de seguridad.',
            'Payments are processed through Stripe, a PCI-DSS certified provider. Bookvia does not store credit card numbers. All financial information is handled directly by Stripe under their own security policies.'
          )}</p>

          <h2>{t('4. Compartir Informacion', '4. Sharing Information')}</h2>
          <p>{t(
            'Compartimos informacion limitada con: negocios (para gestionar reservas), proveedores de pago (Stripe), y servicios de correo (para notificaciones). No vendemos tu informacion personal a terceros.',
            'We share limited information with: businesses (to manage bookings), payment providers (Stripe), and email services (for notifications). We do not sell your personal information to third parties.'
          )}</p>

          <h2>{t('5. Seguridad de Datos', '5. Data Security')}</h2>
          <p>{t(
            'Implementamos medidas de seguridad como encriptacion de datos, autenticacion de dos factores para administradores, y acceso restringido a informacion sensible. Sin embargo, ninguna transmision por internet es 100% segura.',
            'We implement security measures such as data encryption, two-factor authentication for administrators, and restricted access to sensitive information. However, no internet transmission is 100% secure.'
          )}</p>

          <h2>{t('6. Cookies y Almacenamiento Local', '6. Cookies and Local Storage')}</h2>
          <p>{t(
            'Utilizamos almacenamiento local del navegador para mantener tu sesion, preferencias de idioma y pais seleccionado. No utilizamos cookies de rastreo de terceros.',
            'We use browser local storage to maintain your session, language preferences, and selected country. We do not use third-party tracking cookies.'
          )}</p>

          <h2>{t('7. Tus Derechos', '7. Your Rights')}</h2>
          <p>{t(
            'Tienes derecho a: acceder a tu informacion personal, solicitar la correccion de datos inexactos, solicitar la eliminacion de tu cuenta y datos, y retirar tu consentimiento en cualquier momento.',
            'You have the right to: access your personal information, request correction of inaccurate data, request deletion of your account and data, and withdraw your consent at any time.'
          )}</p>

          <h2>{t('8. Retencion de Datos', '8. Data Retention')}</h2>
          <p>{t(
            'Conservamos tu informacion mientras tu cuenta este activa. Si solicitas la eliminacion de tu cuenta, eliminaremos tu informacion personal en un plazo de 30 dias, salvo que la ley requiera su conservacion.',
            'We retain your information while your account is active. If you request account deletion, we will delete your personal information within 30 days, unless the law requires retention.'
          )}</p>

          <h2>{t('9. Legislacion Aplicable', '9. Applicable Law')}</h2>
          <p>{t(
            'Para usuarios en Mexico, esta politica cumple con la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares (LFPDPPP). Para usuarios en Estados Unidos, cumplimos con las leyes de privacidad aplicables incluyendo CCPA para residentes de California.',
            'For users in Mexico, this policy complies with the Federal Law for the Protection of Personal Data Held by Private Parties (LFPDPPP). For users in the United States, we comply with applicable privacy laws including CCPA for California residents.'
          )}</p>

          <h2>{t('10. Contacto', '10. Contact')}</h2>
          <p>{t(
            'Para cualquier consulta sobre privacidad o para ejercer tus derechos, contactanos en: hola@bookvia.app',
            'For any privacy inquiries or to exercise your rights, contact us at: hola@bookvia.app'
          )}</p>
        </div>
      </section>
    </div>
  );
}
