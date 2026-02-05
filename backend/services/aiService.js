const aiPersonalities = require('../config/aiPersonalities');
const axios = require('axios');

class AIService {
  constructor() {
    this.personalities = aiPersonalities;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiEnabled = process.env.ENABLE_OPENAI === 'true';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  /**
   * Generate argument - Main entry point
   */
  async generateArgument(debate, customPrompt = null) {
    const personality = this.personalities[debate.player2AIModel];

    if (!personality) {
      throw new Error(`AI personality '${debate.player2AIModel}' not found`);
    }

    console.log('[AI Service] Generating argument for:', {
      model: debate.player2AIModel,
      stance: debate.player2Stance,
      round: debate.currentRound,
      hasCustomPrompt: !!customPrompt,
      aiModel: personality.model || this.openaiModel
    });

    // Prepare context
    const context = this.prepareContext(debate);

    // Use custom prompt if provided, otherwise use default
    const systemPrompt = customPrompt || debate.player2AIPrompt || personality.defaultPrompt;

    // Replace placeholders in prompt
    const finalPrompt = this.replacePlaceholders(systemPrompt, context);

    let argument;

    if (personality.requiresAPIKey && this.openaiEnabled && this.openaiApiKey) {
      argument = await this.generateWithOpenAI(finalPrompt, personality, context);
    } else {
      // Rule-based fallback (no templates now, so basic fallback)
      argument = this.generateBasicFallback(context, personality);
    }

    // Ensure argument meets constraints
    argument = this.enforceConstraints(argument, personality);

    console.log('[AI Service] Final argument:', argument.substring(0, 80) + '...');

    return argument;
  }

  /**
   * Generate argument with OpenAI
   */
  async generateWithOpenAI(systemPrompt, personality, context) {
    try {
      console.log('[AI Service] Calling OpenAI API with model:', personality.model || this.openaiModel);

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        }
      ];

      // Add debate history as alternating user/assistant messages
      if (context.DEBATE_HISTORY && context.DEBATE_HISTORY !== 'Debate just started.') {
        const historyLines = context.DEBATE_HISTORY.split('\n').filter(line => line.trim());

        historyLines.forEach(line => {
          const match = line.match(/\d+\.\s*\[(\w+)\]:\s*(.+)/);
          if (match) {
            const [, stance, text] = match;
            const isAIArgument = stance.toLowerCase() === context.STANCE.toLowerCase();
            messages.push({
              role: isAIArgument ? 'assistant' : 'user',
              content: text.trim()
            });
          }
        });
      }

      // Add current round instruction
      messages.push({
        role: 'user',
        content: `Round ${context.CURRENT_ROUND}/${context.MAX_ROUNDS}. Generate your next argument for the ${context.STANCE} stance on "${context.TOPIC}". Maximum 500 characters. ${context.OPPONENT_ARGUMENT !== 'No previous arguments yet.' ? 'Respond to: ' + context.OPPONENT_ARGUMENT : ''}`
      });

      const requestPayload = {
        model: personality.model || this.openaiModel,
        messages: messages,
        max_tokens: Math.min(300, parseInt(process.env.OPENAI_MAX_TOKENS) || 250),
        temperature: 0.7,
        top_p: 0.9,
        presence_penalty: 0.4,
        frequency_penalty: 0.2
      };

      if (process.env.DEBUG_AI === 'true') {
        console.log('[AI Service] 📤 Request payload:', JSON.stringify(requestPayload, null, 2));
      }

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        requestPayload,
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 25000
        }
      );

      const aiArgument = response.data.choices[0].message.content.trim();

      console.log('[AI Service] ✅ OpenAI response received (model:', personality.model || this.openaiModel + ')');
      console.log('[AI Service] 📊 Token usage:', response.data.usage);

      return aiArgument;

    } catch (error) {
      console.error('[AI Service] ❌ OpenAI API error:', error.response?.data || error.message);
      console.log('[AI Service] Using basic fallback');
      return this.generateBasicFallback(context, personality);
    }
  }

  /**
   * Prepare debate context for prompt
   */
  prepareContext(debate) {
    const lastOpponentArg = debate.arguments
      .filter(arg => arg.stance !== debate.player2Stance)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    const stancePhrase = debate.player2Stance === 'for'
      ? 'we should support this'
      : 'we should oppose this';

    const stanceVerb = debate.player2Stance === 'for'
      ? 'support'
      : 'oppose';

    // Build debate history
    const debateHistory = debate.arguments
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((arg, i) => `${i + 1}. [${arg.stance.toUpperCase()}]: ${arg.text}`)
      .join('\n');

    return {
      TOPIC: debate.topicQuestion,
      STANCE: debate.player2Stance.toUpperCase(),
      STANCE_PHRASE: stancePhrase,
      STANCE_VERB: stanceVerb,
      CURRENT_ROUND: debate.currentRound,
      MAX_ROUNDS: debate.maxRounds,
      OPPONENT_ARGUMENT: lastOpponentArg ? lastOpponentArg.text : 'No previous arguments yet.',
      DEBATE_HISTORY: debateHistory || 'Debate just started.',
      COUNTER_POINT: this.generateCounterPoint(debate),
      STRATEGIC_NOTES: this.generateStrategicNotes(debate)
    };
  }

  /**
   * Replace placeholders in prompt template
   */
  replacePlaceholders(prompt, context) {
    let result = prompt;
    Object.keys(context).forEach(key => {
      const placeholder = `{${key}}`;
      result = result.split(placeholder).join(context[key]);
    });
    return result;
  }

  /**
   * Basic fallback when API is unavailable
   */
  generateBasicFallback(context, personality) {
    const stancePhrase = context.STANCE_PHRASE;

    const basicArguments = [
      `I ${context.STANCE_VERB} ${context.TOPIC} because ${stancePhrase}. This position is supported by clear evidence and logical reasoning.`,
      `My stance on ${context.TOPIC} is ${context.STANCE} because the benefits are significant. ${context.COUNTER_POINT}.`,
      `I maintain that ${stancePhrase} regarding ${context.TOPIC}. The evidence strongly supports this position.`
    ];

    return basicArguments[Math.floor(Math.random() * basicArguments.length)];
  }

  /**
   * Generate counter points based on topic keywords
   */
  generateCounterPoint(debate) {
    const topic = debate.topicQuestion.toLowerCase();
    const stance = debate.player2Stance;

    if (topic.includes('chatgpt') || topic.includes('ai')) {
      return stance === 'for'
        ? 'AI tools enhance learning when used responsibly'
        : 'over-reliance on AI undermines critical thinking skills';
    }
    if (topic.includes('pizza') || topic.includes('pineapple')) {
      return stance === 'for'
        ? 'diverse flavor combinations expand culinary creativity'
        : 'traditional recipes exist for good reason';
    }
    if (topic.includes('work') || topic.includes('pay') || topic.includes('life')) {
      return stance === 'for'
        ? 'financial security enables long-term life satisfaction'
        : 'work-life balance is essential for overall well-being';
    }

    return stance === 'for'
      ? 'the benefits clearly outweigh any potential drawbacks'
      : 'the risks and negative consequences are too significant to ignore';
  }

  /**
   * Generate strategic notes for advanced AI
   */
  generateStrategicNotes(debate) {
    const args = debate.arguments;
    if (args.length === 0) return 'First argument - establish strong foundation.';

    const myArgs = args.filter(a => a.stance === debate.player2Stance);
    const theirArgs = args.filter(a => a.stance !== debate.player2Stance);

    return `You've made ${myArgs.length} arguments. Opponent has made ${theirArgs.length}. ${
      myArgs.length < theirArgs.length
        ? 'Focus on addressing their strongest point.'
        : 'Build on your previous arguments and introduce new evidence.'
    }`;
  }

  /**
   * Enforce constraints (length, character limits)
   */
  enforceConstraints(argument, personality) {
  // Calculate target length with variation
  const minLength = personality.argumentLength.min;
  const maxLength = Math.min(500, personality.argumentLength.max);

  // Add randomness: target length varies ±10% from midpoint
  const midpoint = (minLength + maxLength) / 2;
  const variation = midpoint * 0.1;
  const targetLength = Math.floor(
    midpoint + (Math.random() * 2 - 1) * variation
  );

  // Smart truncation at sentence boundaries
  if (argument.length > targetLength) {
    // Find last complete sentence before target
    const truncated = argument.substring(0, targetLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');

    const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);

    if (lastSentenceEnd > minLength) {
      // Cut at sentence boundary
      argument = argument.substring(0, lastSentenceEnd + 1);
    } else {
      // No good sentence break, cut at word boundary
      const cutPoint = truncated.lastIndexOf(' ');
      argument = cutPoint > 0
        ? argument.substring(0, cutPoint)
        : truncated;
    }
  }

  return argument.trim();
}


  /**
   * Get list of available AI personalities
   */
  getAvailablePersonalities() {
    const aiPersonalitiesModule = require('../config/aiPersonalities');
    return aiPersonalitiesModule.getAIPersonalities();
  }

  /**
   * Get personality details with default prompt
   */
  getPersonalityDetails(modelId) {
    const personality = this.personalities[modelId];
    if (!personality) {
      throw new Error(`Personality '${modelId}' not found`);
    }
    return {
      id: modelId,
      name: personality.name,
      personality: personality.personality,
      model: personality.model || 'gpt-4o-mini',
      defaultPrompt: personality.defaultPrompt,
      responseDelay: personality.responseDelay,
      argumentLength: personality.argumentLength
    };
  }

  /**
   * Generate AI's post-debate survey response
   */
  async generatePostSurveyResponse(debate) {
    try {
      const aiPersonality = debate.preDebateSurvey.player2;
      const aiStance = debate.player2Stance;

      if (!aiPersonality) {
        console.error('[AI PostSurvey] No AI personality found in pre-survey');
        return 'opponent_made_points';
      }

      console.log('[AI PostSurvey] Generating response for personality:', aiPersonality);

      // Get opponent's arguments
      const humanArguments = debate.arguments.filter(arg => arg.stance !== aiStance);

      // Use the helper from aiPersonalities
      const prompt = aiPersonalities.getPostSurveyPrompt(
        aiPersonality,
        debate.topicQuestion,
        aiStance,
        humanArguments
      );

      // Call OpenAI API
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 50,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const cleanResponse = response.data.choices[0].message.content.trim().toLowerCase();

      // Validate response
      const validResponses = ['still_firm', 'opponent_made_points', 'convinced_to_change'];
      if (validResponses.includes(cleanResponse)) {
        console.log('[AI PostSurvey] Response:', cleanResponse);
        return cleanResponse;
      }

      // Fallback based on personality
      const fallbacks = {
        firm_on_stance: 'still_firm',
        convinced_of_stance: 'opponent_made_points',
        open_to_change: 'opponent_made_points'
      };

      console.log('[AI PostSurvey] Invalid response, using fallback:', fallbacks[aiPersonality]);
      return fallbacks[aiPersonality];

    } catch (error) {
      console.error('[AI PostSurvey] Error:', error.response?.data || error.message);

      // Fallback based on personality
      const aiPersonality = debate.preDebateSurvey?.player2;
      const fallbacks = {
        firm_on_stance: 'still_firm',
        convinced_of_stance: 'opponent_made_points',
        open_to_change: 'opponent_made_points'
      };

      return fallbacks[aiPersonality] || 'opponent_made_points';
    }
  }
}

module.exports = new AIService();