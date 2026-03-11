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
    
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
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
    const { token, user: userData } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-user', JSON.stringify(userData));
    
    setUser(userData);
    setIsAuthenticated(true);
    
    return userData;
  };

  const businessLogin = async (email, password) => {
    const response = await authAPI.businessLogin({ email, password });
    const { token, business: businessData } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-business', JSON.stringify(businessData));
    localStorage.setItem('bookvia-user', JSON.stringify({ role: 'business', email }));
    
    setBusiness(businessData);
    setUser({ role: 'business', email });
    setIsAuthenticated(true);
    
    return businessData;
  };

  const businessRegister = async (data) => {
    const response = await authAPI.businessRegister(data);
    const { token, business: businessData } = response.data;
    
    localStorage.setItem('bookvia-token', token);
    localStorage.setItem('bookvia-business', JSON.stringify(businessData));
    localStorage.setItem('bookvia-user', JSON.stringify({ role: 'business', email: data.email }));
    
    setBusiness(businessData);
    setUser({ role: 'business', email: data.email });
    setIsAuthenticated(true);
    
    return businessData;
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

  const isAdmin = user?.role === 'admin';
  const isBusiness = user?.role === 'business';
  const isUser = user?.role === 'user';

  return (
    <AuthContext.Provider value={{
      user,
      business,
      loading,
      isAuthenticated,
      isAdmin,
      isBusiness,
      isUser,
      login,
      register,
      businessLogin,
      businessRegister,
      adminLogin,
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
