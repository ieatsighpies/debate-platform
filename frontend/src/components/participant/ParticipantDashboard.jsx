import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { debateAPI } from '../../services/api';
import { Loader2, MessageSquare, TrendingUp, User, LogOut } from 'lucide-react';
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
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-lg shadow-sm">
            <div className="flex items-start">
              <MessageSquare className="text-yellow-400 mr-3 flex-shrink-0 mt-1" size={24} />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  You have an ongoing debate
                </h3>
                <p className="text-gray-700 mb-3">{activeDebate.topicQuestion}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mb-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    activeDebate.status === 'waiting'
                      ? 'bg-yellow-100 text-yellow-800'
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
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  {activeDebate.status === 'waiting' ? 'Go to Waiting Room' : 'Continue Debate'}
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

          {/* Stats */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className="p-3 bg-green-100 rounded-lg mr-4">
                <TrendingUp className="text-green-600" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Your Stats</h3>
                <p className="text-sm text-gray-600">Track your debate history</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">0</p>
                <p className="text-sm text-gray-600">Debates</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">0</p>
                <p className="text-sm text-gray-600">Arguments</p>
              </div>
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
              <p>Choose your stance (For or Against) and game mode (Human vs Human or Human vs AI)</p>
            </div>
            <div className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium mr-3">
                3
              </span>
              <p>Wait for an opponent to join or for an admin to match you with AI</p>
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
