import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { ArrowLeft, Shield, Mail, Lock, Key } from 'lucide-react';

export default function AdminLoginPage() {
  const { language } = useI18n();
  const { adminLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (totpCode.length !== 6) {
      toast.error(language === 'es' ? 'Ingresa el código 2FA completo' : 'Enter the complete 2FA code');
      return;
    }

    setLoading(true);

    try {
      await adminLogin(email, password, totpCode);
      toast.success(language === 'es' ? '¡Bienvenido Admin!' : 'Welcome Admin!');
      navigate('/admin');
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Credenciales inválidas' : 'Invalid credentials');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-slate-900" data-testid="admin-login-page">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 text-white hover:bg-white/10"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {language === 'es' ? 'Volver al inicio' : 'Back to home'}
        </Button>

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-[#F05D5E] flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-heading text-white">Admin Access</CardTitle>
            <CardDescription className="text-slate-400">
              {language === 'es' ? 'Acceso restringido - Requiere 2FA' : 'Restricted access - 2FA required'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">{language === 'es' ? 'Correo' : 'Email'}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@bookvia.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    required
                    data-testid="admin-email-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-200">{language === 'es' ? 'Contraseña' : 'Password'}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    required
                    data-testid="admin-password-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200 flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  {language === 'es' ? 'Código 2FA' : '2FA Code'}
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={(value) => setTotpCode(value)}
                    data-testid="admin-totp-input"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={1} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={2} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={3} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={4} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={5} className="bg-slate-700 border-slate-600 text-white" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="text-xs text-center text-slate-500">
                  {language === 'es' 
                    ? 'Ingresa el código de tu app de autenticación'
                    : 'Enter the code from your authenticator app'}
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 btn-coral text-lg mt-6"
                disabled={loading}
                data-testid="admin-login-submit"
              >
                {loading ? (language === 'es' ? 'Verificando...' : 'Verifying...') : (language === 'es' ? 'Acceder' : 'Access')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
