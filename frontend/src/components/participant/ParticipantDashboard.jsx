import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { debateAPI } from '../../services/api';
import { Loader2, MessageSquare, AlertCircle, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

const ParticipantDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeDebate, setActiveDebate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkActiveDebate();
  }, []);

  const checkActiveDebate = async () => {
    try {
      setLoading(true);
      const response = await debateAPI.getMyStatus();

      if (response.data.hasDebate) {
        setActiveDebate(response.data.debate);
      }
    } catch (error) {
      console.error('[Dashboard] Error checking status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleJoinDebate = () => {
    navigate('/participant/join');
  };

  const handleContinueDebate = () => {
    if (activeDebate) {
      navigate(`/participant/debate/${activeDebate._id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Debate Platform</h1>
              <p className="text-sm text-gray-600">Welcome, {user?.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            >
              <LogOut size={16} className="mr-2" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Active Debate Alert */}
        {activeDebate && (
          <div className={`mb-6 border-l-4 p-6 rounded-lg shadow-sm ${
            activeDebate.status === 'completed'
              ? 'bg-blue-50 border-blue-400'
              : 'bg-yellow-50 border-yellow-400'
          }`}>
            <div className="flex items-start">
              <MessageSquare className={`mr-3 flex-shrink-0 mt-1 ${
                activeDebate.status === 'completed' ? 'text-blue-400' : 'text-yellow-400'
              }`} size={24} />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {activeDebate.status === 'completed'
                    ? '✅ Debate Completed - Survey Pending'
                    : 'You have an ongoing debate'}
                </h3>
                <p className="text-gray-700 mb-3">{activeDebate.topicQuestion}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mb-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    activeDebate.status === 'waiting'
                      ? 'bg-yellow-100 text-yellow-800'
                      : activeDebate.status === 'completed'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                  }`}>
                    {activeDebate.status.toUpperCase()}
                  </span>
                  <span>Your stance: {activeDebate.yourStance}</span>
                  {activeDebate.status === 'active' && (
                    <span>Round {activeDebate.currentRound}/{activeDebate.maxRounds}</span>
                  )}
                </div>
                <button
                  onClick={handleContinueDebate}
                  className={`px-6 py-2 rounded-lg transition ${
                    activeDebate.status === 'completed'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {activeDebate.status === 'waiting'
                    ? 'Go to Waiting Room'
                    : activeDebate.status === 'completed'
                      ? 'Complete Survey'
                      : 'Continue Debate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Join New Debate */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
            <div className="flex items-center mb-4">
              <div className="p-3 bg-indigo-100 rounded-lg mr-4">
                <MessageSquare className="text-indigo-600" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Join a Debate</h3>
                <p className="text-sm text-gray-600">Start a new debate on any topic</p>
              </div>
            </div>
            <button
              onClick={handleJoinDebate}
              disabled={!!activeDebate}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activeDebate ? 'Complete current debate first' : 'Join Debate'}
            </button>
          </div>

          {/* Debate Guidelines */}
          <div className="bg-blue-50 rounded-lg shadow-md p-6 border border-blue-200">
            <div className="flex items-center mb-4">
              <div className="p-3 bg-blue-100 rounded-lg mr-4">
                <AlertCircle className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Early End Guidelines</h3>
                <p className="text-sm text-gray-600">When to conclude a debate</p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-blue-900 font-medium">
                💡 Allow the discussion to reach a natural conclusion
              </p>
              <p className="text-xs text-blue-800">
                <strong>Minimum requirement:</strong> You can only end the debate after <strong>at least 5 rounds</strong> have been completed.
              </p>
              <p className="text-xs text-blue-800">
                <strong>Best practice:</strong> Please continue debating until the discussion naturally concludes or both participants feel their points have been thoroughly discussed. Early ending should be mutual agreement when discussion feels complete, not a way to leave quickly.
              </p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Participate</h3>
          <div className="space-y-3 text-gray-700">
            <div className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                1
              </span>
              <p>Click "Join Debate" and select a topic you're interested in</p>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                2
              </span>
              <p>Choose your stance (Leaning for or Leaning against)</p>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                3
              </span>
              <p>Wait for an opponent to join</p>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                4
              </span>
              <p>Take turns presenting arguments (max 200 characters each)</p>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                5
              </span>
              <p>Complete all rounds to finish the debate</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ParticipantDashboard;
