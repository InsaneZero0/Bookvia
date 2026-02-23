import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { categoriesAPI } from '@/lib/api';
import { toast } from 'sonner';
import { 
  ArrowLeft, ArrowRight, Mail, Lock, Phone, Building2, MapPin, 
  FileText, CreditCard, Upload, CheckCircle2, AlertTriangle, Eye, EyeOff
} from 'lucide-react';

const STEPS = [
  { id: 'business', title: { es: 'Datos del negocio', en: 'Business info' } },
  { id: 'location', title: { es: 'Ubicación', en: 'Location' } },
  { id: 'documents', title: { es: 'Documentos', en: 'Documents' } },
  { id: 'account', title: { es: 'Cuenta y pago', en: 'Account & payment' } },
];

export default function BusinessRegisterPage() {
  const { language } = useI18n();
  const { businessRegister } = useAuth();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  
  // File upload states
  const [ineFile, setIneFile] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [inePreview, setInePreview] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  
  const ineInputRef = useRef(null);
  const proofInputRef = useRef(null);
  
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
    // Settings
    accepts_terms: false,
  });

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

  const validateStep = () => {
    switch (currentStep) {
      case 0: // Business info
        if (!formData.name || !formData.email || !formData.phone || !formData.category_id || !formData.description) {
          toast.error(language === 'es' 
            ? 'Completa todos los campos obligatorios' 
            : 'Complete all required fields');
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          toast.error(language === 'es' ? 'Email inválido' : 'Invalid email');
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
        if (!formData.accepts_terms) {
          toast.error(language === 'es' 
            ? 'Debes aceptar los términos y condiciones' 
            : 'You must accept the terms and conditions');
          return false;
        }
        return true;
        
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateStep()) return;
    
    setLoading(true);
    
    try {
      // Upload files
      let ineUrl = '';
      let proofUrl = '';
      
      if (ineFile) {
        ineUrl = await uploadFile(ineFile);
      }
      if (proofFile) {
        proofUrl = await uploadFile(proofFile);
      }
      
      // Prepare registration data
      const registerData = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
        description: formData.description,
        category_id: formData.category_id,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        zip_code: formData.zip_code,
        rfc: formData.rfc.toUpperCase(),
        legal_name: formData.legal_name,
        ine_url: ineUrl,
        proof_of_address_url: proofUrl,
        clabe: formData.clabe,
        requires_deposit: formData.requires_deposit,
        deposit_amount: formData.requires_deposit ? Number(formData.deposit_amount) : 50,
      };
      
      await businessRegister(registerData);
      
      toast.success(
        language === 'es' 
          ? '¡Solicitud enviada! Tu negocio está en revisión.' 
          : 'Application submitted! Your business is under review.',
        { duration: 5000 }
      );
      
      navigate('/business/dashboard');
    } catch (error) {
      const message = error.response?.data?.detail || 
        (language === 'es' ? 'Error al registrar negocio' : 'Error registering business');
      toast.error(message);
    } finally {
      setLoading(false);
    }
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
                    <div className="space-y-2">
                      <Label htmlFor="phone">{language === 'es' ? 'Teléfono' : 'Phone'} *</Label>
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
                          data-testid="business-phone-input"
                        />
                      </div>
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
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MX">México</SelectItem>
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

                  <div className="flex items-center space-x-2 pt-4">
                    <Checkbox
                      id="requires_deposit"
                      name="requires_deposit"
                      checked={formData.requires_deposit}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_deposit: checked }))}
                    />
                    <Label htmlFor="requires_deposit" className="text-sm">
                      {language === 'es' 
                        ? 'Requiero anticipo para las reservas'
                        : 'I require a deposit for bookings'}
                    </Label>
                  </div>

                  {formData.requires_deposit && (
                    <div className="space-y-2 pl-6">
                      <Label htmlFor="deposit_amount">
                        {language === 'es' ? 'Monto del anticipo (MXN)' : 'Deposit amount (MXN)'}
                      </Label>
                      <Input
                        id="deposit_amount"
                        name="deposit_amount"
                        type="number"
                        min="50"
                        value={formData.deposit_amount}
                        onChange={handleChange}
                        className="h-12 w-32"
                      />
                      <p className="text-xs text-muted-foreground">
                        {language === 'es' ? 'Mínimo $50 MXN' : 'Minimum $50 MXN'}
                      </p>
                    </div>
                  )}

                  <div className="flex items-start space-x-2 pt-4 border-t">
                    <Checkbox
                      id="accepts_terms"
                      name="accepts_terms"
                      checked={formData.accepts_terms}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, accepts_terms: checked }))}
                      data-testid="terms-checkbox"
                    />
                    <Label htmlFor="accepts_terms" className="text-sm leading-tight">
                      {language === 'es' 
                        ? 'Acepto los Términos de Servicio, Política de Privacidad y las comisiones de la plataforma (8% por transacción)'
                        : 'I accept the Terms of Service, Privacy Policy and platform fees (8% per transaction)'}
                    </Label>
                  </div>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex justify-between mt-8 pt-4 border-t">
                {currentStep > 0 ? (
                  <Button type="button" variant="outline" onClick={handleBack} className="h-12">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {language === 'es' ? 'Anterior' : 'Previous'}
                  </Button>
                ) : (
                  <div />
                )}
                
                {currentStep < STEPS.length - 1 ? (
                  <Button type="button" onClick={handleNext} className="h-12 btn-coral">
                    {language === 'es' ? 'Siguiente' : 'Next'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    type="submit" 
                    className="h-12 btn-coral"
                    disabled={loading}
                    data-testid="submit-business"
                  >
                    {loading 
                      ? (language === 'es' ? 'Enviando...' : 'Submitting...') 
                      : (language === 'es' ? 'Registrar negocio' : 'Register business')}
                  </Button>
                )}
              </div>
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
                {language === 'es' ? '3 meses gratis de prueba' : '3 months free trial'}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {language === 'es' ? 'Solo 8% de comisión por transacción' : 'Only 8% commission per transaction'}
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
