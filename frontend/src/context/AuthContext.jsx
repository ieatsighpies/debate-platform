import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../services/api';
import axios from 'axios';
import config from '../config';

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
  const isTokenExpired = (token) => {
    try {
      const decoded = jwtDecode(token);
      const now = Date.now() / 1000;
      return decoded.exp < now;
    } catch (error) {
      return true;
    }
  };

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
  }, []);

  // Check expiration periodically
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      if (isTokenExpired(token)) {
        console.log('[Auth] Token expired, logging out...');
        logout();
      navigate(`/login`, { replace: true });
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [token]); // ✅ Add token to dependency

  const login = (token, user) => {
    console.log('[Auth] Storing credentials:', { user });
    // Store auth
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setUser(user);
  };

  const logout = useCallback(async () => {
    console.log('[Auth] Logging out...');

    try {
      await api.post(`/api/auth/logout`);
    } catch (error) {
      console.error('[Auth] Logout error:', error);
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []); // Now safe to use in other useEffects

const refreshAuth = useCallback(() => {
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');

  if (savedToken && savedUser && !isTokenExpired(savedToken)) {
    setToken(savedToken);
    setUser(JSON.parse(savedUser));
    return true;
  }
  return false;
}, []);

  const value = {
    user,
    token, // ✅ Add this so components can access token
    loading,
    login,
    logout,
    refreshAuth
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};