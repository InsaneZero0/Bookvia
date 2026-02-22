import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, User, Phone, Calendar } from 'lucide-react';

export default function RegisterPage() {
  const { t, language } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    phone: '',
    birth_date: '',
    gender: '',
    preferred_language: language,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error(language === 'es' ? 'Las contraseñas no coinciden' : 'Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error(language === 'es' ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      await register(registerData);
      toast.success(language === 'es' ? '¡Cuenta creada exitosamente!' : 'Account created successfully!');
      navigate('/verify-phone');
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Error al crear cuenta' : 'Error creating account');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="register-page">
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
              <span className="text-3xl font-heading font-extrabold">
                Book<span className="text-[#F05D5E]">via</span>
              </span>
            </Link>
            <CardTitle className="text-2xl font-heading">{t('auth.register.title')}</CardTitle>
            <CardDescription>{t('auth.register.subtitle')}</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name">{t('auth.fullName')} *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder={language === 'es' ? 'Juan Pérez' : 'John Doe'}
                    value={formData.full_name}
                    onChange={handleChange}
                    className="pl-10 h-12"
                    required
                    data-testid="fullname-input"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')} *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="tu@email.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10 h-12"
                    required
                    data-testid="email-input"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">{t('auth.phone')} *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+52 55 1234 5678"
                    value={formData.phone}
                    onChange={handleChange}
                    className="pl-10 h-12"
                    required
                    data-testid="phone-input"
                  />
                </div>
              </div>

              {/* Birth Date & Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birth_date">{t('auth.birthDate')}</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="birth_date"
                      name="birth_date"
                      type="date"
                      value={formData.birth_date}
                      onChange={handleChange}
                      className="pl-10 h-12"
                      data-testid="birthdate-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('auth.gender')}</Label>
                  <Select 
                    value={formData.gender} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}
                  >
                    <SelectTrigger className="h-12" data-testid="gender-select">
                      <SelectValue placeholder={language === 'es' ? 'Seleccionar' : 'Select'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t('auth.gender.male')}</SelectItem>
                      <SelectItem value="female">{t('auth.gender.female')}</SelectItem>
                      <SelectItem value="other">{t('auth.gender.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')} *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
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

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{language === 'es' ? 'Confirmar contraseña' : 'Confirm password'} *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="pl-10 h-12"
                    required
                    data-testid="confirm-password-input"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 btn-coral text-lg mt-6"
                disabled={loading}
                data-testid="register-submit"
              >
                {loading ? (language === 'es' ? 'Creando cuenta...' : 'Creating account...') : t('auth.register.button')}
              </Button>
            </form>

            <div className="text-center text-sm mt-6">
              <span className="text-muted-foreground">{t('auth.hasAccount')} </span>
              <Link to="/login" className="text-[#F05D5E] font-medium hover:underline" data-testid="login-link">
                {t('nav.login')}
              </Link>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              {language === 'es' 
                ? 'Al registrarte, aceptas nuestros Términos de Servicio y Política de Privacidad'
                : 'By signing up, you agree to our Terms of Service and Privacy Policy'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
