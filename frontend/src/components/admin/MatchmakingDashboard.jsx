import React, { useState, useEffect } from 'react';
import { debateAPI } from '../../services/api';
import { useSocket } from '../../context/socketContext';
import toast from 'react-hot-toast';
import { Users, Bot, Clock, AlertCircle, Edit3, Zap, Pause, Play } from 'lucide-react';

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
  const { socket, connected } = useSocket();

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

  const handleAISelect = async (aiModel) => {
    setSelectedAI(aiModel);
    try {
      const response = await debateAPI.getAIPersonalityDetails(aiModel);
      setDefaultPrompt(response.data.defaultPrompt);
      setCustomPrompt(''); // Reset custom prompt when switching AI
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

      const response = await debateAPI.matchDebateWithAI(debateId, {
        aiModel: selectedAI,
        customPrompt: customPrompt.trim() || null,
        responseDelay
      });

      toast.success('✅ AI opponent matched!');
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Matchmaking Dashboard</h2>
          <p className="text-gray-600 mt-1">Match waiting debates with AI opponents</p>
        </div>
        <div className="text-sm text-gray-600">
          {waitingDebates.length} debate{waitingDebates.length !== 1 ? 's' : ''} waiting
        </div>
      </div>

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
              <p className="text-xs text-gray-500 text-center mt-1 capitalize">
                {ai.difficulty} difficulty
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
          {waitingDebates.map(debate => (
            <div key={debate._id} className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
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
                      {debate.player1Stance === 'for' ? '👍 FOR' : '👎 AGAINST'}
                    </span>
                    <span className="flex items-center">
                      <Clock size={14} className="mr-1" />
                      Waiting: {getWaitingTime(debate.createdAt)}
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
          ))}
        </div>
      )}

      {/* Prompt Editor Modal */}
      {showPromptEditor && selectedDebate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800">AI Prompt Engineering</h3>
                  <p className="text-gray-600 mt-1">{selectedDebate.topicQuestion}</p>
                </div>
                <button
                  onClick={() => setShowPromptEditor(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* AI Model Selection */}
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
                          : 'border-gray-300'
                      }`}
                    >
                      <p className="font-semibold text-sm">{ai.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{ai.difficulty}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Response Delay */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  AI Response Delay (seconds)
                </label>
                <input
                  type="number"
                  value={responseDelay}
                  onChange={(e) => setResponseDelay(parseInt(e.target.value))}
                  min={3}
                  max={30}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How long AI waits before responding (3-30 seconds)
                </p>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Custom System Prompt (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Enter custom instructions for the AI, or leave empty to use default..."
                  className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm resize-none"
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">
                    Use placeholders: {'{TOPIC}'}, {'{STANCE}'}, {'{OPPONENT_ARGUMENT}'}, etc.
                  </p>
                  <button
                    onClick={() => setCustomPrompt(defaultPrompt)}
                    className="text-xs text-indigo-600 hover:text-indigo-700"
                  >
                    Load Default Prompt
                  </button>
                </div>
              </div>

              {/* Debate Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-2">Debate Context</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <p><strong>Topic:</strong> {selectedDebate.topicQuestion}</p>
                  <p><strong>Human Player:</strong> {selectedDebate.player1UserId?.username}</p>
                  <p><strong>Human Stance:</strong> {selectedDebate.player1Stance.toUpperCase()}</p>
                  <p><strong>AI Stance:</strong> {selectedDebate.player1Stance === 'for' ? 'AGAINST' : 'FOR'}</p>
                  <p><strong>Rounds:</strong> {selectedDebate.maxRounds}</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowPromptEditor(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMatchWithAI(selectedDebate._id)}
                disabled={loading || !selectedAI}
                className="flex items-center space-x-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Matching...</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    <span>Match & Start Debate</span>
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
