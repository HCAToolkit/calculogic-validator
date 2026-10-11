// Effective Tree repo-shape policy for one run (Refs #14).
// Contract: doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md, "Runtime boundary".
//
// The repo-shape policy registry of the run's resolved set (Builtin or Custom, #41) lists generic
// structural peers. Facts about this repository are added through context rather than by being
// blessed in the generic list: a validator development root that is an explicit embedded folder
// (for example `calculogic-validator`), and every top-level folder with local-package evidence
// (#37, `tree-repo-shape-evidence.logic.mjs`). The result is a new prepared value: the registry
// policy object, which the Builtin loader caches, is never modified, so context cannot leak
// between runs.

import { toValidatorDevelopmentRootTopLevelFolder } from './tree-validator-development-root.logic.mjs';

export const prepareContextualTreeRepoShapePolicy = ({
  registryPolicy,
  validatorDevelopmentRoot,
  repoShapeEvidence,
} = {}) => {
  if (!registryPolicy || !Array.isArray(registryPolicy.allowedTopLevelDirectories)) {
    throw new Error('Contextual Tree repo-shape policy requires a registry policy with allowedTopLevelDirectories[].');
  }

  const embeddedRootFolder = toValidatorDevelopmentRootTopLevelFolder(validatorDevelopmentRoot);
  const evidenceFolders = (repoShapeEvidence?.evidenceRecords ?? []).map((record) => record.folder);
  const allowedTopLevelDirectories = [
    ...registryPolicy.allowedTopLevelDirectories,
    ...(embeddedRootFolder ? [embeddedRootFolder] : []),
    ...evidenceFolders,
  ];

  return {
    version: registryPolicy.version,
    allowedTopLevelDirectories: [...new Set(allowedTopLevelDirectories)].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
};
