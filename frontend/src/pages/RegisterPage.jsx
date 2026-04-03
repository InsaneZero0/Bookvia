import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { countries, getCountryByCode } from '@/lib/countries';
import { getDetectedCountry } from '@/lib/detectCountry';
import { AgeVerification } from '@/components/AgeVerification';
import { CitySelector } from '@/components/CitySelector';
import { BookviaLogo } from '@/components/BookviaLogo';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, User, Phone, Globe, Search } from 'lucide-react';

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
    country: getDetectedCountry(),
    city: '',
    birth_date: '',
    gender: '',
    preferred_language: language,
  });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [ageValid, setAgeValid] = useState(false);

  const selectedCountry = getCountryByCode(formData.country) || countries[0];

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return countries;
    const q = countrySearch.toLowerCase();
    return countries.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  }, [countrySearch]);

  const autoCapitalize = (str) => str.replace(/(^|\s)\S/g, c => c.toUpperCase());

  const handleChange = (e) => {
    const { name, value } = e.target;
    const capitalizedFields = ['full_name'];
    setFormData(prev => ({
      ...prev,
      [name]: capitalizedFields.includes(name) ? autoCapitalize(value) : value,
    }));
  };

  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhoneNumber(digits);
    setFormData(prev => ({ ...prev, phone: `${selectedCountry.phone}${digits}` }));
  };

  const handleCountryChange = (code) => {
    const c = getCountryByCode(code);
    setFormData(prev => ({
      ...prev,
      country: code,
      phone: c ? `${c.phone}${phoneNumber}` : prev.phone,
    }));
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

    if (phoneNumber.length < 7) {
      toast.error(language === 'es' ? 'El número de teléfono debe tener al menos 7 dígitos' : 'Phone number must have at least 7 digits');
      return;
    }

    if (!ageValid) {
      toast.error(language === 'es' ? 'Debes tener al menos 16 años para registrarte' : 'You must be at least 16 years old to register');
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      await register(registerData);
      toast.success(language === 'es' ? '¡Cuenta creada exitosamente!' : 'Account created successfully!');
      navigate('/');
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
              <BookviaLogo variant="light" size="text-3xl" />
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

              {/* Country */}
              <div className="space-y-2">
                <Label>{language === 'es' ? 'País' : 'Country'} *</Label>
                <Select value={formData.country} onValueChange={handleCountryChange}>
                  <SelectTrigger className="h-12" data-testid="country-select">
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <span className="text-lg leading-none">{selectedCountry.flag}</span>
                        <span>{language === 'es' ? selectedCountry.name : selectedCountry.nameEn}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <div className="sticky top-0 bg-popover p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder={language === 'es' ? 'Buscar país...' : 'Search country...'}
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-sm rounded-md border bg-transparent outline-none focus:ring-1 focus:ring-ring"
                          data-testid="country-search-input"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    {filteredCountries.map(c => (
                      <SelectItem key={c.code} value={c.code} data-testid={`country-option-${c.code}`}>
                        <span className="flex items-center gap-2">
                          <span className="text-lg leading-none">{c.flag}</span>
                          <span className="flex-1">{language === 'es' ? c.name : c.nameEn}</span>
                          <span className="text-muted-foreground text-xs ml-1">({c.phone})</span>
                        </span>
                      </SelectItem>
                    ))}
                    {filteredCountries.length === 0 && (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        {language === 'es' ? 'No se encontraron países' : 'No countries found'}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">{t('auth.phone')} *</Label>
                <div className="flex gap-0 items-center rounded-md border border-input focus-within:ring-1 focus-within:ring-ring h-12 overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 bg-muted/50 h-full border-r shrink-0 select-none">
                    <span className="text-base leading-none">{selectedCountry.flag}</span>
                    <span className="text-sm font-medium text-foreground">{selectedCountry.phone}</span>
                  </div>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="55 1234 5678"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    maxLength={10}
                    className="flex-1 h-full px-3 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                    required
                    data-testid="phone-input"
                  />
                  <span className="text-xs text-muted-foreground pr-3 shrink-0">{phoneNumber.length}/10</span>
                </div>
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label>{language === 'es' ? 'Ciudad' : 'City'} *</Label>
                <CitySelector
                  countryCode={formData.country}
                  value={formData.city}
                  onChange={(city) => setFormData(prev => ({ ...prev, city }))}
                  required
                />
              </div>

              {/* Age Verification & Gender */}
              <AgeVerification
                onDateChange={(date) => setFormData(prev => ({ ...prev, birth_date: date }))}
                onAgeValid={setAgeValid}
                minAge={16}
              />
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
                    data-no-capitalize="true"
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
                    data-no-capitalize="true"
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
