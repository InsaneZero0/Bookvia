import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { usersAPI, authAPI } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import {
  User, Mail, Phone, Calendar, Settings, Heart, Bell, Shield, Camera, Edit2, Check, X
} from 'lucide-react';

export default function UserDashboardPage() {
  const { t, language } = useI18n();
  const { user, isAuthenticated, updateUser, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    birth_date: '',
    gender: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadUser();
  }, [isAuthenticated]);

  const loadUser = async () => {
    try {
      const userData = await refreshUser();
      setFormData({
        full_name: userData.full_name || '',
        phone: userData.phone || '',
        birth_date: userData.birth_date || '',
        gender: userData.gender || '',
      });
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await usersAPI.updateProfile(formData);
      updateUser(res.data);
      setEditing(false);
      toast.success(language === 'es' ? 'Perfil actualizado' : 'Profile updated');
    } catch (error) {
      toast.error(language === 'es' ? 'Error al actualizar' : 'Error updating');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-background">
        <div className="container-app py-8">
          <Skeleton className="h-32 w-32 rounded-full mx-auto mb-4" />
          <Skeleton className="h-8 w-48 mx-auto mb-2" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-background" data-testid="user-dashboard-page">
      <div className="container-app py-8">
        {/* Profile Header */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
              <AvatarImage src={user?.photo_url} />
              <AvatarFallback className="text-3xl bg-[#F05D5E] text-white">
                {getInitials(user?.full_name)}
              </AvatarFallback>
            </Avatar>
            <button className="absolute bottom-0 right-0 p-2 rounded-full bg-[#F05D5E] text-white shadow-lg hover:bg-[#D94A4B] transition-colors">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <h1 className="text-2xl font-heading font-bold mt-4">{user?.full_name}</h1>
          <p className="text-muted-foreground">{user?.email}</p>
          {user?.phone_verified ? (
            <Badge className="mt-2 bg-green-100 text-green-700">
              <Shield className="h-3 w-3 mr-1" />
              {language === 'es' ? 'Verificado' : 'Verified'}
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => navigate('/verify-phone')}
            >
              {language === 'es' ? 'Verificar teléfono' : 'Verify phone'}
            </Button>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Calendar, label: t('nav.bookings'), path: '/bookings', color: 'bg-blue-100 text-blue-600' },
            { icon: Heart, label: t('nav.favorites'), path: '/favorites', color: 'bg-red-100 text-red-600' },
            { icon: Bell, label: t('nav.notifications'), path: '/notifications', color: 'bg-yellow-100 text-yellow-600' },
            { icon: Settings, label: language === 'es' ? 'Configuración' : 'Settings', path: '/settings', color: 'bg-gray-100 text-gray-600' },
          ].map(item => (
            <Card 
              key={item.path}
              className="cursor-pointer hover:border-[#F05D5E]/30 transition-all hover:-translate-y-1"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className={`p-3 rounded-xl ${item.color} mb-3`}>
                  <item.icon className="h-6 w-6" />
                </div>
                <span className="text-sm font-medium">{item.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Profile Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading">{language === 'es' ? 'Información personal' : 'Personal information'}</CardTitle>
            {!editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} data-testid="edit-profile-button">
                <Edit2 className="h-4 w-4 mr-2" />
                {t('common.edit')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4 mr-1" />
                  {t('common.cancel')}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="btn-coral" data-testid="save-profile-button">
                  <Check className="h-4 w-4 mr-1" />
                  {t('common.save')}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {t('auth.fullName')}
                </label>
                {editing ? (
                  <Input
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                    data-testid="edit-fullname"
                  />
                ) : (
                  <p className="text-muted-foreground">{user?.full_name || '-'}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {t('auth.email')}
                </label>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {t('auth.phone')}
                </label>
                {editing ? (
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    data-testid="edit-phone"
                  />
                ) : (
                  <p className="text-muted-foreground">{user?.phone || '-'}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {t('auth.birthDate')}
                </label>
                {editing ? (
                  <Input
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, birth_date: e.target.value }))}
                    data-testid="edit-birthdate"
                  />
                ) : (
                  <p className="text-muted-foreground">{user?.birth_date || '-'}</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border mt-6">
              <div className="text-center">
                <p className="text-2xl font-bold">{user?.active_appointments_count || 0}</p>
                <p className="text-xs text-muted-foreground">{language === 'es' ? 'Citas activas' : 'Active bookings'}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{user?.cancellation_count || 0}</p>
                <p className="text-xs text-muted-foreground">{language === 'es' ? 'Cancelaciones' : 'Cancellations'}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{user?.favorites?.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t('nav.favorites')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
