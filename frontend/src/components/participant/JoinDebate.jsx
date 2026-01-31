import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { debateAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { Loader2, AlertCircle, X } from 'lucide-react';

const JoinDebate = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedStance, setSelectedStance] = useState('');
  const [gameMode, setGameMode] = useState('human-human');
  const [loading, setLoading] = useState(false);
  const [existingDebate, setExistingDebate] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [preSurveyAnswer, setPreSurveyAnswer] = useState('');


  useEffect(() => {
    fetchTopics();
    checkExistingDebate();
  }, []);

  const fetchTopics = async () => {
    try {
      const response = await debateAPI.getTopics();
      setTopics(response.data.topics);
    } catch (error) {
      toast.error('Failed to load topics');
    }
  };

  // Check if user already has a waiting/active debate
  const checkExistingDebate = async () => {
  try {
    setCheckingStatus(true);
    const response = await debateAPI.getMyStatus();

    if (response.data.hasDebate) {
      setExistingDebate(response.data.debate);
    }
  } catch (error) {
    console.error('[JoinDebate] Error checking status:', error);
  } finally {
    setCheckingStatus(false);
  }
};


  const handleCancelDebate = async () => {
    if (!existingDebate) return;

    if (!window.confirm('Cancel this waiting debate?')) return;

    try {
      setLoading(true);
      await debateAPI.cancelDebate(existingDebate._id);
      toast.success('Debate cancelled');
      setExistingDebate(null);
    } catch (error) {
      console.error('Error cancelling debate:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel debate');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinExisting = () => {
    if (existingDebate) {
      navigate(`/participant/debate/${existingDebate._id}`);
    }
  };

  const handleJoinDebate = async () => {
    if (!selectedTopic || !selectedStance) {
      toast.error('Please select a topic and stance');
      return;
    }

    if (!preSurveyAnswer) {
      toast.error('Please complete the pre-debate question');
      return;
    }

    try {
      setLoading(true);

      const response = await debateAPI.joinDebate({
        gameMode,
        topicId: selectedTopic,
        stance: selectedStance,
        preDebateSurvey: {
          player1: preSurveyAnswer,
        },
      });

      toast.success(response.data.message);
      navigate(`/participant/debate/${response.data.debateId}`);
    } catch (error) {
      console.error('Error joining debate:', error);
      toast.error(error.response?.data?.message || 'Failed to join debate');
    } finally {
      setLoading(false);
    }
  };


  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  // Show existing debate warning
  if (existingDebate) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-lg shadow-md">
            <div className="flex items-start">
              <AlertCircle className="text-yellow-400 mr-3 flex-shrink-0" size={24} />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                  You Already Have a Debate
                </h2>
                <p className="text-gray-700 mb-4">
                  You have a {existingDebate.status} debate. You must complete or cancel it before joining a new one.
                </p>

                <div className="bg-white border rounded-lg p-4 mb-4">
                  <h3 className="font-semibold mb-2">{existingDebate.topicQuestion}</h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      existingDebate.status === 'waiting'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {existingDebate.status.toUpperCase()}
                    </span>
                    <span>Your stance: {existingDebate.yourStance}</span>
                    {existingDebate.status === 'active' && (
                      <span>Round {existingDebate.currentRound}/{existingDebate.maxRounds}</span>
                    )}
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={handleJoinExisting}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                  >
                    {existingDebate.status === 'waiting' ? 'Go to Waiting Room' : 'Continue Debate'}
                  </button>

                  {existingDebate.status === 'waiting' && (
                    <button
                      onClick={handleCancelDebate}
                      disabled={loading}
                      className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="animate-spin mr-2" size={16} />
                      ) : (
                        <X size={16} className="mr-2" />
                      )}
                      Cancel Debate
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normal join form
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Join a Debate</h1>


          {/* Topic Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Choose a topic...</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.question}
                </option>
              ))}
            </select>
          </div>

          {/* Stance Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Stance
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedStance('for')}
                className={`p-4 border-2 rounded-lg transition ${
                  selectedStance === 'for'
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-2xl mb-2">👍</div>
                <div className="font-semibold text-green-800">For</div>
              </button>

              <button
                onClick={() => setSelectedStance('against')}
                className={`p-4 border-2 rounded-lg transition ${
                  selectedStance === 'against'
                    ? 'border-red-600 bg-red-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-2xl mb-2">👎</div>
                <div className="font-semibold text-red-800">Against</div>
              </button>
            </div>
          </div>

          {/* Pre-Debate Survey */}
          <div className="mt-6 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Before you debate
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Tell us how you currently feel about your stance on this topic. This is required before we find you a match.
            </p>

            <div className="space-y-3">
              {[
                {
                  value: 'firm_on_stance',
                  label: 'I am firm on my stance.',
                  description: 'I have strong conviction in my position.'
                },
                {
                  value: 'convinced_of_stance',
                  label: 'I am convinced of my stance.',
                  description: 'I believe my position is correct.'
                },
                {
                  value: 'open_to_change',
                  label: 'I am open to changing my mind about this.',
                  description: 'I am willing to reconsider my position.'
                }
              ].map(option => (
                <label
                  key={option.value}
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                    preSurveyAnswer === option.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-start">
                    <input
                      type="radio"
                      name="preSurvey"
                      value={option.value}
                      checked={preSurveyAnswer === option.value}
                      onChange={e => setPreSurveyAnswer(e.target.value)}
                      className="mt-1 mr-3"
                    />
                    <div>
                      <div className="font-medium text-gray-800">{option.label}</div>
                      <div className="text-sm text-gray-600 mt-1">{option.description}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleJoinDebate}
            disabled={!selectedTopic || !selectedStance || !preSurveyAnswer || loading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin mr-2" size={20} />
                Joining...
              </>
            ) : (
              'Join Debate'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinDebate;
