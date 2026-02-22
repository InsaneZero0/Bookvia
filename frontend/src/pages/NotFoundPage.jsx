import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { Home, Search } from 'lucide-react';

export default function NotFoundPage() {
  const { language } = useI18n();

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-background" data-testid="not-found-page">
      <div className="text-center px-4">
        <h1 className="text-9xl font-heading font-extrabold text-[#F05D5E]">404</h1>
        <h2 className="text-2xl font-heading font-bold mt-4 mb-2">
          {language === 'es' ? 'Página no encontrada' : 'Page not found'}
        </h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          {language === 'es' 
            ? 'Lo sentimos, la página que buscas no existe o ha sido movida.'
            : 'Sorry, the page you are looking for does not exist or has been moved.'}
        </p>
        <div className="flex justify-center gap-4">
          <Button asChild className="btn-coral">
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              {language === 'es' ? 'Ir al inicio' : 'Go home'}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/search">
              <Search className="mr-2 h-4 w-4" />
              {language === 'es' ? 'Buscar servicios' : 'Search services'}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
