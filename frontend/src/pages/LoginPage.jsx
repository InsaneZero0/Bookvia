import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { BookviaLogo } from '@/components/BookviaLogo';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, Building2 } from 'lucide-react';

export default function LoginPage() {
  const { t, language } = useI18n();
  const { login, businessLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBusinessLogin, setIsBusinessLogin] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isBusinessLogin) {
        await businessLogin(email, password);
        navigate('/business/dashboard');
      } else {
        await login(email, password);
        navigate(from);
      }
      toast.success(language === 'es' ? '¡Bienvenido!' : 'Welcome!');
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Credenciales inválidas' : 'Invalid credentials');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="login-page">
      <div className="w-full max-w-md">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6"
          data-testid="back-to-home"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {language === 'es' ? 'Volver al inicio' : 'Back to home'}
        </Button>

        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-2">
            <Link to="/" className="inline-block mb-4">
              <BookviaLogo variant="light" size="text-3xl" />
            </Link>
            <CardTitle className="text-2xl font-heading">{t('auth.login.title')}</CardTitle>
            <CardDescription>{t('auth.login.subtitle')}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Toggle User/Business */}
            <div className="flex rounded-xl bg-muted p-1">
              <button
                type="button"
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  !isBusinessLogin 
                    ? 'bg-background shadow-sm text-foreground' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setIsBusinessLogin(false)}
                data-testid="user-login-tab"
              >
                {language === 'es' ? 'Usuario' : 'User'}
              </button>
              <button
                type="button"
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  isBusinessLogin 
                    ? 'bg-background shadow-sm text-foreground' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setIsBusinessLogin(true)}
                data-testid="business-login-tab"
              >
                <Building2 className="h-4 w-4" />
                {language === 'es' ? 'Negocio' : 'Business'}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
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
                    data-testid="email-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <Link 
                    to="/forgot-password" 
                    className="text-sm text-[#F05D5E] hover:underline"
                  >
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
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
                    data-testid="password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 btn-coral text-lg"
                disabled={loading}
                data-testid="login-submit"
              >
                {loading ? (language === 'es' ? 'Ingresando...' : 'Signing in...') : t('auth.login.button')}
              </Button>
            </form>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t('auth.noAccount')} </span>
              <Link 
                to={isBusinessLogin ? '/business/register' : '/register'} 
                className="text-[#F05D5E] font-medium hover:underline"
                data-testid="register-link"
              >
                {t('nav.register')}
              </Link>
            </div>

            {/* Admin login link */}
            {!isBusinessLogin && (
              <div className="text-center text-sm border-t border-border pt-4">
                <Link 
                  to="/admin/login" 
                  className="text-muted-foreground hover:text-foreground"
                >
                  {language === 'es' ? 'Acceso administrador' : 'Admin access'}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
