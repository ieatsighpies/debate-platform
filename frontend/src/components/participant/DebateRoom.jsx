import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { debateAPI } from '../../services/api';
import { useSocket } from '../../context/socketContext';
import { useAuth } from '../../context/AuthContext';
import { Loader2, Clock, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import PostDebateSurveyModal from './PostDebateSurveyModal';

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
  const [showBeliefPrompt, setShowBeliefPrompt] = useState(false);
  const [showNorms, setShowNorms] = useState(false);
  const [showReflectionPrompt, setShowReflectionPrompt] = useState(false);
  const [reflectionParaphrase, setReflectionParaphrase] = useState('');
  const [reflectionAcknowledgement, setReflectionAcknowledgement] = useState('');
  const [reflectionSubmitting, setReflectionSubmitting] = useState(false);
  const [reflectionHandledRounds, setReflectionHandledRounds] = useState([]);
  const [beliefRound, setBeliefRound] = useState(null);
  const [beliefValue, setBeliefValue] = useState(50); // 0-100 numeric belief (50 = unsure)
  const [influenceValue, setInfluenceValue] = useState(0);
  const [confidenceValue, setConfidenceValue] = useState(50); // optional confidence 0-100
  const [beliefSubmitting, setBeliefSubmitting] = useState(false);
  const [skippedBeliefRounds, setSkippedBeliefRounds] = useState([]);

  // Post-debate survey state
  const [showPostSurvey, setShowPostSurvey] = useState(false);
  const [postSurveySubmitted, setPostSurveySubmitted] = useState(false);

  const debateIdRef = useRef(debateId);
  const debateRef = useRef(null);
  const earlyEndVotesRef = useRef(earlyEndVotes);
  const normsShownOnceRef = useRef(false);
  const lastSurveyRoundShownRef = useRef(null);

  useEffect(() => {
    debateIdRef.current = debateId;
  }, [debateId]);

  useEffect(() => {
    debateRef.current = debate;
  }, [debate]);

  useEffect(() => {
    earlyEndVotesRef.current = earlyEndVotes;
  }, [earlyEndVotes]);

  //  HIDDEN from user - internal only
  const isHumanAI = debate?.gameMode === 'human-ai' || debate?.isAIOpponent === true;

  const isPostSurveyCompleteForPlayer = (survey, playerKey) => {
    if (!survey || !playerKey) return false;

    const response = survey[playerKey];
    const perception = survey[`${playerKey}OpponentPerception`];
    const stanceStrength = survey[`${playerKey}StanceStrength`];
    const stanceConfidence = survey[`${playerKey}StanceConfidence`];
    const confidence = survey[`${playerKey}PerceptionConfidence`];
    const timing = survey[`${playerKey}SuspicionTiming`];
    const cues = survey[`${playerKey}DetectionCues`];
    const other = survey[`${playerKey}DetectionOther`];

    if (!response || !perception || !stanceStrength || !stanceConfidence || !confidence || !timing) return false;
    if (!Array.isArray(cues) || cues.length === 0) return false;
    if (cues.includes('other') && (!other || !other.trim())) return false;

    // Check awareness effect fields based on opponent perception
    if (perception === 'ai') {
      const aiEffect = survey[`${playerKey}AiAwarenessEffect`];
      const aiJustification = survey[`${playerKey}AiAwarenessJustification`];
      if (!aiEffect || !aiJustification || !aiJustification.trim()) return false;
    } else if (perception === 'human') {
      const humanEffect = survey[`${playerKey}HumanAwarenessEffect`];
      const humanJustification = survey[`${playerKey}HumanAwarenessJustification`];
      if (!humanEffect || !humanJustification || !humanJustification.trim()) return false;
    } else if (perception === 'unsure') {
      const unsureEffect = survey[`${playerKey}UnsureAwarenessEffect`];
      const unsureJustification = survey[`${playerKey}UnsureAwarenessJustification`];
      if (!unsureEffect || !unsureJustification || !unsureJustification.trim()) return false;
    }

    return true;
  };

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

      const debateData = response.data.debate;
      debateRef.current = debateData;
      setDebate(debateData);

      //  Update vote state
      if (debateData.earlyEndVotes) {
        const isPlayer1 = debateData.isPlayer1;
        const votes = debateData.earlyEndVotes;

        const yourVoteStatus = isPlayer1
          ? (votes.player1Voted || false)
          : (votes.player2Voted || false);

        setEarlyEndVotes({
          player1Voted: votes.player1Voted || false,
          player2Voted: votes.player2Voted || false,
          yourVote: yourVoteStatus
        });

        console.log('[Vote] State initialized:', {
          isPlayer1,
          player1Voted: votes.player1Voted,
          player2Voted: votes.player2Voted,
          yourVote: yourVoteStatus,
          gameMode: debateData.gameMode
        });
      }

      // Check if we need to show post-debate survey
      // BUT: Delay if belief/reflection prompts need to be shown first (early end vote scenario)
      if (['survey_pending', 'completed'].includes(debateData.status)) {
        const isPlayer1 = debateData.isPlayer1;
        const isPlayer2 = debateData.isPlayer2;
        const survey = debateData.postDebateSurvey || {};

        const hasSubmitted = isPlayer1
          ? isPostSurveyCompleteForPlayer(survey, 'player1')
          : isPlayer2
            ? isPostSurveyCompleteForPlayer(survey, 'player2')
            : false;

        // Check if belief/reflection for latest round still need to be submitted (early end scenario)
        const latestRound = getLatestCompletedRound(debateData);
        const isEarlyEnd = debateData.earlyEndVotes?.player1Voted && debateData.earlyEndVotes?.player2Voted;
        const playerKey = isPlayer1 ? 'player1' : 'player2';

        const beliefAlreadySubmitted = (debateData.beliefHistory || []).some(
          entry => entry.round === latestRound && entry.player === playerKey
        );

        const reflectionAlreadySubmitted = (debateData.reflections || []).some(
          r => r.round === latestRound && (
            (r.player && r.player === playerKey) ||
            (r.userId && String(r.userId) === String(user?.userId))
          )
        );

        const needsBelief = isEarlyEnd && latestRound && !beliefAlreadySubmitted;
        const needsReflection = isEarlyEnd && latestRound && !reflectionAlreadySubmitted;

        console.log('[Survey] Check:', {
          isPlayer1,
          isPlayer2,
          hasSubmitted,
          postSurveySubmitted,
          showPostSurvey,
          isEarlyEnd,
          needsBelief,
          needsReflection
        });

        // Only show post-survey if:
        // 1. Survey not already submitted AND
        // 2. No pending belief/reflection prompts OR belief/reflection are already submitted
        if (!hasSubmitted && !postSurveySubmitted && !showPostSurvey) {
          if (!needsBelief && !needsReflection) {
            // Safe to show survey - no pending prompts
            setShowPostSurvey(true);
          } else {
            // Belief/reflection still pending - let the effects handle showing those first
            console.log('[Survey] Delaying post-survey, showing belief/reflection first');
          }
        } else if (hasSubmitted) {
          setPostSurveySubmitted(true);
          setShowPostSurvey(false);
        }
      }

      setError(null);

      // Show norms once before round 1 for active debates
      if (debateData.status === 'active' && debateData.currentRound === 1 && !normsShownOnceRef.current && !debateData._normsShown) {
        normsShownOnceRef.current = true;
        console.log('[Norms] Showing norms before round 1');
        setShowNorms(true);
      }
    } catch (err) {
      console.error('[DebateRoom] Error fetching debate:', err);
      setError(err.response?.data?.message || 'Failed to load debate');
    } finally {
      setLoading(false);
    }
  };

  const getLatestCompletedRound = (debateData) => {
    if (!debateData?.arguments?.length) return null;
    const roundCounts = debateData.arguments.reduce((acc, arg) => {
      acc[arg.round] = (acc[arg.round] || 0) + 1;
      return acc;
    }, {});

    const completedRounds = Object.keys(roundCounts)
      .map((round) => parseInt(round, 10))
      .filter((round) => roundCounts[round] >= 2);

    if (completedRounds.length === 0) return null;
    return Math.max(...completedRounds);
  };

  const getRoundArgumentCount = (debateData, roundNum) => {
    if (!debateData?.arguments?.length || !roundNum) return 0;
    return debateData.arguments.filter((arg) => arg.round === roundNum).length;
  };

  const getPlayerUserId = (debateData, playerKey) => {
    const user = playerKey === 'player1' ? debateData?.player1UserId : debateData?.player2UserId;
    if (!user) return null;
    if (typeof user === 'string') return user;
    return user._id || null;
  };

  const isBeliefCompleteForRound = (debateData, roundNum) => {
    if (!debateData || !roundNum || roundNum < 1) return true;

    const roundArgCount = getRoundArgumentCount(debateData, roundNum);
    if (roundArgCount < 2) return true;

    const player1Done = (debateData.beliefHistory || []).some(
      (entry) => entry.round === roundNum && entry.player === 'player1'
    );

    // Human-human mode requires both humans to submit belief updates.
    if (debateData.player2Type === 'human') {
      const player2Done = (debateData.beliefHistory || []).some(
        (entry) => entry.round === roundNum && entry.player === 'player2'
      );
      return player1Done && player2Done;
    }

    return player1Done;
  };

  const hasReflectionForRound = (debateData, roundNum, playerKey) => {
    const targetUserId = getPlayerUserId(debateData, playerKey);
    if (!targetUserId) return false;

    return (debateData?.reflections || []).some(
      (entry) => entry.round === roundNum && entry.userId && String(entry.userId) === String(targetUserId)
    );
  };

  const isReflectionCompleteForRound = (debateData, roundNum) => {
    if (!debateData || !roundNum || roundNum < 1) return true;

    const roundArgCount = getRoundArgumentCount(debateData, roundNum);
    if (roundArgCount < 2) return true;

    const player1Done = hasReflectionForRound(debateData, roundNum, 'player1');

    // In human-human mode, both human players must complete reflection.
    if (debateData.player2Type === 'human') {
      const player2Done = hasReflectionForRound(debateData, roundNum, 'player2');
      return player1Done && player2Done;
    }

    return player1Done;
  };

  const isReadyForCurrentRoundArgument = (debateData) => {
    if (!debateData || debateData.status !== 'active') return false;
    if (debateData.nextTurn !== debateData.yourStance) return false;

    const currentRoundArgCount = getRoundArgumentCount(debateData, debateData.currentRound);
    if (currentRoundArgCount >= 2) return false;

    const previousRound = debateData.currentRound - 1;
    return (
      isBeliefCompleteForRound(debateData, previousRound) &&
      isReflectionCompleteForRound(debateData, previousRound)
    );
  };

  const hasRoundChecksForPlayer = (debateData, roundNum, playerKey) => {
    const beliefDone = (debateData?.beliefHistory || []).some(
      (entry) => entry.round === roundNum && entry.player === playerKey
    );

    const reflectionDone =
      playerKey === 'player2' && debateData?.player2Type !== 'human'
        ? true
        : hasReflectionForRound(debateData, roundNum, playerKey);

    return beliefDone && reflectionDone;
  };

  // Show waiting animation if user is done with round checks but opponent isn't
  const shouldShowWaitingAnimation = () => {
    if (!['active', 'survey_pending', 'completed'].includes(debate?.status)) return false;
    if (debate?.player2Type !== 'human') return false;

    // For completed debates, only show waiting if it's an early end scenario
    if (debate?.status === 'completed' && !(debate.earlyEndVotes?.player1Voted && debate.earlyEndVotes?.player2Voted)) return false;

    const roundComplete = getLatestCompletedRound(debate) === debate.currentRound;
    if (!roundComplete) return false;

    // Both arguments submitted (round is complete), now waiting for checks
    const playerKey = debate.isPlayer1 ? 'player1' : 'player2';
    const opponentKey = debate.isPlayer1 ? 'player2' : 'player1';

    const userDone = hasRoundChecksForPlayer(debate, debate.currentRound, playerKey);
    const opponentDone = hasRoundChecksForPlayer(debate, debate.currentRound, opponentKey);

    return userDone && !opponentDone;
  };

  // Initial fetch
  useEffect(() => {
    fetchDebate();
  }, [debateId]);

  useEffect(() => {
    if (!debate) return;

    // Allow belief prompt during active debate OR when debate just completed via early end vote
    const isActive = debate.status === 'active';
    const isEarlyEnd = ['survey_pending', 'completed'].includes(debate.status) && (debate.earlyEndVotes?.player1Voted && debate.earlyEndVotes?.player2Voted);

    if (!isActive && !isEarlyEnd) return;

    const latestCompletedRound = getLatestCompletedRound(debate);
    if (!latestCompletedRound) return;

    if (skippedBeliefRounds.includes(latestCompletedRound)) return;

    //  ONLY show belief prompt AFTER reflection is submitted/handled for this round
    if (!reflectionHandledRounds.includes(latestCompletedRound)) {
      console.log('[BeliefDebug] Waiting for reflection to complete first', { debateId, round: latestCompletedRound });
      return;
    }

    const alreadySubmitted = (debate.beliefHistory || []).some((entry) =>
      entry.round === latestCompletedRound &&
      entry.userId?.toString() === user?.userId
    );

    if (!alreadySubmitted && !showBeliefPrompt) {
      setBeliefRound(latestCompletedRound);
      setBeliefValue(50);
      setInfluenceValue(0);
      console.log('[BeliefDebug] Showing belief prompt (after reflection)', { debateId, round: latestCompletedRound, userId: user?.userId, earlyEnd: isEarlyEnd });
      setShowBeliefPrompt(true);
    }
  }, [debate?.status, debate?.arguments.length, debate?.beliefHistory.length, debate?.earlyEndVotes, showBeliefPrompt, user?.userId]);

  useEffect(() => {
    if (!debate) return;

    // Allow reflection prompt during active debate OR when debate just completed via early end vote
    const isActive = debate.status === 'active';
    const isEarlyEnd = ['survey_pending', 'completed'].includes(debate.status) && (debate.earlyEndVotes?.player1Voted && debate.earlyEndVotes?.player2Voted);

    if (!isActive && !isEarlyEnd) return;

    const latestCompletedRound = getLatestCompletedRound(debate);
    if (!latestCompletedRound) return;

    const alreadyReflected = (debate.reflections || []).some(
      r => r.round === latestCompletedRound && r.userId?.toString() === user?.userId
    );
    if (alreadyReflected) {
      setReflectionHandledRounds((prev) => {
        if (!prev.includes(latestCompletedRound)) {
          return [...new Set([...prev, latestCompletedRound])];
        }
        return prev;
      });
      return;
    }

    if (reflectionHandledRounds.includes(latestCompletedRound)) return;

    if (!showReflectionPrompt) {
      console.log('[Reflection] Showing reflection prompt', {
        debateId,
        round: latestCompletedRound,
        userId: user?.userId,
        earlyEnd: isEarlyEnd
      });
      setShowReflectionPrompt(true);
    }
  }, [debate?.status, debate?.arguments.length, debate?.reflections.length, debate?.earlyEndVotes, user?.userId, showReflectionPrompt]);

  useEffect(() => {
    if (!debate || !showBeliefPrompt) return;

    // Only hide belief prompt if debate is truly complete (not an early end scenario waiting for submission)
    const isEarlyEndWaitingForSubmission = ['survey_pending', 'completed'].includes(debate.status) &&
      (debate.earlyEndVotes?.player1Voted && debate.earlyEndVotes?.player2Voted);

    if (debate.status !== 'active' && !isEarlyEndWaitingForSubmission) {
      console.log('[BeliefDebug] Hiding prompt because debate ended', { debateId, status: debate?.status });
      setShowBeliefPrompt(false);
      setBeliefValue(50);
    }
  }, [debate?.status, debate?.earlyEndVotes, showBeliefPrompt]);

  // Show post-survey after belief/reflection are submitted during early end scenario
  useEffect(() => {
    if (!debate || !['survey_pending', 'completed'].includes(debate.status) || showPostSurvey || postSurveySubmitted) return;

    const isPlayer1 = debate.isPlayer1;
    const isPlayer2 = debate.isPlayer2;
    const survey = debate.postDebateSurvey || {};

    // Check if survey already submitted in the debate object (for guest re-login scenarios)
    const hasSubmitted = isPlayer1
      ? isPostSurveyCompleteForPlayer(survey, 'player1')
      : isPlayer2
        ? isPostSurveyCompleteForPlayer(survey, 'player2')
        : false;

    if (hasSubmitted) {
      setPostSurveySubmitted(true);
      return;
    }

    const isEarlyEnd = debate.earlyEndVotes?.player1Voted && debate.earlyEndVotes?.player2Voted;
    if (!isEarlyEnd) return;

    const latestRound = getLatestCompletedRound(debate);

    // Skip if we already tried to show survey for this round (prevents re-triggering on debate updates)
    if (lastSurveyRoundShownRef.current === latestRound) return;

    const playerKey = isPlayer1 ? 'player1' : 'player2';

    // Check if belief/reflection have been submitted
    const beliefSubmitted = (debate.beliefHistory || []).some(
      entry => entry.round === latestRound && entry.player === playerKey
    );

    const reflectionSubmitted = (debate.reflections || []).some(
      r => r.round === latestRound && r.userId && String(r.userId) === String(user?.userId)
    );

    // Check if they were skipped (order: reflection THEN belief)
    const reflectionSkipped = reflectionHandledRounds.includes(latestRound);
    const beliefSkipped = skippedBeliefRounds.includes(latestRound);

    // Show post-survey only if BOTH reflection and belief have been handled
    // Don't rely on visibility states - rely on completion tracking instead
    const reflectionComplete = reflectionSubmitted || reflectionSkipped;
    const beliefComplete = beliefSubmitted || beliefSkipped;

    if (reflectionComplete && beliefComplete) {
      console.log('[Survey] Showing post-survey after reflection/belief complete', { latestRound, reflectionComplete, beliefComplete });
      lastSurveyRoundShownRef.current = latestRound;
      setShowPostSurvey(true);
    }
  }, [debate?.status, debate?.arguments.length, debate?.reflections.length, debate?.beliefHistory.length, debate?.earlyEndVotes, showPostSurvey, postSurveySubmitted, user?.userId]);

  // Socket setup
  useEffect(() => {
    if (!debateId || !socket || !connected) {
      console.log('[DebateRoom] Socket not ready:', { debateId, socket: !!socket, connected });
      return;
    }

    console.log('[DebateRoom] Setting up socket listeners for:', debateId);
    joinDebateRoom(debateId);

    const isCurrentDebateEvent = (data) => {
      if (!data || typeof data.debateId === 'undefined' || data.debateId === null) {
        return false;
      }
      return String(data.debateId) === String(debateIdRef.current);
    };

    const handleArgumentAdded = (data) => {
      console.log('[DebateRoom] Argument added event:', data);
      if (!isCurrentDebateEvent(data)) {
        return;
      }

      setDebate((prev) => {
        if (!prev || !data.argument) return prev;

        const existing = prev.arguments || [];
        const nextArg = {
          ...data.argument,
          isYours: data.argument.stance === prev.yourStance
        };

        const alreadyExists = existing.some((arg) => {
          if (arg._id && nextArg._id) return arg._id === nextArg._id;
          return (
            arg.round === nextArg.round &&
            arg.stance === nextArg.stance &&
            arg.text === nextArg.text &&
            arg.submittedBy === nextArg.submittedBy
          );
        });

        if (alreadyExists) return prev;

        return {
          ...prev,
          arguments: [...existing, nextArg],
          status: data.status || prev.status,
          currentRound: data.currentRound || prev.currentRound
        };
      });

      // Reconcile with server state in the background.
      setTimeout(() => fetchDebate(), 250);
    };

    const handleDebateStarted = (data) => {
      console.log('[DebateRoom]  Debate started event received!', data);
      if (isCurrentDebateEvent(data)) {
        toast.success('Opponent joined! Debate starting...');
        fetchDebate();
      }
    };

    const handleDebateCompleted = (data) => {
      console.log('[DebateRoom] Debate completed:', data);
      if (isCurrentDebateEvent(data)) {
        fetchDebate();
      }
    };

    const handleRoundAdvanced = (data) => {
      console.log('[DebateRoom] Round advanced:', data);
      if (isCurrentDebateEvent(data)) {
        fetchDebate();
      }
    };

    const handleDebateCancelled = (data) => {
      console.log('[DebateRoom] Debate cancelled:', data);
      if (isCurrentDebateEvent(data)) {
        toast.error('This debate was cancelled');
        navigate('/participant');
      }
    };

    // In DebateRoom.jsx - Update the socket handler
const handleEarlyEndVote = (data) => {
  console.log('[DebateRoom] 📥 Early end vote update received:', data);

  if (!isCurrentDebateEvent(data)) {
    console.log('[DebateRoom] ❌ Event not for this debate');
    return;
  }

  if (!data.votes) {
    console.error('[Vote] ❌ Invalid vote data received:', data);
    return;
  }

  //  Get current debate state to determine player position
  const currentDebate = debateRef.current;
  if (!currentDebate) {
    console.error('[Vote] ❌ No debate state available');
    return;
  }

  const isPlayer1 = currentDebate.isPlayer1;
  const yourVoteStatus = isPlayer1
    ? (data.votes.player1Voted || false)
    : (data.votes.player2Voted || false);

  const newVoteState = {
    player1Voted: data.votes.player1Voted || false,
    player2Voted: data.votes.player2Voted || false,
    yourVote: yourVoteStatus
  };

  console.log('[Vote]  Updating state:', {
    isPlayer1,
    received: data.votes,
    newState: newVoteState,
    yourVote: yourVoteStatus
  });

  //  Update vote state
  setEarlyEndVotes(newVoteState);
  setVotingInProgress(false);

  //  Update debate object
  setDebate(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      earlyEndVotes: {
        player1Voted: newVoteState.player1Voted,
        player2Voted: newVoteState.player2Voted
      }
    };
  });

  // Show appropriate message
  if (newVoteState.player1Voted && newVoteState.player2Voted) {
    toast.success('Both players agreed - debate ending early!');
    setTimeout(() => fetchDebate(), 1000);
  } else if (yourVoteStatus) {
    // Only show this if YOUR status just changed to true
    const wasYourVote = earlyEndVotesRef.current.yourVote;
    if (!wasYourVote) {
      toast.success('Your vote recorded. Waiting for opponent...');
    }
  } else {
    // Opponent voted
    const opponentVoted = isPlayer1 ? newVoteState.player2Voted : newVoteState.player1Voted;
    const wasOpponentVoted = isPlayer1 ? earlyEndVotesRef.current.player2Voted : earlyEndVotesRef.current.player1Voted;

    if (opponentVoted && !wasOpponentVoted) {
      toast('Opponent voted to end debate early.', {
        icon: '👤',
        duration: 4000
      });
    }
  }
};


    socket.on('debate:argumentAdded', handleArgumentAdded);
    socket.on('debate:active', handleDebateStarted);
    socket.on('debate:completed', handleDebateCompleted);
    socket.on('debate:roundAdvanced', handleRoundAdvanced);
    socket.on('debate:cancelled', handleDebateCancelled);
    socket.on('debate:earlyEndVote', handleEarlyEndVote);

    const handleConnect = () => {
      console.log('[DebateRoom] Socket reconnected, rejoining room');
      joinDebateRoom(debateId);
      fetchDebate();
    };

    socket.on('connect', handleConnect);

    return () => {
      console.log('[DebateRoom] Cleaning up socket listeners');
      socket.off('debate:argumentAdded', handleArgumentAdded);
      socket.off('debate:active', handleDebateStarted);
      socket.off('debate:completed', handleDebateCompleted);
      socket.off('debate:roundAdvanced', handleRoundAdvanced);
      socket.off('debate:cancelled', handleDebateCancelled);
      socket.off('debate:earlyEndVote', handleEarlyEndVote);
      socket.off('connect', handleConnect);
      leaveDebateRoom(debateId);
    };
  }, [socket, connected, debateId, navigate, joinDebateRoom, leaveDebateRoom]);

  // Polling for waiting room
  useEffect(() => {
    if (debate?.status !== 'waiting') return;

    console.log('[DebateRoom] Starting polling for waiting room');
    const pollInterval = setInterval(() => {
      console.log('[DebateRoom] Polling for debate update...');
      fetchDebate();
    }, 3000);

    return () => {
      console.log('[DebateRoom] Stopping polling');
      clearInterval(pollInterval);
    };
  }, [debate?.status]);

  // Handle post-debate survey submission
  const handlePostSurveySubmit = async (response) => {
  try {
    console.log('[Survey] Submitting:', response);
    console.log('[Survey] Current debate status:', debate?.status);
    await debateAPI.submitPostSurvey(debateId, response);

    //  Set state FIRST before fetching
    setPostSurveySubmitted(true);
    setShowPostSurvey(false);

    toast.success('Thank you for your feedback!');

    //  Fetch after a small delay to ensure state is set
    setTimeout(() => {
      fetchDebate();
    }, 100);

  } catch (error) {
    console.error('[Survey] Submission error:', error);
    console.error('[Survey] Error response:', error.response?.data);
    toast.error(error.response?.data?.message || 'Failed to submit survey');
    throw error;
  }
};

  const handleSubmitBeliefUpdate = async () => {
    if (!beliefRound || beliefSubmitting) return;

    if (
      Number.isNaN(Number(beliefValue)) ||
      Number.isNaN(Number(influenceValue)) ||
      Number.isNaN(Number(confidenceValue))
    ) {
      toast.error('Please complete all belief check inputs');
      return;
    }

    try {
      setBeliefSubmitting(true);
      console.log('[BeliefDebug] Submitting belief update', {
        debateId,
        round: beliefRound,
        beliefValue,
        influenceValue,
        confidenceValue,
        userId: user?.userId
      });

      // Optimistically hide the prompt and mark this round as handled
      setShowBeliefPrompt(false);
      setSkippedBeliefRounds((prev) => [...new Set([...prev, beliefRound])]);

      await debateAPI.submitBeliefUpdate(debateId, {
        round: beliefRound,
        beliefValue: beliefValue,
        influence: influenceValue,
        confidence: confidenceValue
      });

      console.log('[BeliefDebug] Belief update saved successfully', { debateId, round: beliefRound, userId: user?.userId });
      toast.success('Belief update saved');
      setBeliefValue(50);
      fetchDebate();
    } catch (error) {
      console.error('[BeliefDebug] Error saving belief update', error.response?.data || error.message || error);
      toast.error(error.response?.data?.message || 'Failed to save belief update');
      // If saving failed, allow the user to try again by reopening the prompt
      setShowBeliefPrompt(true);
      setSkippedBeliefRounds((prev) => prev.filter((r) => r !== beliefRound));
    } finally {
      setBeliefSubmitting(false);
    }
  };

  const handleSubmitReflection = async () => {
    if (!debate || !getLatestCompletedRound(debate) || reflectionSubmitting) return;
    const round = getLatestCompletedRound(debate);

    if (!reflectionParaphrase.trim() || !reflectionAcknowledgement.trim()) {
      toast.error('Please complete all reflection inputs');
      return;
    }

    try {
      setReflectionSubmitting(true);
      console.log('[Reflection] Submitting', { debateId, round, paraphrase: reflectionParaphrase });

      await debateAPI.submitReflection(debateId, { round, paraphrase: reflectionParaphrase, acknowledgement: reflectionAcknowledgement });

      toast.success('Reflection saved');
      setReflectionParaphrase('');
      setReflectionAcknowledgement('');
      setReflectionHandledRounds((prev) => [...new Set([...prev, round])]);
      setShowReflectionPrompt(false);
      fetchDebate();
    } catch (err) {
      console.error('[Reflection] Error saving', err.response?.data || err.message || err);
      toast.error(err.response?.data?.message || 'Failed to save reflection');
      setShowReflectionPrompt(true);
    } finally {
      setReflectionSubmitting(false);
    }
  };

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
      const response = await debateAPI.submitArgument(debateId, argument.trim());
      if (response?.data?.debate) {
        setDebate((prev) => {
          if (!prev) return response.data.debate;

          const merged = {
            ...response.data.debate,
            yourStance: prev.yourStance,
            isPlayer1: prev.isPlayer1,
            isPlayer2: prev.isPlayer2
          };

          if (Array.isArray(merged.arguments)) {
            merged.arguments = merged.arguments.map((arg) => ({
              ...arg,
              isYours: arg.stance === prev.yourStance
            }));
          }

          return merged;
        });
      } else {
        fetchDebate();
      }
      setArgument('');
      toast.success('Argument submitted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit argument');
    } finally {
      setSubmitting(false);
    }
  };



  const handleVoteEarlyEnd = async () => {
    if (votingInProgress || earlyEndVotes.yourVote) {
      console.log('[Vote] Already voted or voting in progress');
      return;
    }

    console.log('🔵 [Vote] Starting vote process');
    setVotingInProgress(true);

    try {
      const response = await debateAPI.voteEarlyEnd(debateId);
      console.log('🔵 [Vote] API response:', response);

      //  Always show same message (hide AI mode)
      toast.success('Vote recorded. Waiting for opponent...');

      if (!connected) {
        fetchDebate();
      }
    } catch (error) {
      console.error('🔴 [Vote] Error occurred:', error);
      toast.error(error.response?.data?.message || 'Failed to vote');
      setVotingInProgress(false);
    }
  };

  const handleRevokeEarlyEndVote = async () => {
    try {
      await debateAPI.revokeEarlyEndVote(debateId);
      toast.success('Vote revoked');
      if (!connected) {
        fetchDebate();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to revoke vote');
    }
  };

  //  Get opponent vote status - Always show for consistency
  const getOpponentVoteStatus = () => {
    if (!debate || !debate.earlyEndVotes) return false;

    const isPlayer1 = debate.isPlayer1;
    return isPlayer1 ? earlyEndVotes.player2Voted : earlyEndVotes.player1Voted;
  };

  //  Calculate vote progress - Always 2 votes required
  const getVoteProgress = () => {
    if (!debate || !debate.earlyEndVotes) {
      return {
        current: 0,
        required: 2,
        message: 'No votes yet'
      };
    }

    const player1Voted = earlyEndVotes.player1Voted || false;
    const player2Voted = earlyEndVotes.player2Voted || false;
    const current = (player1Voted ? 1 : 0) + (player2Voted ? 1 : 0);

    return {
      current,
      required: 2,
      message: current === 2 ? 'Both players voted' : `${current}/2 players voted`
    };
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

  // Waiting room view
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

            <button
              onClick={handleCancelDebate}
              className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
            >
              Cancel Debate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active/Completed debate view
  const canSubmitArgument = debate.status === 'active' && debate.arguments;
  const isYourTurn = canSubmitArgument && isReadyForCurrentRoundArgument(debate);
  const isOpponentTurn =
    canSubmitArgument &&
    !!debate.nextTurn &&
    debate.nextTurn !== debate.yourStance &&
    isBeliefCompleteForRound(debate, debate.currentRound - 1);

  const voteProgress = getVoteProgress();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Post-debate survey modal */}
        <PostDebateSurveyModal
          isOpen={showPostSurvey}
          onSubmit={handlePostSurveySubmit}
          onClose={() => setShowPostSurvey(false)}
          isAIOpponent={isHumanAI}
          debate={debate}
        />

        {/* Norms modal shown once before round 1 */}
        {showNorms && (
          <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-semibold mb-3">Discussion Norms</h3>
              <p className="text-sm text-gray-700 mb-4">Goal: discuss pros and cons and see if your view shifts at all — we aim to understand each other's reasons, not to 'destroy' the other side.</p>
              <div className="flex justify-end">
                <button onClick={() => { setShowNorms(false); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Got it</button>
              </div>
            </div>
          </div>
        )}

        {/* Reflection prompt modal */}
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                {debate.topicQuestion}
              </h1>
              <div className="flex items-center space-x-4 text-sm text-gray-600 mb-4">
                <span className={`px-3 py-1 rounded-full font-medium ${
                  debate.status === 'active' ? 'bg-green-100 text-green-800' :
                  debate.status === 'survey_pending' || debate.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {debate.status.toUpperCase()}
                </span>
                <span className="font-medium">Round {debate.currentRound} / {debate.maxRounds}</span>
              </div>

              {/* Survey Completion Banner */}
              {(debate.status === 'survey_pending' || debate.status === 'completed') && !postSurveySubmitted && (
                <button
                  onClick={() => setShowPostSurvey(true)}
                  className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition font-medium text-sm"
                >
                  📋 Complete Post-Debate Survey
                </button>
              )}
            </div>
          </div>

          {/* Players -  No AI indicator shown */}
          <div className="grid grid-cols-1 gap-4">
            <div className="border-2 border-indigo-500 rounded-lg p-4 bg-indigo-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">You</p>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  debate.yourStance === 'for'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {debate.yourStance === 'for' ? '👍 Leaning for' : '👎 Leaning against'}
                </span>
              </div>
              <p className="font-semibold text-lg">{user?.username}</p>
              {debate.currentBelief && (
                <p className="text-xs text-gray-500 mt-1">
                  Current lean: {debate.isPlayer1 ? debate.currentBelief.player1 : debate.currentBelief.player2 || 'unsure'}
                </p>
              )}
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
                            {arg.stance === 'for' ? '👍 Leaning for' : '👎 Leaning against'}
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

        {/*  Early End Voting - Always shows 2 players required */}
        {debate.status === 'active' && debate.currentRound >= 5 && !showReflectionPrompt && !showBeliefPrompt && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                End Debate Early
              </h3>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-900 font-medium mb-2">
                  💡 Important: Allow the discussion to reach a natural conclusion
                </p>
                <p className="text-xs text-blue-800">
                  You can only end the debate after <strong>at least 5 rounds</strong> have been completed.
                  Please continue debating until the discussion naturally concludes or both participants feel their points have been thoroughly discussed.
                </p>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Both participants must agree to conclude this debate early.
              </p>

              {/*  Always show both players */}
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

              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{voteProgress.message}</span>
                  <span>{voteProgress.current}/{voteProgress.required}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(voteProgress.current / voteProgress.required) * 100}%` }}
                  ></div>
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
                  {!getOpponentVoteStatus() && (
                    <p className="text-sm text-center text-amber-600 font-medium">
                      Waiting for opponent's agreement...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reflection (appears after opponent's turn) */}
        {showReflectionPrompt ? (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold mb-2 text-gray-800">Reflection</h3>
            <p className="text-sm text-gray-700 mb-4">Please paraphrase the main concern or point your opponent raised this round, and note if you feel anything changed for you.</p>
            <textarea
              value={reflectionParaphrase}
              onChange={(e) => setReflectionParaphrase(e.target.value)}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded mb-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Paraphrase your opponent's main point..."
              disabled={reflectionSubmitting}
            />
            <input
              value={reflectionAcknowledgement}
              onChange={(e) => setReflectionAcknowledgement(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded mb-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Did this change your view? (short note)"
              disabled={reflectionSubmitting}
            />
            <div className="flex justify-end space-x-2">
              <button onClick={handleSubmitReflection} disabled={reflectionSubmitting || !reflectionParaphrase.trim() || !reflectionAcknowledgement.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">{reflectionSubmitting ? 'Saving...' : 'Submit'}</button>
            </div>
          </div>
        ) : showBeliefPrompt ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-800">
                Belief Check (Round {beliefRound})
              </h3>
              <span className="text-sm text-gray-600">
                Round {debate.currentRound}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              After this round, where do you lean?
            </p>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700">Where do you lean after this round?</label>
              <input
                type="range"
                min="0"
                max="100"
                value={beliefValue}
                onChange={(e) => setBeliefValue(parseInt(e.target.value, 10))}
                className="w-full mt-2"
                disabled={beliefSubmitting}
              />
              <div className="flex items-center justify-between mt-1">
                <div className="text-xs text-gray-500">0 = Leaning Against • 50 = Unsure • 100 = Leaning For</div>
                <div className="text-xs font-medium text-gray-700">{beliefValue}/100</div>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700">
                How much did your opponent's argument influence your thinking this round?
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={influenceValue}
                onChange={(e) => setInfluenceValue(parseInt(e.target.value, 10))}
                className="w-full mt-2"
                disabled={beliefSubmitting}
              />
              <div className="text-xs text-gray-500 mt-1">{influenceValue}/100</div>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700">How confident are you in your current view right now?</label>
              <input
                type="range"
                min="0"
                max="100"
                value={confidenceValue}
                onChange={(e) => setConfidenceValue(parseInt(e.target.value, 10))}
                className="w-full mt-2"
                disabled={beliefSubmitting}
              />
              <div className="text-xs text-gray-500 mt-1">{confidenceValue}/100</div>
            </div>

            <div className="flex items-center justify-end mt-4 space-x-2">
              <button
                onClick={handleSubmitBeliefUpdate}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                disabled={beliefSubmitting}
              >
                {beliefSubmitting ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </div>
        ) : shouldShowWaitingAnimation() ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-indigo-600" size={40} />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Waiting for opponent to complete round checks...
            </h3>
            <p className="text-gray-600 text-sm">
              Your opponent is completing reflection and belief check. The next round will start soon.
            </p>
          </div>
        ) : isYourTurn ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-green-700">
                ✍️ Your Turn - Submit Your Argument
              </h3>
              <span className="text-sm text-gray-600">
                Round {debate.currentRound}
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              <strong>Good norms:</strong> Use reasons, not insults. Acknowledge at least one thing your opponent cares about.
            </div>
            <textarea
              value={argument}
              onChange={(e) => setArgument(e.target.value)}
              placeholder="Enter your argument (max 500 characters)..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows={6}
              maxLength={500}
              disabled={submitting}
            />
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
        ) : debate.status === 'active' && isOpponentTurn ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-indigo-600" size={40} />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Waiting for opponent's argument...
            </h3>
            <p className="text-gray-600 text-sm">
              Your opponent is preparing their response
            </p>
          </div>
        ) : null}

        {/* Completed */}
        {(debate.status === 'survey_pending' || debate.status === 'completed') && postSurveySubmitted && (
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