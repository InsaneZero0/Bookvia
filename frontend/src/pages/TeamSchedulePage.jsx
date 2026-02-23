import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { businessesAPI, servicesAPI, bookingsAPI } from '@/lib/api';
import { format, addDays, parseISO, isAfter, isBefore, isSameDay } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Users, Plus, Edit2, Trash2, Calendar as CalendarIcon, Clock, 
  UserX, UserCheck, Save, ChevronLeft, ChevronRight, AlertCircle,
  Briefcase, CalendarOff, ArrowLeft
} from 'lucide-react';

const DAYS_OF_WEEK = [
  { key: '0', es: 'Lunes', en: 'Monday' },
  { key: '1', es: 'Martes', en: 'Tuesday' },
  { key: '2', es: 'Miércoles', en: 'Wednesday' },
  { key: '3', es: 'Jueves', en: 'Thursday' },
  { key: '4', es: 'Viernes', en: 'Friday' },
  { key: '5', es: 'Sábado', en: 'Saturday' },
  { key: '6', es: 'Domingo', en: 'Sunday' },
];

const TIME_OPTIONS = [];
for (let h = 6; h <= 23; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }
}

export default function TeamSchedulePage() {
  const { t, language } = useI18n();
  const { business, isAuthenticated, isBusiness } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [activeTab, setActiveTab] = useState('team');
  
  // Dialogs
  const [showWorkerDialog, setShowWorkerDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  
  // Form states
  const [workerForm, setWorkerForm] = useState({ name: '', email: '', phone: '', bio: '' });
  const [scheduleForm, setScheduleForm] = useState({});
  const [exceptionForm, setExceptionForm] = useState({
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    reason: '',
    exception_type: 'block'
  });

  // Calendar view
  const [viewDate, setViewDate] = useState(new Date());
  const [dayAvailability, setDayAvailability] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !isBusiness) {
      navigate('/business/login');
      return;
    }
    if (business?.id) {
      loadData();
    }
  }, [isAuthenticated, isBusiness, business?.id]);

  const loadData = async () => {
    if (!business?.id) return;
    try {
      setLoading(true);
      const [workersRes, servicesRes] = await Promise.all([
        businessesAPI.getMyWorkers(true),
        servicesAPI.getByBusiness(business.id),
      ]);
      setWorkers(workersRes.data);
      setServices(servicesRes.data);
      if (workersRes.data.length > 0 && !selectedWorker) {
        setSelectedWorker(workersRes.data[0]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error(language === 'es' ? 'Error al cargar datos' : 'Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadDayAvailability = useCallback(async (date, workerId) => {
    if (!business?.id) return;
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await bookingsAPI.getAvailability(business.id, dateStr, null, workerId, true);
      setDayAvailability(res.data);
    } catch (error) {
      console.error('Error loading availability:', error);
    }
  }, [business?.id]);

  useEffect(() => {
    if (selectedWorker && activeTab === 'calendar') {
      loadDayAvailability(viewDate, selectedWorker.id);
    }
  }, [viewDate, selectedWorker, activeTab, loadDayAvailability]);

  // Worker CRUD
  const openCreateWorker = () => {
    setEditingWorker(null);
    setWorkerForm({ name: '', email: '', phone: '', bio: '' });
    setShowWorkerDialog(true);
  };

  const openEditWorker = (worker) => {
    setEditingWorker(worker);
    setWorkerForm({
      name: worker.name,
      email: worker.email || '',
      phone: worker.phone || '',
      bio: worker.bio || ''
    });
    setShowWorkerDialog(true);
  };

  const handleSaveWorker = async () => {
    if (!workerForm.name.trim()) {
      toast.error(language === 'es' ? 'El nombre es requerido' : 'Name is required');
      return;
    }
    
    try {
      if (editingWorker) {
        await businessesAPI.updateWorker(editingWorker.id, workerForm);
        toast.success(language === 'es' ? 'Trabajador actualizado' : 'Worker updated');
      } else {
        await businessesAPI.createWorker(workerForm);
        toast.success(language === 'es' ? 'Trabajador creado' : 'Worker created');
      }
      setShowWorkerDialog(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'es' ? 'Error al guardar' : 'Error saving'));
    }
  };

  const handleDeleteWorker = async (worker) => {
    if (!window.confirm(language === 'es' 
      ? `¿Desactivar a ${worker.name}? Su historial se conservará.`
      : `Deactivate ${worker.name}? Their history will be preserved.`)) {
      return;
    }
    
    try {
      await businessesAPI.deleteWorker(worker.id);
      toast.success(language === 'es' ? 'Trabajador desactivado' : 'Worker deactivated');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'es' ? 'Error al desactivar' : 'Error deactivating'));
    }
  };

  const handleReactivateWorker = async (worker) => {
    try {
      await businessesAPI.reactivateWorker(worker.id);
      toast.success(language === 'es' ? 'Trabajador reactivado' : 'Worker reactivated');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'es' ? 'Error al reactivar' : 'Error reactivating'));
    }
  };

  // Schedule management
  const openScheduleEditor = (worker) => {
    setSelectedWorker(worker);
    // Initialize schedule form from worker's current schedule
    const form = {};
    DAYS_OF_WEEK.forEach(day => {
      const daySchedule = worker.schedule?.[day.key] || { is_available: false, blocks: [] };
      form[day.key] = {
        is_available: daySchedule.is_available,
        blocks: daySchedule.blocks?.length > 0 
          ? daySchedule.blocks.map(b => ({ ...b }))
          : [{ start_time: '09:00', end_time: '18:00' }]
      };
    });
    setScheduleForm(form);
    setShowScheduleDialog(true);
  };

  const toggleDayAvailable = (dayKey) => {
    setScheduleForm(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        is_available: !prev[dayKey].is_available
      }
    }));
  };

  const updateBlock = (dayKey, blockIndex, field, value) => {
    setScheduleForm(prev => {
      const newBlocks = [...prev[dayKey].blocks];
      newBlocks[blockIndex] = { ...newBlocks[blockIndex], [field]: value };
      return {
        ...prev,
        [dayKey]: { ...prev[dayKey], blocks: newBlocks }
      };
    });
  };

  const addBlock = (dayKey) => {
    setScheduleForm(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        blocks: [...prev[dayKey].blocks, { start_time: '14:00', end_time: '18:00' }]
      }
    }));
  };

  const removeBlock = (dayKey, blockIndex) => {
    setScheduleForm(prev => {
      const newBlocks = prev[dayKey].blocks.filter((_, i) => i !== blockIndex);
      return {
        ...prev,
        [dayKey]: { ...prev[dayKey], blocks: newBlocks.length > 0 ? newBlocks : [{ start_time: '09:00', end_time: '18:00' }] }
      };
    });
  };

  const handleSaveSchedule = async () => {
    try {
      await businessesAPI.updateWorkerSchedule(selectedWorker.id, scheduleForm);
      toast.success(language === 'es' ? 'Horario guardado' : 'Schedule saved');
      setShowScheduleDialog(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'es' ? 'Error al guardar horario' : 'Error saving schedule'));
    }
  };

  // Exception management
  const openAddException = (worker) => {
    setSelectedWorker(worker);
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    setExceptionForm({
      start_date: tomorrow,
      end_date: tomorrow,
      start_time: '',
      end_time: '',
      reason: '',
      exception_type: 'block'
    });
    setShowExceptionDialog(true);
  };

  const handleSaveException = async () => {
    if (!exceptionForm.start_date || !exceptionForm.end_date) {
      toast.error(language === 'es' ? 'Las fechas son requeridas' : 'Dates are required');
      return;
    }
    
    // Validate times if partial day
    if (exceptionForm.start_time && !exceptionForm.end_time) {
      toast.error(language === 'es' ? 'Si especificas hora de inicio, también especifica hora de fin' : 'If you specify start time, also specify end time');
      return;
    }
    
    try {
      const exception = {
        start_date: exceptionForm.start_date,
        end_date: exceptionForm.end_date,
        start_time: exceptionForm.start_time || null,
        end_time: exceptionForm.end_time || null,
        reason: exceptionForm.reason,
        exception_type: exceptionForm.exception_type
      };
      
      await businessesAPI.addWorkerException(selectedWorker.id, exception);
      toast.success(language === 'es' ? 'Excepción añadida' : 'Exception added');
      setShowExceptionDialog(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'es' ? 'Error al añadir excepción' : 'Error adding exception'));
    }
  };

  const handleRemoveException = async (workerId, exceptionId) => {
    try {
      await businessesAPI.removeWorkerException(workerId, exceptionId);
      toast.success(language === 'es' ? 'Excepción eliminada' : 'Exception removed');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'es' ? 'Error al eliminar' : 'Error removing'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        </div>
      </div>
    );
  }

  const activeWorkers = workers.filter(w => w.active);
  const inactiveWorkers = workers.filter(w => !w.active);

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="team-schedule-page">
      <div className="container-app py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-heading font-bold">
              {language === 'es' ? 'Equipo y Horarios' : 'Team & Schedules'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'es' 
                ? 'Gestiona tu equipo, horarios, vacaciones y bloqueos'
                : 'Manage your team, schedules, vacations and blocks'}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="team" className="gap-2">
              <Users className="h-4 w-4" />
              {language === 'es' ? 'Equipo' : 'Team'}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {language === 'es' ? 'Agenda' : 'Calendar'}
            </TabsTrigger>
          </TabsList>

          {/* Team Tab */}
          <TabsContent value="team">
            <div className="flex justify-between items-center mb-6">
              <p className="text-muted-foreground">
                {activeWorkers.length} {language === 'es' ? 'trabajadores activos' : 'active workers'}
              </p>
              <Button onClick={openCreateWorker} data-testid="add-worker-btn">
                <Plus className="h-4 w-4 mr-2" />
                {language === 'es' ? 'Añadir trabajador' : 'Add worker'}
              </Button>
            </div>

            {/* Active Workers */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {activeWorkers.map(worker => (
                <Card key={worker.id} data-testid={`worker-card-${worker.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{worker.name}</CardTitle>
                          <CardDescription>{worker.email || worker.phone || '-'}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        {language === 'es' ? 'Activo' : 'Active'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {worker.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{worker.bio}</p>
                    )}
                    
                    {/* Quick schedule preview */}
                    <div className="flex flex-wrap gap-1">
                      {DAYS_OF_WEEK.map(day => {
                        const isAvailable = worker.schedule?.[day.key]?.is_available;
                        return (
                          <span 
                            key={day.key}
                            className={`text-xs px-2 py-1 rounded ${
                              isAvailable 
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                            }`}
                          >
                            {day[language].slice(0, 3)}
                          </span>
                        );
                      })}
                    </div>

                    {/* Upcoming exceptions */}
                    {worker.exceptions?.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs font-medium mb-2 text-muted-foreground">
                          {language === 'es' ? 'Próximos bloqueos:' : 'Upcoming blocks:'}
                        </p>
                        {worker.exceptions.slice(0, 2).map(exc => (
                          <div key={exc.id} className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">
                              {exc.start_date === exc.end_date 
                                ? exc.start_date 
                                : `${exc.start_date} → ${exc.end_date}`}
                              {exc.start_time && ` (${exc.start_time}-${exc.end_time})`}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => handleRemoveException(worker.id, exc.id)}
                            >
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => openScheduleEditor(worker)}
                        data-testid={`edit-schedule-${worker.id}`}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        {language === 'es' ? 'Horario' : 'Schedule'}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openAddException(worker)}
                        data-testid={`add-exception-${worker.id}`}
                      >
                        <CalendarOff className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => openEditWorker(worker)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDeleteWorker(worker)}
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {activeWorkers.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">
                      {language === 'es' ? 'Sin trabajadores' : 'No workers yet'}
                    </p>
                    <p className="text-muted-foreground mb-4">
                      {language === 'es' 
                        ? 'Añade a tu equipo para gestionar citas'
                        : 'Add team members to manage appointments'}
                    </p>
                    <Button onClick={openCreateWorker}>
                      <Plus className="h-4 w-4 mr-2" />
                      {language === 'es' ? 'Añadir trabajador' : 'Add worker'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Inactive Workers */}
            {inactiveWorkers.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4 text-muted-foreground">
                  {language === 'es' ? 'Trabajadores desactivados' : 'Deactivated workers'}
                </h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveWorkers.map(worker => (
                    <Card key={worker.id} className="opacity-60">
                      <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <UserX className="h-5 w-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-medium">{worker.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {worker.deactivated_at 
                                ? `${language === 'es' ? 'Desactivado' : 'Deactivated'}: ${worker.deactivated_at.split('T')[0]}`
                                : language === 'es' ? 'Desactivado' : 'Deactivated'}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleReactivateWorker(worker)}
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          {language === 'es' ? 'Reactivar' : 'Reactivate'}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Worker selector + Calendar */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {language === 'es' ? 'Seleccionar trabajador' : 'Select worker'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select 
                    value={selectedWorker?.id || ''} 
                    onValueChange={(val) => setSelectedWorker(workers.find(w => w.id === val))}
                  >
                    <SelectTrigger data-testid="worker-select">
                      <SelectValue placeholder={language === 'es' ? 'Seleccionar...' : 'Select...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeWorkers.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Calendar
                    mode="single"
                    selected={viewDate}
                    onSelect={(date) => date && setViewDate(date)}
                    locale={language === 'es' ? es : enUS}
                    className="rounded-md border"
                  />
                </CardContent>
              </Card>

              {/* Day availability view */}
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>
                      {selectedWorker?.name || (language === 'es' ? 'Selecciona un trabajador' : 'Select a worker')}
                    </CardTitle>
                    <CardDescription>
                      {format(viewDate, 'PPPP', { locale: language === 'es' ? es : enUS })}
                    </CardDescription>
                  </div>
                  {dayAvailability && (
                    <Badge variant="outline">
                      {dayAvailability.available_count} {language === 'es' ? 'disponibles' : 'available'}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  {dayAvailability ? (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {dayAvailability.slots.length > 0 ? (
                          dayAvailability.slots.map((slot, i) => (
                            <div 
                              key={i}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                slot.status === 'available' 
                                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                                  : slot.status === 'booked' || slot.status === 'hold'
                                  ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                                  : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-medium">{slot.time}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-mono">{slot.end_time}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {slot.status === 'available' ? (
                                  <Badge className="bg-green-600">{language === 'es' ? 'Disponible' : 'Available'}</Badge>
                                ) : (
                                  <>
                                    <span className="text-sm text-muted-foreground">{slot.reason}</span>
                                    <Badge variant="secondary">
                                      {slot.status === 'booked' ? (language === 'es' ? 'Ocupado' : 'Booked') 
                                        : slot.status === 'hold' ? (language === 'es' ? 'Reservando' : 'Hold')
                                        : slot.status === 'exception' ? (language === 'es' ? 'Bloqueado' : 'Blocked')
                                        : slot.status}
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8">
                            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-muted-foreground">
                              {language === 'es' ? 'No trabaja este día' : 'Not working this day'}
                            </p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-12">
                      <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {language === 'es' 
                          ? 'Selecciona un trabajador y fecha para ver disponibilidad'
                          : 'Select a worker and date to see availability'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Worker Dialog */}
      <Dialog open={showWorkerDialog} onOpenChange={setShowWorkerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWorker 
                ? (language === 'es' ? 'Editar trabajador' : 'Edit worker')
                : (language === 'es' ? 'Nuevo trabajador' : 'New worker')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{language === 'es' ? 'Nombre' : 'Name'} *</Label>
              <Input 
                value={workerForm.name}
                onChange={(e) => setWorkerForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="María González"
                data-testid="worker-name-input"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input 
                type="email"
                value={workerForm.email}
                onChange={(e) => setWorkerForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="maria@example.com"
              />
            </div>
            <div>
              <Label>{language === 'es' ? 'Teléfono' : 'Phone'}</Label>
              <Input 
                value={workerForm.phone}
                onChange={(e) => setWorkerForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+52 555 123 4567"
              />
            </div>
            <div>
              <Label>{language === 'es' ? 'Biografía' : 'Bio'}</Label>
              <Textarea 
                value={workerForm.bio}
                onChange={(e) => setWorkerForm(prev => ({ ...prev, bio: e.target.value }))}
                placeholder={language === 'es' ? 'Especialidades, experiencia...' : 'Specialties, experience...'}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkerDialog(false)}>
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveWorker} data-testid="save-worker-btn">
              <Save className="h-4 w-4 mr-2" />
              {language === 'es' ? 'Guardar' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {language === 'es' ? 'Horario de ' : 'Schedule for '}{selectedWorker?.name}
            </DialogTitle>
            <DialogDescription>
              {language === 'es' 
                ? 'Configura los horarios de trabajo para cada día. Puedes añadir múltiples bloques por día (ej: mañana y tarde).'
                : 'Configure work hours for each day. You can add multiple blocks per day (e.g., morning and afternoon).'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {DAYS_OF_WEEK.map(day => (
              <div key={day.key} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Switch 
                      checked={scheduleForm[day.key]?.is_available}
                      onCheckedChange={() => toggleDayAvailable(day.key)}
                    />
                    <span className="font-medium">{day[language]}</span>
                  </div>
                  {scheduleForm[day.key]?.is_available && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => addBlock(day.key)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {language === 'es' ? 'Añadir bloque' : 'Add block'}
                    </Button>
                  )}
                </div>
                
                {scheduleForm[day.key]?.is_available && (
                  <div className="space-y-2 pl-10">
                    {scheduleForm[day.key]?.blocks?.map((block, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Select 
                          value={block.start_time}
                          onValueChange={(val) => updateBlock(day.key, i, 'start_time', val)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_OPTIONS.map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground">→</span>
                        <Select 
                          value={block.end_time}
                          onValueChange={(val) => updateBlock(day.key, i, 'end_time', val)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_OPTIONS.map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {scheduleForm[day.key]?.blocks?.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-red-500"
                            onClick={() => removeBlock(day.key, i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveSchedule} data-testid="save-schedule-btn">
              <Save className="h-4 w-4 mr-2" />
              {language === 'es' ? 'Guardar horario' : 'Save schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exception Dialog */}
      <Dialog open={showExceptionDialog} onOpenChange={setShowExceptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'es' ? 'Añadir bloqueo/vacación' : 'Add block/vacation'}
            </DialogTitle>
            <DialogDescription>
              {language === 'es' 
                ? 'Bloquea fechas específicas o rangos de tiempo para este trabajador.'
                : 'Block specific dates or time ranges for this worker.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>{language === 'es' ? 'Tipo' : 'Type'}</Label>
              <Select 
                value={exceptionForm.exception_type}
                onValueChange={(val) => setExceptionForm(prev => ({ ...prev, exception_type: val }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">{language === 'es' ? 'Vacaciones' : 'Vacation'}</SelectItem>
                  <SelectItem value="block">{language === 'es' ? 'Bloqueo' : 'Block'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{language === 'es' ? 'Fecha inicio' : 'Start date'} *</Label>
                <Input 
                  type="date"
                  value={exceptionForm.start_date}
                  onChange={(e) => setExceptionForm(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>{language === 'es' ? 'Fecha fin' : 'End date'} *</Label>
                <Input 
                  type="date"
                  value={exceptionForm.end_date}
                  onChange={(e) => setExceptionForm(prev => ({ ...prev, end_date: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="border rounded-lg p-4 bg-muted/50">
              <p className="text-sm font-medium mb-3">
                {language === 'es' ? 'Horario específico (opcional)' : 'Specific hours (optional)'}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {language === 'es' 
                  ? 'Deja vacío para bloquear todo el día'
                  : 'Leave empty to block the entire day'}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === 'es' ? 'Hora inicio' : 'Start time'}</Label>
                  <Select 
                    value={exceptionForm.start_time || 'none'}
                    onValueChange={(val) => setExceptionForm(prev => ({ 
                      ...prev, 
                      start_time: val === 'none' ? '' : val 
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-</SelectItem>
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{language === 'es' ? 'Hora fin' : 'End time'}</Label>
                  <Select 
                    value={exceptionForm.end_time || 'none'}
                    onValueChange={(val) => setExceptionForm(prev => ({ 
                      ...prev, 
                      end_time: val === 'none' ? '' : val 
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-</SelectItem>
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div>
              <Label>{language === 'es' ? 'Motivo' : 'Reason'}</Label>
              <Input 
                value={exceptionForm.reason}
                onChange={(e) => setExceptionForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder={language === 'es' ? 'Ej: Cita médica, vacaciones...' : 'E.g., Medical appointment, vacation...'}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExceptionDialog(false)}>
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveException} data-testid="save-exception-btn">
              <Save className="h-4 w-4 mr-2" />
              {language === 'es' ? 'Guardar' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
