import React, { createContext, useContext, useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    const tokenTimestamp = localStorage.getItem('tokenTimestamp');

    if (token && storedUser && tokenTimestamp) {
      try {
        // Check if token is older than 24 hours
        const tokenAge = Date.now() - parseInt(tokenTimestamp);
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (tokenAge > maxAge) {
          console.log('[Auth] Token expired, clearing...');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('tokenTimestamp');
        } else {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          console.log('[Auth] Auto-login:', parsedUser.username);
        }
      } catch (error) {
        console.error('[Auth] Error parsing stored user:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('tokenTimestamp');
      }
    }

    setLoading(false);
  }, []);

  // Clear tokens when window/tab closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[Auth] Window closing, clearing tokens...');
      // Only clear if you want to force logout on close
      // Comment out these lines if you want tokens to persist
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('tokenTimestamp');
    };

    // NOTE: This only works when window/tab is closed, not when page refreshes
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const login = async (username, password) => {
    try {
      console.log('[Auth] Attempting login to:', `${config.apiUrl}/api/auth/login`);

      const response = await axios.post(
        `${config.apiUrl}/api/auth/login`,
        { username, password }
      );

      const { token, user: userData } = response.data;

      // Store token, user data, and timestamp
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('tokenTimestamp', Date.now().toString());

      setUser(userData);

      console.log('[Auth] Login successful:', userData);
      return { success: true, user: userData };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  };

  const logout = () => {
    console.log('[Auth] Logging out...');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tokenTimestamp');
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
