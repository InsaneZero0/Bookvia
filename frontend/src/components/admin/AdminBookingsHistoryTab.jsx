import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminAPI } from '@/lib/api';
import { Calendar, Search, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLORS = {
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  no_show: 'bg-orange-100 text-orange-700 border-orange-200',
  disputed: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
};

// Sub-status by who cancelled (only when status === 'cancelled')
const CANCEL_BY_VARIANT = {
  user: { label: 'Cancelo cliente', cn: 'bg-amber-100 text-amber-800 border-amber-300' },
  client: { label: 'Cancelo cliente', cn: 'bg-amber-100 text-amber-800 border-amber-300' },
  business: { label: 'Cancelo negocio', cn: 'bg-rose-100 text-rose-800 border-rose-400' },
  admin: { label: 'Cancelo admin', cn: 'bg-slate-100 text-slate-700 border-slate-300' },
  system: { label: 'Cancelo sistema', cn: 'bg-violet-100 text-violet-800 border-violet-300' },
};

// Refund destination badges
const REFUND_VARIANTS = {
  wallet: { label: 'Saldo Bookvia', cn: 'bg-violet-100 text-violet-800 border-violet-300' },
  card: { label: 'Tarjeta', cn: 'bg-blue-100 text-blue-800 border-blue-300' },
  stripe: { label: 'Tarjeta', cn: 'bg-blue-100 text-blue-800 border-blue-300' },
  pending: { label: 'Esperando eleccion', cn: 'bg-amber-100 text-amber-800 border-amber-300' },
  none: { label: '—', cn: 'text-muted-foreground' },
};

function RefundBadge({ booking }) {
  // Decide which state to show
  const refundAmount = Number(booking?.refund_amount || 0);
  const choice = (booking?.refund_destination_choice || '').toLowerCase();
  const isPending = !!booking?.refund_pending;

  // No refund at all (most common case for completed bookings)
  if (refundAmount === 0 && !isPending) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  // Pending: cancellation processed but client hasn't picked yet
  if (isPending && (choice === '' || choice === 'pending')) {
    const v = REFUND_VARIANTS.pending;
    return (
      <Badge variant="outline" className={`${v.cn} border`}>
        {v.label} ${refundAmount.toFixed(2)}
      </Badge>
    );
  }

  // Client picked
  const v = REFUND_VARIANTS[choice] || REFUND_VARIANTS.none;
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="outline" className={`${v.cn} border w-fit`}>
        {v.label}
      </Badge>
      {refundAmount > 0 && (
        <span className="text-[10px] text-muted-foreground">${refundAmount.toFixed(2)}</span>
      )}
    </div>
  );
}

const STATUS_LABEL_ES = {
  all: 'Todas',
  confirmed: 'Confirmadas',
  completed: 'Completadas',
  cancelled: 'Canceladas',
  no_show: 'No-show',
  disputed: 'Disputadas',
};

const formatMxn = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

const formatDateTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; }
};

export default function AdminBookingsHistoryTab({ language = 'es' }) {
  const t = useCallback((es, en) => (language === 'es' ? es : en), [language]);
  const [filters, setFilters] = useState({ status: 'all', q: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [data, setData] = useState({ items: [], total: 0, summary: { total_count: 0, total_revenue_mxn: 0 } });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState({ open: false, loading: false, data: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (filters.status && filters.status !== 'all') params.status = filters.status;
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const res = await adminAPI.listBookings(params);
      setData(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error al cargar citas', 'Failed to load bookings'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters, t]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize));

  const openDetail = async (id) => {
    setDetail({ open: true, loading: true, data: null });
    try {
      const res = await adminAPI.getBookingDetail(id);
      setDetail({ open: true, loading: false, data: res.data });
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('Error al cargar detalle', 'Failed to load detail'));
      setDetail({ open: false, loading: false, data: null });
    }
  };

  const StatusBadge = ({ status, cancelledBy }) => {
    // When cancelled, show WHO cancelled (color-coded) instead of generic "Cancelled"
    if (status === 'cancelled') {
      const variant = CANCEL_BY_VARIANT[(cancelledBy || '').toLowerCase()] || {
        label: 'Canceladas',
        cn: STATUS_COLORS.cancelled,
      };
      return (
        <Badge variant="outline" className={`${variant.cn} border`}>
          {variant.label}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className={`${STATUS_COLORS[status] || STATUS_COLORS.pending} capitalize border`}>
        {STATUS_LABEL_ES[status] || status || '—'}
      </Badge>
    );
  };

  return (
    <div className="space-y-4" data-testid="admin-bookings-history-tab">
      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('Estado', 'Status')}</label>
            <select
              value={filters.status}
              onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              data-testid="bookings-filter-status"
            >
              {Object.entries(STATUS_LABEL_ES).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('Desde', 'From')}</label>
            <Input type="date" value={filters.date_from}
              onChange={(e) => { setFilters((f) => ({ ...f, date_from: e.target.value })); setPage(1); }}
              data-testid="bookings-filter-date-from" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('Hasta', 'To')}</label>
            <Input type="date" value={filters.date_to}
              onChange={(e) => { setFilters((f) => ({ ...f, date_to: e.target.value })); setPage(1); }}
              data-testid="bookings-filter-date-to" />
          </div>
          <div className="md:col-span-4">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('Buscar', 'Search')}</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Negocio, codigo BV, cliente, email...', 'Business, BV code, client, email...')}
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
                className="pl-8"
                data-testid="bookings-filter-search"
              />
            </div>
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={() => { setPage(1); load(); }} className="w-full" data-testid="bookings-filter-apply">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground font-semibold">{t('Total de citas', 'Total bookings')}</p>
          <p className="text-2xl font-bold mt-1" data-testid="bookings-summary-count">{data.summary?.total_count ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground font-semibold">{t('Ingreso bruto (cliente)', 'Gross client revenue')}</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600" data-testid="bookings-summary-revenue">{formatMxn(data.summary?.total_revenue_mxn)}</p>
          <p className="text-[10px] text-muted-foreground">{t('En esta pagina', 'On this page')}</p>
        </Card>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">{t('Fecha', 'Date')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Cliente', 'Client')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Negocio', 'Business')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Servicio', 'Service')}</th>
                <th className="text-right px-3 py-2 font-semibold">{t('Pagado', 'Paid')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Estado', 'Status')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Reembolso', 'Refund')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="7" className="text-center py-12 text-muted-foreground">{t('Cargando...', 'Loading...')}</td></tr>
              )}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan="7" className="text-center py-12 text-muted-foreground">{t('Sin resultados', 'No results')}</td></tr>
              )}
              {!loading && data.items.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => openDetail(b.id)}
                  className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                  data-testid={`booking-row-${b.id}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{b.date}</div>
                    <div className="text-xs text-muted-foreground">{b.time}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium truncate max-w-[180px]">{b.client_name || '—'}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[180px]">{b.client_email || ''}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium truncate max-w-[200px]">{b.business_name || '—'}</div>
                    {b.business_public_code && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {b.business_public_code}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 truncate max-w-[160px]">{b.service_name || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMxn(b.client_paid)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={b.status} cancelledBy={b.cancelled_by} /></td>
                  <td className="px-3 py-2.5"><RefundBadge booking={b} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {data.total > pageSize && (
          <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-sm">
            <span className="text-muted-foreground">
              {t('Pagina', 'Page')} {page} {t('de', 'of')} {totalPages} · {data.total} {t('citas', 'bookings')}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="bookings-page-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} data-testid="bookings-page-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail modal */}
      <Dialog open={detail.open} onOpenChange={(open) => !open && setDetail({ open: false, loading: false, data: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="booking-detail-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" /> {t('Detalle de la cita', 'Booking detail')}
            </DialogTitle>
          </DialogHeader>
          {detail.loading && <p className="text-center py-8 text-muted-foreground">{t('Cargando...', 'Loading...')}</p>}
          {!detail.loading && detail.data && (
            <BookingDetailView data={detail.data} t={t} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Row = ({ label, value, mono = false, copy = false }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-xs uppercase font-semibold text-muted-foreground shrink-0">{label}</span>
      <span
        className={`text-sm text-right ${mono ? 'font-mono text-[12px]' : ''} ${copy ? 'cursor-pointer hover:text-coral' : ''}`}
        onClick={copy ? () => { navigator.clipboard.writeText(String(value)); toast.success('Copiado'); } : undefined}
      >
        {String(value)}
      </span>
    </div>
  );
};

const Section = ({ title, children, testid }) => (
  <div className="rounded-lg border bg-muted/20 p-3" data-testid={testid}>
    <h4 className="text-sm font-bold mb-2">{title}</h4>
    <div className="divide-y divide-border/40">{children}</div>
  </div>
);

function BookingDetailView({ data, t }) {
  const { booking, business, client, service, worker, transaction, refund_events: refundEvents, strikes, review } = data;
  return (
    <div className="space-y-3">
      <Section title={t('Cita', 'Booking')} testid="bd-section-booking">
        <Row label={t('ID', 'ID')} value={booking.id} mono copy />
        <Row label={t('Estado', 'Status')} value={booking.status} />
        <Row label={t('Fecha', 'Date')} value={`${booking.date} ${booking.time}`} />
        <Row label={t('Creada', 'Created')} value={formatDateTime(booking.created_at)} />
        <Row label={t('Completada', 'Completed')} value={formatDateTime(booking.completed_at)} />
        <Row label={t('Cliente confirmo OK', 'Client confirmed OK')} value={formatDateTime(booking.client_confirmed_ok_at)} />
        <Row label={t('Cancelada por', 'Cancelled by')} value={booking.cancelled_by} />
        <Row label={t('Motivo cancelacion', 'Cancellation reason')} value={booking.cancellation_reason} />
        <Row label={t('Disputa', 'Dispute')} value={booking.has_dispute ? 'SI' : null} />
        <Row label={t('Reagendamientos', 'Reschedules')} value={booking.reschedule_count} />
      </Section>

      <Section title={t('Cliente', 'Client')} testid="bd-section-client">
        <Row label={t('ID cuenta', 'Account ID')} value={client.id} mono copy />
        <Row label={t('Nombre cuenta', 'Account name')} value={client.full_name} />
        <Row label={t('Email cuenta', 'Account email')} value={client.email} copy />
        <Row label={t('Telefono cuenta', 'Account phone')} value={client.phone} />
        {booking.client_name && booking.client_name !== client.full_name && (
          <Row label={t('Nombre en reserva', 'Name on booking')} value={booking.client_name} />
        )}
        {booking.client_email && booking.client_email !== client.email && (
          <Row label={t('Email en reserva', 'Email on booking')} value={booking.client_email} copy />
        )}
        {booking.client_phone && booking.client_phone !== client.phone && (
          <Row label={t('Telefono en reserva', 'Phone on booking')} value={booking.client_phone} />
        )}
      </Section>

      <Section title={t('Negocio', 'Business')} testid="bd-section-business">
        <Row label={t('Nombre', 'Name')} value={business.name} />
        <Row label={t('Codigo', 'Code')} value={business.public_code} mono copy />
        <Row label={t('Email', 'Email')} value={business.email} />
      </Section>

      <Section title={t('Servicio', 'Service')} testid="bd-section-service">
        <Row label={t('Servicio', 'Service')} value={service.name} />
        <Row label={t('Precio total', 'Total price')} value={service.price ? formatMxn(service.price) : null} />
        <Row label={t('Duracion', 'Duration')} value={service.duration_minutes ? `${service.duration_minutes} min` : null} />
        <Row label={t('Profesional', 'Worker')} value={worker.name} />
      </Section>

      {transaction && transaction.id && (
        <Section title={t('Transaccion', 'Transaction')} testid="bd-section-transaction">
          <Row label={t('Anticipo', 'Deposit')} value={formatMxn(transaction.amount_total)} />
          <Row label={t('Cliente pago', 'Client paid')} value={formatMxn(transaction.client_paid)} />
          <Row label={t('Wallet usado', 'Wallet used')} value={transaction.wallet_amount_used ? formatMxn(transaction.wallet_amount_used) : null} />
          <Row label={t('Estado pago', 'Payment status')} value={transaction.status} />
          <Row label={t('Estado fondos', 'Funds state')} value={transaction.funds_state} />
          <Row label={t('Reembolso', 'Refund')} value={transaction.refund_amount ? formatMxn(transaction.refund_amount) : null} />
          <Row label={t('Reembolso pendiente', 'Refund pending')} value={transaction.refund_pending ? 'SI' : null} />
          <Row label={t('Destino reembolso', 'Refund destination')} value={transaction.refund_destination_choice} />
          <Row label={t('Stripe PI', 'Stripe PI')} value={transaction.stripe_payment_intent_id} mono copy />
        </Section>
      )}

      {refundEvents && refundEvents.length > 0 && (
        <Section title={t('Reembolsos Stripe', 'Stripe refunds')} testid="bd-section-refunds">
          {refundEvents.map((r, i) => (
            <div key={r.id || i} className="py-1 text-xs">
              <div className="flex justify-between">
                <span className="font-mono">{r.stripe_refund_id}</span>
                <span className="font-semibold text-orange-600">{formatMxn(r.amount_mxn)}</span>
              </div>
              <div className="text-muted-foreground">{r.reason} · {r.actor} · {formatDateTime(r.created_at)}</div>
            </div>
          ))}
        </Section>
      )}

      {strikes && strikes.length > 0 && (
        <Section title={t('Strikes asociados', 'Associated strikes')} testid="bd-section-strikes">
          {strikes.map((s, i) => (
            <div key={s.id || i} className="py-1 text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{s.reason}</span>
                <span className="text-red-600 font-semibold">{s.severity}</span>
              </div>
              <div className="text-muted-foreground">{formatDateTime(s.created_at)}</div>
            </div>
          ))}
        </Section>
      )}

      {review && (
        <Section title={t('Calificacion', 'Review')} testid="bd-section-review">
          <Row label={t('Rating', 'Rating')} value={`${review.rating} / 5`} />
          <Row label={t('Comentario', 'Comment')} value={review.comment} />
          <Row label={t('Creada', 'Created')} value={formatDateTime(review.created_at)} />
        </Section>
      )}
    </div>
  );
}
