import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function TermsPage() {
  const { language } = useI18n();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen pt-20 bg-background">
      {/* Header */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 text-white py-16">
        <div className="container-app">
          <nav className="flex items-center text-sm text-slate-400 mb-4">
            <Link to="/" className="hover:text-white">Inicio</Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="text-white">Términos y Condiciones</span>
          </nav>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-coral/20 rounded-full flex items-center justify-center">
              <FileText className="w-8 h-8 text-coral" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold">
                Términos y Condiciones
              </h1>
              <p className="text-slate-400 mt-1">
                Última actualización: Marzo 2026
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12">
        <div className="container-app max-w-4xl">
          <div className="prose prose-slate dark:prose-invert max-w-none">
            
            <h2>1. Aceptación de los Términos</h2>
            <p>
              Al acceder y utilizar la plataforma Bookvia ("la Plataforma"), usted acepta estar sujeto a estos 
              Términos y Condiciones de Uso. Si no está de acuerdo con alguna parte de estos términos, 
              no podrá acceder al servicio.
            </p>

            <h2>2. Descripción del Servicio</h2>
            <p>
              Bookvia es una plataforma de marketplace que conecta a usuarios con proveedores de servicios 
              profesionales. Facilitamos la reservación de citas y el procesamiento de pagos, pero no somos 
              responsables directos de los servicios prestados por los negocios registrados.
            </p>

            <h2>3. Registro de Cuenta</h2>
            <p>Para utilizar ciertos servicios de la Plataforma, debe:</p>
            <ul>
              <li>Ser mayor de 18 años o contar con autorización de un tutor legal</li>
              <li>Proporcionar información veraz, precisa y actualizada</li>
              <li>Mantener la confidencialidad de su contraseña</li>
              <li>Notificarnos inmediatamente sobre cualquier uso no autorizado de su cuenta</li>
            </ul>

            <h2>4. Reservaciones y Pagos</h2>
            <h3>4.1 Proceso de Reservación</h3>
            <p>
              Al realizar una reservación a través de Bookvia, usted acepta las políticas específicas del 
              negocio seleccionado, incluyendo sus políticas de cancelación y reembolso.
            </p>
            
            <h3>4.2 Anticipos y Depósitos</h3>
            <p>
              Algunos negocios requieren un anticipo para confirmar la reservación. Este anticipo será 
              procesado a través de Stripe, nuestro procesador de pagos seguro. Las políticas de reembolso 
              del anticipo varían según cada negocio.
            </p>
            
            <h3>4.3 Comisiones</h3>
            <p>
              Bookvia cobra una comisión del 8% sobre las transacciones procesadas a través de la plataforma. 
              Esta comisión es asumida por los negocios, no por los usuarios finales.
            </p>

            <h2>5. Cancelaciones y Reembolsos</h2>
            <p>
              Las políticas de cancelación son establecidas por cada negocio individual. Le recomendamos 
              revisar estas políticas antes de confirmar su reservación. En general:
            </p>
            <ul>
              <li>Cancelaciones con más de 24 horas de anticipación: reembolso completo del anticipo</li>
              <li>Cancelaciones con menos de 24 horas: sujeto a la política del negocio</li>
              <li>No presentarse (no-show): el anticipo generalmente no es reembolsable</li>
            </ul>

            <h2>6. Obligaciones de los Negocios</h2>
            <p>Los negocios registrados en Bookvia se comprometen a:</p>
            <ul>
              <li>Proporcionar información precisa sobre sus servicios y precios</li>
              <li>Cumplir con las citas reservadas</li>
              <li>Mantener los estándares de calidad y profesionalismo</li>
              <li>Cumplir con todas las leyes y regulaciones aplicables</li>
              <li>Contar con los permisos y licencias necesarios para operar</li>
            </ul>

            <h2>7. Conducta del Usuario</h2>
            <p>Al usar la Plataforma, usted acepta no:</p>
            <ul>
              <li>Violar ninguna ley o regulación aplicable</li>
              <li>Proporcionar información falsa o engañosa</li>
              <li>Interferir con el funcionamiento de la Plataforma</li>
              <li>Acosar, amenazar o discriminar a otros usuarios o negocios</li>
              <li>Utilizar la Plataforma para fines fraudulentos</li>
            </ul>

            <h2>8. Propiedad Intelectual</h2>
            <p>
              Todo el contenido de la Plataforma, incluyendo pero no limitado a textos, gráficos, logos, 
              imágenes y software, es propiedad de Bookvia o sus licenciantes y está protegido por las 
              leyes de propiedad intelectual.
            </p>

            <h2>9. Limitación de Responsabilidad</h2>
            <p>
              Bookvia actúa únicamente como intermediario entre usuarios y negocios. No somos responsables de:
            </p>
            <ul>
              <li>La calidad de los servicios prestados por los negocios</li>
              <li>Disputas entre usuarios y negocios</li>
              <li>Daños directos, indirectos o consecuentes derivados del uso de la Plataforma</li>
              <li>Interrupciones del servicio por causas ajenas a nuestro control</li>
            </ul>

            <h2>10. Resolución de Disputas</h2>
            <p>
              En caso de disputas entre usuarios y negocios, Bookvia puede actuar como mediador, pero 
              la resolución final es responsabilidad de las partes involucradas. Para disputas con Bookvia, 
              se aplicará la jurisdicción de los tribunales de la Ciudad de México.
            </p>

            <h2>11. Modificaciones</h2>
            <p>
              Nos reservamos el derecho de modificar estos Términos y Condiciones en cualquier momento. 
              Los cambios entrarán en vigor inmediatamente después de su publicación en la Plataforma. 
              Su uso continuado constituye la aceptación de los términos modificados.
            </p>

            <h2>12. Terminación</h2>
            <p>
              Podemos suspender o terminar su acceso a la Plataforma en cualquier momento, con o sin causa, 
              con o sin previo aviso. Usted puede cancelar su cuenta en cualquier momento contactándonos.
            </p>

            <h2>13. Contacto</h2>
            <p>
              Para preguntas sobre estos Términos y Condiciones, contáctenos en:
            </p>
            <ul>
              <li>Email: <a href="mailto:legal@bookvia.com" className="text-coral hover:underline">legal@bookvia.com</a></li>
              <li>Teléfono: +52 55 1234 5678</li>
              <li>Dirección: Ciudad de México, México</li>
            </ul>

            <div className="mt-12 p-6 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground">
                Al utilizar Bookvia, usted reconoce haber leído, entendido y aceptado estos 
                Términos y Condiciones en su totalidad.
              </p>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
