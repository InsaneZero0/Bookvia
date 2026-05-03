import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search, Users, Crown, Sparkle, AlertTriangle, Clock3,
  Mail, Phone, Pencil, Download, UserX,
} from 'lucide-react';
import { businessesAPI } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { toast } from 'sonner';

const TAG_MAP = {
  vip:      { label: 'VIP',         icon: Crown,          bg: 'bg-amber-100 text-amber-700' },
  new:      { label: 'Nuevo',       icon: Sparkle,        bg: 'bg-emerald-100 text-emerald-700' },
  noshow:   { label: 'No-show',     icon: AlertTriangle,  bg: 'bg-red-100 text-red-700' },
  inactive: { label: 'Inactivo',    icon: Clock3,         bg: 'bg-slate-200 text-slate-700' },
};

export default function BusinessClientsTab() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState('recent');
  const [noteModal, setNoteModal] = useState({ open: false, client: null });
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { sort };
      if (q.trim()) params.q = q.trim();
      if (tag !== 'all') params.tag = tag;
      const res = await businessesAPI.listMyClients(params);
      setData(res.data);
    } catch {
      toast.error(t('No se pudo cargar la lista de clientes'));
    } finally {
      setLoading(false);
    }
  }, [q, tag, sort, t]);

  useEffect(() => {
    const handle = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);

  const openNote = (client) => {
    setNoteDraft(client.private_note || '');
    setNoteModal({ open: true, client });
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await businessesAPI.updateClientNote(noteModal.client.client_key, noteDraft);
      toast.success(t('Nota guardada'));
      setNoteModal({ open: false, client: null });
      load();
    } catch {
      toast.error(t('Error al guardar'));
    }
    setSavingNote(false);
  };

  const handleExport = async () => {
    try {
      const res = await businessesAPI.exportMyClients();
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clientes_bookvia_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('Error al exportar'));
    }
  };

  const kpis = data?.kpis;

  return (
    <div className="space-y-5" data-testid="business-clients-tab">
      {/* KPI row */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Users} label={t('Total clientes')} value={kpis.total_clients} color="bg-blue-50 text-blue-600" />
          <KpiCard icon={Crown} label={t('VIP (5+ visitas)')} value={kpis.vip} color="bg-amber-50 text-amber-600" />
          <KpiCard icon={Sparkle} label={t('Nuevos')} value={kpis.new} color="bg-emerald-50 text-emerald-600" />
          <KpiCard icon={Clock3} label={t('Inactivos 90d+')} value={kpis.inactive} color="bg-slate-100 text-slate-600" />
        </div>
      )}

      {/* Filters row */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Busca por nombre, telefono o email')}
              className="pl-9"
              data-testid="clients-search-input"
            />
          </div>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="md:w-48" data-testid="clients-tag-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('Todos los clientes')}</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="new">{t('Nuevos')}</SelectItem>
              <SelectItem value="noshow">{t('No-show frecuente')}</SelectItem>
              <SelectItem value="inactive">{t('Inactivos (90d+)')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="md:w-48" data-testid="clients-sort-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{t('Visita mas reciente')}</SelectItem>
              <SelectItem value="visits">{t('Mas visitas')}</SelectItem>
              <SelectItem value="spent">{t('Mayor gasto')}</SelectItem>
              <SelectItem value="name">{t('Nombre A-Z')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} data-testid="clients-export-btn">
            <Download className="h-4 w-4 mr-1" /> {t('Exportar CSV')}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <UserX className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {q || tag !== 'all'
                ? t('No encontramos clientes con esos filtros.')
                : t('Aun no tienes clientes. Cuando recibas reservas apareceran aqui.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.items.map(c => (
            <ClientRow key={c.client_key} c={c} onEditNote={() => openNote(c)} />
          ))}
        </div>
      )}

      {/* Note modal */}
      <Dialog open={noteModal.open} onOpenChange={(open) => !open && setNoteModal({ open: false, client: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('Nota privada de')} {noteModal.client?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('Solo tu negocio ve esta nota. Ejemplo: alergico al amoniaco, VIP, pidio reagendar ultima cita.')}
            </p>
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
              rows={5}
              placeholder={t('Escribe tu nota...')}
              data-testid="client-note-textarea"
            />
            <p className="text-xs text-muted-foreground text-right">{noteDraft.length} / 500</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteModal({ open: false, client: null })}>
              {t('Cancelar')}
            </Button>
            <Button onClick={saveNote} disabled={savingNote} data-testid="save-client-note-btn">
              {savingNote ? t('Guardando...') : t('Guardar nota')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-2 mb-1">
          <div className={`p-1.5 rounded-lg ${color}`}><Icon className="h-4 w-4" /></div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-xl font-heading font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ClientRow({ c, onEditNote }) {
  const { t } = useI18n();
  return (
    <Card data-testid={`client-row-${c.client_key}`}>
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
        <div className="flex items-center gap-3 min-w-0 md:min-w-[240px] md:flex-1">
          <Avatar className="h-10 w-10 shrink-0">
            {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.name} />}
            <AvatarFallback>{getInitials(c.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-heading font-bold text-sm truncate">{c.name}</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {c.tags.map(tg => {
                const meta = TAG_MAP[tg];
                if (!meta) return null;
                const Ic = meta.icon;
                return (
                  <Badge key={tg} className={`${meta.bg} text-[10px] px-1.5 py-0 gap-0.5`}>
                    <Ic className="h-3 w-3" /> {t(meta.label)}
                  </Badge>
                );
              })}
              {!c.is_registered && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('invitado')}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
              {c.email && (
                <a href={`mailto:${c.email}`} className="hover:text-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> <span className="truncate max-w-[180px]">{c.email}</span>
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="hover:text-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {c.phone}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 md:flex md:gap-6 text-xs md:text-sm md:shrink-0">
          <Metric label={t('Visitas')} value={c.total_visits} />
          <Metric label={t('Gastado')} value={formatCurrency(c.total_spent)} />
          <Metric
            label={t('Ultima')}
            value={c.last_visit ? formatDate(c.last_visit) : '—'}
            hint={c.days_since_last != null ? t(`hace ${c.days_since_last}d`) : null}
          />
        </div>

        <div className="md:shrink-0 md:ml-auto">
          <Button
            variant={c.private_note ? 'default' : 'outline'}
            size="sm"
            onClick={onEditNote}
            data-testid={`edit-note-${c.client_key}`}
          >
            <Pencil className="h-3 w-3 mr-1" />
            {c.private_note ? t('Ver nota') : t('Agregar nota')}
          </Button>
          {c.private_note && (
            <p className="text-xs text-muted-foreground mt-1.5 max-w-[260px] truncate italic" title={c.private_note}>
              "{c.private_note}"
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-heading font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
