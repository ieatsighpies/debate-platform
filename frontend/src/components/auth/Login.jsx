import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import { LogIn, AlertCircle, Users } from 'lucide-react';
import GuestResumeForm from './GuestResumeForm';

const Login = () => {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [showResumeForm, setShowResumeForm] = useState(false);

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (user.role === 'participant') {
        navigate('/participant', { replace: true });
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // ✅ Call context login directly - it handles everything
      const response = await authAPI.login(credentials.username, credentials.password);
      const { token, user: userData } = response.data;
      login(token, userData);

      if (response.data.success) {
        console.log('[Login] Success! User:', response.data.user);
        // Redirect based on role
        if (response.data.user.role === 'admin') {
          navigate('/admin', { replace: true });
        } else if (response.data.user.role === 'participant') {
          navigate('/participant', { replace: true });
        }
      } else {
        setError(response.data.message);
      }
    } catch (error) {
      console.error('[Login] Error:', error);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleGuestLogin = async () => {
    setError('');
// ✅ Check if there's already a guest logged in
  const existingToken = localStorage.getItem('token');
  const existingUser = localStorage.getItem('user');

  if (existingToken && existingUser) {
    const user = JSON.parse(existingUser);
    if (user.isGuest) {
      const confirmed = window.confirm(
        'A guest is already logged in on this browser. ' +
        'Continuing will log out the previous guest. ' +
        'Continue?'
      );
      if (!confirmed) return;
    }
  }

  setGuestLoading(true);

    try {
      console.log('[Guest] Calling guest login API...');
      const response = await authAPI.guestLogin();

      console.log('[Guest] API response:', response.data);

      login(response.data.token, response.data.user);

      console.log('[Guest] Navigating...');

      // Check for active debate
      if (response.data.activeDebate) {
        navigate(`/debate/${response.data.activeDebate}`, { replace: true });
      } else {
        navigate('/participant', { replace: true });
      }
    } catch (error) {
      console.error('[Guest] Login error:', error);
      setError('Failed to login as guest. Please try again.');
      setGuestLoading(false);
    }
  };

  const handleResumeSuccess = (data) => {
    login(data.token, data.user);

    if (data.activeDebate) {
      navigate(`/debate/${data.activeDebate}`, { replace: true });
    } else {
      navigate('/participant', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Debate Platform</h1>
          <p className="text-gray-600">Sign in to continue</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center">
            <AlertCircle size={20} className="mr-2" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Enter your username"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Enter your password"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || guestLoading}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </>
            ) : (
              <>
                <LogIn size={20} className="mr-2" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or</span>
          </div>
        </div>

        {/* Guest Login Button */}
        <button
          onClick={handleGuestLogin}
          disabled={loading || guestLoading}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center border border-gray-300"
        >
          {guestLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-gray-800 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating guest account...
            </>
          ) : (
            <>
              <Users size={20} className="mr-2" />
              Continue as Guest
            </>
          )}
        </button>
        {/* Resume Guest Session Section */}
        <div className="mt-6 border-t pt-6">
          {!showResumeForm ? (
            <button
              onClick={() => setShowResumeForm(true)}
              className="w-full py-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium transition flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Already a guest? Resume your session
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  Resume Guest Session
                </h3>
                <button
                  onClick={() => setShowResumeForm(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕ Close
                </button>
              </div>

              <GuestResumeForm onSuccess={handleResumeSuccess} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
