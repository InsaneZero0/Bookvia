import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  ArrowLeft, Mail, Phone, User, ShieldX, MapPin, Search, Loader2,
  Ban, Trash2, Plus, FileText, CreditCard, Building2, Eye, EyeOff,
  Calendar, Shield, ExternalLink, Save, Pencil
} from 'lucide-react';

export default function BusinessSettingsPage() {
  const { language } = useI18n();
  const { isAuthenticated, isBusiness, user } = useAuth();
  const navigate = useNavigate();
  const t = (es, en) => language === 'es' ? es : en;

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  // Business info
  const [privateInfo, setPrivateInfo] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Sensitive data visibility
  const [showClabe, setShowClabe] = useState(false);
  const [showRfc, setShowRfc] = useState(false);

  // Blacklist
  const [blacklist, setBlacklist] = useState([]);
  const [adding, setAdding] = useState(false);
  const [blForm, setBlForm] = useState({ email: '', phone: '', user_id: '', reason: '' });

  // Location
  const [locationSearch, setLocationSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isBusiness) { navigate('/business/login'); return; }
    loadData();
  }, [isAuthenticated, isBusiness]);

  const loadData = async () => {
    try {
      const [infoRes, blRes, dashRes] = await Promise.all([
        businessesAPI.getPrivateInfo().catch(() => null),
        businessesAPI.getBlacklist().catch(() => ({ data: [] })),
        businessesAPI.getDashboard().catch(() => null),
      ]);
      if (infoRes?.data) {
        setPrivateInfo(infoRes.data);
        setEditForm({
          name: infoRes.data.name || '',
          phone: infoRes.data.phone || '',
          description: infoRes.data.description || '',
        });
      }
      setBlacklist(Array.isArray(blRes?.data) ? blRes.data : []);
      const biz = dashRes?.data?.business;
      if (biz?.latitude && biz?.longitude) {
        setCurrentLocation({ lat: biz.latitude, lng: biz.longitude, address: biz.address, city: biz.city, state: biz.state });
      }
    } catch {}
    setLoading(false);
  };

  const handleSaveInfo = async () => {
    setSaving(true);
    try {
      await businessesAPI.updateBusiness({
        name: editForm.name,
        description: editForm.description,
      });
      setPrivateInfo(prev => ({ ...prev, name: editForm.name, description: editForm.description }));
      setEditMode(false);
      toast.success(t('Informacion guardada', 'Information saved'));
    } catch {
      toast.error(t('Error al guardar', 'Error saving'));
    }
    setSaving(false);
  };

  // Location handlers
  const searchAddress = async () => {
    if (!locationSearch.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearch)}&limit=5&countrycodes=mx&addressdetails=1`, {
        headers: { 'Accept-Language': language === 'es' ? 'es' : 'en' }
      });
      const data = await res.json();
      setSearchResults(data.map(r => ({
        display: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon),
        city: r.address?.city || r.address?.town || r.address?.municipality || '',
        state: r.address?.state || '',
      })));
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const selectLocation = async (loc) => {
    setSavingLocation(true);
    try {
      await businessesAPI.updateBusiness({
        latitude: loc.lat, longitude: loc.lng,
        address: loc.display.split(',')[0], city: loc.city, state: loc.state,
      });
      setCurrentLocation({ lat: loc.lat, lng: loc.lng, address: loc.display.split(',')[0], city: loc.city, state: loc.state });
      setSearchResults([]);
      setLocationSearch('');
      toast.success(t('Ubicacion guardada', 'Location saved'));
    } catch { toast.error(t('Error al guardar', 'Save error')); }
    setSavingLocation(false);
  };

  // Blacklist handlers
  const handleAddBlacklist = async () => {
    if (!blForm.email && !blForm.phone && !blForm.user_id) {
      toast.error(t('Ingresa al menos un identificador', 'Enter at least one identifier'));
      return;
    }
    setAdding(true);
    try {
      const payload = {};
      if (blForm.email.trim()) payload.email = blForm.email.trim();
      if (blForm.phone.trim()) payload.phone = blForm.phone.trim();
      if (blForm.user_id.trim()) payload.user_id = blForm.user_id.trim();
      if (blForm.reason.trim()) payload.reason = blForm.reason.trim();
      await businessesAPI.addToBlacklist(payload);
      toast.success(t('Cliente vetado correctamente', 'Client banned successfully'));
      setBlForm({ email: '', phone: '', user_id: '', reason: '' });
      const res = await businessesAPI.getBlacklist();
      setBlacklist(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('Error al vetar', 'Error banning'));
    }
    setAdding(false);
  };

  const handleRemoveBlacklist = async (entryId) => {
    if (!window.confirm(t('Quitar este veto?', 'Remove this ban?'))) return;
    try {
      await businessesAPI.removeFromBlacklist(entryId);
      setBlacklist(prev => prev.filter(e => e.id !== entryId));
      toast.success(t('Veto eliminado', 'Ban removed'));
    } catch { toast.error('Error'); }
  };

  const maskValue = (val, showChars = 4) => {
    if (!val) return '---';
    if (val.length <= showChars) return val;
    return '*'.repeat(val.length - showChars) + val.slice(-showChars);
  };

  const tabs = [
    { id: 'info', label: t('Informacion', 'Information'), icon: Building2 },
    { id: 'documents', label: t('Documentos', 'Documents'), icon: FileText },
    { id: 'subscription', label: t('Suscripcion', 'Subscription'), icon: CreditCard },
    { id: 'location', label: t('Ubicacion', 'Location'), icon: MapPin },
    { id: 'blacklist', label: t('Vetos', 'Bans'), icon: ShieldX },
  ];

  // Check if user is manager (not owner)
  const isManager = user?.worker_id;

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8 max-w-3xl">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-12 mb-4" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="business-settings-page">
      <div className="container-app py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business/dashboard')} data-testid="back-to-dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-heading font-bold">{t('Configuracion', 'Settings')}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1" data-testid="settings-tabs">
          {tabs.filter(tab => !(isManager && (tab.id === 'documents' || tab.id === 'subscription'))).map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              size="sm"
              className={activeTab === tab.id ? 'btn-coral shrink-0' : 'shrink-0'}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="h-4 w-4 mr-1.5" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* ===================== INFO TAB ===================== */}
        {activeTab === 'info' && privateInfo && (
          <Card data-testid="info-section">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#F05D5E]" />
                {t('Informacion del negocio', 'Business information')}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditMode(!editMode)} data-testid="edit-info-btn">
                <Pencil className="h-4 w-4 mr-1" />{editMode ? t('Cancelar', 'Cancel') : t('Editar', 'Edit')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {editMode ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('Nombre del negocio', 'Business name')}</Label>
                    <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} data-testid="edit-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('Descripcion', 'Description')}</Label>
                    <Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={3} data-testid="edit-description" />
                  </div>
                  <Button className="btn-coral" onClick={handleSaveInfo} disabled={saving} data-testid="save-info-btn">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    {t('Guardar cambios', 'Save changes')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <InfoRow icon={Building2} label={t('Nombre', 'Name')} value={privateInfo.name} />
                  <InfoRow icon={Mail} label="Email" value={privateInfo.email} />
                  <InfoRow icon={Phone} label={t('Telefono', 'Phone')} value={privateInfo.phone} />
                  <Separator />
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('Descripcion', 'Description')}</Label>
                    <p className="text-sm mt-1 leading-relaxed">{privateInfo.description || t('Sin descripcion', 'No description')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===================== DOCUMENTS TAB ===================== */}
        {activeTab === 'documents' && privateInfo && !isManager && (
          <Card data-testid="documents-section">
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#F05D5E]" />
                {t('Documentos legales', 'Legal documents')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t('Solo tu como dueno puedes ver esta informacion.', 'Only you as the owner can see this information.')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow icon={User} label={t('Razon Social', 'Legal Name')} value={privateInfo.legal_name} />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">RFC</p>
                    <p className="text-sm font-medium font-mono" data-testid="rfc-value">
                      {showRfc ? privateInfo.rfc : maskValue(privateInfo.rfc)}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowRfc(!showRfc)} data-testid="toggle-rfc">
                  {showRfc ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">CLABE</p>
                    <p className="text-sm font-medium font-mono" data-testid="clabe-value">
                      {showClabe ? privateInfo.clabe : maskValue(privateInfo.clabe)}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowClabe(!showClabe)} data-testid="toggle-clabe">
                  {showClabe ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>

              <InfoRow icon={Calendar} label={t('Fecha de nacimiento', 'Birth date')} value={privateInfo.owner_birth_date || '---'} />

              <Separator />

              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('Archivos subidos', 'Uploaded files')}</p>
                
                {privateInfo.ine_url ? (
                  <a href={privateInfo.ine_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors" data-testid="ine-link">
                    <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t('Identificacion oficial (INE)', 'Official ID (INE)')}</p>
                      <p className="text-xs text-muted-foreground truncate">{t('Clic para ver', 'Click to view')}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic">{t('INE no subida', 'INE not uploaded')}</p>
                )}

                {privateInfo.proof_of_address_url ? (
                  <a href={privateInfo.proof_of_address_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors" data-testid="proof-link">
                    <FileText className="h-5 w-5 text-green-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t('Constancia de Situacion Fiscal', 'Tax Status Certificate')}</p>
                      <p className="text-xs text-muted-foreground truncate">{t('Clic para ver', 'Click to view')}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic">{t('Constancia no subida', 'Certificate not uploaded')}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===================== SUBSCRIPTION TAB ===================== */}
        {activeTab === 'subscription' && privateInfo && !isManager && (
          <Card data-testid="subscription-section">
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#F05D5E]" />
                {t('Suscripcion y facturacion', 'Subscription & billing')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border">
                <div>
                  <p className="text-xs text-muted-foreground">{t('Estado', 'Status')}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={
                      privateInfo.subscription_status === 'active' || privateInfo.subscription_status === 'trialing' 
                        ? 'default' : 'secondary'
                    } className={
                      privateInfo.subscription_status === 'active' || privateInfo.subscription_status === 'trialing'
                        ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''
                    } data-testid="subscription-status">
                      {privateInfo.subscription_status === 'trialing' ? t('Periodo de prueba', 'Trial period') :
                       privateInfo.subscription_status === 'active' ? t('Activa', 'Active') :
                       privateInfo.subscription_status === 'none' ? t('Sin suscripcion', 'No subscription') :
                       privateInfo.subscription_status}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t('Plan', 'Plan')}</p>
                  <p className="text-sm font-semibold mt-1">$39 MXN / {t('mes', 'month')}</p>
                </div>
              </div>

              {/* Subscription details */}
              {privateInfo.subscription_info && (
                <div className="space-y-3">
                  {privateInfo.subscription_info.trial_end && (
                    <InfoRow icon={Calendar} label={t('Prueba termina', 'Trial ends')} 
                      value={new Date(privateInfo.subscription_info.trial_end).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
                  )}
                  
                  {privateInfo.subscription_info.current_period_end && (
                    <InfoRow icon={Calendar} label={t('Proximo cobro', 'Next billing')} 
                      value={new Date(privateInfo.subscription_info.current_period_end).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
                  )}

                  {privateInfo.subscription_info.cancel_at_period_end && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 p-3">
                      <p className="text-sm text-amber-700 font-medium">{t('Tu suscripcion se cancelara al final del periodo actual', 'Your subscription will cancel at the end of the current period')}</p>
                    </div>
                  )}

                  {/* Card info */}
                  {privateInfo.subscription_info.card_last4 && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20" data-testid="card-info">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {privateInfo.subscription_info.card_brand} **** {privateInfo.subscription_info.card_last4}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('Metodo de pago registrado', 'Registered payment method')}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {privateInfo.subscription_started_at && (
                <InfoRow icon={Calendar} label={t('Suscrito desde', 'Subscribed since')} 
                  value={new Date(privateInfo.subscription_started_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
              )}
            </CardContent>
          </Card>
        )}

        {/* ===================== LOCATION TAB ===================== */}
        {activeTab === 'location' && (
          <Card data-testid="location-section">
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[#F05D5E]" />
                {t('Ubicacion del negocio', 'Business location')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t('Busca tu direccion para mostrar el mapa en tu perfil publico.', 'Search your address to show the map on your public profile.')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder={t('Buscar direccion...', 'Search address...')}
                  value={locationSearch}
                  onChange={e => setLocationSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchAddress()}
                  data-testid="location-search-input"
                />
                <Button variant="outline" onClick={searchAddress} disabled={searching || !locationSearch.trim()} data-testid="location-search-btn">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button key={i} className="w-full text-left px-3 py-2.5 hover:bg-muted/50 text-sm flex items-start gap-2"
                      onClick={() => selectLocation(r)} disabled={savingLocation} data-testid={`location-result-${i}`}>
                      <MapPin className="h-4 w-4 text-[#F05D5E] mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{r.display}</span>
                    </button>
                  ))}
                </div>
              )}

              {currentLocation ? (
                <div className="rounded-xl border overflow-hidden" data-testid="current-location-map">
                  <iframe title="map" width="100%" height="200" style={{ border: 0 }} loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${currentLocation.lng - 0.008}%2C${currentLocation.lat - 0.005}%2C${currentLocation.lng + 0.008}%2C${currentLocation.lat + 0.005}&layer=mapnik&marker=${currentLocation.lat}%2C${currentLocation.lng}`} />
                  <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#F05D5E] shrink-0" />
                    <span className="text-sm truncate">{currentLocation.address}, {currentLocation.city}, {currentLocation.state}</span>
                  </div>
                </div>
              ) : (
                <div className="h-[160px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center">
                  <MapPin className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">{t('Busca tu direccion para ver el mapa', 'Search your address to see the map')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===================== BLACKLIST TAB ===================== */}
        {activeTab === 'blacklist' && (
          <Card data-testid="blacklist-section">
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <ShieldX className="h-5 w-5 text-[#F05D5E]" />
                {t('Clientes vetados', 'Banned clients')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t('Los clientes vetados no podran ver tu negocio ni realizar reservas.', 'Banned clients won\'t be able to see your business or make bookings.')}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border border-dashed p-4 space-y-3" data-testid="blacklist-add-form">
                <p className="text-sm font-medium flex items-center gap-2"><Plus className="h-4 w-4" />{t('Agregar cliente al veto', 'Add client to ban list')}</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs flex items-center gap-1 mb-1"><Mail className="h-3 w-3" /> Email</Label>
                    <Input type="email" placeholder="cliente@email.com" value={blForm.email} onChange={e => setBlForm(p => ({ ...p, email: e.target.value }))} data-testid="blacklist-email" />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1 mb-1"><Phone className="h-3 w-3" /> {t('Telefono', 'Phone')}</Label>
                    <Input placeholder="+52 555 000 0000" value={blForm.phone} onChange={e => setBlForm(p => ({ ...p, phone: e.target.value }))} data-testid="blacklist-phone" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1">{t('Razon', 'Reason')}</Label>
                    <Input placeholder={t('Opcional...', 'Optional...')} value={blForm.reason} onChange={e => setBlForm(p => ({ ...p, reason: e.target.value }))} data-testid="blacklist-reason" />
                  </div>
                </div>
                <Button className="btn-coral w-full sm:w-auto" onClick={handleAddBlacklist} disabled={adding} data-testid="blacklist-add-btn">
                  {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
                  {t('Vetar cliente', 'Ban client')}
                </Button>
              </div>

              <Separator />

              {blacklist.length > 0 ? (
                <div className="space-y-2">
                  {blacklist.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border" data-testid={`blacklist-entry-${entry.id}`}>
                      <Ban className="h-4 w-4 text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5">
                          {entry.email && <Badge variant="outline" className="text-xs"><Mail className="h-3 w-3 mr-1" />{entry.email}</Badge>}
                          {entry.phone && <Badge variant="outline" className="text-xs"><Phone className="h-3 w-3 mr-1" />{entry.phone}</Badge>}
                        </div>
                        {entry.reason && <p className="text-xs text-muted-foreground mt-1 truncate">{entry.reason}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(entry.created_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50 shrink-0"
                        onClick={() => handleRemoveBlacklist(entry.id)} data-testid={`blacklist-remove-${entry.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 border-2 border-dashed rounded-xl">
                  <Ban className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">{t('No tienes clientes vetados', 'No banned clients')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '---'}</p>
      </div>
    </div>
  );
}
