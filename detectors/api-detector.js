const { getFileAtRevision, getCurrentFileContent } = require("../utils/git");
const { diffOpenAPISpecs } = require("../utils/openapi-diff");

async function run(changedFiles) {
  const diffs = [];

  for (const file of changedFiles) {
    console.log(`🔍 Processing API spec change: ${file}`);

    try {
      // Get old and new versions from git
      const oldSpec = getFileAtRevision(file, 'HEAD~1');
      const newSpec = getCurrentFileContent(file);

      if (!oldSpec || !newSpec) {
        console.warn(`Could not retrieve spec versions for ${file}, skipping...`);
        continue;
      }

      const apiChanges = diffOpenAPISpecs(oldSpec, newSpec);
      if (apiChanges.length > 0) {
        console.log(`📊 Found ${apiChanges.length} changes in ${file}`);
        diffs.push({ file, changes: apiChanges });
      } else {
        console.log(`📝 No significant changes detected in ${file}`);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
      // Continue with other files even if one fails
    }
  }

  return diffs;
}

module.exports = { run };
