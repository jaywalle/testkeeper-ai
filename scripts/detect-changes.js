const { getChangedFiles, isGitRepository } = require('../utils/git');
const micromatch = require('micromatch');

/**
 * Detect relevant changes based on configuration
 * @param {Object} config - Configuration object
 * @returns {string[]} Array of relevant changed files
 */
async function detectChanges(config) {
  if (!isGitRepository()) {
    console.error('Current directory is not a git repository');
    return [];
  }

  const changedFiles = getChangedFiles();
  console.log(`Found ${changedFiles.length} changed files:`, changedFiles);

  if (changedFiles.length === 0) {
    console.log('No files changed in the last commit');
    return [];
  }

  // Filter for API specification files
  const apiSpecPaths = config.api_spec_paths;
  const relevantFiles = changedFiles.filter(file => 
    micromatch.isMatch(file, apiSpecPaths)
  );

  console.log(`Found ${relevantFiles.length} relevant API spec changes:`, relevantFiles);
  return relevantFiles;
}

module.exports = {
  detectChanges
};
