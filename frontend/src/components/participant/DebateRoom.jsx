import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { debateAPI } from '../../services/api';
import { useSocket } from '../../context/socketContext';
import { useAuth } from '../../context/AuthContext';
import { Loader2, Clock, Users, X, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const DebateRoom = () => {
  const { debateId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, connected, joinDebateRoom, leaveDebateRoom } = useSocket();

  const [debate, setDebate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [argument, setArgument] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [earlyEndVotes, setEarlyEndVotes] = useState({
    player1Voted: false,
    player2Voted: false,
    yourVote: false
  });
  const [votingInProgress, setVotingInProgress] = useState(false);

  // Use ref to avoid stale closure in socket handlers
  const debateIdRef = useRef(debateId);

  // Fetch debate data
  const fetchDebate = async () => {
    if (!debateIdRef.current) {
      setError('No debate ID provided');
      setLoading(false);
      return;
    }

    try {
      console.log('[DebateRoom] Fetching debate:', debateIdRef.current);
      const response = await debateAPI.getDebate(debateIdRef.current);
      console.log('[DebateRoom] Debate fetched:', response.data);

      setDebate(response.data.debate);

      // Update vote state if available
      if (response.data.debate.earlyEndVotes) {
        const isPlayer1 = response.data.debate.isPlayer1;
        const votes = response.data.debate.earlyEndVotes;

        setEarlyEndVotes({
          player1Voted: votes.player1Voted || false,
          player2Voted: votes.player2Voted || false,
          yourVote: isPlayer1 ? (votes.player1Voted || false) : (votes.player2Voted || false)
        });
      }
      setError(null);
    } catch (err) {
      console.error('[DebateRoom] Error fetching debate:', err);
      setError(err.response?.data?.message || 'Failed to load debate');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchDebate();
  }, [debateId]);

  // Socket setup - FIXED: Runs immediately when socket is available
  useEffect(() => {
    if (!debateId || !socket || !connected) {
      console.log('[DebateRoom] Socket not ready:', { debateId, socket: !!socket, connected });
      return;
    }

    console.log('[DebateRoom] Setting up socket listeners for:', debateId);

    // Join the room immediately
    joinDebateRoom(debateId);

    // FIXED: Socket handlers that don't rely on stale state
    const handleArgumentAdded = (data) => {
      console.log('[DebateRoom] Argument added event:', data);
      if (data.debateId === debateIdRef.current) {
        fetchDebate();
      }
    };

    const handleDebateStarted = (data) => {
      console.log('[DebateRoom] ✅ Debate started event received!', data);
      if (data.debateId === debateIdRef.current) {
        toast.success('Opponent joined! Debate starting...');
        fetchDebate();
      }
    };

    // FIXED: Also listen for 'debate:matched' or 'debate:joined' events
    const handlePlayerJoined = (data) => {
      console.log('[DebateRoom] ✅ Player joined event received!', data);
      if (data.debateId === debateIdRef.current) {
        toast.success('Opponent found! Starting debate...');
        fetchDebate();
      }
    };

    const handleDebateCompleted = (data) => {
      console.log('[DebateRoom] Debate completed:', data);
      if (data.debateId === debateIdRef.current) {
        fetchDebate();
      }
    };

    const handleDebateCancelled = (data) => {
      console.log('[DebateRoom] Debate cancelled:', data);
      if (data.debateId === debateIdRef.current) {
        toast.error('This debate was cancelled');
        navigate('/participant');
      }
    };

    const handleEarlyEndVote = (data) => {
      console.log('[DebateRoom] Early end vote update:', data);
      if (data.debateId === debateIdRef.current) {
        setEarlyEndVotes(data.votes);
        setVotingInProgress(false);

        if (data.votes.player1Voted && data.votes.player2Voted) {
          toast.success('Both players agreed - debate ending early!');
          setTimeout(() => fetchDebate(), 1000);
        }
      }
    };

    socket.on('debate:argumentAdded', handleArgumentAdded);
    socket.on('debate:active', handleDebateStarted);
    socket.on('debate:completed', handleDebateCompleted);
    socket.on('debate:cancelled', handleDebateCancelled);
    socket.on('debate:earlyEndVote', handleEarlyEndVote);
    // FIXED: Add connection status monitoring
    const handleConnect = () => {
      console.log('[DebateRoom] Socket reconnected, rejoining room');
      joinDebateRoom(debateId);
      fetchDebate(); // Re-fetch on reconnect
    };

    socket.on('connect', handleConnect);

    return () => {
      console.log('[DebateRoom] Cleaning up socket listeners');
      socket.off('debate:argumentAdded', handleArgumentAdded);
      socket.off('debate:active', handleDebateStarted);
      socket.off('debate:completed', handleDebateCompleted);
      socket.off('debate:cancelled', handleDebateCancelled);
      socket.off('debate:earlyEndVote', handleEarlyEndVote);
      socket.off('connect', handleConnect);
      leaveDebateRoom(debateId);
    };
  }, [socket, connected, debateId]);

  // FIXED: Add polling as backup when in waiting status
  useEffect(() => {
    if (debate?.status !== 'waiting') return;

    console.log('[DebateRoom] Starting polling for waiting room');
    const pollInterval = setInterval(() => {
      console.log('[DebateRoom] Polling for debate update...');
      fetchDebate();
    }, 3000); // Poll every 3 seconds

    return () => {
      console.log('[DebateRoom] Stopping polling');
      clearInterval(pollInterval);
    };
  }, [debate?.status]);

  // Cancel debate
  const handleCancelDebate = async () => {
    if (!window.confirm('Cancel this debate?')) return;

    try {
      await debateAPI.cancelDebate(debateId);
      toast.success('Debate cancelled');
      navigate('/participant');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel debate');
    }
  };

  // Submit argument
  const handleSubmitArgument = async () => {
    if (!argument.trim()) {
      toast.error('Please enter an argument');
      return;
    }

    if (argument.length > 500) {
      toast.error('Argument too long (max 500 characters)');
      return;
    }

    try {
      setSubmitting(true);
      await debateAPI.submitArgument(debateId, argument.trim());
      setArgument('');
      toast.success('Argument submitted');
      fetchDebate();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit argument');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (argument.trim() && !submitting) {
        handleSubmitArgument();
      }
    }
  };

  // FIXED: Vote handlers moved OUTSIDE useEffect to component level
  const handleVoteEarlyEnd = async () => {
  if (votingInProgress) return;

  console.log('🔵 [DEBUG] Starting vote process');
  console.log('🔵 [DEBUG] debateId:', debateId);
  console.log('🔵 [DEBUG] current round:', debate.currentRound);

  setVotingInProgress(true);

  try {
    console.log('🔵 [DEBUG] Calling API...');
    const response = await debateAPI.voteEarlyEnd(debateId);
    console.log('🔵 [DEBUG] API response:', response);

    toast.success('Vote recorded. Waiting for opponent...');
  } catch (error) {
    console.error('🔴 [DEBUG] Error occurred:', error);
    console.error('🔴 [DEBUG] Error response:', error.response);
    console.error('🔴 [DEBUG] Error status:', error.response?.status);
    console.error('🔴 [DEBUG] Error message:', error.response?.data?.message);

    toast.error(error.response?.data?.message || 'Failed to vote');
    setVotingInProgress(false);
  }
};


  const handleRevokeEarlyEndVote = async () => {
    try {
      await debateAPI.revokeEarlyEndVote(debateId);
      toast.success('Vote revoked');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to revoke vote');
    }
  };

  const getOpponentVoteStatus = () => {
    if (!debate) return false;
    const isPlayer1 = debate.isPlayer1;
    return isPlayer1 ? earlyEndVotes.player2Voted : earlyEndVotes.player1Voted;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-gray-600">Loading debate...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
          <button
            onClick={() => navigate('/participant')}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Debate not found</p>
          <button
            onClick={() => navigate('/participant')}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Waiting room view remains the same...
  if (debate.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
                <Clock className="text-yellow-600" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                Waiting for Opponent
              </h1>
              <p className="text-gray-600">
                Your debate will start when another player joins
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {debate.topicQuestion}
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Your Stance:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    debate.yourStance === 'for'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {debate.yourStance === 'for' ? '👍 FOR' : '👎 AGAINST'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="font-medium">
                    {new Date(debate.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-2 mb-6">
              <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>

            <div className="text-center mb-6">
              {connected ? (
                <span className="inline-flex items-center text-sm text-green-600">
                  <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
                  Connected - Waiting for match
                </span>
              ) : (
                <span className="inline-flex items-center text-sm text-red-600">
                  <span className="w-2 h-2 bg-red-600 rounded-full mr-2"></span>
                  Disconnected - Reconnecting...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active/Completed debate view
  const canSubmitArgument = debate.status === 'active' && debate.arguments;
  const currentRoundArgs = debate.arguments?.filter(arg => arg.round === debate.currentRound) || [];
  const isYourTurn = canSubmitArgument && (
    (currentRoundArgs.length === 0 && debate.firstPlayer === debate.yourStance) ||
    (currentRoundArgs.length === 1 && currentRoundArgs[0].stance !== debate.yourStance)
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                {debate.topicQuestion}
              </h1>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className={`px-3 py-1 rounded-full font-medium ${
                  debate.status === 'active' ? 'bg-green-100 text-green-800' :
                  debate.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {debate.status.toUpperCase()}
                </span>
                <span className="font-medium">Round {debate.currentRound} / {debate.maxRounds}</span>
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="grid grid-cols-1 gap-4">
            <div className="border-2 border-indigo-500 rounded-lg p-4 bg-indigo-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">You</p>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  debate.yourStance === 'for'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {debate.yourStance === 'for' ? '👍 FOR' : '👎 AGAINST'}
                </span>
              </div>
              <p className="font-semibold text-lg">{user?.username}</p>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Opponent</p>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  debate.yourStance === 'for'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {debate.yourStance === 'for' ? '👎 AGAINST' : '👍 FOR'}
                </span>
              </div>
              <p className="font-semibold text-lg text-gray-400">Anonymous</p>
            </div>
          </div>
        </div>

        {/* Arguments */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Debate Arguments</h2>

          {debate.arguments && debate.arguments.length > 0 ? (
            <div className="space-y-4">
              {debate.arguments.map((arg, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg ${
                    arg.isYours
                      ? 'bg-indigo-50 border-l-4 border-indigo-500'
                      : 'bg-gray-50 border-l-4 border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        arg.stance === 'for'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {arg.stance === 'for' ? '👍 FOR' : '👎 AGAINST'}
                      </span>
                      {arg.isYours && (
                        <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-medium">
                          You
                        </span>
                      )}
                      {!arg.isYours && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-medium">
                          Opponent
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      Round {arg.round}
                    </span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">{arg.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No arguments yet. Debate will begin soon.</p>
          )}
        </div>

        {/* Early End Voting */}
        {debate.status === 'active' && debate.currentRound >= 5 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                End Debate Early
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Both participants must agree to conclude this debate early.
              </p>

              <div className="flex items-center space-x-4 mb-4">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${
                    earlyEndVotes.yourVote ? 'bg-green-500' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-sm text-gray-700">
                    You {earlyEndVotes.yourVote ? '✓' : ''}
                  </span>
                </div>
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${
                    getOpponentVoteStatus() ? 'bg-green-500' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-sm text-gray-700">
                    Opponent {getOpponentVoteStatus() ? '✓' : ''}
                  </span>
                </div>
              </div>

              {!earlyEndVotes.yourVote ? (
                <button
                  onClick={handleVoteEarlyEnd}
                  disabled={votingInProgress}
                  className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {votingInProgress ? (
                    <>
                      <Loader2 className="inline animate-spin mr-2" size={16} />
                      Recording vote...
                    </>
                  ) : (
                    'Vote to End Early'
                  )}
                </button>
              ) : (
                <div>
                  <button
                    onClick={handleRevokeEarlyEndVote}
                    className="w-full px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition font-medium mb-2"
                  >
                    Revoke Vote
                  </button>
                  <p className="text-sm text-center text-amber-600 font-medium">
                    Waiting for opponent's agreement...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Argument Input */}
        {isYourTurn && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-green-700">
                ✍️ Your Turn - Submit Your Argument
              </h3>
              <span className="text-sm text-gray-600">
                Round {debate.currentRound}
              </span>
            </div>
            <textarea
              value={argument}
              onChange={(e) => setArgument(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Enter your argument (max 500 characters)..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows={6}
              maxLength={500}
              disabled={submitting}
            />
            <div className="text-xs text-gray-500 mt-1">
              Press <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Enter</kbd> to submit,
              <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Shift+Enter</kbd> for new line
            </div>
            <div className="flex justify-between items-center mt-4">
              <span className={`text-sm ${argument.length > 450 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                {argument.length}/500 characters
              </span>
              <button
                onClick={handleSubmitArgument}
                disabled={submitting || !argument.trim()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {submitting ? (
                  <>
                    <Loader2 className="inline animate-spin mr-2" size={16} />
                    Submitting...
                  </>
                ) : (
                  'Submit Argument'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Waiting for opponent */}
        {debate.status === 'active' && !isYourTurn && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-indigo-600" size={40} />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Waiting for opponent's argument...
            </h3>
            <p className="text-gray-600 text-sm">
              Your opponent is preparing their response
            </p>
          </div>
        )}

        {/* Completed */}
        {debate.status === 'completed' && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
              <CheckCircle className="text-blue-600" size={40} />
            </div>
            <h3 className="text-2xl font-semibold text-gray-800 mb-2">
              Debate Completed!
            </h3>
            <p className="text-gray-600 mb-6">
              Thank you for participating in this debate
            </p>
            <div className="space-x-3">
              <button
                onClick={() => navigate('/participant')}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebateRoom;