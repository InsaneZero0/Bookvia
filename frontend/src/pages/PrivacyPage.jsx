import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function PrivacyPage() {
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
            <span className="text-white">Política de Privacidad</span>
          </nav>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-teal/20 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-teal" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold">
                Política de Privacidad
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
            
            <p className="lead text-lg text-muted-foreground">
              En Bookvia, nos comprometemos a proteger su privacidad. Esta Política de Privacidad 
              explica cómo recopilamos, usamos, compartimos y protegemos su información personal.
            </p>

            <h2>1. Información que Recopilamos</h2>
            
            <h3>1.1 Información que usted proporciona</h3>
            <ul>
              <li><strong>Datos de registro:</strong> nombre, correo electrónico, número de teléfono, contraseña</li>
              <li><strong>Información de perfil:</strong> foto de perfil, preferencias de idioma</li>
              <li><strong>Datos de pago:</strong> información de tarjetas procesada de forma segura por Stripe</li>
              <li><strong>Comunicaciones:</strong> mensajes enviados a través de la plataforma o soporte</li>
            </ul>

            <h3>1.2 Información recopilada automáticamente</h3>
            <ul>
              <li><strong>Datos de uso:</strong> páginas visitadas, acciones realizadas, tiempo de sesión</li>
              <li><strong>Datos del dispositivo:</strong> tipo de dispositivo, sistema operativo, navegador</li>
              <li><strong>Datos de ubicación:</strong> ubicación aproximada basada en IP (para mostrar negocios cercanos)</li>
              <li><strong>Cookies:</strong> para mantener sesiones y preferencias</li>
            </ul>

            <h3>1.3 Información de negocios</h3>
            <p>Para negocios registrados, también recopilamos:</p>
            <ul>
              <li>Nombre legal y comercial de la empresa</li>
              <li>RFC y documentos fiscales</li>
              <li>Identificación oficial (INE) del representante</li>
              <li>Comprobante de domicilio</li>
              <li>Información bancaria (CLABE) para depósitos</li>
            </ul>

            <h2>2. Cómo Usamos su Información</h2>
            <p>Utilizamos la información recopilada para:</p>
            <ul>
              <li>Proporcionar y mejorar nuestros servicios</li>
              <li>Procesar reservaciones y pagos</li>
              <li>Enviar notificaciones sobre sus citas</li>
              <li>Comunicarnos con usted sobre su cuenta</li>
              <li>Prevenir fraudes y garantizar la seguridad</li>
              <li>Cumplir con obligaciones legales</li>
              <li>Personalizar su experiencia en la plataforma</li>
              <li>Analizar el uso de la plataforma para mejoras</li>
            </ul>

            <h2>3. Cómo Compartimos su Información</h2>
            
            <h3>3.1 Con negocios</h3>
            <p>
              Compartimos su nombre, teléfono y detalles de la reservación con el negocio donde 
              usted reserva para que puedan proporcionarle el servicio.
            </p>

            <h3>3.2 Con proveedores de servicios</h3>
            <p>Trabajamos con terceros que nos ayudan a operar la plataforma:</p>
            <ul>
              <li><strong>Stripe:</strong> procesamiento de pagos</li>
              <li><strong>MongoDB Atlas:</strong> almacenamiento de datos</li>
              <li><strong>Twilio:</strong> verificación por SMS (cuando está activo)</li>
              <li><strong>Resend:</strong> envío de correos electrónicos</li>
            </ul>

            <h3>3.3 Por requerimiento legal</h3>
            <p>
              Podemos divulgar información si es requerido por ley, proceso legal, o solicitud 
              gubernamental válida.
            </p>

            <h3>3.4 No vendemos su información</h3>
            <p>
              <strong>Nunca vendemos, alquilamos ni comercializamos su información personal a terceros 
              con fines de marketing.</strong>
            </p>

            <h2>4. Seguridad de los Datos</h2>
            <p>Implementamos medidas de seguridad para proteger su información:</p>
            <ul>
              <li>Encriptación SSL/TLS para todas las comunicaciones</li>
              <li>Almacenamiento seguro de contraseñas con hash bcrypt</li>
              <li>Autenticación de dos factores (2FA) para administradores</li>
              <li>Acceso restringido a datos personales</li>
              <li>Monitoreo continuo de seguridad</li>
              <li>Cumplimiento con PCI DSS a través de Stripe</li>
            </ul>

            <h2>5. Retención de Datos</h2>
            <p>Conservamos su información mientras:</p>
            <ul>
              <li>Su cuenta esté activa</li>
              <li>Sea necesario para proporcionar servicios</li>
              <li>Sea requerido por ley (datos fiscales: 5 años)</li>
              <li>Sea necesario para resolver disputas</li>
            </ul>
            <p>
              Después de eliminar su cuenta, podemos retener ciertos datos de forma anónima 
              para análisis estadísticos.
            </p>

            <h2>6. Sus Derechos</h2>
            <p>Usted tiene derecho a:</p>
            <ul>
              <li><strong>Acceder:</strong> solicitar una copia de sus datos personales</li>
              <li><strong>Rectificar:</strong> corregir información inexacta o incompleta</li>
              <li><strong>Eliminar:</strong> solicitar la eliminación de sus datos</li>
              <li><strong>Portabilidad:</strong> recibir sus datos en formato estructurado</li>
              <li><strong>Oposición:</strong> oponerse al procesamiento de sus datos</li>
              <li><strong>Revocar consentimiento:</strong> retirar su consentimiento en cualquier momento</li>
            </ul>
            <p>
              Para ejercer estos derechos, contáctenos en{' '}
              <a href="mailto:privacidad@bookvia.com" className="text-coral hover:underline">
                privacidad@bookvia.com
              </a>
            </p>

            <h2>7. Cookies y Tecnologías Similares</h2>
            <p>Utilizamos cookies para:</p>
            <ul>
              <li>Mantener su sesión iniciada</li>
              <li>Recordar sus preferencias</li>
              <li>Analizar el uso de la plataforma</li>
              <li>Mejorar la seguridad</li>
            </ul>
            <p>
              Puede configurar su navegador para rechazar cookies, pero esto puede afectar 
              la funcionalidad de la plataforma.
            </p>

            <h2>8. Menores de Edad</h2>
            <p>
              Bookvia no está dirigido a menores de 18 años. No recopilamos intencionalmente 
              información de menores. Si descubrimos que hemos recopilado datos de un menor, 
              los eliminaremos de inmediato.
            </p>

            <h2>9. Transferencias Internacionales</h2>
            <p>
              Sus datos pueden ser procesados en servidores ubicados fuera de México. 
              Nos aseguramos de que cualquier transferencia internacional cumpla con las 
              leyes de protección de datos aplicables.
            </p>

            <h2>10. Cambios a esta Política</h2>
            <p>
              Podemos actualizar esta Política de Privacidad ocasionalmente. Le notificaremos 
              sobre cambios significativos por correo electrónico o mediante un aviso en la 
              plataforma. Le recomendamos revisar esta política periódicamente.
            </p>

            <h2>11. Contacto</h2>
            <p>
              Si tiene preguntas sobre esta Política de Privacidad o sobre cómo manejamos 
              sus datos, contáctenos:
            </p>
            <ul>
              <li>Email: <a href="mailto:privacidad@bookvia.com" className="text-coral hover:underline">privacidad@bookvia.com</a></li>
              <li>Teléfono: +52 55 1234 5678</li>
              <li>Dirección: Ciudad de México, México</li>
            </ul>

            <div className="mt-12 p-6 bg-teal/10 rounded-xl border border-teal/20">
              <h3 className="text-lg font-semibold text-foreground mt-0">
                Compromiso con su Privacidad
              </h3>
              <p className="text-muted-foreground mb-0">
                En Bookvia, creemos que la privacidad es un derecho fundamental. Nos comprometemos 
                a ser transparentes sobre cómo usamos sus datos y a protegerlos con los más altos 
                estándares de seguridad.
              </p>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
