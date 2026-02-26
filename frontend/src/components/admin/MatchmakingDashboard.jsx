import React, { useState, useEffect } from 'react';
import { debateAPI } from '../../services/api';
import { useSocket } from '../../context/socketContext';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { Users, Bot, Clock, AlertCircle, Edit3, Zap, Pause, Play, Shield } from 'lucide-react';

const MatchmakingDashboard = () => {
  const [waitingDebates, setWaitingDebates] = useState([]);
  const [aiPersonalities, setAIPersonalities] = useState([]);
  const [selectedDebate, setSelectedDebate] = useState(null);
  const [selectedAI, setSelectedAI] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [responseDelay, setResponseDelay] = useState(10);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true);
  const { socket, connected } = useSocket();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchWaitingDebates();
    fetchAIPersonalities();

    if (socket && connected) {
      socket.on('debate:created', fetchWaitingDebates);
      socket.on('debate:started', fetchWaitingDebates);

      return () => {
        socket.off('debate:created');
        socket.off('debate:started');
      };
    }
  }, [socket, connected]);

  // Auto-assignment timer
  useEffect(() => {
    if (!autoAssignEnabled || !isAdmin) return;

    const interval = setInterval(() => {
      checkAndAutoAssign();
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [waitingDebates, autoAssignEnabled, selectedAI, isAdmin]);

  const fetchWaitingDebates = async () => {
    try {
      const response = await debateAPI.getAllDebates();
      setWaitingDebates(response.data.debates.waiting || []);
    } catch (error) {
      console.error('Error fetching debates:', error);
    }
  };

  const fetchAIPersonalities = async () => {
    try {
      const response = await debateAPI.getAIPersonalities();
      setAIPersonalities(response.data.personalities);
      if (response.data.personalities.length > 0) {
        setSelectedAI(response.data.personalities[0].id);
      }
    } catch (error) {
      console.error('Error fetching AI personalities:', error);
      toast.error('Failed to load AI personalities');
    }
  };

  const checkAndAutoAssign = async () => {
    if (!selectedAI || waitingDebates.length === 0) return;

    const now = new Date();
    const debatesToAutoAssign = waitingDebates.filter(debate => {
      const waitingTime = (now - new Date(debate.createdAt)) / 60000; // minutes
      return waitingTime >= 1;
    });

    for (const debate of debatesToAutoAssign) {
      console.log(`[Auto-Assign] Matching debate ${debate._id} after 1 min wait`);
      try {
        await debateAPI.matchDebateWithAI(debate._id, {
          aiModel: selectedAI,
          customPrompt: null,
          responseDelay: 10
        });
        toast.success(`🤖 Auto-matched: ${debate.topicQuestion.substring(0, 40)}...`);
        fetchWaitingDebates();
      } catch (error) {
        console.error('[Auto-Assign] Error:', error);
      }
    }
  };

  const handleAISelect = async (aiModel) => {
    setSelectedAI(aiModel);
    try {
      const response = await debateAPI.getAIPersonalityDetails(aiModel);
      setDefaultPrompt(response.data.defaultPrompt);
      setCustomPrompt('');
    } catch (error) {
      console.error('Error fetching AI details:', error);
    }
  };

  const handleMatchWithAI = async (debateId) => {
    if (!selectedAI) {
      toast.error('Please select an AI personality');
      return;
    }

    setLoading(true);
    try {
      console.log('[Matchmaking] Matching debate with AI:', {
        debateId,
        aiModel: selectedAI,
        hasCustomPrompt: !!customPrompt.trim(),
        responseDelay
      });

      await debateAPI.matchDebateWithAI(debateId, {
        aiModel: selectedAI,
        customPrompt: customPrompt.trim() || null,
        responseDelay
      });

      toast.success(' AI opponent matched!');
      setShowPromptEditor(false);
      setSelectedDebate(null);
      setCustomPrompt('');
      fetchWaitingDebates();
    } catch (error) {
      console.error('[Matchmaking] Error:', error);
      toast.error(error.response?.data?.message || 'Failed to match AI');
    } finally {
      setLoading(false);
    }
  };

  const openPromptEditor = (debate) => {
    setSelectedDebate(debate);
    setShowPromptEditor(true);
    if (!customPrompt && defaultPrompt) {
      setCustomPrompt(defaultPrompt);
    }
  };

  const getWaitingTime = (createdAt) => {
    const minutes = Math.floor((new Date() - new Date(createdAt)) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute';
    return `${minutes} minutes`;
  };

  const isNearAutoAssign = (createdAt) => {
    const seconds = Math.floor((new Date() - new Date(createdAt)) / 1000);
    return seconds >= 45 && seconds < 60; // 45-60 seconds = warning
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Matchmaking Dashboard</h2>
          <p className="text-gray-600 mt-1">Match waiting debates with AI opponents</p>
        </div>
        <div className="flex items-center space-x-4">
          {isAdmin && (
            <button
              onClick={() => setAutoAssignEnabled(!autoAssignEnabled)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
                autoAssignEnabled
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Shield size={18} />
              {autoAssignEnabled ? <Play size={16} /> : <Pause size={16} />}
              <span className="text-sm font-semibold">
                Auto-Assign: {autoAssignEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          )}
          <div className="text-sm text-gray-600">
            {waitingDebates.length} debate{waitingDebates.length !== 1 ? 's' : ''} waiting
          </div>
        </div>
      </div>

      {/* Auto-Assign Status Banner */}
      {isAdmin && autoAssignEnabled && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Bot className="text-blue-600 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-semibold text-blue-800">
                Auto-Assignment Active
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Debates waiting over 1 minute will automatically match with{' '}
                <strong>{aiPersonalities.find(ai => ai.id === selectedAI)?.name || 'selected AI'}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Personality Selector */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Select AI Personality</h3>
        <div className="grid grid-cols-3 gap-4">
          {aiPersonalities.map(ai => (
            <button
              key={ai.id}
              onClick={() => handleAISelect(ai.id)}
              className={`p-4 rounded-lg border-2 transition ${
                selectedAI === ai.id
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-gray-300 hover:border-indigo-300'
              }`}
            >
              <Bot className="mx-auto mb-2" size={32} />
              <p className="font-semibold text-center">{ai.name}</p>
              <p className="text-xs text-gray-500 text-center mt-2 leading-relaxed">
                {ai.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Waiting Debates */}
      {waitingDebates.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <AlertCircle size={48} className="text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No debates waiting for opponents</p>
        </div>
      ) : (
        <div className="space-y-4">
          {waitingDebates.map(debate => {
            const waitingMinutes = Math.floor((new Date() - new Date(debate.createdAt)) / 60000);
            const nearAutoAssign = isNearAutoAssign(debate.createdAt);
            const pastAutoAssign = waitingMinutes >= 1;

            return (
              <div
                key={debate._id}
                className={`bg-white rounded-xl shadow-md p-6 border-l-4 transition ${
                  pastAutoAssign && autoAssignEnabled
                    ? 'border-red-500 animate-pulse'
                    : nearAutoAssign && autoAssignEnabled
                    ? 'border-orange-500'
                    : 'border-yellow-500'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      {debate.topicQuestion}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className="flex items-center">
                        <Users size={14} className="mr-1" />
                        {debate.player1UserId?.username || 'User'}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        debate.player1Stance === 'for'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {debate.player1Stance === 'for' ? '👍 Leaning for' : '👎 Leaning against'}
                      </span>
                      <span className={`flex items-center ${
                        pastAutoAssign && autoAssignEnabled ? 'text-red-600 font-semibold' : ''
                      }`}>
                        <Clock size={14} className="mr-1" />
                        Waiting: {getWaitingTime(debate.createdAt)}
                        {pastAutoAssign && autoAssignEnabled && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            AUTO-ASSIGNING
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleMatchWithAI(debate._id)}
                    disabled={loading || !selectedAI}
                    className="flex items-center space-x-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition"
                  >
                    <Zap size={16} />
                    <span>Quick Match with {aiPersonalities.find(ai => ai.id === selectedAI)?.name}</span>
                  </button>

                  <button
                    onClick={() => openPromptEditor(debate)}
                    className="flex items-center space-x-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
                  >
                    <Edit3 size={16} />
                    <span>Custom Prompt</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Prompt Editor Modal */}
{showPromptEditor && selectedDebate && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-800">Custom AI Prompt</h3>
            <p className="text-sm text-gray-600 mt-1">
              {selectedDebate.topicQuestion}
            </p>
          </div>
          <button
            onClick={() => {
              setShowPromptEditor(false);
              setSelectedDebate(null);
              setCustomPrompt('');
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* AI Personality Selector in Modal */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            AI Personality
          </label>
          <div className="grid grid-cols-3 gap-3">
            {aiPersonalities.map(ai => (
              <button
                key={ai.id}
                onClick={() => handleAISelect(ai.id)}
                className={`p-3 rounded-lg border-2 transition ${
                  selectedAI === ai.id
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-300 hover:border-indigo-300'
                }`}
              >
                <Bot className="mx-auto mb-1" size={24} />
                <p className="font-semibold text-sm text-center">{ai.name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Response Delay */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Response Delay: {responseDelay} seconds
          </label>
          <input
            type="range"
            min="7"
            max="30"
            value={responseDelay}
            onChange={(e) => setResponseDelay(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            Time AI waits before responding (7-30 seconds)
          </p>
        </div>

        {/* Default Prompt Preview */}
        {defaultPrompt && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Default Prompt Preview
            </label>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 max-h-48 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {defaultPrompt}
              </pre>
            </div>
          </div>
        )}

        {/* Custom Prompt Editor */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Custom Prompt (Optional)
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Leave empty to use default prompt, or write your custom instructions..."
            className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-2">
            Use placeholders: {'{TOPIC}'}, {'{STANCE}'}, {'{CURRENT_ROUND}'}, {'{MAX_ROUNDS}'}, {'{DEBATE_HISTORY}'}, {'{OPPONENT_ARGUMENT}'}
          </p>
        </div>
      </div>

      {/* Modal Actions */}
      <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
        <button
          onClick={() => {
            setShowPromptEditor(false);
            setSelectedDebate(null);
            setCustomPrompt('');
          }}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          onClick={() => handleMatchWithAI(selectedDebate._id)}
          disabled={loading || !selectedAI}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition flex items-center space-x-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Matching...</span>
            </>
          ) : (
            <>
              <Zap size={16} />
              <span>Match with AI</span>
            </>
          )}
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
};

export default MatchmakingDashboard;
