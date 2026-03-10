import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  Users, 
  Target, 
  Heart, 
  Zap, 
  Shield, 
  Globe,
  ChevronRight,
  Calendar,
  Star,
  TrendingUp
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function AboutPage() {
  const { language } = useI18n();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const stats = [
    { value: '10+', label: 'Ciudades', icon: Globe },
    { value: '500+', label: 'Negocios', icon: Building2 },
    { value: '10K+', label: 'Reservaciones', icon: Calendar },
    { value: '4.8', label: 'Calificación', icon: Star },
  ];

  const values = [
    {
      icon: Heart,
      title: 'Pasión por el Servicio',
      description: 'Creemos que cada interacción cuenta. Nos dedicamos a crear experiencias excepcionales tanto para usuarios como para negocios.'
    },
    {
      icon: Shield,
      title: 'Confianza y Seguridad',
      description: 'Verificamos cada negocio y protegemos cada transacción. Tu seguridad y la de tu información son nuestra prioridad.'
    },
    {
      icon: Zap,
      title: 'Innovación Constante',
      description: 'Utilizamos tecnología de punta para simplificar las reservaciones y ayudar a los negocios a crecer.'
    },
    {
      icon: Users,
      title: 'Comunidad',
      description: 'Construimos puentes entre profesionales talentosos y personas que buscan servicios de calidad.'
    },
  ];

  const team = [
    {
      name: 'María González',
      role: 'CEO & Co-fundadora',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face'
    },
    {
      name: 'Carlos Ramírez',
      role: 'CTO & Co-fundador',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face'
    },
    {
      name: 'Ana Martínez',
      role: 'Head of Operations',
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face'
    },
    {
      name: 'Roberto López',
      role: 'Head of Growth',
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face'
    },
  ];

  return (
    <div className="min-h-screen pt-20 bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-coral/10 via-background to-teal/10 py-20">
        <div className="container-app">
          <nav className="flex items-center text-sm text-muted-foreground mb-8">
            <Link to="/" className="hover:text-foreground">Inicio</Link>
            <ChevronRight className="w-4 h-4 mx-2" />
            <span className="text-foreground">Sobre Nosotros</span>
          </nav>

          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold text-foreground mb-6">
              Conectamos talento con{' '}
              <span className="text-coral">oportunidades</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Bookvia nació con una misión simple: hacer que reservar servicios profesionales 
              sea tan fácil como pedir comida a domicilio. Estamos transformando la manera en 
              que las personas descubren y reservan servicios de belleza, salud y bienestar 
              en México.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-b border-border">
        <div className="container-app">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 bg-coral/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <stat.icon className="w-6 h-6 text-coral" />
                </div>
                <div className="text-3xl md:text-4xl font-bold text-foreground">{stat.value}</div>
                <div className="text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20">
        <div className="container-app">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-6">
                Nuestra Historia
              </h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  Todo comenzó en 2024, cuando nuestros fundadores experimentaron la frustración 
                  de intentar reservar una cita en su salón favorito. Llamadas sin respuesta, 
                  mensajes de WhatsApp perdidos, y la incertidumbre de no saber si había espacio 
                  disponible.
                </p>
                <p>
                  Nos preguntamos: ¿por qué reservar un servicio de belleza tiene que ser tan 
                  complicado cuando podemos reservar un vuelo o un hotel en segundos?
                </p>
                <p>
                  Así nació Bookvia. Una plataforma que empodera a los pequeños y medianos negocios 
                  con herramientas profesionales, mientras ofrece a los usuarios una experiencia 
                  de reservación moderna y sin fricciones.
                </p>
                <p className="font-medium text-foreground">
                  Hoy, miles de mexicanos confían en Bookvia para sus reservaciones diarias, 
                  y cientos de negocios han digitalizado sus operaciones con nuestra plataforma.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=800&fit=crop"
                  alt="Equipo Bookvia"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-coral text-white p-6 rounded-xl shadow-xl">
                <TrendingUp className="w-8 h-8 mb-2" />
                <div className="text-2xl font-bold">+300%</div>
                <div className="text-sm opacity-90">Crecimiento anual</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-20 bg-muted/30">
        <div className="container-app">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="bg-card border border-border rounded-2xl p-8">
              <div className="w-14 h-14 bg-coral/20 rounded-full flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-coral" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-foreground mb-4">
                Nuestra Misión
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Democratizar el acceso a servicios profesionales de calidad, conectando a 
                usuarios con los mejores proveedores de servicios locales a través de una 
                plataforma tecnológica innovadora, segura y fácil de usar.
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-8">
              <div className="w-14 h-14 bg-teal/20 rounded-full flex items-center justify-center mb-6">
                <Globe className="w-7 h-7 text-teal" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-foreground mb-4">
                Nuestra Visión
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Ser la plataforma líder de reservaciones en Latinoamérica, impulsando el 
                crecimiento de millones de pequeños negocios mientras mejoramos la calidad 
                de vida de las personas al facilitar el acceso a servicios esenciales.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20">
        <div className="container-app">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
              Nuestros Valores
            </h2>
            <p className="text-muted-foreground">
              Los principios que guían cada decisión que tomamos y cada producto que construimos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <div key={index} className="text-center group">
                <div className="w-16 h-16 bg-gradient-to-br from-coral/20 to-teal/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <value.icon className="w-8 h-8 text-coral" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{value.title}</h3>
                <p className="text-muted-foreground text-sm">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 bg-muted/30">
        <div className="container-app">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
              Conoce al Equipo
            </h2>
            <p className="text-muted-foreground">
              Un equipo apasionado por la tecnología y el servicio al cliente.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <div key={index} className="text-center group">
                <div className="w-32 h-32 mx-auto mb-4 rounded-full overflow-hidden border-4 border-background shadow-lg group-hover:scale-105 transition-transform">
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="font-semibold text-foreground">{member.name}</h3>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-coral to-coral/80 text-white">
        <div className="container-app text-center">
          <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">
            ¿Listo para unirte a Bookvia?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Ya sea que busques reservar tu próximo servicio o hacer crecer tu negocio, 
            estamos aquí para ayudarte.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/search"
              className="px-8 py-4 bg-white text-coral font-semibold rounded-full hover:bg-slate-100 transition-colors"
            >
              Explorar Servicios
            </Link>
            <Link
              to="/business/register"
              className="px-8 py-4 border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition-colors"
            >
              Registrar mi Negocio
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
