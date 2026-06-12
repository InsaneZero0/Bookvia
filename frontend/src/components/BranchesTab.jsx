import { useEffect, useState } from 'react';
import {
  Plus, MapPin, Phone, Star, Edit, Power, PowerOff, Trash2, X, Building2,
  Calendar, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '@/lib/api';

/**
 * Branches (Sucursales) management tab for the Business Dashboard.
 *
 * - Lists all branches with status badges and live metrics
 * - Create / edit modal
 * - Set primary / deactivate / delete actions
 * - The primary branch cannot be deleted; the API enforces this.
 */
export default function BranchesTab({ language = 'es' }) {
  const t = (es, en) => (language === 'es' ? es : en);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const empty = { name: '', address: '', city: '', state: '', zip_code: '', phone: '' };
  const [form, setForm] = useState(empty);

  const load = async () => {
    try {
      const res = await api.get('/businesses/me/branches');
      setBranches(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      toast.error(t('Error al cargar sucursales', 'Error loading branches'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openCreate = () => { setEditTarget(null); setForm(empty); setModalOpen(true); };
  const openEdit = (b) => {
    setEditTarget(b);
    setForm({
      name: b.name || '',
      address: b.address || '',
      city: b.city || '',
      state: b.state || '',
      zip_code: b.zip_code || '',
      phone: b.phone || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim()) {
      toast.error(t('Completa nombre, dirección, ciudad y estado', 'Fill name, address, city and state'));
      return;
    }
    setSubmitting(true);
    try {
      if (editTarget) {
        await api.patch(`/businesses/me/branches/${editTarget.id}`, form);
        toast.success(t('Sucursal actualizada', 'Branch updated'));
      } else {
        await api.post('/businesses/me/branches', form);
        toast.success(t('Sucursal creada', 'Branch created'));
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error', 'Error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPrimary = async (b) => {
    try {
      await api.post(`/businesses/me/branches/${b.id}/set-primary`);
      toast.success(t('Sucursal principal actualizada', 'Primary branch updated'));
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error', 'Error'));
    }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(t(`Eliminar sucursal "${b.name}"? Esta acción no se puede deshacer.`, `Delete branch "${b.name}"? This cannot be undone.`))) return;
    try {
      await api.delete(`/businesses/me/branches/${b.id}`);
      toast.success(t('Sucursal eliminada', 'Branch deleted'));
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error', 'Error'));
    }
  };

  const handleToggleActive = async (b) => {
    try {
      await api.patch(`/businesses/me/branches/${b.id}`, { is_active: !b.is_active });
      toast.success(t(b.is_active ? 'Sucursal desactivada' : 'Sucursal activada', b.is_active ? 'Branch deactivated' : 'Branch activated'));
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error', 'Error'));
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t('Cargando sucursales...', 'Loading branches...')}</div>;
  }

  return (
    <div className="space-y-4" data-testid="branches-tab">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-heading font-bold text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#F05D5E]" />
            {t('Sucursales', 'Branches')}
            <Badge variant="secondary" className="font-mono text-[10px]">{branches.length}</Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Administra las ubicaciones físicas de tu negocio. Cada sucursal aparece como ubicación independiente en la búsqueda.',
              'Manage your business physical locations. Each branch appears as an independent location in search.')}
          </p>
        </div>
        <Button onClick={openCreate} className="btn-coral" data-testid="branch-create-btn">
          <Plus className="h-4 w-4 mr-1.5" />
          {t('Nueva sucursal', 'New branch')}
        </Button>
      </header>

      {branches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t('Aún no tienes sucursales. La primera se creará automáticamente al recargar.', 'No branches yet. The first one will auto-create on reload.')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {branches.map(b => (
            <Card key={b.id} className={`border ${!b.is_active ? 'opacity-60' : ''} ${b.is_primary ? 'border-[#F05D5E]/40 bg-[#F05D5E]/5' : 'border-border/60'}`} data-testid={`branch-card-${b.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-sm">{b.name}</h3>
                      {b.is_primary && (
                        <Badge className="bg-[#F05D5E] text-white text-[10px] font-medium" data-testid={`branch-primary-badge-${b.id}`}>
                          <Star className="h-2.5 w-2.5 mr-1" />{t('Principal', 'Primary')}
                        </Badge>
                      )}
                      {!b.is_active && (
                        <Badge variant="secondary" className="text-[10px]" data-testid={`branch-inactive-badge-${b.id}`}>
                          {t('Inactiva', 'Inactive')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="break-words">{b.address}, {b.city}, {b.state}</span>
                    </p>
                    {b.phone && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Phone className="h-3 w-3" />{b.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">{t('Citas (mes)', 'Bookings (mo)')}</p>
                    <p className="text-base font-bold font-heading">{b.bookings_month ?? 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">{t('Servicios', 'Services')}</p>
                    <p className="text-base font-bold font-heading">{b.services_count ?? 0}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openEdit(b)} className="h-7 text-xs" data-testid={`branch-edit-${b.id}`}>
                    <Edit className="h-3 w-3 mr-1" />{t('Editar', 'Edit')}
                  </Button>
                  {!b.is_primary && b.is_active && (
                    <Button size="sm" variant="outline" onClick={() => handleSetPrimary(b)} className="h-7 text-xs" data-testid={`branch-set-primary-${b.id}`}>
                      <Star className="h-3 w-3 mr-1" />{t('Hacer principal', 'Set primary')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleToggleActive(b)} className="h-7 text-xs" data-testid={`branch-toggle-${b.id}`}>
                    {b.is_active ? <><PowerOff className="h-3 w-3 mr-1" />{t('Desactivar', 'Deactivate')}</> : <><Power className="h-3 w-3 mr-1" />{t('Activar', 'Activate')}</>}
                  </Button>
                  {!b.is_primary && (
                    <Button size="sm" variant="outline" onClick={() => handleDelete(b)} className="h-7 text-xs text-red-600 hover:bg-red-50" data-testid={`branch-delete-${b.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md" data-testid="branch-modal">
          <DialogHeader>
            <DialogTitle>{editTarget ? t('Editar sucursal', 'Edit branch') : t('Nueva sucursal', 'New branch')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">{t('Nombre', 'Name')} *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Sucursal Centro" maxLength={120} className="mt-1" data-testid="branch-name-input" />
            </div>
            <div>
              <Label className="text-xs">{t('Dirección', 'Address')} *</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Av Reforma 123" maxLength={300} className="mt-1" data-testid="branch-address-input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('Ciudad', 'City')} *</Label>
                <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Querétaro" maxLength={80} className="mt-1" data-testid="branch-city-input" />
              </div>
              <div>
                <Label className="text-xs">{t('Estado', 'State')} *</Label>
                <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="QRO" maxLength={80} className="mt-1" data-testid="branch-state-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('Código postal', 'Zip code')}</Label>
                <Input value={form.zip_code} onChange={e => setForm({ ...form, zip_code: e.target.value })} maxLength={20} className="mt-1" data-testid="branch-zip-input" />
              </div>
              <div>
                <Label className="text-xs">{t('Teléfono', 'Phone')}</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+52..." maxLength={30} className="mt-1" data-testid="branch-phone-input" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={submitting} data-testid="branch-modal-cancel">
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="btn-coral" data-testid="branch-modal-save">
              {submitting ? t('Guardando...', 'Saving...') : (editTarget ? t('Guardar cambios', 'Save changes') : t('Crear sucursal', 'Create branch'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
