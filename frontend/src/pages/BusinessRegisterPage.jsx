import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { categoriesAPI, businessesAPI } from '@/lib/api';
import { countries, getCountryByCode } from '@/lib/countries';
import { AgeVerification } from '@/components/AgeVerification';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  ArrowLeft, ArrowRight, Mail, Lock, Phone, Building2, MapPin, 
  FileText, CreditCard, Upload, CheckCircle2, AlertTriangle, Eye, EyeOff,
  HelpCircle, CalendarX, Banknote, Globe, Search
} from 'lucide-react';

const STEPS = [
  { id: 'business', title: { es: 'Datos del negocio', en: 'Business info' } },
  { id: 'location', title: { es: 'Ubicación', en: 'Location' } },
  { id: 'documents', title: { es: 'Documentos', en: 'Documents' } },
  { id: 'account', title: { es: 'Cuenta y pago', en: 'Account & payment' } },
  { id: 'subscription', title: { es: 'Suscripción', en: 'Subscription' } },
];

export default function BusinessRegisterPage() {
  const { language } = useI18n();
  const { businessRegister } = useAuth();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [ageValid, setAgeValid] = useState(false);
  const [ownerBirthDate, setOwnerBirthDate] = useState('');
  
  // File upload states
  const [ineFile, setIneFile] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [inePreview, setInePreview] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  
  const ineInputRef = useRef(null);
  const proofInputRef = useRef(null);
  const logoInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    // Business info
    name: '',
    email: '',
    phone: '',
    description: '',
    category_id: '',
    // Location
    address: '',
    city: '',
    state: '',
    country: 'MX',
    zip_code: '',
    // Documents
    rfc: '',
    legal_name: '',
    ine_url: '',
    proof_of_address_url: '',
    // Account
    password: '',
    confirmPassword: '',
    clabe: '',
    requires_deposit: false,
    deposit_amount: 50,
    cancellation_days: 1,
    payout_schedule: 'monthly',
    // Settings
    accepts_terms: false,
  });

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

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
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

  const handleFileChange = (type, file) => {
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error(language === 'es' 
        ? 'Solo se permiten archivos JPG, PNG, WebP o PDF' 
        : 'Only JPG, PNG, WebP or PDF files allowed');
      return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error(language === 'es' 
        ? 'El archivo no debe exceder 10MB' 
        : 'File must not exceed 10MB');
      return;
    }
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (type === 'ine') {
          setInePreview(e.target.result);
        } else {
          setProofPreview(e.target.result);
        }
      };
      reader.readAsDataURL(file);
    } else {
      // For PDFs, show file name
      if (type === 'ine') {
        setInePreview('pdf');
      } else {
        setProofPreview('pdf');
      }
    }
    
    if (type === 'ine') {
      setIneFile(file);
    } else {
      setProofFile(file);
    }
  };

  const uploadFile = async (file) => {
    // For now, we'll store files locally and return a mock URL
    // In production, this would upload to S3/CloudStorage
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    
    // Mock URL for development - in production, upload to cloud storage
    // For now, we'll convert to base64 and store temporarily
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // In real implementation, this would be a cloud storage URL
        // For now, we'll use a placeholder that indicates the file was uploaded
        resolve(`uploaded:${file.name}`);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleLogoChange = (file) => {
    if (!file) return;
    const validExts = ['jpg', 'jpeg', 'png', 'webp', 'jfif'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!validExts.includes(ext) && !file.type.startsWith('image/')) {
      toast.error(language === 'es' ? 'Solo se permiten imágenes (JPG, PNG, WebP)' : 'Only images allowed (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === 'es' ? 'El logo no debe exceder 5MB' : 'Logo must not exceed 5MB');
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const validateStep = () => {
    switch (currentStep) {
      case 0: // Business info
        if (!formData.name || !formData.email || !formData.phone || !formData.category_id || !formData.description) {
          toast.error(language === 'es' 
            ? 'Completa todos los campos obligatorios' 
            : 'Complete all required fields');
          return false;
        }
        if (!logoFile) {
          toast.error(language === 'es' ? 'El logo de tu negocio es obligatorio' : 'Business logo is required');
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          toast.error(language === 'es' ? 'Email inválido' : 'Invalid email');
          return false;
        }
        if (phoneNumber.length < 7) {
          toast.error(language === 'es' ? 'El número de teléfono debe tener al menos 7 dígitos' : 'Phone number must have at least 7 digits');
          return false;
        }
        if (!ageValid) {
          toast.error(language === 'es' ? 'El responsable debe tener al menos 16 años' : 'The owner must be at least 16 years old');
          return false;
        }
        return true;
        
      case 1: // Location
        if (!formData.address || !formData.city || !formData.state || !formData.zip_code) {
          toast.error(language === 'es' 
            ? 'Completa todos los campos de ubicación' 
            : 'Complete all location fields');
          return false;
        }
        return true;
        
      case 2: // Documents
        if (!formData.rfc || !formData.legal_name) {
          toast.error(language === 'es' 
            ? 'RFC y razón social son obligatorios' 
            : 'RFC and legal name are required');
          return false;
        }
        if (!ineFile) {
          toast.error(language === 'es' 
            ? 'Sube tu identificación oficial (INE/Pasaporte)' 
            : 'Upload your official ID (INE/Passport)');
          return false;
        }
        // RFC validation for Mexico
        const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
        if (!rfcRegex.test(formData.rfc.toUpperCase())) {
          toast.error(language === 'es' 
            ? 'El RFC no tiene un formato válido' 
            : 'RFC format is invalid');
          return false;
        }
        return true;
        
      case 3: // Account
        if (!formData.password || !formData.clabe) {
          toast.error(language === 'es' 
            ? 'Contraseña y CLABE son obligatorios' 
            : 'Password and CLABE are required');
          return false;
        }
        if (formData.password.length < 8) {
          toast.error(language === 'es' 
            ? 'La contraseña debe tener al menos 8 caracteres' 
            : 'Password must be at least 8 characters');
          return false;
        }
        if (formData.password !== formData.confirmPassword) {
          toast.error(language === 'es' 
            ? 'Las contraseñas no coinciden' 
            : 'Passwords do not match');
          return false;
        }
        // CLABE validation (18 digits)
        if (!/^\d{18}$/.test(formData.clabe)) {
          toast.error(language === 'es' 
            ? 'La CLABE debe tener 18 dígitos' 
            : 'CLABE must have 18 digits');
          return false;
        }
        return true;
        
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateStep()) return;
    
    if (currentStep === 3) {
      // Step 4 (Account) → register the business, then go to Step 5
      handleRegister();
    } else if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep === 4) return;
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      let ineUrl = '';
      let proofUrl = '';
      if (ineFile) ineUrl = await uploadFile(ineFile);
      if (proofFile) proofUrl = await uploadFile(proofFile);
      
      const registerData = {
        name: formData.name, email: formData.email, password: formData.password,
        phone: formData.phone, description: formData.description,
        category_id: formData.category_id, address: formData.address,
        city: formData.city, state: formData.state, country: formData.country,
        zip_code: formData.zip_code, rfc: formData.rfc.toUpperCase(),
        legal_name: formData.legal_name, ine_url: ineUrl,
        proof_of_address_url: proofUrl, clabe: formData.clabe,
        requires_deposit: formData.requires_deposit,
        deposit_amount: formData.requires_deposit ? Number(formData.deposit_amount) : 50,
        cancellation_days: Number(formData.cancellation_days) || 1,
        payout_schedule: formData.requires_deposit ? formData.payout_schedule : null,
        owner_birth_date: ownerBirthDate,
      };
      
      await businessRegister(registerData);

      // Upload logo after registration
      if (logoFile) {
        try {
          await businessesAPI.uploadLogo(logoFile);
        } catch (logoErr) {
          console.error('Logo upload failed:', logoErr);
          toast.error(language === 'es' ? 'El registro fue exitoso pero no se pudo subir el logo. Podrás subirlo desde tu panel.' : 'Registration successful but logo upload failed. You can upload it from your dashboard.');
        }
      }

      toast.success(language === 'es' ? '¡Registro exitoso! Ahora activa tu suscripción.' : 'Registration successful! Now activate your subscription.', { duration: 4000 });
      setCurrentStep(4);
    } catch (error) {
      const message = error.response?.data?.detail || (language === 'es' ? 'Error al registrar negocio' : 'Error registering business');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const originUrl = window.location.origin;
      const res = await businessesAPI.createSubscription(originUrl);
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        throw new Error('No checkout URL');
      }
    } catch (error) {
      console.error('Subscription error:', error?.response?.data || error);
      toast.error(language === 'es' ? 'Error al conectar con el procesador de pagos. Intenta de nuevo o contacta soporte.' : 'Error connecting to payment processor. Try again or contact support.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    handleSubscribe();
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen px-4 py-10 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="business-register-page">
      <div className="max-w-2xl mx-auto">
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
            <CardTitle className="text-2xl font-heading">
              {language === 'es' ? 'Registra tu negocio' : 'Register your business'}
            </CardTitle>
            <CardDescription>
              {language === 'es' 
                ? 'Únete a la plataforma de reservas más grande de México' 
                : 'Join the largest booking platform in Mexico'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Progress indicator */}
            <div className="mb-8">
              <div className="flex justify-between mb-2">
                {STEPS.map((step, index) => (
                  <div 
                    key={step.id}
                    className={`flex flex-col items-center ${index <= currentStep ? 'text-[#F05D5E]' : 'text-muted-foreground'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                      ${index < currentStep ? 'bg-[#F05D5E] text-white' : 
                        index === currentStep ? 'border-2 border-[#F05D5E] text-[#F05D5E]' : 
                        'border-2 border-muted-foreground'}`}
                    >
                      {index < currentStep ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                    </div>
                    <span className="text-xs mt-1 hidden sm:block">{step.title[language]}</span>
                  </div>
                ))}
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <form onSubmit={handleSubmit}>
              {/* Step 1: Business Info */}
              {currentStep === 0 && (
                <div className="space-y-4" data-testid="step-business">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      {language === 'es' ? 'Nombre del negocio' : 'Business name'} *
                    </Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="name"
                        name="name"
                        placeholder={language === 'es' ? 'Spa Relax' : 'Relax Spa'}
                        value={formData.name}
                        onChange={handleChange}
                        className="pl-10 h-12"
                        required
                        data-testid="business-name-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{language === 'es' ? 'Correo electrónico' : 'Email'} *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="negocio@email.com"
                          value={formData.email}
                          onChange={handleChange}
                          className="pl-10 h-12"
                          required
                          data-testid="business-email-input"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Country */}
                  <div className="space-y-2">
                    <Label>{language === 'es' ? 'País' : 'Country'} *</Label>
                    <Select value={formData.country} onValueChange={handleCountryChange}>
                      <SelectTrigger className="h-12" data-testid="business-country-select">
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
                              data-testid="business-country-search-input"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        {filteredCountries.map(c => (
                          <SelectItem key={c.code} value={c.code} data-testid={`biz-country-option-${c.code}`}>
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

                  {/* Phone with country code */}
                  <div className="space-y-2">
                    <Label>{language === 'es' ? 'Teléfono' : 'Phone'} *</Label>
                    <div className="flex gap-0 items-center rounded-md border border-input focus-within:ring-1 focus-within:ring-ring h-12 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 bg-muted/50 h-full border-r shrink-0 select-none">
                        <span className="text-base leading-none">{selectedCountry.flag}</span>
                        <span className="text-sm font-medium text-foreground">{selectedCountry.phone}</span>
                      </div>
                      <input
                        id="biz-phone"
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        placeholder="55 1234 5678"
                        value={phoneNumber}
                        onChange={handlePhoneChange}
                        maxLength={10}
                        className="flex-1 h-full px-3 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                        required
                        data-testid="business-phone-input"
                      />
                      <span className="text-xs text-muted-foreground pr-3 shrink-0">{phoneNumber.length}/10</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{language === 'es' ? 'Categoría' : 'Category'} *</Label>
                    <Select 
                      value={formData.category_id} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
                    >
                      <SelectTrigger className="h-12" data-testid="category-select">
                        <SelectValue placeholder={language === 'es' ? 'Selecciona una categoría' : 'Select a category'} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {language === 'es' ? cat.name_es : cat.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{language === 'es' ? 'Descripción' : 'Description'} *</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder={language === 'es' 
                        ? 'Describe tu negocio, servicios y experiencia...' 
                        : 'Describe your business, services and experience...'}
                      value={formData.description}
                      onChange={handleChange}
                      className="min-h-[100px]"
                      required
                      data-testid="business-description-input"
                    />
                  </div>

                  {/* Age Verification for business owner */}
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      {language === 'es' 
                        ? 'Edad del responsable del negocio' 
                        : 'Age of the business owner'}
                    </p>
                    <AgeVerification
                      onDateChange={setOwnerBirthDate}
                      onAgeValid={setAgeValid}
                      minAge={16}
                    />
                  </div>

                  {/* Logo upload */}
                  <div className="space-y-2">
                    <Label>{language === 'es' ? 'Logo del negocio' : 'Business logo'} *</Label>
                    <div
                      className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors hover:border-[#F05D5E]/50 ${logoPreview ? 'border-green-300 bg-green-50/50 dark:bg-green-900/10' : 'border-muted-foreground/20'}`}
                      onClick={() => logoInputRef.current?.click()}
                      data-testid="logo-upload-area"
                    >
                      <input
                        ref={logoInputRef}
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/png,image/webp,.jfif"
                        onChange={(e) => handleLogoChange(e.target.files[0])}
                        data-testid="logo-file-input"
                      />
                      {logoPreview ? (
                        <div className="flex items-center gap-3">
                          <img src={logoPreview} alt="Logo" className="h-16 w-16 rounded-lg object-cover border" />
                          <div className="text-left">
                            <p className="text-sm font-medium text-green-700 dark:text-green-300">{logoFile?.name}</p>
                            <p className="text-xs text-muted-foreground">{language === 'es' ? 'Clic para cambiar' : 'Click to change'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="py-2">
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground">{language === 'es' ? 'Sube el logo de tu negocio' : 'Upload your business logo'}</p>
                          <p className="text-xs text-muted-foreground/60">{language === 'es' ? 'JPG, PNG o WebP. Máximo 5MB' : 'JPG, PNG or WebP. Max 5MB'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Location */}
              {currentStep === 1 && (
                <div className="space-y-4" data-testid="step-location">
                  <div className="space-y-2">
                    <Label htmlFor="address">{language === 'es' ? 'Dirección' : 'Address'} *</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="address"
                        name="address"
                        placeholder={language === 'es' ? 'Calle, número, colonia' : 'Street, number, neighborhood'}
                        value={formData.address}
                        onChange={handleChange}
                        className="pl-10 h-12"
                        required
                        data-testid="address-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">{language === 'es' ? 'Ciudad' : 'City'} *</Label>
                      <Input
                        id="city"
                        name="city"
                        placeholder="CDMX"
                        value={formData.city}
                        onChange={handleChange}
                        className="h-12"
                        required
                        data-testid="city-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">{language === 'es' ? 'Estado' : 'State'} *</Label>
                      <Input
                        id="state"
                        name="state"
                        placeholder={language === 'es' ? 'Ciudad de México' : 'Mexico City'}
                        value={formData.state}
                        onChange={handleChange}
                        className="h-12"
                        required
                        data-testid="state-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="zip_code">{language === 'es' ? 'Código postal' : 'ZIP code'} *</Label>
                      <Input
                        id="zip_code"
                        name="zip_code"
                        placeholder="01234"
                        value={formData.zip_code}
                        onChange={handleChange}
                        className="h-12"
                        required
                        data-testid="zipcode-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'es' ? 'País' : 'Country'}</Label>
                      <Select 
                        value={formData.country} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
                      >
                        <SelectTrigger className="h-12">
                          <SelectValue>
                            <span className="flex items-center gap-2">
                              <span className="text-lg leading-none">{selectedCountry.flag}</span>
                              <span>{language === 'es' ? selectedCountry.name : selectedCountry.nameEn}</span>
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-52">
                          {countries.map(c => (
                            <SelectItem key={c.code} value={c.code}>
                              <span className="flex items-center gap-2">
                                <span className="text-lg leading-none">{c.flag}</span>
                                <span>{language === 'es' ? c.name : c.nameEn}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Documents */}
              {currentStep === 2 && (
                <div className="space-y-4" data-testid="step-documents">
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {language === 'es'
                        ? 'Estos documentos son necesarios para verificar tu negocio. Tu información está protegida.'
                        : 'These documents are required to verify your business. Your information is protected.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="legal_name">{language === 'es' ? 'Razón social' : 'Legal name'} *</Label>
                    <Input
                      id="legal_name"
                      name="legal_name"
                      placeholder={language === 'es' ? 'Spa Relax SA de CV' : 'Relax Spa LLC'}
                      value={formData.legal_name}
                      onChange={handleChange}
                      className="h-12"
                      required
                      data-testid="legal-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rfc">RFC *</Label>
                    <Input
                      id="rfc"
                      name="rfc"
                      placeholder="XAXX010101000"
                      value={formData.rfc}
                      onChange={(e) => setFormData(prev => ({ ...prev, rfc: e.target.value.toUpperCase() }))}
                      className="h-12 uppercase"
                      maxLength={13}
                      required
                      data-testid="rfc-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      {language === 'es' 
                        ? '12 caracteres para personas morales, 13 para personas físicas'
                        : '12 characters for companies, 13 for individuals'}
                    </p>
                  </div>

                  {/* INE Upload */}
                  <div className="space-y-2">
                    <Label>{language === 'es' ? 'Identificación oficial (INE/Pasaporte)' : 'Official ID (INE/Passport)'} *</Label>
                    <div 
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                        ${ineFile ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-muted-foreground/25 hover:border-[#F05D5E]'}`}
                      onClick={() => ineInputRef.current?.click()}
                      data-testid="ine-upload-zone"
                    >
                      <input
                        ref={ineInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileChange('ine', e.target.files[0])}
                        className="hidden"
                      />
                      {ineFile ? (
                        <div className="flex items-center justify-center gap-3">
                          {inePreview === 'pdf' ? (
                            <FileText className="h-10 w-10 text-green-600" />
                          ) : inePreview ? (
                            <img src={inePreview} alt="INE preview" className="h-16 w-auto rounded" />
                          ) : null}
                          <div className="text-left">
                            <p className="font-medium text-green-600">{ineFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(ineFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <CheckCircle2 className="h-6 w-6 text-green-600" />
                        </div>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            {language === 'es' 
                              ? 'Haz clic o arrastra tu archivo aquí'
                              : 'Click or drag your file here'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP o PDF (máx. 10MB)</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Proof of Address Upload (Optional) */}
                  <div className="space-y-2">
                    <Label>
                      {language === 'es' ? 'Comprobante de domicilio' : 'Proof of address'}
                      <span className="text-muted-foreground text-sm ml-1">({language === 'es' ? 'opcional' : 'optional'})</span>
                    </Label>
                    <div 
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                        ${proofFile ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-muted-foreground/25 hover:border-[#F05D5E]'}`}
                      onClick={() => proofInputRef.current?.click()}
                      data-testid="proof-upload-zone"
                    >
                      <input
                        ref={proofInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileChange('proof', e.target.files[0])}
                        className="hidden"
                      />
                      {proofFile ? (
                        <div className="flex items-center justify-center gap-3">
                          {proofPreview === 'pdf' ? (
                            <FileText className="h-10 w-10 text-green-600" />
                          ) : proofPreview ? (
                            <img src={proofPreview} alt="Proof preview" className="h-16 w-auto rounded" />
                          ) : null}
                          <div className="text-left">
                            <p className="font-medium text-green-600">{proofFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(proofFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <CheckCircle2 className="h-6 w-6 text-green-600" />
                        </div>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            {language === 'es' 
                              ? 'Recibo de luz, agua o teléfono (menos de 3 meses)'
                              : 'Utility bill (less than 3 months old)'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Account & Payment */}
              {currentStep === 3 && (
                <div className="space-y-4" data-testid="step-account">
                  <div className="space-y-2">
                    <Label htmlFor="password">{language === 'es' ? 'Contraseña' : 'Password'} *</Label>
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
                    <p className="text-xs text-muted-foreground">
                      {language === 'es' ? 'Mínimo 8 caracteres' : 'Minimum 8 characters'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      {language === 'es' ? 'Confirmar contraseña' : 'Confirm password'} *
                    </Label>
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

                  <div className="space-y-2">
                    <Label htmlFor="clabe">CLABE {language === 'es' ? 'interbancaria' : 'number'} *</Label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="clabe"
                        name="clabe"
                        placeholder="012345678901234567"
                        value={formData.clabe}
                        onChange={(e) => setFormData(prev => ({ ...prev, clabe: e.target.value.replace(/\D/g, '') }))}
                        className="pl-10 h-12"
                        maxLength={18}
                        required
                        data-testid="clabe-input"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'es' 
                        ? 'Aquí recibirás tus pagos (18 dígitos)'
                        : 'This is where you\'ll receive payments (18 digits)'}
                    </p>
                  </div>

                  {/* ── Política de reservas y cancelación ─────── */}
                  <div className="pt-4 space-y-4">
                    <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
                      <CalendarX className="h-4 w-4 text-[#F05D5E]" />
                      {language === 'es' ? 'Política de reservas' : 'Booking policy'}
                    </h3>

                    {/* Opción 1: Con anticipo */}
                    <div
                      className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${formData.requires_deposit ? 'border-[#F05D5E] bg-[#F05D5E]/5' : 'border-border hover:border-muted-foreground/30'}`}
                      onClick={() => setFormData(prev => ({ ...prev, requires_deposit: true }))}
                      data-testid="option-with-deposit"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.requires_deposit ? 'border-[#F05D5E]' : 'border-muted-foreground/40'}`}>
                          {formData.requires_deposit && <div className="w-2.5 h-2.5 rounded-full bg-[#F05D5E]" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {language === 'es' ? 'Requiero anticipo para las reservas' : 'I require a deposit for bookings'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {language === 'es' ? 'El cliente paga un anticipo al reservar' : 'Customer pays a deposit when booking'}
                          </p>
                        </div>
                      </div>

                      {formData.requires_deposit && (
                        <div className="mt-4 space-y-4 pl-8" onClick={(e) => e.stopPropagation()}>
                          {/* Monto del anticipo */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor="deposit_amount" className="text-sm">
                                <Banknote className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                {language === 'es' ? 'Monto del anticipo (MXN)' : 'Deposit amount (MXN)'}
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-[#F05D5E] transition-colors" data-testid="help-deposit-amount">
                                    <HelpCircle className="h-4 w-4" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 text-sm" side="top">
                                  <p className="font-medium mb-1">{language === 'es' ? 'Monto del anticipo' : 'Deposit amount'}</p>
                                  <p className="text-muted-foreground text-xs leading-relaxed">
                                    {language === 'es'
                                      ? 'Es la cantidad que el cliente debe pagar al momento de reservar para confirmar su cita. El resto se paga directamente en el establecimiento. El monto mínimo es de $50 MXN.'
                                      : 'The amount the customer must pay when booking to confirm their appointment. The rest is paid at the venue. Minimum is $50 MXN.'}
                                  </p>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <Input
                              id="deposit_amount"
                              name="deposit_amount"
                              type="number"
                              min="50"
                              value={formData.deposit_amount}
                              onChange={handleChange}
                              className="h-10 w-36"
                              data-testid="deposit-amount-input"
                            />
                            <p className="text-xs text-muted-foreground">{language === 'es' ? 'Mínimo $50 MXN' : 'Minimum $50 MXN'}</p>
                          </div>

                          {/* Margen de cancelación con anticipo */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor="cancellation_days_deposit" className="text-sm">
                                <CalendarX className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                {language === 'es' ? 'Margen de cancelación (días)' : 'Cancellation margin (days)'}
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-[#F05D5E] transition-colors" data-testid="help-cancellation-deposit">
                                    <HelpCircle className="h-4 w-4" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 text-sm" side="top">
                                  <p className="font-medium mb-1">{language === 'es' ? 'Margen de cancelación y devolución' : 'Cancellation and refund margin'}</p>
                                  <p className="text-muted-foreground text-xs leading-relaxed">
                                    {language === 'es'
                                      ? 'Define cuántos días antes de la cita un cliente puede cancelar su reserva y recibir la devolución del anticipo.\n\nEjemplo: Si defines 1 día de margen, el cliente deberá cancelar al menos 24 horas antes de la cita para que se le devuelva el anticipo.\n\nSi cancela después de ese tiempo, la cancelación se marca como tardía y el anticipo no se reembolsa.'
                                      : 'Defines how many days before the appointment a customer can cancel and receive a deposit refund.\n\nExample: If you set 1 day margin, the customer must cancel at least 24 hours before for a refund.\n\nLate cancellations will not receive a refund.'}
                                  </p>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <Input
                              id="cancellation_days_deposit"
                              name="cancellation_days"
                              type="number"
                              min="0"
                              max="30"
                              value={formData.cancellation_days}
                              onChange={handleChange}
                              className="h-10 w-36"
                              data-testid="cancellation-days-deposit-input"
                            />
                            <p className="text-xs text-muted-foreground">
                              {language === 'es'
                                ? `El cliente puede cancelar hasta ${formData.cancellation_days} día(s) antes y recibir el reembolso`
                                : `Customer can cancel up to ${formData.cancellation_days} day(s) before for a refund`}
                            </p>
                          </div>

                          {/* Selector de frecuencia de depósito */}
                          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 space-y-3" data-testid="commission-info-block">
                            <h4 className="text-sm font-semibold flex items-center gap-1.5">
                              <CreditCard className="h-4 w-4 text-[#F05D5E]" />
                              {language === 'es' ? 'Comisiones de Bookvia' : 'Bookvia Fees'}
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {language === 'es'
                                ? 'Bookvia cobra una comisión por procesar los pagos y gestionar las reservas. Los anticipos se depositarán en la cuenta bancaria que registraste (CLABE).'
                                : 'Bookvia charges a fee for processing payments and managing bookings. Deposits will be transferred to the bank account you registered (CLABE).'}
                            </p>

                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <Label className="text-sm font-medium">
                                  {language === 'es' ? '¿Cada cuánto quieres recibir tu dinero?' : 'How often do you want to receive your money?'}
                                </Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button type="button" className="text-muted-foreground hover:text-[#F05D5E] transition-colors" data-testid="help-payout-schedule">
                                      <HelpCircle className="h-4 w-4" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 text-sm" side="top">
                                    <p className="font-medium mb-1">{language === 'es' ? 'Frecuencia de depósito' : 'Payout frequency'}</p>
                                    <p className="text-muted-foreground text-xs leading-relaxed">
                                      {language === 'es'
                                        ? 'Elige cada cuánto quieres recibir los anticipos acumulados en tu cuenta bancaria. Entre más frecuente, mayor es la comisión de Bookvia por los costos operativos de las transferencias.'
                                        : 'Choose how often you want to receive accumulated deposits. More frequent payouts have higher fees due to transfer costs.'}
                                    </p>
                                  </PopoverContent>
                                </Popover>
                              </div>

                              <div className="space-y-2">
                                {[
                                  { value: 'triday', label: language === 'es' ? 'Cada 3 días' : 'Every 3 days', fee: '10%', desc: language === 'es' ? 'Recibe tu dinero rápido' : 'Get your money fast' },
                                  { value: 'biweekly', label: language === 'es' ? 'Quincenal' : 'Biweekly', fee: '8%', desc: language === 'es' ? 'Balance entre rapidez y costo' : 'Balance of speed and cost' },
                                  { value: 'monthly', label: language === 'es' ? 'Mensual' : 'Monthly', fee: '4%', desc: language === 'es' ? 'La comisión más baja' : 'Lowest fee' },
                                ].map(opt => (
                                  <div
                                    key={opt.value}
                                    className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${formData.payout_schedule === opt.value ? 'border-[#F05D5E] bg-[#F05D5E]/5' : 'border-border hover:border-muted-foreground/30'}`}
                                    onClick={() => setFormData(prev => ({ ...prev, payout_schedule: opt.value }))}
                                    data-testid={`payout-${opt.value}`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${formData.payout_schedule === opt.value ? 'border-[#F05D5E]' : 'border-muted-foreground/40'}`}>
                                        {formData.payout_schedule === opt.value && <div className="w-2 h-2 rounded-full bg-[#F05D5E]" />}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium">{opt.label}</p>
                                        <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                                      </div>
                                    </div>
                                    <Badge variant={formData.payout_schedule === opt.value ? 'default' : 'outline'} className={`text-xs ${formData.payout_schedule === opt.value ? 'bg-[#F05D5E]' : ''}`}>
                                      {opt.fee}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <p className="text-[11px] text-muted-foreground/70 pt-2 border-t border-slate-200 dark:border-slate-700">
                              {language === 'es'
                                ? 'Podrás consultar todos los movimientos y anticipos recibidos en tu panel de estado de cuenta dentro de Bookvia.'
                                : 'You can view all transactions and deposits received in your Bookvia account dashboard.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Opción 2: Sin anticipo */}
                    <div
                      className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${!formData.requires_deposit ? 'border-[#F05D5E] bg-[#F05D5E]/5' : 'border-border hover:border-muted-foreground/30'}`}
                      onClick={() => setFormData(prev => ({ ...prev, requires_deposit: false }))}
                      data-testid="option-without-deposit"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!formData.requires_deposit ? 'border-[#F05D5E]' : 'border-muted-foreground/40'}`}>
                          {!formData.requires_deposit && <div className="w-2.5 h-2.5 rounded-full bg-[#F05D5E]" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {language === 'es' ? 'No requiero anticipo' : 'No deposit required'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {language === 'es' ? 'El cliente reserva sin costo previo' : 'Customer books with no upfront cost'}
                          </p>
                        </div>
                      </div>

                      {!formData.requires_deposit && (
                        <div className="mt-4 pl-8" onClick={(e) => e.stopPropagation()}>
                          {/* Margen de cancelación sin anticipo */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor="cancellation_days_no_deposit" className="text-sm">
                                <CalendarX className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                {language === 'es' ? 'Margen de cancelación (días)' : 'Cancellation margin (days)'}
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-[#F05D5E] transition-colors" data-testid="help-cancellation-no-deposit">
                                    <HelpCircle className="h-4 w-4" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 text-sm" side="top">
                                  <p className="font-medium mb-1">{language === 'es' ? 'Margen de cancelación' : 'Cancellation margin'}</p>
                                  <p className="text-muted-foreground text-xs leading-relaxed">
                                    {language === 'es'
                                      ? 'Define cuántos días antes de la cita un cliente puede cancelar su reserva.\n\nEjemplo: Si defines 1 día de margen, el cliente deberá cancelar al menos 24 horas antes de la cita.\n\nSi cancela después de ese tiempo, la cancelación puede marcarse como tardía o como no-show.'
                                      : 'Defines how many days before the appointment a customer can cancel.\n\nExample: If you set 1 day margin, the customer must cancel at least 24 hours before.\n\nLate cancellations may be marked as no-show.'}
                                  </p>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <Input
                              id="cancellation_days_no_deposit"
                              name="cancellation_days"
                              type="number"
                              min="0"
                              max="30"
                              value={formData.cancellation_days}
                              onChange={handleChange}
                              className="h-10 w-36"
                              data-testid="cancellation-days-no-deposit-input"
                            />
                            <p className="text-xs text-muted-foreground">
                              {language === 'es'
                                ? `El cliente puede cancelar hasta ${formData.cancellation_days} día(s) antes sin penalización`
                                : `Customer can cancel up to ${formData.cancellation_days} day(s) before without penalty`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Subscription */}
              {currentStep === 4 && (
                <div className="space-y-6" data-testid="step-subscription">
                  <div className="text-center space-y-3 py-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#F05D5E]/10">
                      <CreditCard className="h-8 w-8 text-[#F05D5E]" />
                    </div>
                    <h2 className="text-xl font-heading font-bold">
                      {language === 'es' ? 'Registro de tarjeta obligatorio' : 'Card registration required'}
                    </h2>
                  </div>

                  {/* Main info card */}
                  <div className="rounded-xl border-2 border-[#F05D5E]/30 bg-[#F05D5E]/5 p-6 space-y-4">
                    <p className="text-sm leading-relaxed text-foreground">
                      {language === 'es'
                        ? 'Para completar el registro de tu negocio en Bookvia, es obligatorio registrar una tarjeta válida.'
                        : 'To complete your business registration on Bookvia, you must register a valid card.'}
                    </p>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="font-semibold">{language === 'es' ? 'Tu suscripción incluye 1 mes GRATIS' : 'Your subscription includes 1 FREE month'}</p>
                        <p className="text-xs text-muted-foreground">{language === 'es' ? 'Sin cobro durante los primeros 30 días' : 'No charge for the first 30 days'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="font-semibold">{language === 'es' ? 'Después $39 MXN al mes' : 'Then $39 MXN per month'}</p>
                        <p className="text-xs text-muted-foreground">{language === 'es' ? 'Se cobrará automáticamente después de 30 días' : 'Automatically charged after 30 days'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Admin approval notice */}
                  <div className="text-center bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-2" />
                    <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                      {language === 'es'
                        ? 'Una vez registrada tu tarjeta, tu negocio quedará pendiente de aprobación por parte del administrador antes de aparecer públicamente en la plataforma.'
                        : 'Once your card is registered, your business will be pending admin approval before appearing publicly on the platform.'}
                    </p>
                  </div>

                  {/* Cancellation policy */}
                  <div className="text-center bg-muted/30 rounded-xl p-4 border">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {language === 'es'
                        ? 'Puedes cancelar tu suscripción en cualquier momento desde tu panel de negocio. Si tu suscripción se cancela o tu pago no está al corriente, tu negocio dejará de aparecer en los resultados de búsqueda hasta regularizarse.'
                        : 'You can cancel your subscription at any time from your business dashboard. If your subscription is canceled or your payment is not up to date, your business will stop appearing in search results until regularized.'}
                    </p>
                  </div>

                  {/* Stripe CTA */}
                  <div className="space-y-3">
                    <Button
                      type="button"
                      className="w-full btn-coral h-14 text-base gap-2"
                      onClick={handleSubscribe}
                      disabled={loading}
                      data-testid="subscribe-button"
                    >
                      <CreditCard className="h-5 w-5" />
                      {loading
                        ? (language === 'es' ? 'Redirigiendo a Stripe...' : 'Redirecting to Stripe...')
                        : (language === 'es' ? 'Registrar tarjeta y activar suscripción' : 'Register card & activate subscription')}
                    </Button>
                  </div>

                  <p className="text-[11px] text-center text-muted-foreground/60">
                    {language === 'es'
                      ? 'Serás redirigido a Stripe, nuestro procesador de pagos seguro, para registrar tu tarjeta.'
                      : 'You will be redirected to Stripe, our secure payment processor, to register your card.'}
                  </p>
                </div>
              )}

              {/* Navigation buttons - hidden on subscription step (has its own) */}
              {currentStep < 4 && (
              <div className="flex justify-between mt-8 pt-4 border-t">
                {currentStep > 0 ? (
                  <Button type="button" variant="outline" onClick={handleBack} className="h-12">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {language === 'es' ? 'Anterior' : 'Previous'}
                  </Button>
                ) : (
                  <div />
                )}
                
                <Button type="button" onClick={handleNext} className="h-12 btn-coral" disabled={loading}>
                  {loading 
                    ? (language === 'es' ? 'Procesando...' : 'Processing...')
                    : currentStep === 3
                    ? (language === 'es' ? 'Registrar negocio' : 'Register business')
                    : (language === 'es' ? 'Siguiente' : 'Next')}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </div>
              )}
            </form>

            <p className="text-xs text-muted-foreground text-center mt-6">
              {language === 'es'
                ? '¿Ya tienes cuenta? '
                : 'Already have an account? '}
              <Link to="/business/login" className="text-[#F05D5E] hover:underline">
                {language === 'es' ? 'Inicia sesión' : 'Log in'}
              </Link>
            </p>
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="mt-6 border-0 shadow-lg bg-gradient-to-r from-[#0F4C81]/10 to-[#F05D5E]/10">
          <CardContent className="p-6">
            <h3 className="font-heading font-bold mb-3">
              {language === 'es' ? '¿Por qué unirte a Bookvia?' : 'Why join Bookvia?'}
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {language === 'es' ? '1 mes gratis de suscripción' : '1 month free subscription'}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {language === 'es' ? 'Pequeñas comisiones' : 'Low fees'}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {language === 'es' ? 'Panel de gestión completo' : 'Complete management dashboard'}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {language === 'es' ? 'Protección contra no-shows' : 'No-show protection'}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
