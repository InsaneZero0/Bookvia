import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { businessesAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * LFPDPPP-compliant "delete my account" card. Used in user settings (kind="user")
 * and business settings (kind="business"). Confirms with typed phrase before
 * triggering soft-delete on the backend.
 */
export default function DeleteAccountCard({ kind = 'user' }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const expected = 'ELIMINAR';

  const handleDelete = async () => {
    if (confirmText !== expected) return;
    setSubmitting(true);
    try {
      if (kind === 'business') {
        await businessesAPI.deleteMyBusinessAccount();
      } else {
        await businessesAPI.deleteMyAccount();
      }
      toast.success('Cuenta eliminada. Sesion cerrada.');
      logout();
      navigate('/');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al eliminar cuenta');
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Card className="border-red-200" data-testid={`delete-account-card-${kind}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="w-5 h-5" />
            Eliminar cuenta
          </CardTitle>
          <CardDescription>
            Derecho al olvido (LFPDPPP). Tu informacion personal sera anonimizada permanentemente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <ul className="list-disc pl-5 space-y-1">
            <li>Tus datos personales (nombre, telefono, email) seran anonimizados.</li>
            {kind === 'business' ? (
              <>
                <li>Tu negocio sera removido del marketplace publico.</li>
                <li>Tu suscripcion mensual sera cancelada.</li>
                <li>El historial de liquidaciones se conserva por motivos fiscales.</li>
              </>
            ) : (
              <>
                <li>El historial de tus reservas se conserva sin tus datos personales.</li>
                <li>El saldo de tu wallet se pierde.</li>
              </>
            )}
            <li>No podras recuperar la cuenta despues.</li>
          </ul>
          <Button
            variant="destructive"
            onClick={() => setOpen(true)}
            data-testid={`delete-account-btn-${kind}`}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Eliminar mi cuenta
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="delete-account-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Confirmar eliminacion
            </DialogTitle>
            <DialogDescription>
              Esta accion es irreversible. Para confirmar, escribe{' '}
              <span className="font-mono font-bold text-red-700">{expected}</span> abajo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-delete-input">Escribe ELIMINAR para confirmar</Label>
            <Input
              id="confirm-delete-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ELIMINAR"
              data-testid="delete-account-confirm-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting || confirmText !== expected}
              data-testid="delete-account-final-btn"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Eliminando...</>
              ) : (
                'Eliminar definitivamente'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
