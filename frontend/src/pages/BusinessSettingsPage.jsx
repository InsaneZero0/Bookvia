import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Ban, Trash2, Plus, ArrowLeft, Mail, Phone, User, ShieldX, MapPin, Search, Loader2 } from 'lucide-react';

export default function BusinessSettingsPage() {
  const { language } = useI18n();
  const { isAuthenticated, isBusiness } = useAuth();
  const navigate = useNavigate();

  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', phone: '', user_id: '', reason: '' });

  // Location state
  const [locationSearch, setLocationSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isBusiness) { navigate('/business/login'); return; }
    loadBlacklist();
    loadCurrentLocation();
  }, [isAuthenticated, isBusiness]);

  const loadCurrentLocation = async () => {
    try {
      const res = await businessesAPI.getMyBusiness();
      const biz = res.data;
      if (biz.latitude && biz.longitude) {
        setCurrentLocation({ lat: biz.latitude, lng: biz.longitude, address: biz.address, city: biz.city, state: biz.state });
      }
    } catch {}
  };

  const searchAddress = async () => {
    if (!locationSearch.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearch)}&limit=5&countrycodes=mx&addressdetails=1`, {
        headers: { 'Accept-Language': language === 'es' ? 'es' : 'en' }
      });
      const data = await res.json();
      setSearchResults(data.map(r => ({
        display: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
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
        latitude: loc.lat,
        longitude: loc.lng,
        address: loc.display.split(',')[0],
        city: loc.city,
        state: loc.state,
      });
      setCurrentLocation({ lat: loc.lat, lng: loc.lng, address: loc.display.split(',')[0], city: loc.city, state: loc.state });
      setSearchResults([]);
      setLocationSearch('');
      toast.success(language === 'es' ? 'Ubicacion guardada' : 'Location saved');
    } catch {
      toast.error(language === 'es' ? 'Error al guardar' : 'Save error');
    }
    setSavingLocation(false);
  };

  const loadBlacklist = async () => {
    try {
      const res = await businessesAPI.getBlacklist();
      setBlacklist(Array.isArray(res.data) ? res.data : []);
    } catch { setBlacklist([]); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.email && !form.phone && !form.user_id) {
      toast.error(language === 'es' ? 'Ingresa al menos un identificador' : 'Enter at least one identifier');
      return;
    }
    setAdding(true);
    try {
      const payload = {};
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.user_id.trim()) payload.user_id = form.user_id.trim();
      if (form.reason.trim()) payload.reason = form.reason.trim();
      await businessesAPI.addToBlacklist(payload);
      toast.success(language === 'es' ? 'Cliente vetado correctamente' : 'Client banned successfully');
      setForm({ email: '', phone: '', user_id: '', reason: '' });
      loadBlacklist();
    } catch (error) {
      const msg = error.response?.data?.detail || (language === 'es' ? 'Error al vetar' : 'Error banning');
      toast.error(msg);
    } finally { setAdding(false); }
  };

  const handleRemove = async (entryId) => {
    if (!window.confirm(language === 'es' ? '¿Quitar este veto?' : 'Remove this ban?')) return;
    try {
      await businessesAPI.removeFromBlacklist(entryId);
      setBlacklist(prev => prev.filter(e => e.id !== entryId));
      toast.success(language === 'es' ? 'Veto eliminado' : 'Ban removed');
    } catch { toast.error('Error'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8 max-w-3xl">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="business-settings-page">
      <div className="container-app py-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business/dashboard')} data-testid="back-to-dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-heading font-bold">
            {language === 'es' ? 'Configuracion del negocio' : 'Business Settings'}
          </h1>
        </div>

        {/* Blacklist Section */}
        <Card data-testid="blacklist-section">
          <CardHeader>
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <ShieldX className="h-5 w-5 text-[#F05D5E]" />
              {language === 'es' ? 'Clientes vetados' : 'Banned clients'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {language === 'es'
                ? 'Los clientes vetados no podran ver tu negocio, acceder a tu perfil ni realizar reservas.'
                : 'Banned clients won\'t be able to see your business, access your profile, or make bookings.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Add Form */}
            <div className="rounded-xl border border-dashed p-4 space-y-3" data-testid="blacklist-add-form">
              <p className="text-sm font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {language === 'es' ? 'Agregar cliente al veto' : 'Add client to ban list'}
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1 mb-1">
                    <Mail className="h-3 w-3" /> Email
                  </Label>
                  <Input
                    type="email"
                    placeholder="cliente@email.com"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    data-testid="blacklist-email-input"
                  />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1 mb-1">
                    <Phone className="h-3 w-3" /> {language === 'es' ? 'Telefono' : 'Phone'}
                  </Label>
                  <Input
                    type="tel"
                    placeholder="+52 123 456 7890"
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    data-testid="blacklist-phone-input"
                  />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1 mb-1">
                    <User className="h-3 w-3" /> User ID
                  </Label>
                  <Input
                    placeholder="ID del usuario"
                    value={form.user_id}
                    onChange={e => setForm(p => ({ ...p, user_id: e.target.value }))}
                    data-testid="blacklist-userid-input"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1">{language === 'es' ? 'Razon (opcional)' : 'Reason (optional)'}</Label>
                <Input
                  placeholder={language === 'es' ? 'Motivo del veto...' : 'Ban reason...'}
                  value={form.reason}
                  onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                  data-testid="blacklist-reason-input"
                />
              </div>
              <Button
                className="btn-coral"
                size="sm"
                onClick={handleAdd}
                disabled={adding || (!form.email && !form.phone && !form.user_id)}
                data-testid="blacklist-add-button"
              >
                <Ban className="h-4 w-4 mr-1.5" />
                {adding
                  ? (language === 'es' ? 'Agregando...' : 'Adding...')
                  : (language === 'es' ? 'Vetar cliente' : 'Ban client')}
              </Button>
            </div>

            <Separator />

            {/* List */}
            <div>
              <p className="text-sm font-medium mb-3">
                {language === 'es' ? 'Lista de vetados' : 'Ban list'} ({blacklist.length})
              </p>
              {blacklist.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {blacklist.map(entry => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-border/60 hover:border-red-200 transition-colors"
                      data-testid={`blacklist-entry-${entry.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {entry.email && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Mail className="h-3 w-3" /> {entry.email}
                            </Badge>
                          )}
                          {entry.phone && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Phone className="h-3 w-3" /> {entry.phone}
                            </Badge>
                          )}
                          {entry.user_id && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <User className="h-3 w-3" /> {entry.user_id.substring(0, 8)}...
                            </Badge>
                          )}
                        </div>
                        {entry.reason && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{entry.reason}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(entry.created_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-500 hover:bg-red-50 shrink-0"
                        onClick={() => handleRemove(entry.id)}
                        data-testid={`blacklist-remove-${entry.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 border-2 border-dashed rounded-xl">
                  <Ban className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {language === 'es' ? 'No tienes clientes vetados' : 'No banned clients'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Location Section */}
        <Card className="mt-6" data-testid="location-section">
          <CardHeader>
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#F05D5E]" />
              {language === 'es' ? 'Ubicacion del negocio' : 'Business location'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {language === 'es'
                ? 'Busca tu direccion para mostrar el mapa en tu perfil publico.'
                : 'Search your address to show the map on your public profile.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="flex gap-2">
              <Input
                placeholder={language === 'es' ? 'Buscar direccion...' : 'Search address...'}
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchAddress()}
                data-testid="location-search-input"
              />
              <Button variant="outline" onClick={searchAddress} disabled={searching || !locationSearch.trim()} data-testid="location-search-btn">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto" data-testid="location-results">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors text-sm flex items-start gap-2"
                    onClick={() => selectLocation(r)}
                    disabled={savingLocation}
                    data-testid={`location-result-${i}`}
                  >
                    <MapPin className="h-4 w-4 text-[#F05D5E] mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{r.display}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Current Location Preview */}
            {currentLocation ? (
              <div className="rounded-xl border overflow-hidden" data-testid="current-location-map">
                <iframe
                  title="map"
                  width="100%"
                  height="200"
                  style={{ border: 0 }}
                  loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${currentLocation.lng - 0.008}%2C${currentLocation.lat - 0.005}%2C${currentLocation.lng + 0.008}%2C${currentLocation.lat + 0.005}&layer=mapnik&marker=${currentLocation.lat}%2C${currentLocation.lng}`}
                />
                <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#F05D5E] shrink-0" />
                  <span className="text-sm truncate">{currentLocation.address}, {currentLocation.city}, {currentLocation.state}</span>
                </div>
              </div>
            ) : (
              <div className="h-[160px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center">
                <MapPin className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {language === 'es' ? 'Busca tu direccion para ver el mapa' : 'Search your address to see the map'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
