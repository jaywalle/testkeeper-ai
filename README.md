# AI-Assisted Test Updater | Automated API Testing with OpenAI & GitHub Actions

> **🤖 Intelligent API Test Automation** | Automatically detect OpenAPI changes and generate test updates using AI across repositories | Enterprise GitHub Support | Cross-Repository Automation

A powerful GitHub Action that combines **AI-powered analysis** with **cross-repository automation** to keep your API tests synchronized with OpenAPI specification changes. Perfect for **enterprise teams**, **microservices architectures**, and **large-scale API testing**.

[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-Automation-blue?logo=github-actions)](https://github.com/features/actions)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-green?logo=openai)](https://openai.com)
[![API Testing](https://img.shields.io/badge/API-Testing-orange)](https://github.com/topics/api-testing)
[![Enterprise](https://img.shields.io/badge/Enterprise-Ready-purple)](https://github.com/topics/enterprise)
[![Cross Repository](https://img.shields.io/badge/Cross--Repository-Automation-red)](https://github.com/topics/automation)

**Keywords**: `github-actions` `api-testing` `openai` `automation` `cross-repository` `openapi` `swagger` `test-automation` `ci-cd` `microservices` `intelligent-testing`

## 🚀 Features

- **Cross-Repository Operation**: Runs in your source repo, analyzes test repo
- **Enterprise GitHub Support**: Works with GitHub Enterprise instances (e.g., git.company.com)
- **Automatic API Change Detection**: Monitors OpenAPI specification files for changes between commits
- **AI-Powered Test Suggestions**: Uses OpenAI GPT models to analyze API changes and suggest relevant test updates
- **Intelligent Test Discovery**: Searches test files for actual API endpoint references (not just filename patterns)
- **Smart Test Analysis**: Reads existing test files to provide contextual suggestions
- **GitHub Integration**: Creates draft pull requests with AI-generated test update suggestions in your test repository
- **Configurable**: Supports custom configuration for different project setups

## 🏗️ Architecture

This action operates across two repositories:

1. **Source Repository** (where your API specifications live) - Runs the action
2. **Test Repository** (where your tests live) - Receives PR with suggestions

### Workflow:
1. Developer pushes API changes to **Source Repo**
2. GitHub Action triggers in **Source Repo** 
3. Action detects API changes in **Source Repo**
4. Action clones and analyzes existing tests in **Test Repo**
5. Action creates PR with AI suggestions in **Test Repo**

## 📋 Prerequisites

- Node.js 20+ (automatically provided in GitHub Actions)
- Source repository with OpenAPI specifications
- Separate test repository (can be the same organization or different)
- OpenAI API key
- GitHub Personal Access Token with access to both repositories
- For Enterprise GitHub: Access to your organization's GitHub Enterprise instance

## ⚙️ Quick Setup (5 minutes)

> 💡 **TL;DR**: Add 2 secrets, create 1 workflow file, push a change. [See Setup Wizard →](setup-wizard.md)

### 1. Add Secrets to Your Source Repository

| Secret | Description | Example |
|--------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key | `sk-proj-...` |
| `TEST_REPO_PAT` | GitHub token with repo access | `ghp_...` |
| `GITHUB_HOST` | *(Enterprise only)* Your GitHub host | `git.company.com` |

### 2. Create Workflow File

Create `.github/workflows/ai-test-updater.yml` in your **source repository**:

```yaml
name: AI Test Updater
on:
  push:
    branches: [main]
jobs:
  update-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: AI Test Updater
        uses: jaywalle/ai-assisted-test-updater@v1
        with:
          test_repo_url: 'https://github.com/your-org/your-test-repo' # ← Change this
          test_repo_branch: 'main'  # Optional, defaults to 'main'
          config_file_path: '.test-updater-config.json'  # Optional
          openai_model: 'gpt-4o-mini'  # Optional
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          TEST_REPO_PAT: ${{ secrets.TEST_REPO_PAT }}
          GITHUB_HOST: ${{ secrets.GITHUB_HOST }}  # Enterprise only
```

### 3. Test It! 

Push a change to any OpenAPI file in your source repo and check the Actions tab. That's it! 

### 4. Configuration File (Optional)

**The action works out of the box** with sensible defaults. Only create a config file if you need custom paths:

```bash
cp .test-updater-config.json.example .test-updater-config.json
```

Example configuration:

```json
{
  "api_spec_paths": [
    "**/openapi.yaml",
    "**/openapi.yml",
    "**/swagger.json",
    "docs/**/*.yaml",
    "docs/gss-api.yaml"
  ],
  "test_code_paths": [
    "test/**/*.feature"
  ],
  "detector": "api",
  "model": "gpt-4o-mini"
}
```

### Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `test_repo_url` | URL of the test repository | ✅ Yes | - |
| `test_repo_branch` | Base branch of the test repository | ❌ No | `main` |
| `config_file_path` | Path to configuration file | ❌ No | `.test-updater-config.json` |
| `openai_model` | OpenAI model to use | ❌ No | `gpt-4o-mini` |

### Configuration Options

- `api_spec_paths`: Glob patterns for OpenAPI/Swagger specification files in source repo
- `test_code_paths`: Glob patterns for test files in the test repository
- `test_repo_url`: URL of the test repository
- `detector`: Type of detector to use (`api` for OpenAPI specs)
- `model`: OpenAI model to use for suggestions

## 🔧 How It Works

1. **Trigger**: Action runs when code is pushed to main branch or PR is merged in source repository
2. **Change Detection**: Compares current OpenAPI specifications with the previous commit in source repo
3. **Test Repository Access**: Clones the test repository to analyze existing test files
4. **Diff Analysis**: Uses the `openapi-diff` utility to identify specific changes (new endpoints, modified methods, removed endpoints, etc.)
5. **Smart Test Discovery**: Searches test files for actual API endpoint references (not just filename patterns)
6. **AI Analysis**: Sends detected changes + relevant test file context to OpenAI (analyzes ~5 most relevant files from potentially 1000+ test files)
7. **Suggestion Generation**: AI generates specific recommendations for updating tests based on the changes and existing patterns
8. **PR Creation**: Creates a draft pull request in the **test repository** with AI-generated suggestions

## 📁 Project Structure

```
├── action.yaml              # GitHub Action definition
├── index.js                 # Main entry point
├── package.json             # Node.js dependencies
├── detectors/
│   └── api-detector.js      # OpenAPI change detection logic
├── scripts/
│   ├── create-draft-pr.js   # GitHub PR creation
│   ├── detect-changes.js    # Change detection orchestration
│   └── suggest-updates.js   # AI suggestion generation
└── utils/
    ├── git.js              # Git utilities
    └── openapi-diff.js     # OpenAPI specification comparison
```

## 🎯 Intelligent Test Discovery

Unlike simple filename-based matching, this tool uses **human-like intelligence** to find relevant tests:

### How It Works
1. **Extracts API Endpoints**: Identifies actual endpoints from OpenAPI changes (e.g., `/v1/users/{id}`, `/api/orders`)
2. **Searches Test Content**: Scans test files for references to these endpoints
3. **Pattern Matching**: Looks for endpoints in various formats:
   - Exact matches: `/v1/users/{id}`
   - Without parameters: `/v1/users`
   - Path segments: `users`, `orders`
4. **Relevance Ranking**: Prioritizes test files with the most endpoint matches
5. **Smart Selection**: Chooses top 5 most relevant files from potentially 1000+ test files

### Example
```yaml
API Change: /v1/user/user/{userId}:create
Found in tests:
- ✅ ui_user_creation.feature (3 endpoint matches)
- ✅ happy_path_user_creation.feature (3 endpoint matches)  
- ❌ unrelated_user_tests.feature (0 matches - ignored)
```

This ensures the AI gets context from tests that actually exercise the changed APIs, leading to more accurate suggestions.

## 🆚 Why Choose AI-Assisted Test Updater?

| Feature | Manual Testing | Basic Automation | **AI-Assisted Test Updater** |
|---------|---------------|-----------------|------------------------------|
| **API Change Detection** | ❌ Manual review | ✅ File watching | ✅ **Intelligent OpenAPI diff** |
| **Test Discovery** | ❌ Developer knowledge | ⚠️ Filename patterns | ✅ **Content-aware search** |
| **Cross-Repository** | ❌ Manual coordination | ❌ Not supported | ✅ **Automated cross-repo PRs** |
| **Context Awareness** | ✅ Human intelligence | ❌ Rule-based only | ✅ **AI-powered analysis** |


## 🤖 AI Model Configuration

The tool supports various OpenAI models. Configure the model in your `.test-updater-config.json` file.

## 🔧 Development & Local Testing

### Local Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set environment variables:
   ```bash
   export OPENAI_API_KEY=your_openai_key
   export TEST_REPO_PAT=your_github_token
   export INPUT_TEST_REPO_URL=your-test-repo-url
   
   # For Enterprise GitHub
   export GITHUB_HOST=git.company.com
   ```
4. Run locally:
   ```bash
   npm run dev
   ```

### Testing with Real Repositories

To test the cross-repo functionality:

1. **Setup test repositories:**
   - Source repo with API specs
   - Test repo with existing tests
   
2. **Create test API changes:**
   ```bash
   # In source repo
   # Modify your OpenAPI spec
   git add api/openapi.yaml
   git commit -m "Add new endpoint"
   ```
   
3. **Run the action locally:**
   ```bash
   # Set required environment variables
   export INPUT_TEST_REPO_OWNER=your-org
   export INPUT_TEST_REPO_NAME=test-repo
   npm run dev
   ```

4. **Verify results:**
   - Check console output for detected changes
   - Verify PR created in test repository
   - Review AI-generated suggestions

### Dependencies

- `@apidevtools/swagger-parser`: OpenAPI specification parsing
- `@octokit/rest`: GitHub API integration  
- `glob`: File pattern matching for test discovery
- `micromatch`: Advanced glob pattern matching
- `openai`: OpenAI API client

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🐛 Troubleshooting

### Common Issues

1. **"No API changes detected"**: Ensure your OpenAPI files are in the configured paths
2. **"OpenAI API error"**: Check your API key and quota (free tier has strict limits)
3. **"GitHub PR creation failed"**: Verify your PAT has the correct permissions
4. **"Bad credentials"**: For Enterprise GitHub, ensure `GITHUB_HOST` is set correctly
5. **"Repository not found"**: Check that your PAT has access to both source and test repositories

### Debug Mode

Set `DEBUG=true` in your environment to enable verbose logging.

## 🔮 Roadmap

- [ ] Integration with additional AI providers
- [ ] Support for alternative API frameworks
- [ ] Support for UI testing
- [ ] Advanced change detection (schema modifications, response changes)

### 💡 Community Requested
*Want to see a feature? [Open an issue](../../issues) or contribute!*

## 📞 Support

For issues and questions:

1. Check the [Issues](../../issues) page
2. Create a new issue with detailed information
3. Include logs and configuration details

## 📊 Related Tools & Integrations

**Integrates With**: GitHub Enterprise, OpenAI API, Octokit, OpenAPI, Swagger 2.0

**Alternative To**: Manual test maintenance, basic file watching, simple CI/CD scripts

---

*Keep your API tests automatically synchronized with specification changes using AI-powered cross-repository automation. Perfect for enterprise teams, microservices architectures, and large-scale API testing scenarios.*

**⭐ Star this repository** if it helps with your API testing automation!