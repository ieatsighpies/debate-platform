import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PrivateRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but wrong role - redirect to appropriate dashboard
  if (requiredRole && user.role !== requiredRole) {
    // If admin tries to access participant routes, redirect to admin dashboard
    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    // If participant tries to access admin routes, redirect to participant dashboard
    if (user.role === 'participant') {
      return <Navigate to="/participant" replace />;
    }
    // Fallback: redirect to login
    return <Navigate to="/login" replace />;
  }

  // Authorized - render the protected component
  return children;
};

export default PrivateRoute;
