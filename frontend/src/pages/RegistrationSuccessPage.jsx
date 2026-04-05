import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookviaLogo } from '@/components/BookviaLogo';
import { useI18n } from '@/lib/i18n';
import { authAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Mail, CheckCircle2, RefreshCw } from 'lucide-react';

export default function RegistrationSuccessPage() {
  const { language } = useI18n();
  const location = useLocation();
  const email = new URLSearchParams(location.search).get('email') || '';
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await authAPI.resendVerification({ email });
      toast.success(language === 'es' ? 'Correo reenviado' : 'Email resent');
    } catch {
      toast.error(language === 'es' ? 'Error al reenviar' : 'Error resending');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="registration-success-page">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl text-center">
          <CardHeader className="pb-2 pt-8">
            <Link to="/" className="inline-block mb-4">
              <BookviaLogo variant="light" size="text-3xl" />
            </Link>
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-heading">
              {language === 'es' ? '¡Registro completado!' : 'Registration complete!'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pb-8">
            <p className="text-muted-foreground text-sm">
              {language === 'es'
                ? 'Hemos enviado un correo de verificación a:'
                : 'We sent a verification email to:'}
            </p>
            {email && (
              <div className="bg-muted/50 rounded-lg py-3 px-4">
                <p className="font-semibold text-base">{email}</p>
              </div>
            )}
            <p className="text-muted-foreground text-sm">
              {language === 'es'
                ? 'Haz clic en el botón del correo para verificar tu cuenta y poder iniciar sesión.'
                : 'Click the button in the email to verify your account and log in.'}
            </p>
            <div className="border-t border-border pt-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                {language === 'es' ? '¿No recibiste el correo?' : "Didn't receive the email?"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResend}
                disabled={resending || !email}
                data-testid="resend-verification-btn"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${resending ? 'animate-spin' : ''}`} />
                {resending
                  ? (language === 'es' ? 'Reenviando...' : 'Resending...')
                  : (language === 'es' ? 'Reenviar correo' : 'Resend email')}
              </Button>
              <p className="text-xs text-muted-foreground/60">
                {language === 'es' ? 'Revisa también tu carpeta de spam' : 'Also check your spam folder'}
              </p>
            </div>
            <Link to="/login" className="inline-block mt-4">
              <Button variant="ghost" className="text-[#F05D5E]" data-testid="go-to-login-btn">
                {language === 'es' ? 'Ir a iniciar sesión' : 'Go to login'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
