import { useState } from 'react';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Send, 
  MessageCircle, 
  HelpCircle,
  Clock,
  CheckCircle,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function HelpPage() {
  const { language } = useI18n();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    category: '',
    message: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.message) {
      toast.error(language === 'es' ? 'Por favor completa todos los campos requeridos' : 'Please fill all required fields');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSent(true);
        toast.success(language === 'es' ? '¡Mensaje enviado! Te responderemos pronto.' : 'Message sent! We\'ll respond soon.');
        setFormData({ name: '', email: '', subject: '', category: '', message: '' });
      } else {
        throw new Error('Failed to send');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(language === 'es' ? 'Error al enviar. Intenta de nuevo.' : 'Error sending. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const faqs = [
    {
      question: language === 'es' ? '¿Cómo hago una reservación?' : 'How do I make a booking?',
      answer: language === 'es' 
        ? 'Busca el servicio que necesitas, selecciona el negocio, elige fecha y hora disponible, y confirma tu cita. Algunos negocios requieren un anticipo para confirmar.'
        : 'Search for the service you need, select a business, choose an available date and time, and confirm your appointment. Some businesses require a deposit to confirm.'
    },
    {
      question: language === 'es' ? '¿Puedo cancelar mi cita?' : 'Can I cancel my appointment?',
      answer: language === 'es'
        ? 'Sí, puedes cancelar tu cita desde tu panel de usuario. Ten en cuenta que algunos negocios tienen políticas de cancelación y el anticipo podría no ser reembolsable.'
        : 'Yes, you can cancel your appointment from your user dashboard. Note that some businesses have cancellation policies and the deposit may not be refundable.'
    },
    {
      question: language === 'es' ? '¿Cómo registro mi negocio?' : 'How do I register my business?',
      answer: language === 'es'
        ? 'Haz clic en "Para Negocios" en el menú, completa el formulario de registro con los datos de tu negocio y documentos requeridos. Nuestro equipo revisará tu solicitud en 24-48 horas.'
        : 'Click on "For Business" in the menu, complete the registration form with your business details and required documents. Our team will review your application within 24-48 hours.'
    },
    {
      question: language === 'es' ? '¿Qué métodos de pago aceptan?' : 'What payment methods do you accept?',
      answer: language === 'es'
        ? 'Aceptamos tarjetas de crédito y débito a través de Stripe. Los pagos son seguros y procesados instantáneamente.'
        : 'We accept credit and debit cards through Stripe. Payments are secure and processed instantly.'
    },
    {
      question: language === 'es' ? '¿Cómo contacto al soporte?' : 'How do I contact support?',
      answer: language === 'es'
        ? 'Puedes usar el formulario en esta página, enviarnos un correo a soporte@bookvia.com, o llamarnos al +52 55 1234 5678.'
        : 'You can use the form on this page, email us at support@bookvia.com, or call us at +52 55 1234 5678.'
    }
  ];

  const categories = [
    { value: 'general', label: language === 'es' ? 'Consulta general' : 'General inquiry' },
    { value: 'booking', label: language === 'es' ? 'Problemas con reservación' : 'Booking issues' },
    { value: 'payment', label: language === 'es' ? 'Pagos y reembolsos' : 'Payments and refunds' },
    { value: 'business', label: language === 'es' ? 'Registro de negocio' : 'Business registration' },
    { value: 'technical', label: language === 'es' ? 'Soporte técnico' : 'Technical support' },
    { value: 'other', label: language === 'es' ? 'Otro' : 'Other' }
  ];

  return (
    <div className="min-h-screen pt-20 bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-coral/10 via-background to-teal/10 py-16">
        <div className="container-app text-center">
          <div className="w-20 h-20 bg-coral/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <HelpCircle className="w-10 h-10 text-coral" />
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-4">
            {language === 'es' ? '¿Cómo podemos ayudarte?' : 'How can we help you?'}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {language === 'es' 
              ? 'Estamos aquí para resolver tus dudas. Encuentra respuestas rápidas o envíanos un mensaje.'
              : 'We\'re here to help. Find quick answers or send us a message.'}
          </p>
        </div>
      </section>

      <div className="container-app py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* FAQ Section */}
          <div>
            <h2 className="text-2xl font-heading font-bold mb-6 flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-coral" />
              {language === 'es' ? 'Preguntas Frecuentes' : 'Frequently Asked Questions'}
            </h2>
            
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div 
                  key={index}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                    data-testid={`faq-${index}`}
                  >
                    <span className="font-medium text-foreground pr-4">{faq.question}</span>
                    <ChevronDown 
                      className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${
                        expandedFaq === index ? 'rotate-180' : ''
                      }`} 
                    />
                  </button>
                  {expandedFaq === index && (
                    <div className="px-4 pb-4 text-muted-foreground">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Contact Info */}
            <div className="mt-12 p-6 bg-muted/30 rounded-xl">
              <h3 className="font-semibold text-foreground mb-4">
                {language === 'es' ? 'Información de Contacto' : 'Contact Information'}
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-coral/20 rounded-full flex items-center justify-center">
                    <Mail className="w-5 h-5 text-coral" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <a href="mailto:soporte@bookvia.com" className="text-foreground hover:text-coral">
                      soporte@bookvia.com
                    </a>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal/20 rounded-full flex items-center justify-center">
                    <Phone className="w-5 h-5 text-teal" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {language === 'es' ? 'Teléfono' : 'Phone'}
                    </p>
                    <a href="tel:+525512345678" className="text-foreground hover:text-coral">
                      +52 55 1234 5678
                    </a>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                    <Clock className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {language === 'es' ? 'Horario de atención' : 'Business hours'}
                    </p>
                    <p className="text-foreground">
                      {language === 'es' ? 'Lun - Vie: 9:00 - 18:00' : 'Mon - Fri: 9:00 AM - 6:00 PM'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {language === 'es' ? 'Ubicación' : 'Location'}
                    </p>
                    <p className="text-foreground">Ciudad de México, México</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <h2 className="text-2xl font-heading font-bold mb-6 flex items-center gap-2">
              <Send className="w-6 h-6 text-coral" />
              {language === 'es' ? 'Envíanos un Mensaje' : 'Send us a Message'}
            </h2>

            {sent ? (
              <div className="text-center py-16 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {language === 'es' ? '¡Mensaje enviado!' : 'Message sent!'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {language === 'es' 
                    ? 'Te responderemos en un plazo de 24-48 horas.'
                    : 'We\'ll respond within 24-48 hours.'}
                </p>
                <Button onClick={() => setSent(false)} variant="outline">
                  {language === 'es' ? 'Enviar otro mensaje' : 'Send another message'}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      {language === 'es' ? 'Nombre completo' : 'Full name'} *
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder={language === 'es' ? 'Tu nombre' : 'Your name'}
                      required
                      data-testid="contact-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      {language === 'es' ? 'Correo electrónico' : 'Email'} *
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="tu@correo.com"
                      required
                      data-testid="contact-email"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">
                      {language === 'es' ? 'Categoría' : 'Category'}
                    </Label>
                    <Select 
                      value={formData.category} 
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger data-testid="contact-category">
                        <SelectValue placeholder={language === 'es' ? 'Selecciona una categoría' : 'Select a category'} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="subject">
                      {language === 'es' ? 'Asunto' : 'Subject'}
                    </Label>
                    <Input
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      placeholder={language === 'es' ? 'Asunto de tu mensaje' : 'Subject of your message'}
                      data-testid="contact-subject"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">
                    {language === 'es' ? 'Mensaje' : 'Message'} *
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder={language === 'es' 
                      ? 'Describe tu consulta o problema con el mayor detalle posible...'
                      : 'Describe your inquiry or issue in as much detail as possible...'}
                    rows={6}
                    required
                    data-testid="contact-message"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full btn-coral py-6 text-lg"
                  disabled={loading}
                  data-testid="contact-submit"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {language === 'es' ? 'Enviando...' : 'Sending...'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="w-5 h-5" />
                      {language === 'es' ? 'Enviar Mensaje' : 'Send Message'}
                    </span>
                  )}
                </Button>

                <p className="text-sm text-muted-foreground text-center">
                  {language === 'es' 
                    ? 'Al enviar este formulario, aceptas nuestra política de privacidad.'
                    : 'By submitting this form, you agree to our privacy policy.'}
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
