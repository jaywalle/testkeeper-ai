const SwaggerParser = require("@apidevtools/swagger-parser");
const yaml = require('js-yaml');

function diffOpenAPISpecs(oldSpecStr, newSpecStr) {
  try {
    const oldSpec = parseSpec(oldSpecStr);
    const newSpec = parseSpec(newSpecStr);

    const changes = [];

    // Check for new endpoints
    for (const path in newSpec.paths || {}) {
      if (!oldSpec.paths || !oldSpec.paths[path]) {
        changes.push({ type: "new_endpoint", path });
      } else {
        // Compare methods within existing paths
        for (const method in newSpec.paths[path]) {
          if (!oldSpec.paths[path][method]) {
            changes.push({ type: "new_method", path, method });
          } else {
            // Check for parameter changes
            const oldParams = oldSpec.paths[path][method].parameters || [];
            const newParams = newSpec.paths[path][method].parameters || [];
            
            const paramChanges = compareParameters(oldParams, newParams);
            if (paramChanges.length > 0) {
              changes.push({ type: "parameter_changes", path, method, details: paramChanges });
            }

            // Check for response changes
            const oldResponses = oldSpec.paths[path][method].responses || {};
            const newResponses = newSpec.paths[path][method].responses || {};
            
            const responseChanges = compareResponses(oldResponses, newResponses);
            if (responseChanges.length > 0) {
              changes.push({ type: "response_changes", path, method, details: responseChanges });
            }
          }
        }
      }
    }

    // Check for removed endpoints
    for (const path in oldSpec.paths || {}) {
      if (!newSpec.paths || !newSpec.paths[path]) {
        changes.push({ type: "removed_endpoint", path });
      } else {
        // Check for removed methods
        for (const method in oldSpec.paths[path]) {
          if (!newSpec.paths[path][method]) {
            changes.push({ type: "removed_method", path, method });
          }
        }
      }
    }

    return changes;
  } catch (error) {
    console.error('Error comparing OpenAPI specs:', error.message);
    return [];
  }
}

function parseSpec(specStr) {
  try {
    // Try JSON first
    return JSON.parse(specStr);
  } catch (jsonError) {
    try {
      // Try YAML using js-yaml
      return yaml.load(specStr);
    } catch (yamlError) {
      throw new Error(`Could not parse spec as JSON or YAML: ${jsonError.message}, ${yamlError.message}`);
    }
  }
}

function compareParameters(oldParams, newParams) {
  const changes = [];
  
  // Check for new parameters
  newParams.forEach(newParam => {
    const oldParam = oldParams.find(p => p.name === newParam.name && p.in === newParam.in);
    if (!oldParam) {
      changes.push({ type: "new_parameter", parameter: newParam.name, location: newParam.in });
    } else {
      // Check for requirement changes
      if (oldParam.required !== newParam.required) {
        changes.push({ 
          type: "parameter_requirement_changed", 
          parameter: newParam.name, 
          location: newParam.in,
          from: oldParam.required || false,
          to: newParam.required || false
        });
      }
    }
  });

  // Check for removed parameters
  oldParams.forEach(oldParam => {
    const newParam = newParams.find(p => p.name === oldParam.name && p.in === oldParam.in);
    if (!newParam) {
      changes.push({ type: "removed_parameter", parameter: oldParam.name, location: oldParam.in });
    }
  });

  return changes;
}

function compareResponses(oldResponses, newResponses) {
  const changes = [];
  
  // Check for new response codes
  for (const code in newResponses) {
    if (!oldResponses[code]) {
      changes.push({ type: "new_response_code", code });
    }
  }

  // Check for removed response codes
  for (const code in oldResponses) {
    if (!newResponses[code]) {
      changes.push({ type: "removed_response_code", code });
    }
  }

  return changes;
}

module.exports = { diffOpenAPISpecs };
