import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle } from 'lucide-react';

const PostDebateSurveyModal = ({ isOpen, onSubmit, onClose }) => {
  const [selectedResponse, setSelectedResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async () => {
    if (!selectedResponse || submitting) return;

    setSubmitting(true);
    try {
      await onSubmit(selectedResponse);
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
      <div className="bg-white rounded-lg">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 rounded-t-lg">
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
            Thank you for participating in this debate. Before you go, please let us know: <strong>How did this debate affect your perspective?</strong>
          </p>

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

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> Your response is required to complete this debate. Your answer will remain private and is used only for research purposes.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!selectedResponse || submitting}
            className="w-full mt-6 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg"
          >
            {submitting ? 'Submitting...' : 'Submit Response'}
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default PostDebateSurveyModal;