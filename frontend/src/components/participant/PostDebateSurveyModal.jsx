import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const PostDebateSurveyModal = ({ isOpen, onSubmit, onClose }) => {
  const [selectedResponse, setSelectedResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [opponentPerception, setOpponentPerception] = useState('');
  const [stanceStrength, setStanceStrength] = useState(null);
  const [stanceConfidence, setStanceConfidence] = useState(null);
  const [perceptionConfidence, setPerceptionConfidence] = useState(null); // ✅ Q3
  const [suspicionTiming, setSuspicionTiming] = useState('');             // ✅ Q4
  const [detectionCues, setDetectionCues] = useState([]);                 // ✅ Q5
  const [detectionOther, setDetectionOther] = useState('');               // ✅ Q5 other
  const [showOtherInput, setShowOtherInput] = useState(false);
  const dialogRef = useRef(null);

  // AI Awareness Effect
  const [aiAwarenessEffect, setAiAwarenessEffect] = useState('');
  const [aiAwarenessJustification, setAiAwarenessJustification] = useState('');
  const aiAwarenessOptions = [
    { value: 'no_difference', label: 'No, I treated the arguments seriously regardless.' },
    { value: 'less_persuasive', label: 'Yes, knowing it was AI made the arguments less persuasive.' },
    { value: 'more_persuasive', label: 'Yes, knowing it was AI made the arguments more persuasive.' },
    { value: 'not_sure', label: `Not sure / can't say.` }
  ];

  // Human Awareness Effect
  const [humanAwarenessEffect, setHumanAwarenessEffect] = useState('');
  const [humanAwarenessJustification, setHumanAwarenessJustification] = useState('');
  const humanAwarenessOptions = [
    { value: 'no_difference', label: 'No, I treated the arguments seriously regardless.' },
    { value: 'less_persuasive', label: 'Yes, knowing it was human made the arguments less persuasive.' },
    { value: 'more_persuasive', label: 'Yes, knowing it was human made the arguments more persuasive.' },
    { value: 'not_sure', label: `Not sure / can't say.` }
  ];

  // Unsure Awareness Effect
  const [unsureAwarenessEffect, setUnsureAwarenessEffect] = useState('');
  const [unsureAwarenessJustification, setUnsureAwarenessJustification] = useState('');
  const unsureAwarenessOptions = [
    { value: 'no_difference', label: 'No, I treated the arguments seriously regardless.' },
    { value: 'less_persuasive', label: 'Yes, the uncertainty made the arguments less persuasive.' },
    { value: 'more_persuasive', label: 'Yes, the uncertainty made the arguments more persuasive.' },
    { value: 'not_sure', label: `Not sure / can't say.` }
  ];

  const surveyOptions = [
    {
      value: 'strengthened',
      label: 'Strengthened my original view',
      description: 'I feel more confident in my original stance.'
    },
    {
      value: 'slightly_strengthened',
      label: 'Slightly strengthened',
      description: 'My original stance is a bit stronger.'
    },
    {
      value: 'no_effect',
      label: 'No real effect',
      description: 'The debate did not change my stance.'
    },
    {
      value: 'slightly_weakened',
      label: 'Slightly weakened',
      description: 'My original stance is a bit weaker.'
    },
    {
      value: 'weakened',
      label: 'Weakened my original view',
      description: 'I feel less confident in my original stance.'
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
    },
    {
      value: 'unsure',
      label: 'Unsure',
      emoji: '❓',
      description: 'I am not sure whether they were human or AI'
    }
  ];

  const stanceStrengthLevels = [
    { value: 1, label: 'Very weak' },
    { value: 2, label: 'Weak' },
    { value: 3, label: 'Somewhat weak' },
    { value: 4, label: 'Neutral' },
    { value: 5, label: 'Somewhat strong' },
    { value: 6, label: 'Strong' },
    { value: 7, label: 'Very strong' }
  ];

  const stanceConfidenceLevels = [
    { value: 1, label: 'Not confident at all' },
    { value: 2, label: 'Slightly confident' },
    { value: 3, label: 'Somewhat confident' },
    { value: 4, label: 'Moderately confident' },
    { value: 5, label: 'Quite confident' },
    { value: 6, label: 'Very confident' },
    { value: 7, label: 'Extremely confident' }
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
  { value: 'round_1_2', label: 'Round 1-2 (immediately)' },
  { value: 'round_3_4', label: 'Round 3-4 (early)' },
  { value: 'round_5_7', label: 'Round 5-7 (mid-early)' },
  { value: 'round_8_12', label: 'Round 8-12 (middle)' },
  { value: 'round_13_17', label: 'Round 13-17 (late)' },
  { value: 'round_18_20', label: 'Round 18-20 (very late)' },
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

  const unsureDetectionCues = [
    { value: 'mixed_signals', label: 'Mixed signals (some AI-like, some human-like)' },
    { value: 'response_timing', label: 'Response timing felt inconsistent' },
    { value: 'tone_shifts', label: 'Tone shifts across rounds' },
    { value: 'argument_structure', label: 'Argument structure felt inconsistent' },
    { value: 'other', label: 'Other (please specify)' }
  ];

  const currentDetectionCues = opponentPerception === 'ai'
    ? aiDetectionCues
    : opponentPerception === 'human'
      ? humanDetectionCues
      : unsureDetectionCues;


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
    // Require AI awareness effect if opponentPerception is 'ai'
    if (opponentPerception === 'ai' && !aiAwarenessEffect) {
      toast.error('Please answer how knowing your opponent was AI affected your stance change');
      return;
    }
    if (opponentPerception === 'ai' && !aiAwarenessJustification.trim()) {
      toast.error('Please provide a brief justification or description for your answer about AI awareness.');
      return;
    }

    // Require human awareness effect if opponentPerception is 'human'
    if (opponentPerception === 'human' && !humanAwarenessEffect) {
      toast.error('Please answer how knowing your opponent was human affected your stance change');
      return;
    }
    if (opponentPerception === 'human' && !humanAwarenessJustification.trim()) {
      toast.error('Please provide a brief justification or description for your answer about human awareness.');
      return;
    }

    // Require unsure awareness effect if opponentPerception is 'unsure'
    if (opponentPerception === 'unsure' && !unsureAwarenessEffect) {
      toast.error('Please answer how the uncertainty affected your stance change');
      return;
    }
    if (opponentPerception === 'unsure' && !unsureAwarenessJustification.trim()) {
      toast.error('Please provide a brief justification or description for your answer about uncertainty.');
      return;
    }

    if (!stanceStrength) {
      toast.error('Please rate your current stance strength');
      return;
    }

    if (!stanceConfidence) {
      toast.error('Please rate your confidence in your current stance');
      return;
    }

    // ✅ Require opponent perception response
    if (!opponentPerception) {
      toast.error('Please indicate whether you think your opponent was AI, human, or unsure');
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
        stanceStrength: stanceStrength,
        stanceConfidence: stanceConfidence,
        opponentPerception: opponentPerception,
        perceptionConfidence: perceptionConfidence,
        suspicionTiming: suspicionTiming,
        detectionCues: detectionCues,
        detectionOther: detectionOther.trim(),
        aiAwarenessEffect: opponentPerception === 'ai' ? aiAwarenessEffect : undefined,
        aiAwarenessJustification: opponentPerception === 'ai' ? aiAwarenessJustification.trim() : undefined,
        humanAwarenessEffect: opponentPerception === 'human' ? humanAwarenessEffect : undefined,
        humanAwarenessJustification: opponentPerception === 'human' ? humanAwarenessJustification.trim() : undefined,
        unsureAwarenessEffect: opponentPerception === 'unsure' ? unsureAwarenessEffect : undefined,
        unsureAwarenessJustification: opponentPerception === 'unsure' ? unsureAwarenessJustification.trim() : undefined
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    // Allow closing via backdrop
    if (e.target === dialogRef.current) {
      onClose();
    }
  };
return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="rounded-lg shadow-2xl p-0 max-w-2xl w-full max-h-[90vh] overflow-y-auto backdrop:bg-black backdrop:bg-opacity-50"
    >
      <div className="bg-white rounded-lg">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 rounded-t-lg sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="mr-3" size={28} />
              <h2 className="text-xl font-bold">Debate Completed!</h2>
            </div>
            <button
              onClick={() => onClose()}
              className="text-white hover:text-gray-200 transition"
              title="Close survey (you can reopen it later)"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-700 mb-6">
            Thank you for participating in this debate. Before you go, please answer these questions:
          </p>

          {/* Question 1: Conviction Change */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              1. Overall, how did this debate affect your original stance on this topic?
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
          {/* Question 2: Stance Strength */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              2. How strong is your stance on this topic now?
            </h3>

            <div className="space-y-2">
              {stanceStrengthLevels.map((level) => (
                <label
                  key={level.value}
                  className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                    stanceStrength === level.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="stanceStrength"
                      value={level.value}
                      checked={stanceStrength === level.value}
                      onChange={(e) => setStanceStrength(parseInt(e.target.value))}
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

          {/* Question 3: Stance Confidence */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              3. How confident are you in your stance now?
            </h3>

            <div className="space-y-2">
              {stanceConfidenceLevels.map((level) => (
                <label
                  key={level.value}
                  className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                    stanceConfidence === level.value
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="stanceConfidence"
                      value={level.value}
                      checked={stanceConfidence === level.value}
                      onChange={(e) => setStanceConfidence(parseInt(e.target.value))}
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

          {/* Question 4: Opponent Perception */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              4. Do you think your opponent was AI or human?
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Based on their arguing style and responses, make your best guess.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {perceptionOptions.map((option) => (
                <label
                  key={option.value}
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition text-center whitespace-normal break-words ${
                    opponentPerception === option.value
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                  style={{ minHeight: 100 }}
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
          {/* ✅ Q5: Confidence Level */}
          {opponentPerception && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                5. How confident are you in your answer above?
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

          {/* ✅ Q6: When Suspected */}
          {opponentPerception && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                6. When did you first suspect your opponent was {opponentPerception === 'ai' ? 'AI' : opponentPerception === 'human' ? 'human' : 'AI or human'}?
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

          {/* ✅ Q7: Detection Cues */}
          {opponentPerception && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                7. What made you think your opponent was {opponentPerception === 'ai' ? 'AI' : opponentPerception === 'human' ? 'human' : 'unclear'}?
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
          {/* Question 8: AI Awareness Effect */}
          {opponentPerception === 'ai' && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                8. Did knowing your opponent was AI affect your stance change?
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                This helps us analyze whether knowing an argument comes from AI changes how persuasive it feels, compared to treating arguments on their own merits.
              </p>
              <div className="space-y-2 mb-4">
                {aiAwarenessOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                      aiAwarenessEffect === option.value
                        ? 'border-fuchsia-600 bg-fuchsia-50'
                        : 'border-gray-200 hover:border-fuchsia-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="aiAwarenessEffect"
                        value={option.value}
                        checked={aiAwarenessEffect === option.value}
                        onChange={(e) => setAiAwarenessEffect(e.target.value)}
                        className="mr-3"
                        disabled={submitting}
                      />
                      <span className="font-medium text-gray-800">{option.label}</span>
                    </div>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1" htmlFor="aiAwarenessJustification">
                  Please briefly explain your answer:
                </label>
                <textarea
                  id="aiAwarenessJustification"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent min-h-[60px]"
                  value={aiAwarenessJustification}
                  onChange={e => setAiAwarenessJustification(e.target.value)}
                  placeholder="Describe how (if at all) knowing your opponent was AI influenced your reaction to their arguments..."
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          )}

          {/* Question 8: Human Awareness Effect */}
          {opponentPerception === 'human' && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                8. Did knowing your opponent was human affect your stance change?
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                This helps us analyze whether knowing an argument comes from a real person changes how persuasive it feels, compared to treating arguments on their own merits.
              </p>
              <div className="space-y-2 mb-4">
                {humanAwarenessOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                      humanAwarenessEffect === option.value
                        ? 'border-cyan-600 bg-cyan-50'
                        : 'border-gray-200 hover:border-cyan-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="humanAwarenessEffect"
                        value={option.value}
                        checked={humanAwarenessEffect === option.value}
                        onChange={(e) => setHumanAwarenessEffect(e.target.value)}
                        className="mr-3"
                        disabled={submitting}
                      />
                      <span className="font-medium text-gray-800">{option.label}</span>
                    </div>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1" htmlFor="humanAwarenessJustification">
                  Please briefly explain your answer:
                </label>
                <textarea
                  id="humanAwarenessJustification"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent min-h-[60px]"
                  value={humanAwarenessJustification}
                  onChange={e => setHumanAwarenessJustification(e.target.value)}
                  placeholder="Describe how (if at all) knowing your opponent was human influenced your reaction to their arguments..."
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          )}

          {/* Question 8: Unsure Awareness Effect */}
          {opponentPerception === 'unsure' && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                8. Did your uncertainty about your opponent's nature affect your stance change?
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                This helps us analyze whether the uncertainty itself changes how persuasive the arguments feel, compared to treating arguments on their own merits.
              </p>
              <div className="space-y-2 mb-4">
                {unsureAwarenessOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`block p-3 border-2 rounded-lg cursor-pointer transition ${
                      unsureAwarenessEffect === option.value
                        ? 'border-amber-600 bg-amber-50'
                        : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="unsureAwarenessEffect"
                        value={option.value}
                        checked={unsureAwarenessEffect === option.value}
                        onChange={(e) => setUnsureAwarenessEffect(e.target.value)}
                        className="mr-3"
                        disabled={submitting}
                      />
                      <span className="font-medium text-gray-800">{option.label}</span>
                    </div>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1" htmlFor="unsureAwarenessJustification">
                  Please briefly explain your answer:
                </label>
                <textarea
                  id="unsureAwarenessJustification"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent min-h-[60px]"
                  value={unsureAwarenessJustification}
                  onChange={e => setUnsureAwarenessJustification(e.target.value)}
                  placeholder="Describe how (if at all) the uncertainty influenced your reaction to their arguments..."
                  disabled={submitting}
                  required
                />
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
              !stanceStrength ||
              !stanceConfidence ||
              !opponentPerception ||
              !perceptionConfidence ||
              !suspicionTiming ||
              detectionCues.length === 0 ||
              (detectionCues.includes('other') && !detectionOther.trim()) ||
              (opponentPerception === 'ai' && !aiAwarenessEffect) ||
              (opponentPerception === 'ai' && !aiAwarenessJustification.trim()) ||
              (opponentPerception === 'human' && !humanAwarenessEffect) ||
              (opponentPerception === 'human' && !humanAwarenessJustification.trim()) ||
              (opponentPerception === 'unsure' && !unsureAwarenessEffect) ||
              (opponentPerception === 'unsure' && !unsureAwarenessJustification.trim()) ||
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