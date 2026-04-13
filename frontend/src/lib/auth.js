import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from './api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('bookvia-token');
    const savedUser = localStorage.getItem('bookvia-user');
    const savedBusiness = localStorage.getItem('bookvia-business');
    const savedManager = localStorage.getItem('bookvia-manager');
    
    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        if (savedBusiness) {
          setBusiness(JSON.parse(savedBusiness));
        }
        setIsAuthenticated(true);
      } catch (e) {
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await authAPI.login({ email, password });
    const { token, user: userData } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-user', JSON.stringify(userData));
    
    setUser(userData);
    setIsAuthenticated(true);
    
    return userData;
  };

  const register = async (data) => {
    const response = await authAPI.register(data);
    return response.data;
  };

  const businessLogin = async (email, password) => {
    const response = await authAPI.businessLogin({ email, password });
    const { token, business: businessData } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-business', JSON.stringify(businessData));
    localStorage.removeItem('bookvia-manager');
    const userData = { role: 'business', email, business_id: businessData.id, is_manager: false };
    localStorage.setItem('bookvia-user', JSON.stringify(userData));
    
    setBusiness(businessData);
    setUser(userData);
    setIsAuthenticated(true);
    
    return businessData;
  };

  const managerLogin = async (businessEmail, workerId, pin) => {
    const response = await authAPI.managerLogin({ business_email: businessEmail, worker_id: workerId, pin });
    const { token, business: businessData, manager } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-business', JSON.stringify(businessData));
    localStorage.setItem('bookvia-manager', JSON.stringify(manager));
    const userData = {
      role: 'business',
      email: businessEmail,
      business_id: businessData.id,
      is_manager: true,
      manager_permissions: manager.permissions,
      worker_id: manager.worker_id,
      worker_name: manager.worker_name,
    };
    localStorage.setItem('bookvia-user', JSON.stringify(userData));
    
    setBusiness(businessData);
    setUser(userData);
    setIsAuthenticated(true);
    
    return businessData;
  };

  const businessRegister = async (data) => {
    const response = await authAPI.businessRegister(data);
    return response.data;
  };

  const googleLogin = async (sessionId) => {
    const response = await authAPI.googleSession({ session_id: sessionId });
    const { token, user: userData } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-user', JSON.stringify(userData));
    
    setUser(userData);
    setIsAuthenticated(true);
    
    return userData;
  };

  const adminLogin = async (email, password, totpCode) => {
    const response = await authAPI.adminLogin({ email, password, totp_code: totpCode });
    
    // If 2FA setup is required, return the special response without setting auth state
    if (response.data.requires_2fa_setup) {
      return response.data;
    }
    
    const { token, user: userData } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-user', JSON.stringify(userData));
    
    setUser(userData);
    setIsAuthenticated(true);
    
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('bookvia-token');
    localStorage.removeItem('bookvia-user');
    localStorage.removeItem('bookvia-business');
    localStorage.removeItem('bookvia-manager');
    setUser(null);
    setBusiness(null);
    setIsAuthenticated(false);
  };

  const updateUser = (userData) => {
    setUser(prev => ({ ...prev, ...userData }));
    const current = JSON.parse(localStorage.getItem('bookvia-user') || '{}');
    localStorage.setItem('bookvia-user', JSON.stringify({ ...current, ...userData }));
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getMe();
      setUser(response.data);
      localStorage.setItem('bookvia-user', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      logout();
      throw error;
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'staff';
  const isSuperAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const isBusiness = user?.role === 'business';
  const isUser = user?.role === 'user';
  const isManager = !!user?.is_manager;
  const managerPermissions = user?.manager_permissions || {};

  const hasPermission = (permission) => {
    if (!isManager) return true; // Owner has all permissions
    return !!managerPermissions[permission];
  };

  return (
    <AuthContext.Provider value={{
      user,
      business,
      loading,
      isAuthenticated,
      isAdmin,
      isSuperAdmin,
      isStaff,
      isBusiness,
      isUser,
      isManager,
      managerPermissions,
      hasPermission,
      login,
      register,
      businessLogin,
      managerLogin,
      businessRegister,
      adminLogin,
      googleLogin,
      logout,
      updateUser,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
