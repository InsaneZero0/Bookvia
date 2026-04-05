import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { authAPI } from '@/lib/api';
import { BookviaLogo } from '@/components/BookviaLogo';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, Building2, UserCog, Shield, User, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { t, language } = useI18n();
  const { login, businessLogin, managerLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState('user'); // 'user' | 'business_owner' | 'business_admin'

  // Manager login state
  const [managers, setManagers] = useState([]);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [pin, setPin] = useState('');
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [managersLoaded, setManagersLoaded] = useState(false);

  const isBusinessTab = loginMode === 'business_owner' || loginMode === 'business_admin';

  const fetchManagers = async (businessEmail) => {
    if (!businessEmail) return;
    setLoadingManagers(true);
    try {
      const res = await authAPI.getBusinessManagers(businessEmail);
      const list = Array.isArray(res.data) ? res.data : [];
      setManagers(list);
      setManagersLoaded(true);
      if (list.length === 0) {
        toast.info(language === 'es' ? 'No hay administradores registrados para este negocio' : 'No administrators registered for this business');
      }
    } catch {
      setManagers([]);
      setManagersLoaded(true);
    } finally {
      setLoadingManagers(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (loginMode === 'business_admin') {
        if (!selectedManagerId) {
          toast.error(language === 'es' ? 'Selecciona un administrador' : 'Select an administrator');
          setLoading(false);
          return;
        }
        if (!pin) {
          toast.error(language === 'es' ? 'Ingresa tu PIN' : 'Enter your PIN');
          setLoading(false);
          return;
        }
        await managerLogin(email, selectedManagerId, pin);
        navigate('/business/dashboard');
      } else if (loginMode === 'business_owner') {
        await businessLogin(email, password);
        navigate('/business/dashboard');
      } else {
        await login(email, password);
        navigate(from);
      }
      toast.success(language === 'es' ? '¡Bienvenido!' : 'Welcome!');
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail === 'email_not_verified') {
        toast.error(language === 'es' ? 'Debes verificar tu correo electrónico primero. Revisa tu bandeja de entrada.' : 'You must verify your email first. Check your inbox.');
        // Offer to resend
        try {
          await authAPI.resendVerification({ email });
          toast.info(language === 'es' ? 'Te hemos reenviado el correo de verificación' : 'We resent the verification email');
        } catch {}
      } else {
        const message = detail || (language === 'es' ? 'Credenciales inválidas' : 'Invalid credentials');
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="login-page">
      <div className="w-full max-w-md">
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
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                  loginMode === 'user'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => { setLoginMode('user'); setManagersLoaded(false); setManagers([]); setSelectedManagerId(''); setPin(''); }}
                data-testid="user-login-tab"
              >
                <User className="h-4 w-4" />
                {language === 'es' ? 'Usuario' : 'User'}
              </button>
              <button
                type="button"
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                  isBusinessTab
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => { setLoginMode('business_owner'); setManagersLoaded(false); setManagers([]); setSelectedManagerId(''); setPin(''); }}
                data-testid="business-login-tab"
              >
                <Building2 className="h-4 w-4" />
                {language === 'es' ? 'Negocio' : 'Business'}
              </button>
            </div>

            {/* Sub-toggle: Owner / Administrator (only for business) */}
            {isBusinessTab && (
              <div className="flex rounded-lg border border-border p-0.5 gap-0.5">
                <button
                  type="button"
                  className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    loginMode === 'business_owner'
                      ? 'bg-[#F05D5E] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  onClick={() => { setLoginMode('business_owner'); setPin(''); }}
                  data-testid="owner-login-tab"
                >
                  <Shield className="h-3.5 w-3.5" />
                  {language === 'es' ? 'Soy el dueño' : "I'm the owner"}
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    loginMode === 'business_admin'
                      ? 'bg-[#F05D5E] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  onClick={() => { setLoginMode('business_admin'); setPassword(''); }}
                  data-testid="admin-login-tab"
                >
                  <UserCog className="h-3.5 w-3.5" />
                  {language === 'es' ? 'Soy administrador' : "I'm an administrator"}
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email - always shown */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  {loginMode === 'business_admin'
                    ? (language === 'es' ? 'Email del negocio' : 'Business email')
                    : t('auth.email')}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={loginMode === 'business_admin' ? (language === 'es' ? 'email@delnegocio.com' : 'business@email.com') : 'tu@email.com'}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (loginMode === 'business_admin') { setManagersLoaded(false); setManagers([]); setSelectedManagerId(''); } }}
                    className="pl-10 h-12"
                    required
                    data-testid="email-input"
                  />
                </div>
              </div>

              {/* Manager login: Fetch managers button + select + PIN */}
              {loginMode === 'business_admin' && (
                <>
                  {/* Fetch managers */}
                  {!managersLoaded && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => fetchManagers(email)}
                      disabled={!email || loadingManagers}
                      data-testid="fetch-managers-btn"
                    >
                      {loadingManagers ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{language === 'es' ? 'Buscando...' : 'Searching...'}</>
                      ) : (
                        <>{language === 'es' ? 'Buscar mi cuenta' : 'Find my account'}</>
                      )}
                    </Button>
                  )}

                  {/* Manager select dropdown */}
                  {managersLoaded && managers.length > 0 && (
                    <div className="space-y-2">
                      <Label>{language === 'es' ? 'Selecciona tu nombre' : 'Select your name'}</Label>
                      <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                        <SelectTrigger className="h-12" data-testid="manager-select">
                          <SelectValue placeholder={language === 'es' ? 'Seleccionar administrador...' : 'Select administrator...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {managers.map(m => (
                            <SelectItem key={m.id} value={m.id} data-testid={`manager-option-${m.id}`}>
                              <div className="flex items-center gap-2">
                                <UserCog className="h-4 w-4 text-amber-500" />
                                {m.name}
                                {!m.has_pin && (
                                  <span className="text-[10px] text-red-500 ml-1">{language === 'es' ? '(sin PIN)' : '(no PIN)'}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {managersLoaded && managers.length === 0 && (
                    <div className="text-center py-4 border border-dashed rounded-lg">
                      <UserCog className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {language === 'es' ? 'No se encontraron administradores para este negocio' : 'No administrators found for this business'}
                      </p>
                      <Button type="button" variant="link" size="sm" onClick={() => { setManagersLoaded(false); setEmail(''); }} className="mt-1 text-[#F05D5E]">
                        {language === 'es' ? 'Intentar con otro email' : 'Try another email'}
                      </Button>
                    </div>
                  )}

                  {/* PIN input */}
                  {selectedManagerId && (
                    <div className="space-y-2">
                      <Label htmlFor="pin">{language === 'es' ? 'Tu PIN de acceso' : 'Your access PIN'}</Label>
                      <div className="relative">
                        <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="pin"
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="••••"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="pl-10 h-12"
                          required
                          data-testid="pin-input"
                          data-no-capitalize="true"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Password - only for user and owner */}
              {loginMode !== 'business_admin' && (
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
                      data-no-capitalize="true"
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
              )}

              <Button
                type="submit"
                className="w-full h-12 btn-coral text-lg"
                disabled={loading || (loginMode === 'business_admin' && (!selectedManagerId || !pin))}
                data-testid="login-submit"
              >
                {loading ? (language === 'es' ? 'Ingresando...' : 'Signing in...') : t('auth.login.button')}
              </Button>
            </form>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t('auth.noAccount')} </span>
              <Link
                to={isBusinessTab ? '/business/register' : '/register'}
                className="text-[#F05D5E] font-medium hover:underline"
                data-testid="register-link"
              >
                {t('nav.register')}
              </Link>
            </div>

            {/* Admin login link */}
            {loginMode === 'user' && (
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
