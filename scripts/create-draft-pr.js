const { execSync } = require("child_process");
const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");
const { setupGitConfig } = require("../utils/git");

async function createDraftPR(suggestions, config, testRepoPath) {
  // Create a more descriptive branch name
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits for uniqueness
  
  // Extract API file names to include in branch name
  const apiFiles = suggestions.map(s => 
    path.basename(s.file, path.extname(s.file))
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase()
  ).slice(0, 2); // Max 2 files to keep name reasonable
  
  const apiFilesPart = apiFiles.length > 0 ? `-${apiFiles.join('-')}` : '';
  const branchName = `ai-test-updates/${date}${apiFilesPart}-${timestamp}`;
  
  try {
    // Set up git config in test repo
    setupGitConfig(testRepoPath);
    
    // Create new branch in test repository
    console.log(`Creating branch: ${branchName} in test repository`);
    execSync(`git checkout -b ${branchName}`, { 
      cwd: testRepoPath,
      stdio: 'pipe' 
    });

    const modifiedFiles = [];
    let testsCreated = 0;
    let testsModified = 0;

    // Process each suggestion and generate actual test code
    for (const suggestion of suggestions) {
      if (suggestion.generatedTests && suggestion.generatedTests.length > 0) {
        console.log(`🔧 Processing ${suggestion.generatedTests.length} test changes for ${suggestion.file}`);
        
        for (const testFile of suggestion.generatedTests) {
          try {
            await applyTestChanges(testFile, testRepoPath);
            // Use path relative to test repo root for git commands
            const relativePath = path.relative(testRepoPath, testFile.absolutePath);
            modifiedFiles.push(relativePath);
            
            if (testFile.action === 'create') {
              testsCreated++;
            } else {
              testsModified++;
            }
          } catch (error) {
            console.error(`Error applying changes to ${testFile.filePath}:`, error.message);
          }
        }
      }
      
      // Also create a summary file for reference
      await createSummaryFile(suggestion, testRepoPath);
    }

    if (modifiedFiles.length === 0) {
      console.log('⚠️ No test files were modified. Creating summary only.');
      // Create a summary file if no actual changes were made
      const summaryPath = path.join(testRepoPath, 'AI_TEST_SUGGESTIONS.md');
      const summaryContent = suggestions.map(s => `# ${s.file}\n\n${s.aiOutput}`).join('\n\n---\n\n');
      fs.writeFileSync(summaryPath, summaryContent);
      modifiedFiles.push('AI_TEST_SUGGESTIONS.md');
    }

    // Stage all modified files
    modifiedFiles.forEach(file => {
      execSync(`git add "${file}"`, { 
        cwd: testRepoPath,
        stdio: 'pipe' 
      });
    });

    // Commit changes in test repo
    const commitMessage = `🤖 AI-generated test updates

✨ Changes:
- Created ${testsCreated} new test file(s)
- Modified ${testsModified} existing test file(s)
- Based on API changes in: ${suggestions.map(s => s.file).join(', ')}

🔍 API Changes Detected:
${suggestions.map(s => s.changes.map(c => `- ${c.type}: ${c.path || c.method || 'general'}`).join('\n')).join('\n')}

Generated automatically on ${new Date().toISOString()}`;

    execSync(`git commit -m "${commitMessage}"`, { 
      cwd: testRepoPath,
      stdio: 'pipe' 
    });
    console.log('✅ Changes committed to test repository branch');

    // Push branch to test repo
    execSync(`git remote set-url origin ${config.test_repo.url}`, { 
      cwd: testRepoPath,
      stdio: 'pipe' 
    });
    
    execSync(`git push origin ${branchName}`, { 
      cwd: testRepoPath,
      stdio: 'pipe' 
    });
    console.log('✅ Branch pushed to test repository');

    // Create PR in test repository
    await createGitHubPR(config, branchName, suggestions, { testsCreated, testsModified, modifiedFiles });

    // Cleanup: remove test repo clone
    try {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
      console.log('🧹 Cleaned up temporary test repository clone');
    } catch (cleanupError) {
      console.warn('Could not cleanup test repo clone:', cleanupError.message);
    }

  } catch (error) {
    console.error('Error creating draft PR:', error.message);
    
    // Try to cleanup
    try {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw error;
  }
}

async function applyTestChanges(testFile) {
  const { filePath, action, description, code, absolutePath } = testFile;
  
  console.log(`📝 ${action}: ${filePath} - ${description}`);
  
  // Ensure directory exists
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (action === 'create') {
    // Create new test file
    fs.writeFileSync(absolutePath, code);
    console.log(`✅ Created new test file: ${filePath}`);
  } else if (action === 'update' || action === 'modify') {
    // For updates, we'll append or replace content
    // In a more sophisticated version, we could parse and merge intelligently
    
    if (fs.existsSync(absolutePath)) {
      const existingContent = fs.readFileSync(absolutePath, 'utf8');
      
      // Simple strategy: append new tests to existing file
      const updatedContent = `${existingContent}\n\n// === AI-Generated Test Updates ===\n// ${description}\n\n${code}`;
      fs.writeFileSync(absolutePath, updatedContent);
      console.log(`✅ Updated test file: ${filePath}`);
    } else {
      // File doesn't exist, create it
      fs.writeFileSync(absolutePath, code);
      console.log(`✅ Created test file (was marked as update): ${filePath}`);
    }
  }
}

async function createSummaryFile(suggestion, testRepoPath) {
  const summaryDir = path.join(testRepoPath, 'ai-generated-tests');
  if (!fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
  }
  
  const summaryFile = path.join(summaryDir, `summary-${path.basename(suggestion.file, path.extname(suggestion.file))}.md`);
  const content = `# Test Updates for ${suggestion.file}

## 📊 Summary
- **Source File**: \`${suggestion.file}\`
- **Changes Detected**: ${suggestion.changes.length}
- **Test Files Generated**: ${suggestion.generatedTests ? suggestion.generatedTests.length : 0}

## 🔍 API Changes
\`\`\`json
${JSON.stringify(suggestion.changes, null, 2)}
\`\`\`

## 🤖 Generated Test Files
${suggestion.generatedTests ? suggestion.generatedTests.map(t => `- **${t.action}**: \`${t.filePath}\` - ${t.description}`).join('\n') : 'None'}

## 📝 AI Analysis
${suggestion.aiOutput}

---
*Generated by AI-Assisted Test Updater on ${new Date().toISOString()}*
`;
  
  fs.writeFileSync(summaryFile, content);
}

async function createGitHubPR(config, branchName, suggestions, stats) {
  if (!process.env.TEST_REPO_PAT) {
    console.warn('TEST_REPO_PAT not provided. Skipping GitHub PR creation.');
    return;
  }

  try {
    const githubHost = process.env.GITHUB_HOST || 'github.com';
    const baseUrl = githubHost === 'github.com' 
      ? undefined 
      : `https://${githubHost}/api/v3`;
    
    const octokit = new Octokit({ 
      auth: process.env.TEST_REPO_PAT,
      baseUrl: baseUrl
    });
    
    // Get source repository info from GitHub context
    const sourceRepo = process.env.GITHUB_REPOSITORY || 'unknown/unknown';
    const sourceCommit = process.env.GITHUB_SHA || 'unknown';
    const sourceRef = process.env.GITHUB_REF || 'unknown';
    
    const changesSummary = suggestions.map(s => 
      `- **${s.file}**: ${s.changes.length} change(s) - ${s.changes.map(c => c.type).join(', ')}`
    ).join('\n');
    
    const filesSummary = stats.modifiedFiles.map(file => `- \`${file}\``).join('\n');
    
    const prBody = `## 🤖 AI-Generated Test Code

This PR contains **automatically generated test code** based on API specification changes detected in the source repository. The tests are ready for review and should be executable.

### 📊 Changes Summary
- **${stats.testsCreated}** new test files created
- **${stats.testsModified}** existing test files updated
- **${suggestions.length}** API specification changes processed

### 🎯 Source Information
- **Source Repository**: \`${sourceRepo}\`
- **Source Commit**: \`${sourceCommit.substring(0, 8)}\`
- **Source Ref**: \`${sourceRef}\`

### 🔍 API Changes Detected
${changesSummary}

### 📂 Modified Files
${filesSummary}

### 🧪 Test Coverage Added
${suggestions.map(s => {
  const testCount = s.generatedTests ? s.generatedTests.length : 0;
  return `- **${s.file}**: ${testCount} test files generated`;
}).join('\n')}

### ✅ Ready to Review
This PR contains **production-ready test code** that:
- ✅ Follows existing test patterns and conventions
- ✅ Includes proper assertions and error handling
- ✅ Tests both success and failure scenarios
- ✅ Uses the same testing framework as existing tests
- ✅ Includes descriptive test names and comments

### 🚀 Next Steps
1. **Review** the generated test code for accuracy
2. **Run** the test suite to ensure all tests pass
3. **Approve and merge** if the tests look good
4. **Modify** any tests that need project-specific adjustments

### 🔧 What Was Generated
The AI analyzed your existing test patterns and API changes to create:
- New test cases for added API endpoints
- Updated assertions for modified endpoints  
- Error handling tests for edge cases
- Proper setup/teardown where needed

### ⚠️ Review Notes
- Tests were generated based on existing patterns in your test suite
- AI used ${suggestions.map(s => s.testFilesAnalyzed).reduce((a, b) => a + b, 0)} existing test files for context
- Please verify tests match your specific testing requirements
- Consider running tests in CI before merging

### 🔗 Automation Details
This PR was automatically created by the [AI-Assisted Test Updater](https://github.com/your-username/ai-assisted-test-updater) GitHub Action running in the source repository.

---
*Generated automatically on ${new Date().toISOString()}*`;

    // Extract owner and repo from URL
    const urlMatch = config.test_repo.url.match(/\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (!urlMatch) {
      throw new Error(`Cannot parse owner/repo from URL: ${config.test_repo.url}`);
    }
    const [, owner, repo] = urlMatch;

    // Create a more descriptive PR title
    const apiFiles = suggestions.map(s => path.basename(s.file)).join(', ');
    const changedEndpoints = suggestions.flatMap(s => 
      s.changes.map(c => c.path)
        .filter(Boolean)
        .map(p => p.replace(/^\/paths/, '').replace(/\/(get|post|put|delete|patch)$/, ''))
        .filter(p => p.length > 1)
    );
    
    const uniqueEndpoints = [...new Set(changedEndpoints)].slice(0, 3); // Max 3 endpoints
    const endpointsPart = uniqueEndpoints.length > 0 ? ` (${uniqueEndpoints.join(', ')})` : '';
    
    const title = `🤖 Update tests for ${apiFiles}${endpointsPart}`;

    const result = await octokit.pulls.create({
      owner: owner,
      repo: repo,
      title: title,
      head: branchName,
      base: config.test_repo.branch,
      draft: false,  // Not a draft since it contains actual code
      body: prBody
    });

    console.log(`✅ PR created in test repository: ${result.data.html_url}`);
    
    // Add helpful labels
    try {
      await octokit.issues.addLabels({
        owner: owner,
        repo: repo,
        issue_number: result.data.number,
        labels: ['ai-generated', 'tests', 'automated', 'ready-for-review']
      });
    } catch (labelError) {
      console.log('Note: Could not add labels to PR (labels may not exist in target repo)');
    }
    
  } catch (error) {
    console.error('Error creating GitHub PR:', error.message);
    throw error;
  }
}

module.exports = createDraftPR;
