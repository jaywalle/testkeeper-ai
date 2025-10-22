const fs = require('fs');
const path = require('path');
const { detectChanges } = require('./scripts/detect-changes');
const suggestUpdates = require('./scripts/suggest-updates');
const createDraftPR = require('./scripts/create-draft-pr');
const { cloneTestRepo } = require('./utils/git');

async function loadConfig(configPath) {
  try {
    const absPath = path.resolve(process.cwd(), configPath);
    const raw = fs.readFileSync(absPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to load config file at ${configPath}:`, err.message);
    
    // Provide default config if file doesn't exist
    console.log('📝 Using default configuration...');
    return {
      api_spec_paths: ['**/openapi.yaml', '**/openapi.yml', '**/swagger.json'],
      test_code_paths: ['tests/**/*.js', 'tests/**/*.ts', 'test/**/*.js', 'test/**/*.ts'],
      detector: 'api',
      model: process.env.INPUT_OPENAI_MODEL || 'gpt-4o-mini'
    };
  }
}

function validateConfig(config) {
  const required = ['api_spec_paths', 'detector', 'test_code_paths'];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    console.error(`Missing required config keys: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  if (!process.env.TEST_REPO_PAT) {
    console.error('TEST_REPO_PAT environment variable is required for cross-repo operations');
    process.exit(1);
  }

  if (!process.env.INPUT_TEST_REPO_URL ) {
    console.error('test_repo_url input is required');
    process.exit(1);
  }
}

(async () => {
  try {
    console.log('🚀 AI-Assisted Test Updater starting...');
    
    const configPath = process.env.INPUT_CONFIG_FILE_PATH || '.test-updater-config.json';
    const config = await loadConfig(configPath);
    
    config.test_repo = {
      branch: process.env.INPUT_TEST_REPO_BRANCH || 'main',
      url: process.env.INPUT_TEST_REPO_URL
    };
    
    if (process.env.INPUT_OPENAI_MODEL) {
      config.model = process.env.INPUT_OPENAI_MODEL;
    }
    
    validateConfig(config);
    console.log('✅ Configuration loaded and validated');
    console.log(`📊 Target test repo: ${config.test_repo.url}`);

    // Detect relevant file changes in source repo
    const changedFiles = await detectChanges(config);
    
    if (changedFiles.length === 0) {
      console.log("📝 No relevant API spec changes detected. Exiting.");
      process.exit(0);
    }

    // Load the appropriate detector
    const detectorPath = `./detectors/${config.detector}-detector.js`;
    if (!fs.existsSync(detectorPath)) {
      console.error(`Detector not found: ${detectorPath}`);
      process.exit(1);
    }

    const detector = require(detectorPath);
    console.log(`🔍 Running ${config.detector} detector on ${changedFiles.length} files...`);
    
    const diffs = await detector.run(changedFiles, config);
    
    if (diffs.length === 0) {
      console.log("📝 No API changes detected in the specifications. Exiting.");
      process.exit(0);
    }

    console.log(`📊 Found ${diffs.length} API specification changes`);

    // Clone test repository to analyze existing tests
    console.log('📥 Cloning test repository...');
    const testRepoPath = await cloneTestRepo(config.test_repo);

    // Generate AI suggestions with test repo context
    console.log('🤖 Generating AI suggestions for test updates...');
    const suggestions = await suggestUpdates(diffs, config, testRepoPath);

    if (suggestions.length === 0) {
      console.log("📝 No test update suggestions generated. Exiting.");
      process.exit(0);
    }

    console.log(`💡 Generated ${suggestions.length} test update suggestions`);

    // Create draft PR in test repository
    console.log('📋 Creating draft pull request in test repository...');
    await createDraftPR(suggestions, config, testRepoPath);
    console.log('✅ Draft pull request created successfully');

    console.log('🎉 AI-Assisted Test Updater completed successfully!');
  } catch (error) {
    console.error('❌ Error running AI-Assisted Test Updater:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
