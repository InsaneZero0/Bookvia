import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookviaLogo } from '@/components/BookviaLogo';
import { useI18n } from '@/lib/i18n';
import { authAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { language } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authAPI.forgotPassword({ email });
      setSent(true);
    } catch {
      toast.error(language === 'es' ? 'Error al enviar el correo' : 'Error sending email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="forgot-password-page">
      <div className="w-full max-w-md">
        <Link to="/login">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {language === 'es' ? 'Volver al login' : 'Back to login'}
          </Button>
        </Link>

        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-2">
            <Link to="/" className="inline-block mb-4">
              <BookviaLogo variant="light" size="text-3xl" />
            </Link>

            {!sent ? (
              <>
                <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
                  <Mail className="h-7 w-7 text-blue-600" />
                </div>
                <CardTitle className="text-xl font-heading">
                  {language === 'es' ? '¿Olvidaste tu contraseña?' : 'Forgot your password?'}
                </CardTitle>
              </>
            ) : (
              <>
                <div className="mx-auto w-14 h-14 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-7 w-7 text-green-600" />
                </div>
                <CardTitle className="text-xl font-heading">
                  {language === 'es' ? '¡Correo enviado!' : 'Email sent!'}
                </CardTitle>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-5 pb-8">
            {!sent ? (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  {language === 'es'
                    ? 'Ingresa tu email y te enviaremos instrucciones para restablecer tu contraseña.'
                    : 'Enter your email and we will send you instructions to reset your password.'}
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="tu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-12"
                        required
                        data-testid="forgot-email-input"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12 btn-coral" disabled={loading} data-testid="forgot-submit-btn">
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{language === 'es' ? 'Enviando...' : 'Sending...'}</>
                    ) : (
                      language === 'es' ? 'Enviar instrucciones' : 'Send instructions'
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  {language === 'es'
                    ? 'Si existe una cuenta con ese correo, recibirás un email con un enlace para restablecer tu contraseña.'
                    : 'If an account exists with that email, you will receive an email with a link to reset your password.'}
                </p>
                <div className="bg-muted/50 rounded-lg py-3 px-4 text-center">
                  <p className="font-semibold text-base">{email}</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {language === 'es' ? 'Revisa también tu carpeta de spam. El enlace expira en 1 hora.' : 'Also check your spam folder. The link expires in 1 hour.'}
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setSent(false); setEmail(''); }} data-testid="try-another-email-btn">
                    {language === 'es' ? 'Intentar con otro email' : 'Try another email'}
                  </Button>
                  <Link to="/login" className="w-full">
                    <Button variant="ghost" className="w-full text-[#F05D5E]" data-testid="back-to-login-btn">
                      {language === 'es' ? 'Volver al login' : 'Back to login'}
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
