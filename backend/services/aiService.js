const aiPersonalities = require('../config/aiPersonalities');
const axios = require('axios');

class AIService {
  constructor() {
    this.personalities = aiPersonalities;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    // Removed Anthropic/Claude since we're using cheap OpenAI models only
    this.openaiEnabled = process.env.ENABLE_OPENAI === 'true';
    // ✅ UPDATED: Default to cheapest model
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  /**
   * Generate argument - Main entry point (SIMPLIFIED FOR OPENAI ONLY)
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

    // ✅ SIMPLIFIED: All AI personalities now use OpenAI with per-personality model
    let argument;

    if (personality.requiresAPIKey && this.openaiEnabled && this.openaiApiKey) {
      argument = await this.generateWithOpenAI(finalPrompt, personality, context);
    } else {
      // Rule-based fallback for template-based bots
      argument = this.generateRuleBased(finalPrompt, personality, context);
    }

    // Ensure argument meets constraints
    argument = this.enforceConstraints(argument, personality);

    console.log('[AI Service] Final argument:', argument.substring(0, 80) + '...');

    return argument;
  }

  /**
   * Generate argument with OpenAI (gpt-4o-mini or gpt-3.5-turbo)
   */
  async generateWithOpenAI(systemPrompt, personality, context) {
    try {
      console.log('[AI Service] Calling OpenAI API with model:', personality.model || this.openaiModel);

      // ✅ Build messages array with conversation history
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        }
      ];

      // ✅ Add debate history as alternating user/assistant messages
      if (context.DEBATE_HISTORY && context.DEBATE_HISTORY !== 'Debate just started.') {
        const historyLines = context.DEBATE_HISTORY.split('\n').filter(line => line.trim());

        historyLines.forEach(line => {
          const match = line.match(/\d+\.\s*\[(\w+)\]:\s*(.+)/);
          if (match) {
            const [, stance, text] = match;
            // AI's arguments are 'assistant', opponent's are 'user'
            const isAIArgument = stance.toLowerCase() === context.STANCE.toLowerCase().replace(' ', '');
            messages.push({
              role: isAIArgument ? 'assistant' : 'user',
              content: text.trim()
            });
          }
        });
      }

      // ✅ Add current round instruction
      messages.push({
        role: 'user',
        content: `Round ${context.CURRENT_ROUND}/${context.MAX_ROUNDS}. Generate your next argument for the ${context.STANCE} stance on "${context.TOPIC}". Maximum 500 characters. ${context.OPPONENT_ARGUMENT !== 'No previous arguments yet.' ? 'Respond to: ' + context.OPPONENT_ARGUMENT : ''}`
      });

      // ✅ OPTIMIZED for cheap models
      const requestPayload = {
        model: personality.model || this.openaiModel, // Use personality-specific model
        messages: messages,
        max_tokens: Math.min(300, parseInt(process.env.OPENAI_MAX_TOKENS) || 250), // Conservative for cost
        temperature: personality.difficulty === 'easy' ? 0.5 : 0.7, // Lower for easy bots
        top_p: 0.9,
        presence_penalty: 0.4,
        frequency_penalty: 0.2
      };

      // Log request if debugging
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
          timeout: 25000 // Reduced timeout for faster cheap models
        }
      );

      const aiArgument = response.data.choices[0].message.content.trim();

      console.log('[AI Service] ✅ OpenAI response received (model:', personality.model || this.openaiModel + ')');
      console.log('[AI Service] 📊 Token usage:', response.data.usage);

      return aiArgument;

    } catch (error) {
      console.error('[AI Service] ❌ OpenAI API error:', error.response?.data || error.message);
      console.log('[AI Service] Using rule-based fallback');
      return this.generateRuleBased(systemPrompt, personality, context);
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
   * Rule-based argument generation (for fallback)
   */
  generateRuleBased(prompt, personality, context) {
    const templates = personality.templates;
    const roundType = this.determineRoundType(context.CURRENT_ROUND, context.MAX_ROUNDS);

    let template;
    if (roundType === 'opening') {
      template = templates.opening[Math.floor(Math.random() * templates.opening.length)];
    } else if (roundType === 'closing') {
      template = templates.closing[Math.floor(Math.random() * templates.closing.length)];
    } else {
      template = templates.counter[Math.floor(Math.random() * templates.counter.length)];
    }

    // Replace placeholders in template
    let argument = this.replacePlaceholders(template, context);

    // Add some variation based on opponent's argument
    if (context.OPPONENT_ARGUMENT !== 'No previous arguments yet.') {
      const response = this.generateContextualResponse(
        context.OPPONENT_ARGUMENT,
        context.STANCE,
        personality.difficulty
      );
      argument += ' ' + response;
    }

    return argument;
  }

  /**
   * Generate contextual response to opponent's argument
   */
  generateContextualResponse(opponentArg, stance, difficulty) {
    const responses = {
      easy: [
        "That's one way to look at it.",
        "But there are other factors to consider.",
        "This overlooks some important points."
      ],
      medium: [
        "However, this analysis doesn't account for the broader implications.",
        "While that point has merit, it fails to address the core issue.",
        "This argument overlooks critical evidence that contradicts this view."
      ],
      hard: [
        "This reasoning, though initially persuasive, collapses under closer scrutiny.",
        "The logical structure of this argument contains a fundamental flaw that undermines its conclusion.",
        "While superficially compelling, this position fails to withstand rigorous examination of the underlying premises."
      ]
    };

    const pool = responses[difficulty] || responses.medium;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Determine round type
   */
  determineRoundType(current, max) {
    if (current === 1) return 'opening';
    if (current === max) return 'closing';
    return 'middle';
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
    // Trim to max 500 characters (debate rule)
    if (argument.length > 500) {
      argument = argument.substring(0, 497) + '...';
    }

    // Ensure minimum length for personality
    const minLength = personality.argumentLength.min;
    if (argument.length < minLength) {
      argument += ' This position is well-supported by evidence and sound reasoning.';
    }

    return argument.trim();
  }

  /**
   * Get list of available AI personalities
   */
  getAvailablePersonalities() {
    return Object.keys(this.personalities).map(key => ({
      id: key,
      name: this.personalities[key].name,
      difficulty: this.personalities[key].difficulty,
      displayName: this.personalities[key].displayName,
      model: this.personalities[key].model || 'gpt-4o-mini',
      requiresAPIKey: this.personalities[key].requiresAPIKey
    }));
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
      difficulty: personality.difficulty,
      model: personality.model || 'gpt-4o-mini',
      defaultPrompt: personality.defaultPrompt,
      responseDelay: personality.responseDelay,
      argumentLength: personality.argumentLength
    };
  }
}

module.exports = new AIService();