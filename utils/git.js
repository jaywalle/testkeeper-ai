const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get list of files changed between current commit and previous commit
 * @returns {string[]} Array of changed file paths
 */
function getChangedFiles() {
  try {
    const output = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' });
    return output.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.warn('Could not get changed files from git:', error.message);
    return [];
  }
}

/**
 * Get the content of a file from a specific git revision
 * @param {string} filePath - Path to the file
 * @param {string} revision - Git revision (e.g., 'HEAD~1')
 * @returns {string} File content
 */
function getFileAtRevision(filePath, revision = 'HEAD~1') {
  try {
    return execSync(`git show ${revision}:${filePath}`, { encoding: 'utf8' });
  } catch (error) {
    console.warn(`Could not get file ${filePath} at revision ${revision}:`, error.message);
    return '';
  }
}

/**
 * Get current content of a file
 * @param {string} filePath - Path to the file
 * @returns {string} File content
 */
function getCurrentFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.warn(`Could not read file ${filePath}:`, error.message);
    return '';
  }
}

/**
 * Check if the current directory is a git repository
 * @returns {boolean} True if git repo, false otherwise
 */
function isGitRepository() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Clone the test repository to a temporary directory
 * @param {Object} testRepo - Test repository configuration
 * @returns {string} Path to cloned repository
 */
async function cloneTestRepo(testRepo) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-repo-'));
  
  // Support both full URLs and owner/name format
  let repoUrl;
  if (testRepo.url) {
    repoUrl = testRepo.url.replace('https://', `https://${process.env.TEST_REPO_PAT}@`);
  } 
  try {
    console.log(`📥 Cloning ${testRepo.url}...`);
    
    // Clone the repository
    execSync(`git clone --depth=1 --branch=${testRepo.branch} "${repoUrl}" "${tempDir}"`, { 
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    console.log(`✅ Test repository cloned to ${tempDir}`);
    return tempDir;
  } catch (error) {
    console.error(`Failed to clone test repository: ${error.message}`);
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Get test files from cloned repository
 * @param {string} testRepoPath - Path to cloned test repository
 * @param {string[]} testCodePaths - Glob patterns for test files
 * @returns {string[]} Array of test file paths
 */
function getTestFilesFromRepo(testRepoPath, testCodePaths) {
  const { glob } = require('glob');
  const allFiles = [];
  
  for (const pattern of testCodePaths) {
    try {
      const files = glob.sync(pattern, { 
        cwd: testRepoPath,
        ignore: 'node_modules/**'
      });
      
      // Convert to absolute paths
      const absoluteFiles = files.map(file => path.join(testRepoPath, file));
      allFiles.push(...absoluteFiles);
    } catch (error) {
      console.warn(`Could not find files matching pattern ${pattern} in test repo:`, error.message);
    }
  }
  
  return [...new Set(allFiles)]; // Remove duplicates
}

/**
 * Setup git configuration for committing in test repo
 * @param {string} testRepoPath - Path to test repository
 */
function setupGitConfig(testRepoPath) {
  try {
    execSync('git config user.name "AI Test Updater"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.email "ai-test-updater@github-actions.com"', { cwd: testRepoPath, stdio: 'pipe' });
  } catch (error) {
    console.warn('Could not set git config:', error.message);
  }
}

module.exports = {
  getChangedFiles,
  getFileAtRevision,
  getCurrentFileContent,
  isGitRepository,
  cloneTestRepo,
  getTestFilesFromRepo,
  setupGitConfig
};
