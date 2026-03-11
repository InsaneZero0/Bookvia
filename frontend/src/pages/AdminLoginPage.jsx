import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { authAPI } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Shield, Mail, Lock, Key, Smartphone, CheckCircle2, Copy, AlertTriangle } from 'lucide-react';

export default function AdminLoginPage() {
  const { language } = useI18n();
  const { adminLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 2FA Setup states
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [setupStep, setSetupStep] = useState(1); // 1=show QR, 2=verify code, 3=show backup codes
  const [setupCode, setSetupCode] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);

  const handleInitialLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Single API call via auth context
      const result = await adminLogin(email, password, totpCode || '000000');
      
      // Check if 2FA setup is required
      if (result.requires_2fa_setup) {
        setTempToken(result.temp_token);
        await initiate2FASetup(result.temp_token);
        setShowSetup2FA(true);
      } else {
        toast.success(language === 'es' ? '¡Bienvenido Admin!' : 'Welcome Admin!');
        navigate('/admin');
      }
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Credenciales inválidas' : 'Invalid credentials');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const initiate2FASetup = async (token) => {
    try {
      const response = await authAPI.setup2FA(password, token);
      setQrCode(response.data.qr_code);
      setSecret(response.data.secret);
      setBackupCodes(response.data.backup_codes);
      setSetupStep(1);
    } catch (error) {
      toast.error(language === 'es' ? 'Error al configurar 2FA' : 'Error setting up 2FA');
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (setupCode.length !== 6) {
      toast.error(language === 'es' ? 'Ingresa el código de 6 dígitos' : 'Enter the 6-digit code');
      return;
    }
    
    setLoading(true);
    try {
      await authAPI.verify2FA(setupCode, tempToken);
      setSetupStep(3); // Show backup codes
      toast.success(language === 'es' ? '2FA configurado correctamente' : '2FA configured successfully');
    } catch (error) {
      toast.error(language === 'es' ? 'Código inválido' : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedCodes(true);
    toast.success(language === 'es' ? 'Códigos copiados' : 'Codes copied');
  };

  const handleFinishSetup = async () => {
    // Now login with the real 2FA
    try {
      // Use the first backup code or ask user to enter a new code
      toast.info(language === 'es' ? 'Ahora ingresa con tu código 2FA' : 'Now login with your 2FA code');
      setShowSetup2FA(false);
      setSetupStep(1);
      setTotpCode('');
    } catch (error) {
      toast.error(language === 'es' ? 'Error al completar configuración' : 'Error completing setup');
    }
  };

  // Render 2FA Setup Flow
  if (showSetup2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-slate-900" data-testid="admin-2fa-setup">
        <div className="w-full max-w-md">
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center mb-4">
                <Smartphone className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-heading text-white">
                {language === 'es' ? 'Configurar 2FA' : 'Setup 2FA'}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {setupStep === 1 && (language === 'es' 
                  ? 'Escanea el código QR con tu app de autenticación' 
                  : 'Scan the QR code with your authenticator app')}
                {setupStep === 2 && (language === 'es' 
                  ? 'Ingresa el código de tu app' 
                  : 'Enter the code from your app')}
                {setupStep === 3 && (language === 'es' 
                  ? 'Guarda estos códigos de respaldo' 
                  : 'Save these backup codes')}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {setupStep === 1 && (
                <div className="space-y-6">
                  <div className="flex justify-center">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">
                      {language === 'es' ? 'O ingresa este código manualmente:' : 'Or enter this code manually:'}
                    </Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-slate-700 rounded text-sm text-white font-mono break-all">
                        {secret}
                      </code>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(secret);
                          toast.success(language === 'es' ? 'Copiado' : 'Copied');
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Button 
                    onClick={() => setSetupStep(2)} 
                    className="w-full h-12 btn-coral"
                  >
                    {language === 'es' ? 'Continuar' : 'Continue'}
                  </Button>
                </div>
              )}

              {setupStep === 2 && (
                <form onSubmit={handleVerify2FA} className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-slate-200">
                      {language === 'es' ? 'Código de verificación' : 'Verification code'}
                    </Label>
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={setupCode}
                        onChange={(value) => setSetupCode(value)}
                        data-testid="setup-totp-input"
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
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => setSetupStep(1)} 
                      className="flex-1 h-12 border-slate-600 text-slate-300"
                    >
                      {language === 'es' ? 'Atrás' : 'Back'}
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1 h-12 btn-coral"
                      disabled={loading || setupCode.length !== 6}
                    >
                      {loading ? '...' : (language === 'es' ? 'Verificar' : 'Verify')}
                    </Button>
                  </div>
                </form>
              )}

              {setupStep === 3 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-amber-200">
                      {language === 'es' 
                        ? 'Guarda estos códigos en un lugar seguro. Solo podrás verlos una vez.'
                        : 'Save these codes in a safe place. You can only see them once.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code, i) => (
                      <code key={i} className="p-2 bg-slate-700 rounded text-center text-white font-mono">
                        {code}
                      </code>
                    ))}
                  </div>

                  <Button 
                    variant="outline"
                    onClick={copyBackupCodes}
                    className="w-full border-slate-600 text-slate-300"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {copiedCodes 
                      ? (language === 'es' ? '¡Copiados!' : 'Copied!')
                      : (language === 'es' ? 'Copiar códigos' : 'Copy codes')}
                  </Button>

                  <Button 
                    onClick={handleFinishSetup}
                    className="w-full h-12 btn-coral"
                  >
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    {language === 'es' ? 'Completar y acceder' : 'Complete and access'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Regular login form
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
            <form onSubmit={handleInitialLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">{language === 'es' ? 'Correo' : 'Email'}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
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
                    ? 'Ingresa el código de tu app de autenticación (si ya configuraste 2FA)'
                    : 'Enter the code from your authenticator app (if you already set up 2FA)'}
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
