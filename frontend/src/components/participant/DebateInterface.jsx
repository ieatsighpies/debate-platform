import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { debateAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Send, AlertCircle, Wifi, WifiOff, ArrowLeft } from 'lucide-react';

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL;

const DebateInterface = () => {
  const { debateId } = useParams();
  const navigate = useNavigate();
  const [debate, setDebate] = useState(null);
  const [argument, setArgument] = useState('');
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const argumentsEndRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    console.log('[Debate Socket] Initializing connection to:', SOCKET_SERVER_URL);

    const newSocket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('[Debate Socket] Connected:', newSocket.id);
      setConnected(true);
      // Join debate room
      newSocket.emit('join:debate', debateId);
      console.log('[Debate Socket] Joined debate room:', debateId);
    });

    newSocket.on('disconnect', () => {
      console.log('[Debate Socket] Disconnected');
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Debate Socket] Connection error:', error);
      setConnected(false);
    });

    // Listen for new arguments
    newSocket.on('debate:argumentAdded', (data) => {
      console.log('[Debate Socket] Received argument:', data);
      if (String(data?.debateId) === String(debateId)) {
        fetchDebate();
      }
    });

    // Listen for debate completion
    newSocket.on('debate:completed', (data) => {
      console.log('[Debate Socket] Debate completed:', data);
      if (String(data?.debateId) === String(debateId)) {
        toast.success('Debate completed!');
        fetchDebate();
      }
    });

    setSocket(newSocket);

    return () => {
      console.log('[Debate Socket] Cleaning up');
      newSocket.emit('leave:debate', debateId);
      newSocket.disconnect();
    };
  }, [debateId]);

  // Fetch initial debate data
  useEffect(() => {
    fetchDebate();
  }, [debateId]);

  // Auto-scroll to latest argument
  useEffect(() => {
    argumentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [debate?.arguments]);

  const fetchDebate = async () => {
    try {
      const response = await debateAPI.getDebate(debateId);
      console.log('[Debate] Fetched debate data:', response.data.debate);
      setDebate(response.data.debate);
    } catch (error) {
      console.error('[Debate] Error fetching debate:', error);
      toast.error('Failed to load debate');
    }
  };

  const submitArgument = async () => {
    if (!argument.trim()) {
      toast.error('Please enter an argument');
      return;
    }

    if (argument.trim().length > 500) {
      toast.error('Argument too long (max 200 characters)');
      return;
    }

    setLoading(true);
    try {
      console.log('[Debate] Submitting argument:', argument.trim());
      const response = await debateAPI.submitArgument(debateId, argument.trim());
      setDebate(response.data.debate);
      setArgument('');
      toast.success('Argument submitted!');
    } catch (error) {
      console.error('[Debate] Error submitting argument:', error);
      toast.error(error.response?.data?.message || 'Failed to submit argument');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      submitArgument();
    }
  };

  if (!debate) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading debate...</p>
        </div>
      </div>
    );
  }

  const isMyTurn = () => {
    if (debate.status !== 'active') return false;

    if (!debate.nextTurn) return false;
    return debate.nextTurn === debate.yourStance;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{debate.topicQuestion}</h1>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                {/* Don't show if opponent is AI - just say "Opponent" */}
                Opponent Stance: <span className={debate.yourStance === 'for' ? 'text-red-600' : 'text-green-600'}></span>
                <span className="font-medium">
                  Your Stance: <span className={debate.yourStance === 'for' ? 'text-green-600' : 'text-red-600'}>
                    {debate.yourStance === 'for' ? '👍 Leaning for' : '👎 Leaning against'}
                  </span>
                </span>
                <span>Round: {debate.currentRound} / {debate.maxRounds}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  debate.status === 'active' ? 'bg-green-100 text-green-800' :
                  debate.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' :
                  debate.status === 'closing' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {debate.status.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {connected ? (
                <span className="flex items-center text-sm text-green-600">
                  <Wifi size={16} className="mr-1" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center text-sm text-red-600">
                  <WifiOff size={16} className="mr-1" />
                  Disconnected
                </span>
              )}
              <button
                onClick={() => navigate('/participant')}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
              >
                <ArrowLeft size={18} />
                <span>Back</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Connection Warning */}
        {!connected && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg flex items-center">
            <AlertCircle size={20} className="mr-2" />
            Reconnecting to server... Real-time updates paused.
          </div>
        )}

        {/* Waiting State */}
        {debate.status === 'waiting' && (
          <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
            <AlertCircle size={20} className="inline mr-2" />
            Waiting for opponent to join...
          </div>
        )}

        {/* Arguments List */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Arguments</h2>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {debate.arguments && debate.arguments.length > 0 ? (
              debate.arguments.map((arg, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-lg ${
                    arg.isYours
                      ? 'bg-indigo-50 border-l-4 border-indigo-600'
                      : 'bg-gray-50 border-l-4 border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`font-semibold text-sm ${
                      arg.stance === 'for' ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {arg.stance === 'for' ? '👍 Leaning for' : '👎 Leaning against'}
                      {arg.isYours ? ' (You)' : ' (Opponent)'}
                    </span>
                    <span className="text-xs text-gray-500">Round {arg.round}</span>
                  </div>
                  <p className="text-gray-800">{arg.text}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">No arguments yet. Be the first to argue!</p>
            )}
            <div ref={argumentsEndRef} />
          </div>
        </div>

        {/* Argument Input */}
        {debate.status === 'active' && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Your Argument</h3>
              {isMyTurn() ? (
                <span className="text-sm text-green-600 font-medium">✓ Your turn</span>
              ) : (
                <span className="text-sm text-gray-500">Waiting for opponent...</span>
              )}
            </div>

            <div className="mt-2 text-sm text-gray-600">
              <strong>Good norms:</strong> Use reasons, not insults. Acknowledge at least one thing your opponent cares about.
            </div>

            <textarea
              value={argument}
              onChange={(e) => setArgument(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!connected || !isMyTurn() || loading}
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
              placeholder={isMyTurn() ? "Enter your argument (max 500 characters)..." : "Wait for your turn..."}
              rows={4}
              maxLength={500}
            />

            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-gray-500">
                {argument.length} / 200 characters
                <span className="ml-4 text-xs text-gray-400">Tip: Press Ctrl+Enter to submit</span>
              </span>
              <button
                onClick={submitArgument}
                disabled={!connected || !isMyTurn() || !argument.trim() || loading}
                className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition shadow-md"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Submit Argument</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Closing State */}
        {debate.status === 'closing' && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
            <p className="font-medium">Debate is in closing stage. Submit your closing remarks.</p>
          </div>
        )}

        {/* Completed State */}
        {(debate.status === 'survey_pending' || debate.status === 'completed') && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
            <p className="font-medium">
              Debate completed!
              {debate.winner && ` Winner: ${debate.winner === debate.yourStance ? 'You!' : 'Opponent'}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebateInterface;
