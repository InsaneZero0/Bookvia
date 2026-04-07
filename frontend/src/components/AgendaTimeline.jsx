import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
import { formatTime } from '@/lib/utils';

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export default function AgendaTimeline({
  bookings, language, hasPermission, getStatusColor, t,
  onClientClick, onComplete, onReschedule, onCancel
}) {
  if (!bookings || bookings.length === 0) {
    return (
      <div className="text-center py-12">
        <CalendarIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          {language === 'es' ? 'No hay citas para este dia' : 'No bookings for this day'}
        </p>
      </div>
    );
  }

  // Determine time range from bookings
  const times = bookings.map(b => timeToMinutes(b.time));
  const endTimes = bookings.map(b => timeToMinutes(b.end_time || b.time));
  const minTime = Math.floor(Math.min(...times) / 60) * 60;
  const maxTime = Math.ceil(Math.max(...endTimes) / 60) * 60 + 60;
  const startHour = Math.max(0, Math.floor(minTime / 60) - 1);
  const endHour = Math.min(23, Math.floor(maxTime / 60));

  const hours = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }

  const HOUR_HEIGHT = 80;
  const totalHeight = hours.length * HOUR_HEIGHT;
  const baseMinutes = startHour * 60;

  const getTop = (time) => ((timeToMinutes(time) - baseMinutes) / 60) * HOUR_HEIGHT;
  const getHeight = (start, end) => {
    const dur = timeToMinutes(end) - timeToMinutes(start);
    return Math.max(40, (dur / 60) * HOUR_HEIGHT);
  };

  const statusColors = {
    confirmed: 'bg-blue-500/10 border-blue-500/40 hover:border-blue-500/60',
    completed: 'bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500/60',
    cancelled: 'bg-red-500/10 border-red-500/40 hover:border-red-500/60',
    hold: 'bg-amber-500/10 border-amber-500/40 hover:border-amber-500/60',
    pending: 'bg-gray-500/10 border-gray-500/40 hover:border-gray-500/60',
  };

  const dotColors = {
    confirmed: 'bg-blue-500',
    completed: 'bg-emerald-500',
    cancelled: 'bg-red-500',
    hold: 'bg-amber-500',
    pending: 'bg-gray-400',
  };

  return (
    <div className="relative overflow-y-auto max-h-[500px] pr-1" data-testid="agenda-timeline">
      <div className="relative" style={{ height: `${totalHeight}px` }}>
        {/* Hour lines */}
        {hours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-0 flex items-start"
            style={{ top: `${(h - startHour) * HOUR_HEIGHT}px` }}
          >
            <span className="w-14 shrink-0 text-[11px] text-muted-foreground font-mono pr-2 text-right -mt-2">
              {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
            </span>
            <div className="flex-1 border-t border-border/40 h-0" />
          </div>
        ))}

        {/* Booking blocks */}
        {bookings.map((booking) => {
          const top = getTop(booking.time);
          const height = getHeight(booking.time, booking.end_time || booking.time);
          const isCompact = height < 60;
          const now = new Date();
          const endDt = new Date(`${booking.date}T${booking.end_time}:00`);
          const isPast = now >= endDt;

          return (
            <div
              key={booking.id}
              className={`absolute left-16 right-1 rounded-lg border-l-[3px] px-3 py-1.5 transition-all ${statusColors[booking.status] || statusColors.pending}`}
              style={{ top: `${top}px`, height: `${height}px`, minHeight: '40px' }}
              data-testid={`timeline-block-${booking.id}`}
            >
              <div className={`flex ${isCompact ? 'items-center gap-3' : 'flex-col h-full justify-between'}`}>
                {/* Top: Client + Service info */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${dotColors[booking.status] || 'bg-gray-400'}`} />
                  <div
                    className={`min-w-0 ${hasPermission('view_client_data') ? 'cursor-pointer' : ''}`}
                    onClick={() => hasPermission('view_client_data') && onClientClick(booking)}
                  >
                    <span className={`text-sm font-semibold truncate block ${hasPermission('view_client_data') ? 'hover:text-[#F05D5E]' : ''}`}>
                      {booking.client_name || booking.user_name}
                    </span>
                    {!isCompact && (
                      <span className="text-xs text-muted-foreground truncate block">
                        {booking.service_name}{booking.worker_name ? ` · ${booking.worker_name}` : ''}
                      </span>
                    )}
                  </div>
                  {isCompact && <span className="text-xs text-muted-foreground truncate">{booking.service_name}</span>}
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono">{formatTime(booking.time)} - {formatTime(booking.end_time)}</span>
                  </div>
                </div>

                {/* Bottom: Actions */}
                {!isCompact && (
                  <div className="flex items-center gap-1 mt-1">
                    <Badge className={`text-[9px] h-5 ${getStatusColor(booking.status)}`}>
                      {booking.status === 'cancelled' && booking.cancelled_by
                        ? (language === 'es'
                          ? `Cancelada por ${booking.cancelled_by === 'business' ? 'negocio' : 'cliente'}`
                          : `Cancelled by ${booking.cancelled_by}`)
                        : t(`status.${booking.status}`)}
                    </Badge>
                    <div className="ml-auto flex gap-1">
                      {booking.status === 'confirmed' && (
                        <>
                          {hasPermission('complete_bookings') && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" disabled={!isPast} onClick={() => onComplete(booking.id)}>
                              {language === 'es' ? 'Completar' : 'Complete'}
                            </Button>
                          )}
                          {hasPermission('reschedule_bookings') && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-blue-600" onClick={() => onReschedule(booking)}>
                              <RefreshCw className="h-3 w-3 mr-0.5" />
                              {language === 'es' ? 'Reagendar' : 'Reschedule'}
                            </Button>
                          )}
                          {hasPermission('cancel_bookings') && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-600" onClick={() => onCancel(booking.id)}>
                              {language === 'es' ? 'Cancelar' : 'Cancel'}
                            </Button>
                          )}
                        </>
                      )}
                      {booking.status === 'hold' && (
                        <>
                          {hasPermission('reschedule_bookings') && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-blue-600" onClick={() => onReschedule(booking)}>
                              <RefreshCw className="h-3 w-3 mr-0.5" />
                            </Button>
                          )}
                          {hasPermission('cancel_bookings') && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-600" onClick={() => onCancel(booking.id)}>
                              {language === 'es' ? 'Cancelar' : 'Cancel'}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
