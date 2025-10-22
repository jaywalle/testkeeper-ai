const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { getTestFilesFromRepo } = require("../utils/git");

async function suggestUpdates(apiDiffs, config, testRepoPath) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = config.model || "gpt-4o-mini";
  const suggestions = [];

  // Get test files from the test repository
  const testCodePaths = config.test_code_paths;
  
  console.log(`🔍 Looking for test files in patterns: ${testCodePaths.join(', ')}`);
  const testFiles = getTestFilesFromRepo(testRepoPath, testCodePaths);
  console.log(`📂 Found ${testFiles.length} test files in test repository`);
  
  // Early warning for large test suites
  if (testFiles.length > 50) {
    console.log(`⚠️ Large test suite detected (${testFiles.length} files). Will prioritize most relevant files.`);
  }

  for (const diff of apiDiffs) {
    console.log(`📝 Generating test code for ${diff.file}...`);
    
    // Read content from relevant test files
    const relevantTestFiles = await findRelevantTestFiles(testFiles, diff);
    console.log(`🎯 Selected ${relevantTestFiles.length} relevant test files for analysis`);
    
    const testFilesContent = await readTestFiles(relevantTestFiles, testRepoPath);

    const prompt = `
You are an expert software tester. Your task is to generate actual, executable test code based on API changes.

## API Changes Detected in ${diff.file}:

${JSON.stringify(diff.changes, null, 2)}

## Existing Test Files Structure:

${testFilesContent}

## Task:

Generate complete, executable test code that:

1. **Tests new functionality** added by the API changes
2. **Updates existing tests** that are affected by changes
3. **Follows existing patterns** from the current test suite
4. **Includes proper assertions** for success and error cases
5. **Uses the same testing framework** as existing tests
6. **Includes descriptive test names** and comments

For each change, provide:
- **Complete test functions** (not just snippets)
- **Proper setup/teardown** if needed
- **Mock data** and fixtures where appropriate
- **Error case testing** for new endpoints
- **Updated assertions** for modified endpoints

Output format should be:
\`\`\`javascript
// File: path/to/test/file.js
// Action: create|update|modify
// Description: What this change does

[Complete test code here]
\`\`\`

Focus on generating production-ready test code that can be directly committed.
`;

    try {
      const resp = await client.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        temperature: 0.2  // Lower temperature for more consistent code generation
      });

      const testCode = await parseAIResponse(resp.choices[0].message.content, testRepoPath);
      
      suggestions.push({ 
        file: diff.file, 
        changes: diff.changes,
        aiOutput: resp.choices[0].message.content,
        testFilesAnalyzed: testFiles.length,
        generatedTests: testCode
      });
    } catch (error) {
      console.error(`Error generating test code for ${diff.file}:`, error.message);
      suggestions.push({
        file: diff.file,
        changes: diff.changes,
        aiOutput: `Error generating test code: ${error.message}`,
        testFilesAnalyzed: 0,
        generatedTests: []
      });
    }
  }

  return suggestions;
}

async function findRelevantTestFiles(allTestFiles, diff) {
  // Extract actual API endpoints from the changes - this is what a human would look for
  const changedEndpoints = extractApiEndpoints(diff);
  console.log(`🎯 Looking for tests that reference these API endpoints: ${changedEndpoints.join(', ')}`);
  
  if (changedEndpoints.length === 0) {
    console.log(`⚠️ No specific API endpoints found in changes, using fallback selection`);
    return allTestFiles.slice(0, Math.min(3, allTestFiles.length));
  }
  
  // Search through test files for references to these endpoints
  const relevantFiles = [];
  const endpointMatches = new Map(); // Track which endpoints each file tests
  
  for (const testFile of allTestFiles) {
    try {
      const content = fs.readFileSync(testFile, 'utf8').toLowerCase();
      const matches = [];
      
      changedEndpoints.forEach(endpoint => {
        // Look for various ways the endpoint might be referenced in tests
        const patterns = [
          endpoint, // exact match
          endpoint.replace(/^\//, ''), // without leading slash
          endpoint.replace(/\{[^}]+\}/g, ''), // without path parameters
          endpoint.split('/').filter(Boolean).join('/'), // normalized
          ...endpoint.split('/').filter(part => part && !part.startsWith('{') && part.length > 2) // individual segments
        ];
        
        patterns.forEach(pattern => {
          if (pattern && content.includes(pattern.toLowerCase())) {
            matches.push(endpoint);
          }
        });
      });
      
      if (matches.length > 0) {
        relevantFiles.push(testFile);
        endpointMatches.set(testFile, [...new Set(matches)]); // Remove duplicates
      }
    } catch (error) {
      console.warn(`Could not read test file ${testFile}:`, error.message);
    }
  }
  
  // Sort by number of endpoint matches (most relevant first)
  const sortedFiles = relevantFiles.sort((a, b) => {
    const aMatches = endpointMatches.get(a)?.length || 0;
    const bMatches = endpointMatches.get(b)?.length || 0;
    return bMatches - aMatches;
  });
  
  // Log what we found
  sortedFiles.slice(0, 5).forEach(file => {
    const matches = endpointMatches.get(file) || [];
    console.log(`📝 ${path.basename(file)} tests endpoints: ${matches.join(', ')}`);
  });
  
  // Return top matches, but ensure we have at least some files for context
  const maxFiles = Math.min(5, Math.max(2, Math.floor(15000 / Math.max(allTestFiles.length, 1))));
  
  if (sortedFiles.length === 0) {
    console.log(`⚠️ No test files reference the changed endpoints, selecting files for general context`);
    // Fallback: look for files that might be API tests based on common patterns
    const apiTestFiles = allTestFiles.filter(file => {
      const fileName = path.basename(file).toLowerCase();
      return fileName.includes('api') || 
             fileName.includes('endpoint') || 
             fileName.includes('integration') ||
             fileName.includes('service');
    });
    return apiTestFiles.slice(0, Math.min(2, apiTestFiles.length)) || allTestFiles.slice(0, 2);
  }
  
  return sortedFiles.slice(0, maxFiles);
}

function extractApiEndpoints(diff) {
  const endpoints = new Set();
  
  diff.changes.forEach(change => {
    if (change.path) {
      // Extract the actual API endpoint from the OpenAPI path
      // change.path might be something like "/paths//api/v1/users/{userId}/get"
      let cleanPath = change.path;
      
      // Remove OpenAPI structure prefixes
      cleanPath = cleanPath.replace(/^\/paths/, ''); // Remove /paths prefix
      cleanPath = cleanPath.replace(/\/(get|post|put|delete|patch|head|options)$/, ''); // Remove HTTP method suffix
      
      // Clean up the path
      if (cleanPath.startsWith('/') && cleanPath.length > 1) {
        endpoints.add(cleanPath);
        
        // Also add variations that might appear in tests
        // Without trailing parameters for broader matching
        const withoutParams = cleanPath.replace(/\/\{[^}]+\}(\/.*)?$/, '');
        if (withoutParams !== cleanPath && withoutParams.length > 1) {
          endpoints.add(withoutParams);
        }
        
        // Add base path segments for partial matches
        const segments = cleanPath.split('/').filter(Boolean);
        if (segments.length > 1) {
          // Add progressively shorter paths
          for (let i = segments.length; i >= 2; i--) {
            const partialPath = '/' + segments.slice(0, i).join('/');
            if (!partialPath.includes('{')) { // Skip paths with parameters
              endpoints.add(partialPath);
            }
          }
        }
      }
    }
    
    // Also look in the change details for endpoint references
    if (change.details && typeof change.details === 'object') {
      const detailsStr = JSON.stringify(change.details);
      
      // Look for path-like strings in the details
      const pathMatches = detailsStr.match(/["']([\/][a-zA-Z0-9\/_\-{}]+)["']/g) || [];
      pathMatches.forEach(match => {
        const path = match.replace(/["']/g, '');
        if (path.length > 3 && path.includes('/')) {
          endpoints.add(path);
        }
      });
      
      // Look for operationId which often contains endpoint info
      const operationIdMatch = detailsStr.match(/"operationId":\s*"([^"]+)"/);
      if (operationIdMatch && operationIdMatch[1]) {
        // Convert camelCase operationId to potential endpoint segments
        const operationId = operationIdMatch[1];
        const segments = operationId
          .replace(/([A-Z])/g, '-$1')
          .toLowerCase()
          .split(/[-_]/)
          .filter(s => s.length > 2);
        
        if (segments.length > 0) {
          endpoints.add('/' + segments.join('/'));
        }
      }
    }
  });
  
  // Filter out very generic or short endpoints that might cause false positives
  return Array.from(endpoints).filter(endpoint => 
    endpoint.length > 3 && 
    !endpoint.match(/^\/[a-z]$/) && // Skip single letter paths
    endpoint !== '/api' && 
    endpoint !== '/v1' &&
    endpoint !== '/v2'
  );
}



async function parseAIResponse(aiResponse, testRepoPath) {
  const testCodeBlocks = [];
  const codeBlockRegex = /```(?:javascript|typescript|js|ts)?\s*\n\/\/ File: (.+?)\s*\n\/\/ Action: (create|update|modify)\s*\n\/\/ Description: (.+?)\s*\n([\s\S]*?)```/g;
  
  let match;
  while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
    const [, filePath, action, description, code] = match;
    
    const cleanFilePath = filePath.trim();
    // Ensure the file path is relative to the test repo root
    const normalizedPath = cleanFilePath.startsWith('/') ? cleanFilePath.substring(1) : cleanFilePath;
    
    testCodeBlocks.push({
      filePath: normalizedPath,
      action: action.trim(),
      description: description.trim(),
      code: code.trim(),
      absolutePath: path.join(testRepoPath, normalizedPath)
    });
  }
  
  return testCodeBlocks;
}

async function readTestFiles(testFiles, testRepoPath) {
  const fileContents = [];
  let totalTokens = 0;
  const maxTokensPerFile = 1000; // Rough estimate: ~750 chars = 1000 tokens
  const maxTotalTokens = 8000; // Leave room for the rest of the prompt
  
  // Sort files by relevance (smaller files and more relevant names first)
  const sortedFiles = testFiles.sort((a, b) => {
    try {
      const aSize = fs.statSync(a).size;
      const bSize = fs.statSync(b).size;
      return aSize - bSize; // Smaller files first
    } catch (error) {
      return 0;
    }
  });
  
  for (const filePath of sortedFiles) {
    if (totalTokens >= maxTotalTokens) {
      console.log(`⚠️ Token limit reached, skipping remaining ${sortedFiles.length - fileContents.length} test files`);
      break;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // Use path relative to the test repository root, not the current working directory
      const relativePath = path.relative(testRepoPath, filePath);
      
      // Smart truncation: keep important parts
      let truncatedContent;
      if (content.length > maxTokensPerFile) {
        // Keep imports, main describe blocks, and first few tests
        const lines = content.split('\n');
        const importLines = lines.filter(line => 
          line.trim().startsWith('import ') || 
          line.trim().startsWith('const ') || 
          line.trim().startsWith('require(')
        ).slice(0, 10);
        
        const codeLines = lines.filter(line => 
          !line.trim().startsWith('import ') && 
          !line.trim().startsWith('const ') && 
          !line.trim().startsWith('require(')
        );
        
        // Take first portion of actual test code
        const maxCodeLines = Math.floor((maxTokensPerFile - importLines.join('\n').length) / 50);
        const selectedCode = codeLines.slice(0, maxCodeLines).join('\n');
        
        truncatedContent = importLines.join('\n') + '\n\n' + selectedCode + '\n\n// ...(truncated)';
      } else {
        truncatedContent = content;
      }
      
      const estimatedTokens = Math.ceil(truncatedContent.length / 3.5); // Rough token estimate
      totalTokens += estimatedTokens;
      
      fileContents.push(`
=== ${path.basename(filePath)} ===
Path: ${relativePath}
Framework: ${detectTestFramework(content)}
${truncatedContent}
`);
    } catch (error) {
      console.warn(`Could not read test file ${filePath}:`, error.message);
    }
  }
  
  if (fileContents.length === 0) {
    return "No test files found in the test repository. Please create new test files following standard testing patterns.";
  }
  
  console.log(`📊 Analyzed ${fileContents.length} test files (~${totalTokens} tokens)`);
  return fileContents.join('\n');
}

function detectTestFramework(content) {
  // Quick detection of testing framework to help AI understand patterns
  if (content.includes('describe(') && content.includes('it(')) return 'Jest/Mocha';
  if (content.includes('test(')) return 'Jest';
  if (content.includes('@Test')) return 'JUnit';
  if (content.includes('def test_')) return 'pytest';
  return 'Unknown';
}

module.exports = suggestUpdates;
