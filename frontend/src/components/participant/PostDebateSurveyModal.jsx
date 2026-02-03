import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle } from 'lucide-react';

const PostDebateSurveyModal = ({ isOpen, onSubmit, onClose }) => {
  const [selectedResponse, setSelectedResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [opponentPerception, setOpponentPerception] = useState('');
  const [perceptionConfidence, setPerceptionConfidence] = useState(null); // ✅ Q3
  const [suspicionTiming, setSuspicionTiming] = useState('');             // ✅ Q4
  const [detectionCues, setDetectionCues] = useState([]);                 // ✅ Q5
  const [detectionOther, setDetectionOther] = useState('');               // ✅ Q5 other
  const [showOtherInput, setShowOtherInput] = useState(false);
  const dialogRef = useRef(null);

  const surveyOptions = [
    {
      value: 'still_firm',
      label: 'I am still firm on my stance.',
      description: 'My position has not changed'
    },
    {
      value: 'opponent_made_points',
      label: 'My opponent made good points, but my stance remains the same.',
      description: 'I acknowledge their arguments but still hold my position'
    },
    {
      value: 'convinced_to_change',
      label: 'My opponent convinced me to change my stance.',
      description: 'I have reconsidered my position based on their arguments'
    }
  ];

  const perceptionOptions = [
    {
      value: 'human',
      label: 'Human',
      emoji: '👤',
      description: 'My opponent was a real person'
    },
    {
      value: 'ai',
      label: 'AI',
      emoji: '🤖',
      description: 'My opponent was AI'
    }
  ];
  // ✅ Q3: Confidence levels
  const confidenceLevels = [
    { value: 1, label: 'Not confident at all' },
    { value: 2, label: 'Slightly confident' },
    { value: 3, label: 'Moderately confident' },
    { value: 4, label: 'Very confident' },
    { value: 5, label: 'Extremely confident' }
  ];

  // ✅ Q4: Suspicion timing
  const timingOptions = [
    { value: 'before_5', label: 'Before round 5' },
    { value: 'rounds_5_10', label: 'Between rounds 5-10' },
    { value: 'rounds_10_15', label: 'Between rounds 10-15' },
    { value: 'rounds_15_20', label: 'Between rounds 15-20' },
    { value: 'never_suspected', label: 'I never suspected / realized only now' }
  ];

  // ✅ Q5: Detection cues (dynamic based on perception)
  const aiDetectionCues = [
    { value: 'perfect_grammar', label: 'Perfect grammar / no typos' },
    { value: 'repetitive_phrases', label: 'Repetitive word use or phrases' },
    { value: 'too_logical', label: 'Too logical / lack of emotion' },
    { value: 'response_timing', label: 'Response timing (too fast or too consistent)' },
    { value: 'no_personal_stories', label: 'Lack of personal stories or examples' },
    { value: 'formulaic_structure', label: 'Formulaic argument structure' },
    { value: 'other', label: 'Other (please specify)' }
  ];

  const humanDetectionCues = [
    { value: 'natural_flow', label: 'Natural conversational flow' },
    { value: 'typos_informal', label: 'Occasional typos or informal language' },
    { value: 'emotional_tone', label: 'Emotional tone' },
    { value: 'personal_anecdotes', label: 'Personal anecdotes or examples' },
    { value: 'varied_styles', label: 'Varied argument styles' },
    { value: 'unpredictable', label: 'Unpredictable responses' },
    { value: 'other', label: 'Other (please specify)' }
  ];

  const currentDetectionCues = opponentPerception === 'ai' ? aiDetectionCues : humanDetectionCues;


  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    } else {
      dialog.close();
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ✅ Handle detection cue checkbox toggle
  const handleCueToggle = (value) => {
    if (value === 'other') {
      setShowOtherInput(!showOtherInput);
    }

    if (detectionCues.includes(value)) {
      setDetectionCues(detectionCues.filter(c => c !== value));
      if (value === 'other') {
        setDetectionOther('');
      }
    } else {
      setDetectionCues([...detectionCues, value]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedResponse || submitting) {
      toast.error('Please select how the debate affected your perspective');
      return;
    }

    // ✅ Require opponent perception response
    if (!opponentPerception) {
      toast.error('Please indicate whether you think your opponent was AI or human');
      return;
    }
    if (!perceptionConfidence) {
      toast.error('Please indicate your confidence level');
      return;
    }

    if (!suspicionTiming) {
      toast.error('Please indicate when you first suspected');
      return;
    }

    if (detectionCues.length === 0) {
      toast.error('Please select at least one detection cue');
      return;
    }

    if (detectionCues.includes('other') && !detectionOther.trim()) {
      toast.error('Please specify the "Other" reason');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        response: selectedResponse,
        opponentPerception: opponentPerception,
        perceptionConfidence: perceptionConfidence,
        suspicionTiming: suspicionTiming,
        detectionCues: detectionCues,
        detectionOther: detectionOther.trim()
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    // Prevent closing when clicking backdrop - make it mandatory
    if (e.target === dialogRef.current) {
      e.preventDefault();
    }
  };
return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="rounded-lg shadow-2xl p-0 max-w-2xl w-full backdrop:bg-black backdrop:bg-opacity-50"
    >
      <div className="bg-white rounded-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 rounded-t-lg sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="mr-3" size={28} />
              <h2 className="text-xl font-bold">Debate Completed!</h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-700 mb-6">
            Thank you for participating in this debate. Before you go, please answer these two questions:
          </p>

          {/* Question 1: Conviction Change */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              1. How did this debate affect your perspective?
            </h3>

            <div className="space-y-3">
              {surveyOptions.map((option) => (
                <label
                  key={option.value}
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                    selectedResponse === option.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-start">
                    <input
                      type="radio"
                      name="postSurvey"
                      value={option.value}
                      checked={selectedResponse === option.value}
                      onChange={(e) => setSelectedResponse(e.target.value)}
                      className="mt-1 mr-3"
                      disabled={submitting}
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

          {/* Question 2: Opponent Perception */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              2. Do you think your opponent was AI or human?
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Based on their arguing style and responses, make your best guess.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {perceptionOptions.map((option) => (
                <label
                  key={option.value}
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition text-center ${
                    opponentPerception === option.value
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="opponentPerception"
                    value={option.value}
                    checked={opponentPerception === option.value}
                    onChange={(e) => setOpponentPerception(e.target.value)}
                    className="sr-only"
                    disabled={submitting}
                  />
                  <div className="text-3xl mb-2">{option.emoji}</div>
                  <div className="font-medium text-gray-800">{option.label}</div>
                </label>
              ))}
            </div>
          </div>
          {/* ✅ Q3: Confidence Level */}
          {opponentPerception && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                3. How confident are you in your answer above?
              </h3>

              <div className="space-y-2">
                {confidenceLevels.map((level) => (
                  <label
                    key={level.value}
                    className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                      perceptionConfidence === level.value
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="confidence"
                        value={level.value}
                        checked={perceptionConfidence === level.value}
                        onChange={(e) => setPerceptionConfidence(parseInt(e.target.value))}
                        className="mr-3"
                        disabled={submitting}
                      />
                      <div className="flex items-center justify-between flex-1">
                        <span className="font-medium text-gray-800">{level.label}</span>
                        <span className="text-gray-500 text-sm">({level.value})</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ✅ Q4: When Suspected */}
          {opponentPerception && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                4. When did you first suspect your opponent was {opponentPerception === 'ai' ? 'AI' : 'human'}?
              </h3>

              <div className="space-y-2">
                {timingOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                      suspicionTiming === option.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="timing"
                        value={option.value}
                        checked={suspicionTiming === option.value}
                        onChange={(e) => setSuspicionTiming(e.target.value)}
                        className="mr-3"
                        disabled={submitting}
                      />
                      <span className="font-medium text-gray-800">{option.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ✅ Q5: Detection Cues */}
          {opponentPerception && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                5. What made you think your opponent was {opponentPerception === 'ai' ? 'AI' : 'human'}?
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Check all that apply:
              </p>

              <div className="space-y-2">
                {currentDetectionCues.map((cue) => (
                  <div key={cue.value}>
                    <label
                      className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                        detectionCues.includes(cue.value)
                          ? 'border-orange-600 bg-orange-50'
                          : 'border-gray-200 hover:border-orange-300'
                      }`}
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          value={cue.value}
                          checked={detectionCues.includes(cue.value)}
                          onChange={() => handleCueToggle(cue.value)}
                          className="mr-3"
                          disabled={submitting}
                        />
                        <span className="font-medium text-gray-800">{cue.label}</span>
                      </div>
                    </label>

                    {/* Other text input */}
                    {cue.value === 'other' && detectionCues.includes('other') && (
                      <div className="mt-2 ml-8">
                        <input
                          type="text"
                          value={detectionOther}
                          onChange={(e) => setDetectionOther(e.target.value)}
                          placeholder="Please specify..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          disabled={submitting}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> All responses are required. Your answers are anonymous and used only for research purposes.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={
              !selectedResponse ||
              !opponentPerception ||
              !perceptionConfidence ||
              !suspicionTiming ||
              detectionCues.length === 0 ||
              (detectionCues.includes('other') && !detectionOther.trim()) ||
              submitting
            }
            className="w-full mt-6 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg"
          >
            {submitting ? 'Submitting...' : 'Submit Survey'}
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default PostDebateSurveyModal;