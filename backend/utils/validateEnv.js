function validateEnv() {
  console.log('\n[Env] Validating environment variables...');

  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'PORT'
  ];

  const optional = {
    'OPENAI_API_KEY': 'GPT-4o-mini AI opponents will not be available',
    'ENABLE_OPENAI': 'OpenAI integration disabled (default: true)'
  };

  // Check required
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('❌ Please check your .env.development or .env.production file');
    process.exit(1);
  }

  console.log('✅ Required variables: OK');

  // ✅ NEW: Validate production MongoDB Atlas URI
  if (process.env.NODE_ENV === 'production') {
    const prodUriRegex = /^mongodb\+srv:\/\/[a-zA-Z0-9_-]+:[^@]+@cluster[0-9]+\.[a-z0-9]+\.mongodb\.net/i;
    if (!prodUriRegex.test(process.env.MONGODB_URI)) {
      console.error('❌ PRODUCTION ERROR: MONGODB_URI must be Atlas connection string');
      console.error('❌ Expected: mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/db');
      console.error('❌ Got:', process.env.MONGODB_URI?.substring(0, 50) + '...');
      process.exit(1);
    }
    console.log('✅ Production MongoDB Atlas URI: Valid');
  } else {
    // Development: allow localhost or Atlas
    const devUriRegex = /(mongodb:\/\/localhost|mongodb\+srv:\/\/.*mongodb\.net)/i;
    if (!devUriRegex.test(process.env.MONGODB_URI)) {
      console.warn('⚠️  Development MONGODB_URI looks suspicious - not localhost or Atlas');
      console.log('   Current:', process.env.MONGODB_URI?.substring(0, 30) + '...');
    } else {
      console.log('✅ Development MongoDB URI: OK');
    }
  }

  // Warn about optional
  let hasAIKey = false;
  Object.entries(optional).forEach(([key, warning]) => {
    if (process.env[key]) {
      console.log(`✅ ${key}: Set`);
      hasAIKey = true;
    } else {
      console.warn(`⚠️  ${key}: Not set - ${warning}`);
    }
  });

  if (!hasAIKey) {
    console.warn('⚠️  No AI API keys configured. Only rule-based bots will be available.');
  }

  console.log('✅ Environment validation complete\n');
}

module.exports = validateEnv;