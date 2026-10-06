// Effective Tree repo-shape policy for one run (Refs #14).
// Contract: doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md, "Runtime boundary".
//
// The builtin repo-shape policy lists generic structural peers. A validator development root that
// is an explicit embedded folder (for example `calculogic-validator`) is allowed through context
// rather than by being blessed in the generic list. The result is a new prepared value: the builtin
// policy object, cached by its registry loader, is never modified, so context cannot leak between
// runs.

const resolveEmbeddedRootTopLevelFolder = (validatorDevelopmentRoot) => {
  if (
    typeof validatorDevelopmentRoot !== 'string' ||
    validatorDevelopmentRoot.length === 0 ||
    validatorDevelopmentRoot === '.'
  ) {
    return null;
  }

  const [topLevelFolder] = validatorDevelopmentRoot.split('/');
  return topLevelFolder && topLevelFolder !== '..' ? topLevelFolder : null;
};

export const prepareContextualTreeRepoShapePolicy = ({ builtinPolicy, validatorDevelopmentRoot } = {}) => {
  if (!builtinPolicy || !Array.isArray(builtinPolicy.allowedTopLevelDirectories)) {
    throw new Error('Contextual Tree repo-shape policy requires a builtin policy with allowedTopLevelDirectories[].');
  }

  const embeddedRootFolder = resolveEmbeddedRootTopLevelFolder(validatorDevelopmentRoot);
  const allowedTopLevelDirectories = embeddedRootFolder
    ? [...builtinPolicy.allowedTopLevelDirectories, embeddedRootFolder]
    : [...builtinPolicy.allowedTopLevelDirectories];

  return {
    version: builtinPolicy.version,
    allowedTopLevelDirectories: [...new Set(allowedTopLevelDirectories)].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
};
