// Repository-relative paths derived from the prepared validator development root (Refs #14, #34).
// Contract: doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md, "Runtime boundary".
//
// The root is `.` in standalone development, an explicit folder such as `calculogic-validator` in
// embedded development, and absent (`null`) for installed consumers. Tree modules that need a
// Validator-development path derive it here instead of hard-coding an embedded layout.

const isUsableValidatorDevelopmentRoot = (validatorDevelopmentRoot) =>
  typeof validatorDevelopmentRoot === 'string' && validatorDevelopmentRoot.length > 0;

// '' for standalone, '<root>/' for embedded, null without a validator development root.
export const toValidatorDevelopmentPathPrefix = (validatorDevelopmentRoot) => {
  if (!isUsableValidatorDevelopmentRoot(validatorDevelopmentRoot)) {
    return null;
  }

  return validatorDevelopmentRoot === '.' ? '' : `${validatorDevelopmentRoot}/`;
};

// The repository top-level folder an embedded root lives in; null for standalone, installed
// consumers, and roots that do not name a folder inside the repository.
export const toValidatorDevelopmentRootTopLevelFolder = (validatorDevelopmentRoot) => {
  if (!isUsableValidatorDevelopmentRoot(validatorDevelopmentRoot) || validatorDevelopmentRoot === '.') {
    return null;
  }

  const [topLevelFolder] = validatorDevelopmentRoot.split('/');
  return topLevelFolder && topLevelFolder !== '..' ? topLevelFolder : null;
};
