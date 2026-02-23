import React, { useState, useEffect, useCallback } from 'react';
import { debateAPI } from '../../services/api';
import { useSocket } from '../../context/socketContext';
import toast from 'react-hot-toast';
import {
  Pause,
  Play,
  Zap,
  Clock,
  User,
  ChevronDown,
  XCircle,
  RefreshCw,
  Bot,
  MessageSquare,
  X,
  Download,
  Copy,
  ExternalLink
} from 'lucide-react';

const DebateManagement = () => {
  const [debates, setDebates] = useState({ waiting: [], active: [], completed: [], abandoned: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedDebate, setSelectedDebate] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showSurveyDetails, setShowSurveyDetails] = useState(false);
  const [gameMode, setGameMode] = useState('all');
  const [aiPersonality, setAiPersonality] = useState(null);
  const { socket, connected } = useSocket();

  // ✅ Memoize fetchDebates so it's stable across renders
  const fetchDebates = useCallback(async () => {
    try {
      const response = await debateAPI.getAllDebates();
      setDebates(response.data.debates);
    } catch (error) {
      console.error('Error fetching debates:', error);
      toast.error('Failed to load debates');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDebateCreated = useCallback((data) => {
    console.log('[Admin] New debate created:', data);
    fetchDebates();
  }, [fetchDebates]);

  useEffect(() => {
    fetchDebates();
  }, [fetchDebates]);

  useEffect(() => {
    if (!socket || !connected) return;

    console.log('[Admin] Setting up socket listeners');
    socket.emit('join:admin');

    socket.on('debate:created', handleDebateCreated);
    socket.on('debate:started', fetchDebates);
    socket.on('debate:completed', fetchDebates);
    socket.on('debate:argumentAdded', fetchDebates);
    socket.on('debates:cleanup', fetchDebates);

    return () => {
      console.log('[Admin] Cleaning up socket listeners');
      socket.off('debate:created', handleDebateCreated);
      socket.off('debate:started', fetchDebates);
      socket.off('debate:completed', fetchDebates);
      socket.off('debate:argumentAdded', fetchDebates);
      socket.off('debates:cleanup', fetchDebates);
    };
  }, [socket, connected, handleDebateCreated, fetchDebates]);

  const handleEndDebate = async (debateId) => {
    if (!window.confirm('End this debate early?')) return;

    try {
      await debateAPI.endDebateEarly(debateId);
      toast.success('Debate ended');
      fetchDebates();
    } catch (error) {
      toast.error('Failed to end debate');
    }
  };

  const handleToggleAI = async (debateId, aiEnabled) => {
    try {
      await debateAPI.updateAIControl(debateId, aiEnabled);
      toast.success(aiEnabled ? 'AI resumed' : 'AI paused');
      fetchDebates();
    } catch (error) {
      toast.error('Failed to update AI control');
    }
  };

  const filterDebates = (debatesList) => {
    return debatesList.filter(debate => {
      if (gameMode === 'human-human') {
        return debate.gameMode === 'human-human';
      } else if (gameMode === 'human-ai') {
        if (aiPersonality && aiPersonality !== 'all') {
          return debate.gameMode === 'human-ai' && debate.player2AIModel === aiPersonality;
        }
        return debate.gameMode === 'human-ai';
      }
      return true;
    });
  };

  const handleTriggerAI = async (debateId) => {
    try {
      await debateAPI.triggerAIResponse(debateId);
      toast.success('AI response triggered');
      fetchDebates();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to trigger AI');
    }
  };

  // View chat history
  const handleViewChatHistory = async (debateId) => {
    try {
      console.log('[Admin] Fetching chat history for:', debateId);
      const response = await debateAPI.getDebate(debateId);

      if (!response.data?.debate) {
        toast.error('Debate not found');
        return;
      }

      setSelectedDebate(response.data.debate);
      setShowChatModal(true);
    } catch (error) {
      console.error('Error fetching chat history:', error);
      toast.error(error.response?.data?.message || 'Failed to load chat history');
    }
  };

  // Export chat history as JSON
  const handleExportChat = (debate) => {
    if (!debate || !debate.arguments || debate.arguments.length === 0) {
      toast.error('No arguments to export');
      return;
    }

    try {
      const exportData = {
        debateId: debate._id,
        topic: debate.topicQuestion,
        gameMode: debate.gameMode,
        status: debate.status,
        players: {
          player1: {
            username: debate.player1UserId?.username || 'Unknown',
            stance: debate.player1Stance
          },
          player2: {
            username: debate.player2Type === 'ai'
              ? `AI (${debate.player2AIModel})`
              : (debate.player2UserId?.username || 'Unknown'),
            stance: debate.player2Stance,
            type: debate.player2Type
          }
        },
        rounds: debate.maxRounds,
        createdAt: debate.createdAt,
        completedAt: debate.completedAt,
        arguments: debate.arguments.map(arg => ({
          round: arg.round,
          stance: arg.stance,
          text: arg.text,
          submittedBy: arg.submittedBy,
          timestamp: arg.createdAt
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `debate-${debate._id}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Chat history exported');
    } catch (error) {
      console.error('Error exporting chat:', error);
      toast.error('Failed to export chat history');
    }
  };

  // Copy chat to clipboard
  const handleCopyChat = (debate) => {
    if (!debate || !debate.arguments || debate.arguments.length === 0) {
      toast.error('No arguments to copy');
      return;
    }

    try {
      let text = `Debate: ${debate.topicQuestion}\n`;
      text += `Game Mode: ${debate.gameMode}\n`;
      text += `Status: ${debate.status}\n\n`;

      text += `Players:\n`;
      text += `- ${debate.player1UserId?.username || 'Player 1'} (${debate.player1Stance})\n`;
      text += `- ${debate.player2Type === 'ai'
        ? `AI: ${debate.player2AIModel}`
        : (debate.player2UserId?.username || 'Player 2')} (${debate.player2Stance})\n\n`;

      text += `Arguments:\n`;
      text += `${'='.repeat(50)}\n\n`;

      debate.arguments.forEach((arg, index) => {
        text += `[Round ${arg.round}] ${arg.stance.toUpperCase()} (${arg.submittedBy}):\n`;
        text += `${arg.text}\n\n`;
      });

      navigator.clipboard.writeText(text);
      toast.success('Chat history copied to clipboard');
    } catch (error) {
      console.error('Error copying chat:', error);
      toast.error('Failed to copy chat history');
    }
  };

// Chat History Modal Component
const ChatHistoryModal = () => {
  if (!showChatModal || !selectedDebate) return null;

  const {
    arguments: debateArgs = [],
    preDebateSurvey = {},
    postDebateSurvey = {},
    gameMode,
    player1UserId,
    player2UserId,
    player2Type,
    player2AIModel,
    status
  } = selectedDebate;

  const isHumanAI = gameMode === 'human-ai' || player2Type === 'ai';

  // Map AI model to personality name
  const getAIPersonalityName = (aiModel) => {
    const personalityMap = {
      'firm-debater': 'Firm Debater',
      'balanced-debater': 'Balanced Debater',
      'open-debater': 'Open-Minded Debater'
    };
    return personalityMap[aiModel] || 'AI';
  };

  const aiPersonalityName = isHumanAI ? getAIPersonalityName(player2AIModel) : null;

  // Survey response labels
  const preSurveyLabels = {
    'firm_on_stance': 'Firm on Stance',
    'convinced_of_stance': 'Convinced of Stance',
    'open_to_change': 'Open to Change'
  };

  const postSurveyLabels = {
    'strengthened': 'Strengthened stance',
    'slightly_strengthened': 'Slightly strengthened',
    'no_effect': 'No effect',
    'slightly_weakened': 'Slightly weakened',
    'weakened': 'Weakened stance'
  };

  const getPostSurveyColor = (status) => {
    if (!status) return 'text-gray-600';
    if (['weakened', 'slightly_weakened'].includes(status)) return 'text-green-600';
    if (['strengthened', 'slightly_strengthened'].includes(status)) return 'text-red-600';
    return 'text-gray-600';
  };

  const confidenceLevels = {
    1: 'Not confident at all',
    2: 'Slightly confident',
    3: 'Moderately confident',
    4: 'Very confident',
    5: 'Extremely confident'
  };

  const timingLabels = {
    'before_5': 'Before round 5',
    'rounds_5_10': 'Between rounds 5-10',
    'rounds_10_15': 'Between rounds 10-15',
    'rounds_15_20': 'Between rounds 15-20',
    'never_suspected': 'I never suspected / realized only now'
  };

  const aiDetectionCuesLabels = {
    'perfect_grammar': 'Perfect grammar / no typos',
    'repetitive_phrases': 'Repetitive word use or phrases',
    'too_logical': 'Too logical / lack of emotion',
    'response_timing': 'Response timing (too fast or too consistent)',
    'no_personal_stories': 'Lack of personal stories or examples',
    'formulaic_structure': 'Formulaic argument structure',
    'other': 'Other'
  };

  const humanDetectionCuesLabels = {
    'natural_flow': 'Natural conversational flow',
    'typos_informal': 'Occasional typos or informal language',
    'emotional_tone': 'Emotional tone',
    'personal_anecdotes': 'Personal anecdotes or examples',
    'varied_styles': 'Varied argument styles',
    'unpredictable': 'Unpredictable responses',
    'other': 'Other'
  };

  const preSurveyIndex = {
    'firm_on_stance': 0,
    'convinced_of_stance': 1,
    'open_to_change': 2
  };

  const postSurveyIndex = {
    'strengthened': 0,
    'slightly_strengthened': 1,
    'no_effect': 2,
    'slightly_weakened': 3,
    'weakened': 4
  };

  const getConvictionChange = (preSurvey, postSurvey) => {
    if (!preSurvey || !postSurvey) {
      return { text: 'No data', color: 'text-gray-500', arrow: '' };
    }

    const preIndex = preSurveyIndex[preSurvey];
    const postIndex = postSurveyIndex[postSurvey];

    if (preIndex === undefined || postIndex === undefined) {
      return { text: 'Unknown', color: 'text-gray-500', arrow: '' };
    }

    const diff = postIndex - preIndex;

    if (diff > 0) {
      return { text: 'More Open', color: 'text-green-600', arrow: '↑' };
    } else if (diff < 0) {
      return { text: 'Less Open', color: 'text-red-600', arrow: '↓' };
    } else {
      return { text: 'Unchanged', color: 'text-gray-600', arrow: '→' };
    }
  };

  const getDetectionCueLabel = (cue, perception) => {
    if (perception === 'ai') {
      return aiDetectionCuesLabels[cue] || cue.replace(/_/g, ' ');
    } else if (perception === 'human') {
      return humanDetectionCuesLabels[cue] || cue.replace(/_/g, ' ');
    }
    return cue.replace(/_/g, ' ');
  };

  const getArgumentAuthor = (arg) => {
    if (arg.submittedBy === 'ai') {
      return {
        name: aiPersonalityName || 'AI',
        type: 'ai',
        icon: <Bot size={14} className="mr-1" />
      };
    }

    if (arg.stance === selectedDebate.player1Stance) {
      return {
        name: player1UserId?.username || 'Player 1',
        type: 'human',
        icon: <User size={14} className="mr-1" />
      };
    } else {
      return {
        name: player2UserId?.username || 'Player 2',
        type: 'human',
        icon: <User size={14} className="mr-1" />
      };
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h2 className="text-2xl font-bold text-gray-800">
                Chat History
              </h2>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                isHumanAI
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {isHumanAI ? '🤖 Human vs AI' : '👥 Human vs Human'}
              </span>
              {isHumanAI && aiPersonalityName && (
                <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                  {aiPersonalityName}
                </span>
              )}
            </div>
            <p className="text-gray-600 text-sm">
              {selectedDebate.topicQuestion}
            </p>
            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
              <span>
                Created: {new Date(selectedDebate.createdAt).toLocaleString()}
              </span>
              {selectedDebate.completedAt && (
                <span>
                  Completed: {new Date(selectedDebate.completedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              setShowChatModal(false);
              setSelectedDebate(null);
            }}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Survey Responses Section - COMPACT */}
        {status === 'completed' && (
          <div className="px-6 py-3 bg-gray-50 border-b">
            <button
              onClick={() => setShowSurveyDetails(!showSurveyDetails)}
              className="flex items-center justify-between w-full mb-2"
            >
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center">
                Survey Responses
                <ChevronDown
                  size={16}
                  className={`ml-2 transition-transform ${showSurveyDetails ? 'rotate-180' : ''}`}
                />
              </h3>
              <span className="text-xs text-gray-500">
                {showSurveyDetails ? 'Hide' : 'Show'} details
              </span>
            </button>

            {/* Compact Summary Bar - Always Visible */}
            <div className="grid grid-cols-2 gap-3">
              {/* Player 1 Summary */}
              <div className="bg-white rounded-lg px-3 py-2 shadow-sm flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <User size={14} className="text-gray-600" />
                  <span className="font-semibold text-xs text-gray-800">
                    {player1UserId?.username || 'Player 1'}
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  {preDebateSurvey.player1 && postDebateSurvey.player1 && (
                    <span className={`text-sm font-bold ${getConvictionChange(preDebateSurvey.player1, postDebateSurvey.player1).color}`}>
                      {getConvictionChange(preDebateSurvey.player1, postDebateSurvey.player1).arrow}
                    </span>
                  )}
                  <span className={`text-xs font-medium ${getPostSurveyColor(postDebateSurvey.player1)}`}>
                    {postDebateSurvey.player1 ? (
                      postSurveyLabels[postDebateSurvey.player1]?.split(' ')[0] || 'N/A'
                    ) : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Player 2/AI Summary */}
              <div className="bg-white rounded-lg px-3 py-2 shadow-sm flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isHumanAI ? (
                    <Bot size={14} className="text-purple-600" />
                  ) : (
                    <User size={14} className="text-gray-600" />
                  )}
                  <span className="font-semibold text-xs text-gray-800">
                    {isHumanAI ? aiPersonalityName : (player2UserId?.username || 'Player 2')}
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  {preDebateSurvey.player2 && postDebateSurvey.player2 && (
                    <span className={`text-sm font-bold ${getConvictionChange(preDebateSurvey.player2, postDebateSurvey.player2).color}`}>
                      {getConvictionChange(preDebateSurvey.player2, postDebateSurvey.player2).arrow}
                    </span>
                  )}
                  <span className={`text-xs font-medium ${getPostSurveyColor(postDebateSurvey.player2)}`}>
                    {postDebateSurvey.player2 ? (
                      postSurveyLabels[postDebateSurvey.player2]?.split(' ')[0] || 'N/A'
                    ) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Expandable Detailed View */}
            {showSurveyDetails && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {/* Player 1 Details */}
                <div className="bg-white rounded-lg px-3 py-2 shadow-sm space-y-2 text-xs">
                  {preDebateSurvey.player1 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Before:</span>
                      <span className="text-blue-700 font-medium">
                        {preSurveyLabels[preDebateSurvey.player1]}
                      </span>
                    </div>
                  )}

                  {postDebateSurvey.player1 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">After:</span>
                      <span className="text-purple-700 font-medium">
                        {postSurveyLabels[postDebateSurvey.player1]}
                      </span>
                    </div>
                  )}

                  {postDebateSurvey.player1StanceStrength && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Stance strength:</span>
                      <span className="text-indigo-700 font-medium">
                        {postDebateSurvey.player1StanceStrength}/7
                      </span>
                    </div>
                  )}
                  {postDebateSurvey.player1StanceConfidence && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Stance confidence:</span>
                      <span className="text-indigo-700 font-medium">
                        {postDebateSurvey.player1StanceConfidence}/7
                      </span>
                    </div>
                  )}

                  {postDebateSurvey.player1OpponentPerception && (
                    <div className="pt-2 border-t border-gray-100 space-y-1">
                          <div className="flex justify-between">
                        <span className="text-gray-500">Perceived as:</span>
                        <span className={`font-medium ${
                          postDebateSurvey.player1OpponentPerception === 'ai' ? 'text-purple-600' : (postDebateSurvey.player1OpponentPerception === 'human' ? 'text-blue-600' : 'text-gray-600')
                        }`}>
                          {postDebateSurvey.player1OpponentPerception === 'ai' ? '🤖 AI' : (postDebateSurvey.player1OpponentPerception === 'human' ? '👤 Human' : '❓ Unsure')}
                        </span>
                      </div>
                      {postDebateSurvey.player1PerceptionConfidence && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Confidence:</span>
                          <span className="text-green-700 font-medium">
                            {postDebateSurvey.player1PerceptionConfidence}/5
                          </span>
                        </div>
                      )}
                      {postDebateSurvey.player1SuspicionTiming && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">When:</span>
                          <span className="text-blue-700 font-medium text-right">
                            {timingLabels[postDebateSurvey.player1SuspicionTiming]?.replace('Between ', '') || postDebateSurvey.player1SuspicionTiming}
                          </span>
                        </div>
                      )}
                      {postDebateSurvey.player1DetectionCues && postDebateSurvey.player1DetectionCues.length > 0 && (
                        <div className="pt-1">
                          <span className="text-gray-500 block mb-1">Cues:</span>
                          <div className="flex flex-wrap gap-1">
                            {postDebateSurvey.player1DetectionCues.slice(0, 3).map((cue, idx) => (
                              <span key={idx} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                {getDetectionCueLabel(cue, postDebateSurvey.player1OpponentPerception)}
                              </span>
                            ))}
                            {postDebateSurvey.player1DetectionCues.length > 3 && (
                              <span className="text-xs text-gray-500">+{postDebateSurvey.player1DetectionCues.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Player 2/AI Details */}
                <div className="bg-white rounded-lg px-3 py-2 shadow-sm space-y-2 text-xs">
                  {isHumanAI ? (
                    // AI Details
                    <>
                      {preDebateSurvey.player2 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Before:</span>
                          <span className="text-blue-700 font-medium">
                            {preSurveyLabels[preDebateSurvey.player2]}
                          </span>
                        </div>
                      )}

                      {postDebateSurvey.player2 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">After:</span>
                          <span className="text-purple-700 font-medium">
                            {postSurveyLabels[postDebateSurvey.player2]}
                          </span>
                        </div>
                      )}

                      {postDebateSurvey.player2StanceStrength && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Stance strength:</span>
                          <span className="text-indigo-700 font-medium">
                            {postDebateSurvey.player2StanceStrength}/7
                          </span>
                        </div>
                      )}
                      {postDebateSurvey.player2StanceConfidence && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Stance confidence:</span>
                          <span className="text-indigo-700 font-medium">
                            {postDebateSurvey.player2StanceConfidence}/7
                          </span>
                        </div>
                      )}

                      {postDebateSurvey.aiResponse && (
                        <div className="pt-2 border-t border-gray-100">
                          <span className="text-gray-500 block mb-1">Reflection:</span>
                          <p className="text-gray-600 italic line-clamp-3">
                            "{postDebateSurvey.aiResponse}"
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Human Player 2 Details
                    <>
                      {preDebateSurvey.player2 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Before:</span>
                          <span className="text-blue-700 font-medium">
                            {preSurveyLabels[preDebateSurvey.player2]}
                          </span>
                        </div>
                      )}

                      {postDebateSurvey.player2 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">After:</span>
                          <span className="text-purple-700 font-medium">
                            {postSurveyLabels[postDebateSurvey.player2]}
                          </span>
                        </div>
                      )}

                      {postDebateSurvey.player2StanceStrength && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Stance strength:</span>
                          <span className="text-indigo-700 font-medium">
                            {postDebateSurvey.player2StanceStrength}/7
                          </span>
                        </div>
                      )}
                      {postDebateSurvey.player2StanceConfidence && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Stance confidence:</span>
                          <span className="text-indigo-700 font-medium">
                            {postDebateSurvey.player2StanceConfidence}/7
                          </span>
                        </div>
                      )}

                      {postDebateSurvey.player2OpponentPerception && (
                        <div className="pt-2 border-t border-gray-100 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Perceived as:</span>
                            <span className={`font-medium ${
                              postDebateSurvey.player2OpponentPerception === 'ai' ? 'text-purple-600' : (postDebateSurvey.player2OpponentPerception === 'human' ? 'text-blue-600' : 'text-gray-600')
                            }`}>
                              {postDebateSurvey.player2OpponentPerception === 'ai' ? '🤖 AI' : (postDebateSurvey.player2OpponentPerception === 'human' ? '👤 Human' : '❓ Unsure')}
                            </span>
                          </div>
                          {postDebateSurvey.player2PerceptionConfidence && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Confidence:</span>
                              <span className="text-green-700 font-medium">
                                {postDebateSurvey.player2PerceptionConfidence}/5
                              </span>
                            </div>
                          )}
                          {postDebateSurvey.player2SuspicionTiming && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">When:</span>
                              <span className="text-blue-700 font-medium text-right">
                                {timingLabels[postDebateSurvey.player2SuspicionTiming]?.replace('Between ', '') || postDebateSurvey.player2SuspicionTiming}
                              </span>
                            </div>
                          )}
                          {postDebateSurvey.player2DetectionCues && postDebateSurvey.player2DetectionCues.length > 0 && (
                            <div className="pt-1">
                              <span className="text-gray-500 block mb-1">Cues:</span>
                              <div className="flex flex-wrap gap-1">
                                {postDebateSurvey.player2DetectionCues.slice(0, 3).map((cue, idx) => (
                                  <span key={idx} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                    {getDetectionCueLabel(cue, postDebateSurvey.player2OpponentPerception).split(' ')[0]}
                                  </span>
                                ))}
                                {postDebateSurvey.player2DetectionCues.length > 3 && (
                                  <span className="text-xs text-gray-500">+{postDebateSurvey.player2DetectionCues.length - 3}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Arguments List */}
        <div className="flex-1 overflow-y-auto p-6">
          {debateArgs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No arguments in this debate
            </div>
          ) : (
            <div className="space-y-4">
              {debateArgs.map((arg, index) => {
                const author = getArgumentAuthor(arg);

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-l-4 ${
                      arg.stance === 'for'
                        ? 'bg-green-50 border-green-500'
                        : 'bg-red-50 border-red-500'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          arg.stance === 'for'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                            {arg.stance === 'for' ? 'Leaning for' : 'Leaning against'}
                        </span>
                        <span className="text-xs text-gray-600">
                          Round {arg.round}
                        </span>
                        <span className={`flex items-center text-xs font-medium ${
                          author.type === 'ai' ? 'text-purple-600' : 'text-blue-600'
                        }`}>
                          {author.icon}
                          {author.name}
                        </span>
                      </div>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">
                      {arg.text}
                    </p>
                    {arg.createdAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(arg.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {debateArgs.length} argument{debateArgs.length !== 1 ? 's' : ''} total
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => handleCopyChat(selectedDebate)}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition text-sm"
            >
              <Copy size={16} className="mr-2" />
              Copy
            </button>
            <button
              onClick={() => handleExportChat(selectedDebate)}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
            >
              <Download size={16} className="mr-2" />
              Export JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};




  const renderDebateCard = (debate) => (
    <div key={debate._id} className="bg-white rounded-lg shadow-md p-6 border-l-4 border-indigo-500">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            {debate.topicQuestion}
          </h3>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              debate.gameMode === 'human-ai'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {debate.gameMode === 'human-human' ? '👥 Human vs Human' : '🤖 Human vs AI'}
            </span>

            {debate.player2Type === 'ai' && debate.player2AIModel && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                {debate.player2AIModel}
              </span>
            )}

            <span className="flex items-center">
              <Clock size={14} className="mr-1" />
              {new Date(debate.createdAt).toLocaleString()}
            </span>

            {debate.status === 'active' && (
              <span className="flex items-center">
                Round {debate.currentRound} / {debate.maxRounds}
              </span>
            )}
          </div>
        </div>

        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          debate.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' :
          debate.status === 'active' ? 'bg-green-100 text-green-800' :
          debate.status === 'completed' ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {debate.status.toUpperCase()}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Players:</p>
        <div className="flex space-x-4">
          <div className="flex items-center">
            <span className={`px-2 py-1 rounded text-xs ${
              debate.player1Stance === 'for' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {debate.player1Stance === 'for' ? '👍 FOR' : '👎 AGAINST'}
            </span>
            <span className="ml-2">{debate.player1UserId?.username || 'Player 1'}</span>
          </div>

          {debate.player2Type === 'ai' ? (
            <div className="flex items-center">
              <span className={`px-2 py-1 rounded text-xs ${
                debate.player2Stance === 'for' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {debate.player2Stance === 'for' ? '👍 FOR' : '👎 AGAINST'}
              </span>
              <span className="ml-2 flex items-center">
                <Bot size={14} className="mr-1" />
                {debate.player2AIModel}
              </span>
            </div>
          ) : debate.player2UserId ? (
            <div className="flex items-center">
              <span className={`px-2 py-1 rounded text-xs ${
                debate.player2Stance === 'for' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {debate.player2Stance === 'for' ? '👍 FOR' : '👎 AGAINST'}
              </span>
              <span className="ml-2">{debate.player2UserId?.username || 'Player 2'}</span>
            </div>
          ) : (
            <span className="text-gray-400 italic">Waiting for opponent...</span>
          )}
        </div>
      </div>

      {debate.arguments && debate.arguments.length > 0 && (
        <div className="text-sm text-gray-600 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="font-medium text-blue-900">📊 {debate.arguments.length} argument{debate.arguments.length !== 1 ? 's' : ''} submitted</p>
          <p className="text-xs text-blue-700 mt-1">Across {Math.ceil(debate.arguments.length / 2)} round{Math.ceil(debate.arguments.length / 2) !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* AI Controls - Only for active AI debates */}
        {debate.status === 'active' && debate.player2Type === 'ai' && (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleToggleAI(debate._id, !debate.aiEnabled)}
              className={`flex items-center px-4 py-2 rounded-lg transition text-sm ${
                debate.aiEnabled
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {debate.aiEnabled ? (
                <>
                  <Pause size={16} className="mr-2" />
                  Pause AI
                </>
              ) : (
                <>
                  <Play size={16} className="mr-2" />
                  Resume AI
                </>
              )}
            </button>

            <button
              onClick={() => handleTriggerAI(debate._id)}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
            >
              <Zap size={16} className="mr-2" />
              Trigger AI Now
            </button>
          </div>
        )}

        {/* View Chat History - For completed debates */}
        {(debate.status === 'completed' || debate.status === 'abandoned') &&
         debate.arguments && debate.arguments.length > 0 && (
          <button
            onClick={() => handleViewChatHistory(debate._id)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            <MessageSquare size={16} className="mr-2" />
            View Chat History
          </button>
        )}

        {/* End Debate - Only for active debates */}
        {debate.status === 'active' && (
          <button
            onClick={() => handleEndDebate(debate._id)}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
          >
            <XCircle size={16} className="mr-2" />
            End Early
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Debate Management</h2>
        <div className="flex items-center space-x-3">
          {connected ? (
            <span className="text-sm text-green-600 flex items-center">
              <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
              Live
            </span>
          ) : (
            <span className="text-sm text-red-600">Disconnected</span>
          )}
          <button
            onClick={fetchDebates}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-gray-200">
        {['waiting', 'active', 'completed', 'abandoned'].map(tab => {
          const filteredCount = filterDebates(debates[tab]).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium transition capitalize ${
                activeTab === tab
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab} ({filteredCount})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-gray-50 p-4 rounded-lg space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Game Mode</label>
          <div className="flex space-x-3">
            {['all', 'human-human', 'human-ai'].map(mode => (
              <button
                key={mode}
                onClick={() => {
                  setGameMode(mode);
                  if (mode !== 'human-ai') {
                    setAiPersonality(null);
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  gameMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                {mode === 'all' ? 'All' : mode === 'human-human' ? '👥 Human vs Human' : '🤖 Human vs AI'}
              </button>
            ))}
          </div>
        </div>

        {gameMode === 'human-ai' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Personality</label>
            <div className="flex space-x-3">
              {['all', 'firm-debater', 'balanced-debater', 'open-debater'].map(personality => (
                <button
                  key={personality}
                  onClick={() => setAiPersonality(personality)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    (aiPersonality || 'all') === personality
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {personality === 'all' ? 'All' : personality.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Debate List */}
      <div className="space-y-4">
        {(() => {
          const filteredDebates = filterDebates(debates[activeTab]);
          if (filteredDebates.length === 0) {
            return (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <p className="text-gray-500">No {activeTab} debates matching filters</p>
              </div>
            );
          }
          return filteredDebates.map(renderDebateCard);
        })()}
      </div>

      {/* Chat History Modal */}
      <ChatHistoryModal />
    </div>
  );
};

export default DebateManagement;
