import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookviaLogo } from '@/components/BookviaLogo';
import { useI18n } from '@/lib/i18n';
import { authAPI } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function VerifyEmailPage() {
  const { language } = useI18n();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // loading | success | already | error

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    const verify = async () => {
      try {
        const res = await authAPI.verifyEmail(token);
        setStatus(res.data?.already_verified ? 'already' : 'success');
      } catch {
        setStatus('error');
      }
    };
    verify();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="verify-email-page">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl text-center">
          <CardHeader className="pb-2 pt-8">
            <Link to="/" className="inline-block mb-4">
              <BookviaLogo variant="light" size="text-3xl" />
            </Link>

            {status === 'loading' && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                </div>
                <CardTitle className="text-2xl font-heading">
                  {language === 'es' ? 'Verificando...' : 'Verifying...'}
                </CardTitle>
              </>
            )}

            {(status === 'success' || status === 'already') && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <CardTitle className="text-2xl font-heading">
                  {status === 'already'
                    ? (language === 'es' ? 'Email ya verificado' : 'Email already verified')
                    : (language === 'es' ? '¡Email verificado!' : 'Email verified!')}
                </CardTitle>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
                <CardTitle className="text-2xl font-heading">
                  {language === 'es' ? 'Error de verificación' : 'Verification error'}
                </CardTitle>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-5 pb-8">
            {(status === 'success' || status === 'already') && (
              <>
                <p className="text-muted-foreground text-sm">
                  {language === 'es'
                    ? 'Tu cuenta ha sido verificada correctamente. Ya puedes iniciar sesión.'
                    : 'Your account has been verified. You can now log in.'}
                </p>
                <Link to="/login">
                  <Button className="btn-coral w-full h-12 text-base" data-testid="go-to-login-btn">
                    {language === 'es' ? 'Iniciar sesión' : 'Log in'}
                  </Button>
                </Link>
              </>
            )}

            {status === 'error' && (
              <>
                <p className="text-muted-foreground text-sm">
                  {language === 'es'
                    ? 'El enlace de verificación es inválido o ha expirado. Intenta iniciar sesión para recibir un nuevo correo.'
                    : 'The verification link is invalid or expired. Try logging in to receive a new email.'}
                </p>
                <Link to="/login">
                  <Button variant="outline" className="w-full" data-testid="go-to-login-btn">
                    {language === 'es' ? 'Ir a iniciar sesión' : 'Go to login'}
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
