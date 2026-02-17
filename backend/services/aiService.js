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

    let finalPrompt = this.replacePlaceholders(systemPrompt, context);

    // Enforce respectful, evidence-based, and occasionally conciliatory responses
    finalPrompt += `
AI response requirements:
- Use at least one brief concrete example, piece of evidence, or illustrative scenario to support your main claim (can be hypothetical if needed).
- Keep tone respectful and non-adversarial; avoid insults, sarcasm, or dismissive language.
- Where appropriate, include an acknowledgement or conciliatory phrase such as "I see why someone might disagree" or "I'd be okay with X compromise." This can be brief and should not undermine the main point.
- Prefer clear reasons over rhetoric; cite examples rather than vague claims. Do not invent verifiable facts.
- Keep responses concise, focused, and helpful for understanding tradeoffs.
`;

    if (context.OPPONENT_STANCE_CHOICE === 'unsure') {
      finalPrompt += `\n\nOpponent chose UNSURE. Adjust your approach:\n- be exploratory and collaborative, not combative\n- ask at most one clarifying question if helpful\n- focus on tradeoffs and criteria, not winning\n- avoid dunking or overly absolute claims\n- keep tone curious and constructive\n`;
    }

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

      // Strip the conversation history/opponent argument from the system prompt
      // since we provide those as proper chat messages below.
      // This prevents the model from seeing them as passive context and ignoring them.

      const messages = [
        {
          role: 'system',
          content: systemPrompt
        }
      ];

      // Add debate history as alternating user/assistant messages
      // This makes the model treat the conversation as a real back-and-forth
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

      // Final user message: the opponent's latest argument.
      // Don't duplicate it if it was already the last message in history.
      const lastMsg = messages[messages.length - 1];
      const opponentArg = context.OPPONENT_ARGUMENT;
      const alreadyInHistory = lastMsg && lastMsg.role === 'user' &&
        lastMsg.content.trim() === opponentArg.trim();

      if (opponentArg && opponentArg !== 'No previous arguments yet.' && !alreadyInHistory) {
        messages.push({
          role: 'user',
          content: opponentArg
        });
      } else if (opponentArg === 'No previous arguments yet.') {
        messages.push({
          role: 'user',
          content: `start the debate - share your take on ${context.TOPIC} (${context.STANCE} side). keep it casual and under 500 chars`
        });
      }

      const requestPayload = {
        model: personality.model || this.openaiModel,
        messages: messages,
        max_tokens: Math.min(300, parseInt(process.env.OPENAI_MAX_TOKENS) || 250),
        temperature: 1.0,
        top_p: 0.9,
        presence_penalty: 0.4,
        frequency_penalty: 0.3
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

    const opponentStanceChoice = debate.player1StanceChoice || null;

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
      OPPONENT_STANCE_CHOICE: opponentStanceChoice,
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
    const unsurePrefix = context.OPPONENT_STANCE_CHOICE === 'unsure'
      ? 'i get why you are unsure - lets weigh this carefully. '
      : '';

    const basicArguments = [
      `${unsurePrefix}I ${context.STANCE_VERB} ${context.TOPIC} because ${stancePhrase}. For example, ${context.COUNTER_POINT}. I understand some may disagree; I see why someone might feel that way.`,
      `${unsurePrefix}My stance on ${context.TOPIC} is ${context.STANCE} because the benefits are significant. For instance, ${context.COUNTER_POINT}. I aim to be respectful and offer this as a reasoned view.`,
      `${unsurePrefix}I maintain that ${stancePhrase} regarding ${context.TOPIC}. One brief example: ${context.COUNTER_POINT}. While I hold this view, I acknowledge tradeoffs and would be open to compromise on implementation.`
    ];

    return basicArguments[Math.floor(Math.random() * basicArguments.length)];
  }

  /**
 * Generate counter points based on topic keywords - returns random angle each time
 */
generateCounterPoint(debate) {
  const topic = debate.topicQuestion.toLowerCase();
  const stance = debate.player2Stance;
  const round = debate.currentRound;

  // ✅ Multiple angles for each topic - randomly selected
  const topicAngles = {
    'ai': {
      for: [
        'AI tools enhance learning when used responsibly',
        'automation frees humans for creative work',
        'AI can democratize access to expertise',
        'early adoption builds critical digital literacy',
        'AI augments rather than replaces human intelligence',
        'efficiency gains allow focus on higher-order thinking'
      ],
      against: [
        'over-reliance on AI undermines critical thinking skills',
        'students lose foundational problem-solving abilities',
        'creates unfair advantages and inequality',
        'removes the struggle necessary for deep learning',
        'makes people intellectually lazy and dependent',
        'erodes authentic assessment of student abilities'
      ]
    },
    'pineapple': {
      for: [
        'diverse flavor combinations expand culinary creativity',
        'sweet and savory contrasts are proven flavor science',
        'cultural fusion should be celebrated not gatekept',
        'personal taste preferences are subjective and valid',
        'traditional recipes were once innovations too',
        'texture and acidity balance enhances the dish'
      ],
      against: [
        'traditional recipes exist for good reason',
        'moisture from pineapple ruins pizza texture',
        'fruit on savory dishes violates fundamental culinary principles',
        'sweetness overwhelms the cheese and sauce balance',
        'some boundaries in food pairing should be respected',
        'it disrespects Italian culinary heritage'
      ]
    },
    'work_life': {
      for: [
        'financial security enables long-term life satisfaction',
        'career advancement creates opportunities for family',
        'strong work ethic builds character and discipline',
        'professional success provides resources for better quality of life',
        'delayed gratification leads to greater rewards',
        'building wealth early allows freedom later'
      ],
      against: [
        'work-life balance is essential for overall well-being',
        'time with loved ones cannot be recovered or bought',
        'burnout destroys both productivity and health',
        'relationships and experiences matter more than money',
        'quality of life means nothing without time to enjoy it',
        'regret over missed moments is permanent'
      ]
    }
  };

  // ✅ Detect topic category
  let category = null;
  if (topic.includes('chatgpt') || topic.includes('ai') || topic.includes('gpt')) {
    category = 'ai';
  } else if (topic.includes('pizza') || topic.includes('pineapple')) {
    category = 'pineapple';
  } else if (topic.includes('work') || topic.includes('pay') || topic.includes('life') || topic.includes('balance')) {
    category = 'work_life';
  }

  // ✅ Get angles for this topic and stance
  if (category && topicAngles[category]) {
    const angles = topicAngles[category][stance];

    // Return random angle, avoiding repetition within same debate
    const usedAngles = debate.counterPointsUsed || [];
    const availableAngles = angles.filter(angle => !usedAngles.includes(angle));

    if (availableAngles.length > 0) {
      const selected = availableAngles[Math.floor(Math.random() * availableAngles.length)];

      // Track usage (you'll need to store this in debate object)
      if (!debate.counterPointsUsed) debate.counterPointsUsed = [];
      debate.counterPointsUsed.push(selected);

      return selected;
    }

    // If all used, reset and pick random
    debate.counterPointsUsed = [];
    return angles[Math.floor(Math.random() * angles.length)];
  }

  // ✅ Generic fallback - also with variation
  const genericAngles = {
    for: [
      'the benefits clearly outweigh any potential drawbacks',
      'practical advantages make this approach superior',
      'evidence and data support this position strongly',
      'this addresses real-world needs more effectively',
      'the positive impact on society is undeniable',
      'opponents ignore the tangible benefits'
    ],
    against: [
      'the risks and negative consequences are too significant to ignore',
      'potential harms outweigh any supposed benefits',
      'this creates more problems than it solves',
      'unintended consequences make this dangerous',
      'ethical concerns cannot be dismissed',
      'proponents overlook serious downsides'
    ]
  };

  return genericAngles[stance][Math.floor(Math.random() * genericAngles[stance].length)];
}

  /**
   * Generate strategic notes for advanced AI
   */
  /**
 * Generate strategic notes for advanced AI - varies by round
 */
generateStrategicNotes(debate) {
  const args = debate.arguments;
  const round = debate.currentRound;

  if (args.length === 0) return 'First argument - establish strong foundation.';

  const myArgs = args.filter(a => a.stance === debate.player2Stance);
  const theirArgs = args.filter(a => a.stance !== debate.player2Stance);

  // ✅ Round-specific strategic guidance
  let strategy = '';

  // Early rounds (1-5): Establish position
  if (round <= 5) {
    const strategies = [
      'Establish your core position clearly.',
      'Focus on your strongest argument first.',
      'Set up the framework for your stance.',
      'Address the fundamental question directly.'
    ];
    strategy = strategies[Math.floor(Math.random() * strategies.length)];
  }

  // Mid rounds (6-12): Engage and counter
  else if (round <= 12) {
    if (theirArgs.length > 0) {
      const lastOpponentArg = theirArgs[theirArgs.length - 1].text;
      const strategies = [
        'Counter their specific claim with concrete evidence.',
        'Point out the weakness in their logic.',
        'Introduce a new angle they haven\'t considered.',
        'Use a real-world example to illustrate your point.',
        'Challenge their assumptions directly.',
        'Bring up practical implications they\'re ignoring.'
      ];
      strategy = strategies[Math.floor(Math.random() * strategies.length)];
    } else {
      strategy = 'Build on your previous arguments with new evidence.';
    }
  }

  // Late rounds (13-17): Pivot or deepen
  else if (round <= 17) {
    const strategies = [
      'Shift to a different aspect of the topic you haven\'t explored.',
      'Go deeper into one specific point with detailed analysis.',
      'Use a hypothetical scenario to test their position.',
      'Address the broader implications of this debate.',
      'Focus on the strongest counterargument they\'ve made.',
      'Bring in a fresh perspective or example.'
    ];
    strategy = strategies[Math.floor(Math.random() * strategies.length)];
  }

  // Final rounds (18+): Consolidate or concede gracefully
  else {
    const strategies = [
      'Synthesize your strongest points into a cohesive argument.',
      'Acknowledge valid concerns but reinforce why your stance holds.',
      'Make your most compelling practical argument.',
      'Focus on real-world consequences.',
      'Keep it simple and direct - one strong final point.'
    ];
    strategy = strategies[Math.floor(Math.random() * strategies.length)];
  }

  return `Round ${round}/${debate.maxRounds}. ${strategy}`;
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
      const validResponses = [
        'strengthened',
        'slightly_strengthened',
        'no_effect',
        'slightly_weakened',
        'weakened'
      ];
      if (validResponses.includes(cleanResponse)) {
        console.log('[AI PostSurvey] Response:', cleanResponse);
        return cleanResponse;
      }

      // Fallback based on personality
      const fallbacks = {
        firm_on_stance: 'strengthened',
        convinced_of_stance: 'no_effect',
        open_to_change: 'weakened'
      };

      console.log('[AI PostSurvey] Invalid response, using fallback:', fallbacks[aiPersonality]);
      return fallbacks[aiPersonality];

    } catch (error) {
      console.error('[AI PostSurvey] Error:', error.response?.data || error.message);

      // Fallback based on personality
      const aiPersonality = debate.preDebateSurvey?.player2;
      const fallbacks = {
        firm_on_stance: 'strengthened',
        convinced_of_stance: 'no_effect',
        open_to_change: 'weakened'
      };

      return fallbacks[aiPersonality] || 'weakened';
    }
  }

  async generateBeliefUpdate(debate, roundNumber) {
    try {
      const aiPersonality = debate.preDebateSurvey?.player2;
      const aiStance = debate.player2Stance;

      if (!aiPersonality) {
        console.error('[AI Belief] No AI personality found in pre-survey');
        return null;
      }

      const roundArgs = (debate.arguments || []).filter(arg => arg.round === roundNumber);
      const opponentArgs = roundArgs.filter(arg => arg.stance !== aiStance);
      const ownArgs = roundArgs.filter(arg => arg.stance === aiStance);

      const prompt = aiPersonalities.getBeliefPrompt(
        aiPersonality,
        debate.topicQuestion,
        aiStance,
        roundNumber,
        opponentArgs,
        ownArgs
      );

      if (!this.openaiEnabled || !this.openaiApiKey) {
        return null;
      }

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 80,
          temperature: 0.4
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const raw = response.data.choices[0].message.content.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('[AI Belief] Invalid JSON response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const beliefValue = parseInt(parsed.beliefValue, 10);
      const influence = parseInt(parsed.influence, 10);
      const confidence = parseInt(parsed.confidence, 10);

      if ([beliefValue, influence, confidence].some(val => Number.isNaN(val))) {
        console.log('[AI Belief] Invalid numeric fields');
        return null;
      }

      return {
        beliefValue: Math.min(100, Math.max(0, beliefValue)),
        influence: Math.min(100, Math.max(0, influence)),
        confidence: Math.min(100, Math.max(0, confidence))
      };
    } catch (error) {
      console.error('[AI Belief] Error:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = new AIService();