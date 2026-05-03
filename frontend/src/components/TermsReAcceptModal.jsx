/**
 * Fase 10 - Re-acceptance modal for updated Terms & Conditions.
 *
 * Mounts at app root (inside AuthProvider). For authenticated users it
 * polls GET /api/terms/me once and, if up_to_date is false, shows a modal:
 *   - dismissible (softer banner mode) during the grace window
 *   - non-dismissible (hard block) after grace_period_ends_at
 *
 * Critical backend endpoints also return 409 {code: 'terms_outdated'} after
 * the grace window; the global axios interceptor uses that to force the
 * modal on top of any in-flight action.
 */
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { termsAPI } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

const DISMISS_KEY = 'bookvia_terms_modal_dismissed_until';
const DISMISS_HOURS = 12; // soft mode: don't nag more than once per 12h

export default function TermsReAcceptModal() {
  const { isAuthenticated, logout } = useAuth();
  const { language } = useI18n();
  const t = (es, en) => (language === 'es' ? es : en);

  const [status, setStatus] = useState(null);
  const [changelog, setChangelog] = useState([]);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [meRes, versionRes] = await Promise.all([
        termsAPI.myStatus(),
        termsAPI.getVersion(),
      ]);
      setStatus(meRes.data);
      setChangelog(versionRes.data?.changelog || []);

      if (meRes.data?.up_to_date) {
        setOpen(false);
        return;
      }

      // If we are inside grace, respect the local dismiss timer unless the
      // hard block has kicked in (which we always show).
      if (!meRes.data?.is_hard_block) {
        try {
          const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
          if (until && Date.now() < until) {
            setOpen(false);
            return;
          }
        } catch { /* ignore storage errors */ }
      }
      setOpen(true);
    } catch {
      // Silent - the user can still use the app; backend will 409 on
      // critical actions after the grace period anyway.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setOpen(false);
      return;
    }
    loadStatus();
  }, [isAuthenticated, loadStatus]);

  // Listen for the global 409 event that axios pushes when a critical
  // endpoint rejects the action due to outdated terms.
  useEffect(() => {
    const handler = () => loadStatus().then(() => setOpen(true));
    window.addEventListener('bookvia:terms_outdated', handler);
    return () => window.removeEventListener('bookvia:terms_outdated', handler);
  }, [loadStatus]);

  if (!open || !status) return null;

  const isHard = !!status.is_hard_block;
  const graceEnds = status.grace_period_ends_at
    ? new Date(status.grace_period_ends_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    try {
      await termsAPI.accept(status.current_version, 're_accept');
      toast.success(t('Gracias por aceptar los nuevos Terminos', 'Thanks for accepting the new Terms'));
      try { localStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
      setOpen(false);
      setStatus({ ...status, up_to_date: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error al aceptar', 'Error accepting'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (isHard) return;
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_HOURS * 3600 * 1000));
    } catch { /* ignore */ }
    setOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      data-testid="terms-reaccept-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className={`px-6 py-4 border-b flex items-start gap-3 ${isHard ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isHard ? 'bg-red-100' : 'bg-amber-100'}`}>
            {isHard ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <FileText className="w-5 h-5 text-amber-700" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-heading font-bold text-slate-900 dark:text-slate-100">
              {isHard
                ? t('Accion requerida: actualiza tus Terminos', 'Action required: update your Terms')
                : t('Actualizamos nuestros Terminos', 'We updated our Terms')}
            </h2>
            <p className={`text-xs mt-1 ${isHard ? 'text-red-700' : 'text-amber-800'}`}>
              {t('Version vigente:', 'Current version:')} <span className="font-mono">{status.current_version}</span>
              {!isHard && graceEnds && (
                <> · {t('Plazo hasta', 'Deadline')} <strong>{graceEnds}</strong></>
              )}
            </p>
          </div>
          {!isHard && (
            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-full p-1 hover:bg-black/5"
              aria-label={t('Cerrar', 'Close')}
              data-testid="terms-reaccept-dismiss"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {isHard
              ? t('Para poder continuar reservando, cobrando o actualizando datos, necesitamos que revises y aceptes la ultima version.',
                  'To keep booking, charging or updating data you need to review and accept the latest version.')
              : t('Tomate un momento para revisar los cambios. Puedes aceptar ahora o mas tarde, pero despues del plazo sera obligatorio para acciones criticas.',
                  'Take a moment to review the changes. You can accept now or later, but after the deadline it will be required for critical actions.')}
          </p>

          {changelog && changelog.length > 0 && (
            <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                {t('Resumen de cambios', 'Summary of changes')}
              </p>
              {changelog.slice(0, 2).map((entry) => (
                <div key={entry.version} className="text-xs text-slate-700 dark:text-slate-300">
                  <p className="font-mono text-[11px] text-slate-500 mb-0.5">v{entry.version}</p>
                  <p className="leading-relaxed">{language === 'es' ? entry.summary_es : entry.summary_en}</p>
                </div>
              ))}
            </div>
          )}

          <Link
            to="/terms"
            target="_blank"
            className="inline-flex items-center gap-1 text-sm text-[#F05D5E] font-medium hover:underline"
            data-testid="terms-reaccept-read-link"
          >
            {t('Leer Terminos completos', 'Read full Terms')} <ExternalLink className="w-3 h-3" />
          </Link>

          <label className="flex items-start gap-2 cursor-pointer select-none pt-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#F05D5E] cursor-pointer"
              data-testid="terms-reaccept-checkbox"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {t('He leido y acepto la version', 'I have read and accept version')}{' '}
              <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {status.current_version}
              </span>{' '}
              {t('de los Terminos y el Aviso de Privacidad.', 'of the Terms and Privacy Notice.')}
            </span>
          </label>
        </div>

        <div className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row gap-2 sm:justify-end">
          {isHard ? (
            <Button variant="outline" onClick={handleLogout} data-testid="terms-reaccept-logout">
              {t('Cerrar sesion', 'Sign out')}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleDismiss} data-testid="terms-reaccept-later">
              {t('Mas tarde', 'Later')}
            </Button>
          )}
          <Button
            className="btn-coral"
            onClick={handleAccept}
            disabled={!checked || submitting}
            data-testid="terms-reaccept-accept"
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            {submitting ? t('Guardando...', 'Saving...') : t('Aceptar y continuar', 'Accept and continue')}
          </Button>
        </div>
      </div>
    </div>
  );
}
