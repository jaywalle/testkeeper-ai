# 🪄 Setup Wizard

## 5-Minute Quick Start

### Step 1: Get Your Keys
```bash
# 1. OpenAI API Key
# Go to: https://platform.openai.com/api-keys
# Click "Create new secret key"
# Copy: sk-...

# 2. GitHub PAT
# Go to: GitHub Settings > Developer Settings > Personal Access Tokens
# Create token with "repo" scope
# Copy: ghp_...
```

### Step 2: Add Secrets (1 minute)
```bash
# In your SOURCE repository:
# Settings > Secrets and variables > Actions > New repository secret

OPENAI_API_KEY = your-key-here
TEST_REPO_PAT = your-token-here
```

### Step 3: Create Workflow File (1 minute)
Copy this file to `.github/workflows/ai-test-updater.yml`:

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
          test_repo_url: 'YOUR-TEST_REPO_URL' # ← Change this
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          TEST_REPO_PAT: ${{ secrets.TEST_REPO_PAT }}
          GITHUB_HOST: 'YOUR GITHUB HOST' # ← Change this
```

### Step 4: Test It (1 minute)
```bash
# Make a small change to any API spec file
# Push to main branch
# Check Actions tab for results
```

## ✅ That's it! No configuration file needed for basic usage.

## Troubleshooting
- ❌ "No changes detected" → Check your API spec file paths
- ❌ "Bad credentials" → Verify your PAT has repo access
- ❌ "OpenAI error" → Check API key and billing

## Advanced Configuration (Optional)
Only needed if you have custom file paths or specific requirements.