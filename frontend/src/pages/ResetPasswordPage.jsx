import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookviaLogo } from '@/components/BookviaLogo';
import { useI18n } from '@/lib/i18n';
import { authAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Lock, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error(language === 'es' ? 'Las contraseñas no coinciden' : 'Passwords do not match');
      return;
    }
    if (password.length < 6) {
      toast.error(language === 'es' ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await authAPI.resetPassword({ token, password });
      setSuccess(true);
      toast.success(language === 'es' ? '¡Contraseña actualizada!' : 'Password updated!');
    } catch (error) {
      const detail = error.response?.data?.detail || (language === 'es' ? 'Error al restablecer la contraseña' : 'Error resetting password');
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="reset-password-page">
        <Card className="border-0 shadow-xl text-center max-w-md w-full">
          <CardContent className="py-12">
            <BookviaLogo variant="light" size="text-3xl" />
            <p className="text-muted-foreground mt-6">{language === 'es' ? 'Enlace inválido. Solicita uno nuevo.' : 'Invalid link. Request a new one.'}</p>
            <Link to="/forgot-password">
              <Button className="btn-coral mt-4" data-testid="request-new-link-btn">{language === 'es' ? 'Solicitar nuevo enlace' : 'Request new link'}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="reset-password-page">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-2">
            <Link to="/" className="inline-block mb-4">
              <BookviaLogo variant="light" size="text-3xl" />
            </Link>

            {!success ? (
              <>
                <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
                  <Lock className="h-7 w-7 text-blue-600" />
                </div>
                <CardTitle className="text-xl font-heading">
                  {language === 'es' ? 'Nueva contraseña' : 'New password'}
                </CardTitle>
              </>
            ) : (
              <>
                <div className="mx-auto w-14 h-14 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-7 w-7 text-green-600" />
                </div>
                <CardTitle className="text-xl font-heading">
                  {language === 'es' ? '¡Contraseña actualizada!' : 'Password updated!'}
                </CardTitle>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-5 pb-8">
            {!success ? (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  {language === 'es' ? 'Ingresa tu nueva contraseña.' : 'Enter your new password.'}
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">{language === 'es' ? 'Nueva contraseña' : 'New password'}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 h-12"
                        required
                        minLength={6}
                        data-testid="new-password-input"
                        data-no-capitalize="true"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{language === 'es' ? 'Confirmar contraseña' : 'Confirm password'}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 h-12"
                        required
                        minLength={6}
                        data-testid="confirm-password-input"
                        data-no-capitalize="true"
                      />
                    </div>
                  </div>
                  {password && confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-500">{language === 'es' ? 'Las contraseñas no coinciden' : 'Passwords do not match'}</p>
                  )}
                  {password && confirmPassword && password === confirmPassword && password.length >= 6 && (
                    <p className="text-xs text-green-600">{language === 'es' ? 'Las contraseñas coinciden' : 'Passwords match'}</p>
                  )}
                  <Button type="submit" className="w-full h-12 btn-coral" disabled={loading || password !== confirmPassword || password.length < 6} data-testid="reset-submit-btn">
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{language === 'es' ? 'Guardando...' : 'Saving...'}</>
                    ) : (
                      language === 'es' ? 'Guardar nueva contraseña' : 'Save new password'
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  {language === 'es' ? 'Tu contraseña ha sido actualizada. Ya puedes iniciar sesión con tu nueva contraseña.' : 'Your password has been updated. You can now log in with your new password.'}
                </p>
                <Button className="btn-coral w-full h-12" onClick={() => navigate('/login')} data-testid="go-to-login-btn">
                  {language === 'es' ? 'Iniciar sesión' : 'Log in'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
