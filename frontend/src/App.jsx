import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/socketContext';
import { Toaster } from 'react-hot-toast';

// Components
import Login from './components/auth/Login';
import AdminDashboard from './components/admin/AdminDashboard';
import ParticipantDashboard from './components/participant/ParticipantDashboard';
import JoinDebate from './components/participant/JoinDebate';
import DebateRoom from './components/participant/DebateRoom';

// Protected Route
const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, loading } = useAuth();

  console.log('[ProtectedRoute] User:', user, 'Loading:', loading, 'AllowedRole:', allowedRole);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    console.log('[ProtectedRoute] No user, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    console.log('[ProtectedRoute] Wrong role, redirecting to', `/${user.role}`);
    return <Navigate to={`/${user.role}`} replace />;
  }

  return children;
};

function App() {
  console.log('[App] Rendering');

  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Toaster position="top-right" />
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Participant Routes */}
            <Route
              path="/participant"
              element={
                <ProtectedRoute allowedRole="participant">
                  <ParticipantDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/participant/join"
              element={
                <ProtectedRoute allowedRole="participant">
                  <JoinDebate />
                </ProtectedRoute>
              }
            />
            <Route
              path="/participant/debate/:debateId"
              element={
                <ProtectedRoute allowedRole="participant">
                  <DebateRoom />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Default */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

// Root redirect component
const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={`/${user.role}`} replace />;
};

export default App;
