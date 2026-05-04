import { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const STORAGE_KEY = 'bookvia_beta_banner_dismissed_v1';

/**
 * Top banner announcing the beta scope. Dismissible; remembers choice in
 * localStorage. Keeps the promise realistic so users coming from Monterrey
 * or Guadalajara don't churn when they see empty search results.
 *
 * Renders as a `fixed` bar at z-[60] so it sits above the `fixed z-50`
 * Navbar. Exposes its height via the `--beta-banner-h` CSS variable so
 * the Navbar can offset itself accordingly (see `index.css`).
 */
export function BetaBanner() {
  const { language } = useI18n();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const isDismissed = localStorage.getItem(STORAGE_KEY) === '1';
    setDismissed(isDismissed);
    const h = isDismissed ? '0px' : '36px';
    document.documentElement.style.setProperty('--beta-banner-h', h);
    return () => { document.documentElement.style.setProperty('--beta-banner-h', '0px'); };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
    document.documentElement.style.setProperty('--beta-banner-h', '0px');
  };

  if (dismissed) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-slate-900 via-slate-800 to-[#F05D5E] text-white"
      data-testid="beta-banner"
      style={{ height: '36px' }}
    >
      <div className="container-app flex items-center justify-between gap-3 h-full py-1.5">
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-[#fcf7ba]" />
          <p className="leading-tight">
            {language === 'es' ? (
              <>
                <span className="font-bold">Bookvia esta en beta en CDMX.</span>{' '}
                <span className="hidden sm:inline">Si tu ciudad aun no aparece, dejanos saber desde</span>
                <span className="sm:hidden">Escribenos desde</span>{' '}
                <a href="/help" className="underline underline-offset-2 hover:text-[#fcf7ba] font-semibold">
                  /help
                </a>
                {' '}· {language === 'es' ? 'abrimos nuevas zonas cada mes' : 'we open new zones every month'}.
              </>
            ) : (
              <>
                <span className="font-bold">Bookvia is in beta in Mexico City.</span>{' '}
                <span className="hidden sm:inline">If your city is not listed yet, tell us via</span>
                <span className="sm:hidden">Reach us via</span>{' '}
                <a href="/help" className="underline underline-offset-2 hover:text-[#fcf7ba] font-semibold">
                  /help
                </a>
                . We open new areas every month.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-md hover:bg-white/10 transition-colors shrink-0"
          aria-label={language === 'es' ? 'Cerrar aviso' : 'Dismiss notice'}
          data-testid="beta-banner-dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
