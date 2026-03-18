import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { servicesAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Clock, DollarSign, ArrowLeft, Loader2 } from 'lucide-react';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180];

export default function ServiceManagementPage() {
  const { language, t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', price: '', duration_minutes: 60 });

  useEffect(() => {
    const bizId = user?.business_id;
    if (bizId) loadServices();
  }, [user]);

  const loadServices = async () => {
    try {
      const bizId = user?.business_id;
      const res = await servicesAPI.getByBusiness(bizId);
      setServices(res.data || []);
    } catch { toast.error('Error loading services'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', price: '', duration_minutes: 60 });
    setDialogOpen(true);
  };

  const openEdit = (service) => {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description || '',
      price: String(service.price),
      duration_minutes: service.duration_minutes || 60,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(language === 'es' ? 'El nombre es obligatorio' : 'Name is required'); return; }
    if (!form.price || Number(form.price) <= 0) { toast.error(language === 'es' ? 'El precio debe ser mayor a 0' : 'Price must be greater than 0'); return; }
    if (!form.duration_minutes || form.duration_minutes < 15) { toast.error(language === 'es' ? 'La duracion minima es 15 minutos' : 'Minimum duration is 15 minutes'); return; }

    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        duration_minutes: Number(form.duration_minutes),
      };

      if (editing) {
        await servicesAPI.update(editing.id, data);
        toast.success(language === 'es' ? 'Servicio actualizado' : 'Service updated');
      } else {
        await servicesAPI.create(data);
        toast.success(language === 'es' ? 'Servicio creado' : 'Service created');
      }
      setDialogOpen(false);
      loadServices();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(language === 'es' ? 'Eliminar este servicio?' : 'Delete this service?')) return;
    try {
      await servicesAPI.delete(id);
      toast.success(language === 'es' ? 'Servicio eliminado' : 'Service deleted');
      loadServices();
    } catch { toast.error('Error'); }
  };

  const formatCurrency = (v) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);

  if (loading) return (
    <div className="min-h-screen pt-20 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#F05D5E]" />
    </div>
  );

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="service-management-page">
      <div className="container-app max-w-3xl py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/business/dashboard')} data-testid="back-to-dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-heading font-bold">{language === 'es' ? 'Mis servicios' : 'My services'}</h1>
              <p className="text-sm text-muted-foreground">{services.length} {language === 'es' ? 'servicios activos' : 'active services'}</p>
            </div>
          </div>
          <Button className="btn-coral" onClick={openCreate} data-testid="add-service-btn">
            <Plus className="h-4 w-4 mr-1.5" />
            {language === 'es' ? 'Nuevo servicio' : 'New service'}
          </Button>
        </div>

        {/* Service List */}
        {services.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">{language === 'es' ? 'No tienes servicios registrados' : 'No services registered'}</p>
              <Button className="btn-coral" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                {language === 'es' ? 'Crear primer servicio' : 'Create first service'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {services.map(service => (
              <Card key={service.id} className="group hover:border-[#F05D5E]/30 transition-colors" data-testid={`service-card-${service.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-base">{service.name}</h3>
                      {service.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {service.duration_minutes} min
                        </Badge>
                        <span className="text-base font-bold text-[#F05D5E]">{formatCurrency(service.price)}</span>
                        {service.is_home_service && (
                          <Badge variant="outline" className="text-xs">{language === 'es' ? 'A domicilio' : 'Home service'}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(service)} data-testid={`edit-service-${service.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(service.id)} data-testid={`delete-service-${service.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing
                ? (language === 'es' ? 'Editar servicio' : 'Edit service')
                : (language === 'es' ? 'Nuevo servicio' : 'New service')}
            </DialogTitle>
            <DialogDescription>
              {language === 'es' ? 'Define los detalles del servicio incluyendo su duracion.' : 'Define service details including duration.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{language === 'es' ? 'Nombre del servicio' : 'Service name'} *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({...f, name: e.target.value}))}
                placeholder={language === 'es' ? 'Ej: Corte de cabello' : 'Ex: Haircut'}
                data-testid="service-name-input"
              />
            </div>

            <div>
              <Label>{language === 'es' ? 'Descripcion' : 'Description'}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({...f, description: e.target.value}))}
                placeholder={language === 'es' ? 'Describe brevemente el servicio...' : 'Briefly describe the service...'}
                rows={2}
                data-testid="service-description-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{language === 'es' ? 'Precio (MXN)' : 'Price (MXN)'} *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm(f => ({...f, price: e.target.value}))}
                    className="pl-9"
                    placeholder="0.00"
                    data-testid="service-price-input"
                  />
                </div>
              </div>

              <div>
                <Label>{language === 'es' ? 'Duracion (min)' : 'Duration (min)'} *</Label>
                <select
                  value={form.duration_minutes}
                  onChange={(e) => setForm(f => ({...f, duration_minutes: Number(e.target.value)}))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="service-duration-select"
                >
                  {DURATION_OPTIONS.map(d => (
                    <option key={d} value={d}>
                      {d} min {d >= 60 ? `(${d/60}h${d%60 ? ` ${d%60}m` : ''})` : ''}
                    </option>
                  ))}
                  <option value={240}>240 min (4h)</option>
                </select>
              </div>
            </div>

            <Button className="w-full btn-coral" onClick={handleSave} disabled={saving} data-testid="save-service-btn">
              {saving
                ? (language === 'es' ? 'Guardando...' : 'Saving...')
                : editing
                  ? (language === 'es' ? 'Guardar cambios' : 'Save changes')
                  : (language === 'es' ? 'Crear servicio' : 'Create service')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
