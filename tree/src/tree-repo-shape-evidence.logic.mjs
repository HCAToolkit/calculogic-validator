// Tree repo-shape evidence for one run (#37).
// Contract: doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md, "Runtime boundary".
//
// Tree's interpretation of the suite-owned local-package evidence (capability inventory §3.10): a
// top-level folder that the repository's root manifest declares as a local package, and that has
// its own manifest, is part of this repository's shape. The records keep the declarations that
// justified each folder, so an allowance in the effective repo-shape policy is traceable.

const SOURCE_ID = 'tree-repo-shape-evidence';
const DECLARED_LOCAL_PACKAGE = 'declared-local-package';

export const prepareTreeRepoShapeEvidence = ({ localPackageEvidence = [] } = {}) => {
  if (!Array.isArray(localPackageEvidence)) {
    throw new Error('Tree repo-shape evidence requires localPackageEvidence[].');
  }

  return Object.freeze({
    source: SOURCE_ID,
    evidenceRecords: Object.freeze(
      localPackageEvidence.map(({ folder, manifestPath, declarations }) =>
        Object.freeze({
          folder,
          evidenceKind: DECLARED_LOCAL_PACKAGE,
          manifestPath,
          declarations: Object.freeze(declarations.map((declaration) => Object.freeze({ ...declaration }))),
        }),
      ),
    ),
  });
};
