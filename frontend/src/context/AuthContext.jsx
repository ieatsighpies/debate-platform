import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if token is expired
  const isTokenExpired = useCallback((token) => {
    try {
      const decoded = jwtDecode(token);
      const now = Date.now() / 1000;
      return decoded.exp < now;
    } catch (error) {
      return true;
    }
  }, []); // ✅ Wrap in useCallback to make it stable

  // Load saved auth on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      if (isTokenExpired(savedToken)) {
        console.log('[Auth] Token expired, clearing...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } else {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    }
    setLoading(false);
  }, [isTokenExpired]); // ✅ Add isTokenExpired

  const logout = useCallback(async () => {
    console.log('[Auth] Logging out...');

    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('[Auth] Logout error:', error);
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  // Check expiration periodically
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      if (isTokenExpired(token)) {
        console.log('[Auth] Token expired, logging out...');
        logout(); // ✅ Just logout, interceptor handles redirect
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [token, logout, isTokenExpired]); // ✅ Add all dependencies

  const refreshAuth = useCallback(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser && !isTokenExpired(savedToken)) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      return true;
    }
    return false;
  }, [isTokenExpired]); // ✅ Add isTokenExpired

  const login = useCallback((token, user) => {
    console.log('[Auth] Storing credentials:', { user });
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setUser(user);
  }, []);

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    refreshAuth
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};