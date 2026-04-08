import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function GoogleAuthCallback() {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processGoogleAuth = async () => {
      try {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.replace('#', ''));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          toast.error('No se recibió sesión de Google');
          navigate('/login', { replace: true });
          return;
        }

        await googleLogin(sessionId);
        toast.success('¡Bienvenido!');
        navigate('/dashboard', { replace: true });
      } catch (error) {
        const detail = error.response?.data?.detail || 'Error al iniciar sesión con Google';
        toast.error(detail);
        navigate('/login', { replace: true });
      }
    };

    processGoogleAuth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#F05D5E] mx-auto" />
        <p className="text-muted-foreground">Conectando con Google...</p>
      </div>
    </div>
  );
}
