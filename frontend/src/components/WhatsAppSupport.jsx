/**
 * Reusable WhatsApp support entry point for BUSINESS users only.
 *
 * Two presentations:
 *   - Floating round button (FAB) anchored bottom-right, mounted globally
 *     inside Layout when the authenticated user has role==='business'.
 *   - Inline button used inside cards (Settings, Finance, KYC alerts, etc).
 *
 * Pre-fills a context-aware message so the agent on WhatsApp Business can
 * identify the business immediately without asking for credentials.
 */
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

const WA_NUMBER = process.env.REACT_APP_WHATSAPP_SUPPORT || '524425013331';

const WaIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function buildWaUrl(message) {
  const url = new URL(`https://wa.me/${WA_NUMBER}`);
  if (message) url.searchParams.set('text', message);
  return url.toString();
}

function buildPrefill({ user, language, context, businessName, publicCode }) {
  const greeting = language === 'es' ? 'Hola Bookvia, soy' : 'Hi Bookvia, I am';
  const help = language === 'es' ? 'Necesito ayuda con' : 'I need help with';
  const code = publicCode ? ` (${publicCode})` : '';
  const name = businessName || user?.email || (language === 'es' ? 'mi negocio' : 'my business');
  const ctxLine = context ? `\n${help}: ${context}` : `\n${help}: `;
  return `${greeting} ${name}${code}.${ctxLine}`;
}

/**
 * Inline button — drop anywhere inside a card or section.
 * Props:
 *   context?: string — short topic hint that gets appended to the prefilled message
 *   businessName, publicCode — to identify the user in the message
 *   variant — Shadcn button variant
 *   size — Shadcn button size
 *   className — extra classes
 *   children — optional custom label (defaults to "Escríbenos por WhatsApp")
 */
export function WhatsAppSupportButton({
  context, businessName, publicCode,
  variant = 'outline', size = 'sm', className = '', children, dataTestId = 'whatsapp-support-btn',
}) {
  const { language } = useI18n();
  const { user } = useAuth();
  const message = buildPrefill({ user, language, context, businessName, publicCode });
  const href = buildWaUrl(message);
  const label = children || (language === 'es' ? 'Escríbenos por WhatsApp' : 'Message us on WhatsApp');

  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={`gap-1.5 ${variant === 'outline' ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-800' : ''} ${className}`}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={dataTestId}
      >
        <WaIcon className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

/**
 * Floating bottom-right circular FAB. Only mounted when role==='business'.
 * Includes a tooltip-style label that appears on hover.
 */
export function WhatsAppFloatingButton({ businessName, publicCode }) {
  const { language } = useI18n();
  const { user } = useAuth();

  // Only show for authenticated business owners (not managers, not customers, not admins)
  if (!user || user.role !== 'business') return null;

  const message = buildPrefill({
    user, language,
    context: language === 'es' ? '(escribir aquí)' : '(write here)',
    businessName, publicCode,
  });
  const href = buildWaUrl(message);
  const tooltip = language === 'es' ? '¿Dudas? Escríbenos' : 'Need help? Message us';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={tooltip}
      className="group fixed bottom-6 right-6 z-40 flex items-center"
      data-testid="whatsapp-floating-btn"
    >
      <span className="hidden sm:block bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-l-full shadow-lg opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 whitespace-nowrap">
        {tooltip}
      </span>
      <span className="bg-[#25D366] hover:bg-[#22c55e] text-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
        <WaIcon className="h-7 w-7" />
      </span>
    </a>
  );
}
